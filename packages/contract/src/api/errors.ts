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
 * Every error code a `/api/v1` READ endpoint may return.
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
 */
export const API_V1_ERROR_CODES = ["rate_limited", "not_found", "temporarily_unavailable"] as const;

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
