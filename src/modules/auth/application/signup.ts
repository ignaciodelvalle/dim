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
//
// Every non-redirecting error branch echoes `email` back in AuthFormState.
// React 19 auto-resets an uncontrolled `<form action={fn}>` once the action
// resolves; a validation error here returns (no redirect), and that reset
// would otherwise wipe the DOM-owned email the user just typed. SignupForm
// seeds the input's `defaultValue` from the echo, mirroring the login fix
// (bug #46). The enumeration-defense success masquerade below intentionally
// does NOT echo email — it must stay byte-identical to a genuine success.

import { headers } from "next/headers";

import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
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
    return { error: "Faltan datos. Completá todos los campos.", email };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres.", email };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden.", email };
  }
  if (!tosAccepted) {
    return { error: "Tenés que aceptar los Términos y la Política de privacidad.", email };
  }

  // Rate limit per trusted edge IP before creating a GoTrue user. Tighter than
  // login: signup is never a high-frequency legitimate action, so a low ceiling
  // caps both account-spam and the enumeration oracle (audit 28-#3) cost.
  // Keyed off callerIp (x-real-ip / last XFF hop, not the spoofable first
  // segment). A non-RateLimitError propagates → fail closed.
  const ip = callerIp(await headers());
  try {
    await enforceRateLimit("auth_signup_ip", ip, { maxPerMinute: 3, maxPerHour: 15 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "Demasiados intentos. Esperá un momento y volvé a probar.", email };
    }
    throw err;
  }

  const supabase = await createClient();
  // POSTURE (PO decision 2026-07-10): email confirmation is intentionally OFF —
  // single-step signup, no verification for now. With confirmations OFF, signUp
  // returns a session immediately, so step 2 (completeIdentityAction) runs with
  // an authenticated user and its getUser() gate passes cleanly.
  //
  // If confirmations are EVER turned ON in the Supabase dashboard, signUp returns
  // NO session; step 2's getUser() gate then finds no user. That branch used to
  // silently redirect back to step 1 → a silent loop that also discarded the
  // name the user typed. Mitigations, in order of preference, before flipping the
  // dashboard switch:
  //   1. Collect the real name in step 1 and pass it here via
  //      `options: { data: { display_name } }` so handle_new_user (db/triggers.sql,
  //      migration 0135) persists it even when no session is returned — the trigger
  //      reads raw_user_meta_data->>'display_name' and only falls back to the email
  //      local-part when it is absent.
  //   2. completeIdentityAction now fails HONESTLY on a missing session (shows a
  //      "confirmá tu correo / volvé a iniciar sesión" message) instead of looping.
  // In the current two-step ordering the name is not known until step 2, so no
  // display_name metadata is supplied here; the trigger derives a provisional
  // display_name from the email local-part and completeIdentityAction overwrites
  // it with the real "First Last" in the happy path.
  const { error } = await supabase.auth.signUp({
    email,
    password,
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
    // Supabase text, which could itself hint at account state. Echo the email
    // so React 19's post-action form reset (bug #46, mirrored from login)
    // doesn't wipe what the user typed.
    return {
      error: "No pudimos completar el registro. Revisá tus datos e intentá de nuevo.",
      email,
    };
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the identity-collection step (step 2).
  return { error: null, ok: true };
}
