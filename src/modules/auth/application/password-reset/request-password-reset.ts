// Use-case: requestPasswordResetAction — validates email, calls supabase.auth.resetPasswordForEmail.
//
// @no-auth-required: password reset request is by definition pre-authentication;
// the user cannot log in and is asking for a recovery email.

import { createClient } from "@/lib/supabase/server";

import type { PasswordResetRequestState } from "./types";

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
