// `/api/v1/me/profile` — the person's own data, as opposed to their animal's.
//
//   GET  → the six fields the "Editar mis datos" form pre-fills with.
//   POST → saving them.
//
// IT IS NOT `/api/v1/me`, AND THE SEPARATION IS THE SECURITY DECISION HERE
// ---------------------------------------------------------------------------
// `/api/v1/me` is the SHELL — four fields, fetched on every cold launch — and it
// deliberately carries no phone, no email, no DNI and no jurisdiction. Its
// docblock calls that "the whole defence for what a stolen access token buys"
// and warns the settings screen not to undo it "by fetching the missing pieces
// from somewhere else to make a nicer profile card".
//
// This route fetches some of those missing pieces, so it has to answer that
// warning rather than ignore it. The answer is in `@dim/contract/api`'s
// `my-profile.ts` and it turns on two things: this payload is fetched only when
// somebody OPENS the edit form (never on launch, so a stolen token gets nothing
// by doing nothing), and it returns exactly the six fields the same URL writes
// back — so it discloses nothing a caller could not obtain by writing. A seventh
// field breaks that argument, which is why the read's list and the writer's list
// are the same list and must stay so.
//
// IT IS ALSO NOT `pets/{token}/profile`, which is the animal's identity and its
// emergency-contact OVERRIDE. This one is the ACCOUNT DEFAULT those overrides
// fall back to. Two URLs because they are two subjects and two guards: that one
// resolves pet access and splits `edit_identity` from `set_emergency_contacts`;
// this one has no pet in it at all and the only rule is "you are you".
//
// THE GUARD IS `requireLiveUser` AND NOTHING ELSE, and that IS the authorization
// rather than a thin version of one. `updateProfileForUser` takes a `userId` and
// writes that user's row; the id comes from the guard and never from the body,
// which is the same reason `app/actions/profile.ts` refuses to export the bare
// writer ("a bare writer taking a caller-supplied userId would let any client
// update ANY user's profile by UUID").
//
// NO Idempotency-Key. A profile update is a VALUE, not an append: setting the
// same six fields twice is setting them once, and the writer's own diff means
// the second save changes nothing and writes an audit row saying so.

import { apiV1Envelope, apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import {
  API_V1_AUTHENTICATED_READ_IP_LIMIT,
  API_V1_AUTHENTICATED_READ_USER_LIMIT,
  API_V1_AUTHENTICATED_WRITE_IP_LIMIT,
  API_V1_AUTHENTICATED_WRITE_USER_LIMIT,
} from "@/lib/infra/api-v1-limits";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { type LiveUserFailureReason, requireLiveUser } from "@/lib/infra/live-user";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { createClientFromBearer } from "@/lib/supabase/bearer";
import { readMyEditableProfile } from "@/src/modules/pets/application/profile/read-my-profile";
import { updateProfileForUser } from "@/src/modules/pets/application/profile/update-profile";
import {
  MY_PROFILE_PAYLOAD_VERSION,
  MY_PROFILE_STALE_AFTER_MS,
  type MyProfileUpdatedV1,
  type MyProfileV1,
} from "@dim/contract/api";
import { myProfileEditInputSchema } from "@dim/contract/input";

export const dynamic = "force-dynamic";

/** One GoTrue round-trip plus one memoized profile read. */
const AUTH_BUDGET_MS = 5_000;

/** One indexed single-row read, and one transactional update plus audit row. */
const PROFILE_BUDGET_MS = 5_000;

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

// AUTHORIZED, not opted out: both handlers call requireLiveUser in their own
// bodies and those calls ARE the authorization. Said WITHOUT writing the opt-out
// marker, because a comment that spells the marker in order to deny it still
// reads as one to a scanner matching the token.
export async function GET(request: Request) {
  const client = createClientFromBearer(request.headers.get("authorization"));
  if (!client.ok) {
    return apiV1Error(client.reason === "MISSING" ? "auth_required" : "auth_expired", 401);
  }

  // Derived from the REQUEST, never from a middleware-stamped header: those
  // default silently when the matcher does not run, and a value the request
  // influences must not decide what a caller may do (check-api-guard-headers).
  if (
    !(await spendBudget(
      "api_v1_me_profile_read_ip",
      callerIp(request.headers),
      API_V1_AUTHENTICATED_READ_IP_LIMIT,
    ))
  ) {
    return apiV1Error("rate_limited", 429);
  }

  // CALLED IN THE HANDLER BODY, not through a helper the two methods share.
  // `check-api-v1-envelope` reads the handler body ONLY and does not follow
  // calls, so a guard factored into a module-level function reads as ABSENT —
  // and that is the right rule rather than a limitation.
  let live: Awaited<ReturnType<typeof requireLiveUser>>;
  try {
    live = await withDbBudgetOrThrow(
      requireLiveUser({ supabase: client.supabase, accessToken: client.token }),
      AUTH_BUDGET_MS,
      "api-v1-me-profile-auth",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }
  if (!live.ok) return liveUserRefusal(live.reason);

  if (
    !(await spendBudget(
      "api_v1_me_profile_read_user",
      live.user.id,
      API_V1_AUTHENTICATED_READ_USER_LIMIT,
    ))
  ) {
    return apiV1Error("rate_limited", 429);
  }

  let profile: Awaited<ReturnType<typeof readMyEditableProfile>>;
  try {
    profile = await withDbBudgetOrThrow(
      readMyEditableProfile(live.user.id),
      PROFILE_BUDGET_MS,
      "api-v1-me-profile-read",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  // NO PROFILE ROW → 404, and the alternative was worse. An account exists in
  // `auth.users` before its profile row is completed (the window `MeV1` reports
  // as `profilePending: true`), and this endpoint could have answered a payload
  // of six empty strings for it. That would hand a half-registered person an
  // edit form whose save is guaranteed to fail — `updateProfileForUser` answers
  // NOT_FOUND — instead of the identity flow they actually need. A client that
  // reaches this is one whose gate let a pending profile through, and the 404 is
  // what tells it so.
  if (profile === null) return apiV1Error("not_found", 404);

  const payload: MyProfileV1 = {
    ...apiV1Envelope({
      payloadVersion: MY_PROFILE_PAYLOAD_VERSION,
      staleAfterMs: MY_PROFILE_STALE_AFTER_MS,
    }),
    // `null → ""` HAPPENS HERE, once, on the way out — the flattening the
    // contract describes. Doing it in the client instead would put the writer's
    // clearing semantics on both ends of the wire, and the two would disagree
    // the first time somebody cleared a field.
    profile: {
      displayName: profile.displayName,
      phone: profile.phone ?? "",
      preferredVetName: profile.preferredVetName ?? "",
      preferredVetPhone: profile.preferredVetPhone ?? "",
      emergencyContactName: profile.emergencyContactName ?? "",
      emergencyContactPhone: profile.emergencyContactPhone ?? "",
    },
  };

  return apiV1Json(payload, { status: 200 });
}

export async function POST(request: Request) {
  const client = createClientFromBearer(request.headers.get("authorization"));
  if (!client.ok) {
    return apiV1Error(client.reason === "MISSING" ? "auth_required" : "auth_expired", 401);
  }

  if (
    !(await spendBudget(
      "api_v1_me_profile_write_ip",
      callerIp(request.headers),
      API_V1_AUTHENTICATED_WRITE_IP_LIMIT,
    ))
  ) {
    return apiV1Error("rate_limited", 429);
  }

  // In the handler body for the same reason the read's copy is — see the note
  // there. Two calls, not one shared helper, because the fence that keeps this
  // URL honest cannot see through a function.
  let live: Awaited<ReturnType<typeof requireLiveUser>>;
  try {
    live = await withDbBudgetOrThrow(
      requireLiveUser({ supabase: client.supabase, accessToken: client.token }),
      AUTH_BUDGET_MS,
      "api-v1-me-profile-auth",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }
  if (!live.ok) return liveUserRefusal(live.reason);

  if (
    !(await spendBudget(
      "api_v1_me_profile_write_user",
      live.user.id,
      API_V1_AUTHENTICATED_WRITE_USER_LIMIT,
    ))
  ) {
    return apiV1Error("rate_limited", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiV1Error("invalid_request", 400);
  }

  // The client validated against this schema first and got per-field codes
  // locally. This is the backstop for a client out of step with the contract,
  // which is why it carries no field detail — the envelope is one key.
  const parsed = myProfileEditInputSchema.safeParse(body);
  if (!parsed.success) return apiV1Error("invalid_request", 400);

  let result: Awaited<ReturnType<typeof updateProfileForUser>>;
  try {
    result = await withDbBudgetOrThrow(
      // `live.user.id` and NOT anything from the body. The writer takes a
      // `userId` and writes that row; a caller-supplied one would let any client
      // update any user's profile by UUID, which is exactly why
      // `app/actions/profile.ts` refuses to export this writer directly.
      updateProfileForUser(live.user.id, parsed.data),
      PROFILE_BUDGET_MS,
      "api-v1-me-profile-write",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  if ("error" in result) {
    // THE WRITER'S TWO REFUSALS, MAPPED SEPARATELY. `NOT_FOUND` is the
    // half-registered account the GET also 404s; everything else is a
    // `VALIDATION_ERROR:` string this endpoint has already ruled out with the
    // schema above, so reaching it means the two guards disagree — which is a
    // 400 about the request rather than a 500 about the platform, because the
    // body really is what the writer rejected.
    if (result.error === "NOT_FOUND") return apiV1Error("not_found", 404);
    if (result.error.startsWith("VALIDATION_ERROR")) return apiV1Error("invalid_request", 400);
    return apiV1Error("profile_failed", 500);
  }

  const payload: MyProfileUpdatedV1 = { saved: true };
  return apiV1Json(payload, { status: 200 });
}

/**
 * Spend one rate-limit budget. `true` → proceed, `false` → over the limit.
 *
 * FAILS OPEN on limiter infrastructure failure, matching every sibling limiter
 * on this surface. The limiter is itself a DB write; if `rate_limit_buckets` is
 * unavailable, refusing would stop somebody correcting their own phone number
 * over an abuse control, while the authorization boundary stays intact and fails
 * CLOSED. That is the one that must.
 */
async function spendBudget(
  endpoint: string,
  identifier: string,
  limit: { maxPerMinute?: number; maxPerHour?: number; maxPerDay?: number },
): Promise<boolean> {
  try {
    await enforceRateLimit(endpoint, identifier, limit);
    return true;
  } catch (err) {
    if (err instanceof RateLimitError) return false;
    reportError(`api-v1-me-profile/${endpoint}`, err);
    return true;
  }
}

function unavailable() {
  return apiV1Error("temporarily_unavailable", 503, {
    "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
  });
}

/**
 * The liveness guard's refusals, mapped to the SAME statuses and codes every
 * sibling on this surface uses.
 *
 * `DEACTIVATED` refuses the read too, and here that is the easy call rather than
 * the deliberate one it is on `/me/privacy`: the read exists only to pre-fill a
 * form whose write is refused, so serving it would be drawing a screen whose
 * save button cannot work.
 */
function liveUserRefusal(reason: LiveUserFailureReason) {
  switch (reason) {
    case "NO_SESSION":
      return apiV1Error("auth_expired", 401);
    case "ACCOUNT_ERASED":
      return apiV1Error("account_erased", 403);
    case "DEACTIVATED":
      return apiV1Error("account_deactivated", 403);
    case "SHIFT_EXPIRED":
      return apiV1Error("session_shift_expired", 401);
    case "MAINTENANCE":
      return unavailable();
    default: {
      const unhandled: never = reason;
      throw new Error(`Unhandled liveness refusal: ${JSON.stringify(unhandled)}`);
    }
  }
}
