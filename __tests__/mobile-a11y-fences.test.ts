// Mobile a11y fences (C3, 2026-09-01) — the three rules a phone build keeps.
//
// Same instrument as mobile-screen-titles.test.ts: a root vitest fence that
// SCANS apps/mobile source, so it runs inside test:verified without touching
// pnpm verify's fence count. What it holds:
//
//   1. EVERY `<Pressable` NAMES ITS ROLE. A Pressable with no
//      `accessibilityRole` is a control TalkBack announces as nothing — the
//      tap works and the person navigating by screen reader never finds it.
//      Checked PER BLOCK (opening tag scan), not per file: a file with two
//      pressables and one role passes a per-file count and still ships an
//      unnamed control.
//   2. EVERY PRESSABLE FILE MINDS THE 44dp TARGET. A file that renders a
//      `<Pressable` must reference `TOUCH_TARGET` or `hitSlop` at least
//      once. Deliberately file-grained — static analysis cannot resolve
//      which style object lands on which control — so this catches the
//      CLASS (a new interactive surface built with no target discipline;
//      PhoneRow shipped exactly that way the morning this fence was
//      written) and the per-control truth stays with the screen tests.
//   3. THE EMPTY-STATE PRIMITIVE CANNOT QUIETLY DIE. The web's fence scans
//      for bare "Sin resultados" literals; that shape does NOT transfer —
//      mobile empty copy lives in view-models, not JSX. What is fenceable
//      is the primitive's adoption: `EmptyState` (src/ui/components.tsx)
//      must keep at least its current number of consumer files. A refactor
//      that inlines dead-end `<Body>` empties would walk this number down
//      and go red; per-screen render tests hold the copy itself.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MOBILE_SRC = resolve(__dirname, "../apps/mobile/src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(MOBILE_SRC).map((full) => ({
  rel: relative(resolve(__dirname, ".."), full).replaceAll("\\", "/"),
  content: readFileSync(full, "utf-8"),
}));

/**
 * Every `<Pressable` opening tag in `content`, as raw text. The tag ends at
 * the first `>` that sits outside JSX-expression braces — the same
 * brace-depth walk check-empty-state-consistency.ts uses.
 */
function pressableOpenings(content: string): string[] {
  const openings: string[] = [];
  const re = /<Pressable\b/g;
  let match = re.exec(content);
  while (match !== null) {
    let i = match.index;
    let depth = 0;
    while (i < content.length) {
      const ch = content[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
      i += 1;
    }
    openings.push(content.slice(match.index, i + 1));
    match = re.exec(content);
  }
  return openings;
}

const pressableFiles = files
  .map((f) => ({ ...f, openings: pressableOpenings(f.content) }))
  .filter((f) => f.openings.length > 0);

describe("mobile a11y fences (C3)", () => {
  it("NON-VACUITY: the scan sees the codebase it claims to fence", () => {
    // 92 source files and 18 pressable files existed the day this was
    // written; a scan that finds far fewer is reading the wrong tree, not
    // fencing a smaller app.
    expect(files.length).toBeGreaterThan(80);
    expect(pressableFiles.length).toBeGreaterThanOrEqual(15);
  });

  it("every <Pressable> names its accessibilityRole — per BLOCK, not per file", () => {
    const unnamed: string[] = [];
    for (const f of pressableFiles) {
      for (const opening of f.openings) {
        if (!opening.includes("accessibilityRole")) {
          unnamed.push(`${f.rel}: ${opening.split("\n")[0]}…`);
        }
      }
    }
    expect(
      unnamed,
      `Pressables with no accessibilityRole — TalkBack announces these as nothing:\n${unnamed.join("\n")}`,
    ).toEqual([]);
  });

  it("every file that renders a <Pressable> references TOUCH_TARGET or hitSlop", () => {
    const undisciplined = pressableFiles
      .filter((f) => !f.content.includes("TOUCH_TARGET") && !f.content.includes("hitSlop"))
      .map((f) => f.rel);
    expect(
      undisciplined,
      `Pressable files with no touch-target discipline (44dp, theme.ts TOUCH_TARGET):\n${undisciplined.join("\n")}`,
    ).toEqual([]);
  });

  it("EmptyState keeps its consumers — the primitive cannot quietly die", () => {
    const consumers = files.filter(
      (f) => !f.rel.endsWith("ui/components.tsx") && /\bEmptyState\b/.test(f.content),
    );
    // 4 consumer files when written (adoption catalogue, buscar turno,
    // reservar turno, owner face). Raise this floor when adoption grows;
    // never lower it to make a red go away — that red IS the finding.
    expect(consumers.length).toBeGreaterThanOrEqual(4);
  });
});
