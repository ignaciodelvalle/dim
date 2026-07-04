// Raw <button> ratchet — CI guard (design-system consolidation).
//
// Enforces that literal `<button` elements do not increase across the
// operator/government/org surfaces. The target is full adoption of the
// LnButton (components/ui/Button.tsx) and OpButton
// (components/ui/dashboard/OpButton.tsx) primitives instead of raw
// `<button>` tags, so touch targets, focus rings, and disabled/loading
// states stay consistent across the design system.
//
// Rule:
//   Count literal `<button` occurrences (case-sensitive tag open) in .tsx
//   files under app/gob, app/admin, app/org (test files excluded). If the
//   TOTAL count is greater than BASELINE, fail. If a PR migrates raw
//   buttons to LnButton/OpButton and lowers the count, update BASELINE
//   down to the new total in the same change — the ratchet only ever
//   tightens.
//
// Run: node scripts/check-raw-buttons.mjs   (or: pnpm lint:buttons)
// Exits 0 when clean; exits 1 listing each file's count when the total
// exceeds the baseline.

import { globSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Total literal `<button` occurrences across app/gob, app/admin, app/org
 *  measured on 2026-07-04 (task #41, design-system consolidation ratchets).
 *  Target: 0, via migration to LnButton (citizen) / OpButton (operator).
 *  Lower this number as files migrate — never raise it without a design
 *  review sign-off (raw <button> reintroduces inconsistent touch targets,
 *  focus rings, and loading/disabled states). */
const BASELINE = 180;

const SCAN_GLOB = "{app/gob,app/admin,app/org}/**/*.tsx";
const RAW_BUTTON = /<button\b/g;

// ---------------------------------------------------------------------------
// Core logic (exported for unit tests)
// ---------------------------------------------------------------------------

export function countRawButtons(src) {
  return [...src.matchAll(RAW_BUTTON)].length;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function runScan() {
  const files = globSync(SCAN_GLOB)
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !f.includes(".test."))
    .sort();

  if (files.length === 0) {
    console.error("✗ check-raw-buttons: no files found under app/gob, app/admin, app/org.");
    process.exit(1);
  }

  const perFile = [];
  let total = 0;

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const count = countRawButtons(src);
    if (count > 0) {
      perFile.push({ file, count });
      total += count;
    }
  }

  if (total > BASELINE) {
    perFile
      .sort((a, b) => b.count - a.count)
      .forEach(({ file, count }) => {
        console.error(`${file}: ${count} raw <button> occurrence(s)`);
      });
    console.error(
      `\n✗ ${total} raw <button> occurrence(s) across app/gob, app/admin, app/org — baseline allows ${BASELINE}. Migrate new raw buttons to LnButton (components/ui/Button.tsx) or OpButton (components/ui/dashboard/OpButton.tsx).`,
    );
    process.exit(1);
  }

  if (total < BASELINE) {
    console.log(
      `✓ raw <button> count improved: ${total} (baseline ${BASELINE}). Lower BASELINE in scripts/check-raw-buttons.mjs to ${total} to lock in the gain.`,
    );
    return;
  }

  console.log(
    `✓ raw <button> count clean — ${total} occurrence(s) across ${files.length} file(s), at baseline (${BASELINE}).`,
  );
}

// Guard: only scan when run directly; importing from tests exposes
// countRawButtons without triggering the filesystem scan.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-raw-buttons.mjs") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
