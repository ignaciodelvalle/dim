// Unit tests for the pure locality-cell sort helper — qa-triage-2026-07-23
// finding #14: a k-anon rollup bucket ("Santiago del Estero (otras
// localidades)") aggregating many sub-threshold localities hit 1.965 in live
// seed data — the single largest bar in the "Distribución por localidad"
// chart, reading as "the #1 locality" even though it isn't one real place.
// sortLocalityCellsRollupLast demotes it to last regardless of count.

import { describe, expect, it } from "vitest";

import { sortLocalityCellsRollupLast } from "./mortality-metrics";

describe("sortLocalityCellsRollupLast", () => {
  it("moves a large rollup cell to the end, even though it has the highest count", () => {
    const cells = [
      { key: "Palermo", count: 12, isRollup: false },
      { key: "Santiago del Estero (otras localidades)", count: 1965, isRollup: true },
      { key: "Recoleta", count: 8, isRollup: false },
    ];
    const sorted = sortLocalityCellsRollupLast(cells);
    expect(sorted.map((c) => c.key)).toEqual([
      "Palermo",
      "Recoleta",
      "Santiago del Estero (otras localidades)",
    ]);
  });

  it("preserves the relative order of non-rollup cells", () => {
    const cells = [
      { key: "B", count: 5, isRollup: false },
      { key: "A", count: 20, isRollup: false },
    ];
    expect(sortLocalityCellsRollupLast(cells).map((c) => c.key)).toEqual(["B", "A"]);
  });

  it("handles multiple rollup cells (mixed-province scope) — both sort after every real cell", () => {
    const cells = [
      { key: "CABA (otras localidades)", count: 40, isRollup: true },
      { key: "Palermo", count: 12, isRollup: false },
      { key: "Córdoba (otras localidades)", count: 30, isRollup: true },
    ];
    const sorted = sortLocalityCellsRollupLast(cells);
    expect(sorted[0].key).toBe("Palermo");
    expect(sorted.slice(1).every((c) => c.isRollup)).toBe(true);
  });

  it("is a no-op when there is no rollup cell", () => {
    const cells = [
      { key: "Palermo", count: 12, isRollup: false },
      { key: "Recoleta", count: 8, isRollup: false },
    ];
    expect(sortLocalityCellsRollupLast(cells)).toEqual(cells);
  });

  it("treats a missing isRollup field the same as false (real cell)", () => {
    const cells: Array<{ key: string; count: number; isRollup?: boolean }> = [
      { key: "Palermo", count: 12 },
      { key: "X (otras localidades)", count: 99, isRollup: true },
    ];
    expect(sortLocalityCellsRollupLast(cells).map((c) => c.key)).toEqual([
      "Palermo",
      "X (otras localidades)",
    ]);
  });

  it("does not mutate the input array", () => {
    const cells = [
      { key: "Z (otras localidades)", count: 99, isRollup: true },
      { key: "Palermo", count: 12, isRollup: false },
    ];
    const original = [...cells];
    sortLocalityCellsRollupLast(cells);
    expect(cells).toEqual(original);
  });
});
