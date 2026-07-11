// Unit tests for the threshold-classed choropleth scale helpers (pure — no
// maplibre runtime, no DOM). Verifies meta / quantile / equal-interval break
// policies, color assignment off the dark ramp, and the step-expression + legend
// swatch builders stay in sync.

import { describe, expect, it } from "vitest";

import { SCALE_BLUE_DARK_SEQ } from "@/lib/analytics/viz-scales";
import {
  CLASS_COUNT,
  classColors,
  classSwatches,
  computeClassScale,
  stepColorExpr,
} from "../class-scale";

describe("classColors", () => {
  it("returns the full ramp for n === CLASS_COUNT (5)", () => {
    expect(classColors(5)).toEqual([...SCALE_BLUE_DARK_SEQ]);
  });

  it("keeps both poles for 4 classes (drops a mid stop)", () => {
    const c = classColors(4);
    expect(c).toHaveLength(4);
    expect(c[0]).toBe(SCALE_BLUE_DARK_SEQ[0]);
    expect(c[3]).toBe(SCALE_BLUE_DARK_SEQ[4]);
  });

  it("returns a single mid-ramp color for n === 1 (flat class)", () => {
    expect(classColors(1)).toEqual([SCALE_BLUE_DARK_SEQ[2]]);
  });
});

describe("computeClassScale — meta policy", () => {
  it("cuts at half / three-quarters / the meta (80 → 40,60,80)", () => {
    const scale = computeClassScale([34, 50, 65, 72, 81], { target: 80 });
    expect(scale.method).toBe("meta");
    expect(scale.breaks).toEqual([40, 60, 80]);
    // 3 breaks → 4 classes → 4 colors.
    expect(scale.colors).toHaveLength(4);
  });
});

describe("computeClassScale — quantile policy", () => {
  it("produces CLASS_COUNT-1 ascending breaks for a spread value set", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const scale = computeClassScale(values);
    expect(scale.method).toBe("quantile");
    expect(scale.breaks).toHaveLength(CLASS_COUNT - 1);
    // Strictly ascending (MapLibre `step` requires it).
    for (let i = 1; i < scale.breaks.length; i++) {
      expect(scale.breaks[i]).toBeGreaterThan(scale.breaks[i - 1]);
    }
    expect(scale.colors).toHaveLength(scale.breaks.length + 1);
  });

  it("falls back to equal-interval when there are fewer units than classes", () => {
    const scale = computeClassScale([0, 100]);
    expect(scale.method).toBe("interval");
    expect(scale.breaks[0]).toBeGreaterThan(0);
    expect(scale.breaks[scale.breaks.length - 1]).toBeLessThan(100);
  });

  it("collapses an all-equal value set to a flat class", () => {
    const scale = computeClassScale([7, 7, 7, 7, 7, 7]);
    expect(scale.method).toBe("flat");
    expect(scale.breaks).toEqual([]);
    expect(scale.colors).toHaveLength(1);
  });
});

describe("computeClassScale — locked domain (scrub scale-lock)", () => {
  it("uses deterministic equal-interval breaks over the frozen domain", () => {
    const a = computeClassScale([5], { lockedDomain: { min: 0, max: 100 } });
    const b = computeClassScale([95], { lockedDomain: { min: 0, max: 100 } });
    expect(a.method).toBe("interval");
    expect(a.breaks).toEqual([20, 40, 60, 80]);
    // Frame-stable: same breaks regardless of the frame's own values.
    expect(b.breaks).toEqual(a.breaks);
  });

  it("locked domain wins over a meta target", () => {
    const scale = computeClassScale([50], {
      target: 80,
      lockedDomain: { min: 0, max: 100 },
    });
    expect(scale.method).toBe("interval");
  });
});

describe("stepColorExpr", () => {
  it("builds a MapLibre step with color0 + (threshold,color) pairs", () => {
    const scale = computeClassScale([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const expr = stepColorExpr(["get", "value"], scale) as unknown[];
    expect(expr[0]).toBe("step");
    expect(expr[1]).toEqual(["get", "value"]);
    expect(expr[2]).toBe(scale.colors[0]);
    // (threshold, color) pairs follow the base color.
    expect(expr).toHaveLength(3 + scale.breaks.length * 2);
  });

  it("returns a flat color string for a break-less (flat) scale", () => {
    const scale = computeClassScale([7, 7, 7, 7, 7, 7]);
    expect(stepColorExpr(["get", "value"], scale)).toBe(scale.colors[0]);
  });
});

describe("classSwatches", () => {
  it("expands a scale into open-below … open-above class ranges", () => {
    const scale = computeClassScale([34, 50, 65, 72, 81], { target: 80 });
    const rows = classSwatches(scale);
    expect(rows).toHaveLength(scale.colors.length);
    expect(rows[0].lo).toBeNull(); // first class is open below
    expect(rows[0].hi).toBe(40);
    expect(rows[rows.length - 1].hi).toBeNull(); // last class is open above
    expect(rows[rows.length - 1].lo).toBe(80);
  });
});
