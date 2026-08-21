// GET /api/v1/pets/{publicToken}/credential — the first `/api/v1` endpoint.
//
// It answers the same question `app/(public)/p/[publicToken]/page.tsx` answers,
// as data instead of HTML, over the SAME door (`lookupPublicCredential`). Not a
// second implementation of the four branches: a handler that re-derived
// throttled / not_found / degraded / ok is how the JSON and the HTML start
// disagreeing about what "degraded" means, which is the exact failure the
// per-section contract exists to prevent (RN-8 #6).
//
// Every line of docs/architecture/api-invariants.md §9 has an answer here; the
// "first endpoint" note in that document maps each one to a file:line.
//
// ---------------------------------------------------------------------------
// TWO LIMITERS, AND WHAT EACH ONE ACTUALLY BOUNDS
// ---------------------------------------------------------------------------
// D1 and D3 are two decisions, not one, and they bound different things. Both
// are applied, in this order, and neither substitutes for the other.
//
// 1. PER-LOOKUP (D3) — `public_token_api_credential_lookup`, keyed
//    `${publicToken}:${ip}`, 20/min + 100/hr.
//
//    BOUNDS: how hard ONE caller may hammer ONE credential. Below the surface
//    ceiling on purpose, so a single IP cannot spend its whole read budget
//    re-reading one animal's card — which on a lost pet means re-reading a
//    disclosed phone number and last-seen location.
//
//    DOES NOT BOUND: enumeration. A caller walking the token space touches a
//    fresh counter with every token and never trips this one; that is the
//    surface bucket's job, below. Nor does it bound a distributed read of one
//    token — and it deliberately must not. A token-only key (no IP) would give
//    exactly that, and would also hand anyone a way to burn a victim
//    credential's global budget so real finders get a 429. On the one surface
//    an anonymous finder in the street depends on, that trade is not available.
//
//    WHY ATENDER'S NUMBERS: D3 names `atender_lookup` as the model over
//    `gob/mascotas`'s aggregate-only cap, and 20/min + 100/hr is what that
//    limiter uses. The accepted cost is written into D3: a legitimate
//    high-volume integrator will hit it, and that is a conversation about
//    issuing them a scoped credential — a conversation that only happens if the
//    limit exists.
//
// 2. PER-IP SURFACE (D1) — `public_token_api_credential`, keyed by IP,
//    60/min + 400/hr, applied INSIDE the door through the throttle port.
//
//    BOUNDS: how much of the token space one IP can walk, at all, through this
//    endpoint. Its own bucket, so a client hammering the API cannot starve the
//    person loading the credential in the street on `public_token_page`. The
//    price of that isolation is stated in D1 and knowingly accepted: a fifth
//    bucket takes the aggregate per-IP ceiling across all token-resolving
//    surfaces from 240/min to 300/min.
//
//    DOES NOT BOUND: a distributed walk from many IPs. Closing that needs an
//    aggregate limiter layered on top, which D1 says must be its own change and
//    must not be smuggled into an endpoint.
//
// BOTH FAIL OPEN on limiter infrastructure failure, matching every sibling: the
// limiter is itself a DB write, and it must not become the thing that breaks
// the credential before the degraded answer can be produced. Rate limiting here
// is an abuse control, not an authorization boundary — nothing behind it is
// secret to someone already holding the token.
//
// KNOWN RESIDUALS, stated rather than hidden:
//   • A caller already over the SURFACE limit still causes one per-lookup
//     counter write, because the per-lookup limiter runs first. That write
//     reads no pet data and is bounded by its own budget. Same shape as the
//     `generateMetadata` residual the page documents.
//   • The token is used verbatim, not upper-cased, because the page resolves it
//     verbatim and the two must agree about which tokens exist. So a caller can
//     vary the case to get a fresh PER-LOOKUP counter. They cannot escape the
//     surface bucket that way, which is the limiter that bounds enumeration.
//
// ---------------------------------------------------------------------------
// WHY NO `Retry-After` ON 429
// ---------------------------------------------------------------------------
// Only one of the two rate-limit branches could carry an honest one. The
// per-lookup limiter throws `RateLimitError`, which knows its `resetAt`; the
// surface limiter arrives as a boolean-returning PORT, because a use-case may
// not import `next/headers` and must run without a Next request at all. Setting
// the header on one branch and not the other would make the two 429s
// distinguishable, and inventing a constant for both would be a fabricated
// hint. A client backs off on the status. When the port can report a reset
// instant, both branches get the header in the same change.
//
// The 503 does carry one: there is no second branch to stay indistinguishable
// from, and "the read failed, come back shortly" is a genuine hint rather than
// a disclosure about a limiter window.

import { NextResponse } from "next/server";

import { withDbBudget } from "@/lib/infra/db-budget";
import { publicTokenThrottle } from "@/lib/infra/public-token-throttle";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { lookupPublicCredential } from "@/src/modules/pets/application/read/lookup-public-credential";

import { buildDegradedPublicCredentialV1, buildPublicCredentialV1 } from "./payload";

// The handler reads the request's own headers for the caller IP, so it can
// never be statically rendered. Declared explicitly, matching the sibling
// handlers, rather than relying on Next inferring it from a header read.
export const dynamic = "force-dynamic";

// D1's bucket, `public_token_api_credential`, is written as a LITERAL at the
// call site below rather than lifted to a constant here. That is a requirement,
// not a style choice: __tests__/public-token-throttle-coverage.test.ts rejects
// any non-literal argument to the throttle adapter, because a computed bucket
// is exactly how one surface starts spending another's counter, and it makes
// "which surface is being hammered" unanswerable from the limiter's own
// storage. The fence caught this file with a constant on the first run.
//
// It reads the RAW source, comments included, so this note names the rule
// instead of illustrating it with a call.

/** D3 — the per-lookup bucket, keyed by token AND caller. */
export const LOOKUP_BUCKET = "public_token_api_credential_lookup";

/** D3 — atender's numbers, for the reasons in the header. */
export const PUBLIC_TOKEN_API_LOOKUP_LIMIT = { maxPerMinute: 20, maxPerHour: 100 } as const;

/** Budget for the per-lookup limiter's own DB write. Short: it gates the read. */
const LOOKUP_LIMIT_BUDGET_MS = 1500;

/** Advisory backoff on a degraded read. Not a limiter window. */
const DEGRADED_RETRY_AFTER_SECONDS = 30;

/**
 * The ONE way this route answers, so no branch can forget the header.
 *
 * `Cache-Control: no-store` is NOT inherited (§4): `middleware.ts` stamps it
 * from a path-prefix allowlist that `/api/...` does not match. The privacy
 * class that closed on 2026-07-07 was real — a revoked share and a found pet
 * served stale from the CDN at the exact shared URL — and a JSON endpoint
 * reopens it unless every response sets the header itself. Funnelling all four
 * status codes through one function is what makes "every response" a property
 * of the file rather than of the author's memory.
 */
function credentialJson(body: unknown, status: number, extraHeaders: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...extraHeaders },
  });
}

// @no-auth-required: the public credential is public BY DESIGN — the pet is the
// credential (invariant #1), and this endpoint discloses exactly what
// /p/{publicToken} already shows to anyone holding the token: no owner PII
// beyond the lost-mode fields the owner opted to disclose, no microchip number,
// no internal ids, no DNI. Anonymous access is the product, not an oversight.
// It is bounded instead of authorized: a per-lookup limiter (token+IP) and the
// per-IP surface bucket, both applied before any pet data is read.
export async function GET(
  // A plain `Request`, not `NextRequest`: the only thing this handler needs
  // from it is the header bag, and typing it wider than the need keeps the
  // handler callable from a test without constructing a Next request object.
  request: Request,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;

  // Derived from the REQUEST, never from a middleware-stamped header: those
  // default silently when the matcher does not run, and a value the request
  // influences must not decide what a caller may do (check-api-guard-headers).
  const ip = callerIp(request.headers);

  // (D3) Per-lookup limiter FIRST — before the door, therefore before any pet
  // row is read. Fails open on limiter-infra failure; see the header.
  try {
    await withDbBudget(
      enforceRateLimit(LOOKUP_BUCKET, `${publicToken}:${ip}`, PUBLIC_TOKEN_API_LOOKUP_LIMIT).then(
        () => null,
      ),
      LOOKUP_LIMIT_BUDGET_MS,
      `${LOOKUP_BUCKET} rate-limit`,
      null,
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return credentialJson({ error: "rate_limited" }, 429);
    }
    reportError(`public-token-throttle/${LOOKUP_BUCKET}`, err);
    // Fall through — fail open.
  }

  // (D1) The door. It applies the per-IP surface bucket as its first statement
  // and answers the four-way union; the page renders the same four branches.
  const lookup = await lookupPublicCredential({
    publicToken,
    throttle: publicTokenThrottle("public_token_api_credential"),
  });

  switch (lookup.status) {
    // Over the surface limit. Byte-identical to the per-lookup 429 above, and
    // identical for a token that exists and one that does not — a rate-limit
    // response must never be an existence oracle.
    case "throttled":
      return credentialJson({ error: "rate_limited" }, 429);

    // The token resolves to nothing the caller may see. A SOFT-DELETED pet
    // reaches this same branch, because the filter lives in the query
    // (`publicPetByToken`, PO-4) — an erased subject's credential must be
    // indistinguishable from one that never existed, byte for byte.
    case "not_found":
      return credentialJson({ error: "not_found" }, 404);

    // A read failed or blew its budget. NOT 404: a database outage is not "this
    // token does not exist", and answering 404 to a finder standing over a lost
    // animal is the worst lie this surface can tell. The body carries the error
    // code ALONGSIDE whatever survived, per-section — the shape
    // app/api/panorama/kpis/route.ts prototyped and §5 prescribes.
    case "degraded":
      return credentialJson(buildDegradedPublicCredentialV1(lookup, new Date()), 503, {
        "retry-after": String(DEGRADED_RETRY_AFTER_SECONDS),
      });

    case "ok":
      return credentialJson(buildPublicCredentialV1(lookup, new Date()), 200);

    default: {
      // Exhaustiveness: a new status added to the union without a branch here
      // is a compile error, not a silent 200 with an empty body.
      const unhandled: never = lookup;
      throw new Error(`Unhandled credential lookup status: ${JSON.stringify(unhandled)}`);
    }
  }
}
