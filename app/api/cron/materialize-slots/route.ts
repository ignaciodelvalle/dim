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

import { materializeAllActiveSlots } from "@/src/modules/service-offerings/application/slot-materialization/materialize-slots";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { withCronRun } from "@/lib/infra/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "materialize_slots";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();

  try {
    const { rulesProcessed, slotsInserted } = await withCronRun(
      CRON_NAME,
      () => materializeAllActiveSlots(),
      (r) => ({
        itemsProcessed: r.slotsInserted,
        details: { rulesProcessed: r.rulesProcessed, slotsInserted: r.slotsInserted },
      }),
    );
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
