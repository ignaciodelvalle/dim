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
//   1. Every `create policy` AND every `alter policy` … `on storage.objects` in
//      `db/**/*.sql` is parsed: name, command, roles, and the full text of its
//      `using` / `with check` predicates.
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
// THE THIRD EVASION: `ALTER POLICY` (fixed 2026-08-25)
// ---------------------------------------------------------------------------
// Two legal SQL forms already had to be taught to this parser (an unquoted name,
// an omitted `FOR` clause — see parsePolicy). This is the third, and it is the
// worst of the three, because it is not a spelling: it is a whole STATEMENT the
// scan never entered. The scan's only entry point was `/create\s+policy/`, so
//
//     ALTER POLICY "pet_photos_authenticated_upload" ON storage.objects
//       WITH CHECK (bucket_id = 'pet-photos' OR bucket_id = 'anything-else');
//
// widened a FROZEN grant and the tripwire printed green over it. And the idiom
// is not hypothetical here: 80 `ALTER POLICY` statements live in `db/`, almost
// all of them in migrations 0137 and 0168 — it is the repo's normal way of
// changing a predicate, precisely
// because `ALTER POLICY` only replaces the USING / WITH CHECK expression (and
// optionally the `TO` roles) and so is the smallest safe edit.
//
// It is now a FIRST-CLASS statement, not a special case. Two consequences worth
// stating because they are deliberately conservative:
//
//   · `ALTER POLICY` cannot change a policy's COMMAND (Postgres does not allow
//     it), so an ALTER never carries a `FOR` clause. This scan reads an absent
//     command as `all` — the widest — which for an ALTER means every one of them
//     is treated as a WRITE policy. That over-reports rather than under-reports,
//     which is the only acceptable direction here.
//   · An `ALTER` with no `TO` clause leaves the roles unchanged, which this scan
//     cannot know because it does not model replay. It reads absent roles as
//     PUBLIC, again the widest reading. A narrowing ALTER (one that ADDS
//     auth.uid()) is not permissive and passes; a widening one fails, which is
//     the whole point.
//
// KNOWN LIMIT, NAMED RATHER THAN PARSED: dynamic SQL. A policy created or
// altered inside `EXECUTE format(…)` — or any `DO $$ … $$` block that builds the
// statement out of variables — is not read by this scan and cannot be, because
// the statement does not exist until runtime. There is none in `db/` today
// (measured 2026-08-25: zero `EXECUTE format` touching storage.objects). If one
// is ever needed, the honest fix is to write the policy literally and keep the
// dynamic part out of the grant, not to teach a regex to interpolate.
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

/**
 * Non-vacuity floor for the ALTER path specifically, and it needs its own number
 * for a reason MIN_WRITE_POLICIES cannot cover.
 *
 * Today there is NO `alter policy … on storage.objects` in the repo — the 80
 * ALTER POLICY statements in `db/` (almost all in migrations 0137 and 0168) all
 * target `public.*` tables and are correctly skipped. So the ALTER branch
 * contributes ZERO to every other count in this file, and a regression that
 * silently stopped matching `alter policy` would move nothing: the fence would
 * keep printing the same green line it prints today, with the third evasion
 * reopened.
 *
 * This floor is measured BEFORE the storage.objects filter, over every policy
 * statement of either kind the scan can see. Measured 2026-08-25: 80 alter, 158
 * create. It is the only check that fails when the ALTER regex dies.
 */
export const MIN_ALTER_STATEMENTS = 50;

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

/** `create policy …` or `alter policy …`. Both are in subject. */
export type PolicyStatementKind = "create" | "alter";

export type StoragePolicy = {
  file: string;
  name: string;
  kind: PolicyStatementKind;
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

export type PolicyStatement = { kind: PolicyStatementKind; text: string };

/**
 * The full text of every `create policy` AND `alter policy` statement,
 * terminated by the `;` that closes it at paren-depth zero and outside any
 * string literal.
 *
 * Statement-aware rather than line-aware because these policies are written
 * across many lines and one of them (`revocations_admin_govt_upload`) carries a
 * nested `EXISTS (SELECT …)` with its own parentheses and its own semicolon-free
 * body. A line regex would have taken the first `)` it found.
 *
 * IT WAS `createPolicyStatements` UNTIL 2026-08-25, and the rename is the fix
 * rather than a tidy-up: the old name was an accurate description of a scan that
 * could not see a widening written as an ALTER — the repo's own normal idiom for
 * changing a predicate. See the header.
 */
export function policyStatements(sql: string): PolicyStatement[] {
  const statements: PolicyStatement[] = [];
  const re = /\b(create|alter)\s+policy\b/gi;
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    const kind = m[1].toLowerCase() as PolicyStatementKind;
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
    statements.push({ kind, text: sql.slice(m.index, end) });
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
 * A `create policy … on storage.objects` this parser could not read.
 *
 * It exists because "could not parse" and "not a storage policy" used to be the
 * same answer — `null` — and `inventory` skipped both. See parsePolicy.
 */
export type UnparseablePolicy = { file: string; statement: string };

/** Distinguishes the three outcomes a `create policy` statement can have. */
export type ParseResult =
  | { kind: "policy"; policy: StoragePolicy }
  /** Not on storage.objects — genuinely none of this fence's business. */
  | { kind: "skip" }
  /** On storage.objects and unreadable. An OFFENDER, never a skip. */
  | { kind: "unparseable" };

/**
 * One `create policy` statement → a StoragePolicy, a skip, or an offender.
 *
 * A statement with no `to` clause is PUBLIC by SQL default, and is reported as
 * such rather than skipped: failing closed is the only safe direction here.
 *
 * ===========================================================================
 * THIS PARSER FAILED OPEN ON TWO LEGAL SQL FORMS (fixed 2026-08-25)
 * ===========================================================================
 * The header above promises "failing closed is the only safe direction". It was
 * not true of the parser itself. Both of these are valid Postgres, both appear
 * in this repo's own SQL, and both made `parsePolicy` return null — after which
 * `inventory` silently dropped the statement and the fence printed green:
 *
 *   1. AN UNQUOTED POLICY NAME. `create policy cases_select_visible on …` is the
 *      style used by db/cases_rls.sql:142 and by two migrations. The old regex
 *      was `create\s+policy\s+"([^"]+)"` — double quotes REQUIRED. A permissive
 *      write grant written in the repo's own prevailing style was invisible to
 *      the tripwire meant to catch it.
 *
 *   2. AN OMITTED `FOR` CLAUSE. Postgres defaults to `FOR ALL`, which is the
 *      WIDEST grant there is — SELECT, INSERT, UPDATE and DELETE at once. The
 *      old code required a `for` match and skipped the statement without one,
 *      so the single most dangerous form was the one form guaranteed to pass.
 *
 * Both are now read: names may be quoted or bare, and an absent command means
 * `all`, exactly as the SQL does.
 *
 * And the residue is handled the way the header always claimed: a statement that
 * says `on storage.objects` and that this parser still cannot read is returned
 * as `unparseable` and reported as an OFFENDER. A parser that cannot see a
 * policy is not evidence that the policy is safe. That is the general fix; the
 * two regexes above are the specific ones, and only the general fix survives the
 * next SQL form nobody anticipated.
 */
export function parsePolicy(file: string, statement: PolicyStatement): ParseResult {
  const text = statement.text;

  // WHITESPACE AROUND THE DOT. `storage . objects` and `storage.objects` are the
  // same identifier to Postgres and were two different answers to this fence
  // until 2026-08-25 — one statement in subject, the other silently skipped as
  // "not a storage policy". Nobody writes it with spaces on purpose, which is
  // exactly why it would work: an evasion nobody would suspect costs one
  // keystroke. Same reasoning as the unquoted-name and omitted-FOR fixes above —
  // a parser that fails open on a legal spelling is not a parser, it is a
  // suggestion.
  if (!/\bon\s+storage\s*\.\s*objects\b/i.test(text)) return { kind: "skip" };

  // Quoted ("my policy", which may contain spaces) or bare (my_policy), after
  // either verb. `IF NOT EXISTS` is CREATE-only; ALTER has no such clause.
  const name =
    text.match(/(?:create|alter)\s+policy\s+"([^"]+)"/i)?.[1] ??
    text.match(/(?:create|alter)\s+policy\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_$]*)/i)?.[1];
  if (!name) return { kind: "unparseable" };

  // ABSENT MEANS `all`, per the SQL default — not "skip this statement". On an
  // ALTER the clause is absent ALWAYS (Postgres does not let ALTER POLICY change
  // the command), so every ALTER is read as the widest. Over-reporting, on
  // purpose: see the header.
  const command =
    text.match(/\bfor\s+(insert|update|delete|select|all)\b/i)?.[1]?.toLowerCase() ?? "all";

  const rolesRaw = text.match(/\bto\s+([a-z_,\s]+?)\s*(?:\busing\b|\bwith\s+check\b|$)/i)?.[1];
  const roles = rolesRaw
    ? rolesRaw
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter((r) => r !== "")
    : ["public"];

  return {
    kind: "policy",
    policy: {
      file,
      name,
      kind: statement.kind,
      command,
      roles,
      predicate: normalize(predicateGroups(text).join(" and ")),
    },
  };
}

/**
 * Every storage.objects policy the repo declares, plus the ones it could not
 * read.
 *
 * The second half is the point: an unreadable `create policy … on
 * storage.objects` is carried out of here instead of being dropped on the floor,
 * so `runCheck` can fail on it. See parsePolicy for the two legal forms that
 * used to be dropped silently.
 */
export function inventory(files: readonly string[]): {
  policies: StoragePolicy[];
  unparseable: UnparseablePolicy[];
  /**
   * Every policy statement SEEN, of either kind, before the storage.objects
   * filter. It exists so MIN_ALTER_STATEMENTS has something to count: the ALTER
   * branch contributes zero to every other number in this file today, so a dead
   * ALTER regex would be invisible to all of them.
   */
  statementCounts: Record<PolicyStatementKind, number>;
} {
  const policies: StoragePolicy[] = [];
  const unparseable: UnparseablePolicy[] = [];
  const statementCounts: Record<PolicyStatementKind, number> = { create: 0, alter: 0 };
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(file, "utf8"));
    const normalizedFile = file.replaceAll("\\", "/");
    for (const statement of policyStatements(sql)) {
      statementCounts[statement.kind]++;
      const result = parsePolicy(normalizedFile, statement);
      if (result.kind === "policy") policies.push(result.policy);
      else if (result.kind === "unparseable") {
        unparseable.push({ file: normalizedFile, statement: normalize(statement.text) });
      }
    }
  }
  return { policies, unparseable, statementCounts };
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
  /**
   * `create policy … on storage.objects` statements the parser could not read.
   * Offenders, not skips — a policy this fence cannot see is not a safe one.
   */
  unparseable: UnparseablePolicy[];
};

export function evaluate(
  policies: readonly StoragePolicy[],
  unparseable: readonly UnparseablePolicy[] = [],
): Verdict {
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
  return { writes, permissive, unfrozen, changed, missing, unparseable: [...unparseable] };
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
  const { policies, unparseable, statementCounts } = inventory(files);
  const verdict = evaluate(policies, unparseable);

  // Rule 7b — the ALTER path is alive. Checked first because it is the only
  // failure that leaves every other number in this file unchanged.
  if (statementCounts.alter < MIN_ALTER_STATEMENTS) {
    console.error(
      [
        "",
        `✗ check-storage-write-policies: saw only ${statementCounts.alter} \`alter policy\` statement(s) (floor ${MIN_ALTER_STATEMENTS}).`,
        `  Scanned ${files.length} file(s) matching ${SQL_GLOBS.join(", ")}.`,
        "  No `alter policy` targets storage.objects today, so this branch adds",
        "  nothing to any other count here — which means a regex that stopped",
        "  matching it would leave this fence printing the same green line while",
        "  a widening written as an ALTER walked straight through. See",
        "  MIN_ALTER_STATEMENTS.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

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

  // FIRST, because it is the failure that invalidates every other answer below:
  // if a statement could not be read, the inventory is incomplete and "no
  // offenders" means nothing.
  for (const { file, statement } of verdict.unparseable) {
    problems.push(
      [
        `  UNREADABLE storage.objects policy  (${file})`,
        `      ${statement.slice(0, 200)}${statement.length > 200 ? " …" : ""}`,
        "      This statement creates a policy on storage.objects and this fence could not",
        "      parse its name. It is reported as an offender rather than skipped: a policy",
        "      the tripwire cannot see is not a policy the tripwire has cleared. Until",
        "      2026-08-25 two LEGAL forms — an unquoted policy name, and an omitted FOR",
        "      clause (which Postgres reads as FOR ALL, the widest grant) — landed here and",
        "      were dropped silently, so the fence printed green over them.",
        "      Fix the statement, or teach parsePolicy the form it uses.",
      ].join("\n"),
    );
  }

  for (const policy of verdict.unfrozen) {
    problems.push(
      [
        `  NEW bucket-name-only write grant (${policy.kind} policy): "${policy.name}"  (${policy.file})`,
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
        `  FROZEN grant changed by an ${policy.kind.toUpperCase()} POLICY: "${policy.name}"  (${policy.file})`,
        `      pinned:  ${expected}`,
        `      found:   ${policy.predicate || "(none)"}`,
        "      These two grants are frozen exactly, not approximately. If this is the B24",
        "      fix, remove the entry from FROZEN_WRITE_GRANTS in the same commit; if it is",
        "      a widening, it is the thing this fence exists to stop.",
        "      An ALTER POLICY replaces the USING / WITH CHECK expression in place, which is",
        "      this repo's normal idiom (80 of them live in db/) and was invisible to this",
        "      scan until 2026-08-25.",
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
    `✓ storage write-policy tripwire — ${verdict.writes.length} caller-facing write policy/policies across ${files.length} SQL file(s) (${statementCounts.create} create + ${statementCounts.alter} alter policy statements read); ${verdict.permissive.length} bucket-name-only, all frozen and unchanged (${Object.keys(FROZEN_WRITE_GRANTS).join(", ")}).`,
  );
}

// Only run when invoked as a CLI; importing from tests must not exit.
const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-storage-write-policies.ts") ||
    process.argv[1].endsWith("check-storage-write-policies.js"));

if (isMain) runCheck();
