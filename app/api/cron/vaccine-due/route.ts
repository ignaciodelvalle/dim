// Vercel cron endpoint for the vaccine_due notification scan.
//
// Schedule: once a day at 12:00 UTC (09:00 ART). Configured in vercel.json.
// Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to the request when
// CRON_SECRET is set in the project env; we reject anything else so the URL
// is not a public endpoint.
//
// On success we return JSON describing the run. On failure we return 500
// with the message so the Vercel cron dashboard surfaces it.

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { runVaccineDueScan } from "@/lib/infra/notifications";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = authorizeCronRequest(request);
  if (authError) {
    return NextResponse.json({ error: authError.error }, { status: authError.status });
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
