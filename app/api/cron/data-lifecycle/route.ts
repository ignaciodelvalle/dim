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
// retention_until tables (profiles, pets, pet_identifications, custody_disputes):
//   All four are Ley 25.326 PII tables with no declared retention policy in any
//   design doc. Writers and purge logic for those columns are intentionally
//   omitted pending a product/legal decision.
//
// Returns: { ok: true, ...counts, durationMs, runId }

import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { runDataLifecyclePurge } from "@/lib/data-lifecycle";

export const dynamic = "force-dynamic";

const CRON_NAME = "data_lifecycle";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const incoming = req.headers.get("x-cron-secret");

  if (cronSecret) {
    if (incoming !== cronSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/data-lifecycle] CRON_SECRET is not set in production. Rejecting request.");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured in production" },
      { status: 401 },
    );
  } else {
    console.warn(
      "[cron/data-lifecycle] CRON_SECRET not set — proceeding in dev mode. Set CRON_SECRET in production.",
    );
  }

  const start = Date.now();

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  let status: "ok" | "failed" = "ok";
  let counts = { notificationsDeleted: 0, rateLimitBucketsDeleted: 0, cronRunsDeleted: 0 };
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

  return NextResponse.json({
    ok: status === "ok",
    ...counts,
    durationMs,
    runId: run.id,
  });
}
