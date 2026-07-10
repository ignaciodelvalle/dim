// Locality-integrity CI gate — data-integrity guardrail.
//
// Asserts that the ar_localities catalog contains NO whole-province aggregate:
// a phantom "locality" that spans its entire province instead of being a real
// subdivision. The canonical offender is CABA's city-wide
// "Ciudad Autónoma de Buenos Aires" (indec_id 02000010), which INDEC ships as a
// single 'componente' coexisting with the 48 barrios that tile the same city.
// Selecting it in a Localidad dropdown double-counts every barrio it contains
// (see /gob/analytics), silently corrupting every per-locality rollup.
//
// The invariant, per row: it is a violation iff BOTH
//   1. its canonical name resolves to its OWN province (province==locality
//      identity — provinceByName tolerates the "Ciudad Autónoma…" alias), AND
//   2. it has no departamento (department_code null).
// Name-equality ALONE is not the tell: real capital cities (Córdoba, Mendoza,
// Salta…) share their province's name but always sit inside a departamento, so
// condition (2) spares them. The check reuses isWholeProvinceAggregate — the
// same predicate the runtime dropdown belt and the INDEC importer use — so all
// three stay in lockstep from one source of truth.
//
// Source of truth: the live Postgres catalog (local Supabase Docker DB, same DB
// migrations run against). We fetch only the department-less active rows (a tiny
// slice — only CABA has any) and evaluate the predicate in JS.
//
// Run:  pnpm tsx scripts/check-locality-integrity.ts   (or: pnpm lint:locality)
// Exits 0 when the catalog is clean OR the DB is unreachable (graceful skip so
//   DB-less CI does not hard-fail; the invariant LOGIC is also enforced offline
//   by __tests__/check-locality-integrity.test.ts + lib/infra/ar-localidades.test.ts).
// Exits 1 listing each aggregate row, with the soft-delete SQL to remediate.

import postgres from "postgres";

import { isWholeProvinceAggregate } from "@/lib/reference/locality-integrity";

export type LocalityRow = {
  province_code: string;
  locality_name: string;
  locality_slug: string;
  department_code: string | null;
};

/**
 * Pure core: given catalog rows, return the whole-province aggregate offenders.
 * Extracted so the invariant is unit-testable without a database.
 */
export function findAggregateViolations(rows: LocalityRow[]): LocalityRow[] {
  return rows.filter((r) =>
    isWholeProvinceAggregate({
      provinceCode: r.province_code,
      localityName: r.locality_name,
      departmentCode: r.department_code,
    }),
  );
}

async function runCheck(): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });

  let rows: LocalityRow[];
  try {
    // Only department-less active rows can qualify (condition 2) — a tiny slice.
    rows = await sql<LocalityRow[]>`
      SELECT province_code, locality_name, locality_slug, department_code
      FROM ar_localities
      WHERE removed_at IS NULL AND department_code IS NULL
    `;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[warn] check-locality-integrity: could not reach the DB (${reason}). Skipping this run.\n  This guard needs the local Supabase stack (pnpm db:start) or a DATABASE_URL.\n  The invariant LOGIC is still enforced offline by __tests__/check-locality-integrity.test.ts and lib/infra/ar-localidades.test.ts.`,
    );
    await sql.end({ timeout: 1 }).catch(() => {});
    process.exit(0);
    return;
  }
  await sql.end({ timeout: 1 }).catch(() => {});

  const violations = findAggregateViolations(rows);

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(
        `✗ ar_localities: "${v.locality_name}" (${v.locality_slug}, ${v.province_code}) is a whole-province aggregate — it duplicates its province and double-counts its subdivisions.`,
      );
      console.error(
        `  Remediate: update ar_localities set removed_at = now() where province_code = '${v.province_code}' and locality_slug = '${v.locality_slug}';`,
      );
    }
    console.error(
      `\n✗ ${violations.length} whole-province aggregate row(s) in ar_localities. The INDEC importer now drops these on ingest — soft-delete the leftover row(s) above.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ Locality integrity clean — 0 whole-province aggregates across ${rows.length} department-less active rows.`,
  );
}

// Only query the DB when invoked as a CLI (pnpm lint:locality / tsx). Importing
// this module from unit tests must not trigger the query or process.exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-locality-integrity.ts") ||
    process.argv[1].endsWith("check-locality-integrity.js"));

if (isMain) {
  runCheck();
}
