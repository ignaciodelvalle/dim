// Use-case: requestPasswordResetAction — validates email, calls supabase.auth.resetPasswordForEmail.
//
// @no-auth-required: password reset request is by definition pre-authentication;
// the user cannot log in and is asking for a recovery email.

import { headers } from "next/headers";

import {
  RateLimitError,
  callerIp,
  emailRateLimitKey,
  enforceRateLimit,
} from "@/lib/infra/rate-limit";
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

  // Rate limit before dispatching a recovery email. Two budgets:
  //   - per-IP:    caps how many reset emails one source can trigger.
  //   - per-email: caps mail-bombing a specific person's inbox from many IPs.
  // Keyed off callerIp (x-real-ip / last XFF hop, not the spoofable first
  // segment). Per-email uses the hashed key so no cleartext PII is persisted in
  // rate_limit_buckets. A non-RateLimitError propagates → fail closed.
  const ip = callerIp(await headers());
  try {
    await enforceRateLimit("auth_password_reset_ip", ip, { maxPerMinute: 3, maxPerHour: 15 });
    await enforceRateLimit("auth_password_reset_email", emailRateLimitKey(email), {
      maxPerHour: 5,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        message: null,
        error: "Demasiados intentos. Esperá un momento y volvé a probar.",
      };
    }
    throw err;
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
