// Unit tests for the pure detail-tier department fold (PO "Option A").
//
// aggregateCellsToDepartment folds a per-(province, locality) rollup up to the
// administrative DIVISION the map draws: the departamento/partido everywhere, the
// barrio in CABA. Verified WITHOUT a database — it is a pure fold.

import { describe, expect, it } from "vitest";

import { suppressSmallCells } from "@/lib/metrics";
import {
  type DepartmentRollupRow,
  aggregateCellsToDepartment,
} from "@/src/modules/panorama/application/build-features";

function row(p: Partial<DepartmentRollupRow>): DepartmentRollupRow {
  return {
    key: "k",
    province: "Buenos Aires",
    locality: "Loc",
    centroidLat: null,
    centroidLng: null,
    departmentCode: null,
    departmentName: null,
    count: 1,
    ...p,
  };
}

describe("aggregateCellsToDepartment", () => {
  it("sums localities that share a department into one cell that clears k=5", () => {
    // Three localities, each below k=5, all in INDEC department 06035. At locality
    // granularity every cell would be suppressed; folded to the department the
    // total is 9 (>= 5) → a single visible cell.
    const out = aggregateCellsToDepartment([
      row({ locality: "A", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 3 }),
      row({ locality: "B", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 3 }),
      row({ locality: "C", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 3 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(9);
    expect(out[0].departmentCode).toBe("06035");
    expect(out[0].departmentName).toBe("Adolfo Alsina");
    // The unit label becomes the department name (for the popup).
    expect(out[0].locality).toBe("Adolfo Alsina");
  });

  it("keeps CABA at the barrio (no department) — locality label preserved, code null", () => {
    const out = aggregateCellsToDepartment([
      row({ province: "CABA", locality: "Palermo", departmentCode: null, count: 7 }),
      row({ province: "CABA", locality: "Caballito", departmentCode: null, count: 2 }),
    ]);
    expect(out).toHaveLength(2);
    const palermo = out.find((r) => r.locality === "Palermo");
    expect(palermo?.count).toBe(7);
    expect(palermo?.departmentCode).toBeNull();
  });

  it("a locality with no resolved department keeps its own bucket (province total preserved)", () => {
    const out = aggregateCellsToDepartment([
      row({ locality: "Matched", departmentCode: "06035", departmentName: "Dept", count: 6 }),
      row({ locality: "Orphan", departmentCode: null, departmentName: null, count: 4 }),
    ]);
    // Two distinct buckets — the orphan is not merged into the department, so the
    // province total (10) is fully accounted for (6 + 4), never dropped.
    expect(out).toHaveLength(2);
    expect(out.reduce((s, r) => s + r.count, 0)).toBe(10);
    const orphan = out.find((r) => r.locality === "Orphan");
    expect(orphan?.count).toBe(4);
    expect(orphan?.departmentCode).toBeNull();
  });

  it("averages the constituent locality centroids into the department centroid", () => {
    const out = aggregateCellsToDepartment([
      row({
        locality: "A",
        departmentCode: "06035",
        centroidLat: "-37.0",
        centroidLng: "-63.0",
        count: 3,
      }),
      row({
        locality: "B",
        departmentCode: "06035",
        centroidLat: "-38.0",
        centroidLng: "-65.0",
        count: 3,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(Number(out[0].centroidLat)).toBeCloseTo(-37.5, 6);
    expect(Number(out[0].centroidLng)).toBeCloseTo(-64.0, 6);
  });

  it("emits a null centroid when no constituent locality had one", () => {
    const out = aggregateCellsToDepartment([
      row({
        locality: "A",
        departmentCode: "06035",
        centroidLat: null,
        centroidLng: null,
        count: 6,
      }),
    ]);
    expect(out[0].centroidLat).toBeNull();
    expect(out[0].centroidLng).toBeNull();
  });

  it("does not merge the same department code ACROSS different provinces", () => {
    // A homonymous department code should never merge Buenos Aires with Córdoba —
    // the fold keys on (province, unit).
    const out = aggregateCellsToDepartment([
      row({ province: "Buenos Aires", departmentCode: "99999", count: 6 }),
      row({ province: "Córdoba", departmentCode: "99999", count: 6 }),
    ]);
    expect(out).toHaveLength(2);
  });
});

// The aggregated POINT loaders (perdidas/mordeduras/denuncias/zoonosis/sintomas)
// run the SAME pipeline the choropleth loaders do: aggregateCellsToDepartment →
// suppressSmallCells(k=5). These tests pin the composition end-to-end (the fold
// is what turns near-total locality-tier suppression into a readable department
// map) without a database — suppressSmallCells is the exact k-anon primitive the
// repository's toAggregatedCells calls.
describe("department fold + k-anon (aggregated point loader pipeline)", () => {
  it("makes a department VISIBLE whose member localities are each below k=5 but sum to >= 5", () => {
    const folded = aggregateCellsToDepartment([
      row({ locality: "A", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 2 }),
      row({ locality: "B", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 2 }),
      row({ locality: "C", departmentCode: "06035", departmentName: "Adolfo Alsina", count: 2 }),
    ]);
    const { visible, suppressed, suppressedCount } = suppressSmallCells(folded, {
      count: (r) => r.count,
      key: (r) => r.key,
      k: 5,
    });
    // At locality granularity all three cells (count 2) are suppressed; folded to
    // the department the total is 6 (>= 5) → exactly one visible cell, zero suppressed.
    expect(suppressedCount).toBe(0);
    expect(suppressed).toHaveLength(0);
    expect(visible).toHaveLength(1);
    expect((visible[0] as DepartmentRollupRow).count).toBe(6);
    expect((visible[0] as DepartmentRollupRow).locality).toBe("Adolfo Alsina");
  });

  it("keeps a CABA barrio below k=5 suppressed (barrio path unchanged, never merged)", () => {
    const folded = aggregateCellsToDepartment([
      row({ province: "CABA", locality: "Palermo", departmentCode: null, count: 3 }),
    ]);
    const { visible, suppressedCount } = suppressSmallCells(folded, {
      count: (r) => r.count,
      key: (r) => r.key,
      k: 5,
    });
    // The barrio is the unit in CABA — a below-k barrio stays suppressed (the fold
    // never merges barrios into a department, so the privacy floor is unchanged).
    expect(suppressedCount).toBe(1);
    expect(visible).toHaveLength(0);
  });
});
