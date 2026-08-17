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

import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { withDbBudget } from "@/src/modules/panorama/application/db-budget";

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
