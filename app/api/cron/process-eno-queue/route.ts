// Vercel cron endpoint for the ENO queue drain (handoff P4-6).
//
// Schedule: hourly. Configured in vercel.json. Vercel attaches
// `Authorization: Bearer ${CRON_SECRET}` to the request when
// CRON_SECRET is set in the project env; we reject anything else so
// the URL is not a public endpoint.
//
// On success returns JSON describing the run. On failure returns 500.
//
// Overlap safety: concurrent runs are safe because pickPendingBatch uses an
// atomic UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *
// to claim rows, transitioning them to status='processing'. Two concurrent runs
// always claim disjoint sets. No session-level advisory lock is used — those
// are pooler-unsafe on pgBouncer transaction-mode connections (lock and unlock
// can land on different backend connections, silently voiding mutual exclusion).
// Idempotency at the notification layer (ON CONFLICT DO NOTHING on the partial
// unique index notifications_event_natural_key_unique, migration 0088) ensures
// that even if overlap did occur, no duplicate legal notifications would be sent.

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { processEnoQueueBatch } from "@/lib/eno-queue-processor";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = authorizeCronRequest(request);
  if (authError) {
    return NextResponse.json({ error: authError.error }, { status: authError.status });
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
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
