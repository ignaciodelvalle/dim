// Storage WRITE-policy tripwire — B24.
//
// WHY THIS EXISTS, AND WHY IT IS NOT check-rls-coverage
// ---------------------------------------------------------------------------
// `scripts/check-rls-coverage.ts` inspects `storage.objects` policies against a
// live database and refuses any policy that admits a caller role but cannot name
// the caller. It considers only SELECT and ALL, deliberately, and says so:
//
//     // Only read paths enumerate. INSERT is a write grant and cannot list;
//     // UPDATE/DELETE carry their own USING clause but do not expose content.
//
// That was a real decision and its reasoning is sound as far as it goes. What it
// leaves open is a blind spot with a name: `db/storage.sql` grants INSERT on
// `pet-photos` and on `event-attachments` to EVERY authenticated account, with
// `bucket_id = '<name>'` as the entire predicate. Any signed-up account can
// write objects into either bucket, at any path, as many as it likes. Uploads
// are supposed to be gated by the server action that verifies pet ownership —
// but the grant does not know that, and nothing stops a client from calling the
// storage API directly with its own token.
//
// The point of THIS file is narrower than fixing that, and the difference
// matters: closing those two grants needs signed uploads to land in the same
// change (~30 upload sites legitimately run as the signed-in user), which is a
// later work unit. What must not happen in the meantime is the pattern
// SPREADING, silently, because the fence that would have noticed reads only
// SELECT. So the two known grants are frozen — named, with their exact
// predicates pinned — and anything NEW of the same shape, or any widening of
// these two, fails.
//
// This is a tripwire, not an absolution. A frozen allowlist entry is a debt with
// a ticket on it, not a policy that is fine.
//
// WHAT IT CHECKS
//   1. Every `create policy … on storage.objects` in `db/**/*.sql` is parsed:
//      name, command, roles, and the full text of its `using` / `with check`
//      predicates.
//   2. WRITE commands only (insert / update / delete / all). SELECT is
//      check-rls-coverage's job and stays there.
//   3. Policies granted to a CALLER role (`authenticated`, `anon`, `public`, or
//      no `to` clause at all, which is PUBLIC by SQL default). A grant to
//      `service_role` alone is not a caller-facing grant.
//   4. A policy is PERMISSIVE when its predicate never mentions `auth.uid()` —
//      i.e. it cannot name who is asking, so `bucket_id = 'x'` is the whole of
//      it and it is true for every caller and every object.
//   5. A permissive write policy must appear in FROZEN_WRITE_GRANTS by name AND
//      its predicate must match the pinned text exactly. A new name fails. A
//      changed predicate fails — widening and narrowing alike, because both are
//      decisions that belong in this file rather than in a diff nobody reads.
//   6. Every FROZEN_WRITE_GRANTS entry must still be FOUND. An allowlist that
//      names a policy the scan cannot see is either a lie (the grant was closed
//      and nobody said so) or a broken parser, and both must be loud.
//   7. Non-vacuity: fewer than MIN_WRITE_POLICIES write policies discovered is a
//      FAILURE. A glob or a regex that stops matching produces an empty
//      inventory, an empty inventory produces no offenders, and no offenders
//      reads exactly like a clean run.
//
// WHY STATIC AND NOT AGAINST THE DATABASE
// ---------------------------------------------------------------------------
// It reads SQL text, so it runs in CI's offline `check` job with no Postgres —
// and, more importantly, it guards the SOURCE. `check-rls-coverage` can only see
// an environment that has been bootstrapped; a permissive grant added to
// `db/storage.sql` in a pull request is caught here, before any environment has
// it. The two are complements: this one guards what the repo DECLARES, that one
// guards what a database actually HAS.
//
// A NOTE ON MIGRATIONS, WHICH ARE IMMUTABLE
// ---------------------------------------------------------------------------
// A `create policy` inside `db/migrations/NNNN_*.sql` stays in history forever,
// even after a later migration drops it. Today no migration creates a permissive
// write policy (the storage lockdowns — 0123, 0164, 0172, 0176 — only DROP), so
// this scan does not model drop/create replay and does not need to. If a
// historical migration ever has to be exempted, give it a FROZEN_WRITE_GRANTS
// entry whose reason says which migration retired it. Modelling replay would
// mean this fence's verdict depended on file ordering, and a fence whose answer
// depends on how you sort the inputs is not one to trust.
//
// Run: pnpm tsx scripts/check-storage-write-policies.ts  (or: pnpm lint:storage-policies)
// Exits 0 when clean; exits 1 naming each offender.

import { globSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Everywhere the repo can declare a storage policy. */
export const SQL_GLOBS = ["db/*.sql", "db/migrations/*.sql"];

/** Commands that WRITE. `all` is included because it contains all four. */
const WRITE_COMMANDS = new Set(["insert", "update", "delete", "all"]);

/** Roles that reach the client bundle or any logged-in account. */
const CALLER_ROLES = new Set(["anon", "authenticated", "public"]);

/**
 * Non-vacuity floor. Measured 2026-08-25: 11 caller-facing write policies
 * across db/*.sql and db/migrations/*.sql. Set below the measurement so a
 * policy can be added or retired without a false alarm, and far above zero
 * because zero is what a broken scan looks like.
 */
export const MIN_WRITE_POLICIES = 8;

export type FrozenGrant = {
  /** The predicate, normalized: lower-cased, whitespace collapsed. */
  readonly predicate: string;
  /** Why it is still here, and what closes it. */
  readonly reason: string;
};

/**
 * THE FROZEN SET — the bucket-name-only write grants that exist TODAY.
 *
 * Two entries. Neither is acceptable; both are load-bearing until signed uploads
 * land, and pinning them exactly is what makes the third one impossible to add
 * by accident.
 */
export const FROZEN_WRITE_GRANTS: Record<string, FrozenGrant> = {
  pet_photos_authenticated_upload: {
    predicate: "bucket_id = 'pet-photos'",
    reason:
      "B24 — every authenticated account may write any object into pet-photos. Uploads are supposed to be gated by the server action that verifies pet ownership; the GRANT does not know that, and a client can call the storage API directly with its own token. CLOSED BY: signed uploads (server mints a scoped URL, bucket goes deny-all to callers), a later work unit — the two must land together because ~30 upload sites legitimately run as the signed-in user today.",
  },
  event_attachments_authenticated_upload: {
    predicate: "bucket_id = 'event-attachments'",
    reason:
      "B24 — same shape, Tier-3 data. db/storage.sql argues INSERT is safe here because 'an insert-only policy cannot enumerate', which is true and is not the whole question: it can still WRITE, into any path of a bucket holding vaccine cards and vet receipts. The read side was already closed (migration 0172 removed event_attachments_authenticated_read). CLOSED BY: signed uploads, same change as pet-photos.",
  },
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export type StoragePolicy = {
  file: string;
  name: string;
  command: string;
  roles: string[];
  /** Every `using` / `with check` predicate, normalized and joined. */
  predicate: string;
};

/** Drop `--` line comments without touching string literals. */
export function stripSqlComments(sql: string): string {
  const out: string[] = [];
  for (const line of sql.split("\n")) {
    let inString = false;
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "'") {
        inString = !inString;
        continue;
      }
      if (!inString && ch === "-" && line[i + 1] === "-") {
        cut = i;
        break;
      }
    }
    out.push(line.slice(0, cut));
  }
  return out.join("\n");
}

/** Lower-case and collapse runs of whitespace — the comparison form. */
export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The full text of every `create policy` statement, terminated by the `;` that
 * closes it at paren-depth zero and outside any string literal.
 *
 * Statement-aware rather than line-aware because these policies are written
 * across many lines and one of them (`revocations_admin_govt_upload`) carries a
 * nested `EXISTS (SELECT …)` with its own parentheses and its own semicolon-free
 * body. A line regex would have taken the first `)` it found.
 */
export function createPolicyStatements(sql: string): string[] {
  const statements: string[] = [];
  const re = /create\s+policy\b/gi;
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    let depth = 0;
    let inString = false;
    let end = sql.length;
    for (let i = m.index; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === "'") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth === 0) {
        end = i;
        break;
      }
    }
    statements.push(sql.slice(m.index, end));
  }
  return statements;
}

/** Every parenthesised group at depth 1, in order — the predicates. */
function predicateGroups(statement: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i];
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        groups.push(statement.slice(start, i));
        start = -1;
      }
    }
  }
  return groups;
}

/**
 * One `create policy` statement → a StoragePolicy, or null when it is not on
 * `storage.objects`.
 *
 * A statement with no `to` clause is PUBLIC by SQL default, and is reported as
 * such rather than skipped: failing closed is the only safe direction here.
 */
export function parsePolicy(file: string, statement: string): StoragePolicy | null {
  if (!/\bon\s+storage\.objects\b/i.test(statement)) return null;

  const name = statement.match(/create\s+policy\s+"([^"]+)"/i)?.[1];
  const command = statement.match(/\bfor\s+(insert|update|delete|select|all)\b/i)?.[1];
  if (!name || !command) return null;

  const rolesRaw = statement.match(/\bto\s+([a-z_,\s]+?)\s*(?:\busing\b|\bwith\s+check\b|$)/i)?.[1];
  const roles = rolesRaw
    ? rolesRaw
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter((r) => r !== "")
    : ["public"];

  return {
    file,
    name,
    command: command.toLowerCase(),
    roles,
    predicate: normalize(predicateGroups(statement).join(" and ")),
  };
}

/** Every storage.objects policy the repo declares. */
export function inventory(files: readonly string[]): StoragePolicy[] {
  const found: StoragePolicy[] = [];
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(file, "utf8"));
    for (const statement of createPolicyStatements(sql)) {
      const policy = parsePolicy(file.replaceAll("\\", "/"), statement);
      if (policy) found.push(policy);
    }
  }
  return found;
}

/** Write policies granted to a role a client can actually hold. */
export function callerFacingWrites(policies: readonly StoragePolicy[]): StoragePolicy[] {
  return policies.filter(
    (p) => WRITE_COMMANDS.has(p.command) && p.roles.some((r) => CALLER_ROLES.has(r)),
  );
}

/**
 * A policy that cannot name who is asking.
 *
 * `auth.uid()` is the only way a storage policy can identify the caller, bare or
 * inside a subquery (`(select auth.uid())`, the 0137 convention). Without it the
 * predicate is a property of the OBJECT — its bucket, its path — and is true for
 * everybody who can reach the endpoint.
 */
export function isPermissive(policy: StoragePolicy): boolean {
  return !policy.predicate.includes("auth.uid()");
}

export type Verdict = {
  writes: StoragePolicy[];
  permissive: StoragePolicy[];
  /** New bucket-name-only write grants — the thing this fence exists to stop. */
  unfrozen: StoragePolicy[];
  /** Frozen grants whose predicate no longer matches the pinned text. */
  changed: Array<{ policy: StoragePolicy; expected: string }>;
  /** Allowlist entries the scan never saw. */
  missing: string[];
};

export function evaluate(policies: readonly StoragePolicy[]): Verdict {
  const writes = callerFacingWrites(policies);
  const permissive = writes.filter(isPermissive);

  const unfrozen: StoragePolicy[] = [];
  const changed: Array<{ policy: StoragePolicy; expected: string }> = [];
  const seen = new Set<string>();

  for (const policy of permissive) {
    const frozen = FROZEN_WRITE_GRANTS[policy.name];
    if (!frozen) {
      unfrozen.push(policy);
      continue;
    }
    seen.add(policy.name);
    if (policy.predicate !== normalize(frozen.predicate)) {
      changed.push({ policy, expected: normalize(frozen.predicate) });
    }
  }

  const missing = Object.keys(FROZEN_WRITE_GRANTS).filter((name) => !seen.has(name));
  return { writes, permissive, unfrozen, changed, missing };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function listSqlFiles(): string[] {
  const seen = new Set<string>();
  for (const pattern of SQL_GLOBS) {
    for (const file of globSync(pattern)) {
      const p = file.replaceAll("\\", "/");
      if (p.includes("node_modules/")) continue;
      seen.add(p);
    }
  }
  return [...seen].sort();
}

function runCheck(): void {
  const files = listSqlFiles();
  const policies = inventory(files);
  const verdict = evaluate(policies);

  // Rule 7 — non-vacuity, checked BEFORE any verdict is reported.
  if (verdict.writes.length < MIN_WRITE_POLICIES) {
    console.error(
      [
        "",
        `✗ check-storage-write-policies: found only ${verdict.writes.length} caller-facing storage WRITE policy/policies (floor ${MIN_WRITE_POLICIES}).`,
        `  Scanned ${files.length} file(s) matching ${SQL_GLOBS.join(", ")}.`,
        "  That is not a pass. An empty inventory produces no offenders, and no",
        "  offenders reads exactly like a clean run — see MIN_WRITE_POLICIES.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const problems: string[] = [];

  for (const policy of verdict.unfrozen) {
    problems.push(
      [
        `  NEW bucket-name-only write grant: "${policy.name}"  (${policy.file})`,
        `      for ${policy.command} to ${policy.roles.join(", ")}`,
        `      predicate: ${policy.predicate || "(none)"}`,
        "      It grants a write to every caller holding that role, for every object in the",
        "      bucket, because the predicate never names who is asking (no auth.uid()).",
        "      Scope it with auth.uid(), or move the write behind a signed URL minted by",
        "      the server. If it genuinely must be permissive, that is a decision that gets",
        "      written into FROZEN_WRITE_GRANTS with a reason and a ticket — not merged.",
      ].join("\n"),
    );
  }

  for (const { policy, expected } of verdict.changed) {
    problems.push(
      [
        `  FROZEN grant changed: "${policy.name}"  (${policy.file})`,
        `      pinned:  ${expected}`,
        `      found:   ${policy.predicate || "(none)"}`,
        "      These two grants are frozen exactly, not approximately. If this is the B24",
        "      fix, remove the entry from FROZEN_WRITE_GRANTS in the same commit; if it is",
        "      a widening, it is the thing this fence exists to stop.",
      ].join("\n"),
    );
  }

  for (const name of verdict.missing) {
    problems.push(
      [
        `  FROZEN grant not found: "${name}"`,
        "      The allowlist names a policy the scan cannot see. Either the grant was closed",
        "      and the entry was left behind (delete it — that is good news worth recording),",
        "      or the parser stopped seeing it, which means this fence is measuring nothing.",
      ].join("\n"),
    );
  }

  if (problems.length > 0) {
    console.error("");
    console.error("✗ storage write-policy tripwire FAILED");
    console.error("");
    console.error(problems.join("\n\n"));
    console.error("");
    process.exit(1);
  }

  console.log(
    `✓ storage write-policy tripwire — ${verdict.writes.length} caller-facing write policy/policies across ${files.length} SQL file(s); ${verdict.permissive.length} bucket-name-only, all frozen and unchanged (${Object.keys(FROZEN_WRITE_GRANTS).join(", ")}).`,
  );
}

// Only run when invoked as a CLI; importing from tests must not exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-storage-write-policies.ts") ||
    process.argv[1].endsWith("check-storage-write-policies.js"));

if (isMain) runCheck();
