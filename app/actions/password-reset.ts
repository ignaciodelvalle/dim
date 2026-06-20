"use server";

// Password reset server actions.
//
// Two-step flow:
//   1. requestPasswordResetAction — takes an email; calls supabase.auth.resetPasswordForEmail.
//      Always returns the same generic message to avoid leaking account existence.
//   2. updatePasswordAction — called from within a valid recovery session; validates
//      password strength then calls supabase.auth.updateUser({ password }).

import { createClient } from "@/lib/supabase/server";

export type PasswordResetRequestState = {
  message: string | null;
  error: string | null;
};

export type UpdatePasswordState = {
  error: string | null;
  ok?: boolean;
};

// @no-auth-required: password reset request is by definition pre-authentication;
// the user cannot log in and is asking for a recovery email.
export async function requestPasswordResetAction(
  _previous: PasswordResetRequestState,
  formData: FormData,
): Promise<PasswordResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { message: null, error: "Ingresá tu correo electrónico." };
  }

  // Determine the update-password URL. NEXT_PUBLIC_SITE_URL is set in
  // production; fall back to localhost for local dev.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const redirectTo = `${siteUrl}/auth/callback?next=/recuperar/actualizar`;

  const supabase = await createClient();
  // Intentionally ignore the error — we NEVER reveal whether an email exists.
  // Rate-limiting is handled by Supabase (GoTrue).
  await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  return {
    message:
      "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisá también tu carpeta de spam.",
    error: null,
  };
}

// Runs inside a valid recovery session (established by the recovery magic link
// → auth/callback → /recuperar/actualizar). The page verifies the session before
// rendering the form; this action re-verifies to prevent direct POST abuse.
export async function updatePasswordAction(
  _previous: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const supabase = await createClient();

  // Verify a valid session exists. getUser() contacts GoTrue and is not
  // spoofable via cookie tampering — it is the authoritative check.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error:
        "Tu sesión de recuperación expiró o no es válida. Solicitá un nuevo enlace desde la página de inicio de sesión.",
    };
  }

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // Same strength rule as signupAction (app/actions/auth.ts).
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "Las contraseñas no coinciden." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: `No se pudo actualizar la contraseña: ${error.message}` };
  }

  return { error: null, ok: true };
}
