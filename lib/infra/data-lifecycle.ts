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
// acquires fewer locks and no single statement can hold them past the cron's
// function budget — 60 s per cron route in vercel.json, of which this job gets
// a share of the daily dispatcher's 55 s fan-out.
//
// ONE BATCH IS NOT ONE RUN, and the difference is the whole design. This file
// used to say "rows accumulate slowly enough that a single daily pass is
// sufficient for all three targets"; that was never measured and is false for
// rate_limit_buckets, which every limiter on every anonymous surface writes to
// twice per (key, window). So each target DRAINS — batch after bounded batch —
// under a shared wall-clock deadline, the fastest-filling one also under a hard
// batch cap, and every one of them REPORTS whether it finished. A purge that
// stops early and returns only a count cannot be told apart from one that
// finished, which is how a table grows for months under a green cron.

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
 * Hard batch cap for the rate-limit bucket drain — 40 × 500 = 20,000 rows.
 *
 * WHY A CAP WHEN A DEADLINE ALREADY EXISTS. The deadline is the safety net; the
 * cap is the STATED worst case. `rate_limit_buckets` is the fastest-filling
 * table in the schema — every limiter on every anonymous surface writes two rows
 * per (key, window), and the public credential API alone can write 120 rows a
 * minute per IP — so it is the one target that can plausibly hold more expired
 * rows than a single run should try to take. A drain with no stated ceiling has
 * a worst case of "whatever 45 s buys against the pooler that night", which is
 * not a number anyone can reason about before an incident.
 *
 * WHY 40. The real budget is much smaller than it looks: `vercel.json` gives
 * every cron route handler under `app/api/cron/` a **60 s** maxDuration (NOT
 * Vercel's 300 s default; only refresh-cube is raised to 300), and
 * `app/api/cron/daily/route.ts` fans out to ~10 jobs inside a
 * 55 s wall-clock budget, skipping whatever does not fit. data_lifecycle is ONE
 * of those jobs and drains THREE targets, so a fair share here is single-digit
 * seconds, not 45. 40 batches is ~10× what the old one-batch-per-day pass could
 * clear and still small enough that the shared deadline — not this cap — is what
 * stops a genuinely slow night. Raising it is cheap; raising it without also
 * raising the dispatcher's share just moves the stall to a later job.
 */
export const RATE_LIMIT_CLEANUP_MAX_BATCHES = 40;

/** What one target's drain accomplished, and whether it FINISHED. */
export type DrainOutcome = {
  deleted: number;
  /**
   * True when the loop stopped with a FULL batch behind it — the cap or the
   * deadline cut it short and rows remain. The count alone cannot say this:
   * "20,000 deleted" reads like a completed purge whether the table is now
   * empty or still holds a million rows, and a cron that cannot tell the
   * difference is how a table grows for months under a green dashboard.
   */
  backlogged: boolean;
};

/**
 * Repeatedly runs a single-batch purge `step` until it deletes fewer than
 * `batchSize` rows (backlog drained), the wall-clock deadline passes, or
 * `maxBatches` batches have run. Each step is its own bounded DELETE, so lock
 * duration stays small even while a large backlog drains across many iterations
 * within one run (review 23 fleet extension — previously each target ran ONE
 * 500-row batch per day).
 *
 * Exported for its tests: the properties that matter here are arithmetic (how
 * many times it calls, what it sums, when it reports a backlog), and proving
 * them by seeding 20,000 rows would cost more than the cap it is proving.
 */
export async function drainPurge(
  step: () => Promise<number>,
  batchSize: number,
  deadlineMs: number,
  maxBatches = Number.POSITIVE_INFINITY,
): Promise<DrainOutcome> {
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const batch = await step();
    deleted += batch;
    batches += 1;
    // A SHORT batch is the only proof the backlog is gone: the DELETE takes up
    // to `batchSize` and returns what it got, so anything less means it ran out
    // of eligible rows rather than out of room.
    if (batch < batchSize) return { deleted, backlogged: false };
    if (batches >= maxBatches || Date.now() >= deadlineMs) {
      return { deleted, backlogged: true };
    }
  }
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
  /**
   * Per target: did this run stop with rows still on the table?
   *
   * It rides in `cron_runs.details` and in the route's JSON so /admin/sistema
   * can show "still backlogged" instead of a count that looks like success.
   * The counts alone are ambiguous by construction — see `DrainOutcome`.
   */
  backlogged: {
    notifications: boolean;
    rateLimitBuckets: boolean;
    cronRuns: boolean;
  };
}

/**
 * Runs all three purges in sequence. Each is independent — a failure in one
 * does not abort the others (the route handles per-section error logging).
 * Returns per-section counts for the cron_runs.details payload.
 *
 * THE DEADLINE IS SHARED AND THE ORDER IS THEREFORE A PRIORITY. Whatever the
 * first target spends, the third does not get. Notifications lead because an
 * expired notification is user-visible data; rate-limit buckets follow because
 * that is the fastest-filling table and the only one with its own batch cap;
 * cron_runs is last because 90 days of rows is a debugging convenience, not a
 * correctness property.
 */
export async function runDataLifecyclePurge(): Promise<DataLifecycleResult> {
  const deadlineMs = Date.now() + MAX_DURATION_MS;
  // Each target drains its full backlog (bounded per-batch) within the shared
  // wall-clock budget instead of clearing at most one 500-row batch per day.
  const notifications = await drainPurge(purgeExpiredNotifications, PURGE_BATCH_SIZE, deadlineMs);
  const rateLimitBuckets = await drainPurge(
    purgeExpiredRateLimitBuckets,
    RATE_LIMIT_CLEANUP_BATCH_SIZE,
    deadlineMs,
    RATE_LIMIT_CLEANUP_MAX_BATCHES,
  );
  const cronRuns = await drainPurge(purgeOldCronRuns, PURGE_BATCH_SIZE, deadlineMs);

  return {
    notificationsDeleted: notifications.deleted,
    rateLimitBucketsDeleted: rateLimitBuckets.deleted,
    cronRunsDeleted: cronRuns.deleted,
    backlogged: {
      notifications: notifications.backlogged,
      rateLimitBuckets: rateLimitBuckets.backlogged,
      cronRuns: cronRuns.backlogged,
    },
  };
}
