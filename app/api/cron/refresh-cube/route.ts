// Cron route — rebuild the panorama aggregate cube (road-to-10 infra #1, mig 0139).
//
// GET /api/cron/refresh-cube
//
// Authentication: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron contract) or
// legacy `x-cron-secret: <CRON_SECRET>` — same gate as every other cron route
// (lib/domain/cron-auth.ts).
//
// Runs the TS cube-builder (src/modules/panorama/infrastructure/cube-builder.ts),
// which REUSES the live choropleth loaders and writes panorama_cube + cube_meta in
// one transaction. Scheduled every 15 min (vercel.json). Also runnable locally via
// `pnpm cube:refresh`.
//
// NOTE: the builder gives its OWN write transaction a 120s statement_timeout, but a
// Vercel function is still capped by maxDuration (60s, vercel.json) — the design
// measured ~20–40s per rebuild, comfortably inside it. If a production rebuild ever
// approaches the cap, either raise maxDuration for this route or drop the cadence.
//
// Returns: { ok, status, rowCount, durationMs, watermark, builtAt, perMetric }

import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { refreshCube } from "@/src/modules/panorama/infrastructure/cube-builder";

export const dynamic = "force-dynamic";

const CRON_NAME = "refresh_cube";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const [run] = await db
    .insert(cronRuns)
    .values({ cronName: CRON_NAME, status: "running" })
    .returning();

  const result = await refreshCube();
  const cronStatus = result.status === "ok" ? "ok" : "failed";

  await db
    .update(cronRuns)
    .set({
      status: cronStatus,
      finishedAt: new Date(),
      itemsProcessed: result.rowCount,
      details:
        result.status === "ok"
          ? {
              rowCount: result.rowCount,
              durationMs: result.durationMs,
              perMetric: result.perMetric,
            }
          : { error: result.error ?? "unknown" },
    })
    .where(eq(cronRuns.id, run.id));

  return NextResponse.json(
    {
      ok: result.status === "ok",
      status: result.status,
      rowCount: result.rowCount,
      durationMs: result.durationMs,
      watermark: result.watermark,
      builtAt: result.builtAt,
      perMetric: result.perMetric,
      ...(result.error ? { error: result.error } : {}),
    },
    {
      status: result.status === "ok" ? 200 : 500,
      headers: { "cache-control": "no-store" },
    },
  );
}
