// Raw <button> ratchet — CI guard (design-system consolidation).
//
// Enforces that literal `<button` elements do not increase across two
// surfaces, tracked with SEPARATE baselines so burn-down stays legible:
//   - operator/government/org  (app/gob, app/admin, app/org)
//   - citizen                  (components/**, app/(app), app/(public), app/(auth))
// The target is full adoption of the LnButton (components/ui/Button.tsx) and
// OpButton (components/ui/dashboard/OpButton.tsx) primitives instead of raw
// `<button>` tags, so touch targets, focus rings, and disabled/loading
// states stay consistent across the design system.
//
// Rule (per surface):
//   Count literal `<button` occurrences (case-sensitive tag open) in .tsx
//   files under that surface's glob (test files excluded). If the TOTAL
//   count for a surface is greater than its BASELINE, fail. If a PR migrates
//   raw buttons to LnButton/OpButton and lowers a surface's count, update
//   that surface's BASELINE down to the new total in the same change — the
//   ratchet only ever tightens. The two counts are never merged: an operator
//   regression must not be masked by citizen headroom, or vice versa.
//
// Run: node scripts/check-raw-buttons.mjs   (or: pnpm lint:buttons)
// Exits 0 when both surfaces are clean; exits 1 listing each file's count
// (per surface) when either surface's total exceeds its baseline.

import { globSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Total literal `<button` occurrences across app/gob, app/admin, app/org
 *  measured on 2026-07-04 (task #41, design-system consolidation ratchets).
 *  2026-07-05: operator OpButton burn-down migrated 137 raw <button>s to
 *  OpButton across app/gob, app/admin, app/org — baseline lowered 182 → 46.
 *  Remaining 46 are intentional: segmented toggles (aria-pressed), pure
 *  text-links (underline, no chrome), icon-only micro-controls, and buttons
 *  carrying a `ref` for ConfirmDialog focus-restore (OpButton forwards no ref).
 *  2026-07-08: +3 pure text-links (underline, no chrome — OpButton's
 *  primary/ghost/danger/ok variants all carry bg+border chrome, so forcing
 *  these in would change their appearance) — FinalizeAdoptionForm.tsx's two
 *  offline-adoption toggle links (commit 151e217d) and OrgBiteForm.tsx's
 *  "usar mi ubicación" link (commit b5e03ff2). Flagged for PO design sign-off.
 *  Baseline raised 46 → 49.
 *  2026-07-19: +2 vaccine-catalog option-picker rows in the atender console's
 *  AtenderVaccinationGate.tsx (fuzzy-match candidate list) — full-width,
 *  left-aligned selectable rows with a dashed escape-hatch ("no está en el
 *  catálogo"); this is a pick-list option pattern, not a centered action
 *  button, so OpButton (which centers content + carries action chrome) would
 *  degrade scanability and lose the escape-hatch signal. The console's submit
 *  button WAS migrated to OpButton in the same change. Baseline raised 49 → 51.
 *  2026-07-19: a11y batch — ReasignarButton.tsx and DevolverAlDuenoButton.tsx
 *  (app/gob/decomisos/_components) migrated their hand-rolled `<dialog>`
 *  modals onto ConfirmDialog (focus trap + Escape + focus-restore); each
 *  trigger carries a `ref` for ConfirmDialog's focus-restore, which OpButton
 *  cannot forward (+2). Same change converted OrgBiteForm.tsx's victim-type
 *  button trio into native radio inputs (-3). Net: baseline lowered 51 → 52.
 *  2026-07-21: audit-3-feedback §C2 — IncomingTransferActions.tsx converted
 *  its accept/reject inline mode-switch panel onto ConfirmDialog (matching
 *  friction to the citizen-facing AcceptTransferActions.tsx equivalent for
 *  a custody-changing action); both triggers carry a `ref` for
 *  ConfirmDialog's focus-restore, same OpButton limitation as above (+2).
 *  The surface had also drifted down to 51 (unrelated cleanup) since the
 *  52 baseline was set, so the net change lands at 53, not 54.
 *  Baseline set 52 → 53.
 *  E4 (2026-07-21 facades harvest): CancelTransferAction.tsx adds ONE
 *  ConfirmDialog trigger button for the newly-wired custody-transfer cancel
 *  action (audit-3-feedback §C2 consequence-copy convention) — same OpButton
 *  ref limitation, same sanctioned workaround already used by
 *  IncomingTransferActions.tsx/ReasignarButton.tsx/DevolverAlDuenoButton.tsx/
 *  RemoveMemberButton.tsx. Baseline set 53 → 54.
 *  2026-07-21: adoption-reversal facade harvest — ReverseAdoptionAction.tsx
 *  (app/org/[orgToken]/mascotas/[publicToken]/) adds ONE ConfirmDialog
 *  trigger button for the newly-wired "Revertir adopción" action, same
 *  sanctioned ref-for-focus-restore workaround. Baseline set 54 → 55.
 *  Target: 0, via migration to LnButton (citizen) / OpButton (operator).
 *  Lower this number as files migrate — never raise it without a design
 *  review sign-off (raw <button> reintroduces inconsistent touch targets,
 *  focus rings, and loading/disabled states). */
const OPERATOR_BASELINE = 55;
const OPERATOR_SCAN_GLOB = "{app/gob,app/admin,app/org}/**/*.tsx";
const OPERATOR_LABEL = "operator (app/gob, app/admin, app/org)";

/** Total literal `<button` occurrences across the citizen surface —
 *  components/**, app/(app), app/(public), app/(auth) — measured on
 *  2026-07-19 (consistency-fences pass, widened from operator-only scan).
 *  This is a SEPARATE ratchet from the operator baseline above: the two
 *  surfaces migrate independently (LnButton for citizen, OpButton for
 *  operator), so merging the counts would hide a regression in either one
 *  behind headroom in the other.
 *  2026-07-21 (Fase C, saved-views primitive): SavedViewsPopover.tsx's 4 raw
 *  buttons were extracted into the new shared components/ui/dashboard/
 *  SavedViewsControl.tsx (net +4 there, -4 in the now-thin wrapper — no new
 *  raw buttons overall), and the run also picked up an unrelated -2 drift.
 *  Baseline lowered 325 → 323 to lock in the net gain.
 *  Target: 0, via migration to LnButton (components/ui/Button.tsx).
 *  Lower this number as files migrate — never raise it without a design
 *  review sign-off (raw <button> reintroduces inconsistent touch targets,
 *  focus rings, and loading/disabled states). */
const CITIZEN_BASELINE = 323;
const CITIZEN_SCAN_GLOB = "{components,app/(app),app/(public),app/(auth)}/**/*.tsx";
const CITIZEN_LABEL = "citizen (components/**, app/(app), app/(public), app/(auth))";

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

/** Scan one surface against its baseline. Returns true if clean (total <= baseline). */
function scanSurface({ label, glob, baseline, scriptName }) {
  const files = globSync(glob)
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !f.includes(".test."))
    .sort();

  if (files.length === 0) {
    console.error(`✗ check-raw-buttons: no files found for ${label} surface.`);
    return false;
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

  if (total > baseline) {
    perFile
      .sort((a, b) => b.count - a.count)
      .forEach(({ file, count }) => {
        console.error(`${file}: ${count} raw <button> occurrence(s)`);
      });
    console.error(
      `\n✗ ${total} raw <button> occurrence(s) across ${label} — baseline allows ${baseline}. Migrate new raw buttons to LnButton (components/ui/Button.tsx) or OpButton (components/ui/dashboard/OpButton.tsx).`,
    );
    return false;
  }

  if (total < baseline) {
    console.log(
      `✓ [${label}] raw <button> count improved: ${total} (baseline ${baseline}). Lower ${scriptName} in scripts/check-raw-buttons.mjs to ${total} to lock in the gain.`,
    );
    return true;
  }

  console.log(
    `✓ [${label}] raw <button> count clean — ${total} occurrence(s) across ${files.length} file(s), at baseline (${baseline}).`,
  );
  return true;
}

function runScan() {
  const operatorOk = scanSurface({
    label: OPERATOR_LABEL,
    glob: OPERATOR_SCAN_GLOB,
    baseline: OPERATOR_BASELINE,
    scriptName: "OPERATOR_BASELINE",
  });

  const citizenOk = scanSurface({
    label: CITIZEN_LABEL,
    glob: CITIZEN_SCAN_GLOB,
    baseline: CITIZEN_BASELINE,
    scriptName: "CITIZEN_BASELINE",
  });

  if (!operatorOk || !citizenOk) {
    process.exit(1);
  }
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
