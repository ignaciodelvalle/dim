// Cron route — escalate welfare_denuncia cases inactive >90 days.

import { type NextRequest, NextResponse } from "next/server";

import {
  type StaleWelfareCandidate,
  escalateStaleWelfareCase,
  findStaleWelfareCases,
} from "@/lib/case-closers/escalate-stale-welfare-cases";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "escalate_stale_welfare_cases";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req);
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<StaleWelfareCandidate>({
    name: CRON_NAME,
    scan: () => findStaleWelfareCases(),
    processOne: (candidate) => escalateStaleWelfareCase(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
