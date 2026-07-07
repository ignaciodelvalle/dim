#!/usr/bin/env tsx
/**
 * Remote-safe, idempotent provisioner — the psql-free replacement for
 * `db:bootstrap` when the target is a fresh REMOTE Supabase (staging / prod).
 *
 * WHY THIS EXISTS
 * ---------------
 * `db:bootstrap` shells out to `psql` for db/*.sql and the migration replay.
 * Against a remote deploy that breaks two ways:
 *   1. psql connects to the LOCAL socket / 127.0.0.1 and ignores DATABASE_URL
 *      unless every -h/-p/-U/PGPASSWORD is threaded through — and psql is not
 *      installed on many machines (Windows especially).
 *   2. The numbered migrations are NOT self-contained (0000 references
 *      public.ownership_role before it exists); they assume `db:push`
 *      (drizzle → enums + tables) ran first.
 *
 * This script replicates the PROVEN manual remote sequence using postgres.js
 * only (the same driver the app + migrate runner use), so there is zero psql
 * dependency and DATABASE_URL is always honored. It mirrors db-bootstrap's
 * steps exactly — just with `client.unsafe(...)` instead of `psql`:
 *
 *   1. `pnpm db:push`  — drizzle-kit builds enums + the ~46 tables from
 *      schema.ts (respects DATABASE_URL).
 *   2. Best-effort replay of db/migrations/*.sql via postgres.js — lands the
 *      bits schema.ts can't express: SQL functions (e.g. can_read_case, which
 *      the loose RLS files call), CHECK constraints and triggers. "already
 *      exists" errors are expected (step 1 built the columns) and tolerated
 *      per file.
 *   3. Apply the loose orthogonal db/*.sql (triggers, storage buckets/policies,
 *      per-domain RLS) via client.unsafe, best-effort per file. db/rls.sql is
 *      intentionally EXCLUDED — it needs can_read_case and is superseded by the
 *      RLS carried in the migration tree + the per-domain *_rls.sql files.
 *   4. Baseline public._dim_migrations (`db:migrate:baseline`) so a later
 *      `pnpm db:migrate` is a correct no-op instead of re-applying 0000 onward
 *      against a populated schema.
 *   5. Seed reference data + accounts by invoking the existing import/seed
 *      scripts through the server-only stub, passing --allow-remote.
 *
 * Every step is destructive against a fresh DB, so the script refuses to run
 * unless `--target remote` is passed (mirrors db-bootstrap's --allow-remote
 * loud confirmation). Idempotent: safe to re-run.
 *
 * ENV (read from process.env; .env.local / .env are loaded for convenience but
 *      do NOT override values already exported):
 *   DATABASE_URL                required. Use the SESSION pooler (port 5432) for
 *                               provisioning — db:push + DDL need a real session,
 *                               NOT the transaction pooler (6543).
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *                               required for the seed step (step 5).
 *
 * USAGE
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm deploy:provision --target remote
 *   pnpm deploy:provision --target remote --reference-only  # no test users
 *   pnpm deploy:provision --target remote --no-seeds        # schema + SQL only
 *   pnpm deploy:provision --target remote --dry-run         # print the plan
 *
 * EXIT CODES
 *   0  success
 *   1  a hard step failed (db:push, baseline, or a seed script)
 *   2  DATABASE_URL not set
 *   3  missing `--target remote` confirmation
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const targetIdx = argv.indexOf("--target");
const TARGET = targetIdx >= 0 ? argv[targetIdx + 1] : undefined;
const DRY_RUN = argv.includes("--dry-run");
const NO_SEEDS = argv.includes("--no-seeds") || argv.includes("--schema-only");
const REFERENCE_ONLY = argv.includes("--reference-only");

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function header(title: string): void {
  const line = "=".repeat(Math.max(40, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function parsePgHost(url: string): string {
  const match = url.match(/^postgres(?:ql)?:\/\/[^:]+:[^@]+@([^:/]+):\d+\//);
  return match?.[1] ?? "(unparseable)";
}

// ---------------------------------------------------------------------------
// Env + confirmation guard
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL is not set. Export the SESSION pooler (port 5432) URL " +
      "of the target Supabase before running this script.",
  );
  process.exit(2);
}
// Narrowed at module scope so the type flows into main()'s closure (TS does not
// propagate the guard above into nested function bodies for a module-level let).
const DB_URL: string = DATABASE_URL;

if (TARGET !== "remote") {
  console.error(
    [
      "",
      "==============================================================",
      "  ABORT: deploy:provision requires explicit confirmation.",
      "==============================================================",
      `  DATABASE_URL host: ${parsePgHost(DATABASE_URL)}`,
      "",
      "  This script runs db:push, replays every migration, applies the",
      "  loose db/*.sql, baselines the migration ledger and seeds — all",
      "  destructive against a fresh DB. Aiming it at the wrong project",
      "  is a production incident.",
      "",
      "  Re-run with the confirmation flag once you are sure:",
      "    pnpm deploy:provision --target remote",
      "==============================================================",
      "",
    ].join("\n"),
  );
  process.exit(3);
}

console.warn(
  [
    "",
    "==============================================================",
    "  deploy:provision — --target remote in effect.",
    `  DATABASE_URL host: ${parsePgHost(DATABASE_URL)}`,
    `  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLY"}`,
    `  Seeds: ${NO_SEEDS ? "skipped" : REFERENCE_ONLY ? "reference data only" : "reference data + test users"}`,
    "==============================================================",
    "",
  ].join("\n"),
);

// ---------------------------------------------------------------------------
// Spawn helpers (mirror db-bootstrap: shell:true on Windows for pnpm/node)
// ---------------------------------------------------------------------------

function pnpmRun(
  command: string,
  scriptArgs: string[] = [],
  extraEnv: Record<string, string | undefined> = {},
): boolean {
  const result = spawnSync("pnpm", [command, ...scriptArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  return result.status === 0;
}

// Launch a DB-touching script with the server-only stub registered first, the
// same way package.json's seed:* scripts do. Extra env lets us align the
// supabase SDK vars for the seed step.
function seedRun(
  scriptPath: string,
  scriptArgs: string[] = [],
  extraEnv: Record<string, string | undefined> = {},
): boolean {
  const result = spawnSync(
    "node",
    [
      "--import",
      "./scripts/register-server-only-stub.mjs",
      "--import",
      "tsx",
      scriptPath,
      ...scriptArgs,
    ],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    },
  );
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Best-effort SQL application via postgres.js (NO psql)
// ---------------------------------------------------------------------------

type Sql = ReturnType<typeof postgres>;

/**
 * Detects the `-- dim:no-transaction` opt-out (first five lines) — the same
 * directive scripts/migrate.ts honors. Such files carry statements that cannot
 * run inside a transaction block (CREATE INDEX CONCURRENTLY, ALTER TYPE ADD
 * VALUE); postgres.js wraps a multi-statement string in an implicit transaction,
 * so those must be sent one statement at a time.
 */
function isNoTransaction(contents: string): boolean {
  return contents.split("\n").slice(0, 5).join("\n").includes("-- dim:no-transaction");
}

/**
 * Apply one SQL file best-effort. Returns true when it applied cleanly, false
 * when it errored (errors are logged, never thrown — the replay tolerates
 * "already exists" because db:push already built the columns). For
 * `-- dim:no-transaction` files, statements are split and sent individually so
 * CONCURRENTLY / ADD VALUE are not bundled into an implicit transaction.
 */
async function applySqlFileBestEffort(sql: Sql, filePath: string): Promise<boolean> {
  const contents = readFileSync(filePath, "utf8");
  const label = path.basename(filePath);

  if (isNoTransaction(contents)) {
    // Cannot split dollar-quoted bodies reliably; such statements belong in a
    // transactional migration. Skip loudly rather than corrupt.
    if (/\$[A-Za-z_]*\$/.test(contents)) {
      console.warn(`  ! ${label}: dim:no-transaction + dollar-quoting — skipped (cannot split).`);
      return false;
    }
    const statements = contents
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.replace(/--[^\n]*/g, "").trim().length > 0);
    let hadError = false;
    for (const stmt of statements) {
      try {
        await sql.unsafe(`${stmt};`);
      } catch (err) {
        hadError = true;
        console.warn(`  ! ${label}: ${(err as Error).message.split("\n")[0]}`);
      }
    }
    console.log(`  ${hadError ? "~" : "+"} ${label} [no-transaction]`);
    return !hadError;
  }

  try {
    await sql.unsafe(contents);
    console.log(`  + ${label}`);
    return true;
  } catch (err) {
    // Whole-file rollback (implicit txn) — expected for files whose early
    // statements duplicate what db:push already created. The functions/triggers
    // we actually want land from files that use CREATE OR REPLACE / IF NOT
    // EXISTS and therefore replay cleanly.
    console.warn(`  ~ ${label}: ${(err as Error).message.split("\n")[0]}`);
    return false;
  }
}

// The loose orthogonal SQL, in dependency order. RLS files are applied AFTER
// the migration replay (step 2) so can_read_case() and friends already exist.
// db/rls.sql is deliberately omitted (see header).
const LOOSE_SQL_ORDER = [
  "db/triggers.sql",
  "db/storage.sql",
  "db/welfare_storage.sql",
  "db/exports_storage.sql",
  "db/cases_rls.sql",
  "db/foster_rls.sql",
  "db/organizations_rls.sql",
  "db/scheduling_rls.sql",
  "db/welfare_rls.sql",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const migrationsDir = "db/migrations";
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // ---- Step 1 — drizzle-kit push -------------------------------------------
  header("Step 1/5 — drizzle-kit push (schema.ts → remote DB)");
  if (DRY_RUN) {
    console.log("  WOULD run: pnpm db:push (CI=true)");
  } else if (!pnpmRun("db:push", [], { CI: "true" })) {
    console.error("FATAL: db:push failed.");
    process.exit(1);
  }

  // ---- Step 2 — replay migrations (best-effort) ----------------------------
  header(`Step 2/5 — replay ${migrationFiles.length} db/migrations/*.sql (best-effort)`);
  console.log("(benign 'already exists' errors are expected — step 1 created the columns)\n");
  if (DRY_RUN) {
    console.log(`  WOULD replay ${migrationFiles.length} migration file(s) via postgres.js.`);
    header("Step 3/5 — apply loose db/*.sql (triggers, storage, RLS)");
    for (const sqlPath of LOOSE_SQL_ORDER) {
      console.log(`  WOULD apply ${sqlPath}${existsSync(sqlPath) ? "" : " (MISSING)"}`);
    }
    console.log("  WOULD run: NOTIFY pgrst, 'reload schema'");
  } else {
    const sql = postgres(DB_URL, { prepare: false, max: 1, onnotice: () => {} });
    try {
      let clean = 0;
      for (const fileName of migrationFiles) {
        if (await applySqlFileBestEffort(sql, path.join(migrationsDir, fileName))) clean += 1;
      }
      console.log(
        `\nMigrations replayed: ${clean}/${migrationFiles.length} clean (non-clean files are tolerated — see header).`,
      );

      // ---- Step 3 — loose orthogonal SQL (best-effort) ---------------------
      header("Step 3/5 — apply loose db/*.sql (triggers, storage, RLS)");
      for (const sqlPath of LOOSE_SQL_ORDER) {
        if (!existsSync(sqlPath)) {
          console.warn(`  SKIP: ${sqlPath} not present.`);
          continue;
        }
        await applySqlFileBestEffort(sql, sqlPath);
      }

      // Tell PostgREST to refresh its schema cache so RPCs/columns added post
      // startup become visible without a stack restart.
      try {
        await sql.unsafe("NOTIFY pgrst, 'reload schema';");
        console.log("  + NOTIFY pgrst, 'reload schema'");
      } catch {
        /* best-effort */
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  // ---- Step 4 — baseline the migration ledger ------------------------------
  header("Step 4/5 — baseline public._dim_migrations (so db:migrate is a no-op)");
  if (DRY_RUN) {
    console.log("  WOULD run: pnpm db:migrate:baseline");
  } else if (!pnpmRun("db:migrate:baseline")) {
    console.error("FATAL: baseline of the migration ledger failed.");
    process.exit(1);
  }

  // ---- Step 5 — seed reference data + accounts -----------------------------
  if (NO_SEEDS) {
    console.log("\n--no-seeds / --schema-only: stopping after step 4.");
    return;
  }

  header("Step 5/5 — seed reference data + accounts");

  // seed-test-users reads NEXT_PUBLIC_SUPABASE_URL; accept SUPABASE_URL as an
  // alias so the operator only has to export one name.
  const seedEnv: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  };

  const seeds: { path: string; label: string }[] = [
    { path: "scripts/import-indec-localities.ts", label: "INDEC localities (~4k rows)" },
    { path: "scripts/import-caba-barrios.ts", label: "CABA barrios (48 rows)" },
  ];
  if (!REFERENCE_ONLY) {
    seeds.push({
      path: "scripts/seed-test-users.ts",
      label: "Test users (admin/owner/vet/orgadmin/govt)",
    });
  }

  let failed = 0;
  for (const { path: scriptPath, label } of seeds) {
    if (!existsSync(scriptPath)) {
      console.warn(`  SKIP: ${scriptPath} not present.`);
      continue;
    }
    console.log(`\n> ${label} (${scriptPath})`);
    if (DRY_RUN) {
      console.log(
        `  WOULD run: node --import ./scripts/register-server-only-stub.mjs --import tsx ${scriptPath} --allow-remote`,
      );
      continue;
    }
    // --allow-remote opts the seeds out of their local-only guard. Unknown to
    // the reference importers (they ignore it); required by seed-test-users.
    if (!seedRun(scriptPath, ["--allow-remote"], seedEnv)) {
      console.error(`WARN: ${scriptPath} exited non-zero.`);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`\nProvision finished with ${failed} seed failure(s).`);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log(`\n${DRY_RUN ? "Dry run complete — no changes made." : "Provision complete."}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[FATAL]", err);
    process.exit(1);
  });
