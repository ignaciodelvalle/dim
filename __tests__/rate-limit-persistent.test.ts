// Integration tests for the persistent rate-limit helper. Mirrors the
// in-memory test style — uses the real rate_limit_buckets table so we
// catch UPSERT race semantics that a mock wouldn't.

import { eq, like } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db, rateLimitBuckets } from "@/db";
import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";

async function clearBucketsByPrefix(prefix: string): Promise<void> {
  await db.delete(rateLimitBuckets).where(like(rateLimitBuckets.bucketKey, `${prefix}%`));
}

describe("enforceRateLimit (persistent)", () => {
  afterEach(async () => {
    await clearBucketsByPrefix("test_rl_");
  });

  it("allows calls up to the limit, then throws RateLimitError", async () => {
    const endpoint = "test_rl_basic";
    const id = "alice";
    // limit=3 per hour. First 3 pass, 4th throws.
    await enforceRateLimit(endpoint, id, { maxPerHour: 3 });
    await enforceRateLimit(endpoint, id, { maxPerHour: 3 });
    await enforceRateLimit(endpoint, id, { maxPerHour: 3 });
    await expect(enforceRateLimit(endpoint, id, { maxPerHour: 3 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("disjoint identifiers don't compete", async () => {
    const endpoint = "test_rl_disjoint";
    await enforceRateLimit(endpoint, "user_a", { maxPerHour: 1 });
    // user_b has its own bucket — no throw.
    await enforceRateLimit(endpoint, "user_b", { maxPerHour: 1 });
    // user_a hits its limit:
    await expect(enforceRateLimit(endpoint, "user_a", { maxPerHour: 1 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("disjoint endpoints don't compete", async () => {
    await enforceRateLimit("test_rl_ep1", "alice", { maxPerHour: 1 });
    await enforceRateLimit("test_rl_ep2", "alice", { maxPerHour: 1 });
    // both at their limit — disjoint endpoint keys, no cross-bleed
    await expect(
      enforceRateLimit("test_rl_ep1", "alice", { maxPerHour: 1 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("combines minute and hour windows", async () => {
    const endpoint = "test_rl_combined";
    const id = "bob";
    await enforceRateLimit(endpoint, id, { maxPerMinute: 1, maxPerHour: 5 });
    // 2nd in same minute → throws on the minute window
    await expect(
      enforceRateLimit(endpoint, id, { maxPerMinute: 1, maxPerHour: 5 }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("RateLimitError carries resetAt + reason", async () => {
    const endpoint = "test_rl_meta";
    const id = "carol";
    await enforceRateLimit(endpoint, id, { maxPerHour: 1 });
    try {
      await enforceRateLimit(endpoint, id, { maxPerHour: 1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      const rle = err as RateLimitError;
      expect(rle.resetAt).toBeInstanceOf(Date);
      expect(rle.resetAt.getTime()).toBeGreaterThan(Date.now());
      expect(rle.reason).toContain(endpoint);
    }
  });

  it("stores the bucket key with the right encoding", async () => {
    const endpoint = "test_rl_keyshape";
    const id = "dave";
    await enforceRateLimit(endpoint, id, { maxPerHour: 5 });
    const rows = await db
      .select()
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.bucketKey, "test_rl_keyshape:dave:hour:%"));
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
  });
});
