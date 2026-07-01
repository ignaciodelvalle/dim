// Unit tests for the U5 province-choropleth styling helpers (pure, no maplibre
// runtime, no DOM). These verify the data-driven fill-color expression colors
// the LOCAL polygons by joining on `code`, handles no-data + degenerate ranges,
// and that the legend bounds reflect the value range.

import { describe, expect, it } from "vitest";

import { COLOR_NO_DATA, RAMP_BLUE } from "@/lib/analytics/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

import { provinceColorExpr, provinceValueBounds } from "../province-choropleth-style";

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
  it("builds a case→match→interpolate expression keyed on the polygon `code`", () => {
    const expr = provinceColorExpr(
      provinceFC([
        { provinceCode: "AR-B", value: 61 },
        { provinceCode: "AR-X", value: 9 },
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
    // The interpolate path uses the tokenized RAMP_BLUE endpoints.
    const interp = expr[3] as unknown[];
    expect(interp[0]).toBe("interpolate");
    expect(interp).toContain(RAMP_BLUE[0]);
    expect(interp).toContain(RAMP_BLUE[1]);
  });

  it("paints everything neutral when there is no data", () => {
    expect(provinceColorExpr(provinceFC([]))).toBe(COLOR_NO_DATA);
  });

  it("widens a degenerate single-value range so interpolate has distinct stops", () => {
    const expr = provinceColorExpr(
      provinceFC([{ provinceCode: "AR-V", value: 4 }]),
    ) as unknown as unknown[];
    const interp = expr[3] as unknown[];
    // interpolate signature: ["interpolate", ["linear"], input, in0, out0, in1, out1]
    const lo = interp[3] as number;
    const hi = interp[5] as number;
    expect(hi).toBeGreaterThan(lo);
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
