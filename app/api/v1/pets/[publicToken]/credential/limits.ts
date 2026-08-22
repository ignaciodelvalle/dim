// Rate-limit constants for GET /api/v1/pets/[publicToken]/credential.
//
// A Next.js route file may only export HTTP handlers and segment config —
// `next build` type-checks that contract and rejects any other export (the
// typecheck/lint/test gates all passed over the old shape; only the build
// caught it). Constants the tests and the handler share therefore live here.

/**
 * D3 — the per-lookup bucket, keyed by token AND caller.
 *
 * FOR THE TESTS. The route writes this bucket as a LITERAL at its call site
 * (the throttle coverage fence and `lint:api-v1` reject a computed per-lookup
 * bucket since 2026-08-22, G4); the tests import this name and pin the route's
 * literal to it through the limiter's recorded endpoint.
 */
export const LOOKUP_BUCKET = "public_token_api_credential_lookup";

/** D3 — atender's numbers, for the reasons in the header. */
export const PUBLIC_TOKEN_API_LOOKUP_LIMIT = { maxPerMinute: 20, maxPerHour: 100 } as const;
