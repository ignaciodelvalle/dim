// Scope-discipline linter for lib/analytics/dashboards/** (task #57).
//
// Motivation: lib/analytics/dashboards/_scope.ts exists so every govt-facing
// dashboard fetcher enforces jurisdiction scope through ONE reviewed set of
// helpers (petsScopeClause, casesScopeClause, custodyDisputesScopeClause,
// petsCurrentJurisdictionClause). The 2026-07-04 scope-security review (Part
// A1/A2, see _scope.ts header) found and fixed a payload-vs-current-
// jurisdiction drift bug precisely because a fetcher had hand-rolled its own
// predicate instead of going through the shared helper. This linter makes
// that class of drift visible going forward: a raw `jurisdictionProvince` /
// `jurisdictionLocality` predicate — or a direct call to the lower-level
// `jurisdictionPairClause` — anywhere in a sibling dashboards/*.ts module is
// flagged, so new hand-rolled scope logic can't land silently. It does NOT
// forbid the pattern outright (existing occurrences are grandfathered in the
// baseline below); it forbids NEW, unreviewed occurrences.
//
// Scope: ONLY lib/analytics/dashboards/*.ts, excluding _scope.ts itself (the
// one sanctioned home for these predicates). This is a narrow, single-domain
// fence — it does NOT scan lib/infra/case-queries.ts, outbox-query.ts,
// audit-history-query.ts, omnibox-search.ts, or gob-pet-subview.ts. Those are
// a DIFFERENT domain (operator list-queries) that legitimately hand-rolls
// jurisdiction scoping via jurisdictionPairClause/jurisdictionScopeContains
// today, and are explicitly out of scope for this fence.
//
// -----------------------------------------------------------------------
// Extraction rules (regex-based, line-oriented — matches the sibling linters:
// check-authz-guards.ts, check-event-payload-parity.ts. Not a full AST
// analyzer; every current match in this repo was audited before landing).
// Comments are stripped first (line breaks preserved) so a prose mention of
// "jurisdictionProvince" in a doc comment never registers as an offense.
//
//   1. DIRECT CALL — any `jurisdictionPairClause(` call site. This helper is
//      deliberately low-level (parameterized by raw SQL operands); it should
//      only ever be invoked FROM a _scope.ts-exported wrapper, never from a
//      sibling module directly.
//
//   2. RAW eq() PREDICATE — `eq(...)` calls whose argument list references
//      `IDENT.jurisdictionProvince` or `IDENT.jurisdictionLocality` (in
//      either position — e.g. `eq(pets.jurisdictionProvince, x)` or
//      `eq(a, b.jurisdictionProvince)`). This is the hand-rolled equivalent
//      of what petsScopeClause/casesScopeClause already build.
//
//   3. RAW TEMPLATE PREDICATE — a `${IDENT.jurisdictionProvince}` /
//      `${IDENT.jurisdictionLocality}` interpolation inside a template
//      literal (the `sql\`${pets.jurisdictionProvince} = ${x}\`` shape used
//      throughout the admin-province-drilldown branches).
//
// Deliberately NOT flagged (false-positive classes audited out):
//   - SELECT-projection column refs, e.g. `.select({ jurisdictionProvince:
//     pets.jurisdictionProvince })` — naming/returning a column is not a
//     scope predicate.
//   - `.groupBy(cases.jurisdictionProvince)` — grouping does not restrict
//     which rows are visible; only WHERE-clause predicates do.
//   - Reading an already-fetched row's field back out, e.g.
//     `jurisdictionProvince: r.jurisdictionProvince ?? null` when building a
//     return object — passing an already-scoped value around, not a new
//     predicate.
//   - `import { jurisdictionPairClause } from "@/lib/metrics"` — an import
//     has no trailing `(`, so it never matches rule 1.
//   - Type declarations (`jurisdictionProvince: string | null;`) — these are
//     plain object-type members, never a `IDENT.jurisdictionProvince` member
//     expression, so no rule matches them.
//   - The outbreak_signal JSONB payload's snake_case
//     `pet_jurisdiction_province` / `pet_jurisdiction_locality` keys (an
//     event-time SNAPSHOT, a different concept from the live
//     pets/cases/welfareReports/custodyDisputes table columns this fence
//     guards) — the rules match the camelCase identifiers
//     `jurisdictionProvince`/`jurisdictionLocality` only, which never
//     collide with the snake_case payload keys.
//
// KNOWN LIMITATION: this is a per-line heuristic — it assumes `eq(...)` calls
// and `${...}` predicate interpolations referencing these columns are
// single-line in this codebase (true for every current occurrence). A
// hand-rolled predicate split across multiple lines would not be caught by
// rules 2/3 (though a `jurisdictionPairClause(` call itself is still caught
// by rule 1 regardless of how its arguments wrap).
//
// Run: pnpm tsx scripts/check-scope-discipline.ts   (or: pnpm lint:scope)
// Exits 0 clean; exits 1 listing each offending line, unless baselined.

import { globSync, readFileSync } from "node:fs";

export const SCOPE_FILE = "lib/analytics/dashboards/_scope.ts";
export const BASELINE_FILE = "scripts/scope-discipline-baseline.json";

// ---------------------------------------------------------------------------
// Shared: comment stripping (preserves newlines so line numbers stay valid).
// Mirrors check-event-payload-parity.ts's stripComments — a generic utility,
// not domain logic, so it is safe to duplicate rather than cross-import
// between independent lint scripts.
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: character-by-character string/template/comment state machine — mirrors the identical stripComments in scripts/check-event-payload-parity.ts (exempted there via a biome.json per-file override; duplicating that override entry is out of scope for this additive-only change).
export function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      out += " ".repeat(j - i);
      i = j - 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j = Math.min(j + 2, src.length);
      out += src
        .slice(i, j)
        .split("")
        .map((c) => (c === "\n" ? "\n" : " "))
        .join("");
      i = j - 1;
      continue;
    }
    // Skip string/template literal contents so a quote inside a comment-like
    // string can't desync the scan (defensive; not expected to matter here).
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, src.length);
      out += src.slice(i, j);
      i = j - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Offense extraction — see header comment for the exact rules.
// ---------------------------------------------------------------------------

export type OffenseRule = "direct-pair-clause-call" | "raw-eq-predicate" | "raw-template-predicate";

export type Offense = {
  file: string;
  line: number;
  rule: OffenseRule;
  snippet: string;
};

const PAIR_CLAUSE_CALL_RE = /\bjurisdictionPairClause\s*\(/;
const EQ_JURISDICTION_RE = /\beq\([^;]*?\b\w+\.(?:jurisdictionProvince|jurisdictionLocality)\b/;
const TEMPLATE_JURISDICTION_RE = /\$\{\s*\w+\.(?:jurisdictionProvince|jurisdictionLocality)\s*\}/;

export function describeRule(rule: OffenseRule): string {
  switch (rule) {
    case "direct-pair-clause-call":
      return "direct call to jurisdictionPairClause() outside _scope.ts";
    case "raw-eq-predicate":
      return "raw eq() predicate on a jurisdictionProvince/jurisdictionLocality column";
    case "raw-template-predicate":
      return "raw sql-template predicate interpolating a jurisdictionProvince/jurisdictionLocality column";
  }
}

// Scans one already-comment-stripped file and returns every offending line.
// At most ONE offense per line (rules checked in priority order) — a line
// can only physically match one of these shapes in this codebase today.
export function extractOffenses(relPath: string, rawSrc: string): Offense[] {
  const src = stripComments(rawSrc);
  const lines = src.split("\n");
  const offenses: Offense[] = [];

  lines.forEach((lineText, idx) => {
    const line = idx + 1;
    if (PAIR_CLAUSE_CALL_RE.test(lineText)) {
      offenses.push({
        file: relPath,
        line,
        rule: "direct-pair-clause-call",
        snippet: lineText.trim(),
      });
      return;
    }
    if (EQ_JURISDICTION_RE.test(lineText)) {
      offenses.push({ file: relPath, line, rule: "raw-eq-predicate", snippet: lineText.trim() });
      return;
    }
    if (TEMPLATE_JURISDICTION_RE.test(lineText)) {
      offenses.push({
        file: relPath,
        line,
        rule: "raw-template-predicate",
        snippet: lineText.trim(),
      });
    }
  });

  return offenses;
}

export function listScannedFiles(): string[] {
  const files = globSync("lib/analytics/dashboards/*.ts");
  return [...new Set(files.map((f) => f.replaceAll("\\", "/")))]
    .filter((f) => f !== SCOPE_FILE)
    .filter((f) => !f.includes(".test."))
    .sort();
}

// ---------------------------------------------------------------------------
// Baseline — justified pre-existing exceptions. `"relPath:line": "reason"`.
// Every entry must carry a reason a reviewer can audit. New drift (not in the
// baseline) hard-fails; a baseline entry that no longer matches any offense
// (the code moved on) also hard-fails, so the baseline can't silently rot.
// ---------------------------------------------------------------------------

export function loadBaseline(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function runScan(): void {
  const baseline = loadBaseline();
  const files = listScannedFiles();

  if (files.length === 0) {
    console.error(
      "✗ check-scope-discipline: found no files to scan under lib/analytics/dashboards/*.ts.",
    );
    process.exit(1);
  }

  const offenders: string[] = [];
  const usedBaselineEntries = new Set<string>();
  let totalOffenses = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const offenses = extractOffenses(file, src);
    totalOffenses += offenses.length;
    for (const offense of offenses) {
      const key = `${offense.file}:${offense.line}`;
      if (baseline[key] !== undefined) {
        usedBaselineEntries.add(key);
        continue;
      }
      offenders.push(
        `${key} — ${describeRule(offense.rule)}: \`${offense.snippet}\`. Raw jurisdiction predicates outside ${SCOPE_FILE} have caused scope-security drift before (2026-07-04 payload-vs-current-jurisdiction review). Route this through an existing (or new) _scope.ts-exported helper, or if it is genuinely justified, add "${key}": "<reason>" to ${BASELINE_FILE}.`,
      );
    }
  }

  const staleBaselineEntries = Object.keys(baseline).filter((k) => !usedBaselineEntries.has(k));

  if (offenders.length > 0) {
    console.error(offenders.join("\n"));
    console.error(
      `\n✗ ${offenders.length} raw jurisdiction predicate(s) outside ${SCOPE_FILE} (${files.length} files scanned, ${totalOffenses} occurrences found, ${usedBaselineEntries.size} baselined).`,
    );
    process.exit(1);
  }

  if (staleBaselineEntries.length > 0) {
    console.error(
      `✗ ${staleBaselineEntries.length} stale baseline entr${staleBaselineEntries.length === 1 ? "y" : "ies"} in ${BASELINE_FILE} no longer match any offense: ${staleBaselineEntries.join(", ")}. Remove them — a baseline only exists for occurrences that need it.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ scope discipline clean — ${files.length} files scanned, ${totalOffenses} raw jurisdiction references checked${
      usedBaselineEntries.size > 0 ? ` (${usedBaselineEntries.size} baselined)` : ""
    }.`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-scope-discipline.ts") ||
    process.argv[1].endsWith("check-scope-discipline.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
