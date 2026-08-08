// Fitness test — one species dictionary, and only one (2026-08-08).
//
// PURPOSE:
//   `speciesLabel` / `speciesLabelPlural` in lib/utils/format.ts are the ONLY
//   place a species enum value may be translated to es-AR. A private copy in a
//   component is not a style problem: it is a defect that ships, because the
//   copy is written against whatever species the author had in mind that day
//   and then silently stops matching the enum.
//
// WHY A FENCE AND NOT JUST A TEST OF THE MAP:
//   __tests__/species-label.test.ts already asserts the shared map is
//   exhaustive. It cannot see a RIVAL map, so it guarded the right door of the
//   wrong house — and the bug came back twice:
//     - 2026-07-08 (Ciudadano Cero QA): /mis-mascotas and the org pipeline
//       board each had a local dog/cat map and leaked the raw English enum for
//       every other species.
//     - 2026-08-08 (adversarial review): four more copies, including two in a
//       single file 35 lines apart, and a ternary in the org services detail
//       that rendered EVERY non-dog species as "Gatos" — not a leak but a
//       falsehood.
//
// WHAT THIS TEST DOES:
//   Scans app/, components/, lib/ and src/ for the SHAPE of a species→Spanish
//   mapping — an object entry, a ternary, or a value/label option pair — and
//   fails naming the file. It matches the mapping shape rather than the mere
//   presence of the word "Perro", so ordinary Spanish copy is untouched.
//
// HOW TO MAINTAIN:
//   Do not add an exception. If a surface needs a different wording, add it to
//   lib/utils/format.ts as a named export (as the plural was) so every caller
//   gets it. The only exempt file is format.ts itself.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "components", "lib", "src"];

// The single legitimate home. Paths are compared with forward slashes.
const DICTIONARY_FILE = "lib/utils/format.ts";

// Canonical species set (pets.species) with both es-AR numbers, mirroring
// lib/utils/format.ts. Kept literal so a species added there without a plural
// shows up here as a diff rather than passing vacuously.
const SPECIES: ReadonlyArray<{ token: string; labels: readonly string[] }> = [
  { token: "dog", labels: ["Perro", "Perros"] },
  { token: "cat", labels: ["Gato", "Gatos"] },
  { token: "rabbit", labels: ["Conejo", "Conejos"] },
  { token: "guinea_pig", labels: ["Cobayo", "Cobayos"] },
  { token: "ferret", labels: ["Hurón", "Hurones"] },
];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (![".ts", ".tsx"].includes(extname(full))) continue;
      // Tests legitimately spell out expected labels — that is their job.
      if (/\.(test|spec)\.tsx?$/.test(full)) continue;
      out.push(full);
    }
  };
  for (const dir of SCAN_DIRS) walk(join(ROOT, dir));
  return out;
}

/** Regexes for the three shapes a hand-rolled map takes in this codebase. */
function mapShapes(token: string, labels: readonly string[]): RegExp[] {
  const label = `(?:${labels.join("|")})`;
  return [
    // { dog: "Perro" } / { "dog": "Perro" }
    new RegExp(`["']?${token}["']?\\s*:\\s*["']${label}["']`),
    // s === "dog" ? "Perros" : …
    new RegExp(`===\\s*["']${token}["']\\s*\\?\\s*["']${label}["']`),
    // { value: "dog", label: "Perros" }
    new RegExp(`value\\s*:\\s*["']${token}["']\\s*,\\s*label\\s*:\\s*["']${label}["']`),
  ];
}

/** Every file that currently hand-rolls a species map, repo-relative. */
function findOffenders(): string[] {
  const offenders: string[] = [];
  for (const file of sourceFiles()) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (rel === DICTIONARY_FILE) continue;

    const source = readFileSync(file, "utf8");
    if (
      SPECIES.some(({ token, labels }) => mapShapes(token, labels).some((re) => re.test(source)))
    ) {
      offenders.push(rel);
    }
  }
  return offenders.sort();
}

const BASELINE: string[] = JSON.parse(
  readFileSync(join(ROOT, "scripts/species-dictionary-baseline.json"), "utf8"),
).files;

// Walked ONCE and shared: the scan reads every source file, so calling it per
// baseline entry turned a 500ms check into a timeout.
const OFFENDERS = findOffenders();

describe("species labels — a single dictionary", () => {
  it("adds no NEW hand-rolled species map", () => {
    const added = OFFENDERS.filter((f) => !BASELINE.includes(f));
    expect(
      added,
      `These files translate a species enum themselves instead of importing speciesLabel / speciesLabelPlural from lib/utils/format.ts:\n  ${added.join("\n  ")}\n\nAdd the wording to lib/utils/format.ts and import it. Do not add these to the baseline.`,
    ).toEqual([]);
  });

  it("keeps the baseline honest — a fixed file must be removed from it", () => {
    // The ratchet. Without this the baseline would quietly become a list of
    // files that USED to be wrong, and would stop meaning anything.
    const stale = BASELINE.filter((f) => !OFFENDERS.includes(f));
    expect(
      stale,
      `These files no longer hand-roll a species map. Delete them from scripts/species-dictionary-baseline.json:\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  it("is not vacuous — the shapes it looks for do match a hand-rolled map", () => {
    // Guards the fence itself: a typo in the regexes would make the scan above
    // pass by matching nothing, which reads exactly like "the codebase is clean".
    const planted = `const m = { dog: "Perro", cat: "Gato" };`;
    expect(mapShapes("dog", ["Perro", "Perros"]).some((re) => re.test(planted))).toBe(true);

    const ternary = `const s = x === "dog" ? "Perros" : "Gatos";`;
    expect(mapShapes("dog", ["Perro", "Perros"]).some((re) => re.test(ternary))).toBe(true);

    const option = `{ value: "dog", label: "Perros" }`;
    expect(mapShapes("dog", ["Perro", "Perros"]).some((re) => re.test(option))).toBe(true);
  });

  it("does not fire on ordinary Spanish copy that merely says Perro", () => {
    const copy = `const hint = "Perro, gato o la especie que corresponda.";`;
    expect(mapShapes("dog", ["Perro", "Perros"]).some((re) => re.test(copy))).toBe(false);
  });
});
