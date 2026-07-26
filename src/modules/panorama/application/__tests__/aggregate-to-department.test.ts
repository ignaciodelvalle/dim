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
import { DEPARTMENT_REPRESENTATIVE_POINTS } from "@/src/modules/panorama/domain/geo-representative-points";

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

  it("falls back to averaging constituent locality centroids when the department has no precomputed representative point", () => {
    // "99998" is not a real INDEC code (not in DEPARTMENT_REPRESENTATIVE_POINTS),
    // so the fold must fall back to the old unweighted-average behavior.
    expect(DEPARTMENT_REPRESENTATIVE_POINTS["99998"]).toBeUndefined();
    const out = aggregateCellsToDepartment([
      row({
        locality: "A",
        departmentCode: "99998",
        centroidLat: "-37.0",
        centroidLng: "-63.0",
        count: 3,
      }),
      row({
        locality: "B",
        departmentCode: "99998",
        centroidLat: "-38.0",
        centroidLng: "-65.0",
        count: 3,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(Number(out[0].centroidLat)).toBeCloseTo(-37.5, 6);
    expect(Number(out[0].centroidLng)).toBeCloseTo(-64.0, 6);
  });

  it("emits a null centroid when no constituent locality had one AND the department has no precomputed point", () => {
    const out = aggregateCellsToDepartment([
      row({
        locality: "A",
        departmentCode: "99998",
        centroidLat: null,
        centroidLng: null,
        count: 6,
      }),
    ]);
    expect(out[0].centroidLat).toBeNull();
    expect(out[0].centroidLng).toBeNull();
  });

  it("point-on-surface fix: uses the department's PRECOMPUTED representative point over the naive locality-centroid average (Tierra del Fuego / Ushuaia, INDEC 94015)", () => {
    // Simulate locality rows whose average would drift far from Isla Grande
    // (e.g. toward the Malvinas/Georgias claim, the exact "centroid in the
    // water" failure mode this fix closes) — the fold must IGNORE that average
    // for a real department code and use the precomputed point instead.
    const naiveDriftedRows = [
      row({
        locality: "Ushuaia",
        departmentCode: "94015",
        departmentName: "Ushuaia",
        centroidLat: "-54.8",
        centroidLng: "-68.3",
        count: 3,
      }),
      row({
        locality: "Puerto remoto (simulado)",
        departmentCode: "94015",
        departmentName: "Ushuaia",
        centroidLat: "-51.8",
        centroidLng: "-59.0",
        count: 3,
      }),
    ];
    const out = aggregateCellsToDepartment(naiveDriftedRows);
    expect(out).toHaveLength(1);

    const naiveAvgLat = -(54.8 + 51.8) / 2;
    const naiveAvgLng = -(68.3 + 59.0) / 2;
    const rep = DEPARTMENT_REPRESENTATIVE_POINTS["94015"];
    expect(rep).toBeDefined();

    // Matches the precomputed value exactly...
    expect(Number(out[0].centroidLat)).toBeCloseTo(rep.lat, 5);
    expect(Number(out[0].centroidLng)).toBeCloseTo(rep.lng, 5);
    // ...and differs materially from the naive average of the input rows (the
    // bug this fix closes — the naive mean is >1 degree away from the real point).
    expect(Math.abs(Number(out[0].centroidLat) - naiveAvgLat)).toBeGreaterThan(1);
    expect(Math.abs(Number(out[0].centroidLng) - naiveAvgLng)).toBeGreaterThan(1);
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
// ---------------------------------------------------------------------------
// SECURITY: the fold is a REGROUPING, never a WIDENING.
//
// A govt operator is scoped to LOCALITIES; the map draws DEPARTMENTS. It is
// tempting to close that gap by aggregating at the department grain in SQL so a
// municipal operator's sparse map fills in. That would be an AUTHORIZATION
// change, not a rendering fix: measured on the local seed, a Santa Cruz /
// El Calafate operator is assigned 11 pets in 1 locality; their department
// (78028 Lago Argentino) holds 33 pets across 3 localities and the province
// holds 394 across 28. Filling the map that way shows an operator pets they
// were never granted.
//
// The fold is safe precisely because it is PURE and CLOSED over its input: the
// scope clause filters first, and the fold only regroups rows that already
// survived it. These tests pin that closure so a future "resolve up to a grain
// that has data" cannot be implemented by widening the fold.
// ---------------------------------------------------------------------------
describe("aggregateCellsToDepartment — non-widening invariant", () => {
  it("conserves the total count (no pet is invented, none is dropped)", () => {
    const input = [
      row({
        locality: "El Calafate",
        departmentCode: "78028",
        departmentName: "Lago Argentino",
        count: 11,
      }),
      row({ province: "CABA", locality: "Palermo", count: 206 }),
      row({
        province: "Tierra del Fuego",
        locality: "Ushuaia",
        departmentCode: "94015",
        departmentName: "Ushuaia",
        count: 50,
      }),
    ];
    const total = input.reduce((n, r) => n + r.count, 0);
    const out = aggregateCellsToDepartment(input);
    expect(out.reduce((n, r) => n + r.count, 0)).toBe(total);
  });

  it("never emits a unit that no input row contributed to", () => {
    // The operator is assigned ONE locality of department 78028. The fold must
    // emit that department carrying ONLY the assigned locality's count — it has
    // no way to reach the department's other localities, and must not acquire
    // one. A cell of 11 (not 33) is the correct, scoped answer.
    const out = aggregateCellsToDepartment([
      row({
        locality: "El Calafate",
        departmentCode: "78028",
        departmentName: "Lago Argentino",
        count: 11,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].departmentCode).toBe("78028");
    expect(out[0].count).toBe(11);
  });

  it("groups ONLY co-departmental input rows — disjoint scopes stay disjoint", () => {
    // A 3-locality operator whose localities sit in three different units gets
    // three cells, never one merged national blob.
    const out = aggregateCellsToDepartment([
      row({
        province: "Santa Cruz",
        locality: "El Calafate",
        departmentCode: "78028",
        departmentName: "Lago Argentino",
        count: 11,
      }),
      row({ province: "CABA", locality: "Palermo", count: 206 }),
      row({
        province: "Tierra del Fuego",
        locality: "Ushuaia",
        departmentCode: "94015",
        departmentName: "Ushuaia",
        count: 50,
      }),
    ]);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((r) => r.province))).toEqual(
      new Set(["Santa Cruz", "CABA", "Tierra del Fuego"]),
    );
  });

  it("an empty scope folds to nothing — never to a province-wide fallback", () => {
    // The honest answer for a scope with no rows is NO cells. Substituting a
    // coarser unit here is the widening this suite exists to prevent.
    expect(aggregateCellsToDepartment([])).toEqual([]);
  });
});

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
