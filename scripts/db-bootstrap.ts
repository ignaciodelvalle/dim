#!/usr/bin/env tsx
/**
 * DB bootstrap — replicates the manual "paste-into-Studio + run-scripts" dance
 * that brings a brand-new Postgres up to the state the test suite expects.
 *
 * Intended for two callers:
 *   - **CI**: a fresh `supabase start` produces an empty DB; bootstrap fills it.
 *   - **Fresh local clones**: dev clones the repo, runs `supabase start` and
 *     then `pnpm db:bootstrap` instead of pasting nine SQL files into Studio.
 *
 * Idempotent. Re-running on an already-bootstrapped DB is safe — `db/*.sql`
 * files use IF NOT EXISTS / IF EXISTS / DROP IF EXISTS + CREATE patterns, and
 * the seed scripts UPSERT.
 *
 * Steps (in order):
 *   1. `pnpm db:push` — drizzle-kit syncs schema.ts to the DB (enums, tables,
 *      columns, indexes, FKs). Authoritative for everything Drizzle models.
 *   2. Replay `db/migrations/*.sql` in numeric order, BEST-EFFORT. After
 *      step 1 the schema already matches schema.ts, so "column already exists"
 *      errors are expected and ignored. What we actually want from this step
 *      are the bits schema.ts can't express: CHECK constraints, functions
 *      (e.g. check_pet_event_case_id_immutable, enforce_admin_no_pets,
 *      cases_set_updated_at) and triggers. Real failures here are quiet by
 *      design; if a custom function doesn't land, downstream tests will yell.
 *   3. Apply `db/*.sql` in dependency order, STRICTLY:
 *        triggers.sql → cases_rls.sql → rls.sql → per-domain RLS → storage.sql
 *      These files are normally pasted into Studio by hand (see the header of
 *      db/triggers.sql). Order matters: cases_rls defines can_read_case which
 *      rls.sql references; triggers go first since later policies may call
 *      functions defined there.
 *   4. Seed reference data + test users via the existing import scripts:
 *      import-indec-localities, import-caba-barrios, seed-test-users.
 *
 * Usage:
 *   pnpm db:bootstrap                  # full bootstrap (1+2+3+4)
 *   pnpm db:bootstrap --no-seeds       # skip step 4 (schema only, fast)
 *   pnpm db:bootstrap --bare           # only step 1 (schema.ts → DB)
 *
 * Env:
 *   DATABASE_URL                       required. Read from .env.local.
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  required for step 4 only.
 *
 * Exit codes:
 *   0   success
 *   1   step 1 (db:push) or step 3 (db/*.sql) failed
 *   2   step 4 (a seed script) failed
 *   3   DATABASE_URL not set
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const BARE = args.has("--bare");
const NO_SEEDS = args.has("--no-seeds") || BARE;

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL is not set. Copy .env.local.example to .env.local " +
      "or export DATABASE_URL before running this script.",
  );
  process.exit(3);
}

function parsePgUrl(url: string) {
  // postgres://user:password@host:port/database
  const match = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!match) {
    throw new Error(`Cannot parse DATABASE_URL: ${url}`);
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    db: match[5],
  };
}

const pg = parsePgUrl(DATABASE_URL);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function header(title: string): void {
  const line = "=".repeat(Math.max(40, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function psql(file: string, opts: { strict: boolean }): boolean {
  const baseArgs = ["-h", pg.host, "-p", pg.port, "-U", pg.user, "-d", pg.db];
  const args = opts.strict
    ? [...baseArgs, "-v", "ON_ERROR_STOP=1", "-f", file]
    : [...baseArgs, "-f", file];
  const result = spawnSync("psql", args, {
    stdio: "inherit",
    env: { ...process.env, PGPASSWORD: pg.password },
  });
  return result.status === 0;
}

function pnpmRun(command: string, scriptArgs: string[] = []): boolean {
  const result = spawnSync("pnpm", [command, ...scriptArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function tsxRun(scriptPath: string): boolean {
  const result = spawnSync("pnpm", ["tsx", scriptPath], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Step 1 — Schema via drizzle-kit push
// ---------------------------------------------------------------------------

header("Step 1/4 — drizzle-kit push (schema.ts → DB)");
if (!pnpmRun("db:push")) {
  console.error("FATAL: db:push failed.");
  process.exit(1);
}

if (BARE) {
  console.log("\n--bare: stopping after step 1.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 2 — Replay migrations (best-effort)
// ---------------------------------------------------------------------------

header("Step 2/4 — replay db/migrations/*.sql (best-effort)");

const migrationsDir = "db/migrations";
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`Replaying ${migrationFiles.length} migrations…`);
console.log("(benign 'already exists' errors are expected — step 1 already created the columns)");

let migrationsAttempted = 0;
let migrationsClean = 0;
for (const fileName of migrationFiles) {
  migrationsAttempted += 1;
  const fullPath = path.join(migrationsDir, fileName);
  const ok = psql(fullPath, { strict: false });
  if (ok) migrationsClean += 1;
}
console.log(
  `Migrations replayed: ${migrationsClean}/${migrationsAttempted} exit-zero (non-zero exits are tolerated — see header).`,
);

// ---------------------------------------------------------------------------
// Step 3 — Orthogonal SQL (strict)
// ---------------------------------------------------------------------------

header("Step 3/4 — apply db/*.sql (triggers, RLS, storage) — STRICT");

const ORTHOGONAL_ORDER = [
  "db/triggers.sql",
  "db/cases_rls.sql",
  "db/rls.sql",
  "db/organizations_rls.sql",
  "db/welfare_rls.sql",
  "db/foster_rls.sql",
  "db/scheduling_rls.sql",
  "db/storage.sql",
  "db/welfare_storage.sql",
];

for (const sqlPath of ORTHOGONAL_ORDER) {
  if (!existsSync(sqlPath)) {
    console.warn(`SKIP: ${sqlPath} not present.`);
    continue;
  }
  console.log(`\n> ${sqlPath}`);
  if (!psql(sqlPath, { strict: true })) {
    console.error(`FATAL: ${sqlPath} failed.`);
    process.exit(1);
  }
}

if (NO_SEEDS) {
  console.log("\n--no-seeds: stopping after step 3.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Step 4 — Seed reference data + test users
// ---------------------------------------------------------------------------

header("Step 4/4 — seed reference data + test users");

const SEEDS: { path: string; label: string }[] = [
  {
    path: "scripts/import-indec-localities.ts",
    label: "INDEC localities (~4k rows)",
  },
  { path: "scripts/import-caba-barrios.ts", label: "CABA barrios (48 rows)" },
  {
    path: "scripts/seed-test-users.ts",
    label: "Test users (admin/owner/vet/orgadmin/govt)",
  },
];

let seedsFailed = 0;
for (const { path: scriptPath, label } of SEEDS) {
  if (!existsSync(scriptPath)) {
    console.warn(`SKIP: ${scriptPath} not present.`);
    continue;
  }
  console.log(`\n> ${label} (${scriptPath})`);
  if (!tsxRun(scriptPath)) {
    console.error(`WARN: ${scriptPath} exited non-zero — continuing.`);
    seedsFailed += 1;
  }
}

if (seedsFailed > 0) {
  console.error(`\nBootstrap finished with ${seedsFailed} seed failure(s).`);
  process.exit(2);
}

console.log("\nBootstrap complete.");
