// Vercel cron endpoint for the ENO queue drain (handoff P4-6).
//
// Schedule: hourly. Configured in vercel.json. Vercel attaches
// `Authorization: Bearer ${CRON_SECRET}` to the request when
// CRON_SECRET is set in the project env; we reject anything else so
// the URL is not a public endpoint.
//
// On success returns JSON describing the run. On failure returns 500.

import { processEnoQueueBatch } from "@/lib/eno-queue-processor";
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
    const result = await processEnoQueueBatch();
    return NextResponse.json({
      ok: true,
      scanned_at: result.scannedAt.toISOString(),
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
