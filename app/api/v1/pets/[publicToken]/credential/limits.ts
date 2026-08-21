// Rate-limit constants for GET /api/v1/pets/[publicToken]/credential.
//
// A Next.js route file may only export HTTP handlers and segment config —
// `next build` type-checks that contract and rejects any other export (the
// typecheck/lint/test gates all passed over the old shape; only the build
// caught it). Constants the tests and the handler share therefore live here.

/** D3 — the per-lookup bucket, keyed by token AND caller. */
export const LOOKUP_BUCKET = "public_token_api_credential_lookup";

/** D3 — atender's numbers, for the reasons in the header. */
export const PUBLIC_TOKEN_API_LOOKUP_LIMIT = { maxPerMinute: 20, maxPerHour: 100 } as const;
