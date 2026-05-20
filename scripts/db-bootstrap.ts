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
 *   pnpm db:bootstrap --allow-remote   # opt out of the local-host guard
 *
 * Safety: refuses to run unless DATABASE_URL points at one of
 * {127.0.0.1, localhost, host.docker.internal, ::1}. The remote opt-out
 * exists for staging bootstraps but should never appear in a CI workflow
 * for the test job. Every step here is destructive — running it against
 * production by mistake is a real incident.
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
 *   4   DATABASE_URL points at a non-local host (use --allow-remote to override)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const ALLOW_REMOTE = args.has("--allow-remote");

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
// Safety guard — refuse to run against a remote DB unless explicitly allowed
// ---------------------------------------------------------------------------
//
// Bootstrap is destructive at every step: db:push alters schema, replayed
// migrations alter schema, db/*.sql adds policies + functions, and the seed
// step inserts thousands of rows. Aiming this at production by mistake is
// catastrophic. The repo had no separation between local and remote
// DATABASE_URL configuration when this script was written — until that's
// fixed at the project level, this guard is the seatbelt.
//
// Allow-list a few hostnames that are unambiguously local. Anything else
// requires --allow-remote, which prints a loud confirmation in the output
// so reviewers can spot it in a CI log or shell history.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal", "::1"]);

if (!LOCAL_HOSTS.has(pg.host) && !ALLOW_REMOTE) {
  console.error(
    [
      "",
      "==============================================================",
      "  ABORT: db:bootstrap target is NOT a local Postgres.",
      "==============================================================",
      `  DATABASE_URL host: ${pg.host}`,
      `  Allowed local hosts: ${[...LOCAL_HOSTS].join(", ")}`,
      "",
      "  This script applies destructive schema changes and writes",
      "  thousands of seed rows. Running it against a remote DB by",
      "  mistake is a production incident.",
      "",
      "  If you meant to target this host, re-run with --allow-remote.",
      "  Otherwise edit .env.local to point at the local Postgres:",
      "    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "==============================================================",
      "",
    ].join("\n"),
  );
  process.exit(4);
}

if (!LOCAL_HOSTS.has(pg.host) && ALLOW_REMOTE) {
  console.warn(
    [
      "",
      "==============================================================",
      "  WARNING: --allow-remote in effect.",
      `  DATABASE_URL host: ${pg.host}`,
      "  About to apply destructive changes to a remote DB.",
      "==============================================================",
      "",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function header(title: string): void {
  const line = "=".repeat(Math.max(40, title.length + 4));
  console.log(`\n${line}\n  ${title}\n${line}`);
}

// Supabase ships Postgres inside its `supabase_db_<project_id>` container;
// host machines often don't have `psql` installed (notably Windows). Going
// through `docker exec` keeps the script portable — no client-side install,
// no PATH wrangling, no Docker-vs-WSL ambiguity. Falls back to host psql if
// docker isn't available (e.g. CI service-container setups).
function findPostgresContainer(): string | null {
  const result = spawnSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return null;
  return result.stdout?.trim().split("\n")[0] || null;
}

const POSTGRES_CONTAINER = findPostgresContainer();

function psql(file: string, opts: { strict: boolean }): boolean {
  const onErrorStop = opts.strict ? ["-v", "ON_ERROR_STOP=1"] : [];
  const sql = readFileSync(file, "utf8");
  if (POSTGRES_CONTAINER) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        POSTGRES_CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        ...onErrorStop,
      ],
      { input: sql, stdio: ["pipe", "inherit", "inherit"] },
    );
    return result.status === 0;
  }
  // Fallback: host psql via DATABASE_URL.
  const result = spawnSync(
    "psql",
    ["-h", pg.host, "-p", pg.port, "-U", pg.user, "-d", pg.db, ...onErrorStop, "-f", file],
    { stdio: "inherit", env: { ...process.env, PGPASSWORD: pg.password } },
  );
  return result.status === 0;
}

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
// drizzle.config.ts opts into strict (interactive) mode unless CI=true.
// Bootstrap is automation by definition — force non-interactive so it
// doesn't hang waiting on stdin.
if (!pnpmRun("db:push", [], { CI: "true" })) {
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
