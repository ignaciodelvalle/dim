// Unit tests for the U5 province-choropleth styling helpers (pure, no maplibre
// runtime, no DOM). These verify the data-driven fill-color expression colors
// the LOCAL polygons by joining on `code`, handles no-data + degenerate ranges,
// and that the legend bounds reflect the value range.

import { describe, expect, it } from "vitest";

import { COLOR_NO_DATA, SCALE_BLUE_SEQ } from "@/lib/analytics/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import { classSwatches } from "../class-scale";
import {
  provinceColorExpr,
  provinceMetaClassScale,
  provinceMetaColorExpr,
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
    expect(step[2]).toBe(SCALE_BLUE_SEQ[0]);
    expect(step).toContain(SCALE_BLUE_SEQ[SCALE_BLUE_SEQ.length - 1]);
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
    expect(SCALE_BLUE_SEQ).toContain(expr[3]);
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

  it("under scrub-frozen breaks the legend scale tracks the LOCKED fill, not the live edge", () => {
    // A scrub freezes the live-edge QUANTILE breaks (e.g. captured on an earlier
    // frame whose distribution differed) and reuses them verbatim.
    const frozen = [12, 24, 48, 96];
    const legendScale = provinceSeqClassScale(fc, frozen);
    const paintedLocked = decodeStep(
      (provinceColorExpr(fc, frozen) as unknown as unknown[])[3] as unknown[],
    );
    // Parity holds WITH the lock: the legend swatch ranges equal the painted
    // class breaks for the SAME frozen frame.
    expect(legendScale?.breaks).toEqual(paintedLocked.breaks);
    // The frozen breaks are painted verbatim (quantile, NOT equal-interval).
    expect(legendScale?.breaks).toEqual([12, 24, 48, 96]);
    // And the frozen scale genuinely DIFFERS from the live-edge scale — so a legend
    // that recomputed live-edge would mis-describe the scrubbed map.
    const liveScale = provinceSeqClassScale(fc);
    expect(liveScale?.breaks).not.toEqual(legendScale?.breaks);
  });
});

describe("provinceMetaColorExpr — META'd rate layers (PO: classed threshold scale, NOT divergent)", () => {
  const fc = provinceFC([
    { provinceCode: "AR-B", value: 34 }, // <40 → class 0
    { provinceCode: "AR-X", value: 55 }, // 40–60 → class 1
    { provinceCode: "AR-S", value: 72 }, // 60–80 → class 2
    { provinceCode: "AR-M", value: 88 }, // ≥80 (meta) → class 3
  ]);

  it("builds a case→match→step (classed) expression, NOT an interpolate (no continuous scale)", () => {
    const expr = provinceMetaColorExpr(fc, 80) as unknown as unknown[];
    expect(expr[0]).toBe("case");
    // The no-data short-circuit stays in front of the step (k-anon honesty).
    expect(expr[2]).toBe(COLOR_NO_DATA);
    const body = expr[3] as unknown[];
    expect(body[0]).toBe("step");
    // Must NOT be a continuous interpolation.
    expect(body[0]).not.toBe("interpolate");
    // Value lookup joins on the LOCAL polygon `code`.
    const valueMatch = (expr[1] as unknown[])[1] as unknown[];
    expect(valueMatch[0]).toBe("match");
    expect(valueMatch[1]).toEqual(["get", "code"]);
  });

  it("uses the META breaks [0.5T, 0.75T, T] — T=80 → [40, 60, 80]", () => {
    const { breaks, colors } = decodeStep(
      (provinceMetaColorExpr(fc, 80) as unknown as unknown[])[3] as unknown[],
    );
    expect(breaks).toEqual([40, 60, 80]);
    // 3 breaks → 4 classes; low anchor + high anchor of the dark ramp.
    expect(colors).toHaveLength(4);
    expect(colors[0]).toBe(SCALE_BLUE_SEQ[0]);
    expect(colors[colors.length - 1]).toBe(SCALE_BLUE_SEQ[SCALE_BLUE_SEQ.length - 1]);
  });

  it("uses the META breaks for a non-round target — T=70 → [35, 52.5, 70]", () => {
    const { breaks } = decodeStep(
      (provinceMetaColorExpr(fc, 70) as unknown as unknown[])[3] as unknown[],
    );
    expect(breaks).toEqual([35, 52.5, 70]);
  });

  it("returns a flat COLOR_NO_DATA when the feature collection is empty", () => {
    expect(provinceMetaColorExpr(provinceFC([]), 80)).toBe(COLOR_NO_DATA);
  });

  it("carries each province code → value pair in the match lookup", () => {
    const match = (provinceMetaColorExpr(fc, 80) as unknown as unknown[])[1] as unknown[];
    expect(match[0]).toBe("==");
    const valueMatch = match[1] as unknown[];
    expect(valueMatch[0]).toBe("match");
    expect(valueMatch[1]).toEqual(["get", "code"]);
    expect(valueMatch).toContain("AR-B");
    expect(valueMatch).toContain(34);
    expect(valueMatch).toContain("AR-M");
    expect(valueMatch).toContain(88);
  });
});

describe("provinceMetaClassScale — lifted legend scale (map/legend parity for META layers)", () => {
  const fc = provinceFC([
    { provinceCode: "AR-B", value: 34 },
    { provinceCode: "AR-M", value: 88 },
  ]);

  it("returns null when there are no numeric values", () => {
    expect(provinceMetaClassScale(provinceFC([]), 80)).toBeNull();
  });

  it("returns the META breaks [40, 60, 80] for T=80 (frame-stable, value-independent)", () => {
    const scale = provinceMetaClassScale(fc, 80);
    expect(scale?.method).toBe("meta");
    expect(scale?.breaks).toEqual([40, 60, 80]);
  });

  it("legend swatch ranges EXACTLY equal the painted step breaks (the DoD parity check)", () => {
    const scale = provinceMetaClassScale(fc, 80);
    expect(scale).not.toBeNull();
    // The off-canvas legend swatches are built from `scale`; the map paints the
    // step expression. Their break boundaries MUST be identical.
    const painted = decodeStep(
      (provinceMetaColorExpr(fc, 80) as unknown as unknown[])[3] as unknown[],
    );
    // Interior swatch boundaries (drop the open-below lo and open-above hi nulls).
    const swatchBreaks = classSwatches(scale as NonNullable<typeof scale>)
      .map((s) => s.hi)
      .filter((h): h is number => h !== null);
    expect(swatchBreaks).toEqual(painted.breaks);
    expect(swatchBreaks).toEqual([40, 60, 80]);
    // Colors line up class-for-class too.
    expect(scale?.colors).toEqual(painted.colors);
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
