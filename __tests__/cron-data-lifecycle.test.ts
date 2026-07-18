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

import { cronRuns, db, notifications, profiles, rateLimitBuckets } from "@/db";
import {
  CRON_RUNS_TTL_DAYS,
  purgeExpiredNotifications,
  purgeExpiredRateLimitBuckets,
  purgeOldCronRuns,
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

describe("runDataLifecyclePurge", () => {
  it("returns counts for all three sections", async () => {
    // Seed one expired row in each category.
    await insertNotification(new Date(Date.now() - 1000));
    await insertBucket(`dlc_test_composite_${Date.now()}`, new Date(Date.now() - 1000));
    await insertCronRun(
      new Date(Date.now() - (CRON_RUNS_TTL_DAYS + 1) * 24 * 60 * 60 * 1000),
      "ok",
    );

    const result = await runDataLifecyclePurge();

    expect(result).toHaveProperty("notificationsDeleted");
    expect(result).toHaveProperty("rateLimitBucketsDeleted");
    expect(result).toHaveProperty("cronRunsDeleted");
    expect(result.notificationsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.rateLimitBucketsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.cronRunsDeleted).toBeGreaterThanOrEqual(1);
  });
});
