// Unit tests for lib/metrics/anonymity.ts — pure, no DB.

import { describe, expect, it } from "vitest";

import {
  complementarySuppress,
  deltaCells,
  suppressDelta,
  suppressSmallCells,
  suppressedMetric,
} from "./anonymity";

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

describe("complementarySuppress", () => {
  type Cell = { province: string; unit: string; count: number };
  const opts = { group: (r: Cell) => r.province, count: (r: Cell) => r.count };

  // Partition a set of cells at k=5 then apply complementary suppression — the
  // full pipeline the repository runs.
  function run(cells: Cell[]) {
    const p = suppressSmallCells(cells, { count: (r) => r.count, key: (r) => r.unit, k: 5 });
    return complementarySuppress(p.visible as unknown as readonly Cell[], p.suppressed, opts);
  }

  // Property: no province group may end with EXACTLY ONE suppressed cell when it
  // has a visible sibling (0 or ≥2 otherwise). A lone suppressed cell is allowed
  // ONLY when the group has no visible sibling (single-cell group — nothing to
  // complement; the exposure is the published province total, not differencing).
  function assertInvariant(res: { visible: Cell[]; suppressed: Cell[] }) {
    const suppressedByGroup = new Map<string, number>();
    const visibleByGroup = new Map<string, number>();
    for (const r of res.suppressed)
      suppressedByGroup.set(r.province, (suppressedByGroup.get(r.province) ?? 0) + 1);
    for (const r of res.visible)
      visibleByGroup.set(r.province, (visibleByGroup.get(r.province) ?? 0) + 1);
    for (const [g, n] of suppressedByGroup) {
      if (n === 1) expect(visibleByGroup.get(g) ?? 0).toBe(0);
    }
  }

  it("promotes the smallest visible sibling when a province has one suppressed cell", () => {
    const res = run([
      { province: "BA", unit: "Dept A", count: 3 }, // suppressed (primary)
      { province: "BA", unit: "Dept B", count: 6 }, // smallest visible → complementary
      { province: "BA", unit: "Dept C", count: 9 }, // stays visible
    ]);
    expect(res.suppressed.map((r) => r.unit).sort()).toEqual(["Dept A", "Dept B"]);
    expect(res.visible.map((r) => r.unit)).toEqual(["Dept C"]);
    assertInvariant(res);
  });

  it("leaves a province untouched when it already has two suppressed cells", () => {
    const res = run([
      { province: "BA", unit: "A", count: 2 },
      { province: "BA", unit: "B", count: 3 },
      { province: "BA", unit: "C", count: 8 },
    ]);
    expect(res.suppressed.map((r) => r.unit).sort()).toEqual(["A", "B"]);
    expect(res.visible.map((r) => r.unit)).toEqual(["C"]);
    assertInvariant(res);
  });

  it("leaves a province untouched when nothing is suppressed", () => {
    const res = run([
      { province: "BA", unit: "A", count: 6 },
      { province: "BA", unit: "B", count: 8 },
    ]);
    expect(res.suppressed).toHaveLength(0);
    expect(res.visible).toHaveLength(2);
    assertInvariant(res);
  });

  it("cannot complement a single-cell province (no visible sibling)", () => {
    const res = run([{ province: "Formosa", unit: "Only", count: 1 }]);
    // Lone suppressed cell survives — allowed by the invariant (no sibling).
    expect(res.suppressed).toHaveLength(1);
    expect(res.visible).toHaveLength(0);
    assertInvariant(res);
  });

  it("applies per-province independently across a mixed input", () => {
    const res = run([
      // BA: one suppressed + two visible → promote smallest visible (5).
      { province: "BA", unit: "a", count: 3 },
      { province: "BA", unit: "b", count: 5 },
      { province: "BA", unit: "c", count: 7 },
      // Cordoba: two visible, none suppressed → untouched.
      { province: "Cordoba", unit: "d", count: 6 },
      { province: "Cordoba", unit: "e", count: 9 },
    ]);
    const baSupp = res.suppressed
      .filter((r) => r.province === "BA")
      .map((r) => r.unit)
      .sort();
    expect(baSupp).toEqual(["a", "b"]);
    expect(res.suppressed.filter((r) => r.province === "Cordoba")).toHaveLength(0);
    assertInvariant(res);
  });

  it("picks the smallest sibling on ties deterministically", () => {
    const res = run([
      { province: "BA", unit: "hidden", count: 2 },
      { province: "BA", unit: "tie1", count: 6 },
      { province: "BA", unit: "tie2", count: 6 },
    ]);
    // First-encountered min (tie1) is promoted.
    expect(res.suppressed.map((r) => r.unit).sort()).toEqual(["hidden", "tie1"]);
    assertInvariant(res);
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

// ---------------------------------------------------------------------------
// viz-suite wave 0 — the delta differencing rule (pinned BEFORE any delta render)
// ---------------------------------------------------------------------------

describe("suppressDelta (the differencing privacy rule)", () => {
  it("suppresses when EITHER window carries a protected (0 < n < k) count", () => {
    expect(suppressDelta(10, 3)).toBe(true); // visible current would reveal prior=3
    expect(suppressDelta(3, 10)).toBe(true); // and vice versa
    expect(suppressDelta(2, 4)).toBe(true); // both protected
  });

  it("passes when both windows clear k", () => {
    expect(suppressDelta(5, 5)).toBe(false);
    expect(suppressDelta(120, 87)).toBe(false);
  });

  it("the ZERO nuance: an empty window is not a protected value", () => {
    // "+20 desde cero" is exactly as public as the visible current window —
    // an empty prior produces no row under the single-window rule.
    expect(suppressDelta(20, 0)).toBe(false);
    expect(suppressDelta(0, 20)).toBe(false);
    expect(suppressDelta(0, 0)).toBe(false);
    // But a sub-k PRESENT side still suppresses even against zero.
    expect(suppressDelta(2, 0)).toBe(true);
    expect(suppressDelta(0, 3)).toBe(true);
  });

  it("honors a custom k", () => {
    expect(suppressDelta(7, 9, 10)).toBe(true);
    expect(suppressDelta(10, 10, 10)).toBe(false);
  });
});

describe("deltaCells (two-window pairing under the rule)", () => {
  type R = { unit: string; n: number };
  const opts = { key: (r: R) => r.unit, count: (r: R) => r.n };

  it("pairs by key: visible delta = current − prior", () => {
    const cells = deltaCells<R>([{ unit: "AR-C", n: 12 }], [{ unit: "AR-C", n: 7 }], opts);
    expect(cells).toEqual([
      {
        key: "AR-C",
        current: { unit: "AR-C", n: 12 },
        prior: { unit: "AR-C", n: 7 },
        delta: 5,
        suppressed: false,
      },
    ]);
  });

  it("a suppressed cell carries delta null — no numeric value, not a hidden one", () => {
    const cells = deltaCells<R>([{ unit: "AR-C", n: 12 }], [{ unit: "AR-C", n: 3 }], opts);
    expect(cells[0].suppressed).toBe(true);
    expect(cells[0].delta).toBeNull();
  });

  it("keys missing from one window are honest zeros (new activity / gone quiet)", () => {
    const cells = deltaCells<R>([{ unit: "AR-B", n: 20 }], [{ unit: "AR-X", n: 9 }], opts);
    const byKey = new Map(cells.map((c) => [c.key, c]));
    expect(byKey.get("AR-B")).toMatchObject({ delta: 20, suppressed: false, prior: null });
    expect(byKey.get("AR-X")).toMatchObject({ delta: -9, suppressed: false, current: null });
  });

  it("a protected count on the missing-key path still suppresses", () => {
    const cells = deltaCells<R>([], [{ unit: "AR-X", n: 2 }], opts);
    expect(cells[0].suppressed).toBe(true);
    expect(cells[0].delta).toBeNull();
  });
});
