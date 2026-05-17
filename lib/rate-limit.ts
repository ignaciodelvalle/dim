// In-memory rate limiter for server actions.
//
// LIMITATION: this store is per-worker-process. In a multi-worker deployment
// (e.g., multiple Node.js instances behind a load balancer) each worker tracks
// its own window independently, so a user hitting different workers could
// exceed the intended limit. For v1 (single-worker / serverless cold-start
// semantics) this is acceptable. A future enhancement should replace this with
// a shared store such as Redis or Upstash to enforce limits across workers.
//
// Usage:
//   const limiter = makeMemoryRateLimiter(5 * 60 * 1000); // 5-minute window
//   const result = limiter.check(`${ip}:${publicToken}`);
//   if (!result.allowed) return { error: "RATE_LIMITED" };

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
