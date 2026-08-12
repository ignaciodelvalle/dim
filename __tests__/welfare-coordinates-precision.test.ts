// Audience-precision plan (2026-06-19): welfare-report coordinates are shown at
// the minimum precision each audience needs.
//   - Public tracking receipt (/denuncias/codigo/[code]) — APPROXIMATE only
//     (Ley 25.326 minimisation). No exact decimals, no street address.
//   - Authority (/gob/maltrato/[id], /admin/moderacion/[id]) — EXACT, labelled
//     "uso oficial" (Ley 14.346), and every view is logged for accountability.
//
// These surfaces are server components; rather than render them, we assert the
// contract in source (same source-scan style as
// welfare-integration-banner-gating.test.ts). If a future edit re-introduces an
// exact public coordinate or drops the authority access log, this fails.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PUBLIC_RECEIPT = join(
  process.cwd(),
  "app",
  "(public)",
  "denuncias",
  "codigo",
  "[code]",
  "page.tsx",
);
const GOB_DETAIL = join(process.cwd(), "app", "gob", "maltrato", "[id]", "page.tsx");
const ADMIN_DETAIL = join(process.cwd(), "app", "admin", "moderacion", "[id]", "page.tsx");
// A3 (2026-07-31): the queue INSPECTOR is a third exact-coordinate surface and
// had no precision/audit test of its own. Unlike the two routes above, its
// render and its audit live in DIFFERENT files — the panel prints
// `toFixed(6)` while `logWelfareLocationViewed` fires in the detail LOADER. A
// coupling across a file boundary is exactly the kind that drifts silently, so
// both ends are pinned below.
const INSPECTOR_CONTENT = join(
  process.cwd(),
  "app",
  "gob",
  "maltrato",
  "_inspector",
  "WelfareInspectorContent.tsx",
);
const INSPECTOR_LOADER = join(process.cwd(), "lib", "infra", "welfare-inspector-detail.ts");

/** Read a source file with comments blanked out.
 *
 *  A source-scan assertion over RAW text is satisfied by prose: the loader below
 *  names `logWelfareLocationViewed` in a header comment, so a `toContain` on the
 *  raw file would stay green after the actual call was deleted. Blanking
 *  comments (line offsets preserved) makes the assertion about CODE. */
function readCode(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, before) => before + " ".repeat(m.length - before.length));
}

describe("public comprobante — approximate location only (Ley 25.326)", () => {
  // readCode, not readFileSync: this is the most sensitive surface in the file
  // (de-anonymisation of the reporter) and it was the one still scanning RAW
  // text — so `expect(src).toMatch(/coarsenPoint\([^)]*"approx"\)/)` was
  // satisfied by a COMMENT naming the call, even with the call itself deleted.
  // The helper right above exists precisely to prevent that and had been
  // applied to the inspector surfaces but not to this one (audit 2026-08-12).
  const src = readCode(PUBLIC_RECEIPT);

  it("never renders an exact coordinate (no toFixed(6))", () => {
    expect(src).not.toMatch(/toFixed\(6\)/);
  });

  it("coarsens the point to approximate before display", () => {
    expect(src).toMatch(/coarsenPoint\([^)]*"approx"\)/);
  });

  it("labels the map as approximate (no street-level pin implied)", () => {
    expect(src).toContain("Ubicación aproximada");
  });

  it("does not render the street-level locationAddress", () => {
    expect(src).not.toMatch(/report\.locationAddress/);
  });
});

describe("authority surfaces — exact location, labelled, and logged (Ley 14.346)", () => {
  it("gob detail keeps the exact coordinate, labels official use, and logs the view", () => {
    const src = readCode(GOB_DETAIL);
    // Exact precision preserved — do NOT degrade the investigative surface.
    expect(src).toMatch(/toFixed\(6\)/);
    expect(src).toContain("uso oficial (Ley 14.346)");
    expect(src).toContain("logWelfareLocationViewed");
  });

  it("admin moderation renders the EXACT point (un-coarsened), labels official use, and logs the view", () => {
    const src = readCode(ADMIN_DETAIL);
    // The map must receive the raw exact point — admin must NOT coarsen.
    expect(src).toMatch(/LocationMap lat=\{locationPoint\.lat\}/);
    expect(src).not.toMatch(/coarsenPoint/);
    expect(src).toContain("uso oficial (Ley 14.346)");
    expect(src).toContain("logWelfareLocationViewed");
  });

  it("the queue inspector shows the EXACT point and labels it official use", () => {
    const src = readCode(INSPECTOR_CONTENT);
    // Same investigative precision as the detail route — and never coarsened.
    expect(src).toMatch(/locationPoint\.lat\.toFixed\(6\)/);
    expect(src).toMatch(/locationPoint\.lng\.toFixed\(6\)/);
    expect(src).not.toMatch(/coarsenPoint/);
    expect(src).toContain("uso oficial (Ley 14.346)");
  });

  it("the inspector's exact-coordinate view is audited by its loader", () => {
    // The accountability half of the same disclosure. The inspector panel does
    // NOT log the view itself (grep it: no logWelfareLocationViewed there) —
    // the loader that feeds it does, on fetch. If that call is ever dropped, an
    // operator reads exact victim coordinates with no access trail, and the
    // render-side test above would still be green.
    const render = readCode(INSPECTOR_CONTENT);
    const loader = readCode(INSPECTOR_LOADER);
    expect(render).not.toContain("logWelfareLocationViewed");
    // The CALL, not the import and not the header comment that names it.
    expect(loader).toMatch(/await\s+logWelfareLocationViewed\(/);
  });
});
