// Unit tests for the locality-choropleth division-fill join (pure, no maplibre).

import { describe, expect, it } from "vitest";

import type { FeatureCollection, PanoramaFeature } from "@/src/modules/panorama/domain/types";
import {
  divisionCodeForCell,
  divisionFillColorExpr,
  divisionValueBounds,
  filterDepartmentsByPrefix,
  joinCellsToDivisions,
} from "../division-fill";

// A locality choropleth cell as a Point feature (the shape buildChoroplethFeatures emits).
function cell(props: Record<string, unknown>): PanoramaFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-58.4, -34.6] },
    properties: props,
  };
}
function fc(features: PanoramaFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("divisionCodeForCell", () => {
  it("derives the CABA barrio slug from the locality name (shared normalizer)", () => {
    expect(divisionCodeForCell({ locality: "Palermo" }, "barrio")).toBe("palermo");
    expect(divisionCodeForCell({ locality: "La Boca" }, "barrio")).toBe("la boca");
    expect(divisionCodeForCell({ locality: "Vélez Sársfield" }, "barrio")).toBe("velez sarsfield");
  });

  it("returns null for a barrio cell with no locality name", () => {
    expect(divisionCodeForCell({}, "barrio")).toBeNull();
  });

  it("zero-pads the department code for the departamento join", () => {
    expect(divisionCodeForCell({ departmentCode: "06441" }, "department")).toBe("06441");
    expect(divisionCodeForCell({ departmentCode: "6441" }, "department")).toBe("06441");
  });

  it("returns null for a department cell with no department code", () => {
    expect(divisionCodeForCell({ departmentCode: null }, "department")).toBeNull();
    expect(divisionCodeForCell({}, "department")).toBeNull();
  });
});

describe("joinCellsToDivisions — CABA barrios", () => {
  const codes = new Set(["palermo", "la boca", "recoleta"]);

  it("fills a barrio from its matching locality cell; nothing unmatched", () => {
    const join = joinCellsToDivisions(
      fc([cell({ locality: "Palermo", value: 12, suppressed: false })]),
      "barrio",
      codes,
    );
    expect(join.values.get("palermo")).toBe(12);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("keeps a suppressed matched barrio OUTLINE-only (no fill, no circle)", () => {
    const join = joinCellsToDivisions(
      fc([cell({ locality: "La Boca", value: null, suppressed: true })]),
      "barrio",
      codes,
    );
    expect(join.values.has("la boca")).toBe(false);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("falls back to the centroid circle for a locality with no polygon match", () => {
    const join = joinCellsToDivisions(
      fc([cell({ locality: "Barrio Inexistente", value: 4, suppressed: false })]),
      "barrio",
      codes,
    );
    expect(join.values.size).toBe(0);
    expect(join.unmatched.features).toHaveLength(1);
  });
});

describe("joinCellsToDivisions — departamento roll-up", () => {
  const codes = new Set(["06441", "06007"]);

  it("sums several localities into their shared departamento", () => {
    const join = joinCellsToDivisions(
      fc([
        cell({ locality: "La Plata", departmentCode: "06441", value: 10, suppressed: false }),
        cell({ locality: "City Bell", departmentCode: "06441", value: 5, suppressed: false }),
      ]),
      "department",
      codes,
    );
    expect(join.values.get("06441")).toBe(15);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("omits suppressed constituents from the departamento fill (k-anon conservative)", () => {
    const join = joinCellsToDivisions(
      fc([
        cell({ locality: "La Plata", departmentCode: "06441", value: 10, suppressed: false }),
        cell({ locality: "Villa Elisa", departmentCode: "06441", value: null, suppressed: true }),
      ]),
      "department",
      codes,
    );
    // Only the visible locality contributes; the suppressed one adds nothing.
    expect(join.values.get("06441")).toBe(10);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("routes a cell with no department code to the centroid-circle fallback", () => {
    const join = joinCellsToDivisions(
      fc([cell({ locality: "Sin depto", departmentCode: null, value: 7, suppressed: false })]),
      "department",
      codes,
    );
    expect(join.values.size).toBe(0);
    expect(join.unmatched.features).toHaveLength(1);
  });
});

describe("divisionFillColorExpr", () => {
  it("is a flat transparent fill when there are no values (outline only)", () => {
    expect(divisionFillColorExpr(new Map())).toBe("rgba(0,0,0,0)");
  });

  it("builds a case/match/interpolate expression when values exist", () => {
    const expr = divisionFillColorExpr(new Map([["palermo", 3]])) as unknown[];
    expect(Array.isArray(expr)).toBe(true);
    expect(expr[0]).toBe("case");
  });
});

describe("divisionValueBounds", () => {
  it("returns min/max over the values", () => {
    expect(
      divisionValueBounds(
        new Map([
          ["a", 2],
          ["b", 9],
        ]),
      ),
    ).toEqual({ min: 2, max: 9 });
  });
  it("returns null when empty", () => {
    expect(divisionValueBounds(new Map())).toBeNull();
  });
});

describe("filterDepartmentsByPrefix", () => {
  it("keeps only departamentos whose INDEC code starts with the province prefix", () => {
    const filtered = filterDepartmentsByPrefix(
      {
        features: [
          { properties: { code: "06007" } },
          { properties: { code: "06441" } },
          { properties: { code: "14056" } },
          { properties: null },
        ],
      },
      "06",
    );
    expect(filtered).toHaveLength(2);
  });
});
