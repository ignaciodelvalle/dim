// Unit tests — choropleth interpolate stop construction (QA round 2 #3).
//
// MapLibre rejects the entire fill-color expression when interpolate stops
// are not strictly ascending, killing the regions-fill layer on the
// panorama/vigilancia/analytics maps. These tests pin the guarantee for
// every degenerate data shape that can produce duplicate or invalid stops:
// all-equal values, a single region, empty data, NaN poisoning, and
// divergent targets outside the observed domain.

import { describe, expect, it } from "vitest";

import {
  choroplethColorStops,
  choroplethDomain,
  sanitizeStops,
} from "@/components/charts/choropleth-stops";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_NEUTRAL,
  RAMP_BLUE,
} from "@/lib/analytics/viz-scales";

/** Assert the MapLibre invariant: stop inputs strictly ascend. */
function expectStrictlyAscending(stops: Array<[number, string]>): void {
  expect(stops.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < stops.length; i++) {
    expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
  }
  for (const [value, color] of stops) {
    expect(Number.isFinite(value)).toBe(true);
    expect(typeof color).toBe("string");
  }
}

describe("choroplethDomain", () => {
  it("widens a uniform domain (every region same value — the QA repro)", () => {
    expect(choroplethDomain([7, 7, 7, 7])).toEqual({ minVal: 7, maxVal: 8 });
  });

  it("widens a single-value domain", () => {
    expect(choroplethDomain([3])).toEqual({ minVal: 3, maxVal: 4 });
  });

  it("falls back to [0, 1] on empty data", () => {
    expect(choroplethDomain([])).toEqual({ minVal: 0, maxVal: 1 });
  });

  it("ignores NaN and Infinity instead of poisoning min/max", () => {
    expect(choroplethDomain([Number.NaN, 2, 5, Number.POSITIVE_INFINITY])).toEqual({
      minVal: 2,
      maxVal: 5,
    });
  });

  it("falls back when every value is non-finite", () => {
    expect(choroplethDomain([Number.NaN, Number.NaN])).toEqual({ minVal: 0, maxVal: 1 });
  });

  it("passes a healthy domain through untouched", () => {
    expect(choroplethDomain([10, 40, 25])).toEqual({ minVal: 10, maxVal: 40 });
  });
});

describe("choroplethColorStops — sequential", () => {
  it("builds ascending stops for a healthy domain", () => {
    const stops = choroplethColorStops({
      domain: { minVal: 0, maxVal: 100 },
      colorScale: RAMP_BLUE,
    });
    expect(stops).toEqual([
      [0, RAMP_BLUE[0]],
      [100, RAMP_BLUE[1]],
    ]);
  });

  it("stays ascending on a widened uniform domain", () => {
    const stops = choroplethColorStops({
      domain: choroplethDomain([12, 12, 12]),
      colorScale: RAMP_BLUE,
    });
    expectStrictlyAscending(stops);
  });
});

describe("choroplethColorStops — divergent", () => {
  it("anchors at a target inside the domain, strictly ascending", () => {
    const stops = choroplethColorStops({
      domain: { minVal: 20, maxVal: 95 },
      colorScale: RAMP_BLUE,
      scaleMode: "divergent",
      target: 80,
    });
    expectStrictlyAscending(stops);
    expect(stops.map(([v]) => v)).toEqual([20, 80, 95]);
    expect(stops[1][1]).toBe(COLOR_DIVERGENT_NEUTRAL);
  });

  it("stays ascending when every region sits AT the target (single bucket)", () => {
    const domain = choroplethDomain([80, 80, 80]);
    const stops = choroplethColorStops({
      domain,
      colorScale: RAMP_BLUE,
      scaleMode: "divergent",
      target: 80,
    });
    expectStrictlyAscending(stops);
  });

  it("stays ascending when the target falls outside the domain (clamped)", () => {
    for (const target of [0, 100]) {
      const stops = choroplethColorStops({
        domain: { minVal: 30, maxVal: 60 },
        colorScale: RAMP_BLUE,
        scaleMode: "divergent",
        target,
      });
      expectStrictlyAscending(stops);
    }
  });

  it("falls back to sequential when target is missing or non-finite", () => {
    for (const target of [undefined, Number.NaN]) {
      const stops = choroplethColorStops({
        domain: { minVal: 1, maxVal: 9 },
        colorScale: RAMP_BLUE,
        scaleMode: "divergent",
        target,
      });
      expect(stops).toEqual([
        [1, RAMP_BLUE[0]],
        [9, RAMP_BLUE[1]],
      ]);
    }
  });
});

describe("sanitizeStops", () => {
  it("sorts out-of-order stops", () => {
    const stops = sanitizeStops(
      [
        [50, "#b"],
        [10, "#a"],
      ],
      RAMP_BLUE,
    );
    expect(stops.map(([v]) => v)).toEqual([10, 50]);
    expectStrictlyAscending(stops);
  });

  it("dedupes equal inputs (first occurrence wins)", () => {
    const stops = sanitizeStops(
      [
        [10, "#a"],
        [10, "#b"],
        [20, "#c"],
      ],
      RAMP_BLUE,
    );
    expect(stops).toEqual([
      [10, "#a"],
      [20, "#c"],
    ]);
  });

  it("drops non-finite inputs and synthesizes a second stop if needed", () => {
    const stops = sanitizeStops([[Number.NaN, "#a"], [5, "#b"]], RAMP_BLUE);
    expect(stops).toEqual([
      [5, "#b"],
      [6, RAMP_BLUE[1]],
    ]);
  });

  it("returns the fallback ramp when every stop is invalid", () => {
    const stops = sanitizeStops([[Number.NaN, "#a"]], RAMP_BLUE);
    expect(stops).toEqual([
      [0, RAMP_BLUE[0]],
      [1, RAMP_BLUE[1]],
    ]);
    expectStrictlyAscending(stops);
  });

  it("guarantees >= 2 ascending stops with COLOR_DIVERGENT_ABOVE-style 3-stop input", () => {
    const stops = sanitizeStops(
      [
        [0, "#below"],
        [80, COLOR_DIVERGENT_NEUTRAL],
        [100, COLOR_DIVERGENT_ABOVE],
      ],
      RAMP_BLUE,
    );
    expectStrictlyAscending(stops);
    expect(stops).toHaveLength(3);
  });
});
