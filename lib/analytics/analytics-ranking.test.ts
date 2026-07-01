// Tests for the cross-region ranking projection (Item 22).
//
// Pure unit tests cover:
//   - rankByField correctly orders rows by a numeric field ascending/descending
//   - ranking slice (top N / bottom N)
//
// Integration tests cover:
//   - fetchRegionRanking returns top/bottom by rabies coverage

import { describe, expect, it } from "vitest";

import { rankByField } from "./analytics-ranking";

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
