// Cron route — expire foster proposals past their 7-day pending window.
//
// GET /api/cron/expire-foster-proposals
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// Mirror of app/api/cron/close-rabies-observations/route.ts.
//
// Returns: { ok: true, ...stats, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { expireFosterProposalsAction as expireFosterProposals } from "@/src/modules/foster/actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();
  try {
    const stats = await expireFosterProposals();
    return NextResponse.json({
      ok: true,
      ...stats,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    console.error("[cron/expire-foster-proposals] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
