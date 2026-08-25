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
