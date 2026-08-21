// The per-IP read guard for every anonymous route that resolves a public
// credential token.
//
// WHY THIS IS A SHARED HELPER AND NOT A BLOCK COPIED PER PAGE
// ---------------------------------------------------------------------------
// The guard was written once, inline, in /p/[publicToken]/page.tsx, with a
// comment stating it runs "before touching any pet data". That was true of that
// file and of nothing else: `/p/[publicToken]/encontre` and
// `/p/[publicToken]/sighting` resolve the SAME token through the same
// `publicPetByToken()` lookup and had no limiter at all (found 2026-08-17).
//
// The gap mattered most on `encontre`, whose "allowFinderFormWhenLost=false"
// branch renders the owner's `tel:` and `mailto:` and calls the Supabase ADMIN
// API (`auth.admin.getUserById`) to resolve their email — an unthrottled,
// unauthenticated path to a privileged lookup, once per request, for as many
// requests as anyone cares to make.
//
// Middleware would not have covered it either: `middleware.ts` only refreshes
// the Supabase session. So the limit lives here, and each route calls it as its
// first statement. A fourth sibling gets the guard by importing it rather than
// by someone remembering the rule.
//
// WHAT IT DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
// It does not render. Each route owns its own throttle screen because each has
// different chrome, and a helper that returned JSX would force one shape on all
// of them.
//
// It is called ONCE PER REQUEST, from the page component only. /p/[publicToken]
// also resolves the token in `generateMetadata`, which stays outside the guard:
// one HTTP request runs both functions and `enforceRateLimit` INCREMENTS a
// counter, so guarding both would bill a single visit twice and halve the real
// limit to 30/min for every legitimate finder. KNOWN RESIDUAL, stated rather
// than hidden: a caller already over the limit still causes one metadata read
// per request. It is bounded by its own budget, selects Tier-0 fields only
// (name, species, status, sex) and degrades to a generic title — the same data
// printed on the credential's face. Closing it properly needs a
// check-without-increment mode on the limiter, which does not exist yet.
//
// It FAILS OPEN on limiter infrastructure failure, on purpose and unchanged
// from the original: the limiter is itself a DB write, and the credential is
// the one page an anonymous finder in the street depends on. A degraded
// database must not make the limiter the thing that breaks the page before its
// own degraded render can happen. Rate limiting is an abuse control here, not
// an authorization boundary — nothing behind it is secret to someone holding
// the token.

import { headers } from "next/headers";

import { withDbBudget } from "@/lib/infra/db-budget";
import {
  type RateLimitConfig,
  RateLimitError,
  callerIp,
  enforceRateLimit,
} from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import type { PublicTokenThrottle } from "@/src/modules/pets/application/read/lookup-public-credential";

/**
 * Per-IP limit for public credential reads.
 *
 * 60/min is generous enough for a legitimate user refreshing behind
 * carrier-grade NAT (many people, one IP) or a viral lost-pet post drawing
 * rapid repeat scans from one household. 400/hr keeps sustained enumeration
 * from a single IP off the table. A genuinely viral QR is scanned from MANY
 * IPs, so per-IP limits never block that case at these numbers.
 */
export const PUBLIC_TOKEN_READ_LIMIT = { maxPerMinute: 60, maxPerHour: 400 } as const;

/** Budget for the limiter's own DB write. Short: it gates the whole render. */
const RATE_LIMIT_BUDGET_MS = 1500;

async function callerIpFromHeaders(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

/**
 * Applies the per-IP read limit for a public-token route.
 *
 * Returns `true` when the caller is over the limit and the route should render
 * its throttle notice INSTEAD of doing any pet lookup. Returns `false` when the
 * route should proceed — including when the limiter itself failed (see the
 * fail-open note in the header).
 *
 * `bucket` names the route in the limiter's own storage so one abusive scraper
 * cannot spend a legitimate finder's budget on a different page, and so the
 * counters stay readable when someone asks which surface is being hammered.
 */
export async function isPublicTokenReadThrottled(bucket: string): Promise<boolean> {
  const ip = await callerIpFromHeaders();
  try {
    await withDbBudget(
      enforceRateLimit(bucket, ip, PUBLIC_TOKEN_READ_LIMIT).then(() => null),
      RATE_LIMIT_BUDGET_MS,
      `${bucket} rate-limit`,
      null,
    );
  } catch (err) {
    if (err instanceof RateLimitError) return true;
    reportError(`public-token-throttle/${bucket}`, err);
    // Fall through — see the fail-open note in the header.
  }
  return false;
}

/**
 * A SECOND, narrower limiter to consult after the per-IP surface bucket.
 *
 * The `/api/v1` credential endpoint bounds two different things and needs both:
 * the surface bucket bounds how much of the token space one IP can walk, and
 * this one bounds how hard one caller may hammer ONE credential — which on a
 * lost pet means re-reading a disclosed phone number and last-seen location.
 */
export type PerLookupLimit = {
  /** Its OWN bucket, so the two counters stay separately readable. */
  readonly bucket: string;
  /** The narrower key, e.g. `${publicToken}:${ip}`. */
  readonly key: string;
  readonly limit: RateLimitConfig;
};

/**
 * The narrow limiter, with the same fail-open contract as the surface one.
 *
 * `withDbBudget` RESOLVES with its fallback when the write outruns the budget
 * rather than throwing, so a limiter that simply never answers lands on the
 * `return false` below and not in the catch — both are the fail-open path, and
 * both are covered by __tests__/api-v1-credential-route.test.ts.
 */
async function isPerLookupThrottled({ bucket, key, limit }: PerLookupLimit): Promise<boolean> {
  try {
    await withDbBudget(
      enforceRateLimit(bucket, key, limit).then(() => null),
      RATE_LIMIT_BUDGET_MS,
      `${bucket} rate-limit`,
      null,
    );
  } catch (err) {
    if (err instanceof RateLimitError) return true;
    reportError(`public-token-throttle/${bucket}`, err);
    // Fall through — see the fail-open note in the header.
  }
  return false;
}

/**
 * The same guard, bound to a bucket, as the `PublicTokenThrottle` PORT the
 * application layer takes.
 *
 * WHY AN ADAPTER AND NOT A DIRECT IMPORT. `isPublicTokenReadThrottled` calls
 * `next/headers` to read the caller IP, and the application fence bans that
 * specifier inside every `src/modules/<m>/application` tree — a use-case must
 * be runnable without a Next request, because a React Native app has no Next
 * request to give it. So the use-case declares the shape it needs and this
 * module, which already lives on the Next side of the boundary, supplies it.
 *
 * The type is imported TYPE-ONLY: the port is owned by the application layer
 * (the adapter depends on the port, never the reverse), and a type import
 * erases at compile time, so this adds no runtime edge from lib/ into
 * src/modules/.
 *
 * Usage — one statement, the bucket visible at the call site:
 *   lookupPublicCredential({ publicToken, throttle: publicTokenThrottle("public_token_page") })
 *
 * WHY `perLookup` LIVES HERE AND NOT IN THE ROUTE (fixed 2026-08-21)
 * ---------------------------------------------------------------------------
 * The `/api/v1` handler used to apply its per-lookup limiter itself, before
 * calling the door — which meant it ran BEFORE the surface bucket, because the
 * surface bucket is applied inside the door through this port. The consequence
 * was write amplification with attacker-chosen cardinality: an IP already over
 * 60/min still wrote TWO `rate_limit_buckets` rows (a minute row and an hour
 * row) for every distinct token it named, and the token space is 36^8.
 *
 * Moving the surface check earlier in the ROUTE would have double-counted it,
 * because the door applies it again. So both limiters became one port, ordered
 * here: surface first, and the narrower write only for a caller the surface
 * limit still allows. The route is left with one statement and no ordering to
 * get wrong.
 *
 * KNOWN RESIDUAL, stated rather than hidden: UNDER the surface limit, a caller
 * walking distinct tokens still writes two rows per (token, ip) per window.
 * That is the per-lookup limiter working — it cannot count without a counter —
 * and the growth is bounded by the surface limit itself, at 60/min per IP and
 * therefore at most 120 rows/min per IP. Draining those rows is the cleanup
 * job's problem (lib/infra/data-lifecycle.ts), not this file's.
 */
export function publicTokenThrottle(
  bucket: string,
  options?: { perLookup?: PerLookupLimit },
): PublicTokenThrottle {
  const perLookup = options?.perLookup;
  return {
    bucket,
    isThrottled: async () => {
      // ORDER IS THE POINT. The surface bucket is the cheap check that bounds
      // enumeration; the per-lookup bucket is the WRITE. A caller the surface
      // limit already refused must not cost the table a row.
      if (await isPublicTokenReadThrottled(bucket)) return true;
      if (!perLookup) return false;
      return isPerLookupThrottled(perLookup);
    },
  };
}
