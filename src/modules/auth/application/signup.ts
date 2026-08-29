// Use-case: signup — step 1 of the two-step signup flow (strangler migration
// 26/61; decoupled from the web request in WU-A).
//
// WHAT MOVED, AND WHAT DID NOT
// ---------------------------------------------------------------------------
// `FormData`, `headers()` and the cookie-backed Supabase client left for the
// action edge (`src/modules/auth/actions.ts`) and the `/api/v1` adapter; this
// file takes plain data and one injected port. The validation order, the
// rate-limit bucket and its ceiling, the enumeration masquerade and every
// es-AR string are unchanged — the diff is the boundary, not the behaviour.
//
// Step 1 collects email + password + TOS only. display_name is intentionally
// omitted here — the handle_new_user trigger (db/triggers.sql) falls back to
// split_part(email, '@', 1) when no display_name metadata is supplied, so
// profiles.display_name is never NULL. The real first+last name is collected in
// step 2 (completeIdentityAction), which overwrites the provisional value.
//
// WHY EVERY REFUSAL CARRIES THE EMAIL BACK (a web concern, honoured here)
// ---------------------------------------------------------------------------
// React 19 auto-resets an uncontrolled `<form action={fn}>` once the action
// resolves; a validation error here returns (no redirect), and that reset would
// otherwise wipe the DOM-owned email the user just typed. SignupForm seeds the
// input's `defaultValue` from the echo, mirroring the login fix (bug #46). The
// echo is now the ACTION's to add, from the input it already holds — a use-case
// has no business round-tripping a form field. The enumeration-defense success
// masquerade below intentionally does NOT echo email, and that property is
// preserved by construction: it returns the success arm, which has no field for
// one, and the action reads the echo only off a refusal.
//
// @no-auth-required: signup is by definition pre-authentication.

import type { AuthSessionV1 } from "@dim/contract/api";
import { MIN_PASSWORD_LENGTH } from "@dim/contract/input";

import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";

import { type SignupAuthPort, toAuthSessionV1 } from "./gotrue-port";
import { SIGNUP_IP_LIMIT } from "./signup-limits";

/**
 * Plain-data input. `callerIp` is resolved by the caller from the request
 * (`callerIp(headers)`) and is NOT client-supplied.
 */
export type SignupInput = {
  email: string;
  password: string;
  confirmPassword: string;
  tosAccepted: boolean;
  callerIp: string;
};

export type SignupDeps = {
  /** Built only after validation and the rate-limit budget pass. See LoginDeps. */
  auth: () => Promise<SignupAuthPort>;
};

export type SignupErrorCode =
  | "missing_fields"
  | "password_too_short"
  | "password_mismatch"
  | "tos_not_accepted"
  | "rate_limited"
  | "signup_failed";

export type SignupValue = {
  /**
   * NULL is a normal outcome and has TWO causes a caller cannot tell apart —
   * that indistinguishability is the point. See the masquerade below and
   * `SignupV1` in the contract package.
   */
  session: AuthSessionV1 | null;
};

export type SignupResult =
  | { ok: true; value: SignupValue }
  | { ok: false; error: { code: SignupErrorCode; message: string } };

function refuse(code: SignupErrorCode, message: string): SignupResult {
  return { ok: false, error: { code, message } };
}

export async function signup(input: SignupInput, deps: SignupDeps): Promise<SignupResult> {
  const email = input.email.trim();
  const password = input.password;

  if (!email || !password) {
    return refuse("missing_fields", "Faltan datos. Completá todos los campos.");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return refuse(
      "password_too_short",
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (password !== input.confirmPassword) {
    return refuse("password_mismatch", "Las contraseñas no coinciden.");
  }
  if (!input.tosAccepted) {
    return refuse(
      "tos_not_accepted",
      "Tenés que aceptar los Términos y la Política de privacidad.",
    );
  }

  // Rate limit per trusted edge IP before creating a GoTrue user. Keyed off the
  // caller-resolved edge IP (x-real-ip / last XFF hop, not the spoofable first
  // segment). A non-RateLimitError propagates → fail closed.
  //
  // THE CEILING IS NO LONGER A LITERAL HERE, and the paragraph that used to
  // justify one is gone with it. It read "Tighter than login: signup is never a
  // high-frequency legitimate action, so a low ceiling caps both account-spam and
  // the enumeration oracle (audit 28-#3) cost" — a good instinct sized for a
  // browser, which refused the sixteenth citizen behind a carrier gateway once the
  // app shipped.
  //
  // IT NAMED TWO THINGS AND THE SECOND ONE IS PAID FOR SOMEWHERE. That sentence
  // was the only place in the repo linking this ceiling to the enumeration oracle
  // below, so deleting it would have retired the analysis along with the number.
  // The oracle is still open on the session-presence channel (see the masquerade
  // further down, and `enable_confirmations=false`), this bucket is the only thing
  // metering it, and raising the two SHORT windows (3/min · 15/hr → 60/min ·
  // 180/hr) lets one address test a list of citizens' addresses 240× faster —
  // 180 of them in three minutes where it took twelve hours — for the same
  // unchanged daily total of 360. That is
  // priced as cost 6 in `signup-limits.ts`, with the table, the squatting side
  // effect, and why the fix is a PO decision and not a smaller number here.
  //
  // This is the ONLY bucket this act has: signup CREATES the identity, so unlike
  // login and password-recovery there is no per-email anchor standing behind the
  // per-IP one (a per-email counter reads 1 for a citizen and 1 for a farm
  // alike). That is why the derivation is its own file rather than a copy of a
  // sibling's, and why it is shaped as a burst allowance with a DAY ceiling
  // instead of a single window. See `signup-limits.ts` — including what the
  // change costs and the three instruments it deliberately does not reach for.
  try {
    await enforceRateLimit("auth_signup_ip", input.callerIp, SIGNUP_IP_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return refuse("rate_limited", "Demasiados intentos. Esperá un momento y volvé a probar.");
    }
    throw err;
  }

  const auth = await deps.auth();
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
  const { data, error } = await auth.signUp({ email, password });

  if (error) {
    // Account enumeration defense (audit 28-#3, pilot MED).
    // Supabase returns a distinct "User already registered" error when the email
    // exists. Surfacing that (or any "ya existe" copy) lets an attacker probe
    // which emails have accounts. Return the SAME success shape as a genuine new
    // signup so the two are indistinguishable to the client. The duplicate is
    // still prevented server-side — Supabase created no new user, so a duplicate
    // account cannot be minted; a duplicate simply lands with no session and is
    // bounced back to /signup at step 2 (completeIdentityAction's getUser check).
    //
    // Residual, unchanged by WU-A and now stated on both transports: with email
    // confirmations OFF a genuine signup receives a credential and a duplicate
    // does not. The web leaks that through the presence of a session cookie;
    // `/api/v1` leaks it through `session: null`. Identical information,
    // identical cost to probe — adding a fake session to the API response would
    // hand a native client a token that authenticates nobody, which is worse
    // than the leak. Closing it needs confirmations ON in the Supabase
    // dashboard (PO-gated, tracked separately).
    const lower = error.message.toLowerCase();
    if (lower.includes("already") || lower.includes("registered")) {
      return { ok: true, value: { session: null } };
    }
    // Every other failure returns a single generic message — never the raw
    // Supabase text, which could itself hint at account state.
    return refuse(
      "signup_failed",
      "No pudimos completar el registro. Revisá tus datos e intentá de nuevo.",
    );
  }

  // Do NOT redirect. The inline signup flow uses this success signal to
  // transition the same page to the identity-collection step (step 2).
  return { ok: true, value: { session: toAuthSessionV1(data.session) } };
}
