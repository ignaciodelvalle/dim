// Cron route — close 10-day rabies observations whose period has elapsed.
//
// GET /api/cron/close-rabies-observations
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// See app/api/cron/materialize-slots/route.ts for the policy details.
//
// Returns: { ok: true, ...stats, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { closeEligibleRabiesObservations } from "@/lib/infra/rabies-observation-closer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
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
