// Use-case: signupAction — step 1 of the two-step signup flow (strangler migration 26/61).
//
// @no-auth-required: signup is by definition pre-authentication.
//
// Step 1 of the two-step signup flow. Collects email + password + TOS only.
// display_name is intentionally omitted here — the handle_new_user trigger
// (db/triggers.sql) falls back to split_part(email, '@', 1) when no
// display_name metadata is supplied, so profiles.display_name is never NULL.
// The real first+last name is collected in step 2 (completeIdentityAction),
// which overwrites the provisional value.

import { createClient } from "@/lib/supabase/server";

import type { AuthFormState } from "./types";

export async function signupAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const tosAccepted = formData.get("tosAccepted") === "on";

  if (!email || !password) {
    return { error: "Faltan datos. Completá todos los campos." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }
  if (!tosAccepted) {
    return { error: "Tenés que aceptar los Términos y la Política de privacidad." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // No display_name metadata — the handle_new_user trigger will derive it
    // from the email local-part. completeIdentityAction overwrites it in step 2.
  });

  if (error) {
    // Account enumeration defense (audit 28-#3, pilot MED).
    // Supabase returns a distinct "User already registered" error when the email
    // exists. Surfacing that (or any "ya existe" copy) lets an attacker probe
    // which emails have accounts. Return the SAME success shape as a genuine new
    // signup so the two are indistinguishable to the client. The duplicate is
    // still prevented server-side — Supabase created no new user, so a duplicate
    // account cannot be minted; a duplicate simply lands with no session and is
    // bounced back to /signup at step 2 (completeIdentityAction's getUser check).
    // Residual: with email confirmations OFF a genuine signup receives a session
    // cookie while a duplicate does not, a subtler oracle closed by enabling
    // confirmations in the Supabase dashboard (PO-gated, tracked separately).
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { error: null, ok: true };
    }
    // Every other failure returns a single generic message — never the raw
    // Supabase text, which could itself hint at account state.
    return { error: "No pudimos completar el registro. Revisá tus datos e intentá de nuevo." };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the identity-collection step (step 2).
  return { error: null, ok: true };
}
