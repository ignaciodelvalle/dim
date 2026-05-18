#!/usr/bin/env tsx
/**
 * Normalize existing rows that hold non-canonical jurisdiction strings to
 * match the INDEC catalog. Run once post-merge after the ar_localities table
 * is populated (scripts/import-indec-localities.ts).
 *
 * Tables touched (UPDATE):
 *   - govt_assignments
 *   - approval_requests
 *
 * Tables NOT touched (out of scope for v1):
 *   - organizations.jurisdiction_*       — not yet enforced canonical
 *   - service_offerings.jurisdiction_*   — same
 *   - pet_events                         — append-only; report instead
 *
 * Per-row strategy:
 *   1. provinceByCode / provinceByName(raw) → canonical Province
 *   2. localityByName(province.code, raw_locality) → canonical Locality
 *   3. If both resolve and either differs from raw → UPDATE
 *   4. Otherwise → log to stderr for manual review
 *
 * Run:
 *   pnpm tsx scripts/normalize-existing-jurisdictions.ts          # apply
 *   pnpm tsx scripts/normalize-existing-jurisdictions.ts --dry-run
 */

import { eq } from "drizzle-orm";

import { approvalRequests, db, govtAssignments } from "@/db";
import { localityByName } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode, provinceByName } from "@/lib/ar-provincias";

type Row = {
  id: string;
  jurisdictionProvince: string;
  jurisdictionLocality: string;
};

export type NormalizeStats = {
  table: string;
  normalized: number;
  unchanged: number;
  failed: { id: string; province: string; locality: string; reason: string }[];
};

async function normalizeRow(
  row: Row,
): Promise<
  | { kind: "ok"; province: string; locality: string }
  | { kind: "unchanged" }
  | { kind: "fail"; reason: string }
> {
  const province =
    provinceByCode(row.jurisdictionProvince) ?? provinceByName(row.jurisdictionProvince);
  if (!province) {
    return { kind: "fail", reason: `unknown province '${row.jurisdictionProvince}'` };
  }
  const locality = await localityByName(province.code as ProvinceCode, row.jurisdictionLocality);
  if (!locality) {
    return {
      kind: "fail",
      reason: `locality '${row.jurisdictionLocality}' not in catalog for ${province.name}`,
    };
  }
  if (
    province.name === row.jurisdictionProvince &&
    locality.localityName === row.jurisdictionLocality
  ) {
    return { kind: "unchanged" };
  }
  return { kind: "ok", province: province.name, locality: locality.localityName };
}

async function processTable(
  tableName: string,
  rows: Row[],
  updater: (id: string, province: string, locality: string) => Promise<void>,
  dryRun: boolean,
): Promise<NormalizeStats> {
  const stats: NormalizeStats = { table: tableName, normalized: 0, unchanged: 0, failed: [] };
  for (const r of rows) {
    const outcome = await normalizeRow(r);
    if (outcome.kind === "fail") {
      stats.failed.push({
        id: r.id,
        province: r.jurisdictionProvince,
        locality: r.jurisdictionLocality,
        reason: outcome.reason,
      });
      continue;
    }
    if (outcome.kind === "unchanged") {
      stats.unchanged += 1;
      continue;
    }
    if (!dryRun) {
      await updater(r.id, outcome.province, outcome.locality);
    }
    stats.normalized += 1;
  }
  return stats;
}

export async function runNormalize(options?: { dryRun?: boolean }): Promise<NormalizeStats[]> {
  const dryRun = options?.dryRun ?? false;
  const out: NormalizeStats[] = [];

  // govt_assignments — every row has both columns NOT NULL.
  const ga = await db
    .select({
      id: govtAssignments.id,
      jurisdictionProvince: govtAssignments.jurisdictionProvince,
      jurisdictionLocality: govtAssignments.jurisdictionLocality,
    })
    .from(govtAssignments);
  const gaStats = await processTable(
    "govt_assignments",
    ga,
    async (id, province, locality) => {
      await db
        .update(govtAssignments)
        .set({ jurisdictionProvince: province, jurisdictionLocality: locality })
        .where(eq(govtAssignments.id, id));
    },
    dryRun,
  );
  out.push(gaStats);
  console.log(
    `[${gaStats.table}] normalized=${gaStats.normalized} unchanged=${gaStats.unchanged} failed=${gaStats.failed.length}`,
  );

  // approval_requests — every row has both columns NOT NULL (jurisdiction is required).
  const ar = await db
    .select({
      id: approvalRequests.id,
      jurisdictionProvince: approvalRequests.jurisdictionProvince,
      jurisdictionLocality: approvalRequests.jurisdictionLocality,
    })
    .from(approvalRequests);
  const arStats = await processTable(
    "approval_requests",
    ar,
    async (id, province, locality) => {
      await db
        .update(approvalRequests)
        .set({ jurisdictionProvince: province, jurisdictionLocality: locality })
        .where(eq(approvalRequests.id, id));
    },
    dryRun,
  );
  out.push(arStats);
  console.log(
    `[${arStats.table}] normalized=${arStats.normalized} unchanged=${arStats.unchanged} failed=${arStats.failed.length}`,
  );

  // Surface failed rows so an operator can decide case-by-case.
  for (const stats of out) {
    if (stats.failed.length === 0) continue;
    console.warn(`\n[${stats.table}] rows needing manual review:`);
    for (const f of stats.failed) {
      console.warn(`  [${f.id}] ${f.province} / ${f.locality} — ${f.reason}`);
    }
  }

  return out;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1]?.endsWith("normalize-existing-jurisdictions.ts");
if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  runNormalize({ dryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Normalize failed:", err);
      process.exit(1);
    });
}
