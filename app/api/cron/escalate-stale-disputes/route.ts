// Cron route — escalate custody_dispute cases open >365 days.

import { type NextRequest, NextResponse } from "next/server";

import {
  type StaleDisputeCandidate,
  escalateStaleDispute,
  findStaleDisputes,
} from "@/lib/case-closers/escalate-stale-disputes";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "escalate_stale_disputes";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req.headers.get("x-cron-secret"));
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<StaleDisputeCandidate>({
    name: CRON_NAME,
    scan: () => findStaleDisputes(),
    processOne: (candidate) => escalateStaleDispute(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
