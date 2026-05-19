#!/usr/bin/env tsx
/**
 * Daily cron CLI: close cross-org transfer handshakes open >30 days.
 * Run: pnpm tsx scripts/expire-cross-org-transfers.ts
 * Idempotent (already-closed cases are excluded by the scan).
 */

import {
  expireCrossOrgTransfer,
  findExpiredCrossOrgTransfers,
} from "@/lib/case-closers/expire-cross-org-transfers";
import { runCaseCron } from "@/lib/case-cron";

async function main() {
  const start = Date.now();
  const result = await runCaseCron({
    name: "expire_cross_org_transfers",
    scan: () => findExpiredCrossOrgTransfers(),
    processOne: (candidate) => expireCrossOrgTransfer(candidate),
  });
  const ms = Date.now() - start;
  console.log(
    `[expire-cross-org-transfers] status=${result.status} processed=${result.itemsProcessed} errors=${result.errors.length} runId=${result.runId} (${ms}ms)`,
  );
  for (const e of result.errors) {
    console.warn(`  case ${e.id}: ${e.reason}`);
  }
}

const isMain =
  typeof process !== "undefined" && process.argv[1]?.endsWith("expire-cross-org-transfers.ts");
if (isMain) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
