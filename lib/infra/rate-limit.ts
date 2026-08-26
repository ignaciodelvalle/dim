// Persistent rate limiter backed by rate_limit_buckets (rate-limit.ts).
//
// All anonymous public-write and public-read rate limiting uses enforceRateLimit
// (DB-backed, atomic UPSERT, cross-worker). This is the only implementation;
// the former makeMemoryRateLimiter (per-worker, not cold-start-safe) has been
// removed. Do NOT re-introduce in-memory limiting for multi-instance deployments.
//
// Usage:
//   try {
//     await enforceRateLimit("welfare_anon", ip, { maxPerHour: 3, maxPerMinute: 1 });
//   } catch (err) {
//     if (err instanceof RateLimitError) return { error: "rate_limited" };
//     throw err;
//   }

// ---------------------------------------------------------------------------
// Persistent rate limiter — backed by rate_limit_buckets
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";

import { db, rateLimitBuckets } from "@/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// emailRateLimitKey — stable, non-reversible identifier for per-email budgets.
//
// The auth surfaces (login, password-reset) add a per-EMAIL rate-limit budget on
// top of the per-IP one so a distributed botnet cannot brute-force or mail-bomb a
// single account from many IPs. The email is the natural identifier, but writing
// raw emails into rate_limit_buckets.bucket_key would persist PII (Ley 25.326) in
// a table that every worker can read. Hash it: SHA-256 of the normalized email,
// truncated to 160 bits of hex — enough to make collisions astronomically
// unlikely while keeping the key compact and free of cleartext PII.
// ---------------------------------------------------------------------------
export function emailRateLimitKey(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 40);
}

// ---------------------------------------------------------------------------
// callerIp — derive the trusted client IP from request headers.
//
// WHY NOT split(",")[0]:
//   The first segment of x-forwarded-for is CLIENT-CONTROLLED. An attacker
//   can send "X-Forwarded-For: 1.2.3.4, 5.6.7.8" and the first segment will
//   be "1.2.3.4" — a value the attacker chose, giving them a fresh rate-limit
//   bucket per request. This defeats every IP-keyed rate limit.
//
// TRUSTED SOURCES (Vercel / nginx / typical CDN):
//   1. x-real-ip  — overwritten by the edge on every request. Preferred.
//   2. LAST segment of x-forwarded-for  — the edge appends the real observed
//      source IP as the rightmost hop. Prior hops may be spoofed; the last is
//      edge-appended and trustworthy.
//   3. "unknown" — local dev / direct invocation with no proxy headers.
//
// ===========================================================================
// SOURCE 1 IS MEASURED, NOT ASSUMED — 2026-08-26, against dim-staging
// ===========================================================================
// Preferring x-real-ip is the load-bearing assumption under EVERY per-IP
// ceiling in this repo: `api_v1_*` (lib/infra/api-v1-limits.ts), `auth_login_ip`,
// the anonymous public-write budgets, `lib/infra/public-token-throttle.ts`. If a
// client could choose its own value, all of them would be decoration — one
// header per request buys one fresh bucket per request.
//
// Until 2026-08-26 this comment simply ASSERTED that ("set by the edge; never
// forwarded from the client"), and two other files in the repo had meanwhile
// built a mechanism on the OPPOSITE belief: `scripts/load-probe-api-v1.ts` and
// `playwright.staging.config.ts` both stamped a random RFC 5737 address into
// x-real-ip specifically so their runs would land in a fresh bucket. Two
// incompatible beliefs about the same header, neither of them tested.
//
// So it was tested, against https://dim-staging.vercel.app:
//
//   FIRST ATTEMPT, WHICH PROVED NOTHING. 75 requests to /api/v1/me with NO
//     Authorization header: 75×401, zero 429. That is not evidence about the
//     limiter — `createClientFromBearer` runs BEFORE it (app/api/v1/me/route.ts,
//     and the same order in every sibling), so a request with no token is
//     refused without a counter write. Reaching the limiter needs a WELL-FORMED
//     but invalid JWT; the tell is the body flipping from `auth_required` to
//     `auth_expired`.
//
//   POSITIVE CONTROL. 80 concurrent requests to /api/v1/me, well-formed invalid
//     bearer, a FIXED `x-real-ip: 203.0.113.7`  →  59×401 then 21×429. The
//     limiter bites at 60/min. The instrument works.
//
//   DISCRIMINATING TEST. 80 concurrent requests to /api/v1/me/pets, same
//     well-formed invalid bearer, `x-real-ip` ROTATED 203.0.113.1 … .80 — one
//     distinct address per request  →  60×401 then 20×429. The SAME ceiling as
//     the control, off by a single request, which is ordinary jitter when 80
//     requests race against a counter at 60 and not a difference in mechanism.
//     If the header were believed, 80 unique bucket keys would have produced
//     80×401 and no 429 at all — not a one-request wobble, a total absence.
//
//   WHY THE CEILING READS 60 AND NOT 600. The deployment under test was the
//     PRE-WU-EAS-2 build: `adb22ddd5`, which raises this family to 600/min, was
//     still unpushed on the day of the measurement, so staging was serving the
//     old 60/min ceilings. Anybody reproducing this against a staging that has
//     since taken that commit must fire more than 600, not more than 60, and
//     should confirm the control bites before trusting the rotated arm.
//
//   CONFOUND RULED OUT. The rotation really did vary: `xargs -I{}` was verified
//     to substitute inside the single-quoted `sh -c` string, so 80 genuinely
//     distinct headers went out.
//
// CONCLUSION: a client-supplied x-real-ip does NOT reach this function on
// Vercel. The edge overwrites it. The per-IP ceilings are real and source 1 is
// safe to prefer.
//
// HOW TO RE-TEST IT, because this is a PLATFORM property and platforms change.
// The shape is the three steps above and the middle one is not optional — a run
// with no positive control cannot tell "the header was ignored" apart from "the
// limiter never ran". Fire N > ceiling concurrent requests at one /api/v1 route
// with a well-formed invalid bearer, once with a fixed x-real-ip (expect 429s
// after `ceiling` responses) and once with a rotated one (expect the SAME
// result). Two different results would mean the header is believed, and every
// per-IP ceiling in this repo would have to be re-keyed onto the last segment of
// x-forwarded-for that day.
//
// A NOTE ON WHAT THE MEASUREMENT ALSO SETTLED, because it is cited elsewhere:
// the bearer SHAPE check precedes the limiter on every `/api/v1` route, so a
// caller with no token costs no counter write and never reaches GoTrue. Only a
// well-formed invalid token spends the bucket — and therefore only a
// well-formed invalid token can force the GoTrue round-trip the write family's
// docblock prices in.
//
// This function accepts a Headers / ReadonlyHeaders object (the value returned
// by next/headers `headers()`, already awaited) so it stays synchronous and
// pure — easy to unit-test without touching next/headers.
// ---------------------------------------------------------------------------

/** Minimal header-bag shape compatible with both Headers and ReadonlyHeaders. */
export interface HeaderGetter {
  get(name: string): string | null;
}

/**
 * Returns the trusted caller IP from the request headers.
 *
 * Priority:
 *   1. x-real-ip (edge-overwritten; measured not spoofable — see above)
 *   2. last non-empty segment of x-forwarded-for (edge-appended hop)
 *   3. "unknown"
 */
export function callerIp(hdrs: HeaderGetter): string {
  // 1. x-real-ip — Vercel's trusted edge IP header. A client-supplied value
  //    does not survive the edge; measured 2026-08-26 against dim-staging with
  //    a positive control, and the method to re-run it is in the block above.
  //    Behind NO edge (a bare `next start`, a direct invocation) nothing
  //    overwrites it and this line will believe whatever arrives — which is why
  //    the local probe can still ask for a fresh bucket, and why an origin
  //    without a rewriting proxy in front of it must never be exposed.
  const realIp = hdrs.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // 2. Last segment of x-forwarded-for — the edge appends the observed source
  //    IP as the rightmost entry. DO NOT take the first segment: it is set by
  //    the client and can be freely spoofed to bypass per-IP rate limits.
  const xff = hdrs.get("x-forwarded-for");
  if (xff) {
    const segments = xff.split(",");
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].trim();
      if (seg) return seg;
    }
  }

  return "unknown";
}

export type RateLimitConfig = {
  maxPerMinute?: number;
  maxPerHour?: number;
  maxPerDay?: number;
};

export class RateLimitError extends Error {
  resetAt: Date;
  reason: string;
  constructor(resetAt: Date, reason: string) {
    super(`Rate limit exceeded: ${reason}`);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
    this.reason = reason;
  }
}

export async function enforceRateLimit(
  endpoint: string,
  identifier: string,
  config: RateLimitConfig,
): Promise<void> {
  const now = Date.now();

  if (config.maxPerMinute !== undefined) {
    const windowStart = Math.floor(now / 60_000) * 60_000;
    const key = `${endpoint}:${identifier}:minute:${windowStart}`;
    await consumeOrThrow(key, new Date(windowStart + 60_000), config.maxPerMinute);
  }

  if (config.maxPerHour !== undefined) {
    const windowStart = Math.floor(now / 3_600_000) * 3_600_000;
    const key = `${endpoint}:${identifier}:hour:${windowStart}`;
    await consumeOrThrow(key, new Date(windowStart + 3_600_000), config.maxPerHour);
  }

  if (config.maxPerDay !== undefined) {
    const windowStart = Math.floor(now / 86_400_000) * 86_400_000;
    const key = `${endpoint}:${identifier}:day:${windowStart}`;
    await consumeOrThrow(key, new Date(windowStart + 86_400_000), config.maxPerDay);
  }
}

async function consumeOrThrow(bucketKey: string, expiresAt: Date, limit: number): Promise<void> {
  const rows = await db
    .insert(rateLimitBuckets)
    .values({ bucketKey, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  // Guard: the returning() array should always have exactly one row after an
  // INSERT ... ON CONFLICT DO UPDATE. If the driver returns an empty array
  // (connection glitch, driver edge-case) we throw a clear error rather than
  // letting the undefined row cause a confusing TypeError downstream.
  const row = rows[0];
  if (!row) {
    throw new Error(`enforceRateLimit: UPSERT returned no rows for key "${bucketKey}"`);
  }

  if (row.count > limit) {
    throw new RateLimitError(expiresAt, `${bucketKey} (count=${row.count}, limit=${limit})`);
  }
}

/** Maximum expired rate-limit buckets deleted per cleanup call. */
export const RATE_LIMIT_CLEANUP_BATCH_SIZE = 500;

// Cleanup helper — deletes ONE bounded batch of expired buckets and returns the
// count. An unbounded DELETE on this table can hold locks past the cron's
// function budget when a backlog accumulates (review 23 fleet extension), so
// each call is capped at RATE_LIMIT_CLEANUP_BATCH_SIZE and the caller drains
// (see runDataLifecyclePurge). drizzle does not expose DELETE … LIMIT, so we use
// the same subquery-LIMIT pattern as lib/infra/data-lifecycle.ts.
export async function cleanupExpiredBuckets(): Promise<number> {
  const cutoff = new Date().toISOString();
  const result = (await db.execute(
    sql`
      DELETE FROM rate_limit_buckets
      WHERE bucket_key IN (
        SELECT bucket_key FROM rate_limit_buckets
        WHERE expires_at < ${cutoff}::timestamptz
        LIMIT ${RATE_LIMIT_CLEANUP_BATCH_SIZE}
      )
      RETURNING bucket_key
    `,
  )) as Array<{ bucket_key: string }>;
  return result.length;
}
