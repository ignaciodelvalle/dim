// Seed-hygiene DB validator — plan-maestro-integridad C5 dynamic gate.
//
// Queries the LIVE Postgres for seed-marker patterns (scripts/seed-hygiene-
// rules.ts) inside renderable text columns. A hit means a funcionario (or a
// citizen, on a public denuncia page) could see raw seed plumbing —
// "PANO-Seed-Owner" as a case's "Abrió:", "PANO-HIST-WEL-001243" inside a
// denuncia description — exactly the S5 symptom class this gate kills.
//
// Two callers:
//   - CLI: `pnpm tsx scripts/check-seed-hygiene.ts` (or the seed scripts
//     themselves, at the end of their run — see seed-panorama.ts).
//   - __tests__/seed-hygiene.test.ts — same `findSeedHygieneOffenders`
//     against the local DB, so CI enforces this even without re-seeding.
//
// Mirrors check-locality-integrity.ts's connection/skip conventions: if the
// DB is unreachable, exit 0 with a warning rather than hard-failing CI that
// has no local Supabase running.
//
// Run:  pnpm tsx scripts/check-seed-hygiene.ts
// Exits 1 listing every offending row (table.column, id, matched pattern).
// Exits 0 when clean (or when the DB is unreachable).

import postgres from "postgres";

import { RENDERABLE_TEXT_COLUMNS, findSeedMarker } from "./hygiene-rules";

export type SeedHygieneOffender = {
  table: string;
  column: string;
  id: string;
  matchedPattern: string;
  sample: string;
};

/**
 * Scan every renderable text column for seed-marker hits. Pure over an
 * injected `sql` client so it is reusable from the CLI and from the vitest
 * DB-backed test without duplicating connection logic.
 */
export async function findSeedHygieneOffenders(sql: postgres.Sql): Promise<SeedHygieneOffender[]> {
  const offenders: SeedHygieneOffender[] = [];

  for (const { table, column } of RENDERABLE_TEXT_COLUMNS) {
    // Identifiers come from the fixed RENDERABLE_TEXT_COLUMNS list above (not
    // user input), so building the query with sql.unsafe is safe here — the
    // postgres.js tagged-template helpers don't parameterize identifiers.
    const rows = await sql.unsafe<Array<{ id: string; value: string | null }>>(
      `SELECT id::text AS id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`,
    );
    for (const row of rows) {
      const matched = findSeedMarker(row.value);
      if (matched) {
        offenders.push({
          table,
          column,
          id: row.id,
          matchedPattern: matched,
          sample: (row.value ?? "").slice(0, 80),
        });
      }
    }
  }

  return offenders;
}

async function runCheck(): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });

  let offenders: SeedHygieneOffender[];
  try {
    offenders = await findSeedHygieneOffenders(sql);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[warn] check-seed-hygiene: could not reach the DB (${reason}). Skipping this run.\n  This guard needs the local Supabase stack (pnpm db:start) or a DATABASE_URL.`,
    );
    await sql.end({ timeout: 1 }).catch(() => {});
    process.exit(0);
    return;
  }
  await sql.end({ timeout: 1 }).catch(() => {});

  if (offenders.length > 0) {
    for (const o of offenders) {
      console.error(
        `✗ ${o.table}.${o.column} id=${o.id}: seed marker "${o.matchedPattern}" in "${o.sample}"`,
      );
    }
    console.error(
      `\n✗ ${offenders.length} seed-hygiene offender(s) — a renderable column carries a seed-identifiable marker. Run scripts/seed-demo-polish.ts to repair, or fix the generator at the source (scripts/seed-panorama.ts).`,
    );
    process.exit(1);
  }

  console.log(
    `✓ Seed hygiene clean — 0 seed-marker hits across ${RENDERABLE_TEXT_COLUMNS.length} renderable column(s).`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-seed-hygiene.ts") ||
    process.argv[1].endsWith("check-seed-hygiene.js"));

if (isMain) {
  runCheck();
}
