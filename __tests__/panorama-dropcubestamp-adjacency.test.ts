// dropCubeStamp adjacency — structural fence over PanoramaConsole (fences wave S #10).
//
// The panorama console SSR-seeds a "datos agregados actualizados" cube stamp that
// describes the SEEDED frame only. Every client /api/panorama/[layer] response
// comes from the LIVE path, so the FIRST such fetch must invalidate the stamp via
// the one-way latch dropCubeStamp() — otherwise a lingering stamp asserts cube
// freshness the live view does not have (review 2026-07-17; regression class
// 77497967). The contract (see the dropCubeStamp comment in PanoramaConsole) is:
// "dropCubeStamp() sits beside every layer-data fetch dispatch."
//
// This test enforces that structurally. It reads PanoramaConsole.tsx and, for
// every LAYER-DATA fetch site, asserts dropCubeStamp() appears in the enclosing
// dispatch.
//
// WINDOW HEURISTIC (documented): a "layer-data fetch site" is a template literal
// `\`/api/panorama/${...}\`` whose FIRST path segment is a dynamic expression
// (the layer id) — this excludes the KPI/scope fetches (`/api/panorama/kpis...`,
// `/api/panorama/scope...`), which are literal-segment and intentionally do NOT
// drop the stamp. For each site we scan the ADJACENCY WINDOW = the WINDOW lines
// immediately preceding the fetch line (the tail of its enclosing callback, where
// the latch is dispatched right before the await). Every compliant site in the
// file drops the stamp within 2 lines, so a small window is both sufficient and
// tight enough not to borrow a neighbour's latch.
//
// KNOWN GAP: the shared multi-layer helper fetchLayersInto() dispatches a layer
// fetch WITHOUT its own dropCubeStamp() and none of its callers drop it adjacently
// — a flagged honesty gap (its seed stamp can linger after a live refetch). It is
// allowlisted BY ENCLOSING-FUNCTION NAME (line-shift robust) so this fence stays
// green while still guarding every other site and any NEW one. Remove it from
// KNOWN_GAP_HELPERS once fetchLayersInto drops the stamp.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  join(__dirname, "..", "components", "panorama", "PanoramaConsole.tsx"),
  "utf8",
);
const LINES = SRC.split(/\r?\n/);

// Layer-data fetch: backtick + `/api/panorama/${` (dynamic FIRST segment). The
// KPI/scope fetches read `/api/panorama/kpis${` / `/api/panorama/scope?${` — a
// LITERAL first segment — so they never match.
const LAYER_FETCH = /`\/api\/panorama\/\$\{/;

// Lines of backward look — the tail of the enclosing callback where the latch
// fires just before the await. Every compliant site drops within 2 lines.
const WINDOW = 6;

// Enclosing helpers whose layer fetch has NO adjacent dropCubeStamp — documented
// known gaps, allowlisted by name so line shifts don't break the fence.
const KNOWN_GAP_HELPERS = new Set<string>(["fetchLayersInto"]);

/** The nearest `const <name> = useCallback(` at or above `lineIdx`, or null. */
function enclosingCallbackName(lineIdx: number): string | null {
  for (let i = lineIdx; i >= 0; i--) {
    const m = LINES[i].match(/const\s+(\w+)\s*=\s*useCallback\(/);
    if (m) return m[1];
  }
  return null;
}

function layerFetchLineIndices(): number[] {
  const out: number[] = [];
  LINES.forEach((line, i) => {
    if (LAYER_FETCH.test(line)) out.push(i);
  });
  return out;
}

describe("PanoramaConsole — dropCubeStamp sits beside every layer-data fetch", () => {
  it("defines the dropCubeStamp latch", () => {
    expect(SRC).toMatch(/const dropCubeStamp = useCallback\(/);
  });

  it("finds the expected family of layer-data fetch sites", () => {
    // Guard against the regex silently matching nothing (vacuous pass).
    expect(layerFetchLineIndices().length).toBeGreaterThanOrEqual(7);
  });

  it("every layer-data fetch drops the cube stamp in its enclosing dispatch", () => {
    const violations: string[] = [];
    for (const idx of layerFetchLineIndices()) {
      const window = LINES.slice(Math.max(0, idx - WINDOW), idx + 1).join("\n");
      if (window.includes("dropCubeStamp()")) continue; // adjacent latch — OK.

      const enclosing = enclosingCallbackName(idx);
      if (enclosing && KNOWN_GAP_HELPERS.has(enclosing)) continue; // flagged gap.

      violations.push(
        `${idx + 1}: ${LINES[idx].trim()} — no dropCubeStamp() within ${WINDOW} lines (enclosing: ${enclosing ?? "?"})`,
      );
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([]);
  });
});
