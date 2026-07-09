// Tests for the cross-region ranking projection (Item 22).
//
// Pure unit tests cover:
//   - rankByField correctly orders rows by a numeric field ascending/descending
//   - ranking slice (top N / bottom N)
//
// Integration tests cover:
//   - fetchRegionRanking returns top/bottom by rabies coverage

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { rankByField, regionRankingPetsScope } from "./analytics-ranking";

// ---------------------------------------------------------------------------
// Pure unit tests — no DB
// ---------------------------------------------------------------------------

describe("rankByField", () => {
  const rows = [
    { province: "Buenos Aires", code: "AR-B", value: 45, count: 100 },
    { province: "Córdoba", code: "AR-X", value: 72, count: 80 },
    { province: "Santa Fe", code: "AR-S", value: 30, count: 60 },
    { province: "Mendoza", code: "AR-M", value: 88, count: 40 },
    { province: "Tucumán", code: "AR-T", value: 15, count: 20 },
  ];

  it("returns top N by value descending", () => {
    const result = rankByField(rows, "value", "desc", 3);
    expect(result).toHaveLength(3);
    expect(result[0].province).toBe("Mendoza");
    expect(result[1].province).toBe("Córdoba");
    expect(result[2].province).toBe("Buenos Aires");
    expect(result[0].rank).toBe(1);
    expect(result[2].rank).toBe(3);
  });

  it("returns bottom N by value ascending", () => {
    const result = rankByField(rows, "value", "asc", 3);
    expect(result).toHaveLength(3);
    expect(result[0].province).toBe("Tucumán");
    expect(result[1].province).toBe("Santa Fe");
    expect(result[2].province).toBe("Buenos Aires");
    expect(result[0].rank).toBe(1);
  });

  it("returns all rows when limit exceeds length", () => {
    const result = rankByField(rows, "value", "desc", 100);
    expect(result).toHaveLength(5);
  });

  it("assigns sequential rank starting at 1", () => {
    const result = rankByField(rows, "value", "desc", 5);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].rank).toBe(i + 1);
    }
  });

  it("handles empty array", () => {
    expect(rankByField([], "value", "desc", 5)).toHaveLength(0);
  });

  it("returns at most limit rows", () => {
    expect(rankByField(rows, "value", "desc", 2)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Region-ranking jurisdiction scope — whole-province (CABA) subsumption
// ---------------------------------------------------------------------------
//
// Regression: fetchRegionRanking previously built an ad-hoc exact
// `(province = X AND locality = Y)` clause. A whole-CABA govt assignment has
// locality "Ciudad Autónoma de Buenos Aires", but CABA pets are tagged with
// barrio localities ("Belgrano", "Palermo", …), so the exact clause matched
// zero barrio-tagged pets and CABA silently vanished from the ranking. The fix
// routes scope through the shared jurisdictionPairClause, which emits a
// province-only predicate for whole-province assignments.

function render(clause: ReturnType<typeof regionRankingPetsScope>) {
  if (clause === null) return { sql: "", params: [] as unknown[] };
  return new PgDialect().sqlToQuery(clause);
}

describe("regionRankingPetsScope — CABA whole-province subsumption", () => {
  it("emits a PROVINCE-ONLY predicate for a whole-CABA govt assignment (barrio-tagged pets still match)", () => {
    const clause = regionRankingPetsScope({ role: "govt" }, [
      { province: "CABA", locality: "Ciudad Autónoma de Buenos Aires" },
    ]);
    const { sql: text, params } = render(clause);
    // Province alone → a barrio-tagged CABA pet ("Belgrano") is still in scope.
    expect(text).toContain("jurisdiction_province");
    expect(text).not.toContain("jurisdiction_locality");
    expect(params).toContain("CABA");
    // The OLD ad-hoc exact clause would have pinned the whole-province locality
    // string here — which no barrio-tagged pet carries → CABA returned 0 rows.
    expect(params).not.toContain("Ciudad Autónoma de Buenos Aires");
  });

  it("keeps the EXACT pair for a barrio-specific assignment (no widening)", () => {
    const clause = regionRankingPetsScope({ role: "govt" }, [
      { province: "CABA", locality: "Palermo" },
    ]);
    const { sql: text, params } = render(clause);
    expect(text).toContain("jurisdiction_locality");
    expect(params).toEqual(expect.arrayContaining(["CABA", "Palermo"]));
  });

  it("keeps the EXACT pair for a normal (non-whole-province) locality", () => {
    const clause = regionRankingPetsScope({ role: "govt" }, [
      { province: "Mendoza", locality: "Godoy Cruz" },
    ]);
    const { sql: text, params } = render(clause);
    expect(text).toContain("jurisdiction_province");
    expect(text).toContain("jurisdiction_locality");
    expect(params).toEqual(expect.arrayContaining(["Mendoza", "Godoy Cruz"]));
  });

  it("returns null for admin (universal scope unchanged)", () => {
    expect(regionRankingPetsScope({ role: "admin" }, [])).toBeNull();
  });
});
