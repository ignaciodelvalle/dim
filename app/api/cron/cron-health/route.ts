// Meta-cron — detects stalled or failed crons before they become silent incidents.
//
// GET /api/cron/cron-health
//
// Authentication: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron contract)
// or legacy `x-cron-secret: <CRON_SECRET>` — see lib/cron-auth.ts.
//
// Background (finding R3 in the pre-mortem):
//   If a cron stalls or fails, nobody is alerted. This meta-cron queries the
//   cronRuns table to detect unhealthy crons and records the health summary in
//   its own cronRuns row. Console.warn fires on any unhealthy cron so it
//   surfaces in Vercel function logs.
//
// Strategy:
//   - Each cron has a max-staleness derived from its schedule (daily → 26h).
//   - A cron is UNHEALTHY if: never ran, last run older than max-staleness,
//     or last run status='failed'.
//   - The health summary (healthy/unhealthy lists + per-cron details) is
//     stored in cronRuns.details for the /admin/sistema surface.
//   - Returns: { ok, checked, unhealthy: [...] }
//
// Schedule: added to vercel.json — runs daily at 10:00 UTC.

import { type NextRequest, NextResponse } from "next/server";

import { desc, eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";

export const dynamic = "force-dynamic";

const CRON_NAME = "cron_health";

// ---------------------------------------------------------------------------
// Staleness registry — one entry per cron path registered in vercel.json.
// max_staleness_ms is the maximum acceptable age of the last successful run.
// All crons in vercel.json are daily (0 H * * *) — 26h gives a full day plus
// 2h buffer for scheduling jitter and brief infra disruptions.
// ---------------------------------------------------------------------------
const DAILY_STALENESS_MS = 26 * 60 * 60 * 1000; // 26 hours

type CronEntry = {
  /** cron_name value written by the route handler (matches CRON_NAME const in each route). */
  cronName: string;
  /** Max acceptable age of the last successful (status='ok') run. */
  maxStalenessMs: number;
  /** Human-readable schedule description for display in admin surface. */
  schedule: string;
};

// Maps every cron in vercel.json to its expected health parameters.
// Names must match the CRON_NAME constants used by each route handler.
const CRON_REGISTRY: CronEntry[] = [
  { cronName: "vaccine_due", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 12 * * *" },
  {
    cronName: "post_adoption_checkin",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 13 * * *",
  },
  {
    cronName: "expire_foster_proposals",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 3 * * *",
  },
  {
    cronName: "auto_expire_approvals",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "close_rabies_observations",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 0 * * *",
  },
  {
    cronName: "close_stale_lost_episodes",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "close_followup_expired_adoptions",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "escalate_stale_welfare_cases",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "escalate_stale_disputes",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_cross_org_transfers",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  { cronName: "drain_outbox", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 6 * * *" },
  { cronName: "process_eno_queue", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 7 * * *" },
  {
    cronName: "expire_pet_transfers",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 4 * * *",
  },
  {
    cronName: "expire_decomiso_handoffs",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 0 * * *",
  },
  { cronName: "materialize_slots", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 2 * * *" },
  {
    cronName: "business_rules_reeval",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 5 * * *",
  },
  { cronName: "data_lifecycle", maxStalenessMs: DAILY_STALENESS_MS, schedule: "30 3 * * *" },
  { cronName: "purge_scan_events", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 1 * * *" },
  { cronName: "evaluate_alerts", maxStalenessMs: DAILY_STALENESS_MS, schedule: "0 8 * * *" },
  {
    cronName: "reconcile_pet_status",
    maxStalenessMs: DAILY_STALENESS_MS,
    schedule: "0 9 * * *",
  },
];

type CronHealthResult = {
  cronName: string;
  schedule: string;
  healthy: boolean;
  reason: "ok" | "never_ran" | "stale" | "last_failed";
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastItemsProcessed: number | null;
  ageMs: number | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();

  // ---------------------------------------------------------------------------
  // Start cronRuns telemetry row
  // ---------------------------------------------------------------------------
  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let cronStatus: "ok" | "failed" = "ok";
  const results: CronHealthResult[] = [];

  try {
    // -------------------------------------------------------------------------
    // Check each cron: fetch its latest run and evaluate staleness/status.
    // -------------------------------------------------------------------------
    const now = Date.now();

    for (const entry of CRON_REGISTRY) {
      const [latest] = await db
        .select({
          startedAt: cronRuns.startedAt,
          finishedAt: cronRuns.finishedAt,
          status: cronRuns.status,
          itemsProcessed: cronRuns.itemsProcessed,
        })
        .from(cronRuns)
        .where(eq(cronRuns.cronName, entry.cronName))
        .orderBy(desc(cronRuns.startedAt))
        .limit(1);

      if (!latest) {
        results.push({
          cronName: entry.cronName,
          schedule: entry.schedule,
          healthy: false,
          reason: "never_ran",
          lastRunAt: null,
          lastStatus: null,
          lastItemsProcessed: null,
          ageMs: null,
        });
        continue;
      }

      const ageMs = now - latest.startedAt.getTime();

      if (latest.status === "failed") {
        results.push({
          cronName: entry.cronName,
          schedule: entry.schedule,
          healthy: false,
          reason: "last_failed",
          lastRunAt: latest.startedAt,
          lastStatus: latest.status,
          lastItemsProcessed: latest.itemsProcessed,
          ageMs,
        });
        continue;
      }

      if (ageMs > entry.maxStalenessMs) {
        results.push({
          cronName: entry.cronName,
          schedule: entry.schedule,
          healthy: false,
          reason: "stale",
          lastRunAt: latest.startedAt,
          lastStatus: latest.status,
          lastItemsProcessed: latest.itemsProcessed,
          ageMs,
        });
        continue;
      }

      results.push({
        cronName: entry.cronName,
        schedule: entry.schedule,
        healthy: true,
        reason: "ok",
        lastRunAt: latest.startedAt,
        lastStatus: latest.status,
        lastItemsProcessed: latest.itemsProcessed,
        ageMs,
      });
    }

    const unhealthy = results.filter((r) => !r.healthy);
    const healthy = results.filter((r) => r.healthy);

    if (unhealthy.length > 0) {
      for (const u of unhealthy) {
        console.warn(
          `[cron/cron-health] UNHEALTHY cron detected — name=${u.cronName} reason=${u.reason} lastRunAt=${u.lastRunAt?.toISOString() ?? "never"} lastStatus=${u.lastStatus ?? "none"}`,
        );
      }
    } else {
      console.info(
        `[cron/cron-health] all crons healthy — checked=${results.length} healthy=${healthy.length}`,
      );
    }

    const durationMs = Date.now() - start;

    // -------------------------------------------------------------------------
    // Finalize cronRuns row
    // -------------------------------------------------------------------------
    await db
      .update(cronRuns)
      .set({
        status: cronStatus,
        finishedAt: new Date(),
        itemsProcessed: results.length,
        details: {
          checked: results.length,
          healthyCount: healthy.length,
          unhealthyCount: unhealthy.length,
          unhealthy: unhealthy.map((u) => ({
            cronName: u.cronName,
            reason: u.reason,
            lastRunAt: u.lastRunAt?.toISOString() ?? null,
            lastStatus: u.lastStatus,
            ageMs: u.ageMs,
          })),
          all: results.map((r) => ({
            cronName: r.cronName,
            schedule: r.schedule,
            healthy: r.healthy,
            reason: r.reason,
            lastRunAt: r.lastRunAt?.toISOString() ?? null,
            lastStatus: r.lastStatus,
            lastItemsProcessed: r.lastItemsProcessed,
            ageMs: r.ageMs,
          })),
          durationMs,
        },
      })
      .where(eq(cronRuns.id, run.id));

    return NextResponse.json({
      ok: true,
      checked: results.length,
      unhealthy: unhealthy.map((u) => ({
        cronName: u.cronName,
        reason: u.reason,
        lastRunAt: u.lastRunAt?.toISOString() ?? null,
        lastStatus: u.lastStatus,
      })),
    });
  } catch (err) {
    cronStatus = "failed";
    console.error("[cron/cron-health] fatal error:", err);

    await db
      .update(cronRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .where(eq(cronRuns.id, run.id));

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
