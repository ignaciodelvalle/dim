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

import { WRONG_CASE_BRAND } from "./check-brand-casing";
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

/**
 * Notification-specific hygiene checks (sweep-fixes-2 2026-07-23), separate
 * from the generic seed-marker scan above because these two checks aren't
 * "does this text carry a seed marker" — they're structural:
 *
 *   1. Brand casing — notifications.title must never carry the wrong-cased
 *      "MiMAR"/"Mimar"/"MIMAR" literal (canonical is "miMAR", PO decision
 *      2026-07-18). check-brand-casing.ts already fences app/**+components/**
 *      SOURCE; this is the DB-side companion for content a Postgres trigger
 *      writes (handle_new_user's welcome insert), which that static scanner
 *      cannot see.
 *   2. `welcome` category presence — the ONE notification_type this repo
 *      fully controls end-to-end (a single trigger, migration 0157). NOT a
 *      blanket "category must never be NULL" rule: several OTHER production
 *      write paths (notifyOwnerOfFirstStrangerScan, the
 *      approval_request_auto_expired cron, and a handful of direct
 *      db.insert(notifications) call sites — see 0157's follow-up note)
 *      still omit category, and asserting NOT NULL across the whole table
 *      would fail for reasons unrelated to seed/trigger hygiene. Scoping to
 *      `welcome` keeps this gate honest about what it actually guarantees.
 */
export type NotificationHygieneOffender = {
  id: string;
  issue: "wrong_cased_brand" | "welcome_missing_category";
  sample: string;
};

export async function findNotificationHygieneOffenders(
  sql: postgres.Sql,
): Promise<NotificationHygieneOffender[]> {
  const offenders: NotificationHygieneOffender[] = [];

  const titledRows = await sql.unsafe<Array<{ id: string; title: string }>>(
    "SELECT id::text AS id, title FROM notifications WHERE title IS NOT NULL",
  );
  for (const row of titledRows) {
    WRONG_CASE_BRAND.lastIndex = 0;
    if (WRONG_CASE_BRAND.test(row.title)) {
      offenders.push({
        id: row.id,
        issue: "wrong_cased_brand",
        sample: row.title.slice(0, 80),
      });
    }
  }

  const staleWelcomeRows = await sql.unsafe<Array<{ id: string; title: string }>>(
    "SELECT id::text AS id, title FROM notifications WHERE notification_type = 'welcome' AND category IS NULL",
  );
  for (const row of staleWelcomeRows) {
    offenders.push({
      id: row.id,
      issue: "welcome_missing_category",
      sample: row.title.slice(0, 80),
    });
  }

  return offenders;
}

async function runCheck(): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });

  let offenders: SeedHygieneOffender[];
  let notificationOffenders: NotificationHygieneOffender[];
  try {
    offenders = await findSeedHygieneOffenders(sql);
    notificationOffenders = await findNotificationHygieneOffenders(sql);
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

  let failed = false;

  if (offenders.length > 0) {
    failed = true;
    for (const o of offenders) {
      console.error(
        `✗ ${o.table}.${o.column} id=${o.id}: seed marker "${o.matchedPattern}" in "${o.sample}"`,
      );
    }
    console.error(
      `\n✗ ${offenders.length} seed-hygiene offender(s) — a renderable column carries a seed-identifiable marker. Run scripts/seed-demo-polish.ts to repair, or fix the generator at the source (scripts/seed-panorama.ts).`,
    );
  }

  if (notificationOffenders.length > 0) {
    failed = true;
    for (const o of notificationOffenders) {
      console.error(`✗ notifications id=${o.id}: ${o.issue} — "${o.sample}"`);
    }
    console.error(
      `\n✗ ${notificationOffenders.length} notification-hygiene offender(s) — see db/migrations/0157_welcome_notification_category_and_casing.sql for the repair pattern.`,
    );
  }

  if (failed) {
    process.exit(1);
  }

  console.log(
    `✓ Seed hygiene clean — 0 seed-marker hits across ${RENDERABLE_TEXT_COLUMNS.length} renderable column(s), 0 notification-hygiene offenders.`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-seed-hygiene.ts") ||
    process.argv[1].endsWith("check-seed-hygiene.js"));

if (isMain) {
  runCheck();
}
