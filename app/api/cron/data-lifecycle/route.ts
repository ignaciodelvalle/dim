// Cron route — data-lifecycle purges (ARCH-G).
//
// GET /api/cron/data-lifecycle
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
//
// CRON_SECRET behaviour (identical to all other cron routes in this project):
//   - If CRON_SECRET is set: request header must match, otherwise 401.
//   - If CRON_SECRET is NOT set AND NODE_ENV !== 'production': warn and proceed.
//   - If CRON_SECRET is NOT set AND NODE_ENV === 'production': 401.
//
// Three conservative purges per run (all batched — see lib/data-lifecycle.ts):
//   1. notifications WHERE expires_at < now()
//   2. rate_limit_buckets WHERE expires_at < now()  (via cleanupExpiredBuckets)
//   3. cron_runs WHERE started_at < now() - 90d AND status IN ('ok','failed')
//
// Each drains in bounded batches under a shared wall-clock deadline, and each
// reports whether it FINISHED. `backlogged.*` is the field that makes the run
// readable: a count says how much came off the table, never whether anything is
// left, and an unfinished purge that reports only a count is indistinguishable
// from a completed one on a table that keeps growing.
//
// retention_until tables (profiles, pets, pet_identifications, custody_disputes):
//   All four are Ley 25.326 PII tables with no declared retention policy in any
//   design doc. Writers and purge logic for those columns are intentionally
//   omitted pending a product/legal decision.
//
// Returns: { ok: true, ...counts, durationMs, runId }

import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { sendCronAlert } from "@/lib/infra/cron-alert";
import { type DataLifecycleResult, runDataLifecyclePurge } from "@/lib/infra/data-lifecycle";

export const dynamic = "force-dynamic";

const CRON_NAME = "data_lifecycle";

/**
 * Backlog flag → the table it drains.
 *
 * The warning names the SQL table, not the camelCase field, because the person
 * reading a function log is about to go look at that table.
 */
const BACKLOG_TABLES: [keyof DataLifecycleResult["backlogged"], string][] = [
  ["notifications", "notifications"],
  ["rateLimitBuckets", "rate_limit_buckets"],
  ["cronRuns", "cron_runs"],
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let status: "ok" | "failed" = "ok";
  // The initial value is what a FAILED run reports, so it must be the honest
  // "nothing ran" shape rather than a tidy zero: `backlogged` false everywhere
  // would claim three drained tables on a run that never touched them.
  let counts: DataLifecycleResult = {
    notificationsDeleted: 0,
    rateLimitBucketsDeleted: 0,
    cronRunsDeleted: 0,
    backlogged: { notifications: true, rateLimitBuckets: true, cronRuns: true },
  };
  const errors: { section: string; reason: string }[] = [];

  try {
    counts = await runDataLifecyclePurge();
  } catch (err) {
    status = "failed";
    errors.push({
      section: "runDataLifecyclePurge",
      reason: err instanceof Error ? err.message : String(err),
    });
    console.error("[cron/data-lifecycle] Error:", err);
  }

  // A drain that stopped short must SAY SO in the logs. `backlogged` was
  // already in the response body and in cron_runs.details, but nothing READ
  // either on a run that returns `ok: true` with a 200 — so the flag that
  // exists precisely to distinguish "finished" from "ran out of budget on a
  // table that keeps growing" was only visible to someone already suspicious.
  //
  // Only on an OK run: a failed run reports the initial all-true shape, which
  // means "nothing ran", not "three tables are behind", and it already pages a
  // human below.
  //
  // NO sendCronAlert here, deliberately. Siblings DO use it for non-failure
  // conditions — app/api/cron/reconcile-pet-status/route.ts fires severity
  // "warning" on drift and still returns 200 — so the precedent exists. But
  // drift is an anomaly, while a backlog on a deliberately batch-capped drain
  // is normal operation at volume (see RATE_LIMIT_CLEANUP_MAX_BATCHES and the
  // shared wall-clock deadline in lib/infra/data-lifecycle.ts): paging every
  // tick would train the recipient to ignore the channel. Escalating needs a
  // threshold — N consecutive runs backlogged — and that is its own change.
  if (status === "ok") {
    const backlogged = BACKLOG_TABLES.filter(([flag]) => counts.backlogged[flag]).map(
      ([, table]) => table,
    );
    if (backlogged.length > 0) {
      console.warn(
        `[cron/${CRON_NAME}] backlog remains: ${backlogged.join(", ")} — the purge hit its batch cap or the wall-clock deadline before draining; rows are still expired and waiting for the next run.`,
      );
    }
  }

  const durationMs = Date.now() - start;

  await db
    .update(cronRuns)
    .set({
      status,
      finishedAt: new Date(),
      itemsProcessed:
        counts.notificationsDeleted + counts.rateLimitBucketsDeleted + counts.cronRunsDeleted,
      details: errors.length > 0 ? { ...counts, errors } : counts,
    })
    .where(eq(cronRuns.id, run.id));

  // A failed purge must return HTTP 500 so Vercel's cron dashboard flags it and
  // retries — previously the route always returned 200 (review 23 fleet
  // extension).
  if (status === "failed") {
    await sendCronAlert({
      job: CRON_NAME,
      severity: "critical",
      error: errors[0]?.reason ?? "data-lifecycle purge failed",
      details: { ...counts, errors },
    });
  }

  return NextResponse.json(
    {
      ok: status === "ok",
      ...counts,
      durationMs,
      runId: run.id,
    },
    { status: status === "ok" ? 200 : 500 },
  );
}
