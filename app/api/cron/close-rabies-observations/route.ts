// Cron route — close 10-day rabies observations whose period has elapsed.
//
// GET /api/cron/close-rabies-observations
//
// Authentication: header `x-cron-secret` must match process.env.CRON_SECRET.
// See app/api/cron/materialize-slots/route.ts for the policy details.
//
// Returns: { ok: true, ...stats, durationMs }

import { type NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/domain/cron-auth";
import { readLastRunDetail, withCronRun } from "@/lib/infra/case-cron";
import { closeEligibleRabiesObservations } from "@/lib/infra/rabies-observation-closer";

export const dynamic = "force-dynamic";

const CRON_NAME = "close_rabies_observations";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = authorizeCronRequest(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const start = Date.now();
  try {
    // Resume the in_progress sweep after the last pet the previous run scanned
    // (keyset cursor piggy-backed on cron_runs.details — no new table) so a
    // registry with more concurrent observations than one page is swept fairly
    // across runs (review 23 fleet extension).
    const resumeCursor = await readLastRunDetail<string | null>(CRON_NAME, "nextCursor");
    const stats = await withCronRun(
      CRON_NAME,
      () => closeEligibleRabiesObservations({ afterId: resumeCursor }),
      (s) => ({
        itemsProcessed: s.closedNegative + s.flaggedForReview,
        // Per-row failures in a legal 10-day auto-close must NOT report success
        // (review 23 item 2): flip the run to failed so Vercel retries.
        failed: s.errors.length > 0,
        details: {
          scanned: s.scanned,
          closedNegative: s.closedNegative,
          flaggedForReview: s.flaggedForReview,
          skippedNotYetDue: s.skippedNotYetDue,
          errorCount: s.errors.length,
          nextCursor: s.nextCursor,
        },
      }),
    );
    const failed = stats.errors.length > 0;
    return NextResponse.json(
      {
        ok: !failed,
        ...stats,
        durationMs: Date.now() - start,
      },
      { status: failed ? 500 : 200 },
    );
  } catch (err) {
    console.error("[cron/close-rabies] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
