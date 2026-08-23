// Audit-action declaration fence — every action an app WRITES must be declared.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// __tests__/audit-log-action-check.test.ts already set-compares the DB CHECK
// `audit_log_action_valid` against the TypeScript catalog AUDIT_LOG_ACTIONS. It
// is a good test and it was green the entire time the bug below was live,
// because it compares TWO DECLARATIONS AGAINST EACH OTHER and never compares
// either one against the code that actually writes rows.
//
// The bug it could not see (found 2026-08-23): src/modules/caretakers/actions.ts
// wrote 'caretaker_designated', 'caretaker_grant_accepted' and
// 'caretaker_grant_revoked' from the day custodia-temporal shipped. None was in
// the catalog, so none was in the CHECK. Both sides agreed perfectly — 105
// versus 105, zero difference — about a set that omitted all three. Every insert
// violated the constraint with a 23514, and the module's own `flushAuditLog`
// swallowed it behind a console.error reading "(action did succeed)". The whole
// feature produced ZERO audit rows and nothing anywhere went red.
//
// The escape hatch is the `as typeof auditLog.$inferInsert` cast. `action` is
// typed `AuditLogAction`, so a plain `db.insert(auditLog).values({...})` is
// checked by tsc; the cast erases that check and lets a module mint an action
// nobody declared. The parity test's own header names this exact hazard and
// cites the transfers module's cast as the example — and the caretakers module
// performs the identical cast, and did exactly the thing the header warned about.
//
// WHAT THIS CHECKS
// Derive, FROM SOURCE, every audit action literal the application writes, and
// require each to be present in AUDIT_LOG_ACTIONS. Both sides are read as text,
// so this fence needs no database and no import of the DB client: it fails in
// CI on a clean checkout, before anything is applied anywhere.
//
// IT FENCES THE SUBJECT, NOT THE TWO KNOWN FILES
// ---------------------------------------------------------------------------
// This repo has a documented lesson (memory: "fence enumerates forms, not the
// thing") that a fence which lists the spellings it knows about misses the next
// instance. Naming caretakers/actions.ts and transfers/actions.ts here would
// re-create precisely the hole it is meant to close: the THIRD module to grow a
// local audit helper would be invisible again.
//
// So the subject is "an audit_log write", discovered three ways, in this order:
//
//   1. DIRECT      — `.insert(auditLog)` … `.values({ action: … })`, the drizzle
//                    write itself, wherever it appears.
//   2. HELPER      — `writeAuditLog(…)` / `buildAuditLogValues(…)`, the shared
//                    lib/infra/audit-log.ts surface.
//   3. LOCAL WRAPPER — and this is the one that matters. ANY function in ANY
//                    scanned file whose own body reaches (1) or (2) is itself
//                    registered as an audit writer, and its call sites are
//                    scanned like the real thing. `flushAuditLog` is not
//                    special-cased or spelled out anywhere below; it is found
//                    because it wraps `db.insert(auditLog)`. A new module that
//                    writes `async function recordAudit(…)` around the same
//                    insert is caught on the day it is written, with no edit here.
//
// NON-VACUITY (mandatory, per the same lesson)
// A fence that scans nothing and reports success is worse than no fence. Four
// floors must all hold or the run FAILS:
//   · the catalog parsed out of db/schema.ts is large (>= 100 actions),
//   · at least MIN_FILES distinct files were found to write audit rows,
//   · at least MIN_SITES write sites were found,
//   · at least MIN_ACTIONS distinct action literals were resolved.
// If a refactor renames the drizzle table symbol or moves the helper, these trip
// instead of the fence silently passing over a corpus it can no longer see.
//
// KNOWN LIMITS — stated, not hidden:
//   · REGEX/SCANNER, NOT AST — same tradeoff as every sibling linter here.
//     Comments are stripped first so a mention in prose cannot register.
//   · ONE FILE AT A TIME. A wrapper EXPORTED from module A and called in
//     module B is registered only where it is declared. That is a missed
//     offender, never a false positive, and the direct/helper markers still
//     cover the common case.
//   · DYNAMIC ACTIONS. `action: someVariable` cannot be resolved to a literal.
//     A ternary between two literals IS resolved (to both), and so is a
//     single-hop local `const x = "literal"`. What remains — a `string` typed
//     parameter forwarded by a relay helper — is counted, printed on every run,
//     and frozen at EXPECTED_DYNAMIC, enforced as an equality so the number
//     cannot drift upward OR go stale. See the ratchet block in `main()`.
//
// Run: pnpm tsx scripts/check-audit-log-actions-declared.ts
//      (or: pnpm lint:audit-actions)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { stripComments } from "./lib/strip-comments.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/** Trees that can contain application code writing audit rows. */
const SCAN_ROOTS = ["app", "lib", "src", "scripts", "db"];

/** Directory names never worth walking into. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "__tests__",
  "__mocks__",
  // Forward-only SQL, not TypeScript. The migrations carry the CHECK, and the
  // parity TEST is what compares the CHECK to the catalog — not this fence.
  "migrations",
]);

/** Non-vacuity floors. Raise them if the corpus grows; never lower to pass. */
const MIN_CATALOG = 100;
const MIN_FILES = 10;
const MIN_SITES = 20;
const MIN_ACTIONS = 20;

/**
 * Audit writes whose action is not statically resolvable. Frozen at the two
 * relay helpers that existed when this fence was written:
 *   · lib/infra/eno-queue-processor.ts — replays `row.action` off a queue row
 *   · src/modules/surveillance/infrastructure/surveillance-repository.ts —
 *     `insertOutbreakAuditLog(values)` forwards its caller's string
 * Enforced as an EQUALITY, not a ceiling: see the ratchet block in `main()`.
 */
const EXPECTED_DYNAMIC = 2;

// ---------------------------------------------------------------------------
// Balanced scanning — string- and template-aware, so a brace or paren inside a
// string literal cannot desynchronise the depth counter.
// ---------------------------------------------------------------------------

type Delims = { open: string; close: string };

/**
 * Index of the delimiter matching the one at `start`, or -1.
 * `text` must already have had comments stripped.
 */
function matchDelimiter(text: string, start: number, { open, close }: Delims): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const PARENS: Delims = { open: "(", close: ")" };
const BRACES: Delims = { open: "{", close: "}" };

/** 1-based line number of a character offset. */
function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

/**
 * Every `action:` value written at the TOP LEVEL of an object literal inside
 * `args` — the argument text of one audit-write call.
 *
 * Depth matters: `flushAuditLog({ action: "x", payload: { action: "y" } })`
 * writes "x". "y" is a payload field that happens to share the name and is not
 * an audit action at all. Only brace depth 1 counts.
 */
function topLevelActionValues(args: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    // A key named `action`, quoted or bare, followed by a colon.
    const rest = args.slice(i);
    const m = /^(?:action|"action"|'action')\s*:\s*/.exec(rest);
    if (!m) continue;
    // Guard against matching the tail of a longer identifier (`sub_action:`).
    const prev = args[i - 1];
    if (prev && /[A-Za-z0-9_$]/.test(prev)) continue;
    found.push(rest.slice(m[0].length));
    i += m[0].length - 1;
  }
  return found;
}

/** The literal at the head of `expr`, or null. */
function headLiteral(expr: string): string | null {
  const m = /^\s*(["'])((?:[^\\]|\\.)*?)\1/.exec(expr);
  if (m) return m[2].replace(/\\(.)/g, "$1");
  // A backtick with no interpolation is still a literal.
  const t = /^\s*`([^`$\\]*)`/.exec(expr);
  return t ? t[1] : null;
}

/**
 * Every literal an `action:` value expression can evaluate to, or null when it
 * is not statically resolvable.
 *
 * A ternary between two literals is resolved to BOTH branches, not treated as
 * dynamic: `role === "admin" ? "institutional_admin_created" :
 * "institutional_govt_created"` writes one of exactly two known actions and
 * both must be declared. Collapsing that to "unresolvable" would have hidden a
 * genuine pair behind an escape hatch.
 */
function literalsOf(valueExpr: string): string[] | null {
  const direct = headLiteral(valueExpr);
  if (direct !== null) return [direct];

  const question = valueExpr.indexOf("?");
  if (question !== -1) {
    const rest = valueExpr.slice(question + 1);
    const consequent = headLiteral(rest);
    if (consequent !== null) {
      const colon = rest.indexOf(":", rest.indexOf(consequent) + consequent.length);
      const alternate = colon === -1 ? null : headLiteral(rest.slice(colon + 1));
      if (alternate !== null) return [consequent, alternate];
    }
  }
  return null;
}

/** Resolve a bare identifier against a `const x = "literal"` in the same file. */
function resolveLocalConst(source: string, valueExpr: string): string | null {
  const id = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|\}|$)/.exec(valueExpr);
  if (!id) return null;
  const decl = new RegExp(`\\bconst\\s+${id[1]}\\s*(?::[^=]+)?=\\s*(["'])((?:[^\\\\]|\\\\.)*?)\\1`);
  const m = decl.exec(source);
  return m ? m[2].replace(/\\(.)/g, "$1") : null;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function listSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
      if (/\.d\.ts$/.test(entry)) continue;
      out.push(full);
    }
  };
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root));
  return out;
}

/** The declared catalog, parsed out of db/schema.ts as TEXT (no DB import). */
function parseDeclaredActions(): Set<string> {
  const schemaPath = join(REPO_ROOT, "db", "schema.ts");
  const src = stripComments(readFileSync(schemaPath, "utf8")) as string;
  const start = src.indexOf("AUDIT_LOG_ACTIONS");
  if (start === -1) {
    throw new Error("AUDIT_LOG_ACTIONS not found in db/schema.ts — this fence cannot see its side");
  }
  const openBracket = src.indexOf("[", start);
  const close = matchDelimiter(src, openBracket, { open: "[", close: "]" });
  if (openBracket === -1 || close === -1) {
    throw new Error("AUDIT_LOG_ACTIONS array literal is unparseable in db/schema.ts");
  }
  const body = src.slice(openBracket, close);
  return new Set([...body.matchAll(/(["'])((?:[^\\]|\\.)*?)\1/g)].map((m) => m[2]));
}

/**
 * Names of functions declared in `source` whose own body reaches an audit write.
 * This is what generalises the fence past the writers that exist today.
 */
type Wrappers = {
  /** Names whose body reaches an audit write. */
  names: string[];
  /**
   * Offsets of the `(` that opens each wrapper's own PARAMETER LIST. A
   * declaration looks exactly like a call from a regex's point of view, and a
   * parameter list annotated `{ action: string }` reads as an object literal
   * writing an unresolvable action. Excluding by exact offset is precise where
   * "is the preceding token `function`?" is not — it also covers class methods
   * and object properties, whose declarations carry no such keyword.
   */
  declarationParens: Set<number>;
};

function localAuditWrappers(source: string): Wrappers {
  const names: string[] = [];
  const declarationParens = new Set<number>();
  // Four declaration shapes, because a helper is a helper however it is spelled:
  //   function f(…) {}            — plain declaration
  //   const f = (…) => {}         — arrow bound to a const
  //   f: (…) => {} / f: async …   — object-literal property (a deps bag)
  //   async f(…) {}               — class or object method
  //
  // Each alternative ends at the name; the parameter list and body are found by
  // WALKING, never by `indexOf("{")`. That shortcut is what the first version of
  // this fence did, and it was silently wrong: `flushAuditLog(entry: { … })`
  // annotates its parameter with an inline object type, so the first `{` after
  // the name opens the TYPE, not the body. The scan read the type literal, found
  // no `.insert(auditLog)` in it, and never registered the single most important
  // wrapper in the repo — the fence reported a clean pass over the exact bug it
  // was written for. Caught by deleting a declared action and watching it stay
  // green; the lesson is that a fence must be tested by being made to fail.
  const decl =
    /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)|(?:^|\s)(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?=\()|(?:^|[\s{,])([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?:async\s*)?(?=\()|(?:^|[\s{;])(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=\()/g;
  // Control-flow keywords wear the shape `name(…) {…}` without being functions.
  const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "function", "with"]);

  for (const m of source.matchAll(decl)) {
    const name = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!name || KEYWORDS.has(name)) continue;

    // Parameter list: the first `(` after the declaration, walked to its match.
    const openParen = source.indexOf("(", (m.index ?? 0) + m[0].length - 1);
    if (openParen === -1) continue;
    const closeParen = matchDelimiter(source, openParen, PARENS);
    if (closeParen === -1) continue;

    // Body: the first `{` after the parameter list. A return-type annotation
    // (`: Promise<void>`) carries no braces, so this lands on the body.
    const braceAt = source.indexOf("{", closeParen);
    if (braceAt === -1) continue;
    // Anything other than `=>`, `:` and whitespace between them means this was
    // a CALL that happens to be followed by an unrelated block, not a body.
    const between = source.slice(closeParen + 1, braceAt);
    if (!/^[\s:=>a-zA-Z0-9_$<>,.[\]|&?]*$/.test(between)) continue;

    const end = matchDelimiter(source, braceAt, BRACES);
    if (end === -1) continue;
    const body = source.slice(braceAt, end);
    if (
      /\.insert\(\s*auditLog\s*\)/.test(body) ||
      /\bwriteAuditLog\s*\(/.test(body) ||
      /\bbuildAuditLogValues\s*\(/.test(body)
    ) {
      names.push(name);
      declarationParens.add(openParen);
    }
  }
  return { names: [...new Set(names)], declarationParens };
}

type Site = { file: string; line: number; args: string };

/** Every audit-write call site in one file, by all three discovery routes. */
function auditWriteSites(file: string, source: string): Site[] {
  const sites: Site[] = [];
  const push = (openParen: number): void => {
    const close = matchDelimiter(source, openParen, PARENS);
    if (close === -1) return;
    sites.push({
      file,
      line: lineOf(source, openParen),
      args: source.slice(openParen + 1, close),
    });
  };

  // 1. DIRECT — the drizzle write. Take the `.values(` that follows the insert.
  for (const m of source.matchAll(/\.insert\(\s*auditLog\s*\)/g)) {
    const after = (m.index ?? 0) + m[0].length;
    const values = source.indexOf(".values(", after);
    // Only when it is the same chain — no statement boundary in between.
    if (values !== -1 && !source.slice(after, values).includes(";")) {
      push(values + ".values".length);
    }
  }

  // 2. HELPER + 3. LOCAL WRAPPER, in one pass over the resolved name set.
  const { names, declarationParens } = localAuditWrappers(source);
  const callable = new Set(["writeAuditLog", "buildAuditLogValues", ...names]);
  for (const name of callable) {
    const call = new RegExp(`\\b${name}\\s*\\(`, "g");
    for (const m of source.matchAll(call)) {
      const openParen = (m.index ?? 0) + m[0].length - 1;
      // A wrapper's own parameter list is not an argument list.
      if (declarationParens.has(openParen)) continue;
      push(openParen);
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type Scan = {
  undeclared: Array<{ file: string; line: number; action: string }>;
  unresolved: Array<{ file: string; line: number; expr: string }>;
  writerFiles: Set<string>;
  seenActions: Set<string>;
  siteCount: number;
};

/** Classify every action literal written by one file. */
function scanFile(rel: string, source: string, declared: Set<string>, scan: Scan): void {
  const sites = auditWriteSites(rel, source);
  if (sites.length === 0) return;
  scan.writerFiles.add(rel);

  for (const site of sites) {
    const values = topLevelActionValues(site.args);
    if (values.length === 0) continue;
    scan.siteCount++;
    for (const expr of values) {
      const fromConst = resolveLocalConst(source, expr);
      const literals = literalsOf(expr) ?? (fromConst === null ? null : [fromConst]);
      if (literals === null) {
        scan.unresolved.push({ file: rel, line: site.line, expr: expr.slice(0, 60).trim() });
        continue;
      }
      for (const literal of literals) {
        scan.seenActions.add(literal);
        if (!declared.has(literal)) {
          scan.undeclared.push({ file: rel, line: site.line, action: literal });
        }
      }
    }
  }
}

/** Walk the corpus, keeping only files that mention an audit-write marker. */
function scanCorpus(declared: Set<string>): Scan {
  const scan: Scan = {
    undeclared: [],
    unresolved: [],
    writerFiles: new Set(),
    seenActions: new Set(),
    siteCount: 0,
  };
  for (const full of listSourceFiles()) {
    const raw = readFileSync(full, "utf8");
    if (
      !raw.includes("auditLog") &&
      !raw.includes("writeAuditLog") &&
      !raw.includes("buildAuditLogValues")
    ) {
      continue;
    }
    const rel = relative(REPO_ROOT, full).split(sep).join("/");
    // This fence's own source names every marker it looks for; scanning it would
    // report its own regexes as write sites. Excluded by IDENTITY, not by a
    // pattern that could ever exclude a real writer.
    if (rel === "scripts/check-audit-log-actions-declared.ts") continue;
    scanFile(rel, stripComments(raw) as string, declared, scan);
  }
  return scan;
}

/** The four floors that stop a blind fence from reporting success. */
function nonVacuityProblems(declared: Set<string>, scan: Scan): string[] {
  const problems: string[] = [];
  if (declared.size < MIN_CATALOG) {
    problems.push(
      `NON-VACUITY: parsed only ${declared.size} actions out of AUDIT_LOG_ACTIONS ` +
        `(floor ${MIN_CATALOG}). The catalog parser has lost sight of db/schema.ts.`,
    );
  }
  if (scan.writerFiles.size < MIN_FILES) {
    problems.push(
      `NON-VACUITY: found audit writes in only ${scan.writerFiles.size} file(s) ` +
        `(floor ${MIN_FILES}). Discovery is broken — this fence is scanning almost nothing.`,
    );
  }
  if (scan.siteCount < MIN_SITES) {
    problems.push(
      `NON-VACUITY: found only ${scan.siteCount} audit write site(s) (floor ${MIN_SITES}).`,
    );
  }
  if (scan.seenActions.size < MIN_ACTIONS) {
    problems.push(
      `NON-VACUITY: resolved only ${scan.seenActions.size} distinct action(s) ` +
        `(floor ${MIN_ACTIONS}).`,
    );
  }
  return problems;
}

function main(): void {
  const declared = parseDeclaredActions();
  const scan = scanCorpus(declared);
  const { undeclared, unresolved, writerFiles, seenActions, siteCount } = scan;

  const problems: string[] = nonVacuityProblems(declared, scan);

  // --- The rule itself -----------------------------------------------------
  for (const u of undeclared) {
    problems.push(
      [
        `${u.file}:${u.line} writes audit action '${u.action}', which is NOT in AUDIT_LOG_ACTIONS.`,
        "    The DB CHECK audit_log_action_valid will reject the insert with a 23514 — and if",
        "    the writer swallows errors, silently. Add it to db/schema.ts AND to a forward-only",
        "    migration amending the CHECK.",
      ].join("\n"),
    );
  }
  // --- The dynamic residue, ratcheted in BOTH directions -------------------
  // Two relay helpers forward an `action` that arrives as a plain `string`
  // parameter and cast it at the insert. Nothing static can say what they
  // write, and both are legitimate: a queue processor replaying a stored row,
  // and a repository method its own module calls with validated literals.
  //
  // They are still the caretakers bug in miniature — a `string`-typed parameter
  // erases the union check exactly like `as typeof auditLog.$inferInsert` did —
  // so they are counted, printed on every run, and frozen. A THIRD one fails
  // the build; removing one and not lowering the number also fails it, because
  // a ratchet that only moves one way is how a baseline goes stale (the lesson
  // scripts/check-audit-log-coverage.ts records about its own baseline).
  if (unresolved.length !== EXPECTED_DYNAMIC) {
    problems.push(
      [
        `DYNAMIC-ACTION RATCHET: ${unresolved.length} non-literal audit action(s), expected exactly ${EXPECTED_DYNAMIC}.`,
        unresolved.length > EXPECTED_DYNAMIC
          ? "    A new one appeared — give it a string literal, or a ternary of literals, so this fence can check it."
          : "    One was removed — lower EXPECTED_DYNAMIC in this file to lock the gain in.",
        ...unresolved.map((u) => `    · ${u.file}:${u.line} — ${u.expr}`),
      ].join("\n"),
    );
  }

  const tally = [
    `Scanned ${writerFiles.size} writer file(s), ${siteCount} write site(s),`,
    `${seenActions.size} distinct action(s) against ${declared.size} declared.`,
  ].join(" ");

  if (problems.length > 0) {
    console.error("\naudit-action declaration fence — FAILED\n");
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`\n${tally}\n`);
    process.exit(1);
  }

  console.log(`audit-action declaration fence: ok — ${tally} All declared.`);
}

main();
