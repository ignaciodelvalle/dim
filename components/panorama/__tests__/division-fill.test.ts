// Unit tests for the locality-choropleth division-fill join (pure, no maplibre).

import { beforeEach, describe, expect, it } from "vitest";

import type { FeatureCollection, PanoramaFeature } from "@/src/modules/panorama/domain/types";
import {
  __resetDivisionJoinCache,
  divisionCodeForCell,
  divisionFillColorExpr,
  divisionSuppressedFilter,
  divisionValueBounds,
  filterDepartmentsByPrefix,
  joinCellsToDivisions,
  joinCellsToDivisionsMulti,
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

describe("joinCellsToDivisionsMulti — zoom-driven multi-province union", () => {
  const deptCodes = new Set(["06441", "06007"]);
  const barrioCodes = new Set(["palermo", "la boca"]);
  const levels = [
    { level: "department" as const, codes: deptCodes },
    { level: "barrio" as const, codes: barrioCodes },
  ];

  it("fills departamento AND barrio cells over one shared source", () => {
    const join = joinCellsToDivisionsMulti(
      fc([
        cell({ locality: "La Plata", departmentCode: "06441", value: 10, suppressed: false }),
        cell({ locality: "Palermo", value: 4, suppressed: false }),
      ]),
      levels,
    );
    expect(join.values.get("06441")).toBe(10);
    expect(join.values.get("palermo")).toBe(4);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("routes a cell matching NO level to the centroid-circle fallback", () => {
    const join = joinCellsToDivisionsMulti(
      fc([cell({ locality: "Nowhere", departmentCode: "99999", value: 3, suppressed: false })]),
      levels,
    );
    expect(join.values.size).toBe(0);
    expect(join.unmatched.features).toHaveLength(1);
  });

  it("keeps a matched-but-suppressed cell OUTLINE-only (k-anon preserved across levels)", () => {
    const join = joinCellsToDivisionsMulti(
      fc([cell({ locality: "La Boca", value: null, suppressed: true })]),
      levels,
    );
    expect(join.values.has("la boca")).toBe(false);
    expect(join.unmatched.features).toHaveLength(0);
  });

  it("is equivalent to the single-level join for a single level", () => {
    const cells = fc([cell({ locality: "Palermo", value: 7, suppressed: false })]);
    const single = joinCellsToDivisions(cells, "barrio", barrioCodes);
    const multi = joinCellsToDivisionsMulti(cells, [{ level: "barrio", codes: barrioCodes }]);
    expect(multi.values.get("palermo")).toBe(single.values.get("palermo"));
  });
});

describe("joinCellsToDivisionsMulti — memoization / referential stability", () => {
  const deptCodes = new Set(["06441"]);
  const barrioCodes = new Set(["palermo"]);
  const levels = [
    { level: "department" as const, codes: deptCodes },
    { level: "barrio" as const, codes: barrioCodes },
  ];

  beforeEach(() => {
    __resetDivisionJoinCache();
  });

  it("returns the SAME object reference for the same features + code Sets (no recompute)", () => {
    const cells = fc([cell({ locality: "Palermo", value: 4, suppressed: false })]);
    const first = joinCellsToDivisionsMulti(cells, levels);
    // A fresh `levels` array literal but the SAME code-Set instances — mirrors
    // syncLayers, which rebuilds the array each repaint from ref-held Sets.
    const second = joinCellsToDivisionsMulti(cells, [
      { level: "department", codes: deptCodes },
      { level: "barrio", codes: barrioCodes },
    ]);
    expect(second).toBe(first); // identity — the memo skipped the O(features) join.
  });

  it("recomputes (new object) when the features reference changes", () => {
    const a = joinCellsToDivisionsMulti(
      fc([cell({ locality: "Palermo", value: 4, suppressed: false })]),
      levels,
    );
    const b = joinCellsToDivisionsMulti(
      fc([cell({ locality: "Palermo", value: 4, suppressed: false })]),
      levels,
    );
    expect(b).not.toBe(a); // different FeatureCollection ref → cache miss.
  });

  it("recomputes when a code Set instance changes even if the members are equal", () => {
    const cells = fc([cell({ locality: "Palermo", value: 4, suppressed: false })]);
    const first = joinCellsToDivisionsMulti(cells, levels);
    // Same members, NEW Set instance → a different scope → must not alias.
    const second = joinCellsToDivisionsMulti(cells, [
      { level: "department", codes: new Set(["06441"]) },
      { level: "barrio", codes: new Set(["palermo"]) },
    ]);
    expect(second).not.toBe(first);
    expect(second.values.get("palermo")).toBe(4); // still correct after recompute.
  });
});

describe("k-anon suppressed hatch set (map-polish cursor #2)", () => {
  const barrioCodes = new Set(["palermo", "la boca", "recoleta"]);

  it("lists a division whose ONLY cell is suppressed (hatched, not no-data)", () => {
    const join = joinCellsToDivisions(
      fc([cell({ locality: "La Boca", value: null, suppressed: true })]),
      "barrio",
      barrioCodes,
    );
    // Never a number (k-anon logic untouched) AND flagged for the hatch.
    expect(join.values.has("la boca")).toBe(false);
    expect(join.suppressed.has("la boca")).toBe(true);
  });

  it("does NOT hatch a departamento that has a visible constituent (fill wins)", () => {
    const deptCodes = new Set(["06441"]);
    const join = joinCellsToDivisions(
      fc([
        cell({ locality: "La Plata", departmentCode: "06441", value: 10, suppressed: false }),
        cell({ locality: "Villa Elisa", departmentCode: "06441", value: null, suppressed: true }),
      ]),
      "department",
      deptCodes,
    );
    // The visible sum colors the cell; the suppressed constituent is omitted from
    // the sum (unchanged behavior) and the cell is NOT hatched.
    expect(join.values.get("06441")).toBe(10);
    expect(join.suppressed.has("06441")).toBe(false);
  });

  it("leaves a plain no-data division out of BOTH values and suppressed", () => {
    const join = joinCellsToDivisions(fc([]), "barrio", barrioCodes);
    expect(join.values.size).toBe(0);
    expect(join.suppressed.size).toBe(0);
  });
});

describe("divisionSuppressedFilter (map-polish cursor #2)", () => {
  it("is a constant-false filter for an empty set (hatch renders nothing)", () => {
    expect(divisionSuppressedFilter(new Set())).toBe(false);
  });

  it("matches the suppressed codes against the polygon `code` property", () => {
    const filter = divisionSuppressedFilter(new Set(["la boca", "palermo"])) as unknown[];
    expect(filter[0]).toBe("match");
    expect(filter[1]).toEqual(["get", "code"]);
    expect(filter[2]).toEqual(["la boca", "palermo"]);
    // labels → true, fallback → false (member vs non-member).
    expect(filter[3]).toBe(true);
    expect(filter[4]).toBe(false);
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

  it("locks the ramp to a domain override so two as-of frames share one scale", () => {
    // The scrub-lock passes a frozen live-edge domain. Two DIFFERENT frames
    // (values 10 vs 90) must interpolate over the SAME [0,100] domain, so a value
    // keeps its color across the scrub (no per-frame rebasing = no flicker).
    const domain = { min: 0, max: 100 };
    const frameA = divisionFillColorExpr(new Map([["palermo", 10]]), domain) as unknown[];
    const frameB = divisionFillColorExpr(new Map([["palermo", 90]]), domain) as unknown[];
    // expr = ["case", cond, transparent, ["interpolate",["linear"],match, lo,c0, hi,c1]]
    const interpA = frameA[3] as unknown[];
    const interpB = frameB[3] as unknown[];
    expect(interpA[3]).toBe(0); // lo
    expect(interpA[5]).toBe(100); // hi
    expect(interpB[3]).toBe(0);
    expect(interpB[5]).toBe(100);
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
