// Cron route — evaluate every active alert subscription and open firings for
// new breaches (Paquete K). Runs daily so triage does not depend on an admin
// opening /admin/programa.
//
// GET /api/cron/evaluate-alerts
//
// Authentication: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) or the
// legacy `x-cron-secret` header — see lib/cron-auth.ts.
//
// Idempotent: evaluateAndRecordFiringsForAllAdmins dedupes via shouldOpenFiring
// (one open firing per subscription), so a re-run never duplicates an open alert.

import { type NextRequest, NextResponse } from "next/server";

import { evaluateAndRecordFiringsForAllAdmins } from "@/app/actions/alert-firings";
import { authorizeCronRequest } from "@/lib/domain/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();
  try {
    const result = await evaluateAndRecordFiringsForAllAdmins();
    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    console.error("[cron/evaluate-alerts] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error desconocido" },
      { status: 500 },
    );
  }
}
