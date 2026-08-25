// B11 — "cerrar sesión en todos los dispositivos".
//
// WHY THIS IS A LAUNCH PREREQUISITE AND NOT A NICE-TO-HAVE
// ---------------------------------------------------------------------------
// It is the counterpart that makes B9's long citizen session defensible. A
// 30-day session is only acceptable if the person holding it can end it from
// somewhere else: a phone left on a bus, a borrowed laptop at a locutorio, a
// relative's tablet used once to show a credential. Without this, "long session"
// just means "long exposure". The two decisions ship together or neither does.
//
// ===========================================================================
// THE TRAP THIS FUNCTION EXISTS TO AVOID
// ===========================================================================
// The obvious implementation is `supabase.auth.signOut({ scope: "global" })`.
// On the COOKIE path that is correct. On the BEARER path it SILENTLY REVOKES
// NOTHING AND REPORTS SUCCESS, which on a security control is the worst
// available outcome — the user is told every device was signed out and none was.
//
// Verified in auth-js 2.105.4: `_signOut` calls `_useSession` → `__loadSession`,
// which reads the session from STORAGE and only from storage. A client built by
// `createClientFromBearer` has `persistSession: false` and never stored a
// session — it carries the token in an `Authorization` header instead. So
// `data.session` is null, the `if (accessToken)` guard around the actual
// `admin.signOut` call is skipped entirely, and the function returns
// `{ error: null }`. auth-js special-cases `hasCustomAuthorizationHeader` for
// `getUser`, and NOT for `signOut`.
//
// So this use-case takes the RAW TOKEN and calls the endpoint directly. There is
// no session-loading step to get wrong.
//
// ===========================================================================
// WHY NO SERVICE-ROLE CLIENT, DESPITE THE `auth.admin` NAMESPACE
// ===========================================================================
// `admin.signOut(jwt, scope)` reads as privileged and is not. Verified in
// auth-js 2.105.4: it POSTs `/auth/v1/logout?scope=<scope>` passing `{ jwt }`,
// and `_request` turns that into `Authorization: Bearer <jwt>` — the USER'S own
// token. The service-role key is never consulted for this call.
//
// It is also NOT `signOut(userId, ...)`, which is the shape one would guess and
// which does not exist here. The first argument is a valid logged-in JWT.
//
// That means the anon client is the correct client: the caller's own token is
// what authorizes revoking the caller's own sessions, which is exactly the
// authority we want and no more. Reaching for `createAdminClient()` would add a
// service-role code path to a user-triggered endpoint and buy nothing.
//
// ===========================================================================
// GLOBAL, SO THE CURRENT SESSION DIES TOO
// ===========================================================================
// GoTrue offers `others`, which spares the caller. The PO chose global, and the
// scope is the honest one for the button's promise: someone pressing "cerrar
// sesión en todos los dispositivos" because they think they were compromised
// should not have to reason about which device they are holding.
//
// Measured against local GoTrue v2.188.1: after `scope=global` the caller's own
// access token is rejected IMMEDIATELY (403 on /auth/v1/user — not "valid until
// exp") and its refresh token returns 400 `refresh_token_not_found`. Revocation
// is instant, which is what lets each surface promise something true: the web
// redirects to login, and the API answers 200 once and 401 to everything after.

// ===========================================================================
// WHY THIS WRITES AN AUDIT ROW, WHEN PLAIN LOGOUT DOES NOT
// ===========================================================================
// `logoutAction` writes nothing, and that is right: ending your own session on
// your own device is not an accountability event, it is navigation.
//
// This is not that. People press this button BECAUSE something went wrong — a
// lost phone, a shared machine they forgot to leave, a suspicion someone else
// got in. "When did the legitimate owner last cut every session?" is precisely
// the question an incident review asks, and it is unanswerable after the fact
// unless it was recorded when it happened. It also sits in the same family as
// the self-service account-state actions already in the catalog
// (`govt_self_deactivated`, `dni_verified_self`, `personal_self_deactivated`).
//
// There is no privacy cost: the subject, the actor and the beneficiary are the
// same person, and the row carries no PII beyond the actor FK that every other
// row already carries.
//
// It lives in the USE-CASE and not in the two surfaces on purpose. Migrations
// 0201 and 0202 exist because the caretaker actions wrote their audit rows at
// the call sites and three of six call sites simply did not — a grant could be
// created, accepted and ended leaving a trail of the first two. Two surfaces is
// two chances to forget; one writer is none.

import { db } from "@/db";
import { writeAuditLog } from "@/lib/infra/audit-log";
import { reportError } from "@/lib/infra/report-error";
import { createAnonClient } from "@/lib/supabase/anon";

export type RevokeSessionsResult = { ok: true } | { ok: false; error: string };

export type RevokeSessionsInput = {
  /** The caller's own validated access token. Authorizes the whole operation. */
  accessToken: string;
  /** The caller, for the audit row. Resolved by the guard, never from the token. */
  userId: string;
  /** Which surface asked, so the trail can tell the web button from the app. */
  surface: "web" | "api_v1";
};

/** es-AR copy for a revocation that did not go through. */
const REVOKE_FAILED_MESSAGE =
  "No pudimos cerrar las sesiones. Probá de nuevo en unos minutos y, si sigue fallando, cambiá tu contraseña.";

/**
 * Revoke EVERY session of the user who owns `accessToken`, including the one
 * the token belongs to.
 *
 * `accessToken` must be a token the caller has already had validated — both
 * surfaces call this only after `requireLiveUser`, which round-trips it to
 * GoTrue. This function does not re-validate: GoTrue rejects a bad token at the
 * logout endpoint anyway, so a second check here would buy nothing but a round
 * trip.
 *
 * FAILS CLOSED, unlike the rate limiters around it. A limiter that cannot answer
 * lets a request through because refusing would break an ordinary read; a
 * revocation that cannot answer must NOT report success, because the user's next
 * move depends on believing it. Someone told "listo" who was not signed out
 * anywhere will stop worrying about a device that is still logged in. The error
 * copy therefore names the fallback that does not depend on us — change the
 * password, which invalidates sessions on GoTrue's side.
 */
export async function revokeAllSessions({
  accessToken,
  userId,
  surface,
}: RevokeSessionsInput): Promise<RevokeSessionsResult> {
  if (!accessToken) return { ok: false, error: REVOKE_FAILED_MESSAGE };

  const supabase = createAnonClient();

  try {
    const { error } = await supabase.auth.admin.signOut(accessToken, "global");
    if (error) return { ok: false, error: REVOKE_FAILED_MESSAGE };
  } catch {
    // `admin.signOut` returns AuthErrors rather than throwing them, so reaching
    // here means the transport itself failed (DNS, TLS, a dead GoTrue). Same
    // answer: say it did not work.
    return { ok: false, error: REVOKE_FAILED_MESSAGE };
  }

  // AFTER the revocation, and its failure does NOT fail the call.
  //
  // Both halves of that are deliberate. Writing the row first would record a
  // revocation that may not happen; of the two ways to be wrong, "revoked but
  // unlogged" is much better than "logged but still signed in everywhere".
  //
  // And once the sessions are actually gone, reporting failure would be a lie
  // that costs the user something real: they would retry a control that already
  // worked, and doubt it. The missing row is an observability problem and is
  // reported as one.
  try {
    await writeAuditLog(db, {
      action: "sessions_revoked_self",
      actorUserId: userId,
      targetUserId: userId,
      payload: { surface },
    });
  } catch (err) {
    reportError("revoke-sessions/audit", err);
  }

  return { ok: true };
}
