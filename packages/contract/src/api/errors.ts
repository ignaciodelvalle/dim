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
 * - `event_forbidden`   — the CALLER holds this pet but may not write events on
 *                         it: an organization member without `event.write`.
 *                         403, and the web says the same words.
 *                         ALL ELEVEN KINDS, NOTA INCLUDED, since the PO
 *                         ratified the org ficha's `event.write` gate as the
 *                         rule (2026-08-26). It used to exempt the nota,
 *                         because `createNoteAction` guards with
 *                         `requirePetAccess` and that helper checks no
 *                         capability — so the UI refused the form and both
 *                         writers behind it accepted the write. Closing it
 *                         moved the boundary into `createNoteAction` itself,
 *                         and this endpoint mirrors that rather than being
 *                         narrower or wider than the door beside it.
 * - `event_not_allowed` — the ANIMAL refuses the event, whoever is asking: its
 *                         life record is closed (`status = 'deceased'`) and the
 *                         five clinical writers append nothing to a closed
 *                         record. 409, not 403 — nothing about the caller.
 *                         A NOTA is still accepted on a deceased animal, which
 *                         is deliberate on the web and deliberate here: a
 *                         memorial note is the one thing a grieving owner may
 *                         still write. That exemption survived the 2026-08-26
 *                         capability change above precisely because the two
 *                         codes answer different questions — one about the
 *                         caller, one about the animal.
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
 * encontrada, cambiar una preferencia de divulgación, reactivar la búsqueda,
 * reportar un mensaje del feed.
 * THREE of these refusals are about the ANIMAL'S SITUATION rather than about
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
 * - `lost_report_target_invalid`
 *                       — `report_content` names a `targetEventId` that is not a
 *                         reportable item of THIS animal's feed. 400.
 *                         ONE CODE FOR THREE SITUATIONS, and that is the point:
 *                         no such event, an event belonging to a DIFFERENT
 *                         animal, and an event that exists here but is not
 *                         reportable (a `credential_scanned` — a QR read has no
 *                         author and nothing anybody could have written wrongly)
 *                         all answer identically. Telling the three apart would
 *                         turn this command into an oracle for which event ids
 *                         are real, which is the same refusal `not_found`
 *                         already makes for tokens one URL up.
 *                         NOT 404, deliberately: on this surface 404 means "this
 *                         animal is not yours or does not exist", and a client
 *                         that received it here would navigate a person away
 *                         from a search that is running perfectly well.
 *                         NOT `invalid_request` either — the body parsed, the
 *                         uuid is well formed, and a client told otherwise would
 *                         go looking at the wrong field.
 * - `lost_failed`       — the command itself failed. Same contract as
 *                         `event_failed`, minus the retry advice for the four
 *                         commands that carry no `Idempotency-Key`: those are
 *                         idempotent on the STATE, so a retry is safe by
 *                         construction rather than by header.
 *
 * THE TRANSFER CODES (WU-O). `POST /api/v1/me/transfers` runs the four
 * owner→owner commands: ofrecer la titularidad, aceptarla, rechazarla, retirar la
 * propuesta. This is the first command set on the surface where the CALLER MAY
 * NOT HOLD THE ANIMAL — that is what a transfer is — so the split below is by
 * WHOSE fact the refusal is about, and the first code is the one a reviewer
 * should read.
 *
 * - `transfer_forbidden` — the caller is not the party THIS command is for. 403.
 *                         ONE code for three different rules, because the
 *                         client's move is identical in all three (stop offering
 *                         the control, re-read the list) and because saying which
 *                         rule refused would leak the shape of somebody else's
 *                         proposal:
 *                           · `initiate` — the caller does not hold the ACTIVE
 *                             `role='owner'` ownership row
 *                             (`initiate-pet-transfer.ts:101-105`). NARROWER than
 *                             `requireTitularAccess`: a co-owner is refused here.
 *                           · `accept` / `reject` — the caller is not the
 *                             addressee. This is an id-or-email match against the
 *                             transfer ROW (`validateRecipientMatch`) and NOT a
 *                             custody check, because the addressee by definition
 *                             does not hold the animal yet. A surface that
 *                             answered this with a custody guard would refuse the
 *                             one caller the command exists for.
 *                           · `cancel` — the caller is not the SENDER
 *                             (`cancel-pet-transfer.ts:46-53`). A co-owner of the
 *                             same pet may not withdraw a proposal they did not
 *                             send.
 * - `transfer_self`     — the sender and the addressee are the same account:
 *                         initiating to your own address, or accepting your own
 *                         proposal. 400, and NOT `transfer_forbidden`, by this
 *                         file's only bar: the move is a specific edit (change the
 *                         address) rather than "stop".
 * - `transfer_not_allowed`
 *                       — the ANIMAL refuses, whoever is asking: it is registered
 *                         deceased, it is reported lost, it has an open custody
 *                         dispute, or a shelter is still accompanying its
 *                         adoption. 409, nothing about the caller.
 *
 *                         ONE code for the four, and the client can still say
 *                         which: `GET /api/v1/pets/{token}` carries `status` and
 *                         the `banners.rehome` block, so a screen that re-reads
 *                         the pet names the real obstacle from data it already
 *                         holds. Four codes would put four sentences in every
 *                         consumer's switch to describe facts the pet payload
 *                         already states better.
 * - `transfer_pending_exists`
 *                       — an open proposal already exists for this animal, and
 *                         the partial unique index `pet_transfers_one_pending_per_pet`
 *                         refuses a second. 409. Its own code because the move is
 *                         specific and available: cancel the one in flight, then
 *                         send this one.
 * - `transfer_already_resolved`
 *                       — the proposal is no longer answerable: somebody accepted
 *                         or refused it, the sender withdrew it, the nightly cron
 *                         expired it, or the titularity moved out from under it
 *                         (the TR-C1 guard). 409, and the move is always the same
 *                         one: re-read.
 *
 *                         THIS IS THE CODE A TIMED-OUT WRITE COMES BACK AS, and
 *                         it is AMBIGUOUS on purpose rather than by accident.
 *                         None of the four commands takes an `Idempotency-Key`
 *                         (see `@dim/contract/input`'s `transfer.ts` for why the
 *                         `expectedStatus` guards are not the same thing), so a
 *                         retry after a timeout that in fact succeeded lands
 *                         here, and so does a retry that raced the other party.
 *                         A client must re-read rather than guess which.
 * - `transfer_expired`  — the seven-day window closed. 409, and distinct from
 *                         `transfer_already_resolved` because nothing was
 *                         decided: the fix is to ask the sender to start a new
 *                         proposal, where the other code means somebody already
 *                         answered.
 *
 *                         `accept` is the only command that answers it. `reject`
 *                         deliberately does NOT check expiry
 *                         (`reject-pet-transfer.ts:53-66`) — refusing something
 *                         dead is harmless, and taking the control away would
 *                         leave a row nobody can clear.
 * - `transfer_failed`   — the command's transaction failed. 500. NO retry advice,
 *                         and that is the honest difference from `event_failed`:
 *                         without an idempotency key a blind retry of `accept`
 *                         cannot be told from a second attempt. Re-read first.
 *
 * THE CARETAKER CODES (WU-P). `POST /api/v1/me/caretaker-grants` runs the five
 * cuidador-temporal commands the web offers: designar, aceptar, rechazar, retirar
 * la invitación, finalizar el cuidado. The surface has BOTH shapes of caller the
 * previous two sets split on — a titular acting on their own animal, and an
 * invitee who holds no ownership row at all — so the split below is again by
 * WHOSE fact the refusal is about.
 *
 * `not_found` is REUSED for "no such grant" and for "no such pet, or one you may
 * not see", rather than getting caretaker-specific twins. It already means "the
 * identifier resolves to nothing the caller may see", which is exactly right for
 * both, and a pet the caller may not touch must answer identically to one that
 * does not exist or this endpoint becomes a probe over the pet table.
 *
 * - `caretaker_forbidden` — the caller is not the party THIS command is for. 403.
 *                         ONE code for four different rules, because the client's
 *                         move is identical in all four (stop offering the
 *                         control, re-read) and because naming which rule refused
 *                         would describe somebody else's arrangement to a
 *                         stranger:
 *                           · `designate`/`cancel`/`revoke` — the caller holds
 *                             this animal but is its CARETAKER, which
 *                             `requireTitularAccess` denies (and a caretaker
 *                             naming a sub-caretaker is deny-list row
 *                             `caretaker-sub-designation`). Note what this code
 *                             does NOT mean: a co-owner, a foster and the org
 *                             path all PASS on the web, so they pass here.
 *                           · `cancel`/`revoke` — the caller holds the animal as
 *                             titular but did not GRANT this invitation. A grant
 *                             is an agreement between two people; a co-owner may
 *                             not withdraw one they did not make.
 *                           · `accept`/`reject` — the caller is not the
 *                             addressee. An id-or-email match against the grant
 *                             ROW, NOT a custody check: the addressee by
 *                             definition holds nothing yet, and a surface that
 *                             answered this with a pet guard would refuse the one
 *                             caller the command exists for.
 * - `caretaker_self`    — the titular named their own account, or is trying to
 *                         accept their own invitation. 400, and NOT
 *                         `caretaker_forbidden`, by this file's only bar: the
 *                         move is a specific edit (change the address) rather
 *                         than "stop".
 * - `caretaker_period_invalid`
 *                       — the period is not one the DOMAIN will accept: the end
 *                         is not after the start, it is longer than
 *                         `CARETAKER_MAX_DURATION_DAYS`, or it is already in the
 *                         past. 400.
 *
 *                         ONE code for the three because the move is one move —
 *                         pick different dates — and the client HOLDS what it
 *                         needs to say why: `CARETAKER_MAX_DURATION_DAYS` is in
 *                         the contract precisely so a picker can be bounded
 *                         before the round trip, exactly as the web form bounds
 *                         its own.
 *
 *                         A DAY THAT DOES NOT EXIST IS NOT THIS CODE. `2026-02-31`
 *                         is refused by the wire schema (`isRealArDay`), so a
 *                         client sees the field code `DATE_INVALID` locally and
 *                         the door answers `invalid_request` to anything that
 *                         sends it anyway. The split is the usual one: the shape
 *                         of a date is the schema's, what a date MEANS for a
 *                         period is the domain's.
 * - `caretaker_grant_exists`
 *                       — this animal already has an open arrangement: an active
 *                         caretaker, or an invitation nobody has answered. 409,
 *                         and its own code because the move is specific and
 *                         available — end or withdraw the one in flight, then
 *                         invite. Two partial unique indexes enforce it; this is
 *                         the readable half.
 * - `caretaker_already_resolved`
 *                       — the grant is no longer in the state this command needs:
 *                         somebody answered the invitation, the titular withdrew
 *                         it, the sweep expired it, or the arrangement already
 *                         ended. 409, and the move is always the same one:
 *                         re-read.
 *
 *                         IT ALSO COVERS `cancel` SENT AT A LIVE ARRANGEMENT,
 *                         which the web answers with its own sentence ("usá
 *                         «Finalizar ahora»"). No second code, because re-reading
 *                         IS the fix: the row comes back `accepted` with
 *                         `canRevoke`, which is the same instruction expressed as
 *                         data the screen already renders.
 *
 *                         THIS IS THE CODE A TIMED-OUT WRITE COMES BACK AS, and
 *                         it is AMBIGUOUS on purpose. None of the five commands
 *                         takes an `Idempotency-Key`, so a retry after a timeout
 *                         that in fact succeeded lands here, and so does a retry
 *                         that raced the other party. Re-read rather than guess.
 * - `caretaker_expired` — the period the invitation offers is already over, so
 *                         accepting it would grant access that ends the same
 *                         second. 409, and distinct from
 *                         `caretaker_already_resolved` because nothing was
 *                         decided: the fix is to ask the titular for a new
 *                         invitation with new dates.
 * - `caretaker_granter_not_titular`
 *                       — the person who invited you no longer holds this animal.
 *                         409. It earns its own code by the only bar this file
 *                         applies, and it is the clearest case in the file: every
 *                         other refusal's move is "re-read" or "ask again", and
 *                         BOTH are dead ends here. The grant is still `pending`,
 *                         so a re-read shows an invitation that looks live; the
 *                         person who sent it cannot re-send it, because they are
 *                         no longer the titular. The only move is to ask a
 *                         DIFFERENT person, and no other field on the wire could
 *                         tell a client that.
 *
 *                         The guard (H4) is what stops an invitation surviving a
 *                         change of owner — designate an accomplice, sell the
 *                         animal, have them accept inside the window.
 * - `caretaker_failed`  — the command's transaction failed. 500. NO retry advice,
 *                         for the same reason `transfer_failed` gives none:
 *                         without an idempotency key a blind retry of `accept`
 *                         cannot be told from a second attempt. Re-read first.
 * - `photo_forbidden`   — the caller holds this animal but not in a way that may
 *                         set its photo. 403. Today that is exactly one case: an
 *                         ORG-path caller whose membership lacks `event.write`,
 *                         the same capability the attachment-bearing event door
 *                         demands. A CARETAKER is NOT refused here — the
 *                         titular-only deny-list names photos as one of the
 *                         things a caretaker MAY do
 *                         (`lib/domain/titular-only.ts`), and
 *                         `primaryPhotoId` is deliberately absent from
 *                         `TITULAR_ONLY_PET_COLUMNS`.
 * - `photo_not_an_image`
 *                       — the staged bytes are not a JPEG, PNG or WebP. 400, and
 *                         it is decided by MAGIC BYTES over the bytes that
 *                         arrived, never by the content type the ticket
 *                         declared. It earns its own code rather than
 *                         `invalid_request` because the fix is a different one:
 *                         `invalid_request` means "your JSON was wrong", this
 *                         means "your JSON was right and your file is not a
 *                         photo", and a client should say so about the file.
 *
 *                         A staged object the server cannot find lands here too,
 *                         and the collapse is deliberate: distinguishing "your
 *                         upload never arrived" from "somebody else's key" would
 *                         make `confirm` an oracle for which staged keys exist.
 * - `photo_failed`      — the confirm transaction failed after the bytes
 *                         validated: the re-encode, the write into `pet-photos`,
 *                         or the row. 500. RETRYING IS SAFE HERE and this is the
 *                         one failure arm on this surface where that is true
 *                         without an idempotency key — a photo is a value, not
 *                         an append, so setting it twice is setting it once. The
 *                         ticket may be dead by then; re-ticket and re-upload.
 * - `profile_forbidden` — the caller holds this animal but not in a way that may
 *                         run the command they sent. 403, and it covers TWO
 *                         different rules rather than one, which is why the read
 *                         reports them as two separate booleans:
 *                         `edit_identity` is refused for a person-path
 *                         CARETAKER alone (deny-list row `identity-field-edits`,
 *                         mirroring `requireTitularAccess`), while
 *                         `set_emergency_contacts` is refused for everybody
 *                         except the LEGAL owner — a co-owner, a foster and the
 *                         org path included, because those numbers are the
 *                         titular's own and the writer's `ownerships` join says
 *                         `role = 'owner'`.
 * - `profile_breed_invalid`
 *                       — the submitted breed does not resolve within the
 *                         PERSISTED species' catalog. 400, and its own code
 *                         rather than `invalid_request` for the
 *                         `photo_not_an_image` reason: the body was well formed
 *                         and one named field is wrong, so a client should point
 *                         at the breed picker instead of saying the request was
 *                         malformed. The animal's CURRENT stored breed always
 *                         resolves, off-catalog or not (QA A5).
 * - `profile_failed`    — the write itself failed. 500. RETRYING IS SAFE: an
 *                         identity edit is a value, not an append, and a no-op
 *                         repeat appends no event at all.
 * - `adoption_application_refused`
 *                       — the adoption use-case refused the submission. 409,
 *                         and ONE code for every one of its refusals rather
 *                         than a family of them, which is a deliberate
 *                         coarseness with a stated cost.
 *
 *                         `submitAdoptionApplication` returns es-AR PROSE, not
 *                         a discriminated reason — it was written for a web
 *                         form's inline error — so a route that mapped its
 *                         sentences onto codes would be parsing copy, the most
 *                         brittle thing a caller can do. What that costs is
 *                         that "you already applied", "this animal is no longer
 *                         listed" and "institutional accounts cannot adopt"
 *                         arrive indistinguishable.
 *
 *                         It is paid down by the READ rather than left open:
 *                         `GET /api/v1/adoptions/{petToken}` carries `canApply`
 *                         and `applyBlockedReason`, so a client should never
 *                         reach this code for the two refusals a person can act
 *                         on. Splitting the use-case's return into codes is the
 *                         right fix and it is a change to a writer the web
 *                         shares.
 * - `adoption_application_failed`
 *                       — the write itself failed after every check passed.
 *                         500. RETRYING IS SAFE, and for a stronger reason than
 *                         `profile_failed`'s: if the first attempt in fact
 *                         landed, the retry meets the duplicate-pending refusal
 *                         and comes back 409 rather than appending a second
 *                         letter to the shelter's queue.
 * - `erasure_reason_required`
 *                       — the supresión arrived without a usable motivo. 400,
 *                         and a code of its own rather than `invalid_request`
 *                         for the `profile_breed_invalid` reason: the body was
 *                         well formed and ONE named field is short, so a client
 *                         should point at the reason box instead of telling the
 *                         person their request was malformed. It is also the one
 *                         refusal on this surface that costs the caller NOTHING
 *                         — the use-case validates before it spends the budget,
 *                         so a person fixing their sentence is not throttled for
 *                         having tried.
 * - `export_failed`     — `export_subject_data` refused or came back empty. 500.
 *                         RETRYING IS SAFE: the export writes nothing the
 *                         subject can see (only its own audit row) and reading
 *                         it twice reads it once.
 * - `erasure_failed`    — the supresión did not complete. 500, and this is the
 *                         one 500 on this surface a client must NOT present as
 *                         "nothing happened". The erasure is six steps and only
 *                         the first two are transactional; a failure reported
 *                         here means the RPC itself refused, so the subject's
 *                         data is intact — but retrying is the right move and
 *                         the copy must not promise that the account is
 *                         untouched, because a LATER step failing does not
 *                         reach this arm at all (it logs and still reports
 *                         success, by design: see `eraseSubjectDataFor`).
 * - `appointment_forbidden`
 *                       — the turno exists and is somebody else's. 403, and NOT
 *                         collapsed into `not_found`, which is the choice
 *                         `transfer_forbidden` made for the same reason: the
 *                         token is a server-minted random string nobody guesses,
 *                         and the web says these two things in these two cases
 *                         (`cancelAppointmentByOwner` returns "Turno no
 *                         encontrado." and "Este turno no te pertenece."
 *                         separately). What must NOT differ is the animal's
 *                         side, and it does not: the read drops every row whose
 *                         pet is soft-deleted before the caller ever sees a
 *                         token to send.
 * - `appointment_already_resolved`
 *                       — somebody already answered, or the world moved. 409,
 *                         and it is DELIBERATELY AMBIGUOUS: after a timeout it
 *                         may mean this caller's own first attempt landed, or
 *                         that the clinic cancelled or attended the turno in the
 *                         meantime. The writer's UPDATE is conditional on
 *                         `status = 'confirmed'`, which refuses a replay rather
 *                         than absorbing one, so a client must RE-READ and never
 *                         re-send. Naming which of the two happened would report
 *                         the provider's action as the caller's own.
 * - `appointment_past`  — the slot's start time is behind us. 409, and its own
 *                         code rather than `appointment_already_resolved`
 *                         because the client's move differs: a resolved turno is
 *                         gone and the screen re-reads, while a past one is
 *                         still a row the person has to be told about ("no podés
 *                         cancelar un turno que ya pasó") and may still need to
 *                         look at.
 * - `appointment_failed`
 *                       — the cancel transaction failed. 500. RETRYING IS SAFE
 *                         ONLY IN THE SENSE THAT NOTHING IS DOUBLE-FREED: the
 *                         conditional UPDATE means a retry after a commit that
 *                         did land answers `appointment_already_resolved`, not a
 *                         second decrement of `bookings_count`. It is still not
 *                         a signal that the first attempt failed.
 *
 * THE CLAIM CODES (WU-V). `POST /api/v1/me/pet-claims` runs the two commands of
 * the web's claim wizard that a phone can honestly run. TWO codes, and the
 * shortness of the list is the interesting part: the LOOKUP has no failure
 * vocabulary at all, because "nothing matches that chip" is a VARIANT it answers
 * 200 with (`PetClaimLookupAckV1.variant === "not_found"`) rather than an error.
 * A question that was answered is not a failure, and a 404 there would be
 * indistinguishable from a transport one.
 *
 * - `claim_not_claimable`
 *                       — `claim_free` was refused because the animal is not
 *                         free: it already has an active custody of some role,
 *                         it is registered deceased or lost, or it has an open
 *                         custody dispute. 409.
 *
 *                         ONE CODE FOR ALL FOUR, and the bar this file applies is
 *                         what makes that right rather than lazy: the client's
 *                         move is identical in every case and it is not "show a
 *                         different sentence" — it is RE-RUN THE LOOKUP, whose
 *                         fresh `variant` carries the current situation and is
 *                         the vocabulary the screen already renders. Splitting
 *                         this into four would put a second copy of that
 *                         vocabulary in the error channel, and the two would then
 *                         have to be kept in step for no gain.
 *
 *                         IT IS ALSO WHAT A REPLAY LOOKS LIKE. A second
 *                         `claim_free` after a successful one finds the caller's
 *                         OWN ownership row as the active custody and lands here,
 *                         so a client must never render this as "somebody else
 *                         took it" — see `PetClaimFreeAckV1.changed`.
 * - `claim_failed`      — the claim transaction itself failed. 500. The writer
 *                         takes `SELECT … FOR UPDATE` on the pet row and does
 *                         everything in one transaction, so nothing is half
 *                         written; a retry is safe and will either succeed or
 *                         answer `claim_not_claimable`.
 *
 * THE DENUNCIA CODE (WU-T). One, and the shortness is again the interesting
 * part: `POST /api/v1/welfare-reports` has no vocabulary of refusals because it
 * has no rules a client can violate beyond the shape of the body. There is no
 * "you may not denounce this animal" — a citizen may report anything to an
 * authority, which is what Ley 14.346 is — so every rejection this door has is
 * either `invalid_request` (the body), `rate_limited` (the shared `welfare_auth`
 * budget the browser also spends), or one of the liveness codes.
 *
 * - `welfare_report_failed`
 *                       — the denuncia could not be filed. 500.
 *
 *                         DELIBERATELY OPAQUE, AND NOT FOR THE USUAL REASON. It
 *                         covers two states the server can tell apart and the
 *                         client cannot act on differently: the report row
 *                         failed to insert (nothing was written), or the row
 *                         landed and the case transaction over it did not (a
 *                         denuncia exists with no case, the same state the web's
 *                         action already produces, and one `/gob/denuncias`
 *                         handles). Splitting them would tell a caller whether a
 *                         legal filing about a named third party is now on
 *                         record — over the same channel, on a failure path,
 *                         with no reference code to prove it. The person's move
 *                         is identical either way: try again, and check
 *                         `/denuncias/buscar` if in doubt.
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
  "lost_report_target_invalid",
  "lost_failed",
  "share_forbidden",
  "share_limit_reached",
  "tier2_not_allowed",
  "transfer_forbidden",
  "transfer_self",
  "transfer_not_allowed",
  "transfer_pending_exists",
  "transfer_already_resolved",
  "transfer_expired",
  "transfer_failed",
  "caretaker_forbidden",
  "caretaker_self",
  "caretaker_period_invalid",
  "caretaker_grant_exists",
  "caretaker_already_resolved",
  "caretaker_expired",
  "caretaker_granter_not_titular",
  "caretaker_failed",
  "photo_forbidden",
  "photo_not_an_image",
  "photo_failed",
  "profile_forbidden",
  "profile_breed_invalid",
  "profile_failed",
  "erasure_reason_required",
  "export_failed",
  "erasure_failed",
  "appointment_forbidden",
  "appointment_already_resolved",
  "appointment_past",
  "appointment_failed",
  "claim_not_claimable",
  "claim_failed",
  "adoption_application_refused",
  "adoption_application_failed",
  "welfare_report_failed",
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
