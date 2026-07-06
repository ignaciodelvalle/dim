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

import { db, rateLimitBuckets } from "@/db";
import { sql } from "drizzle-orm";

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
//   1. x-real-ip  — set by the edge; never forwarded from the client. Preferred.
//   2. LAST segment of x-forwarded-for  — the edge appends the real observed
//      source IP as the rightmost hop. Prior hops may be spoofed; the last is
//      edge-appended and trustworthy.
//   3. "unknown" — local dev / direct invocation with no proxy headers.
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
 *   1. x-real-ip (edge-set, not spoofable)
 *   2. last non-empty segment of x-forwarded-for (edge-appended hop)
 *   3. "unknown"
 */
export function callerIp(hdrs: HeaderGetter): string {
  // 1. x-real-ip — Vercel's trusted edge IP header.
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
