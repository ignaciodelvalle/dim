// Cron route — close adoption_listing cases whose followup window expired.

import { type NextRequest, NextResponse } from "next/server";

import {
  closeFollowupExpiredAdoption,
  findFollowupExpiredAdoptions,
  type FollowupExpiredCandidate,
} from "@/lib/case-closers/close-followup-expired-adoptions";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "close_followup_expired_adoptions";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req.headers.get("x-cron-secret"));
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<FollowupExpiredCandidate>({
    name: CRON_NAME,
    scan: () => findFollowupExpiredAdoptions(),
    processOne: (candidate) => closeFollowupExpiredAdoption(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
