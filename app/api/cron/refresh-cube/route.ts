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
// NOTE: the builder brings its OWN lazy session-pooler clients for BOTH phases
// (task #22): reads AND the write transaction get a long statement_timeout
// (default 120s, CUBE_BUILDER_STATEMENT_TIMEOUT_MS) — the shared analyticsDb
// pool's 15s request-path backstop never applies to the build. The LOCAL
// measured rebuild is ~105s (24 province × 5 metric loader calls) — well past
// the 60s cron default, so this route pins maxDuration to 300s (Pro). Staging
// should be faster (gru1 + session pooler), but the pin makes the cap a
// non-issue either way.
//
// Returns: { ok, status, rowCount, durationMs, watermark, builtAt, perMetric }

import { type NextRequest, NextResponse } from "next/server";

import { eq } from "drizzle-orm";

import { cronRuns, db } from "@/db";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { refreshCube } from "@/src/modules/panorama/infrastructure/cube-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // One retry on a statement timeout (SQLSTATE 57014). Builder reads now run on
  // a dedicated long-timeout client (task #22), so this should be rare — it
  // covers a genuinely pathological query (cold cache + contention past even the
  // long ceiling). A failed build is already fail-safe (read errors return a
  // structured error result, last-good cube preserved, reader falls to live) —
  // the retry just avoids wasting the whole 15-min cycle on one cold query.
  let result = await refreshCube();
  if (result.status !== "ok" && /57014|statement timeout/i.test(result.error ?? "")) {
    result = await refreshCube();
  }
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
