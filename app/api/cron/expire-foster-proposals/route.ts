// Cron route — expire foster proposals past their 7-day pending window.
//
// GET /api/cron/expire-foster-proposals
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// Mirror of app/api/cron/close-rabies-observations/route.ts.
//
// Returns: { ok: true, ...stats, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { expireFosterProposals } from "@/lib/foster-proposal-expirer";

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
    console.warn(
      "[cron/expire-foster-proposals] CRON_SECRET not set — allowing request in non-production",
    );
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
