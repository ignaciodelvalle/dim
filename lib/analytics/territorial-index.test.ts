// Unit tests for the jurisdiction composite index (Task #44.1).
// Pure functions only — no DB, no Next.js runtime.

import { describe, expect, it } from "vitest";

import type { OutlierRow } from "@/lib/metrics";

import {
  INDEX_COMPONENT_ORDER,
  computeJurisdictionIndex,
  targetAttainment,
} from "./territorial-index";

function row(
  province: string,
  metric: OutlierRow["metric"],
  rate: number,
  target: number,
): OutlierRow {
  return {
    province,
    metric,
    rate,
    target,
    gap: Math.round((target - rate) * 10) / 10,
    isOutlier: rate < target,
  };
}

describe("targetAttainment", () => {
  it("scores 100 when the rate meets the target exactly", () => {
    expect(targetAttainment(80, 80)).toBe(100);
  });

  it("caps at 100 when the rate exceeds the target", () => {
    expect(targetAttainment(95, 80)).toBe(100);
  });

  it("scores proportionally below target (one decimal)", () => {
    // 40 / 80 = 50%
    expect(targetAttainment(40, 80)).toBe(50);
    // 52.5 / 70 = 75%
    expect(targetAttainment(52.5, 70)).toBe(75);
  });

  it("returns 0 for a zero rate and guards a zero target", () => {
    expect(targetAttainment(0, 80)).toBe(0);
    expect(targetAttainment(50, 0)).toBe(0);
  });
});

describe("computeJurisdictionIndex", () => {
  it("returns an empty array for empty input", () => {
    expect(computeJurisdictionIndex([])).toEqual([]);
  });

  it("averages the three component attainments with equal weights", () => {
    const rows = [
      row("Córdoba", "rabies", 80, 80), // attainment 100
      row("Córdoba", "sterilization", 35, 70), // attainment 50
      row("Córdoba", "microchip", 60, 80), // attainment 75
    ];
    const [cordoba] = computeJurisdictionIndex(rows);
    expect(cordoba.province).toBe("Córdoba");
    expect(cordoba.componentsUsed).toBe(3);
    // mean(100, 50, 75) = 75
    expect(cordoba.score).toBe(75);
  });

  it("computes a partial score when the rabies component is k-anon-omitted upstream", () => {
    const rows = [
      row("Formosa", "sterilization", 70, 70), // attainment 100
      row("Formosa", "microchip", 40, 80), // attainment 50
    ];
    const [formosa] = computeJurisdictionIndex(rows);
    expect(formosa.componentsUsed).toBe(2);
    expect(formosa.components.rabies).toBeUndefined();
    // mean(100, 50) = 75
    expect(formosa.score).toBe(75);
  });

  it("ranks provinces by score descending with 1-based ranks", () => {
    const rows = [
      row("Salta", "microchip", 80, 80), // score 100
      row("Chaco", "microchip", 40, 80), // score 50
      row("Jujuy", "microchip", 60, 80), // score 75
    ];
    const result = computeJurisdictionIndex(rows);
    expect(result.map((r) => r.province)).toEqual(["Salta", "Jujuy", "Chaco"]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks score ties alphabetically by province (es collation)", () => {
    const rows = [row("Mendoza", "microchip", 40, 80), row("Chubut", "microchip", 40, 80)];
    const result = computeJurisdictionIndex(rows);
    expect(result.map((r) => r.province)).toEqual(["Chubut", "Mendoza"]);
  });

  it("keeps per-component rate/target/attainment detail for the UI", () => {
    const rows = [row("CABA", "sterilization", 35, 70)];
    const [caba] = computeJurisdictionIndex(rows);
    expect(caba.components.sterilization).toEqual({ rate: 35, target: 70, attainment: 50 });
  });

  it("INDEX_COMPONENT_ORDER covers exactly the three outlier metrics", () => {
    expect([...INDEX_COMPONENT_ORDER].sort()).toEqual(["microchip", "rabies", "sterilization"]);
  });
});
