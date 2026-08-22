// Integration tests for the data-lifecycle purge logic (ARCH-G).
//
// Tests call the lib functions directly (not the HTTP route) so they exercise
// the real purge SQL against the local Supabase DB. The HTTP-layer auth guard
// is already proven by the existing cron-auto-expire-approvals test pattern.
//
// Coverage:
//   1. purgeExpiredNotifications — expired rows deleted, fresh rows untouched.
//   2. purgeExpiredRateLimitBuckets — expired buckets deleted, live ones kept.
//   3. purgeOldCronRuns — old terminal rows deleted, recent and running rows kept.
//   4. runDataLifecyclePurge — composite; returns summed counts.

import { createClient } from "@supabase/supabase-js";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cronRuns, db, notifications, profiles, pushSubscriptions, rateLimitBuckets } from "@/db";
import {
  CRON_RUNS_CLEANUP_MAX_BATCHES,
  CRON_RUNS_TTL_DAYS,
  NOTIFICATIONS_CLEANUP_MAX_BATCHES,
  PUSH_SUBSCRIPTIONS_CLEANUP_MAX_BATCHES,
  PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS,
  RATE_LIMIT_CLEANUP_MAX_BATCHES,
  drainPurge,
  purgeExpiredNotifications,
  purgeExpiredRateLimitBuckets,
  purgeOldCronRuns,
  purgeRevokedPushSubscriptions,
  runDataLifecyclePurge,
} from "@/lib/infra/data-lifecycle";

// ---------------------------------------------------------------------------
// Test auth bootstrap — we need a real user profile because notifications
// has a NOT NULL FK to profiles.id.
// ---------------------------------------------------------------------------

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const TEST_EMAIL = "data-lifecycle-test@dim-test.local";
const TEST_PASS = "DataLifecycle_2026!";

let testUserId: string;

async function purgeTestUser() {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === TEST_EMAIL);
  if (!found) return;
  await db
    .delete(notifications)
    .where(eq(notifications.userId, found.id))
    .catch(() => {});
  await db
    .delete(profiles)
    .where(eq(profiles.id, found.id))
    .catch(() => {});
  await supabase.auth.admin.deleteUser(found.id);
}

beforeAll(async () => {
  await purgeTestUser();
  const { data, error } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  testUserId = data.user.id;
});

afterAll(async () => {
  // Clean up anything the tests may have left behind.
  await db
    .delete(notifications)
    .where(eq(notifications.userId, testUserId))
    .catch(() => {});
  await db
    .delete(rateLimitBuckets)
    .where(like(rateLimitBuckets.bucketKey, "dlc_test_%"))
    .catch(() => {});
  await db
    .delete(cronRuns)
    .where(like(cronRuns.cronName, "dlc_test_%"))
    .catch(() => {});
  await db
    .delete(pushSubscriptions)
    .where(like(pushSubscriptions.endpoint, "https://push.dlc-test.local/%"))
    .catch(() => {});
  await purgeTestUser();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a notification for the test user with a given expiresAt. */
async function insertNotification(expiresAt: Date | null): Promise<string> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: testUserId,
      notificationType: "dlc_test",
      title: "DLC test notification",
      severity: "info",
      expiresAt: expiresAt ?? undefined,
    })
    .returning({ id: notifications.id });
  return row.id;
}

/** Insert a rate-limit bucket with a given expiresAt. */
async function insertBucket(key: string, expiresAt: Date): Promise<void> {
  await db
    .insert(rateLimitBuckets)
    .values({ bucketKey: key, count: 1, expiresAt })
    .onConflictDoNothing();
}

/** Insert a cron_run with a given startedAt and status. */
async function insertCronRun(
  startedAt: Date,
  status: "ok" | "failed" | "running",
): Promise<string> {
  const [row] = await db
    .insert(cronRuns)
    .values({
      cronName: "dlc_test_cron",
      startedAt,
      finishedAt: status !== "running" ? new Date(startedAt.getTime() + 1000) : undefined,
      status,
    })
    .returning({ id: cronRuns.id });
  return row.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("purgeExpiredNotifications", () => {
  it("deletes expired notifications and leaves fresh ones untouched", async () => {
    const past = new Date(Date.now() - 1000); // 1 second ago
    const future = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const expiredId = await insertNotification(past);
    const freshId = await insertNotification(future);
    const noExpiryId = await insertNotification(null); // no expiry — must never be touched

    const deleted = await purgeExpiredNotifications();

    expect(deleted).toBeGreaterThanOrEqual(1);

    // Expired row must be gone.
    const expiredRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, expiredId));
    expect(expiredRows).toHaveLength(0);

    // Fresh row must remain.
    const freshRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, freshId));
    expect(freshRows).toHaveLength(1);

    // No-expiry row must remain.
    const noExpiryRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, noExpiryId));
    expect(noExpiryRows).toHaveLength(1);

    // Cleanup
    await db
      .delete(notifications)
      .where(eq(notifications.id, freshId))
      .catch(() => {});
    await db
      .delete(notifications)
      .where(eq(notifications.id, noExpiryId))
      .catch(() => {});
  });

  it("is idempotent — running twice on already-expired rows is a no-op on the second run", async () => {
    const past = new Date(Date.now() - 1000);
    const id = await insertNotification(past);

    const first = await purgeExpiredNotifications();
    expect(first).toBeGreaterThanOrEqual(1);

    // Row should be gone already.
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, id));
    expect(rows).toHaveLength(0);

    // Second run finds nothing to delete for this row.
    const second = await purgeExpiredNotifications();
    // May be 0 or higher depending on other concurrent test data; the
    // important thing is no error and the row stays gone.
    expect(second).toBeGreaterThanOrEqual(0);
  });
});

describe("purgeExpiredRateLimitBuckets", () => {
  it("deletes expired buckets and keeps live ones", async () => {
    const expiredKey = `dlc_test_rl_expired_${Date.now()}`;
    const liveKey = `dlc_test_rl_live_${Date.now()}`;

    await insertBucket(expiredKey, new Date(Date.now() - 1000)); // past
    await insertBucket(liveKey, new Date(Date.now() + 3_600_000)); // future

    // The purge deletes in bounded batches and the caller is expected to
    // drain (see cleanupExpiredBuckets). Under the full parallel suite,
    // sibling tests create their own expired buckets that can fill a batch
    // ahead of ours — drain until empty so the assertion is order-immune.
    let deleted = 0;
    for (let batch = await purgeExpiredRateLimitBuckets(); batch > 0; ) {
      deleted += batch;
      batch = await purgeExpiredRateLimitBuckets();
    }
    expect(deleted).toBeGreaterThanOrEqual(1);

    // Expired bucket gone.
    const expiredRows = await db
      .select({ key: rateLimitBuckets.bucketKey })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.bucketKey, expiredKey));
    expect(expiredRows).toHaveLength(0);

    // Live bucket present.
    const liveRows = await db
      .select({ key: rateLimitBuckets.bucketKey })
      .from(rateLimitBuckets)
      .where(eq(rateLimitBuckets.bucketKey, liveKey));
    expect(liveRows).toHaveLength(1);

    // Cleanup
    await db
      .delete(rateLimitBuckets)
      .where(eq(rateLimitBuckets.bucketKey, liveKey))
      .catch(() => {});
  });
});

describe("purgeOldCronRuns", () => {
  it("deletes old terminal rows and keeps recent and running rows", async () => {
    const oldDate = new Date(Date.now() - (CRON_RUNS_TTL_DAYS + 1) * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const oldOkId = await insertCronRun(oldDate, "ok");
    const oldFailedId = await insertCronRun(oldDate, "failed");
    const recentOkId = await insertCronRun(recentDate, "ok");
    // Running rows must never be deleted regardless of age.
    const oldRunningId = await insertCronRun(oldDate, "running");

    const deleted = await purgeOldCronRuns();
    expect(deleted).toBeGreaterThanOrEqual(2);

    // Old terminal rows must be gone.
    for (const id of [oldOkId, oldFailedId]) {
      const rows = await db.select({ id: cronRuns.id }).from(cronRuns).where(eq(cronRuns.id, id));
      expect(rows).toHaveLength(0);
    }

    // Recent ok row must remain.
    const recentRows = await db
      .select({ id: cronRuns.id })
      .from(cronRuns)
      .where(eq(cronRuns.id, recentOkId));
    expect(recentRows).toHaveLength(1);

    // Old running row must remain (we never delete 'running').
    const runningRows = await db
      .select({ id: cronRuns.id })
      .from(cronRuns)
      .where(eq(cronRuns.id, oldRunningId));
    expect(runningRows).toHaveLength(1);

    // Cleanup leftover rows.
    await db
      .delete(cronRuns)
      .where(eq(cronRuns.id, recentOkId))
      .catch(() => {});
    await db
      .delete(cronRuns)
      .where(eq(cronRuns.id, oldRunningId))
      .catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// The drain loop itself — bounded, and honest about what it did not finish
// ---------------------------------------------------------------------------
//
// `cleanupExpiredBuckets` deletes ONE 500-row batch and its own comment says
// "the caller drains". This is that caller, and the properties that matter are
// arithmetic rather than SQL: it must keep going while batches come back full,
// stop the moment one comes back short, and — the part that was missing — SAY
// SO when it stopped with work still on the table. A purge that quietly ran out
// of budget and reported a tidy number is indistinguishable from one that
// finished, which is how a table grows for months under a green cron.
//
// Driven by a FAKE step, deliberately: seeding 20,000 expired buckets to prove
// the cap would take longer than the cap it is proving.

describe("drainPurge", () => {
  /** A step that returns the given batch sizes in order, then 0. */
  function fakeStep(sizes: number[]) {
    let i = 0;
    const calls: number[] = [];
    return {
      calls,
      step: async () => {
        const n = sizes[i] ?? 0;
        i += 1;
        calls.push(n);
        return n;
      },
    };
  }

  const NO_DEADLINE = Number.POSITIVE_INFINITY;

  it("drains until a batch comes back SHORT, and sums every batch", async () => {
    const fake = fakeStep([500, 500, 120]);

    const result = await drainPurge(fake.step, 500, NO_DEADLINE);

    expect(fake.calls).toEqual([500, 500, 120]);
    expect(result.deleted).toBe(1120);
    expect(result.batches).toBe(3);
    // 120 < 500 means the backlog is gone — nothing left to come back for.
    expect(result.backlogged).toBe(false);
  });

  it("stops at the batch cap and FLAGS that a backlog remains", async () => {
    // Every batch full: the table has more than the cap can take in one run.
    const fake = fakeStep(Array(50).fill(500));

    const result = await drainPurge(fake.step, 500, NO_DEADLINE, 3);

    expect(fake.calls).toHaveLength(3);
    expect(result.deleted).toBe(1500);
    // THE POINT. Without this the cron row reads "1500 deleted" and looks like
    // a completed purge on a table that is still growing.
    expect(result.backlogged).toBe(true);
  });

  /** A clock that returns the given readings in order, then the last one forever. */
  function readings(values: number[]) {
    let i = 0;
    return () => {
      const v = values[Math.min(i, values.length - 1)];
      i += 1;
      return v;
    };
  }

  it("stops at the wall-clock deadline and FLAGS the backlog too", async () => {
    const fake = fakeStep(Array(50).fill(500));

    // Entry reading 0 (before the deadline of 1), then 2 after the first batch:
    // one batch runs, and the loop sees it is out of time.
    const result = await drainPurge(fake.step, 500, 1, Number.POSITIVE_INFINITY, readings([0, 2]));

    expect(fake.calls).toHaveLength(1);
    expect(result.batches).toBe(1);
    expect(result.backlogged).toBe(true);
  });

  it("issues NO batch when the deadline has already passed at entry — a zero share is no time, not one free batch", async () => {
    // The composite hands each target `now + share`; a share of 0 ms makes the
    // deadline equal to the entry reading. Until 2026-08-22 the first batch ran
    // anyway ("a night with no budget left is not a night where nothing
    // moves"), which meant a DELETE issued under a budget the dispatcher had
    // already spent — the one thing the handed-down budget exists to prevent.
    // Now: no time means no DELETE, and the flags say the table was not
    // touched. Both the equal case (share 0) and the already-past case.
    for (const deadline of [1000, 999]) {
      const fake = fakeStep(Array(50).fill(500));
      const result = await drainPurge(
        fake.step,
        500,
        deadline,
        Number.POSITIVE_INFINITY,
        () => 1000,
      );
      expect(fake.calls, `deadline ${deadline} at now=1000`).toEqual([]);
      expect(result).toEqual({ deleted: 0, batches: 0, backlogged: true });
    }
  });

  it("a POSITIVE share, however small, still runs one batch — forward progress is the share's, not the clock's", async () => {
    const fake = fakeStep(Array(50).fill(500));

    // Deadline 1 ms after the entry reading: the batch runs, then the loop
    // reads the clock past the deadline and is out of time. The distinction
    // is `>=` at entry, not a threshold.
    const result = await drainPurge(
      fake.step,
      500,
      1001,
      Number.POSITIVE_INFINITY,
      readings([1000, 1001]),
    );

    expect(fake.calls).toHaveLength(1);
    expect(result.batches).toBe(1);
    expect(result.backlogged).toBe(true);
  });

  it("reports NO backlog when the very first batch is short", async () => {
    const fake = fakeStep([0]);

    const result = await drainPurge(fake.step, 500, NO_DEADLINE);

    expect(fake.calls).toEqual([0]);
    expect(result.deleted).toBe(0);
    expect(result.backlogged).toBe(false);
  });

  it("caps the rate-limit drain at a number that fits the cron's real budget", () => {
    // vercel.json gives every app/api/cron/*/route.ts 60 s — NOT Vercel's 300 s
    // default — and app/api/cron/daily/route.ts fans out to ~10 jobs inside a
    // 55 s budget, of which this is one. So the cap is the STATED worst case for
    // one target of one job, and the shared wall-clock deadline is what actually
    // stops a slow run. A cap large enough to eat the whole dispatcher budget
    // would make every job after data_lifecycle "skipped_budget" every night.
    expect(RATE_LIMIT_CLEANUP_MAX_BATCHES).toBeGreaterThanOrEqual(10);
    expect(RATE_LIMIT_CLEANUP_MAX_BATCHES).toBeLessThanOrEqual(60);
  });
});

// ---------------------------------------------------------------------------
// push_subscriptions — the fourth target (RN re-run HIGH, 2026-08-22)
// ---------------------------------------------------------------------------
//
// Revocation is SOFT (revoked_at): the user toggled push off, or the push
// service answered 404/410. The row stays as an auditable trail, and nothing
// ever deleted it — hard deletion existed only through the profiles cascade
// and erase_subject_data(). A revoked row older than the TTL has served its
// purpose. A LIVE row is never pruned on `last_used_at` alone: that column
// means "we last delivered an urgent push here", and a quiet pet's owner can
// go months without one while the browser registration is perfectly valid.
// The push service's 404/410 is the honest staleness signal, and it already
// flips revoked_at — so the revoked path catches abandoned browsers too.

describe("purgeRevokedPushSubscriptions", () => {
  async function insertPush(suffix: string, revokedAt: Date | null): Promise<string> {
    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId: testUserId,
        endpoint: `https://push.dlc-test.local/${suffix}-${Date.now()}`,
        p256dh: "p256dh-test",
        auth: "auth-test",
        revokedAt: revokedAt ?? undefined,
      })
      .returning({ id: pushSubscriptions.id });
    return row.id;
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  it("deletes revoked rows older than the TTL and keeps live and recently-revoked rows", async () => {
    const staleId = await insertPush(
      "stale",
      new Date(Date.now() - (PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS + 1) * DAY_MS),
    );
    const recentId = await insertPush("recent", new Date(Date.now() - 1 * DAY_MS));
    const liveId = await insertPush("live", null);

    const deleted = await purgeRevokedPushSubscriptions();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, testUserId));
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(staleId);
    expect(ids).toContain(recentId);
    // THE POINT: a live registration with no delivery on record is not stale.
    expect(ids).toContain(liveId);
  });

  it("keeps the TTL long enough for the device list to still explain a revocation", () => {
    expect(PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS).toBeGreaterThanOrEqual(14);
    expect(PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS).toBeLessThanOrEqual(90);
  });
});

// ---------------------------------------------------------------------------
// The composite: order, caps and the fair share — driven by FAKE purgers
// ---------------------------------------------------------------------------
//
// Same reasoning as the drainPurge suite: the properties here are arithmetic
// (which target ran first, how many batches each was allowed, how the deadline
// was split), and seeding tens of thousands of rows to prove them would cost
// more than the caps they prove. The real SQL is exercised by the integration
// cases below.

describe("runDataLifecyclePurge — order, caps and fair share (fake purgers)", () => {
  /** A purger that always returns a FULL batch (an endless backlog), counting calls. */
  function endless(batchSize: number, calls: string[], name: string) {
    return async () => {
      calls.push(name);
      return batchSize;
    };
  }

  /** A clock that advances `stepMs` per reading, so each batch "costs" time. */
  function ticking(stepMs: number) {
    let t = 1_000_000;
    return () => {
      const v = t;
      t += stepMs;
      return v;
    };
  }

  it("drains rate_limit_buckets FIRST — the fastest-filling, attacker-influenced table", async () => {
    const calls: string[] = [];
    await runDataLifecyclePurge({
      maxDurationMs: Number.POSITIVE_INFINITY,
      now: ticking(0),
      purgers: {
        rateLimitBuckets: async () => {
          calls.push("rate_limit_buckets");
          return 0;
        },
        notifications: async () => {
          calls.push("notifications");
          return 0;
        },
        pushSubscriptions: async () => {
          calls.push("push_subscriptions");
          return 0;
        },
        cronRuns: async () => {
          calls.push("cron_runs");
          return 0;
        },
      },
    });
    expect(calls).toEqual([
      "rate_limit_buckets",
      "notifications",
      "push_subscriptions",
      "cron_runs",
    ]);
  });

  it("caps EVERY target, notifications included, and flags each one that hit its cap", async () => {
    const calls: string[] = [];
    const result = await runDataLifecyclePurge({
      maxDurationMs: Number.POSITIVE_INFINITY,
      now: ticking(0),
      purgers: {
        rateLimitBuckets: endless(500, calls, "b"),
        notifications: endless(500, calls, "n"),
        pushSubscriptions: endless(500, calls, "p"),
        cronRuns: endless(500, calls, "c"),
      },
    });

    const count = (name: string) => calls.filter((c) => c === name).length;
    expect(count("b")).toBe(RATE_LIMIT_CLEANUP_MAX_BATCHES);
    // THE FIX: notifications used to drain UNCAPPED under the shared deadline,
    // so an expired-notification backlog could eat the whole run before the
    // bucket table — the one that actually fills — got a turn.
    expect(count("n")).toBe(NOTIFICATIONS_CLEANUP_MAX_BATCHES);
    expect(count("p")).toBe(PUSH_SUBSCRIPTIONS_CLEANUP_MAX_BATCHES);
    expect(count("c")).toBe(CRON_RUNS_CLEANUP_MAX_BATCHES);
    expect(result.backlogged).toEqual({
      rateLimitBuckets: true,
      notifications: true,
      pushSubscriptions: true,
      cronRuns: true,
    });
    expect(result.notificationsDeleted).toBe(NOTIFICATIONS_CLEANUP_MAX_BATCHES * 500);
  });

  it("splits the deadline FAIRLY: a backlogged first target cannot starve the ones after it", async () => {
    // 40 s budget, every batch costs 1 s, every target has an endless backlog,
    // caps far above what the budget allows. Under the OLD shared deadline the
    // first target would have run ~40 batches and the other three would have
    // got one batch each (the loop always runs one before checking the
    // clock). Under the fair share each target gets (what is left) / (targets
    // still to run): 10 s, then 10 s, then 10 s, then the rest.
    const calls: string[] = [];
    const result = await runDataLifecyclePurge({
      maxDurationMs: 40_000,
      now: ticking(1_000),
      purgers: {
        rateLimitBuckets: endless(500, calls, "b"),
        notifications: endless(500, calls, "n"),
        pushSubscriptions: endless(500, calls, "p"),
        cronRuns: endless(500, calls, "c"),
      },
    });

    const count = (name: string) => calls.filter((c) => c === name).length;
    // Each target drained for roughly its quarter — not one, not forty.
    for (const name of ["b", "n", "p", "c"]) {
      expect(count(name)).toBeGreaterThanOrEqual(5);
      expect(count(name)).toBeLessThanOrEqual(15);
    }
    expect(result.backlogged.cronRuns).toBe(true);
  });

  it("issues NOTHING when the budget is already spent — every target reports a backlog, no DELETE runs", async () => {
    // A 0 ms budget: every target's fair share is 0, every deadline is its own
    // entry instant, and drainPurge refuses at entry. Until 2026-08-22 this ran
    // one batch per target ("b", "n", "p", "c") — four DELETEs under a budget
    // the dispatcher had already spent. The zero leftover is handed forward
    // unchanged (0 / targets left is still 0), so the later targets do not
    // inherit a phantom share either.
    const calls: string[] = [];
    const result = await runDataLifecyclePurge({
      maxDurationMs: 0,
      now: ticking(1),
      purgers: {
        rateLimitBuckets: endless(500, calls, "b"),
        notifications: endless(500, calls, "n"),
        pushSubscriptions: endless(500, calls, "p"),
        cronRuns: endless(500, calls, "c"),
      },
    });
    expect(calls).toEqual([]);
    expect(result.backlogged).toEqual({
      rateLimitBuckets: true,
      notifications: true,
      pushSubscriptions: true,
      cronRuns: true,
    });
    expect(result.rateLimitBucketsDeleted + result.notificationsDeleted).toBe(0);
  });
});

describe("runDataLifecyclePurge", () => {
  it("returns counts for all four sections", async () => {
    // Seed one expired row in each category.
    await insertNotification(new Date(Date.now() - 1000));
    await insertBucket(`dlc_test_composite_${Date.now()}`, new Date(Date.now() - 1000));
    await insertCronRun(
      new Date(Date.now() - (CRON_RUNS_TTL_DAYS + 1) * 24 * 60 * 60 * 1000),
      "ok",
    );
    await db.insert(pushSubscriptions).values({
      userId: testUserId,
      endpoint: `https://push.dlc-test.local/composite-${Date.now()}`,
      p256dh: "p256dh-test",
      auth: "auth-test",
      revokedAt: new Date(
        Date.now() - (PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS + 1) * 24 * 60 * 60 * 1000,
      ),
    });

    const result = await runDataLifecyclePurge();

    expect(result).toHaveProperty("notificationsDeleted");
    expect(result).toHaveProperty("rateLimitBucketsDeleted");
    expect(result).toHaveProperty("cronRunsDeleted");
    expect(result).toHaveProperty("pushSubscriptionsDeleted");
    expect(result.notificationsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.rateLimitBucketsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.cronRunsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.pushSubscriptionsDeleted).toBeGreaterThanOrEqual(1);
  });

  it("reports per-target backlog so a run that ran out of budget says so", async () => {
    await insertBucket(`dlc_test_backlog_${Date.now()}`, new Date(Date.now() - 1000));

    const result = await runDataLifecyclePurge();

    // The shape, not the value: on a dev DB the four targets drain in one
    // batch each, so all four read false. What must exist is the CHANNEL — a
    // cron row that can only say "N deleted" cannot distinguish a finished
    // purge from one that stopped at the cap on a table still filling up.
    expect(result.backlogged).toEqual({
      notifications: expect.any(Boolean),
      rateLimitBuckets: expect.any(Boolean),
      cronRuns: expect.any(Boolean),
      pushSubscriptions: expect.any(Boolean),
    });
  });
});
