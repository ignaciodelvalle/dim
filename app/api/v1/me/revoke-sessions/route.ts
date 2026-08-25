// POST /api/v1/me/revoke-sessions — B11, "cerrar sesión en todos los
// dispositivos" for the native client.
//
// WHAT IT IS FOR
// ---------------------------------------------------------------------------
// The counterpart that makes B9's long citizen session defensible. A 30-day
// session is only acceptable if the person holding it can end it from somewhere
// else — a phone left on a bus is the whole scenario. Without this the wallet's
// convenience is bought entirely with the user's exposure.
//
// THE RESPONSE CONTRACT, AND WHY IT IS HONEST
// ---------------------------------------------------------------------------
//   200 { revoked: true }   — every session is gone, INCLUDING the one that made
//                             this request. The bearer token in the caller's
//                             hand is dead by the time it reads this body.
//   401 on everything after — and immediately, not at token expiry. Measured
//                             against GoTrue v2.188.1: after `scope=global` the
//                             access token is refused at once (403 upstream) and
//                             the refresh token answers 400
//                             `refresh_token_not_found`.
//
// So a client must treat the 200 as "you are now signed out" and go to its login
// screen. It must NOT try to refresh: the refresh token died with the session,
// and a client that retries will loop. `AuthSessionV1`'s usual "refresh once on
// 401" rule is exactly wrong here, which is why the 200 body says `revoked`
// rather than being empty — the client has one unambiguous signal to act on.
//
// A BARE PAYLOAD, per the write convention (§2 / api-invariants.md). `POST
// /api/v1/pets` answers `PetRegisteredV1` with no wrapper and no envelope
// fields; a write is not a snapshot, so `payloadVersion`/`issuedAt`/`staleAfter`
// would be three fields describing a thing that has no staleness. The auth codes
// remain siblings through `apiV1Error`.
//
// NO Idempotency-Key, and this is a decision rather than an omission. The header
// is required on `POST /api/v1/pets` because a retried registration would create
// a SECOND ANIMAL. Revocation is naturally idempotent: the second call revokes an
// already-revoked set and changes nothing. In practice the retry cannot even
// reach the use-case — the token it would carry is dead, so it lands on 401.
// Demanding a key here would add a failure mode (`idempotency_key_required`) to
// a security control, in exchange for protection against a duplicate that has no
// cost.
//
// RATE LIMITED MODESTLY. It is a hammer: one successful call ends every session
// this user has. But the limit is deliberately not tight, because the caller is
// someone who thinks they have been compromised and may well press the button
// twice — and because it is bounded by construction, since a successful call
// destroys the credential needed to make the next one. What the ceiling actually
// bounds is a caller holding a STOLEN token trying to be a nuisance, and the
// damage there is capped at "the victim is signed out", which is also what the
// victim would have chosen. Both an IP bucket (before auth, so an unauthenticated
// hammer costs nothing downstream) and a user bucket (after, so one abusive token
// cannot spend a whole CGNAT gateway's budget).

import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { requireLiveUser } from "@/lib/infra/live-user";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { createClientFromBearer } from "@/lib/supabase/bearer";
import { revokeAllSessions } from "@/src/modules/auth/application/revoke-sessions";

export const dynamic = "force-dynamic";

/** One `auth.getUser()` round-trip to GoTrue plus one memoized profile read. */
const AUTH_BUDGET_MS = 5_000;

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * Per-IP, applied BEFORE authentication so a caller with no usable token costs
 * nothing but a counter write. Not CGNAT-scaled like the public credential
 * surface: this endpoint is not something a thousand neighbours behind one
 * carrier gateway do at once — it is a rare, deliberate act, and 30/min leaves
 * room for a whole office to use it in the same minute.
 */
const REVOKE_IP_LIMIT = { maxPerMinute: 30, maxPerHour: 120 };

/**
 * Per-user, applied AFTER the caller is known. Tighter, because one identity
 * legitimately needs this a handful of times ever. Generous enough for the
 * double-press and the "did it work?" retry.
 */
const REVOKE_USER_LIMIT = { maxPerMinute: 5, maxPerHour: 20, maxPerDay: 40 };

/** The bare write payload. `revoked` is the client's signal to drop its token. */
type RevokeSessionsV1 = { revoked: true };

// AUTHORIZED, not opted out: this handler calls requireLiveUser in its own body
// and that call IS the authorization. Said without writing the opt-out marker,
// because a comment that spells the marker in order to deny it still reads as
// one to a scanner that matches the token (see /api/v1/me for the measurement).
export async function POST(request: Request) {
  // Free: a regex over one header, before any counter write.
  const client = createClientFromBearer(request.headers.get("authorization"));
  if (!client.ok) {
    return apiV1Error(client.reason === "MISSING" ? "auth_required" : "auth_expired", 401);
  }

  // Derived from the REQUEST, never from a middleware-stamped header: those
  // default silently when the matcher does not run, and a value the request
  // influences must not decide what a caller may do (check-api-guard-headers).
  try {
    await enforceRateLimit(
      "api_v1_me_revoke_sessions_ip",
      callerIp(request.headers),
      REVOKE_IP_LIMIT,
    );
  } catch (err) {
    if (err instanceof RateLimitError) return apiV1Error("rate_limited", 429);
    // FAIL OPEN, matching every other limiter on this surface. The limiter is
    // itself a DB write; if it cannot answer, refusing here would deny a user
    // the ability to sign out of a device they believe is compromised, over an
    // abuse control. The guard below is the authorization boundary and IT fails
    // closed — that is the one that must.
    console.error("[api-v1-me-revoke-sessions] IP rate limiter unavailable, failing open:", err);
  }

  let live: Awaited<ReturnType<typeof requireLiveUser>>;
  try {
    live = await withDbBudgetOrThrow(
      requireLiveUser({ supabase: client.supabase, accessToken: client.token }),
      AUTH_BUDGET_MS,
      "api-v1-me-revoke-sessions",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) {
      return apiV1Error("temporarily_unavailable", 503, {
        "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
      });
    }
    throw err;
  }

  if (!live.ok) {
    switch (live.reason) {
      case "NO_SESSION":
        return apiV1Error("auth_expired", 401);
      case "ACCOUNT_ERASED":
        return apiV1Error("account_erased", 403);
      case "DEACTIVATED":
        return apiV1Error("account_deactivated", 403);
      case "SHIFT_EXPIRED":
        return apiV1Error("session_shift_expired", 401);
      case "MAINTENANCE":
        return apiV1Error("temporarily_unavailable", 503, {
          "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
        });
      default: {
        const unhandled: never = live.reason;
        throw new Error(`Unhandled liveness refusal: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  try {
    await enforceRateLimit("api_v1_me_revoke_sessions_user", live.user.id, REVOKE_USER_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) return apiV1Error("rate_limited", 429);
    console.error("[api-v1-me-revoke-sessions] user rate limiter unavailable, failing open:", err);
  }

  // `client.token` and not a token re-read from anywhere else: it is the exact
  // credential requireLiveUser just had GoTrue validate, so the revocation
  // authorizes with a token we know is live and belongs to `live.user`.
  const result = await revokeAllSessions({
    accessToken: client.token,
    userId: live.user.id,
    surface: "api_v1",
  });

  if (!result.ok) {
    // FAILS CLOSED, unlike the limiters above. A revocation that did not happen
    // must never answer 200: the user's next move — stop worrying about the
    // phone they lost — depends on believing this response.
    return apiV1Error("temporarily_unavailable", 503, {
      "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
    });
  }

  const payload: RevokeSessionsV1 = { revoked: true };
  return apiV1Json(payload, { status: 200 });
}
