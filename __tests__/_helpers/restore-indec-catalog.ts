// Shared catalog restore for tests that exercise the INDEC import fixture
// against the LIVE local DB (import-indec-localities.test.ts,
// ar-localidades.test.ts).
//
// WHY THIS EXISTS: the import fixture's soft-delete pass stamps every real
// catalog row that isn't in the fixture CSV as removed, so those tests restore
// the catalog afterwards. But a blanket restore (removed_at = null for ALL
// indec_cppdyl rows) also RESURRECTS whole-province aggregate rows the current
// importer intentionally drops on ingest — e.g. CABA's whole-city row — which
// then fails the `lint:locality` integrity gate on the next `pnpm verify`
// (recurring zombie, 2026-07-11: the row came back after every full suite run).
//
// Fix: restore, then re-soft-delete exactly the rows the integrity guard's own
// detector flags. Reusing findAggregateViolations keeps this helper and
// scripts/check-locality-integrity.ts structurally in sync — if the guard's
// definition of "aggregate violation" evolves, this restore follows it.

import { sql } from "drizzle-orm";

import { arLocalities, db } from "@/db";
import { type LocalityRow, findAggregateViolations } from "@/scripts/check-locality-integrity";

export async function restoreIndecCatalog(): Promise<void> {
  // Un-soft-delete real catalog rows the import fixture may have stamped.
  await db
    .update(arLocalities)
    .set({ removedAt: null })
    .where(
      sql`${arLocalities.source} = 'indec_cppdyl' AND ${arLocalities.removedAt} IS NOT NULL AND ${arLocalities.indecId} IS NOT NULL`,
    );

  // Re-drop whole-province aggregates the restore just resurrected. The guard
  // only inspects ACTIVE department-less rows, so query that same slice.
  const candidates = (await db.execute(sql`
    select province_code, locality_name, locality_slug, department_code
    from ar_localities
    where removed_at is null and department_code is null
  `)) as unknown as LocalityRow[];

  for (const violation of findAggregateViolations(candidates)) {
    await db
      .update(arLocalities)
      .set({ removedAt: new Date() })
      .where(
        sql`${arLocalities.localitySlug} = ${violation.locality_slug} AND ${arLocalities.provinceCode} = ${violation.province_code} AND ${arLocalities.removedAt} IS NULL`,
      );
  }
}
