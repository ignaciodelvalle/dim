// Every `/api/v1` call this app makes, in one file.
//
// Not because a file per endpoint would be wrong, but because the set is small
// enough that seeing it whole is worth more than seeing it sorted: a reader
// asking "what can this app do to my account" should get the answer in one
// screen rather than by walking a directory.
//
// THE COUNT OF WRITES USED TO LIVE IN THIS HEADER AND IT NO LONGER DOES, which
// is worth recording rather than quietly deleting. The sentence read "THREE of
// them are writes, and the count is kept in this sentence on purpose … if a
// fourth write appears, this line is where a reviewer notices." Two more
// appeared — `sendLostCommand` and `sendShareCommand` — and each announced
// itself in its OWN docblock as "the fourth write" and "the fifth" while this
// paragraph went on saying three. A number in prose has to be edited every time
// something crosses, nothing fails when it is not, and by the time a sixth
// arrived the header was contradicting three separate comments below it.
//
// What the header keeps instead is the CLAIM the count was standing in for, and
// this one is checkable by reading the file rather than by trusting a number:
//
//   NOT EVERY WRITE HERE IS ABOUT AN ANIMAL. `signup` creates an ACCOUNT — the
//   only call on this surface that mutates something before there is a session
//   to mutate it with, and the only one whose success may legitimately hand
//   back nothing to sign in with (see its own docblock). It sits beside
//   `login` at the top for that reason: the two pre-authentication calls are
//   the ones a reader asking "what can this app do before I trust it" needs
//   first.
//
//   THE PET WRITES ARE NOT ALL APPENDS, AND A READER MUST NOT ASSUME THEY ARE.
//   `registerPet`, `recordPetEvent` and `amendPetEvent` are pure INSERTs onto
//   the append-only spine — a correction is a new event, never an edit. The
//   other three are not: `sendLostCommand` moves `pets.status` and opens and
//   closes a case, `sendShareCommand` mints and revokes bearer tokens and moves
//   two columns, and `sendTransferCommand` can change WHO OWNS AN ANIMAL. The
//   append-only invariant holds where it applies; it is not a description of
//   this whole file.
//
// HOW MANY ASIENTOS `recordPetEvent` CAN WRITE IS NOT COUNTED ANYWHERE HERE,
// and it used to be — "one of the six", while the union held ten. A number in
// prose has to be edited every time a kind crosses and nothing fails when it is
// not, so it drifts silently and then misleads the next reader. The union in
// `@dim/contract/input` is the count; this file's business is that there is ONE
// call for all of them.
//
// Everything here is a thin wrapper over `apiRequest` / `performRequest`. No
// endpoint may add its own retry, its own error copy, or its own session
// handling — those live in `client.ts` exactly once, and a second copy is how
// two screens end up disagreeing about what a 401 means.

import {
  type CaretakerCommandAckV1,
  type EventAmendedV1,
  type EventRecordedV1,
  LOCALITIES_PAYLOAD_VERSION,
  type LocalitiesV1,
  type LoginV1,
  type LostCommandAckV1,
  ME_PAYLOAD_VERSION,
  MY_CARETAKER_GRANTS_PAYLOAD_VERSION,
  MY_NOTIFICATIONS_PAYLOAD_VERSION,
  MY_PETS_PAYLOAD_VERSION,
  MY_TRANSFERS_PAYLOAD_VERSION,
  type MeV1,
  type MyCaretakerGrantsV1,
  type MyNotificationsV1,
  type MyPetsV1,
  type MyTransfersV1,
  type NotificationCommandAckV1,
  OWNER_PET_DETAIL_PAYLOAD_VERSION,
  type OwnerPetDetailV1,
  PET_EVENT_DETAIL_PAYLOAD_VERSION,
  PET_LIBRETA_PAYLOAD_VERSION,
  PET_LOST_PAYLOAD_VERSION,
  PET_SHARES_PAYLOAD_VERSION,
  type PasswordResetRequestedV1,
  type PetEventDetailV1,
  type PetLibretaV1,
  type PetLostV1,
  type PetPhotoTicketV1,
  type PetPhotoUpdatedV1,
  type PetRegisteredV1,
  type PetSharesV1,
  type ShareCommandAckV1,
  type SignupV1,
  type TransferCommandAckV1,
} from "@dim/contract/api";
import type {
  AmendEventInput,
  CaretakerCommandInput,
  LostCommandInput,
  NotificationCommandInput,
  PetPhotoContentType,
  RecordEventInput,
  RegisterPetInput,
  ShareCommandInput,
  TransferCommandInput,
} from "@dim/contract/input";

import { type ApiResult, type SessionPort, apiRequest, performRequest } from "./client";
import { apiV1ErrorCode } from "./error-copy";

/**
 * `POST /auth/login`. NOT a bearer call — it is what produces the bearer.
 *
 * It therefore uses `performRequest` directly and interprets its own result:
 * routing it through `apiRequest` would ask the session port for a token that
 * by definition does not exist yet, and would end a session nobody has.
 */
export async function login(input: {
  email: string;
  password: string;
}): Promise<ApiResult<LoginV1>> {
  const raw = await performRequest({
    path: "/api/v1/auth/login",
    method: "POST",
    body: { email: input.email, password: input.password },
  });

  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 200) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  return { outcome: "ok", payload: raw.body as LoginV1 };
}

/**
 * `POST /auth/signup` — step 1 of the two-step signup, and the second call on
 * this surface that is not a bearer call because it is what MAKES one.
 *
 * `performRequest` directly, for `login`'s reason: routing it through
 * `apiRequest` would ask the session port for a token that by definition does
 * not exist yet, and would end a session nobody has.
 *
 * 201 IS THE ONLY SUCCESS, AND IT MAY CARRY NO SESSION. `SignupV1.session` is
 * nullable and BOTH cases are normal — a genuine new account (email
 * confirmations OFF, PO decision 2026-07-10) gets one, and the
 * account-enumeration masquerade for an email that already exists returns this
 * same 201 with `session: null`. A caller MUST read the null as "go to the
 * login screen", never as an error, and must never turn it into copy that says
 * the account exists: that copy would rebuild on the phone the oracle audit
 * 28-#3 closed on the web form.
 *
 * NO `Idempotency-Key`, AND THE ENDPOINT ASKS FOR NONE. What protects a double
 * submit is GoTrue's unique email: the second POST cannot mint a second
 * account. It is NOT the same promise the write endpoints make, and the
 * difference is visible to the caller — the second response is the masquerade,
 * `session: null`, indistinguishable from a duplicate-email refusal. So a
 * client that retries a signup after a timeout may be handed "go sign in" for
 * an account it just created a second ago. That is the correct instruction in
 * both readings, which is why the endpoint needs no key; it is stated here
 * because "no idempotency key" usually means "retry freely" and here it means
 * "retry and then sign in".
 */
export async function signup(input: {
  email: string;
  password: string;
  confirmPassword: string;
  tosAccepted: boolean;
}): Promise<ApiResult<SignupV1>> {
  const raw = await performRequest({
    path: "/api/v1/auth/signup",
    method: "POST",
    body: input,
  });

  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 201) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  return { outcome: "ok", payload: raw.body as SignupV1 };
}

/**
 * `POST /auth/password-reset` — ask for a recovery credential by e-mail.
 *
 * THE THIRD CALL ON THIS SURFACE THAT IS NOT A BEARER CALL, and the only one
 * that does not make a bearer either. `performRequest` directly, for `login`'s
 * reason: routing it through `apiRequest` would ask the session port for a token
 * that by definition does not exist — somebody using this is locked out.
 *
 * 202 IS THE ONLY SUCCESS AND IT MEANS NOTHING ABOUT THE ADDRESS. The body is a
 * constant, identical for an e-mail that has an account and one that does not,
 * because the server never learns which it was (see `PasswordResetRequestedV1`).
 * A caller MUST NOT branch on it, must not "helpfully" report that no account was
 * found, and must not treat the absence of a mail as an error — doing any of
 * those rebuilds on the phone the enumeration oracle the server refuses to be.
 *
 * THE PAYLOAD IS RETURNED AND NOTHING READS IT, deliberately. Dropping it to
 * `ApiResult<void>` would be a truthful description of today and a trap
 * tomorrow: the field that gets added to make it useful is the field that makes
 * it an oracle. Keeping the type is what makes that visible in a diff.
 *
 * WHAT COMES NEXT IS NOT AN ENDPOINT. The redemption goes to GoTrue directly —
 * `verifyOtp` then `updateUser` — because the loop cannot close through a link on
 * a device with no verified App Links. `session-store.ts`'s `resetPasswordWithCode`
 * is where that is written out.
 */
export async function requestPasswordReset(input: {
  email: string;
}): Promise<ApiResult<PasswordResetRequestedV1>> {
  const raw = await performRequest({
    path: "/api/v1/auth/password-reset",
    method: "POST",
    body: { email: input.email },
  });

  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 202) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  return { outcome: "ok", payload: raw.body as PasswordResetRequestedV1 };
}

/** `GET /me` — the four-field shell. No email, no DNI, no pets. */
export function fetchMe(session: SessionPort): Promise<ApiResult<MeV1>> {
  return apiRequest<MeV1>(
    { path: "/api/v1/me", expectedPayloadVersion: ME_PAYLOAD_VERSION },
    session,
  );
}

/** `GET /me/pets` — the owner's list, possibly truncated. */
export function fetchMyPets(session: SessionPort): Promise<ApiResult<MyPetsV1>> {
  return apiRequest<MyPetsV1>(
    { path: "/api/v1/me/pets", expectedPayloadVersion: MY_PETS_PAYLOAD_VERSION },
    session,
  );
}

/**
 * `GET /pets/{publicToken}` — the OWNER face of one animal.
 *
 * NOT the credential. `/pets/{token}/credential` is anonymous and renders the
 * same for the owner and for a stranger who scanned the QR; this is what the
 * person responsible for the animal sees, and it needs a bearer. The two live
 * side by side on the screen for exactly that reason.
 */
export function fetchOwnerPetDetail(
  session: SessionPort,
  publicToken: string,
): Promise<ApiResult<OwnerPetDetailV1>> {
  return apiRequest<OwnerPetDetailV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}`,
      expectedPayloadVersion: OWNER_PET_DETAIL_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `GET /pets/{publicToken}/libreta` — the pet's health record.
 *
 * THE THIRD FACE. `/pets/{token}` is the owner's chrome, `/credential` is the
 * public front, and this is the back: the ledger of asientos, what is coming
 * due, and the vaccination summary. The web calls them "Credencial · frente"
 * and "Libreta · dorso" in the band above the card.
 *
 * NO ATTACHMENT URLS COME BACK, by design — an entry says whether it carries a
 * file. `fetchPetEventDetail` is what hands one over, with an expiry.
 */
export function fetchPetLibreta(
  session: SessionPort,
  publicToken: string,
): Promise<ApiResult<PetLibretaV1>> {
  return apiRequest<PetLibretaV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/libreta`,
      expectedPayloadVersion: PET_LIBRETA_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `GET /pets/{publicToken}/events/{eventId}` — one asiento, in full.
 *
 * THE ONE READ WHOSE ANSWER EXPIRES. Its attachments carry short-lived signed
 * URLs, each stamped with the instant it stops working. A caller must not stash
 * this payload past that instant, and this app does not: it lives in a screen's
 * state and dies with the screen.
 */
export function fetchPetEventDetail(
  session: SessionPort,
  publicToken: string,
  eventId: string,
): Promise<ApiResult<PetEventDetailV1>> {
  return apiRequest<PetEventDetailV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/events/${encodeURIComponent(eventId)}`,
      expectedPayloadVersion: PET_EVENT_DETAIL_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `POST /pets/{publicToken}/events` — record one asiento.
 *
 * ONE CALL FOR EVERY KIND, because the endpoint is one: `pet_events` is a
 * single append-only table discriminated by `event_type`, and
 * `RecordEventInput` is a discriminated union over exactly that. A wrapper per
 * kind would be a pile of functions that differ only in a string.
 *
 * `idempotencyKey` is REQUIRED by the type because the server requires it, and
 * it is scoped to one form MOUNT — see `pets/idempotency.ts` for why a fresh key
 * per HTTP attempt would opt out of the failure the header exists for, and for
 * what that scoping costs when someone edits and resends.
 */
export function recordPetEvent(
  session: SessionPort,
  publicToken: string,
  input: RecordEventInput,
  idempotencyKey: string,
): Promise<ApiResult<EventRecordedV1>> {
  return apiRequest<EventRecordedV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/events`,
      method: "POST",
      body: input,
      headers: { "idempotency-key": idempotencyKey },
    },
    session,
  );
}

/**
 * `POST /pets/{publicToken}/events/{eventId}/amend` — correct a record.
 *
 * IT CORRECTS BY APPENDING. The original stays in the ledger forever; this adds
 * a new event that supersedes it, and every reader projects the corrected value.
 * There is no edit and no delete, here or anywhere.
 *
 * `idempotencyKey` is REQUIRED by the type because the server requires it: a
 * missing or malformed header is a 400 `idempotency_key_required`. It is scoped
 * to one correction ATTEMPT and reused across every retry of that attempt — see
 * `pets/idempotency.ts`, which explains why a fresh key per HTTP attempt would
 * opt out of the exact failure the header exists for.
 */
export function amendPetEvent(
  session: SessionPort,
  target: { publicToken: string; eventId: string },
  input: AmendEventInput,
  idempotencyKey: string,
): Promise<ApiResult<EventAmendedV1>> {
  return apiRequest<EventAmendedV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(target.publicToken)}/events/${encodeURIComponent(
        target.eventId,
      )}/amend`,
      method: "POST",
      body: input,
      headers: { "idempotency-key": idempotencyKey },
    },
    session,
  );
}

/**
 * `GET /localities` — public typeahead.
 *
 * The server answers `results: []` for a query under two characters rather than
 * refusing, so this wrapper does NOT pre-filter: a client that decides for
 * itself when a query is "long enough" has forked the rule, and the day the
 * server relaxes it the app would still be enforcing the old one. The screen
 * skips the CALL for short input (a network round trip per keystroke is its own
 * problem), which is a different decision and lives at the call site.
 *
 * Public, so no bearer and no session port — the same reasoning as `login`.
 */
export async function searchLocalities(query: {
  q: string;
  province?: string;
}): Promise<ApiResult<LocalitiesV1>> {
  const params = new URLSearchParams({ q: query.q });
  if (query.province) params.set("province", query.province);

  const raw = await performRequest({ path: `/api/v1/localities?${params.toString()}` });
  if (raw.transport === "unreachable") return { outcome: "unreachable", detail: raw.detail };
  if (raw.transport === "malformed") return { outcome: "malformed", detail: raw.detail };
  if (raw.status !== 200) {
    return {
      outcome: "api-error",
      code: apiV1ErrorCode(raw.body) ?? "temporarily_unavailable",
      retryAfterSeconds: raw.retryAfterSeconds,
    };
  }
  const payload = raw.body as LocalitiesV1;
  if (payload?.payloadVersion !== LOCALITIES_PAYLOAD_VERSION) {
    return {
      outcome: "unsupported-version",
      received: typeof payload?.payloadVersion === "number" ? payload.payloadVersion : null,
    };
  }
  return { outcome: "ok", payload };
}

/**
 * `POST /pets` — the one write this app makes.
 *
 * `idempotencyKey` is REQUIRED by the type because it is required by the server:
 * a missing or malformed header is a 400 `idempotency_key_required`, not a
 * best-effort. The key is generated once per attempt-session and reused across
 * every retry of the same attempt — see `pets/idempotency.ts` for why that
 * matters more here than on most write endpoints.
 */
export function registerPet(
  session: SessionPort,
  input: RegisterPetInput,
  idempotencyKey: string,
): Promise<ApiResult<PetRegisteredV1>> {
  return apiRequest<PetRegisteredV1>(
    {
      path: "/api/v1/pets",
      method: "POST",
      body: input,
      headers: { "idempotency-key": idempotencyKey },
    },
    session,
  );
}

/**
 * `POST /me/revoke-sessions`.
 *
 * A 200 MEANS THE CALLER IS SIGNED OUT TOO, and that is not obvious from the
 * name. GoTrue rejects the access token immediately and the refresh comes back
 * `refresh_token_not_found` — measured, not assumed. So the caller must drop its
 * tokens and go to sign-in; it must NOT try to refresh, because the refresh is
 * guaranteed to fail and its failure would be reported as "your session
 * expired", which reads like a bug instead of like the thing the user just
 * asked for.
 */
export function revokeAllSessions(session: SessionPort): Promise<ApiResult<{ revoked: true }>> {
  return apiRequest<{ revoked: true }>(
    { path: "/api/v1/me/revoke-sessions", method: "POST" },
    session,
  );
}

/**
 * `GET /pets/{publicToken}/lost` — the owner's lost-mode cockpit.
 *
 * ONE READ FOR A FEATURE THE WEB SPREADS ACROSS TWO PLACES: the mark-lost /
 * update page and the `LostCaseBlock` on the profile. It carries the episode,
 * the sightings feed, the disclosure settings, and — the part a client must not
 * recompute — WHICH of the state commands this caller may send.
 *
 * THE FEED IT CARRIES IS ALREADY FILTERED. An item somebody reported is simply
 * absent; there is no moderation flag on the wire and nothing for a client to
 * reconcile, because the reported row is never modified — see `pet-lost.ts`.
 */
export function fetchPetLostMode(
  session: SessionPort,
  publicToken: string,
): Promise<ApiResult<PetLostV1>> {
  return apiRequest<PetLostV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/lost`,
      expectedPayloadVersion: PET_LOST_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `POST /pets/{publicToken}/lost` — run one lost-mode command.
 *
 * THE FOURTH WRITE ON THIS SURFACE, which the count in this file's header
 * deliberately no longer states — but it is worth saying what KIND of write it
 * is, because it is the first one that is not an append: these six move
 * `pets.status`, open and close a case, publish or unpublish an owner's own
 * contact details, and take a stranger's message off the owner's feed. The
 * append-only invariant still holds where it applies — the spine gets
 * `status_changed`, `note_added` and `content_reported` rows, and NOTHING is
 * edited, the reported item least of all — but a reader should not read "write"
 * here and assume "asiento".
 *
 * `idempotencyKey` IS NULLABLE, AND THAT IS THE CONTRACT AND NOT A SHORTCUT.
 * Only `report_last_seen`'s writer takes a `clientIdempotencyKey`, because two
 * sightings minutes apart are two facts. The endpoint requires the header for
 * that one and does not read it for the other five, whose writers are idempotent
 * on the STATE — including `report_content`, which appends and still needs none,
 * since an item already reported is not reported twice. Sending a key the server
 * would ignore is not harmless: it is a client believing it holds a guarantee it
 * does not.
 */
export function sendLostCommand(
  session: SessionPort,
  publicToken: string,
  input: LostCommandInput,
  idempotencyKey: string | null,
): Promise<ApiResult<LostCommandAckV1>> {
  return apiRequest<LostCommandAckV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/lost`,
      method: "POST",
      body: input,
      headers: idempotencyKey === null ? undefined : { "idempotency-key": idempotencyKey },
    },
    session,
  );
}

/**
 * `GET /pets/{publicToken}/shares` — who else can see this animal's record.
 *
 * THE ONE READ ON THIS SURFACE THAT CARRIES BEARER SECRETS. Each active share
 * link comes back with its `shareToken`, which reads the animal's medical record
 * for whoever holds it. The contract's `pet-shares.ts` states the rules at
 * length; the one that binds a CALLER is: this payload is not cached, not
 * logged, and not echoed into an error. It belongs in a screen's state and dies
 * with the screen — the line `LibretaScreen` already draws, with a credential on
 * top.
 */
export function fetchPetShares(
  session: SessionPort,
  publicToken: string,
): Promise<ApiResult<PetSharesV1>> {
  return apiRequest<PetSharesV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/shares`,
      expectedPayloadVersion: PET_SHARES_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `POST /pets/{publicToken}/shares` — run one sharing command.
 *
 * THE FIFTH WRITE ON THIS SURFACE, and the first that touches no spine at all.
 * `create_libreta_share` inserts into `libreta_share_tokens`;
 * `revoke_libreta_share` flips `revoked_at`; the two Tier-2 commands move two
 * columns on `pets`. Nothing is appended and nothing is edited that was ever a
 * FACT — an exposure is not an asiento — so the append-only invariant is
 * untouched rather than bent.
 *
 * NO `idempotencyKey` PARAMETER, AND THAT IS THE CONTRACT AND NOT A SHORTCUT.
 * None of the four writers takes a `clientIdempotencyKey`; all four are
 * idempotent on the STATE instead, and three of them recognise a replay and
 * report it as `changed: false`. Requiring a header the server would ignore is
 * a client believing it holds a guarantee it does not — the same refusal
 * `writers.ts` makes for atestación PPP and embarazo.
 */
export function sendShareCommand(
  session: SessionPort,
  publicToken: string,
  input: ShareCommandInput,
): Promise<ApiResult<ShareCommandAckV1>> {
  return apiRequest<ShareCommandAckV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/shares`,
      method: "POST",
      body: input,
    },
    session,
  );
}

/**
 * `GET /me/transfers` — THE ONE READ ON THIS SURFACE THAT IS NOT ABOUT A PET.
 *
 * Every other authenticated read here takes a `publicToken`, because it is about
 * one animal. This one takes none, and it cannot: half of what it returns is
 * about animals this caller does NOT own — a transfer proposal is an offer from
 * somebody else's pet. There is no token that would name the read.
 *
 * It is also the read that feeds the deep link `mimar://transferencias/{token}`.
 * The detail screen selects its row out of these three lists rather than calling
 * a second endpoint: the union of `incoming` and `outgoing` is exactly the set a
 * caller is authorized to see, so a proposal that is not in it is one this
 * person may not read, and the screen says so without a round trip.
 */
export function fetchMyTransfers(session: SessionPort): Promise<ApiResult<MyTransfersV1>> {
  return apiRequest<MyTransfersV1>(
    { path: "/api/v1/me/transfers", expectedPayloadVersion: MY_TRANSFERS_PAYLOAD_VERSION },
    session,
  );
}

/**
 * `POST /me/transfers` — run one of the four transfer commands.
 *
 * THE SIXTH WRITE ON THIS SURFACE, and the first that can change WHO OWNS AN
 * ANIMAL. `accept` closes the sender's `ownerships` row, opens the caller's,
 * appends a `custody_transferred` asiento to the spine and ends any live
 * caretaker arrangement — one transaction, four tables. The append-only
 * invariant holds where it applies; a reader should not read "write" here and
 * assume "asiento".
 *
 * NO `idempotencyKey` PARAMETER, AND THAT IS THE CONTRACT AND NOT A SHORTCUT.
 * None of the four writers takes a `clientIdempotencyKey`. What they have —
 * a partial unique index for `initiate`, an `expectedStatus` guard for the other
 * three — REFUSES a replay instead of absorbing one, which is a different
 * promise: after a timeout, `transfer_already_resolved` may mean the first
 * attempt landed OR that the other party moved first. A caller must re-read;
 * `@dim/contract/input`'s `transfer.ts` states it at length.
 */
export function sendTransferCommand(
  session: SessionPort,
  input: TransferCommandInput,
): Promise<ApiResult<TransferCommandAckV1>> {
  return apiRequest<TransferCommandAckV1>(
    { path: "/api/v1/me/transfers", method: "POST", body: input },
    session,
  );
}

/**
 * `GET /me/caretaker-grants` — the SECOND read on this surface that is not about
 * a pet this caller holds, and the reason is the same shape as the first's.
 *
 * Half of what it returns is invitations to look after somebody ELSE'S animal, so
 * there is no token that would name the read. It feeds two screens: the titular's
 * per-pet cockpit, which filters `outgoing` down to one animal, and the deep-link
 * destination `mimar://cuidado/{CG-…}`, which selects its row out of the union.
 *
 * IT CARRIES OPEN GRANTS ONLY — `pending` and `accepted`. A token that is not in
 * the payload is NOT proof the token is fake: an invitation that was answered,
 * withdrawn or swept is absent for the same reason. The screen's copy says both
 * possibilities out loud rather than picking one.
 */
export function fetchMyCaretakerGrants(
  session: SessionPort,
): Promise<ApiResult<MyCaretakerGrantsV1>> {
  return apiRequest<MyCaretakerGrantsV1>(
    {
      path: "/api/v1/me/caretaker-grants",
      expectedPayloadVersion: MY_CARETAKER_GRANTS_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `POST /me/caretaker-grants` — run one of the five cuidador-temporal commands.
 *
 * FIVE AND NOT SEVEN, and the two that are missing are worth knowing about here:
 * `withdraw` (a caretaker stepping down) and `return` are not reachable from the
 * web, so they are not on this surface either. A phone that could end an
 * arrangement a browser cannot is not parity.
 *
 * NOT ALL FIVE ARE APPENDS. `accept` opens an `ownerships` row and appends
 * `caretaker_designated`; `revoke` closes that row and appends `caretaker_ended`.
 * The other three move workflow state and touch the spine not at all — a pending
 * invitation is not a fact about the animal.
 *
 * NO `idempotencyKey` PARAMETER, AND THAT IS THE CONTRACT AND NOT A SHORTCUT.
 * None of the five writers takes a `clientIdempotencyKey`. What they have — two
 * partial unique indexes for `designate`, a locked re-read or an `expectedStatus`
 * guard for the rest — REFUSES a replay instead of absorbing one, which is a
 * different promise: after a timeout, `caretaker_already_resolved` may mean the
 * first attempt landed OR that the other party moved first. A caller must
 * re-read; `@dim/contract/input`'s `caretaker.ts` states it at length.
 */
export function sendCaretakerCommand(
  session: SessionPort,
  input: CaretakerCommandInput,
): Promise<ApiResult<CaretakerCommandAckV1>> {
  return apiRequest<CaretakerCommandAckV1>(
    { path: "/api/v1/me/caretaker-grants", method: "POST", body: input },
    session,
  );
}

/**
 * `GET /me/notifications` — the inbox, one page of it plus the tab counts.
 *
 * THE THIRD READ ON THIS SURFACE THAT IS NOT ABOUT A PET, and the one where the
 * reason is plainest: a notification is addressed to a PERSON. Many are about an
 * animal, several are about an animal the caller no longer holds — that is what
 * `pet_transfer_accepted` IS — and some are about no animal at all.
 *
 * THE ARRAY IS NOT IN DISPLAY ORDER and must not be rendered as it arrives. It
 * comes back chronological, because that is the order the server's cursor is
 * derived from; the severity-first order a reader sees is
 * `@dim/contract/notifications`, the same function the web page calls. See
 * `notifications-view-model.ts`, which is the only place in this app that sorts.
 *
 * `cat` IS THE WEB'S OWN PARAMETER and an unknown value falls back to the whole
 * inbox rather than erroring — a filter is a view, not an assertion.
 */
export function fetchMyNotifications(
  session: SessionPort,
  category?: string | null,
): Promise<ApiResult<MyNotificationsV1>> {
  const suffix = category ? `?cat=${encodeURIComponent(category)}` : "";
  return apiRequest<MyNotificationsV1>(
    {
      path: `/api/v1/me/notifications${suffix}`,
      expectedPayloadVersion: MY_NOTIFICATIONS_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `POST /me/notifications` — run one of the three inbox commands.
 *
 * THE CHEAPEST WRITE ON THIS SURFACE, and the only one that touches no domain
 * fact at all: `read_at` and `archived_at` on the caller's own rows. Nothing is
 * appended, nothing is derived from it, and no re-derivation could reconstruct
 * it — a read receipt is a fact about a person's inbox, not about an animal.
 *
 * NO `idempotencyKey` PARAMETER, AND HERE THAT IS A STRONGER PROMISE RATHER THAN
 * A WEAKER ONE. All three commands are idempotent on the STATE — a row already
 * read is not read twice — and each says so through `changed`. There is nothing
 * a key would add, and sending one the server ignores is a client believing it
 * holds a guarantee nobody made.
 *
 * `unreadCount` CAN COME BACK `null` ON A SUCCESS. The badge is re-read after
 * the write commits, so a pooler that degrades in between leaves the endpoint
 * holding a write that landed and a count it cannot compute. A caller must read
 * `null` as "your tap worked, the badge is stale" and NOT retry the command.
 */
export function sendNotificationCommand(
  session: SessionPort,
  input: NotificationCommandInput,
): Promise<ApiResult<NotificationCommandAckV1>> {
  return apiRequest<NotificationCommandAckV1>(
    { path: "/api/v1/me/notifications", method: "POST", body: input },
    session,
  );
}

/**
 * `POST /pets/{publicToken}/photo` — step 1 of 3. Ask for an upload ticket.
 *
 * THE FIRST WRITE ON THIS SURFACE THAT DOES NOT END WITH THE SERVER HOLDING THE
 * DATA. It hands back a bearer capability to write ONE object into a private
 * staging bucket; `uploadPetPhotoBytes` spends it, and `confirmPetPhoto` is what
 * turns the result into the animal's photo. Until that third call succeeds
 * NOTHING has changed — a client that shows "listo" after this one is lying.
 *
 * DO NOT PERSIST THE TICKET. Not to AsyncStorage, not to a log, not into a
 * crash report. The rule `pet-shares.ts` states for share tokens applies here
 * for the same reason: it is a credential, and it belongs in the upload call it
 * was minted for.
 */
export function requestPetPhotoTicket(
  session: SessionPort,
  publicToken: string,
  contentType: PetPhotoContentType,
): Promise<ApiResult<PetPhotoTicketV1>> {
  return apiRequest<PetPhotoTicketV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/photo`,
      method: "POST",
      body: { command: "request_ticket", contentType },
    },
    session,
  );
}

/**
 * Step 2 of 3. PUT the bytes to the ticket's URL — NOT to `/api/v1`.
 *
 * THE ONE CALL IN THIS FILE THAT DOES NOT GO THROUGH `apiRequest`, and the
 * exception is deliberate rather than a shortcut. Everything `apiRequest` does
 * is wrong here: there is no bearer to attach (the capability is in the URL),
 * there is no `{ error }` envelope to interpret (Supabase Storage speaks its
 * own), there is no `payloadVersion` to gate, and a 401 from the object store
 * means the ticket expired — NOT that the account's session is over. Routing
 * this through the session layer would sign a user out because a two-hour-old
 * upload URL went stale, which is the exact class of bug `client.ts`'s header
 * describes for `session_shift_expired`.
 *
 * So it reports its own outcome, in three arms, and the caller decides:
 *   · `ok`        — the bytes are staged. Call `confirmPetPhoto` next.
 *   · `expired`   — the ticket is no longer valid. Re-ticket; do not sign out.
 *   · `failed`    — anything else, including no signal. Retry with the same
 *                   ticket is safe (nothing has been claimed).
 *
 * `body` is a `Blob`. React Native's `fetch` handles a Blob from
 * `expo-file-system` or a picker without the FormData workaround
 * `@supabase/storage-js` warns about, because there is no multipart envelope
 * here — the signed upload endpoint takes the raw bytes.
 */
export type PetPhotoUploadOutcome =
  | { outcome: "ok" }
  | { outcome: "expired" }
  | { outcome: "failed"; detail: string };

export async function uploadPetPhotoBytes(
  ticket: PetPhotoTicketV1,
  body: Blob,
  contentType: PetPhotoContentType,
): Promise<PetPhotoUploadOutcome> {
  try {
    const response = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
    if (response.ok) return { outcome: "ok" };
    // 400 is what the Storage API answers for an expired or already-spent
    // signed upload token; 401/403 for a malformed one. All of them mean "this
    // ticket is done", and none of them means "this account is done".
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { outcome: "expired" };
    }
    return { outcome: "failed", detail: `HTTP ${response.status}` };
  } catch (error) {
    return { outcome: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Step 3 of 3. Ask the server to accept the staged bytes as the animal's photo.
 *
 * THE SERVER RE-AUTHORIZES AND RE-VALIDATES HERE, which is why `stagedPath` may
 * be sent back as-is: it is a claim, not a capability. The server refuses any
 * key that does not belong to the pet in the URL, refuses bytes that are not a
 * JPEG/PNG/WebP by their magic bytes rather than by what the ticket declared,
 * and re-encodes what survives before it reaches the public bucket.
 *
 * NO IDEMPOTENCY KEY, and none is needed: this sets a value rather than
 * appending a row, so a retry after a timeout that in fact landed sets the same
 * photo again. That makes it the one write on this surface a client may retry
 * blind.
 */
export function confirmPetPhoto(
  session: SessionPort,
  publicToken: string,
  stagedPath: string,
): Promise<ApiResult<PetPhotoUpdatedV1>> {
  return apiRequest<PetPhotoUpdatedV1>(
    {
      path: `/api/v1/pets/${encodeURIComponent(publicToken)}/photo`,
      method: "POST",
      body: { command: "confirm", stagedPath },
    },
    session,
  );
}
