// Vercel cron endpoint for the vaccine_due notification scan.
//
// Schedule: once a day at 12:00 UTC (09:00 ART). Configured in vercel.json.
// Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to the request when
// CRON_SECRET is set in the project env; we reject anything else so the URL
// is not a public endpoint.
//
// On success we return JSON describing the run. On failure we return 500
// with the message so the Vercel cron dashboard surfaces it.

import { runVaccineDueScan } from "@/lib/notifications";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runVaccineDueScan();
    return NextResponse.json({
      ok: true,
      scanned_at: result.scannedAt.toISOString(),
      inserted_count: result.insertedCount,
      inserted_notification_ids: result.insertedNotificationIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
