// Cron route — slot materialization (Fase 3).
//
// GET /api/cron/materialize-slots
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
//
// CRON_SECRET behaviour:
//   - If CRON_SECRET is set: request header must match, otherwise 401.
//   - If CRON_SECRET is NOT set AND NODE_ENV !== 'production': log a warning
//     and proceed (allows local dev without secrets configured).
//   - If CRON_SECRET is NOT set AND NODE_ENV === 'production': fail with 401.
//     A production cron with no secret is a misconfiguration, not a valid state.
//
// Returns: { ok: true, rulesProcessed, slotsInserted, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { materializeAllActiveSlots } from "@/app/actions/slot-materialization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const incoming = req.headers.get("x-cron-secret");

  if (cronSecret) {
    // Secret is configured — enforce it strictly.
    if (incoming !== cronSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Secret is NOT configured.
    if (process.env.NODE_ENV === "production") {
      // In production a missing CRON_SECRET is a misconfiguration — reject.
      console.error(
        "[cron/materialize-slots] CRON_SECRET is not set in production. Rejecting request.",
      );
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 401 },
      );
    }
    // In dev/test, warn and proceed.
    console.warn(
      "[cron/materialize-slots] CRON_SECRET is not set — proceeding in dev mode. " +
        "Set CRON_SECRET in production.",
    );
  }

  const start = Date.now();

  try {
    const { rulesProcessed, slotsInserted } = await materializeAllActiveSlots();
    const durationMs = Date.now() - start;

    return NextResponse.json({ ok: true, rulesProcessed, slotsInserted, durationMs });
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error("[cron/materialize-slots] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unexpected error",
        durationMs,
      },
      { status: 500 },
    );
  }
}
