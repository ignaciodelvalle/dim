// Data-lifecycle purge helpers — called by /api/cron/data-lifecycle.
//
// Three conservative purges, all batched to avoid long table locks:
//   1. purgeExpiredNotifications  — DELETE notifications WHERE expires_at < now()
//   2. purgeExpiredRateLimitBuckets — delegates to cleanupExpiredBuckets() already
//      declared in lib/rate-limit.ts; re-exported here for symmetry.
//   3. purgeOldCronRuns           — DELETE cron_runs older than CRON_RUNS_TTL_DAYS.
//
// retention_until tables (profiles, pets, pet_identifications, custody_disputes):
//   All four carry Ley 25.326 PII. No retention policy has been defined in any
//   design doc. These columns are intentionally left inert pending a
//   product/legal decision. DO NOT add purge logic here without explicit sign-off.
//
// Batch size is intentionally small (PURGE_BATCH_SIZE = 500) so each DELETE
// acquires fewer locks and the cron stays within Vercel's 10 s function budget
// even on large tables. Rows accumulate slowly enough that a single daily pass
// is sufficient for all three targets.

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { RATE_LIMIT_CLEANUP_BATCH_SIZE, cleanupExpiredBuckets } from "@/lib/infra/rate-limit";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delete cron_runs rows older than this many days. 90 days is generous for
 *  /admin/sistema to still show a meaningful history while bounding table growth. */
export const CRON_RUNS_TTL_DAYS = 90;

/** Maximum rows deleted per purge DELETE call. */
const PURGE_BATCH_SIZE = 500;

/** Wall-clock budget for the composite drain (ms). Keeps the daily run inside
 *  Vercel's 60 s function budget while still draining a large backlog. */
const MAX_DURATION_MS = 45_000;

/**
 * Repeatedly runs a single-batch purge `step` until it deletes fewer than
 * `batchSize` rows (backlog drained) or the wall-clock deadline passes. Each
 * step is its own bounded DELETE, so lock duration stays small even while a
 * large backlog drains across many iterations within one run (review 23 fleet
 * extension — previously each target ran ONE 500-row batch per day).
 */
async function drainPurge(
  step: () => Promise<number>,
  batchSize: number,
  deadlineMs: number,
): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await step();
    total += deleted;
    if (deleted < batchSize || Date.now() >= deadlineMs) break;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Purge helpers
// ---------------------------------------------------------------------------

/**
 * Deletes notifications whose expires_at is in the past.
 * Returns the count of deleted rows.
 */
export async function purgeExpiredNotifications(): Promise<number> {
  const cutoff = new Date().toISOString();
  // Batched via subquery LIMIT (same pattern as purgeOldCronRuns) so a large
  // backlog of expired rows cannot hold locks past the cron's function budget.
  const result = (await db.execute(
    sql`
      DELETE FROM notifications
      WHERE id IN (
        SELECT id FROM notifications
        WHERE expires_at IS NOT NULL
          AND expires_at < ${cutoff}::timestamptz
        LIMIT ${PURGE_BATCH_SIZE}
      )
      RETURNING id
    `,
  )) as Array<{ id: string }>;
  return result.length;
}

/**
 * Deletes stale rate-limit buckets whose expiry window has passed.
 * Delegates to the existing cleanupExpiredBuckets() in lib/rate-limit.ts.
 * Returns the count of deleted rows.
 */
export async function purgeExpiredRateLimitBuckets(): Promise<number> {
  return cleanupExpiredBuckets();
}

/**
 * Deletes cron_runs rows that finished more than CRON_RUNS_TTL_DAYS ago.
 * Only terminal rows (status = 'ok' | 'failed') are eligible; we never
 * delete 'running' rows — those are either in-flight or stuck (visible
 * for debugging). Capped at PURGE_BATCH_SIZE to limit lock duration.
 *
 * Returns the count of deleted rows.
 */
export async function purgeOldCronRuns(): Promise<number> {
  const cutoffMs = Date.now() - CRON_RUNS_TTL_DAYS * 24 * 60 * 60 * 1000;
  // Pass as ISO string — the postgres driver used by Drizzle requires string
  // literals for timestamptz parameters in db.execute() raw SQL calls.
  const cutoff = new Date(cutoffMs).toISOString();

  // Postgres-native batched DELETE with a subquery so we can apply LIMIT.
  // drizzle-orm does not expose DELETE … LIMIT natively; this raw fragment
  // is the standard workaround pattern used elsewhere in this codebase.
  const result = (await db.execute(
    sql`
      DELETE FROM cron_runs
      WHERE id IN (
        SELECT id FROM cron_runs
        WHERE status IN ('ok', 'failed')
          AND started_at < ${cutoff}::timestamptz
        LIMIT ${PURGE_BATCH_SIZE}
      )
      RETURNING id
    `,
  )) as Array<{ id: string }>;

  return result.length;
}

// ---------------------------------------------------------------------------
// Composite runner (called by the cron route)
// ---------------------------------------------------------------------------

export interface DataLifecycleResult {
  notificationsDeleted: number;
  rateLimitBucketsDeleted: number;
  cronRunsDeleted: number;
}

/**
 * Runs all three purges in sequence. Each is independent — a failure in one
 * does not abort the others (the route handles per-section error logging).
 * Returns per-section counts for the cron_runs.details payload.
 */
export async function runDataLifecyclePurge(): Promise<DataLifecycleResult> {
  const deadlineMs = Date.now() + MAX_DURATION_MS;
  // Each target drains its full backlog (bounded per-batch) within the shared
  // wall-clock budget instead of clearing at most one 500-row batch per day.
  const notificationsDeleted = await drainPurge(
    purgeExpiredNotifications,
    PURGE_BATCH_SIZE,
    deadlineMs,
  );
  const rateLimitBucketsDeleted = await drainPurge(
    purgeExpiredRateLimitBuckets,
    RATE_LIMIT_CLEANUP_BATCH_SIZE,
    deadlineMs,
  );
  const cronRunsDeleted = await drainPurge(purgeOldCronRuns, PURGE_BATCH_SIZE, deadlineMs);

  return { notificationsDeleted, rateLimitBucketsDeleted, cronRunsDeleted };
}
