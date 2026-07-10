import { describe, expect, it } from "vitest";

import {
  BUBBLE_R_MAX,
  BUBBLE_R_MIN,
  bubbleRadius,
  buildGraduatedScale,
  graduatedMaxCount,
  graduatedSampleValues,
} from "@/components/panorama/graduated-scale";

describe("bubbleRadius — area-proportional (#7)", () => {
  it("floors non-positive or empty inputs at BUBBLE_R_MIN", () => {
    expect(bubbleRadius(0, 100)).toBe(BUBBLE_R_MIN);
    expect(bubbleRadius(10, 0)).toBe(BUBBLE_R_MIN);
    expect(bubbleRadius(-5, 100)).toBe(BUBBLE_R_MIN);
  });

  it("caps the observed maximum at BUBBLE_R_MAX", () => {
    expect(bubbleRadius(100, 100)).toBeCloseTo(BUBBLE_R_MAX);
    // A value above the max is clamped (never exceeds the cap).
    expect(bubbleRadius(200, 100)).toBeCloseTo(BUBBLE_R_MAX);
  });

  it("scales AREA (not radius) with value: 4x value ⇒ ~2x radius delta", () => {
    const max = 100;
    // Radius delta above the floor must grow as sqrt(value): quadrupling the
    // value doubles the delta, so AREA (∝ r²) quadruples — the honest encoding.
    const d1 = bubbleRadius(25, max) - BUBBLE_R_MIN;
    const d4 = bubbleRadius(100, max) - BUBBLE_R_MIN;
    expect(d4 / d1).toBeCloseTo(2, 5);
  });
});

describe("graduatedSampleValues — data-driven bins (#6)", () => {
  it("reflects a genuinely tiny range as individual integers (1..4)", () => {
    // The real defect: per-locality signals run 1–4 but the legend advertised
    // 1–9 / 10–49 / … / 500+. A tiny max must yield a tiny, honest legend.
    expect(graduatedSampleValues(4)).toEqual([1, 2, 3, 4]);
    expect(graduatedSampleValues(1)).toEqual([1]);
  });

  it("uses nice-rounded breakpoints for larger ranges and ends at the observed max", () => {
    const s = graduatedSampleValues(340);
    expect(s[0]).toBe(1);
    expect(s[s.length - 1]).toBe(340); // exact observed max, never a rounded 500+
    // Ascending and distinct.
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("returns nothing for an empty range", () => {
    expect(graduatedSampleValues(0)).toEqual([]);
  });
});

describe("buildGraduatedScale", () => {
  it("produces ≥2 strictly-ascending interpolate stops for a tiny range", () => {
    const scale = buildGraduatedScale(4);
    expect(scale.maxValue).toBe(4);
    expect(scale.bins.map((b) => b.value)).toEqual([1, 2, 3, 4]);
    expect(scale.radiusStops.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < scale.radiusStops.length; i++) {
      expect(scale.radiusStops[i][0]).toBeGreaterThan(scale.radiusStops[i - 1][0]);
    }
    // The map's biggest bubble equals the legend's biggest bubble for max value.
    const topBin = scale.bins[scale.bins.length - 1];
    expect(topBin.r).toBeCloseTo(BUBBLE_R_MAX);
  });

  it("degrades to an empty legend (no bins) when there is no data", () => {
    const scale = buildGraduatedScale(0);
    expect(scale.bins).toEqual([]);
    expect(scale.radiusStops.length).toBeGreaterThanOrEqual(1);
  });
});

describe("graduatedMaxCount", () => {
  it("scans the observed max across collections, ignoring suppressed (null)", () => {
    const fc = {
      features: [
        { properties: { count: 3 } },
        { properties: { count: null } },
        { properties: { count: 7 } },
        { properties: null },
      ],
    };
    expect(graduatedMaxCount([fc])).toBe(7);
  });

  it("returns 0 when no positive count exists", () => {
    expect(graduatedMaxCount([{ features: [{ properties: { count: null } }] }])).toBe(0);
    expect(graduatedMaxCount([])).toBe(0);
  });
});
