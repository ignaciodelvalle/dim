// Unit tests for lib/metrics/anonymity.ts — pure, no DB.

import { describe, expect, it } from "vitest";

import { suppressSmallCells, suppressedMetric } from "./anonymity";

describe("suppressSmallCells", () => {
  const mkRow = (key: string, count: number) => ({ key, count, extra: "x" });

  it("keeps cells with count >= k (default k=5)", () => {
    const rows = [mkRow("LocalidadA", 10), mkRow("LocalidadB", 5), mkRow("LocalidadC", 3)];
    const { visible, suppressed, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
    });
    expect(visible).toHaveLength(2);
    expect(suppressed).toHaveLength(1);
    expect(suppressedCount).toBe(1);
    expect(visible.find((r) => r.key === "LocalidadC")).toBeUndefined();
  });

  it("suppresses cells with count < k=5 by default", () => {
    const rows = [mkRow("A", 4), mkRow("B", 1), mkRow("C", 0)];
    const { visible, suppressed, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
    });
    expect(visible).toHaveLength(0);
    expect(suppressedCount).toBe(3);
    expect(suppressed).toHaveLength(3);
  });

  it("respects a custom k value", () => {
    const rows = [mkRow("A", 2), mkRow("B", 3), mkRow("C", 5)];
    // k=3: rows with count >= 3 are visible
    const { visible, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
      k: 3,
    });
    expect(visible).toHaveLength(2); // B (3) and C (5)
    expect(suppressedCount).toBe(1); // A (2)
  });

  it("keeps cells at exactly k=5 (boundary inclusive)", () => {
    const rows = [mkRow("A", 5), mkRow("B", 4)];
    const { visible, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.key).toBe("A");
    expect(suppressedCount).toBe(1);
  });

  it("returns all visible when all rows meet the threshold", () => {
    const rows = [mkRow("A", 10), mkRow("B", 20)];
    const { visible, suppressed, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
    });
    expect(visible).toHaveLength(2);
    expect(suppressed).toHaveLength(0);
    expect(suppressedCount).toBe(0);
  });

  it("handles empty input", () => {
    const { visible, suppressed, suppressedCount } = suppressSmallCells(
      [] as Array<{ key: string; count: number }>,
      {
        count: (r) => r.count,
        key: (r) => r.key,
      },
    );
    expect(visible).toHaveLength(0);
    expect(suppressed).toHaveLength(0);
    expect(suppressedCount).toBe(0);
  });

  it("rolls up suppressed rows when rollup is provided", () => {
    const rows = [mkRow("A", 10), mkRow("B", 2), mkRow("C", 1)];
    const { visible, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
      rollup: (suppressed) => ({
        key: "Otras localidades",
        count: suppressed.reduce((s, r) => s + r.count, 0),
        extra: "rolled",
      }),
    });
    // A stays visible; B+C are rolled into "Otras localidades"
    expect(visible).toHaveLength(2);
    const rolled = visible.find((r) => r.key === "Otras localidades");
    expect(rolled).toBeDefined();
    expect(rolled?.count).toBe(3); // 2 + 1
    expect(suppressedCount).toBe(2);
  });

  it("discards suppressed rows when rollup returns null", () => {
    const rows = [mkRow("A", 10), mkRow("B", 2)];
    const { visible, suppressedCount } = suppressSmallCells(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
      rollup: () => null,
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.key).toBe("A");
    expect(suppressedCount).toBe(1);
  });
});

describe("suppressedMetric", () => {
  it("returns MetricResult shape with value and suppressedCount", () => {
    const rows = [
      { key: "A", count: 10 },
      { key: "B", count: 2 }, // suppressed
    ];
    const result = suppressedMetric(rows, {
      count: (r) => r.count,
      key: (r) => r.key,
    });
    expect(result.suppressedCount).toBe(1);
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.key).toBe("A");
  });
});
