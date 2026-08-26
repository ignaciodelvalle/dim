// The `/api/v1` error vocabulary.
//
// WHY IT LIVES IN THE CONTRACT PACKAGE (api-invariants.md §8, D2)
// ---------------------------------------------------------------------------
// Three casings are already in play across the repo — `SCREAMING_SNAKE` in
// packages/contract/src/input and lib/infra/live-user.ts, `kebab-case` in
// lib/infra/pet-access.ts, `lowercase_snake` in every `app/api/**` handler.
// D2 picked `lowercase_snake`: it is what all 34 existing handlers already
// emit, so `/api/v1` speaks the same language as the surface a native app also
// talks to. The other two islands stay where they are; converting them is
// mechanical and must not gate the first endpoint.
//
// It lives HERE and not next to the route because `packages/contract` is the
// only thing a React Native app can install. An error code a client cannot
// import is an error code a client will hard-code and mistype.
//
// WHAT THIS IS NOT. It is not a repair of `UseCaseResult`'s failure arm, which
// is an untyped `string` carrying Spanish prose in most of the ten module
// copies (api-invariants.md §3). That is the real cost hiding inside "just wrap
// the existing use-cases", and the first `/api/v1` WRITE endpoint is blocked on
// it. Reads are not, which is why this list is short.

/**
 * Every error code a `/api/v1` endpoint may return.
 *
 * Deliberately small and shared rather than per-route: a native client should
 * be able to write one exhaustive `switch` over the failure space, and each new
 * code is a decision someone makes in this file, in the open.
 *
 * - `rate_limited`            — over a rate limit. The response says nothing
 *                               about whether the requested resource exists.
 * - `not_found`               — the identifier resolves to nothing the caller
 *                               may see. Never distinguishes "never existed"
 *                               from "erased" (Ley 25.326 art. 16 / PO-4).
 * - `temporarily_unavailable` — a read failed or exceeded its time budget. NOT
 *                               `not_found`: a database outage is not "this
 *                               thing does not exist", and answering 404 to it
 *                               is the worst lie a public surface can tell.
 *
 * THE AUTH CODES (WU-A). Added with the first bearer-authenticated endpoint;
 * the list is no longer read-only, so the "READ endpoint" framing above is now
 * "endpoint". Each one is a 401/403/400 a native client must be able to
 * `switch` on WITHOUT a redirect to look at — there is no browser to redirect
 * (ADR 2026-07-18, Decision 3).
 *
 * - `auth_required`       — no `Authorization` header at all. Distinct from
 *                           `auth_expired` because it means "you were never
 *                           authenticated", which is a client BUG (it forgot
 *                           the header) rather than the ordinary end of a
 *                           session. Answering both the same way is how a
 *                           refresh loop gets written for a request that never
 *                           carried a token.
 * - `auth_expired`        — a token was presented and did not resolve to a
 *                           user: expired, revoked, malformed, or for another
 *                           project. The client's move is to refresh (against
 *                           GoTrue — see `AuthSessionV1`) and retry once.
 *                           Deliberately does NOT distinguish "expired" from
 *                           "malformed" on the wire: the difference is a
 *                           debugging convenience for us and a probe for
 *                           everyone else.
 * - `invalid_credentials` — the email/password pair was refused. ONE code for
 *                           "no such account" and "wrong password", and the two
 *                           responses must stay byte-identical, or this
 *                           endpoint becomes the account-enumeration oracle
 *                           that audit 28-#3 closed on the signup form.
 * - `account_deactivated` — an institutional account an operator switched off.
 *                           Reached only AFTER correct credentials, so it
 *                           discloses nothing to someone who does not already
 *                           hold them.
 * - `account_erased`      — the subject exercised erasure (Ley 25.326 art. 16)
 *                           and the token outlived the account. Same: only ever
 *                           told to the holder of that account's own token.
 * - `session_shift_expired`
 *                         — the caller is an INSTITUTIONAL principal (govt,
 *                           admin, or org staff) whose 8-hour operator shift ran
 *                           out (B9). 401.
 *
 *                           IT EARNS ITS OWN CODE BY THE ONLY BAR THIS FILE
 *                           APPLIES: the client's move is different, and getting
 *                           it wrong loops forever. `auth_expired` means "refresh
 *                           and retry once", and a refresh here SUCCEEDS — the
 *                           session is perfectly valid at GoTrue, the shift is
 *                           OUR policy — so the retry is refused again, refreshed
 *                           again, forever. This code means: discard the session
 *                           and send the user through a full credential sign-in.
 *                           It is the same trap `auth_required` was split from
 *                           `auth_expired` to avoid, in the other direction.
 *
 *                           Citizens never see it. A native wallet app has no
 *                           operator surface, so a client that cannot yet handle
 *                           it degrades to "unknown error" for a population it
 *                           does not serve.
 * - `invalid_request`     — the body did not parse against the request schema
 *                           in `@dim/contract/input`. A BACKSTOP, not the
 *                           client's error channel: the client validates with
 *                           the same schema before sending and gets per-field
 *                           codes locally, which is why this one carries no
 *                           field detail (§2 — the envelope is one key).
 * - `signup_failed`       — GoTrue refused to create the account for a reason
 *                           that is not "it already exists" (which masquerades
 *                           as success, above). Single generic code on purpose:
 *                           the raw provider text can itself hint at account
 *                           state.
 *
 * THE WRITE CODES (WU-B). `POST /api/v1/pets` is the first `/api/v1` endpoint
 * that CHANGES something, and the note above about `UseCaseResult`'s untyped
 * failure arm is exactly what these three are shaped around. Every one of them
 * is a decision a client has to be able to act on differently, which is the only
 * bar for adding a code here.
 *
 * - `idempotency_key_required`
 *                         — the `Idempotency-Key` request header was absent,
 *                           blank, or NOT A UUID on a write that requires it.
 *                           Distinct from `invalid_request` for the same reason
 *                           `auth_required` is distinct from `auth_expired`: it
 *                           is a client BUG in the ENVELOPE, not in the body, and
 *                           collapsing the two sends a developer hunting through
 *                           a body schema that was never the problem. Never
 *                           retryable as-is — the fix is to send a well-formed
 *                           header (`isValidIdempotencyKey` in `./pets` is the
 *                           same check the server runs).
 *
 *                           MALFORMED JOINED ABSENT rather than getting a code of
 *                           its own (2026-08-25, WU-B review FB-1). The bar for a
 *                           new code here is "a decision a client has to be able
 *                           to act on differently", and there is none: both mean
 *                           send a proper header. A second code would widen every
 *                           consumer's exhaustive switch to say the same sentence
 *                           twice. Before the check existed, a non-UUID key was
 *                           accepted and blew up inside the transaction as
 *                           `pet_registration_failed` — a code that tells the
 *                           caller to RETRY, which reproduced the failure forever.
 * - `duplicate_pet_suspected`
 *                         — the caller already owns an ACTIVE pet with the same
 *                           normalized name + species + sex (data-quality gate
 *                           P2). A SOFT gate: the client shows "¿es la misma?",
 *                           and a caller who means it re-sends with
 *                           `duplicateOverride: true`. Carries no detail about
 *                           WHICH pet — the client already has the list from
 *                           `GET /api/v1/me/pets` and can match on it locally,
 *                           and the envelope is one key (§2).
 * - `pet_registration_failed`
 *                         — the registration transaction itself failed. ONE
 *                           generic code because there is nothing better
 *                           available yet: the use-case's failure arm is an
 *                           untyped string carrying Spanish prose (§3), so this
 *                           endpoint genuinely cannot tell a constraint
 *                           violation from a dead connection. Putting that prose
 *                           on the wire would be worse — it is written for a web
 *                           form and can name internal constraints. A client may
 *                           retry ONCE with the SAME `Idempotency-Key`; if the
 *                           first attempt had in fact committed, the retry
 *                           resolves to it instead of creating a second animal.
 *                           When the failure arm becomes typed, this code splits
 *                           and the split happens HERE, in the open.
 *
 * THE CORRECTION CODES (WU-J). `POST /api/v1/pets/{token}/events/{id}/amend`
 * appends a correction to the append-only spine. Three codes, split by WHOSE
 * fact the refusal is about and by what the client does next — the only bar this
 * file applies.
 *
 * - `amend_forbidden`   — the CALLER may read this pet but may not write events
 *                         on it: an organization member without the
 *                         `event.write` capability. 403. Nothing the client can
 *                         retry or reword; the person needs the capability
 *                         granted, and the web says so in those words.
 * - `amend_not_allowed` — the RECORD refuses correction, whoever is asking: its
 *                         type is outside the amendable allowlist
 *                         (`death_recorded`, `incident_reported`, the rabies
 *                         observation pair and the custody flows all have their
 *                         own reversal paths or forensic weight), or the animal
 *                         is registered deceased and accepts no new events. 409.
 *
 *                         ONE code for both, deliberately: the client's move is
 *                         identical — stop offering the affordance and show the
 *                         reason — and it already HOLDS the reason, because
 *                         `PetEventDetailV1.amend.refusal` carries the es-AR
 *                         sentence for exactly these cases. Reaching this code
 *                         means the client ignored `canAmend`, and a second code
 *                         would widen every consumer's exhaustive switch to say
 *                         the same sentence twice.
 * - `amend_failed`      — the correction transaction itself failed. A client may
 *                         retry ONCE with the SAME `Idempotency-Key`; if the
 *                         first attempt had in fact committed, the retry
 *                         resolves to it instead of appending a second
 *                         correction.
 *
 *                         NARROWER THAN IT SHIPPED (2026-08-25, WU-J review
 *                         FI-7). It was the catch-all for every refusal the
 *                         use-case returned, because that failure arm was an
 *                         untyped es-AR string and 500 was the only honest thing
 *                         to say about prose. `AmendEventFailureCode` typed it,
 *                         so the caller errors inside it now answer as caller
 *                         errors and this code means what it says: an
 *                         unexpected server failure. "Retry with the same key"
 *                         is advice that only ever made sense for THAT.
 * - `amend_reason_required`
 *                       — an ADMINISTRATIVE correction (an `admin` or `govt`
 *                         profile) must state a reason of at least
 *                         `AMEND_REASON_MIN_LENGTH` characters. 400.
 *
 *                         It earns its own code by this file's only bar: the
 *                         client's move is different and specific — put the
 *                         reason field back in front of the user, required this
 *                         time — where `invalid_request` means "your body did
 *                         not parse" and sends a developer to a schema that
 *                         accepted this body correctly. It CANNOT live in the
 *                         wire schema, because the rule depends on who is
 *                         asking, and a client does not know the server's answer
 *                         about its own role until the server gives it. Citizens
 *                         never see it; an admin who personally owns a pet does.
 *
 * THE WRITER CODES (WU-K). `POST /api/v1/pets/{token}/events` records the six
 * daily asientos. The two access refusals are split by WHOSE fact they are, the
 * same split the correction codes made and for the same reason; the two date
 * refusals are split because the person's next move differs.
 *
 * - `event_forbidden`   — the CALLER holds this pet but may not write clinical
 *                         events on it: an organization member without
 *                         `event.write`. 403, and the web says the same words.
 *                         NOTE the asymmetry the web has and this mirrors: a
 *                         NOTA needs no capability, because `createNoteAction`
 *                         guards with `requirePetAccess` and not the alive
 *                         variant. An endpoint that demanded it for all six
 *                         would be narrower than the door beside it.
 * - `event_not_allowed` — the ANIMAL refuses the event, whoever is asking: its
 *                         life record is closed (`status = 'deceased'`) and the
 *                         five clinical writers append nothing to a closed
 *                         record. 409, not 403 — nothing about the caller.
 *                         A NOTA is still accepted on a deceased animal, which
 *                         is deliberate on the web and deliberate here: a
 *                         memorial note is the one thing a grieving owner may
 *                         still write.
 * - `event_date_future` — `occurredAt` is a day that has not happened yet in
 *                         ARGENTINE calendar terms. Its own code because the
 *                         fix is specific and immediate: pick today or earlier.
 * - `event_date_before_birth`
 *                       — `occurredAt` precedes the animal's registered date of
 *                         birth. A DIFFERENT fix from the one above, which is
 *                         the whole bar for a second code: either the date is
 *                         wrong or the birth date on the record is, and only the
 *                         person can say which. Collapsing the two into "revisá
 *                         la fecha" would hide the second possibility entirely.
 * - `same_day_duplicate_suspected`
 *                       — a vaccination or deworming of the same kind is already
 *                         recorded for this animal on this ARGENTINE calendar
 *                         day. A SOFT gate, exactly like `duplicate_pet_suspected`:
 *                         409, the client asks "¿registrar otra igual?", and a
 *                         caller who means it re-sends with
 *                         `sameDayOverride: true`. Two doses in one day are
 *                         unusual, not impossible, and a hard refusal would be
 *                         this endpoint claiming to know the animal better than
 *                         the person holding it.
 * - `medication_source_invalid`
 *                       — the `medicationStartedEventId` an END names is not a
 *                         `medication_started` event on THIS animal: wrong type,
 *                         wrong pet, or gone. 400. Deliberately not `not_found`,
 *                         which on this surface always means the PET — answering
 *                         404 here would tell a client its pet had vanished.
 * - `event_failed`      — the append itself failed. Same contract as
 *                         `amend_failed`: a client may retry ONCE with the SAME
 *                         `Idempotency-Key`, and if the first attempt had in fact
 *                         committed the retry resolves to it instead of writing
 *                         a second asiento.
 *
 * THE LOST-MODE CODES (WU-M). `POST /api/v1/pets/{token}/lost` runs the five
 * owner commands of the search: marcar perdida, actualizar el avistaje, marcar
 * encontrada, cambiar una preferencia de divulgación, reactivar la búsqueda.
 * FOUR of these five refusals are about the ANIMAL'S SITUATION rather than about
 * the caller or the request — a distinction worth its own codes, because each one
 * names a DIFFERENT next move and a client that collapsed them into
 * `invalid_request` would send somebody to re-read a body that was fine.
 *
 * `event_not_allowed` is REUSED for a deceased animal rather than duplicated:
 * it already means "the animal refuses this, whoever is asking, because its life
 * record is closed", and that is exactly what `setPetLostWriter` and
 * `setPetFound` say about one. A second code for the same fact would be two
 * names for one branch.
 *
 * - `lost_already`      — the animal is ALREADY marked lost, so `mark_lost` has
 *                         nothing to open. 409. The client's move is to show the
 *                         search that is already running, not to retry.
 *                         Deliberately not a silent success: an owner who
 *                         pressed it believes they just started something.
 * - `pet_not_lost`      — the command needs an animal that IS lost and this one
 *                         is not: `report_last_seen` and `reactivate_search`.
 *                         409. `mark_found` never answers it — that one writes
 *                         nothing and succeeds, because "make it not lost" is
 *                         already true.
 * - `lost_episode_closed`
 *                       — `pets.status` is `lost` and there is NO open
 *                         `lost_pet_episode`: the stale-case cron closed it
 *                         while deliberately leaving the status alone, since an
 *                         automatic sweep must never declare an animal found.
 *                         409, and its own code because the move is specific and
 *                         available: reactivate the search, then update.
 * - `lost_forbidden`    — the CALLER may hold this pet and still not do THIS.
 *                         403. Two cases, both narrowings the web performs
 *                         itself: flipping `discloseCaretakerContactWhenLost`,
 *                         which is titular-only because it is key 1 of a two-key
 *                         model; and `reactivate_search`, which
 *                         `reactivateLostSearchAction` refuses on the ORG path
 *                         alone.
 * - `lost_microchip_invalid`
 *                       — the retroactive chip number in a `mark_lost` enriched
 *                         description is not a valid microchip id. 400, and NOT
 *                         `invalid_request`: the format rule lives in
 *                         `validateMicrochipId` against a country-code table, so
 *                         a wire schema cannot express it and a client told
 *                         "your body did not parse" would go looking at the
 *                         wrong field.
 * - `lost_failed`       — the command itself failed. Same contract as
 *                         `event_failed`, minus the retry advice for the four
 *                         commands that carry no `Idempotency-Key`: those are
 *                         idempotent on the STATE, so a retry is safe by
 *                         construction rather than by header.
 */
export const API_V1_ERROR_CODES = [
  "rate_limited",
  "not_found",
  "temporarily_unavailable",
  "auth_required",
  "auth_expired",
  "invalid_credentials",
  "account_deactivated",
  "account_erased",
  "session_shift_expired",
  "invalid_request",
  "signup_failed",
  "idempotency_key_required",
  "duplicate_pet_suspected",
  "pet_registration_failed",
  "amend_forbidden",
  "amend_not_allowed",
  "amend_failed",
  "amend_reason_required",
  "event_forbidden",
  "event_not_allowed",
  "event_date_future",
  "event_date_before_birth",
  "same_day_duplicate_suspected",
  "medication_source_invalid",
  "event_failed",
  "lost_already",
  "pet_not_lost",
  "lost_episode_closed",
  "lost_forbidden",
  "lost_microchip_invalid",
  "lost_failed",
] as const;

export type ApiV1ErrorCode = (typeof API_V1_ERROR_CODES)[number];

/**
 * The error envelope every `/api/v1` failure uses (api-invariants.md §2).
 *
 * One key, always `error`. Two existing handlers deviate — `/api/health`
 * returns `{ status: "rate_limited" }` and `/api/panorama/kpis` merges the code
 * into its payload — and neither is a precedent for a new route. The second is
 * a deliberate near-miss: it is the per-section degraded prototype, and a
 * degraded READ carries this key ALONGSIDE a partial payload rather than
 * instead of one. See `PublicCredentialV1Degraded`.
 */
export type ApiV1Error = { error: ApiV1ErrorCode };
