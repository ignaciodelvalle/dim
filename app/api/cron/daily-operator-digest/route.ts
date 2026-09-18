// Vercel cron endpoint for the daily operator digest (T2-N1).
//
// Schedule: run in order by the single daily dispatcher (/api/cron/daily,
// vercel.json "0 4 * * *" — 04:00 UTC / 01:00 ART). See
// lib/infra/cron-dispatcher.ts. Vercel attaches
// `Authorization: Bearer ${CRON_SECRET}` to the dispatcher request; this
// route's own auth (authorizeCronRequest) accepts that Bearer header or the
// legacy `x-cron-secret` header, same as every other job in the fleet.
//
// NO WALL-CLOCK CEILING (see __tests__/cron-budget-ceiling.test.ts's
// CEILING_EXEMPT — this job is listed there): the work is bounded by ROWS
// (active govt accounts + active org memberships, a v1-scale set), not by a
// keyset loop with a self-imposed clock. runDailyOperatorDigest short-
// circuits entirely when the mail channel is not configured, so a misrouted
// or misconfigured environment costs one cheap env check, not a DB scan.

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { withCronRun } from "@/lib/infra/case-cron";
import { runDailyOperatorDigest } from "@/lib/infra/daily-operator-digest";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CRON_NAME = "daily_operator_digest";

export async function GET(request: NextRequest) {
  const authError = authorizeCronRequest(request);
  if (authError) {
    return NextResponse.json({ error: authError.error }, { status: authError.status });
  }

  try {
    const result = await withCronRun(
      CRON_NAME,
      () => runDailyOperatorDigest(),
      (r) => ({
        itemsProcessed: r.sent,
        // Genuine per-recipient errors flip the run to 'failed' (alerts +
        // 500), same convention as every other cron in the fleet — a
        // misconfigured mail channel is NOT an error (it is reported via
        // mailChannel and itemsProcessed=0), it is a deployment state.
        failed: r.errors > 0,
        details: { ...r },
      }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
