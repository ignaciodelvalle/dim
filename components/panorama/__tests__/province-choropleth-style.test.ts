// Unit tests for the U5 province-choropleth styling helpers (pure, no maplibre
// runtime, no DOM). These verify the data-driven fill-color expression colors
// the LOCAL polygons by joining on `code`, handles no-data + degenerate ranges,
// and that the legend bounds reflect the value range.

import { describe, expect, it } from "vitest";

import { COLOR_NO_DATA, SCALE_BLUE_DARK_SEQ } from "@/lib/analytics/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import {
  provinceColorExpr,
  provinceSeqClassScale,
  provinceValueBounds,
} from "../province-choropleth-style";

/** Decode a MapLibre `["step", input, c0, t1, c1, t2, …]` into breaks + colors. */
function decodeStep(step: unknown[]): { breaks: number[]; colors: string[] } {
  const colors: string[] = [step[2] as string];
  const breaks: number[] = [];
  for (let i = 3; i < step.length; i += 2) {
    breaks.push(step[i] as number);
    colors.push(step[i + 1] as string);
  }
  return { breaks, colors };
}

// Build a province FeatureCollection (null geometry; the polygon is the basemap).
function provinceFC(cells: Array<{ provinceCode: string; value: number }>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      geometry: null,
      properties: { provinceCode: c.provinceCode, province: c.provinceCode, value: c.value },
    })),
  };
}

describe("provinceColorExpr", () => {
  it("builds a case→match→step (classed) expression keyed on the polygon `code`", () => {
    const expr = provinceColorExpr(
      provinceFC([
        { provinceCode: "AR-B", value: 61 },
        { provinceCode: "AR-X", value: 9 },
        { provinceCode: "AR-S", value: 22 },
        { provinceCode: "AR-C", value: 40 },
        { provinceCode: "AR-M", value: 77 },
      ]),
    ) as unknown as unknown[];

    // Top-level `case` with the no-data fallback path.
    expect(expr[0]).toBe("case");
    // The value lookup joins on the LOCAL polygon `code` property — NOT an
    // external provider, NOT the centroid. This is what colors the basemap.
    const valueMatch = (expr[1] as unknown[])[1] as unknown[];
    expect(valueMatch[0]).toBe("match");
    expect(valueMatch[1]).toEqual(["get", "code"]);
    // The match carries each province code → value pair.
    expect(valueMatch).toContain("AR-B");
    expect(valueMatch).toContain(61);
    expect(valueMatch).toContain("AR-X");
    expect(valueMatch).toContain(9);
    // The classed path is a MapLibre `step` over the dark-map ramp colors.
    const step = expr[3] as unknown[];
    expect(step[0]).toBe("step");
    // The base color (below the first break) is the ramp's low anchor; the
    // top class is the ramp's high anchor.
    expect(step[2]).toBe(SCALE_BLUE_DARK_SEQ[0]);
    expect(step).toContain(SCALE_BLUE_DARK_SEQ[SCALE_BLUE_DARK_SEQ.length - 1]);
  });

  it("paints everything neutral when there is no data", () => {
    expect(provinceColorExpr(provinceFC([]))).toBe(COLOR_NO_DATA);
  });

  it("collapses a degenerate single-value range to a flat class fill", () => {
    const expr = provinceColorExpr(
      provinceFC([{ provinceCode: "AR-V", value: 4 }]),
    ) as unknown as unknown[];
    // A single value has no ascending break → the classed path is a flat color
    // string (MapLibre `step` needs ≥ 1 threshold), not a step array.
    expect(typeof expr[3]).toBe("string");
    expect(SCALE_BLUE_DARK_SEQ).toContain(expr[3]);
  });
});

describe("provinceSeqClassScale — the lifted province legend scale (map/legend parity)", () => {
  const fc = provinceFC([
    { provinceCode: "AR-B", value: 10 },
    { provinceCode: "AR-X", value: 20 },
    { provinceCode: "AR-S", value: 30 },
    { provinceCode: "AR-C", value: 40 },
    { provinceCode: "AR-M", value: 50 },
  ]);

  it("returns null when there are no numeric values (fill paints all neutral)", () => {
    expect(provinceSeqClassScale(provinceFC([]))).toBeNull();
  });

  it("returns EXACTLY the breaks/colors the map fill's step expression renders (no divergence)", () => {
    const scale = provinceSeqClassScale(fc);
    expect(scale).not.toBeNull();
    const expr = provinceColorExpr(fc) as unknown as unknown[];
    const painted = decodeStep(expr[3] as unknown[]);
    // The off-canvas legend is built from `scale`; the map paints `painted`.
    // They MUST be identical — same values, same (absent) domain.
    expect(scale?.breaks).toEqual(painted.breaks);
    expect(scale?.colors).toEqual(painted.colors);
  });

  it("under a scrub-locked domain the legend scale tracks the LOCKED fill, not the live edge", () => {
    const locked = { min: 0, max: 100 };
    const legendScale = provinceSeqClassScale(fc, locked);
    const paintedLocked = decodeStep(
      (provinceColorExpr(fc, locked) as unknown as unknown[])[3] as unknown[],
    );
    // Parity holds WITH the lock: the legend swatch ranges equal the painted
    // class breaks for the SAME locked frame.
    expect(legendScale?.breaks).toEqual(paintedLocked.breaks);
    // Equal-interval over [0,100] → [20,40,60,80]; deterministic, frame-stable.
    expect(legendScale?.breaks).toEqual([20, 40, 60, 80]);
    // And the locked scale genuinely DIFFERS from the live-edge (quantile) scale
    // — so a legend that recomputed live-edge would mis-describe the scrubbed map.
    const liveScale = provinceSeqClassScale(fc);
    expect(liveScale?.breaks).not.toEqual(legendScale?.breaks);
  });
});

describe("provinceValueBounds", () => {
  it("returns the value min/max for the legend", () => {
    const bounds = provinceValueBounds(
      provinceFC([
        { provinceCode: "AR-B", value: 61 },
        { provinceCode: "AR-X", value: 9 },
        { provinceCode: "AR-S", value: 7 },
      ]),
    );
    expect(bounds).toEqual({ min: 7, max: 61 });
  });

  it("returns null when there are no numeric values", () => {
    expect(provinceValueBounds(provinceFC([]))).toBeNull();
  });
});
