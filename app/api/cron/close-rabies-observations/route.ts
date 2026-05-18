// Cron route — close 10-day rabies observations whose period has elapsed.
//
// GET /api/cron/close-rabies-observations
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// See app/api/cron/materialize-slots/route.ts for the policy details.
//
// Returns: { ok: true, ...stats, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { closeEligibleRabiesObservations } from "@/lib/rabies-observation-closer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const incoming = req.headers.get("x-cron-secret");

  if (cronSecret) {
    if (incoming !== cronSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured in production" },
      { status: 401 },
    );
  } else {
    console.warn("[cron/close-rabies] CRON_SECRET not set — allowing request in non-production");
  }

  const start = Date.now();
  try {
    const stats = await closeEligibleRabiesObservations();
    return NextResponse.json({
      ok: true,
      ...stats,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    console.error("[cron/close-rabies] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
