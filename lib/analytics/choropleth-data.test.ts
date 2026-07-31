// Pure unit tests for the shared province-choropleth data shaping (task #31c
// dedup). One describe block per extracted function, each covering the two
// call sites it replaces.

import { describe, expect, it } from "vitest";
import {
  aggregateChoroplethData,
  scopedChoroplethProps,
  toChoroplethData,
} from "./choropleth-data";
import { PROVINCE_ISO_MAP } from "./govt-dashboards";
import type { SubregionCaseCount } from "./subregion-redaction";

describe("toChoroplethData", () => {
  it("maps one row per province like /gob/poblacion (ratePct value)", () => {
    const byProvince = [
      { province: "Buenos Aires", ratePct: 62, sterilized: 100 },
      { province: "Córdoba", ratePct: 48, sterilized: 40 },
    ];

    expect(toChoroplethData(byProvince, (r) => r.ratePct)).toEqual([
      { code: "AR-B", value: 62, label: "Buenos Aires" },
      { code: "AR-X", value: 48, label: "Córdoba" },
    ]);
  });

  it("maps one row per province like /gob/censo (count value)", () => {
    const provinceRows = [
      { province: "Santa Fe", count: 12 },
      { province: "Mendoza", count: 5 },
    ];

    expect(toChoroplethData(provinceRows, (r) => r.count)).toEqual([
      { code: "AR-S", value: 12, label: "Santa Fe" },
      { code: "AR-M", value: 5, label: "Mendoza" },
    ]);
  });

  it("falls back to the raw province name as the code when unmapped — row is never dropped", () => {
    const rows = [{ province: "Atlántida", count: 3 }];

    expect(toChoroplethData(rows, (r) => r.count)).toEqual([
      { code: "Atlántida", value: 3, label: "Atlántida" },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(toChoroplethData([], (r: { province: string; count: number }) => r.count)).toEqual([]);
  });

  it("a NULL value marks the cell suppressed and STILL emits it (k-anon, #40c)", () => {
    // The fetchers hand back `count: number | null` so a withheld cell survives
    // the mapping. Dropping it would stipple the province "sin datos" — false,
    // and a tell that this province is different from its neighbours.
    const rows: { province: string; count: number | null }[] = [
      { province: "Santa Fe", count: 12 },
      { province: "Tierra del Fuego", count: null },
    ];

    expect(toChoroplethData(rows, (r) => r.count)).toEqual([
      { code: "AR-S", value: 12, label: "Santa Fe" },
      { code: "AR-V", value: 0, suppressed: true, label: "Tierra del Fuego" },
    ]);
  });

  it("a suppressed cell's value is a placeholder the renderer never reads", () => {
    // MapChoropleth branches on `suppressed` before every path that could paint
    // a number, so 0 here is inert — but it must never be reported as data.
    const [cell] = toChoroplethData([{ province: "Santa Cruz", count: null }], (r) => r.count);
    expect(cell.suppressed).toBe(true);
  });
});

describe("aggregateChoroplethData", () => {
  it("counts occurrences per resolved province like /gob/perdidas (aggregateLostByProvince)", () => {
    const lostPets = [
      { province: "Buenos Aires" as string | null },
      { province: "Buenos Aires" as string | null },
      { province: "Córdoba" as string | null },
      { province: null }, // dropped: no province
      { province: "Atlántida" }, // dropped: not in PROVINCE_ISO_MAP
    ];

    const result = aggregateChoroplethData(
      lostPets,
      (p) => (p.province ? PROVINCE_ISO_MAP[p.province] : undefined),
      () => 1,
      (value) => `${value} mascota${value !== 1 ? "s" : ""} perdida${value !== 1 ? "s" : ""}`,
    );

    expect(result).toEqual([
      { code: "AR-B", value: 2, label: "2 mascotas perdidas" },
      { code: "AR-X", value: 1, label: "1 mascota perdida" },
    ]);
  });

  it("sums an already-resolved code field like /gob/vigilancia (provinceChoroplethData)", () => {
    const mapData = [
      { code: "AR-B", count: 3 },
      { code: "AR-B", count: 2 },
      { code: "AR-X", count: 1 },
      { code: "", count: 5 }, // dropped: falsy code
    ];

    const result = aggregateChoroplethData(
      mapData,
      (row) => row.code,
      (row) => row.count,
      (value) => `${value} caso${value !== 1 ? "s" : ""} abierto${value !== 1 ? "s" : ""}`,
    );

    expect(result).toEqual([
      { code: "AR-B", value: 5, label: "5 casos abiertos" },
      { code: "AR-X", value: 1, label: "1 caso abierto" },
    ]);
  });

  it("returns an empty array when every row is dropped", () => {
    const rows = [{ code: null }, { code: undefined }, { code: "" }];

    const result = aggregateChoroplethData(
      rows,
      (r) => r.code,
      () => 1,
      (value) => `${value}`,
    );

    expect(result).toEqual([]);
  });

  it("singular label branch (value === 1) reads correctly", () => {
    const rows = [{ code: "AR-C", count: 1 }];

    const result = aggregateChoroplethData(
      rows,
      (r) => r.code,
      (r) => r.count,
      (value) => `${value} caso${value !== 1 ? "s" : ""} abierto${value !== 1 ? "s" : ""}`,
    );

    expect(result).toEqual([{ code: "AR-C", value: 1, label: "1 caso abierto" }]);
  });
});

describe("scopedChoroplethProps", () => {
  const provinceCells = [
    { code: "AR-B", value: 5, label: "5 casos abiertos" },
    { code: "AR-X", value: 2, label: "2 casos abiertos" },
  ];

  it("stays at province grain when no province is selected", () => {
    expect(scopedChoroplethProps(provinceCells, null, null)).toEqual({
      level: "province",
      data: provinceCells,
    });
  });

  it("stays at province grain when subregionCells hasn't been fetched yet, even with a selection", () => {
    expect(scopedChoroplethProps(provinceCells, "AR-B", null)).toEqual({
      level: "province",
      data: provinceCells,
    });
  });

  it("drills to department grain for a non-CABA province, dropping zero-count non-suppressed cells", () => {
    const subregionCells: SubregionCaseCount[] = [
      { code: "06007", name: "Adolfo Alsina", count: 7 },
      { code: "06014", name: "Adolfo Gonzales Chaves", count: 0 },
      { code: "06021", name: "Alberti", count: 0, suppressed: true },
    ];

    const result = scopedChoroplethProps(provinceCells, "AR-B", subregionCells);

    expect(result.level).toBe("department");
    expect(result.geojsonUrl).toBe("/geo/ar-departments.geojson");
    // visibleCodes carries the FULL sub-region set (zooms + filters the geojson).
    expect(result.visibleCodes).toEqual(["06007", "06014", "06021"]);
    // data drops the honest zero (Adolfo Gonzales Chaves) but keeps the
    // suppressed cell — count redacted to 0, never a raw 1..4 number.
    expect(result.data).toEqual([
      { code: "06007", value: 7, label: "Adolfo Alsina" },
      { code: "06021", value: 0, suppressed: true, label: "Alberti" },
    ]);
  });

  it("drills to barrio grain for CABA (AR-C)", () => {
    const subregionCells: SubregionCaseCount[] = [{ code: "palermo", name: "Palermo", count: 8 }];

    const result = scopedChoroplethProps(provinceCells, "AR-C", subregionCells);

    expect(result.level).toBe("barrio");
    expect(result.geojsonUrl).toBe("/geo/caba-barrios.geojson");
    expect(result.data).toEqual([{ code: "palermo", value: 8, label: "Palermo" }]);
  });
});
