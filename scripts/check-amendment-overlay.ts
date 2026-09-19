// Amendment-overlay fence — CI guardrail (A08-G3).
//
// THE QUESTION THIS ASKS
// ---------------------------------------------------------------------------
// "This module reads the payload of an event type that can be AMENDED. Does it
// read the corrected value, or the one the correction replaced?"
//
// WHY IT EXISTS
// ---------------------------------------------------------------------------
// Corrections are new events (Invariant 2): an `event_amended` row names its
// target and the changed fields, and every reader is supposed to fold it in
// through `overlayAmendments` (lib/infra/amendment.ts) or its SQL twin
// (lib/infra/amendment-sql.ts). Nothing enforced that. Two write paths —
// `updateWeightProjection` and `rederivePregnancyStatus` — replayed the RAW
// stream and silently reverted a correction on the next ordinary write
// (A08-G1, A08-G2), and the repair script replayed raw while claiming to run
// the detector's own check (A08-G4). All three shipped green through ~70 fences
// because none of them mentioned amendments at all.
//
// THE SUBJECT, NOT THE FORMS
// ---------------------------------------------------------------------------
// The amendable set is read from `AMENDABLE_EVENT_TYPES` itself, never copied,
// so a type added to the allowlist extends this fence on the same commit. A
// module is a READER when it either
//
//   (R1) calls a `replay*` export of a lib/projections module whose source
//        names an amendable type — the replays are derived from the same
//        constant, not listed here; or
//   (R2) selects `petEvents.payload` in a file that names an amendable type.
//
// A reader passes when it calls `overlayAmendments(` or imports the SQL twin,
// or when ALLOWLIST says, with a reason, why the raw value is the right one.
// An R1 reader that narrows its fetch by event type must also fetch
// `event_amended` — an overlay over a stream with no corrections in it is the
// A08-G1 bug with a type-correct call site (the brand on the replay input,
// `AmendmentOverlaid`, proves the call happened, not what was fetched).
//
// Stale allowlist entries fail too: an entry for a file that no longer reads,
// or that now overlays, is a reason nobody is checking.
//
// Run: pnpm lint:amendment-overlay

import { globSync, readFileSync } from "node:fs";

import { AMENDABLE_EVENT_TYPES } from "../lib/infra/amendment";

type Violation = { file: string; message: string };

// Files that read an amendable payload RAW on purpose. Each reason must say why
// the pre-correction value is the one the reader needs.
const ALLOWLIST: Record<string, string> = {};

const SOURCE_GLOBS = [
  "app/**/*.{ts,tsx}",
  "lib/**/*.{ts,tsx}",
  "src/**/*.{ts,tsx}",
  "scripts/**/*.ts",
];

const EXCLUDED = [
  /\.test\.tsx?$/,
  /\/__tests__\//,
  /\.d\.ts$/,
  // Definitions, not readers.
  /^lib\/projections\//,
  /^lib\/infra\/amendment(-sql)?\.ts$/,
  // This file names every amendable type by construction.
  /^scripts\/check-amendment-overlay\.ts$/,
];

// Non-vacuity: these are known readers today. If the scan stops seeing them,
// the detector broke, not the codebase.
const KNOWN_READERS = [
  "lib/infra/rederive-pet-cache.ts",
  "src/modules/events/infrastructure/events-repository.ts",
  "src/modules/pets/application/pregnancy/rederive-pregnancy-status.ts",
  "src/modules/events/application/amendment/refresh-pet-cache-after-amendment.ts",
];
const MIN_READERS = 6;

function norm(p: string): string {
  return p.replaceAll("\\", "/");
}

function stripComments(src: string): string {
  // Comments legitimately NAME the helper ("we do not use overlayAmendments
  // here because…"); a comment must not satisfy the rule or trip it.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function namesAmendableType(src: string): boolean {
  return AMENDABLE_EVENT_TYPES.some((t) => new RegExp(`["'\`]${t}["'\`]`).test(src));
}

function amendableReplays(): string[] {
  const names = new Set<string>();
  for (const f of globSync("lib/projections/*.ts").map(norm)) {
    if (/\.test\.ts$/.test(f)) continue;
    const src = stripComments(readFileSync(f, "utf8"));
    if (!namesAmendableType(src)) continue;
    for (const m of src.matchAll(/export function (replay\w+)\s*\(/g)) names.add(m[1]);
  }
  return [...names].sort();
}

function main(): void {
  const replays = amendableReplays();
  const violations: Violation[] = [];

  if (replays.length < 3) {
    violations.push({
      file: "lib/projections",
      message: `only ${replays.length} amendable replay(s) found (${replays.join(", ")}); expected at least replayPetWeight, replayPetPregnancy, replayPetJurisdiction — the derivation broke`,
    });
  }

  const files = [...new Set(SOURCE_GLOBS.flatMap((g) => globSync(g)).map(norm))]
    .filter((f) => !EXCLUDED.some((re) => re.test(f)))
    .sort();

  const readers: string[] = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, "utf8"));
    const r1 = replays.filter((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(src));
    const r2 = /\bpetEvents\.payload\b/.test(src) && namesAmendableType(src);
    if (r1.length === 0 && !r2) {
      if (ALLOWLIST[file]) {
        violations.push({ file, message: "allowlisted but no longer reads an amendable payload — drop the entry" });
      }
      continue;
    }
    readers.push(file);

    const overlays = /\boverlayAmendments\s*\(/.test(src) || /from\s+["'][^"']*amendment-sql["']/.test(src);
    if (ALLOWLIST[file]) {
      if (overlays) {
        violations.push({ file, message: "allowlisted as a RAW reader but now overlays — drop the entry" });
      }
      continue;
    }
    if (!overlays) {
      violations.push({
        file,
        message: `reads an amendable payload (${r1.length ? r1.join(", ") : "petEvents.payload"}) without overlayAmendments / amendment-sql`,
      });
      continue;
    }
    const narrowsByType = /\b(inArray|eq)\(\s*petEvents\.eventType\b/.test(src);
    if (r1.length > 0 && narrowsByType && !/["'`]event_amended["'`]/.test(src)) {
      violations.push({
        file,
        message: `narrows its fetch by event type but never fetches "event_amended" — the overlay folds nothing (A08-G1 shape)`,
      });
    }
  }

  for (const known of KNOWN_READERS) {
    if (!readers.includes(known)) {
      violations.push({ file: known, message: "known reader not detected — the scan is vacuous" });
    }
  }
  if (readers.length < MIN_READERS) {
    violations.push({
      file: "(scan)",
      message: `only ${readers.length} reader(s) detected; floor is ${MIN_READERS}`,
    });
  }
  for (const file of Object.keys(ALLOWLIST)) {
    if (!files.includes(file)) {
      violations.push({ file, message: "allowlisted file does not exist — drop the entry" });
    }
  }

  if (violations.length > 0) {
    console.error(`check-amendment-overlay: ${violations.length} violation(s)\n`);
    for (const v of violations) console.error(`  ${v.file}: ${v.message}`);
    console.error(
      "\nFold corrections with overlayAmendments (lib/infra/amendment.ts) or the SQL twin (lib/infra/amendment-sql.ts), or allowlist the file with a reason the RAW value is the right one.",
    );
    process.exit(1);
  }
  console.log(
    `check-amendment-overlay: ${readers.length} reader(s) of ${AMENDABLE_EVENT_TYPES.length} amendable type(s) fold corrections (replays: ${replays.join(", ")}).`,
  );
}

main();
