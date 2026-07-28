// Brand-casing lint fence — miMAR recase (PO decision 2026-07-18: canonical
// brand casing is "miMAR", lowercase m, capital M-A-R, matching the landing
// page). Companion sweep: recased ~194 wrong-cased "MiMAR" literals to
// "miMAR" across app/**, components/**, and lib/ui/branding.ts. This fence
// makes it stick — the codebase must never again accumulate wrong-cased
// brand literals in user-visible surfaces.
//
// Ratchet shape mirrors check-professionalism.ts Rule 2 (symbol-as-icon):
// baseline scripts/brand-casing-baseline.json grandfathers a per-file count
// of PRE-EXISTING wrong-cased hits. Any NEW violation (a file exceeding its
// baselined count, or any file not in the baseline at all) fails. The
// baseline starts empty — the recase sweep left zero legitimate wrong-cased
// literals in scope, so today this fence is effectively fail-closed. Only
// regenerate the baseline after a deliberate, reviewed grandfather decision
// (e.g. a formal proper-noun citation that must keep different casing) —
// this is a ratchet, not a snooze button.
//
// What counts as a violation: the standalone word "MiMAR", "Mimar", or
// "MIMAR" (word-boundary matched, case-sensitive) OUTSIDE a comment. Word
// boundaries mean identifiers that merely CONTAIN one of these forms as a
// prefix/substring (e.g. a hypothetical `MiMARBadge` component name) are NOT
// flagged — this fence targets display copy, not code identifiers. Comments
// are skipped (reusing check-professionalism.ts's classifyLine) because they
// never render to a user; a stray wrong-cased mention in a code comment is
// not a display-copy regression.
//
// Deliberately NOT flagged anywhere (by construction — the regex only
// matches the three wrong-cased forms above): the correct "miMAR" casing,
// technical/lowercase "mimar" (e.g. the mimar.ar email domain, the
// logo-mimar.svg asset path, package/slug names), and the DIM codename.
//
// Scope: app/**, components/** — .ts/.tsx, excluding *.test.*, __tests__/**,
// *.stories.* (display copy lives in source, not in the tests that assert on
// it — mirrors check-professionalism.ts's scope carve-out).
//
// Run: pnpm tsx scripts/check-brand-casing.ts
// Or:  pnpm lint:brand
// Rewrite baseline (only after a deliberate, reviewed grandfather decision):
//   pnpm tsx scripts/check-brand-casing.ts --write-baseline
//
// Exits 1 with file:line, the offending literal, and a remedy on each hit.
// Exits 0 if clean.

import { globSync, readFileSync, writeFileSync } from "node:fs";

import { type CommentState, classifyLine } from "./check-professionalism";

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

function isExcluded(relPath: string): boolean {
  if (relPath.startsWith("node_modules/") || relPath.includes("/node_modules/")) return true;
  if (relPath.includes(".test.")) return true;
  if (relPath.includes("__tests__/")) return true;
  if (relPath.includes(".stories.")) return true;
  return false;
}

const FILES = globSync("{app,components,src,lib}/**/*.{ts,tsx}")
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => !isExcluded(f));

// ---------------------------------------------------------------------------
// The wrong-cased brand regex — word-boundary matched, case-sensitive, so it
// never matches the correct "miMAR" casing or lowercase technical "mimar".
// ---------------------------------------------------------------------------

export const WRONG_CASE_BRAND = /\b(MiMAR|Mimar|MIMAR)\b/g;

const REMEDY =
  'canonical brand casing is "miMAR" (lowercase m, capital M-A-R) — recase the literal';

type BrandHit = { line: number; text: string };

/** All wrong-cased brand hits in a file's source, skipping comment lines.
 * Exported for unit tests (drives the ratchet count exactly like the CLI
 * scan). CRLF-safe: splits on \r?\n like check-professionalism.ts. */
export function findBrandHits(src: string): BrandHit[] {
  const hits: BrandHit[] = [];
  let state: CommentState = { inBlock: false };
  src.split(/\r?\n/).forEach((rawLine, i) => {
    const { isComment, nextState } = classifyLine(rawLine, state);
    state = nextState;
    if (isComment) return;
    for (const match of rawLine.matchAll(WRONG_CASE_BRAND)) {
      hits.push({ line: i + 1, text: match[0] });
    }
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Baseline — scripts/brand-casing-baseline.json
//
// Shape mirrors check-professionalism.ts Rule 2: a per-file count,
// grandfathered up to that count; any file exceeding it (or any new file not
// listed) fails.
// ---------------------------------------------------------------------------

type BaselineFile = {
  _meta: { totalViolations: number; description: string };
  files: Record<string, number>;
};

const BASELINE_PATH = "scripts/brand-casing-baseline.json";

function loadBaseline(): Record<string, number> {
  try {
    const data = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as BaselineFile;
    return data.files;
  } catch {
    console.warn(
      `[warn] ${BASELINE_PATH} not found — brand-casing will be strict (no grandfather).`,
    );
    return {};
  }
}

function writeBaseline(): void {
  const files: Record<string, number> = {};
  let total = 0;
  for (const file of FILES) {
    const count = findBrandHits(readFileSync(file, "utf8")).length;
    if (count > 0) {
      files[file] = count;
      total += count;
    }
  }
  const output: BaselineFile = {
    _meta: {
      totalViolations: total,
      description:
        'Baseline of wrong-cased brand literals (MiMAR/Mimar/MIMAR) outside comments, in app/**+components/**. Files listed here are grandfathered up to their count. New violations (new files, or counts above these) fail lint:brand. Regenerate only after a deliberate, reviewed grandfather decision — the canonical casing is "miMAR".',
    },
    files,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `Baseline written: ${total} grandfathered brand-casing hit(s) across ${Object.keys(files).length} file(s).`,
  );
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function runScan(): void {
  const baseline = loadBaseline();
  let violatingFiles = 0;
  let grandfathered = 0;

  for (const file of FILES) {
    const src = readFileSync(file, "utf8");
    const hits = findBrandHits(src);
    if (hits.length === 0) continue;

    const allowed = baseline[file] ?? 0;
    grandfathered += Math.min(hits.length, allowed);
    if (hits.length > allowed) {
      for (const hit of hits) {
        console.error(`${file}:${hit.line}: wrong-cased brand "${hit.text}" — ${REMEDY}`);
      }
      console.error(
        `${file}: ratchet — ${hits.length} brand-casing violation(s) (baseline allows ${allowed}). To grandfather a reviewed exception, run: pnpm tsx scripts/check-brand-casing.ts --write-baseline`,
      );
      violatingFiles += 1;
    }
  }

  if (violatingFiles > 0) {
    console.error(`\n✗ ${violatingFiles} file(s) with new brand-casing violation(s).`);
    process.exit(1);
  }

  console.log(
    `✓ Brand casing clean — 0 new wrong-cased "MiMAR"/"Mimar"/"MIMAR" literals across ${FILES.length} files.`,
  );
  console.log(
    `  Ratchet: ${grandfathered} grandfathered hit(s) across ${Object.keys(baseline).length} file(s). New ones will fail.`,
  );
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-brand-casing.ts") ||
    process.argv[1].endsWith("check-brand-casing.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  if (process.argv.includes("--write-baseline")) {
    writeBaseline();
  } else {
    runScan();
  }
}
