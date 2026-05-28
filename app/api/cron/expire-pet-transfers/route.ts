// Cron route — expire pet_transfers past their 7-day pending window.
//
// GET /api/cron/expire-pet-transfers
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// Mirrors the other expiry cron routes (see expire-foster-proposals).

import { type NextRequest, NextResponse } from "next/server";

import { expirePetTransfersOnce } from "@/app/actions/pet-transfer";

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
      "[cron/expire-pet-transfers] CRON_SECRET not set — allowing request in non-production",
    );
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
