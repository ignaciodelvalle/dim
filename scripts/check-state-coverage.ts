// State-coverage fence — CI guard (Wave 2 / Level 2 state completeness,
// docs/reviews/results/2026-07-21-audit-2-estados.md).
//
// The audit found three foundational gaps worth locking down cheaply, without
// trying to be a perfect state-coverage oracle:
//
//   1. PORTAL ERROR BOUNDARY (hard, no baseline) — every top-level portal
//      segment (gob/admin/org/(app)/(public)) must ship its own error.tsx.
//      This is currently 100% true; the fence exists so it STAYS true — a
//      portal losing its error.tsx silently is a regression, not a gap to
//      grandfather.
//   2. SHELL STATE-PRIMITIVE MOUNTS (hard, no baseline) — the offline banner
//      and maintenance screen primitives landed in Wave 2 foundation
//      (commit 4c9167a3) inside each operator/citizen shell layout. A future
//      layout refactor could drop the import/JSX silently (no type error, no
//      runtime error — just a missing banner). This fence greps for both
//      symbols in each shell file.
//   3. LOADING-SKELETON FLOOR (ratchet) — a floor on the total count of
//      segment-specific loading.tsx files app-wide. Wave 2 raised this from
//      13 to the count recorded in the baseline; the floor can only go UP
//      (regenerate via --write-baseline after adding new segment skeletons),
//      never down — a segment loading.tsx quietly deleted fails CI.
//   4. EMPTY-STATE COVERAGE (ratchet, best-effort) — a page.tsx that renders
//      an `OpFilterBar` (the operator list/dashboard signal) is expected to
//      have an empty-state primitive (`EmptyState` — matches both
//      `LnEmptyState` and a generic import) somewhere in its own directory.
//      This is a heuristic, not a parser: baseline absorbs every current gap
//      (some are false positives — the empty state lives in a shared child
//      component elsewhere), and only a NEW gap (a new list screen shipped
//      with no empty-state signal at all in its own folder) fails CI.
//
// Baseline: scripts/state-coverage-baseline.json — regenerate with
//   pnpm tsx scripts/check-state-coverage.ts --write-baseline
// Rules 1–2 have no baseline entries (hard invariants); rule 3 is a single
// floor number; rule 4 is a per-file allow-list, same ratchet shape as
// check-eyebrow-title.ts / check-tablist-ratchet.ts.
//
// Run: pnpm tsx scripts/check-state-coverage.ts   (or: pnpm lint:states)
// Exits 0 when clean; exits 1 listing each violation.

import { existsSync, globSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = resolve(ROOT, "scripts/state-coverage-baseline.json");

// ---------------------------------------------------------------------------
// Rule 1 — portal error.tsx presence (hard invariant, no baseline)
// ---------------------------------------------------------------------------

const REQUIRED_PORTAL_ERROR_BOUNDARIES: string[] = [
  "app/gob/error.tsx",
  "app/admin/error.tsx",
  "app/org/[orgToken]/error.tsx",
  "app/(app)/error.tsx",
  "app/(public)/error.tsx",
];

function checkPortalErrorBoundaries(): string[] {
  const missing: string[] = [];
  for (const segment of REQUIRED_PORTAL_ERROR_BOUNDARIES) {
    if (!existsSync(resolve(ROOT, segment))) missing.push(segment);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Rule 2 — shell state-primitive mounts (hard invariant, no baseline)
// ---------------------------------------------------------------------------

type ShellSpec = { file: string; offline: RegExp; maintenance: RegExp };

const REQUIRED_SHELL_MOUNTS: ShellSpec[] = [
  { file: "app/(app)/layout.tsx", offline: /LnOfflineBanner/, maintenance: /LnMaintenanceScreen/ },
  { file: "app/gob/layout.tsx", offline: /OpOfflineBanner/, maintenance: /OpMaintenanceScreen/ },
  { file: "app/admin/layout.tsx", offline: /OpOfflineBanner/, maintenance: /OpMaintenanceScreen/ },
  {
    file: "app/org/[orgToken]/layout.tsx",
    offline: /OpOfflineBanner/,
    maintenance: /OpMaintenanceScreen/,
  },
];

function checkShellMounts(): string[] {
  const violations: string[] = [];
  for (const shell of REQUIRED_SHELL_MOUNTS) {
    const path = resolve(ROOT, shell.file);
    if (!existsSync(path)) {
      violations.push(`${shell.file}: file missing`);
      continue;
    }
    const src = readFileSync(path, "utf8");
    if (!shell.offline.test(src)) {
      violations.push(`${shell.file}: missing ${shell.offline.source} (offline banner)`);
    }
    if (!shell.maintenance.test(src)) {
      violations.push(`${shell.file}: missing ${shell.maintenance.source} (maintenance screen)`);
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Rule 3 — loading-skeleton floor (ratchet, single number)
// ---------------------------------------------------------------------------

function countLoadingSegments(): number {
  return globSync("app/**/loading.tsx", { cwd: ROOT })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !f.includes("node_modules/")).length;
}

// ---------------------------------------------------------------------------
// Rule 4 — empty-state coverage for list-shaped pages (ratchet, best-effort)
// ---------------------------------------------------------------------------

const PORTAL_ROOTS = ["app/gob", "app/admin", "app/org", "app/(app)", "app/(public)"];

/** Heuristic: a page.tsx that renders `OpFilterBar` is a list/dashboard screen. */
const LIST_SIGNAL_RE = /OpFilterBar/;

/** Matches both `LnEmptyState` and a generic `EmptyState` import/usage. */
const EMPTY_STATE_SIGNAL_RE = /EmptyState/;

function collectPortalPages(): string[] {
  const files: string[] = [];
  for (const root of PORTAL_ROOTS) {
    const matches = globSync("**/page.tsx", { cwd: resolve(ROOT, root) })
      .map((f) => `${root}/${f}`.replaceAll("\\", "/"))
      .filter((f) => !f.includes("node_modules/"));
    files.push(...matches);
  }
  return files.sort();
}

/** Direct (non-recursive) sibling .tsx files in the same directory, excluding tests. */
function siblingSources(pagePath: string): string[] {
  const dir = dirname(resolve(ROOT, pagePath));
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => join(dir, name));
}

/** A list-shaped page "has" an empty-state signal if it (or a direct sibling
 * file in its own directory — the list component is often split out) mentions
 * EmptyState. Best-effort: misses empty states implemented in a component
 * living deeper in a subdirectory — those gaps are absorbed by the baseline. */
function findEmptyStateGaps(pages: string[]): string[] {
  const gaps: string[] = [];
  for (const page of pages) {
    const src = readFileSync(resolve(ROOT, page), "utf8");
    if (!LIST_SIGNAL_RE.test(src)) continue;
    const ownSignal = EMPTY_STATE_SIGNAL_RE.test(src);
    const siblingSignal = ownSignal
      ? true
      : siblingSources(page).some((f) => EMPTY_STATE_SIGNAL_RE.test(readFileSync(f, "utf8")));
    if (!siblingSignal) gaps.push(page);
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Baseline I/O
// ---------------------------------------------------------------------------

type Baseline = {
  _meta: { generatedAt: string; description: string };
  minLoadingSegments: number;
  emptyStateGaps: string[];
};

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    console.warn(
      `[warn] ${BASELINE_PATH} not found — every gap will fail. Regenerate with: pnpm tsx scripts/check-state-coverage.ts --write-baseline`,
    );
    return {
      _meta: { generatedAt: "", description: "" },
      minLoadingSegments: 0,
      emptyStateGaps: [],
    };
  }
}

function writeBaseline(loadingCount: number, gaps: string[]): void {
  const baseline: Baseline = {
    _meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      description:
        "Wave 2 state-coverage fence baseline. minLoadingSegments is a FLOOR (only raise it, via --write-baseline, after adding new segment loading.tsx files — never lower it by hand). emptyStateGaps grandfathers list-shaped pages (OpFilterBar signal) with no EmptyState signal in their own directory; curing a gap lets its entry be removed — new gaps not in this list fail lint:states.",
    },
    minLoadingSegments: loadingCount,
    emptyStateGaps: gaps,
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `✓ Wrote baseline: minLoadingSegments=${loadingCount}, emptyStateGaps=${gaps.length} to ${BASELINE_PATH}.`,
  );
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runChecks(): void {
  let hits = 0;

  const missingBoundaries = checkPortalErrorBoundaries();
  for (const segment of missingBoundaries) {
    console.error(`✗ ${segment}: required portal error.tsx is missing.`);
    hits += 1;
  }

  const shellViolations = checkShellMounts();
  for (const v of shellViolations) {
    console.error(`✗ ${v} — offline/maintenance primitive must stay mounted in the shell.`);
    hits += 1;
  }

  const baseline = loadBaseline();

  const loadingCount = countLoadingSegments();
  if (loadingCount === 0) {
    // FAIL CLOSED: zero loading.tsx app-wide means the glob ran from the
    // wrong place, not that every segment lost its skeleton.
    console.error(
      "✗ check-state-coverage: found 0 loading.tsx under app/**  — glob likely misfired.",
    );
    hits += 1;
  } else if (loadingCount < baseline.minLoadingSegments) {
    console.error(
      `✗ loading.tsx segment count dropped: ${loadingCount} found, floor is ${baseline.minLoadingSegments}. A segment-specific loading.tsx was likely deleted — restore it or lower the floor deliberately (--write-baseline) with a reviewed reason.`,
    );
    hits += 1;
  }

  const pages = collectPortalPages();
  if (pages.length === 0) {
    console.error(
      "✗ check-state-coverage: found 0 page.tsx across portal roots — glob likely misfired.",
    );
    hits += 1;
  }
  const gaps = findEmptyStateGaps(pages);
  const allowedGaps = new Set(baseline.emptyStateGaps);
  const newGaps = gaps.filter((g) => !allowedGaps.has(g));
  for (const g of newGaps) {
    console.error(
      `✗ ${g}: renders OpFilterBar (list/dashboard screen) with no EmptyState signal in its own directory — add LnEmptyState (or document why this screen is exempt and add it to the baseline).`,
    );
    hits += 1;
  }
  const staleGaps = baseline.emptyStateGaps.filter((g) => !gaps.includes(g));
  if (staleGaps.length > 0) {
    console.warn(
      `[info] ${staleGaps.length} baselined empty-state gap(s) are now clean — remove from ${BASELINE_PATH} to tighten the ratchet: ${staleGaps.join(", ")}`,
    );
  }

  if (hits > 0) {
    console.error(`\n✗ ${hits} state-coverage violation(s).`);
    process.exit(1);
  }

  console.log(
    `✓ state-coverage fence clean — ${REQUIRED_PORTAL_ERROR_BOUNDARIES.length} portal error boundaries, ${REQUIRED_SHELL_MOUNTS.length} shells with offline+maintenance mounted, ${loadingCount} loading.tsx segments (floor ${baseline.minLoadingSegments}), ${gaps.length} empty-state gaps grandfathered (of ${baseline.emptyStateGaps.length} baselined).`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-state-coverage.ts") ||
    process.argv[1].endsWith("check-state-coverage.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  if (process.argv.includes("--write-baseline")) {
    writeBaseline(countLoadingSegments(), findEmptyStateGaps(collectPortalPages()));
  } else {
    runChecks();
  }
}
