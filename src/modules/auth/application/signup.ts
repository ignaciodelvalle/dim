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
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { error: "Ya existe una cuenta con ese correo." };
    }
    return { error: `No se pudo crear la cuenta: ${error.message}` };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the identity-collection step (step 2).
  return { error: null, ok: true };
}
