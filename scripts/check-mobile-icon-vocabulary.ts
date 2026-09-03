// Mobile icon-vocabulary fence — CI guard (placeholder glyphs, glyph collisions, silent table drift).
//
// WHY THIS EXISTS, AND WHY THE FENCE THAT ALREADY EXISTED DID NOT CATCH IT.
// `apps/mobile/src/ui/Icon.test.tsx` has fenced this table since 2026-09-01. It
// asserts every value in PET_PROFILE_ICONS resolves to a real export of
// `lucide-react-native`. That test was green on 2026-09-03 while the table read:
//
//     embarazo:      "Baby"     ← a national sanitary registry drawing an
//                                 INFANT over a pregnant animal
//     fallecimiento: "Circle"   ← a bare circle for death: a placeholder that
//                                 shipped and that nobody looked at again
//
// Both resolve. `Baby` is a real lucide export; so is `Circle`. A fence that
// asks "does this glyph exist" cannot answer "does this glyph mean anything",
// and its green was read for a week as if it had. That is the failure this file
// is built around: NOT that the table was wrong, but that a passing check
// covered it. See docs/mobile/eas-build-profiles.md for the same shape in the
// build (a `catch` that could never run).
//
// WHAT A FENCE CAN AND CANNOT DECIDE. It cannot decide that `Baby` is the wrong
// picture for `embarazo` — that is a judgement, and pretending to automate it
// would produce exactly the false comfort described above. What it CAN decide
// is mechanical, and the two mechanical rules below would each have caught a
// real defect that shipped. For the rest, Rule C pins the table so that any
// edit is visible and deliberate in review rather than quiet.
//
// THREE RULES:
//
//   (A) NO PLACEHOLDER GLYPHS. A bare geometric primitive carries no meaning,
//       so it is never a considered choice — it is what someone types to make
//       the type-checker stop complaining, intending to come back. `Circle` for
//       `fallecimiento` is that, and it reached a store build. HARD rule, no
//       baseline: the correct count is zero and always was.
//
//   (B) ONE GLYPH, ONE CONCEPT. Two keys pointing at the same glyph means the
//       interface says the same thing with two words, or — worse — two
//       different things with one picture. Today `alert` and `alert-triangle`
//       both map to `AlertTriangle`. Deliberate aliases are allowed but must be
//       DECLARED below with a reason, so the next one is a decision instead of
//       an accident. This rule is also what stops the `girar` → `RefreshCw`
//       collision from spreading: the flip control and a future data-refresh
//       control cannot quietly wear the same picture.
//
//   (C) NON-VACUITY. Every rule above scans a table this script must first
//       FIND and PARSE. If the path moves, the export is renamed, or the regex
//       stops matching, a scan of zero entries would satisfy A and B perfectly
//       and this fence would report success forever. So the entry count is
//       pinned: fewer than MIN_ENTRIES, or a count that drifts from
//       PINNED_ENTRY_COUNT without the constant being updated in the same
//       commit, is a FAILURE and not a pass.
//
//       This rule is the reason the file exists in this shape. The six design
//       fences this repo runs over the web (lint:icons, lint:buttons,
//       lint:states, lint:empty-states, lint:screens, lint:copy-contract) all
//       resolve their globs against the root Next.js tree and NONE of them
//       include apps/mobile — `lint:buttons` even counts literal `<button>`
//       tags, which React Native does not have. Pointed at the mobile client
//       they would all pass, having read nothing. A fence that cannot prove it
//       looked at something is indistinguishable from no fence, and it is worse
//       than no fence because it appears in a green list.
//
// Run: pnpm tsx scripts/check-mobile-icon-vocabulary.ts   (or: pnpm lint:mobile-icons)
// Exits 1 with a reason per violation. Exits 0 if clean.

import { readFileSync } from "node:fs";

const TABLE_FILE = "packages/contract/src/icons/pet-profile-icons.ts";
const TABLE_EXPORT = "PET_PROFILE_ICONS";

/**
 * Lucide exports that are bare geometry and therefore never a considered
 * choice for a domain concept. Not a style opinion: each of these is a shape
 * with no subject, so it cannot be right or wrong about anything, which is
 * precisely why it survives review.
 */
const PLACEHOLDER_GLYPHS = new Set([
  "Circle",
  "Square",
  "Box",
  "Dot",
  "Minus",
  "Slash",
  "HelpCircle",
  "CircleDashed",
  "SquareDashed",
]);

/**
 * Glyphs deliberately shared by more than one vocabulary key, with the reason.
 * An entry here is a decision on the record; anything else that collides is a
 * failure. Keep the key set sorted so a diff reads cleanly.
 */
const DECLARED_ALIASES: Record<string, { keys: string[]; reason: string }> = {
  AlertTriangle: {
    keys: ["alert", "alert-triangle"],
    reason:
      "The web ICON_MAP carries both spellings and this table matches it verbatim by design (see the file header: change a glyph THERE first). Collapsing one here would break that parity, so the duplication is inherited rather than chosen. Remove BOTH sides together or not at all.",
  },
};

/** Floor below which the table cannot plausibly be the real one. */
const MIN_ENTRIES = 15;

/**
 * The exact number of entries in the table as of the last reviewed change.
 * Update this in the SAME commit that adds or removes a vocabulary entry — the
 * point is that the count cannot move without someone saying so.
 */
const PINNED_ENTRY_COUNT = 20;

type Entry = { key: string; glyph: string; line: number };

function parseTable(source: string): Entry[] {
  const start = source.indexOf(`export const ${TABLE_EXPORT} = {`);
  if (start === -1) return [];
  const end = source.indexOf("} as const;", start);
  if (end === -1) return [];

  const body = source.slice(start, end);
  const lineOffset = source.slice(0, start).split("\n").length;

  const entries: Entry[] = [];
  body.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("//") || line.length === 0) return;
    // `key: "Glyph",` or `"quoted-key": "Glyph",`
    const m = line.match(/^"?([A-Za-z0-9_-]+)"?\s*:\s*"([A-Za-z0-9]+)"\s*,?/);
    if (m) entries.push({ key: m[1], glyph: m[2], line: lineOffset + i });
  });
  return entries;
}

const failures: string[] = [];

let source = "";
try {
  source = readFileSync(TABLE_FILE, "utf8");
} catch {
  failures.push(
    `Rule C (non-vacuity): could not read ${TABLE_FILE}. The vocabulary moved; this fence is blind until the path is updated.`,
  );
}

const entries = source ? parseTable(source) : [];

// ---- Rule C first: everything below is meaningless without it. ----
if (source && entries.length === 0) {
  failures.push(
    `Rule C (non-vacuity): parsed ZERO entries from ${TABLE_FILE}. The export \`${TABLE_EXPORT}\` was renamed, reshaped, or the parser no longer matches it. Rules A and B would pass vacuously, so this is a failure.`,
  );
} else if (entries.length > 0 && entries.length < MIN_ENTRIES) {
  failures.push(
    `Rule C (non-vacuity): parsed only ${entries.length} entries from ${TABLE_FILE}, below the floor of ${MIN_ENTRIES}. Either the table really shrank that far — in which case say so by lowering MIN_ENTRIES — or the parser is missing rows.`,
  );
} else if (entries.length !== PINNED_ENTRY_COUNT) {
  failures.push(
    `Rule C (pinned count): the vocabulary has ${entries.length} entries, pinned at ${PINNED_ENTRY_COUNT}. Adding or removing a vocabulary entry is a product decision — update PINNED_ENTRY_COUNT in ${"scripts/check-mobile-icon-vocabulary.ts"} in the same commit, so the change is visible in review instead of quiet.`,
  );
}

// ---- Rule A: placeholder glyphs. ----
for (const { key, glyph, line } of entries) {
  if (PLACEHOLDER_GLYPHS.has(glyph)) {
    failures.push(
      `Rule A (placeholder glyph): ${TABLE_FILE}:${line} maps \`${key}\` to \`${glyph}\`, a bare geometric primitive. It resolves in lucide, which is why the existing Icon.test.tsx passes on it, but it does not mean anything. Choose a glyph that is about ${key}.`,
    );
  }
}

// ---- Rule B: one glyph, one concept. ----
const byGlyph = new Map<string, Entry[]>();
for (const e of entries) {
  const list = byGlyph.get(e.glyph) ?? [];
  list.push(e);
  byGlyph.set(e.glyph, list);
}
for (const [glyph, list] of byGlyph) {
  if (list.length < 2) continue;
  const keys = list.map((e) => e.key).sort();
  const declared = DECLARED_ALIASES[glyph];
  if (declared && declared.keys.slice().sort().join(",") === keys.join(",")) continue;
  failures.push(
    `Rule B (glyph collision): \`${glyph}\` is used by ${keys.length} keys — ${keys.map((k) => `\`${k}\``).join(", ")} — at ${TABLE_FILE}:${list.map((e) => e.line).join(", ")}. Two names for one picture, or one picture for two meanings. If it is deliberate, declare it in DECLARED_ALIASES with the reason.`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ Mobile icon vocabulary — ${failures.length} violation(s):\n`);
  for (const f of failures) console.error(`  · ${f}\n`);
  process.exit(1);
}

console.log(`✓ Mobile icon vocabulary clean — ${entries.length} entries scanned in ${TABLE_FILE}.`);
