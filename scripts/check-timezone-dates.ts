// Lint guard for timezone-safe date formatting.
//
// Closes the F2 bug class (comprobantes review 2026-07-10): a bare
// `toLocaleDateString`/`toLocaleString`/`new Intl.DateTimeFormat` with NO
// `timeZone` option renders on the server in UTC, so a late-evening ART
// timestamp (UTC-3) displays as the NEXT calendar day. All product date
// formatting MUST pin `America/Argentina/Buenos_Aires` — in practice by going
// through the canonical helpers in lib/utils/format.ts (formatDate,
// formatDateTime, …), which already set `timeZone: AR_TIME_ZONE`.
//
// This guard FAILS on any of these calls that lacks a `timeZone` option,
// OUTSIDE the canonical formatter module (CANONICAL_MODULE below).
//
// RATCHET baseline (scripts/timezone-dates-baseline.json):
//   - Existing bare calls in baselined files are grandfathered (pass today).
//   - Any NEW bare call (new file, or a count above the file's baseline) FAILS.
//   - To clear debt: route the call through lib/utils/format.ts (or add an
//     explicit `timeZone`), then lower the baseline (node/tsx --write below).
//
// Note on `toLocaleString`: it is also used for NUMBER formatting (thousands
// separators), which legitimately has no `timeZone`. Those calls are captured
// in the baseline; the guard's job is only to prevent NEW bare calls, at which
// point the author routes dates through format.ts and numbers keep their
// baseline slot (or use `Intl.NumberFormat`).
//
// Run:    pnpm tsx scripts/check-timezone-dates.ts
// Or:     pnpm lint:timezone
// Rewrite baseline: pnpm tsx scripts/check-timezone-dates.ts --write

import { globSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// ---------------------------------------------------------------------------
// File set
// ---------------------------------------------------------------------------

// The canonical formatter module — the ONE place raw Intl date APIs are allowed
// (it pins timeZone: AR_TIME_ZONE for everyone else). Excluded from the scan.
const CANONICAL_MODULE = "lib/utils/format.ts";

const EXCLUDE = [
  "node_modules/",
  CANONICAL_MODULE,
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  "/__tests__/",
  "/e2e/",
];

const FILES = globSync("{app,components,lib,src}/**/*.{ts,tsx}").filter((f) => {
  const p = f.replaceAll("\\", "/");
  return !EXCLUDE.some((frag) => p.includes(frag) || p.endsWith(frag));
});

// ---------------------------------------------------------------------------
// Detection
//
// Each regex captures the full call up to its first closing paren. Date
// formatting option objects never contain parens, so `[^)]*` reliably spans a
// multi-line options object. A match is a VIOLATION when its text does not
// mention `timeZone`.
// ---------------------------------------------------------------------------

const CALL_PATTERNS: RegExp[] = [
  /\.toLocaleDateString\s*\([^)]*\)/gs,
  /\.toLocaleString\s*\([^)]*\)/gs,
  /\bnew\s+Intl\.DateTimeFormat\s*\([^)]*\)/gs,
];

type Violation = { line: number; col: number; text: string };

function findViolations(src: string): Violation[] {
  const out: Violation[] = [];
  for (const re of CALL_PATTERNS) {
    for (const m of src.matchAll(re)) {
      if (m[0].includes("timeZone")) continue;
      const idx = m.index ?? 0;
      const before = src.slice(0, idx);
      const line = before.split(/\r?\n/).length;
      const col = idx - before.lastIndexOf("\n");
      // Collapse to a single line for readable reporting.
      out.push({ line, col, text: m[0].replace(/\s+/g, " ").slice(0, 80) });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

type BaselineFile = {
  _meta: { totalViolations: number; description: string };
  files: Record<string, number>;
};

const BASELINE_PATH = "scripts/timezone-dates-baseline.json";

function loadBaseline(): Record<string, number> {
  try {
    const req = createRequire(import.meta.url);
    const data = req("./timezone-dates-baseline.json") as BaselineFile;
    return data.files;
  } catch {
    console.warn(
      `[warn] ${BASELINE_PATH} not found — all bare date calls will fail (no grandfather). Run: pnpm tsx scripts/check-timezone-dates.ts --write`,
    );
    return {};
  }
}

function writeBaseline(): void {
  const files: Record<string, number> = {};
  let total = 0;
  for (const file of FILES) {
    const rel = file.replaceAll("\\", "/");
    const count = findViolations(readFileSync(file, "utf8")).length;
    if (count > 0) {
      files[rel] = count;
      total += count;
    }
  }
  const output: BaselineFile = {
    _meta: {
      totalViolations: total,
      description: `Baseline of bare toLocaleDateString/toLocaleString/Intl.DateTimeFormat calls without a timeZone option. Files listed here are grandfathered. New bare calls (new files or counts above these) fail lint:timezone. Canonical module excluded: ${CANONICAL_MODULE}.`,
    },
    files,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `Baseline written: ${total} grandfathered bare date call(s) across ${Object.keys(files).length} files.`,
  );
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

function runChecks(): void {
  const baseline = loadBaseline();
  let hits = 0;
  let grandfathered = 0;

  for (const file of FILES) {
    const rel = file.replaceAll("\\", "/");
    const violations = findViolations(readFileSync(file, "utf8"));
    const allowed = baseline[rel] ?? 0;
    grandfathered += Math.min(violations.length, allowed);

    if (violations.length > allowed) {
      // Report the calls above the grandfathered count (the newest wins-ish;
      // we surface every site so the author can see all candidates to fix).
      for (const v of violations) {
        console.error(
          `${file}:${v.line}:${v.col}: bare date call without timeZone — "${v.text}". Route through lib/utils/format.ts (formatDate/formatDateTime) or pass { timeZone: AR_TIME_ZONE }.`,
        );
      }
      console.error(
        `${file}: ratchet — ${violations.length} bare date call(s) (baseline allows ${allowed}).`,
      );
      hits += 1;
    }
  }

  if (hits > 0) {
    console.error(
      `\n✗ ${hits} file(s) exceed the timezone-date baseline. Fix the new call(s) above, or (only to intentionally grandfather) run: pnpm tsx scripts/check-timezone-dates.ts --write`,
    );
    process.exit(1);
  }

  console.log(
    `✓ Timezone-safe dates — no new bare toLocale*/Intl.DateTimeFormat calls across ${FILES.length} files.`,
  );
  console.log(
    `  Ratchet: ${grandfathered} grandfathered bare call(s) across ${Object.keys(baseline).length} files. New ones will fail.`,
  );
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-timezone-dates.ts") ||
    process.argv[1].endsWith("check-timezone-dates.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  if (process.argv.includes("--write")) {
    writeBaseline();
  } else {
    runChecks();
  }
}
