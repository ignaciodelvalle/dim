// Cron route — close custody_transfer_handshake cases open >30 days
// without a receiver response (spec 2026-05-19-cross-org-transfer-ux §12.5).

import { type NextRequest, NextResponse } from "next/server";

import {
  type ExpireCrossOrgCandidate,
  expireCrossOrgTransfer,
  findExpiredCrossOrgTransfers,
} from "@/lib/case-closers/expire-cross-org-transfers";
import { checkCronSecret, runCaseCron } from "@/lib/case-cron";

export const dynamic = "force-dynamic";

const CRON_NAME = "expire_cross_org_transfers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = checkCronSecret(req.headers.get("x-cron-secret"));
  if (authError) {
    return NextResponse.json({ ok: false, error: authError.error }, { status: authError.status });
  }

  const result = await runCaseCron<ExpireCrossOrgCandidate>({
    name: CRON_NAME,
    scan: () => findExpiredCrossOrgTransfers(),
    processOne: (candidate) => expireCrossOrgTransfer(candidate),
  });

  return NextResponse.json({
    status: result.status,
    itemsProcessed: result.itemsProcessed,
    runId: result.runId,
  });
}
