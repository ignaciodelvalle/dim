// Data-lifecycle purge helpers — called by /api/cron/data-lifecycle.
//
// Four conservative purges, all batched to avoid long table locks, in THIS
// order (the order is a priority — see runDataLifecyclePurge):
//   1. purgeExpiredRateLimitBuckets — delegates to cleanupExpiredBuckets() already
//      declared in lib/rate-limit.ts; re-exported here for symmetry.
//   2. purgeExpiredNotifications    — DELETE notifications WHERE expires_at < now()
//   3. purgeRevokedPushSubscriptions — DELETE push_subscriptions revoked longer ago
//      than PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS.
//   4. purgeOldCronRuns             — DELETE cron_runs older than CRON_RUNS_TTL_DAYS.
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
// under a deadline, under a hard batch cap, and every one of them REPORTS
// whether it finished. A purge that stops early and returns only a count
// cannot be told apart from one that finished, which is how a table grows for
// months under a green cron.
//
// THE BUDGET IS HANDED DOWN, NOT ASSUMED (RN-3 F17 / RN re-run HIGH, 2026-08-22).
// This job used to drain under its own 45 s constant inside a dispatcher whose
// whole budget is 55 s, with no idea how much of the run was already spent. The
// dispatcher now forwards the job's fair share of what is left
// (`x-cron-budget-ms`, lib/infra/cron-dispatcher.ts) and the route passes it in
// as `maxDurationMs`; the 45 s constant is only the ceiling for a standalone
// invocation. Inside the job the SAME arithmetic splits the share across the
// four targets, so a backlog on one table can no longer starve the others.

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { fairShareMs } from "@/lib/infra/cron-dispatcher";
import { RATE_LIMIT_CLEANUP_BATCH_SIZE, cleanupExpiredBuckets } from "@/lib/infra/rate-limit";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delete cron_runs rows older than this many days. 90 days is generous for
 *  /admin/sistema to still show a meaningful history while bounding table growth. */
export const CRON_RUNS_TTL_DAYS = 90;

/**
 * Delete push_subscriptions rows REVOKED longer ago than this many days.
 *
 * Revocation is soft (`revoked_at`): the user toggled push off, or the push
 * service answered 404/410 (lib/infra/web-push.ts). The row stays as an
 * auditable trail, and until this purge nothing ever deleted it — hard deletion
 * existed only through the profiles cascade and erase_subject_data(). Thirty
 * days keeps the trail long enough for a device list or a support question to
 * still explain a revocation, and short enough that the table does not carry
 * every browser anyone ever unsubscribed.
 *
 * A LIVE row is deliberately NOT pruned on `last_used_at`. That column means
 * "we last delivered an urgent push here", not "the browser last used this":
 * a quiet pet's owner can go months without an urgent notification while the
 * registration is perfectly valid, and deleting it would silently drop their
 * next urgent push with the toggle still reading "on". The push service's
 * 404/410 is the honest staleness signal, it already flips `revoked_at`, and so
 * an abandoned browser reaches this purge through the revoked path anyway.
 */
export const PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS = 30;

/** Maximum rows deleted per purge DELETE call. */
const PURGE_BATCH_SIZE = 500;

/**
 * Wall-clock CEILING for the composite drain (ms), used when no budget is
 * handed down — a standalone invocation of /api/cron/data-lifecycle. Keeps
 * the run inside Vercel's 60 s function budget while still draining a large
 * backlog. Under the daily dispatcher the effective budget is the smaller of
 * this and the job's fair share.
 */
export const MAX_DURATION_MS = 45_000;

/**
 * Hard batch cap for the rate-limit bucket drain — 40 × 500 = 20,000 rows.
 *
 * WHY A CAP WHEN A DEADLINE ALREADY EXISTS. The deadline is the safety net; the
 * cap is the STATED worst case. `rate_limit_buckets` is the fastest-filling
 * table in the schema — every limiter on every anonymous surface writes two rows
 * per (key, window), and the public credential API alone can write 120 rows a
 * minute per IP — so it is the one target that can plausibly hold more expired
 * rows than a single run should try to take. A drain with no stated ceiling has
 * a worst case of "whatever the budget buys against the pooler that night",
 * which is not a number anyone can reason about before an incident.
 *
 * WHY 40. The real budget is much smaller than it looks: `vercel.json` gives
 * every cron route handler under `app/api/cron/` a **60 s** maxDuration (NOT
 * Vercel's 300 s default; only refresh-cube is raised to 300), and
 * `app/api/cron/daily/route.ts` fans out to ~23 jobs inside a 55 s wall-clock
 * budget, skipping whatever does not fit. data_lifecycle is ONE of those jobs
 * and drains FOUR targets, so a fair share here is single-digit seconds, not
 * 45. 40 batches is ~10× what the old one-batch-per-day pass could clear and
 * still small enough that the deadline — not this cap — is what stops a
 * genuinely slow night. Raising it is cheap; raising it without also raising
 * the dispatcher's share just moves the stall to a later job.
 */
export const RATE_LIMIT_CLEANUP_MAX_BATCHES = 40;

/**
 * Same cap for notifications — 20,000 rows a run. It used to drain UNCAPPED,
 * and it ran FIRST, so an expired-notification backlog could consume the whole
 * deadline before the bucket table (the one that actually fills) got a turn.
 * Expiry here is product-driven (a notification's own `expires_at`), not
 * attacker-influenced, so 20,000 a night is far above the steady state; the
 * `backlogged` flag says so if that ever stops being true.
 */
export const NOTIFICATIONS_CLEANUP_MAX_BATCHES = 40;

/** Push registrations are one row per browser; 5,000 revoked rows a run is plenty. */
export const PUSH_SUBSCRIPTIONS_CLEANUP_MAX_BATCHES = 10;

/** cron_runs grows by ~23 rows a day; the cap is for symmetry, not for volume. */
export const CRON_RUNS_CLEANUP_MAX_BATCHES = 40;

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
 * `now` is injectable for the same reason.
 *
 * The first batch always runs, deadline or not: a share of 0 ms still makes
 * one `batchSize` step of progress per target, so a night with no budget left
 * is not a night where nothing moves.
 */
export async function drainPurge(
  step: () => Promise<number>,
  batchSize: number,
  deadlineMs: number,
  maxBatches = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
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
    if (batches >= maxBatches || now() >= deadlineMs) {
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
 * Deletes push_subscriptions rows revoked more than
 * PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS ago. Live rows (`revoked_at IS NULL`) are
 * never touched — see the constant for why `last_used_at` is not a criterion.
 * Capped at PURGE_BATCH_SIZE per call; the composite drains.
 *
 * Returns the count of deleted rows.
 */
export async function purgeRevokedPushSubscriptions(): Promise<number> {
  const cutoffMs = Date.now() - PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();
  const result = (await db.execute(
    sql`
      DELETE FROM push_subscriptions
      WHERE id IN (
        SELECT id FROM push_subscriptions
        WHERE revoked_at IS NOT NULL
          AND revoked_at < ${cutoff}::timestamptz
        LIMIT ${PURGE_BATCH_SIZE}
      )
      RETURNING id
    `,
  )) as Array<{ id: string }>;
  return result.length;
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
  pushSubscriptionsDeleted: number;
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
    pushSubscriptions: boolean;
  };
}

/** One single-batch purge per target. Injectable so the composite's arithmetic
 *  (order, caps, the fair share) is provable without a database. */
export type Purgers = {
  rateLimitBuckets: () => Promise<number>;
  notifications: () => Promise<number>;
  pushSubscriptions: () => Promise<number>;
  cronRuns: () => Promise<number>;
};

const DEFAULT_PURGERS: Purgers = {
  rateLimitBuckets: purgeExpiredRateLimitBuckets,
  notifications: purgeExpiredNotifications,
  pushSubscriptions: purgeRevokedPushSubscriptions,
  cronRuns: purgeOldCronRuns,
};

export type DataLifecycleOptions = {
  /**
   * The budget this run may spend, in ms — the dispatcher's fair share when
   * invoked through /api/cron/daily, omitted on a standalone call. Always
   * capped by MAX_DURATION_MS, so a generous parent cannot push the run past
   * the function's own 60 s.
   */
  maxDurationMs?: number;
  /** Injectable clock for tests. Default: Date.now. */
  now?: () => number;
  /** Injectable purgers for tests. Default: the real SQL. */
  purgers?: Partial<Purgers>;
};

/**
 * Runs all four purges in sequence. Each is independent — a failure in one
 * does not abort the others (the route handles per-section error logging).
 * Returns per-section counts for the cron_runs.details payload.
 *
 * THE ORDER IS A PRIORITY AND THE DEADLINE IS SPLIT FAIRLY. Each target's
 * deadline is `now + fairShareMs(budget left, targets still to run)` — the
 * same arithmetic the dispatcher applies per job — so the first target cannot
 * eat the whole budget, and a target that finishes early hands its leftover to
 * the ones after it. Within that, the order says who gets the FIRST share of a
 * tight night:
 *
 *   1. rate_limit_buckets — the fastest-filling table, and the only one whose
 *      growth an anonymous caller influences (120 rows/min per IP through the
 *      credential API alone). It also sits on the hot path: every anonymous
 *      request's limiter upserts into it, so bloat here slows the credential
 *      page itself.
 *   2. notifications — user-visible: nothing in the inbox query filters
 *      `expires_at`, so an expired notification lingers until this purge takes
 *      it. Product-driven volume, so second rather than first.
 *   3. push_subscriptions — revoked rows, an audit trail that has served its
 *      purpose. Tiny table.
 *   4. cron_runs — 90 days of rows is a debugging convenience, not a
 *      correctness property.
 *
 * Every target is capped as well (the STATED worst case per target); the
 * deadline is the safety net for a slow night.
 */
export async function runDataLifecyclePurge(
  options: DataLifecycleOptions = {},
): Promise<DataLifecycleResult> {
  const now = options.now ?? Date.now;
  const purgers: Purgers = { ...DEFAULT_PURGERS, ...options.purgers };
  const budgetMs = Math.min(MAX_DURATION_MS, options.maxDurationMs ?? MAX_DURATION_MS);
  const runDeadlineMs = now() + budgetMs;

  const targets = [
    {
      key: "rateLimitBuckets",
      step: purgers.rateLimitBuckets,
      batchSize: RATE_LIMIT_CLEANUP_BATCH_SIZE,
      maxBatches: RATE_LIMIT_CLEANUP_MAX_BATCHES,
    },
    {
      key: "notifications",
      step: purgers.notifications,
      batchSize: PURGE_BATCH_SIZE,
      maxBatches: NOTIFICATIONS_CLEANUP_MAX_BATCHES,
    },
    {
      key: "pushSubscriptions",
      step: purgers.pushSubscriptions,
      batchSize: PURGE_BATCH_SIZE,
      maxBatches: PUSH_SUBSCRIPTIONS_CLEANUP_MAX_BATCHES,
    },
    {
      key: "cronRuns",
      step: purgers.cronRuns,
      batchSize: PURGE_BATCH_SIZE,
      maxBatches: CRON_RUNS_CLEANUP_MAX_BATCHES,
    },
  ] as const;

  const outcomes = {} as Record<(typeof targets)[number]["key"], DrainOutcome>;
  for (const [index, target] of targets.entries()) {
    // ONE reading per target: what is left is measured from the same instant
    // the target's own deadline is anchored on.
    const startedAt = now();
    const share = fairShareMs(
      runDeadlineMs - startedAt,
      targets.length - index,
      Number.POSITIVE_INFINITY,
    );
    outcomes[target.key] = await drainPurge(
      target.step,
      target.batchSize,
      startedAt + share,
      target.maxBatches,
      now,
    );
  }

  return {
    notificationsDeleted: outcomes.notifications.deleted,
    rateLimitBucketsDeleted: outcomes.rateLimitBuckets.deleted,
    cronRunsDeleted: outcomes.cronRuns.deleted,
    pushSubscriptionsDeleted: outcomes.pushSubscriptions.deleted,
    backlogged: {
      notifications: outcomes.notifications.backlogged,
      rateLimitBuckets: outcomes.rateLimitBuckets.backlogged,
      cronRuns: outcomes.cronRuns.backlogged,
      pushSubscriptions: outcomes.pushSubscriptions.backlogged,
    },
  };
}
