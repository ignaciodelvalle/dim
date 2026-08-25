// `POST /api/v1/pets/{publicToken}/events/{eventId}/amend` — correct a record.
//
// IT DOES NOT EDIT ANYTHING. Nothing in this product edits or deletes a
// `pet_events` row — a database trigger refuses both, by name, with the
// invariant quoted in the error. A correction APPENDS a new `event_amended`
// event that references the original, and every reader projects the corrected
// value over it. So this is a POST that CREATES, it answers 201, and there is
// no PATCH anywhere near it.
//
// WHO MAY CORRECT — VERIFIED AGAINST THE WEB, NOT ASSUMED
// ---------------------------------------------------------------------------
// The web's writer is `amendEventAction`, whose entire guard is
// `requireAlivePetAccess(publicToken)`. Read literally, that is:
//
//   · Any CURRENT HOLDER on the person path — owner, co_owner, foster OR
//     caretaker. It is not titular-only, and it is NOT the event's author:
//     nothing in `amendEvent` compares the acting user against
//     `recorded_by_user_id`. Whoever holds the animal may correct any amendable
//     record on it, whoever wrote it.
//   · An ORG-path member whose membership grants `event.write`.
//   · Never on a DECEASED animal: `requireAlivePetAccess` refuses every new
//     event on one, which is the same refusal a correction gets.
//
// This endpoint mirrors that rule EXACTLY, including the org path, because the
// server action is itself an addressable endpoint — an org member with
// `event.write` can already reach it on the web. Narrowing here would not close
// anything; it would only make the two doors disagree.
//
// The AFFORDANCE is narrower than the rule, on both surfaces: the web's event
// page renders "Corregir registro" for the person path only
// (`canAmend = accessPath === "owner"`), and `PetEventDetailV1.amend.canAmend`
// reports that same narrower answer. A client hides the button on `false`; the
// door still honours the full rule for anything that reaches it.
//
// AND THE ALLOWLIST IS A PROPERTY OF THE RECORD, not of the caller.
// `AMENDABLE_EVENT_TYPES` covers the clinical routine; `death_recorded`,
// `incident_reported`, the rabies-observation pair, `disease_reported` and the
// custody/adoption flows are excluded because each has its own reversal path or
// forensic weight. Checked here so the refusal carries a status a client can
// switch on, and checked AGAIN inside the use-case, which is where it belongs.
//
// `Idempotency-Key` IS REQUIRED, AND IT IS HONOURED
// ---------------------------------------------------------------------------
// The web has no header to send, so `amendEvent` derives its own key from
// (target, actor, changes) — which dedupes a double-clicked button and nothing
// else. That is not the failure this client has: a phone on a subway resends a
// request whose first attempt may already have committed, and the derived key
// cannot tell that apart from a second, deliberate identical correction.
//
// So the header is required, must be a UUID, and TRAVELS: it becomes the row's
// `client_idempotency_key`, and a replay resolves to the first attempt's
// correction and answers 201 with `wasDuplicate: true`. Required rather than
// optional for the reason `POST /api/v1/pets` states — optional idempotency is
// idempotency nobody has.
//
// THE CLIENT SENDS THE NEW VALUE; THE SERVER SUPPLIES THE OLD ONE
// ---------------------------------------------------------------------------
// The web form posts both halves of each change, taken from the payload it
// rendered. This endpoint takes only `{field, value}` and reads the previous
// value out of the record inside the same request. A client-supplied `old` is a
// claim about the SERVER's state, and a stale one — a second correction landed
// while a form sat open — would write a history that never happened.
//
// A field the record does not carry is `invalid_request`: the web form can only
// offer keys that exist on the payload, so accepting an unknown one here would
// let a native client invent fields no web correction could produce.

import { isAmendableEventType } from "@/lib/infra/amendment";
import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { type LiveUserFailureReason, requireLiveUser } from "@/lib/infra/live-user";
import {
  OWNER_AUTHORSHIP,
  type PetHolderAccess,
  resolvePetHolderAccess,
} from "@/lib/infra/pet-access";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { createClientFromBearer } from "@/lib/supabase/bearer";
import { isUuid } from "@/lib/utils/uuid";
import { amendEvent } from "@/src/modules/events/application/amendment/amend-event";
import { loadPetEventDetail } from "@/src/modules/events/application/read/load-pet-event-detail";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { type EventAmendedV1, isValidIdempotencyKey } from "@dim/contract/api";
import { amendEventInputSchema } from "@dim/contract/input";

export const dynamic = "force-dynamic";

/** One GoTrue round-trip plus one indexed profile read. */
const AUTH_BUDGET_MS = 5_000;

/**
 * The pre-write reads: the access query, the org capability lookup, and the
 * record itself with its correction chain.
 *
 * The WRITE is deliberately outside any budget, for the reason
 * `POST /api/v1/pets` records: `withDbBudgetOrThrow` races a promise against a
 * timer and rejects, which does not abort a Postgres transaction. Wrapping the
 * append would produce a 503 for a transaction that then COMMITS — the client
 * sees failure, the ledger has the correction, and the two disagree forever. The
 * honest bound is the platform's function timeout and the honest recovery is the
 * retry this endpoint guarantees is safe.
 */
const RESOLVE_BUDGET_MS = 8_000;

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * Per-IP ceiling: 20/min, 120/hour.
 *
 * A THIRD of the read budget, because this one appends to the spine and a read
 * does not. Sized for CGNAT rather than for a household — a mobile carrier puts
 * hundreds of subscribers behind one address — so it must never be what stops a
 * real correction: 20/min is roughly seven simultaneous corrections from one
 * carrier egress with two retries each, against a behaviour (fixing a typo in a
 * vaccine record) that no person performs twice in a minute.
 */
const AMEND_IP_LIMIT = { maxPerMinute: 20, maxPerHour: 120 };

/**
 * Per-user ceiling: 10/min, 40/hour, 100/day.
 *
 * This is the one that bounds a PERSON, and each number is set against the
 * legitimate worst case: 10/min is headroom for RETRIES of one correction on a
 * flaky connection (a limit that punishes the retry it just asked for would be
 * self-defeating); 40/hour is somebody methodically fixing a whole libreta after
 * a bad import; 100/day is the abuse backstop, past which an account is doing
 * something no owner does — and every correction it wrote is signed by it and
 * auditable, so the cost of being wrong is a support conversation.
 */
const AMEND_USER_LIMIT = { maxPerMinute: 10, maxPerHour: 40, maxPerDay: 100 };

// AUTHORIZED, not opted out: this handler calls requireLiveUser and then
// resolvePetHolderAccess in its own body, and those two calls ARE the
// authorization. Said here for a reader scanning for the guard — and said
// WITHOUT writing the opt-out marker, because a comment that spells the marker
// in order to deny it still reads as one to a scanner matching the token.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicToken: string; eventId: string }> },
) {
  const { publicToken, eventId } = await params;

  // All three are free — a regex over a header, a trim over another, a regex
  // over a path segment. Doing them before the limiter means a client that got
  // the envelope wrong costs the platform no counter write.
  const client = createClientFromBearer(request.headers.get("authorization"));
  if (!client.ok) {
    return apiV1Error(client.reason === "MISSING" ? "auth_required" : "auth_expired", 401);
  }

  // ONE code for absent and for malformed, the same call `POST /api/v1/pets`
  // made: both mean "send a well-formed header", and `client_idempotency_key`
  // is a Postgres `uuid`, so a non-UUID would raise 22P02 inside the write and
  // surface as a retryable-looking failure that reproduces forever.
  const idempotencyKey = (request.headers.get("idempotency-key") ?? "").trim();
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return apiV1Error("idempotency_key_required", 400);
  }

  if (!isUuid(eventId)) return apiV1Error("not_found", 404);

  if (!(await spendBudget("api_v1_amend_ip", callerIp(request.headers), AMEND_IP_LIMIT))) {
    return apiV1Error("rate_limited", 429);
  }

  let live: Awaited<ReturnType<typeof requireLiveUser>>;
  try {
    live = await withDbBudgetOrThrow(
      requireLiveUser({ supabase: client.supabase, accessToken: client.token }),
      AUTH_BUDGET_MS,
      "api-v1-amend-auth",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }
  if (!live.ok) return liveUserRefusal(live.reason);

  if (!(await spendBudget("api_v1_amend_user", live.user.id, AMEND_USER_LIMIT))) {
    return apiV1Error("rate_limited", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiV1Error("invalid_request", 400);
  }

  // The client validated against this schema first and got per-field codes
  // locally (CHANGES_REQUIRED, REASON_TOO_SHORT, …). This is the backstop for a
  // client out of step with the contract, which is why it carries no field
  // detail — the envelope is one key.
  const parsed = amendEventInputSchema.safeParse(body);
  if (!parsed.success) return apiV1Error("invalid_request", 400);

  return writeCorrection({
    publicToken,
    eventId,
    userId: live.user.id,
    idempotencyKey,
    input: parsed.data,
  });
}

/**
 * Everything from the access guard to the append.
 *
 * Split out of `POST` because the handler was already at the complexity ceiling
 * the linter enforces, and because this half has one subject — "may this
 * correction be written, and what exactly does it say" — while the half above
 * has another: "is this request well formed".
 */
async function writeCorrection(ctx: {
  publicToken: string;
  eventId: string;
  userId: string;
  idempotencyKey: string;
  input: { reason: string | null; changes: Array<{ field: string; value: string | null }> };
}) {
  let access: PetHolderAccess;
  try {
    access = await withDbBudgetOrThrow(
      resolvePetHolderAccess(ctx.publicToken, ctx.userId),
      RESOLVE_BUDGET_MS,
      "api-v1-amend-access",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }

  // A pet this caller may not touch and a pet that does not exist answer
  // IDENTICALLY, exactly as the read endpoints do.
  if (access.kind === "none") return apiV1Error("not_found", 404);

  // A closed life record accepts no new events, correction or otherwise. It is
  // a fact about the ANIMAL rather than about the caller, which is why it is
  // 409 and not 403.
  if (access.pet.status === "deceased") return apiV1Error("amend_not_allowed", 409);

  // The org path needs the capability the web's own guard checks. A fact about
  // the CALLER: 403, and nothing they can retry or reword.
  if (access.kind === "org") {
    const granted = await getGrantedCapabilities(access.membership);
    if (!granted.has("event.write")) return apiV1Error("amend_forbidden", 403);
  }

  // The record, WITH its correction chain, because the previous value of each
  // field must come from the CORRECTED state and not from the row as first
  // written. It costs one extra indexed read (the attachment query this reader
  // also runs) against a fourth query shape nobody would keep in agreement with
  // the other three.
  let read: Awaited<ReturnType<typeof loadPetEventDetail>>;
  try {
    read = await withDbBudgetOrThrow(
      loadPetEventDetail({ petId: access.pet.id, eventId: ctx.eventId }),
      RESOLVE_BUDGET_MS,
      "api-v1-amend-load",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) return unavailable();
    throw err;
  }
  if (!read) return apiV1Error("not_found", 404);

  if (!isAmendableEventType(read.eventType)) return apiV1Error("amend_not_allowed", 409);

  // Every named field must exist on the record. The web form can only offer
  // keys the payload already has; a native client must not be able to invent
  // one.
  // The SPINE's change shape, which is `{field, old, new}` — the wire's is
  // `{field, value}`. The `old` half is filled here, from the record, and that
  // asymmetry is the point rather than an inconvenience.
  const changes: Array<{ field: string; old: unknown; new: unknown }> = [];
  for (const change of ctx.input.changes) {
    if (!Object.hasOwn(read.payload, change.field)) return apiV1Error("invalid_request", 400);
    changes.push({ field: change.field, old: read.payload[change.field], new: change.value });
  }

  const result = await amendEvent(
    { id: ctx.userId },
    { id: access.pet.id, name: access.pet.name, publicToken: access.pet.publicToken },
    // The person path signs as the owner; the org path signs as its member's
    // resolved authorship, which is `vet` only when that member holds a
    // validated matrícula. Re-deriving either here is how a native write ends up
    // claiming a verification nobody gave it.
    access.kind === "org" ? access.eventAuthorship : OWNER_AUTHORSHIP,
    {
      publicToken: access.pet.publicToken,
      targetEventId: ctx.eventId,
      reason: ctx.input.reason,
      changes,
      clientIdempotencyKey: ctx.idempotencyKey,
    },
  );

  if (!result.ok) {
    // ONE generic code. The use-case's failure arm is an untyped string carrying
    // es-AR prose written for a web form, and it can name internal constraints —
    // putting it on a wire would be a worse answer than saying nothing. Logged
    // in full on this side, where it is useful. The branches a client CAN act on
    // differently were all decided above, before the write.
    reportError("api-v1-amend", new Error(result.error), { userId: ctx.userId });
    return apiV1Error("amend_failed", 500);
  }

  // 201 on both paths — a replay answers with the FIRST attempt's correction and
  // `wasDuplicate: true`. The caller asked for a correction to exist and one
  // exists; that is a success, not a conflict.
  const payload: EventAmendedV1 = {
    amendmentEventId: result.amendmentEventId,
    wasDuplicate: result.wasDuplicate,
  };
  return apiV1Json(payload, { status: 201 });
}

/**
 * Spend one rate-limit budget. `true` → proceed, `false` → over the limit.
 *
 * FAILS OPEN on limiter infrastructure failure, matching every sibling limiter
 * in this repo — including on this write. The limiter is itself a DB write; if
 * `rate_limit_buckets` is unavailable, refusing would stop every owner in the
 * country fixing a record over an abuse control, while the authorization
 * boundary stays intact and fails CLOSED. That is the one that must.
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
    reportError(`api-v1-amend/${endpoint}`, err);
    return true;
  }
}

/** The 503 this endpoint answers for every degraded pre-write read. */
function unavailable() {
  return apiV1Error("temporarily_unavailable", 503, {
    "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
  });
}

/**
 * The liveness guard's refusals, mapped to the SAME statuses and codes every
 * sibling on this surface uses.
 *
 * `DEACTIVATED` is a refusal here and not a tolerated read: this is a WRITE, and
 * "reads stay open so the user can see why; writes stop" is the repo's policy
 * since the 2026-07-04 redirect incident.
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
