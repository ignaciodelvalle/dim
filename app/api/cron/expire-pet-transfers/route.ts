// Cron route — expire pet_transfers past their 7-day pending window.
//
// GET /api/cron/expire-pet-transfers
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// Mirrors the other expiry cron routes (see expire-foster-proposals).

import { type NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { expirePetTransfersAction as expirePetTransfersOnce } from "@/src/modules/transfers/actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();
  try {
    const stats = await expirePetTransfersOnce();
    return NextResponse.json({
      ok: true,
      ...stats,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
