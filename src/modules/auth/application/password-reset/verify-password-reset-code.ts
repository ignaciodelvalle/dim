// Use-case: verifyPasswordResetCode — the WEB's redemption half of password
// recovery. Spend three budgets, then ask GoTrue to exchange the six-digit code
// mailed by `requestPasswordReset` for a recovery session.
//
// WHY THIS EXISTS (PO decision 2026-09-13: ONE method, the code, on both surfaces)
// ---------------------------------------------------------------------------
// The Supabase recovery template carries only `{{ .Token }}`. The web used to be
// link-only (`/auth/callback` → `exchangeCodeForSession`), so a web user received
// a code with nowhere to type it. The phone already redeems the code
// (`resetPasswordWithCode` in apps/mobile/src/auth/session-store.ts); this is the
// same exchange for a browser, with one difference that is the reason it lives
// on the SERVER and not in client JavaScript:
//
//   · the session must land in the SSR COOKIE jar, because `/recuperar/actualizar`
//     and `updatePasswordAction` read it through `@/lib/supabase/server`. The web
//     action injects `(await createClient()).auth`, so a successful `verifyOtp`
//     writes the recovery session exactly where the link path used to.
//
// WHY THIS FILE HAS BUDGETS OF ITS OWN, WHEN THE PHONE'S REDEMPTION HAS NONE
// ---------------------------------------------------------------------------
// The phone calls GoTrue directly, so GoTrue's per-IP `token_verifications`
// ceiling is keyed on the phone's own address and bounds guesses per attacker.
// Here the caller of GoTrue is OUR server. Every web redemption reaches GoTrue
// from the deployment's egress address, so that ceiling stops being a per-caller
// bound — it becomes one shared pool for every web user at once. The bound on
// code guesses therefore has to be ours on this transport, keyed on the trusted
// edge IP and on the hashed address, and spent BEFORE GoTrue is touched. The
// derivation is in `./limits.ts`.
//
// WHAT A REFUSAL MAY NEVER REVEAL
// ---------------------------------------------------------------------------
// Whether the address has an account. GoTrue answers a wrong code, an expired
// code, a spent code and a code for an address with no account with the SAME
// error (`otp_expired`, "Token has expired or is invalid"), so there is no honest
// way to tell "wrong" from "expired" — and telling "no such account" apart would
// rebuild the enumeration oracle `requestPasswordReset` refuses to be. They share
// one sentence, the same one the phone shows. The other refusals (blank field,
// over a budget, provider unavailable) are about the request, never the account.
//
// THE CODE IS NEVER LOGGED, and neither is the address: this file logs nothing.
//
// @no-auth-required: redeeming a recovery code is BY DEFINITION
// pre-authentication; the user cannot log in and is exchanging a mailed credential.

import { RateLimitError, emailRateLimitKey, enforceRateLimit } from "@/lib/infra/rate-limit";

import type { PasswordResetCodeAuthPort } from "../gotrue-port";
import {
  PASSWORD_RESET_VERIFY_EMAIL_LIMIT,
  PASSWORD_RESET_VERIFY_GLOBAL_BUCKET,
  PASSWORD_RESET_VERIFY_GLOBAL_KEY,
  PASSWORD_RESET_VERIFY_GLOBAL_LIMIT,
  PASSWORD_RESET_VERIFY_IP_LIMIT,
} from "./limits";

/**
 * Plain-data input. `callerIp` is resolved by the caller from the request
 * (`callerIp(headers)`) and is NOT client-supplied — see `LoginInput`.
 */
export type VerifyPasswordResetCodeInput = {
  email: string;
  code: string;
  callerIp: string;
};

export type VerifyPasswordResetCodeDeps = {
  /** Built only after validation and all three budgets pass. */
  auth: () => Promise<PasswordResetCodeAuthPort>;
};

export type VerifyPasswordResetCodeErrorCode =
  | "missing_email"
  | "missing_code"
  | "rate_limited"
  | "invalid_code"
  | "unavailable";

/** Success carries nothing: the cookie client already persisted the session. */
export type VerifyPasswordResetCodeResult =
  | { ok: true }
  | { ok: false; error: { code: VerifyPasswordResetCodeErrorCode; message: string } };

export const VERIFY_CODE_MESSAGES: Record<VerifyPasswordResetCodeErrorCode, string> = {
  missing_email: "Volvé a ingresar tu correo electrónico para pedir un código.",
  missing_code: "Ingresá el código de 6 dígitos que te enviamos por correo.",
  rate_limited: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
  invalid_code: "El código no es válido o ya venció. Pedí uno nuevo y volvé a intentar.",
  unavailable: "No pudimos verificar el código en este momento. Probá de nuevo en unos minutos.",
};

function refuse(code: VerifyPasswordResetCodeErrorCode): VerifyPasswordResetCodeResult {
  return { ok: false, error: { code, message: VERIFY_CODE_MESSAGES[code] } };
}

/**
 * Whitespace is removed from the code, not just trimmed: a code pasted from a
 * mail client often arrives as "123 456". Nothing else is normalized and the
 * LENGTH is not checked — GoTrue owns `otp_length`, and a server that refused a
 * seven-digit code would break the day that setting changes (the phone's
 * `CODE_LENGTH` docblock makes the same point).
 */
export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** A provider-side refusal that is about load or availability, never the code. */
function classifyProviderError(error: { status?: number; code?: string }) {
  if (error.status === 429 || error.code === "over_request_rate_limit") return "rate_limited";
  if (error.status === undefined || error.status >= 500) return "unavailable";
  return "invalid_code";
}

export async function verifyPasswordResetCode(
  input: VerifyPasswordResetCodeInput,
  deps: VerifyPasswordResetCodeDeps,
): Promise<VerifyPasswordResetCodeResult> {
  const email = input.email.trim();
  const code = normalizeRecoveryCode(input.code);

  if (!email) return refuse("missing_email");
  if (!code) return refuse("missing_code");

  // All three budgets before GoTrue. A non-RateLimitError propagates → fail
  // closed: a limiter that cannot answer must not be read as "allowed". The
  // global bucket is LAST so a caller already over their own per-IP or per-email
  // budget does not burn the pool every web user shares (see ./limits.ts).
  try {
    await enforceRateLimit(
      "auth_password_reset_verify_ip",
      input.callerIp,
      PASSWORD_RESET_VERIFY_IP_LIMIT,
    );
    await enforceRateLimit(
      "auth_password_reset_verify_email",
      emailRateLimitKey(email),
      PASSWORD_RESET_VERIFY_EMAIL_LIMIT,
    );
    await enforceRateLimit(
      PASSWORD_RESET_VERIFY_GLOBAL_BUCKET,
      PASSWORD_RESET_VERIFY_GLOBAL_KEY,
      PASSWORD_RESET_VERIFY_GLOBAL_LIMIT,
    );
  } catch (err) {
    if (err instanceof RateLimitError) return refuse("rate_limited");
    throw err;
  }

  const auth = await deps.auth();

  let answer: Awaited<ReturnType<PasswordResetCodeAuthPort["verifyOtp"]>>;
  try {
    answer = await auth.verifyOtp({ email, token: code, type: "recovery" });
  } catch {
    // auth-js rethrows anything that is not an AuthError (a fetch failure, a
    // cookie write that threw). Nothing about the code or the account.
    return refuse("unavailable");
  }

  if (answer.error) return refuse(classifyProviderError(answer.error));
  // No error and no session is not a success: there is nothing for
  // `/recuperar/actualizar` to read. Same sentence as a refused code.
  if (!answer.data.session) return refuse("invalid_code");

  return { ok: true };
}
