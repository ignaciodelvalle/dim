// Unit tests for F5 divergent province-choropleth styling helpers.
//
// Pure: no maplibre runtime, no DOM, no network. Tests cover:
//   - divergentStops() from lib/viz-scales (the pure math helper)
//   - provinceDivergentColorExpr() from province-choropleth-style (the expression builder)
//
// Color-safety: asserts that below-target uses COLOR_DIVERGENT_BELOW (amber/orange)
// and above-target uses COLOR_DIVERGENT_ABOVE (teal/blue), confirming the scale
// is NOT red–green (colorblind constraint from viz-scales.ts §colorblind-comment).

import { describe, expect, it } from "vitest";

import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  divergentStops,
} from "@/lib/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import { provinceDivergentColorExpr } from "../province-choropleth-style";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// divergentStops (pure math) — lib/viz-scales
// ---------------------------------------------------------------------------

describe("divergentStops", () => {
  it("returns stops anchored at the target: below → BELOW pole, at → NEUTRAL, above → ABOVE pole", () => {
    const stops = divergentStops(80, 50, 100);
    // Must contain the target stop with the neutral color.
    const targetStop = stops.find(([v]) => v === 80);
    expect(targetStop, "target stop must exist").toBeDefined();
    expect(targetStop?.[1]).toBe(COLOR_DIVERGENT_NEUTRAL);

    // Below-target extreme (domainMin=50) must use the warning pole.
    const loStop = stops.find(([v]) => v === 50);
    expect(loStop, "lo stop must exist").toBeDefined();
    expect(loStop?.[1]).toBe(COLOR_DIVERGENT_BELOW);

    // Above-target extreme (domainMax=100) must use the good pole.
    const hiStop = stops.find(([v]) => v === 100);
    expect(hiStop, "hi stop must exist").toBeDefined();
    expect(hiStop?.[1]).toBe(COLOR_DIVERGENT_ABOVE);
  });

  it("does NOT use red (#cb181d, #ef4444, etc.) or green (#31a354, #006d2c, etc.) as poles", () => {
    const stops = divergentStops(80, 50, 100);
    const colors = stops.map(([, c]) => c.toLowerCase());
    // Red-family (common colorblind danger zone).
    for (const c of colors) {
      expect(c, `pole color ${c} looks like red`).not.toMatch(/^#(cb181d|ef4444|dc2626|e11d48)/);
    }
    // Green-family (the other half of the red-green confusion axis).
    for (const c of colors) {
      expect(c, `pole color ${c} looks like green`).not.toMatch(/^#(31a354|006d2c|22c55e|16a34a)/);
    }
  });

  it("always produces at least 2 stops so MapLibre interpolate has distinct anchors", () => {
    // Normal case.
    expect(divergentStops(80, 50, 100).length).toBeGreaterThanOrEqual(2);
    // Target at domainMin (all values meet/exceed target).
    expect(divergentStops(50, 50, 100).length).toBeGreaterThanOrEqual(2);
    // Target at domainMax (all values are below target).
    expect(divergentStops(100, 50, 100).length).toBeGreaterThanOrEqual(2);
  });

  it("handles degenerate range (domainMin === domainMax) without throwing", () => {
    const stops = divergentStops(80, 80, 80);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    // The stops must have distinct numeric values.
    const vals = stops.map(([v]) => v);
    expect(new Set(vals).size).toBeGreaterThan(1);
  });

  it("clamps target to [domainMin, domainMax] when target is outside the observed range", () => {
    // Target above domain (e.g. target=80 but all provinces are between 20–60).
    const stops = divergentStops(80, 20, 60);
    // Should not throw; stops are defined and ordered.
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const vals = stops.map(([v]) => v).sort((a, b) => a - b);
    // All values must fall within [lo-1, hi+1] (the widened domain).
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(19);
      expect(v).toBeLessThanOrEqual(61);
    }
  });

  it("stops are in ascending order (required by MapLibre interpolate)", () => {
    const cases: [number, number, number][] = [
      [80, 50, 100],
      [0, 0, 100],
      [100, 0, 100],
      [50, 50, 50],
      [80, 20, 60],
    ];
    for (const [target, lo, hi] of cases) {
      const stops = divergentStops(target, lo, hi);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// provinceDivergentColorExpr — province-choropleth-style
// ---------------------------------------------------------------------------

describe("provinceDivergentColorExpr", () => {
  const TARGET = 80;

  it("returns a case expression with noData guard and interpolate body", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([
        { provinceCode: "AR-B", value: 95 }, // above
        { provinceCode: "AR-X", value: 60 }, // below
      ]),
      TARGET,
    ) as unknown as unknown[];

    expect(expr[0]).toBe("case");
    // The no-data branch is the second-to-last element (fallback of the case).
    expect(expr[2]).toBe(COLOR_NO_DATA);
    // The interpolate branch.
    const interp = expr[3] as unknown[];
    expect(interp[0]).toBe("interpolate");
    expect(interp[1]).toEqual(["linear"]);
  });

  it("value lookup joins on the LOCAL polygon `code` property (not an external tile)", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([{ provinceCode: "AR-B", value: 95 }]),
      TARGET,
    ) as unknown as unknown[];

    // The case condition is ["==", valueMatch, -1]; valueMatch must use ["get","code"].
    const caseCondition = expr[1] as unknown[];
    const valueMatch = caseCondition[1] as unknown[];
    expect(valueMatch[0]).toBe("match");
    expect(valueMatch[1]).toEqual(["get", "code"]);
  });

  it("province codes and values appear in the match pairs", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([
        { provinceCode: "AR-B", value: 95 },
        { provinceCode: "AR-X", value: 60 },
      ]),
      TARGET,
    ) as unknown as unknown[];

    const caseCondition = expr[1] as unknown[];
    const valueMatch = caseCondition[1] as unknown[];
    expect(valueMatch).toContain("AR-B");
    expect(valueMatch).toContain(95);
    expect(valueMatch).toContain("AR-X");
    expect(valueMatch).toContain(60);
  });

  it("interpolate stops contain the BELOW and ABOVE pole colors (not red/green)", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([
        { provinceCode: "AR-B", value: 95 }, // above target
        { provinceCode: "AR-X", value: 60 }, // below target
      ]),
      TARGET,
    ) as unknown as unknown[];

    const interp = expr[3] as unknown[];
    const interpColors = interp.filter(
      (x): x is string => typeof x === "string" && x !== "interpolate" && x !== "linear",
    );

    // Must include the warning pole (below) and the good pole (above).
    expect(interpColors).toContain(COLOR_DIVERGENT_BELOW);
    expect(interpColors).toContain(COLOR_DIVERGENT_ABOVE);
  });

  it("maps no-data provinces to COLOR_NO_DATA (not a pole color)", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([{ provinceCode: "AR-B", value: 90 }]),
      TARGET,
    ) as unknown as unknown[];

    // The no-data fallback is at index 2 of the case expression.
    expect(expr[2]).toBe(COLOR_NO_DATA);
  });

  it("returns flat COLOR_NO_DATA when the feature collection is empty", () => {
    const expr = provinceDivergentColorExpr(provinceFC([]), TARGET);
    expect(expr).toBe(COLOR_NO_DATA);
  });

  it("handles a degenerate single-value range (all provinces at same value)", () => {
    const expr = provinceDivergentColorExpr(
      provinceFC([{ provinceCode: "AR-V", value: 80 }]), // exactly at target
      TARGET,
    ) as unknown as unknown[];
    // Must still produce a valid case expression (not throw).
    expect(expr[0]).toBe("case");
    // The interpolate must have distinct stops.
    const interp = expr[3] as unknown[];
    const vals = interp.filter((x): x is number => typeof x === "number");
    expect(new Set(vals).size).toBeGreaterThan(1);
  });

  it("accepts optional domainBounds override (e.g. to normalize across datasets)", () => {
    const fc = provinceFC([{ provinceCode: "AR-B", value: 90 }]);
    // Should not throw when explicit bounds are passed.
    expect(() => provinceDivergentColorExpr(fc, TARGET, { min: 0, max: 100 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Colorblind safety assertion — SCALE_DIVERGENT_COMPLIANCE
// ---------------------------------------------------------------------------

describe("SCALE_DIVERGENT_COMPLIANCE colorblind safety", () => {
  it("pole colors are blue/teal (good) and orange/amber (warning) — NOT red or green", () => {
    // Confirm the exported pole constants are within the expected hue families
    // by checking they are NOT the forbidden red/green hex values from CHART_COLORS.
    const forbiddenRed = ["#cb181d", "#ef4444", "#dc2626", "#e11d48"];
    const forbiddenGreen = ["#31a354", "#006d2c", "#22c55e", "#16a34a", "#74c476"];

    expect(forbiddenRed).not.toContain(COLOR_DIVERGENT_BELOW.toLowerCase());
    expect(forbiddenRed).not.toContain(COLOR_DIVERGENT_ABOVE.toLowerCase());
    expect(forbiddenGreen).not.toContain(COLOR_DIVERGENT_BELOW.toLowerCase());
    expect(forbiddenGreen).not.toContain(COLOR_DIVERGENT_ABOVE.toLowerCase());

    // Positive assertion: BELOW is amber-family (starts with #f or #d97 …).
    // COLOR_DIVERGENT_BELOW = "#f59e0b" (amber-400).
    expect(COLOR_DIVERGENT_BELOW.toLowerCase()).toMatch(/^#f[5-9][0-9a-f]/);
    // ABOVE is teal-family (COLOR_DIVERGENT_ABOVE = "#0d9488" teal-600).
    expect(COLOR_DIVERGENT_ABOVE.toLowerCase()).toMatch(/^#0[0-9a-f][5-9][0-9a-f]/);
  });
});
