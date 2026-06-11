// Cron route — escalate custody_episode handoffs open >7 days without
// receiver acceptance (decomiso spec §13.5 + DC8).
//
// Runs every 12 hours per spec (decomisos are time-sensitive).
// Emits decomiso_handoff_stale notifications only — does NOT close the case.
// Idempotency handled by the helper (checks for a recent stale notification).

import { type NextRequest, NextResponse } from "next/server";

import {
  type StaleDecomisoCandidateFull,
  escalateStaleDecomiso,
  findStaleDecomisoCandidates,
} from "@/lib/case-closers/escalate-stale-decomiso-handoffs";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "escalate_stale_decomiso_handoffs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<StaleDecomisoCandidateFull>({
    name: CRON_NAME,
    scan: () => findStaleDecomisoCandidates(),
    processOne: (candidate) => escalateStaleDecomiso(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
