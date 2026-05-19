// Two rate-limit implementations live here.
//
// 1. `makeMemoryRateLimiter` — per-worker in-memory, used for short-window
//    server actions where multi-worker drift is acceptable (≤5 min windows).
//    LIMITATION: per-worker only; serverless cold starts reset the store.
//
// 2. `enforceRateLimit` (below) — persistent, backed by `rate_limit_buckets`.
//    Use this when the limit must hold across workers / cold starts, e.g.
//    anonymous welfare report submissions. Atomic UPSERT prevents races.
//
// Usage (memory):
//   const limiter = makeMemoryRateLimiter(5 * 60 * 1000);
//   const result = limiter.check(`${ip}:${publicToken}`);
//   if (!result.allowed) return { error: "RATE_LIMITED" };
//
// Usage (persistent):
//   try {
//     await enforceRateLimit("welfare_anon", ip, { maxPerHour: 3, maxPerMinute: 1 });
//   } catch (err) {
//     if (err instanceof RateLimitError) return { error: "rate_limited" };
//     throw err;
//   }

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

export interface MemoryRateLimiter {
  /**
   * Checks whether the key is allowed to proceed.
   *
   * @param key     - Unique string identifying the caller+resource pair.
   * @param now     - Timestamp in ms. Defaults to Date.now(). Injecting this
   *                  allows tests to advance the clock without real timers.
   */
  check(key: string, now?: number): RateLimitResult;
}

/**
 * Creates a rate limiter that allows one request per key per `windowMs`.
 *
 * The first call for a key within a window is always allowed and records the
 * timestamp. Subsequent calls within the same window are rejected with the
 * milliseconds remaining until the window expires.
 *
 * After the window expires the key is treated as fresh (allowed again).
 */
export function makeMemoryRateLimiter(windowMs: number): MemoryRateLimiter {
  // key → timestamp of the first (allowed) call in the current window
  const store = new Map<string, number>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const lastAllowedAt = store.get(key);

      if (lastAllowedAt !== undefined) {
        const elapsed = now - lastAllowedAt;
        if (elapsed < windowMs) {
          return { allowed: false, retryAfterMs: windowMs - elapsed };
        }
      }

      // First call or window expired — allow and record.
      store.set(key, now);
      return { allowed: true };
    },
  };
}

// ---------------------------------------------------------------------------
// Persistent rate limiter — backed by rate_limit_buckets
// ---------------------------------------------------------------------------

import { db, rateLimitBuckets } from "@/db";
import { lt, sql } from "drizzle-orm";

export type RateLimitConfig = {
  maxPerMinute?: number;
  maxPerHour?: number;
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
}

async function consumeOrThrow(bucketKey: string, expiresAt: Date, limit: number): Promise<void> {
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({ bucketKey, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });

  if (row.count > limit) {
    throw new RateLimitError(expiresAt, `${bucketKey} (count=${row.count}, limit=${limit})`);
  }
}

// Cleanup helper — optional. The bucket table grows slowly (one row per
// window per (endpoint, identifier)); call from a daily cron if needed.
export async function cleanupExpiredBuckets(): Promise<number> {
  const result = await db
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.expiresAt, new Date()))
    .returning({ key: rateLimitBuckets.bucketKey });
  return result.length;
}
