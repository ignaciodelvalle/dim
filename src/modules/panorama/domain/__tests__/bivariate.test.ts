// Unit tests for the pure bivariate-choropleth domain (task #63).
//
// Covers the tercile classifier, the 3×3 index/risk helpers, and — the privacy
// invariant — k-anon SUPPRESSION PROPAGATION through the coverage×signal join.

import { describe, expect, it } from "vitest";

import {
  BIVARIATE_RISK_INDEX,
  BIVARIATE_SAFE_INDEX,
  type BivariateCell,
  bivariateIndex,
  buildBivariateCells,
  classifyTercile,
  coverageClassLabel,
  riskLabel,
  riskScore,
  signalClassLabel,
  tercileThresholds,
} from "@/src/modules/panorama/domain/bivariate";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

function coverageFc(
  rows: Array<{ code: string; name: string; value: number | null; suppressed?: boolean }>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: null,
      properties: {
        provinceCode: r.code,
        province: r.name,
        value: r.value,
        suppressed: r.suppressed ?? false,
      },
    })),
  };
}

function signalFc(
  rows: Array<{ name: string; count: number | null; suppressed?: boolean }>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: null,
      properties: { province: r.name, count: r.count, suppressed: r.suppressed ?? false },
    })),
  };
}

const cellByCode = (cells: BivariateCell[], code: string) =>
  cells.find((c) => c.provinceCode === code);

describe("tercileThresholds + classifyTercile", () => {
  it("splits a spread distribution into low/mid/high", () => {
    const th = tercileThresholds([0, 10, 20, 30, 40, 50, 60, 70, 80]);
    expect(th).not.toBeNull();
    if (!th) return;
    expect(classifyTercile(5, th)).toBe(0);
    expect(classifyTercile(40, th)).toBe(1);
    expect(classifyTercile(80, th)).toBe(2);
  });

  it("returns null for an empty distribution", () => {
    expect(tercileThresholds([])).toBeNull();
  });

  it("degenerate (all equal) never yields a mid bucket", () => {
    const th = tercileThresholds([50, 50, 50]);
    expect(th).toEqual({ t1: 50, t2: 50 });
    if (!th) return;
    expect(classifyTercile(50, th)).toBe(0); // <= t1
    expect(classifyTercile(51, th)).toBe(2); // > t2
  });
});

describe("3×3 index + risk helpers", () => {
  it("risk corner is low coverage × high signal, calm corner is high coverage × low signal", () => {
    expect(bivariateIndex(0, 2)).toBe(BIVARIATE_RISK_INDEX);
    expect(bivariateIndex(2, 0)).toBe(BIVARIATE_SAFE_INDEX);
    expect(BIVARIATE_RISK_INDEX).toBe(6);
    expect(BIVARIATE_SAFE_INDEX).toBe(2);
  });

  it("risk score peaks at the risk corner and bottoms at the calm corner", () => {
    expect(riskScore(0, 2)).toBe(4);
    expect(riskScore(2, 0)).toBe(0);
    expect(riskLabel(0, 2)).toBe("alto");
    expect(riskLabel(2, 0)).toBe("bajo");
    expect(riskLabel(1, 1)).toBe("medio");
  });

  it("es-AR class labels agree with the caption grammar", () => {
    expect(coverageClassLabel(0)).toBe("baja");
    expect(signalClassLabel(2)).toBe("altas");
  });
});

describe("buildBivariateCells — join + classification", () => {
  const coverage = coverageFc([
    { code: "AR-A", name: "Salta", value: 30 },
    { code: "AR-B", name: "Buenos Aires", value: 55 },
    { code: "AR-C", name: "CABA", value: 90 },
  ]);
  const signal = signalFc([
    { name: "Salta", count: 40 },
    { name: "Buenos Aires", count: 12 },
    { name: "CABA", count: 1 },
  ]);

  it("classifies each province over the scope distribution", () => {
    const cells = buildBivariateCells(coverage, signal);
    const salta = cellByCode(cells, "AR-A");
    expect(salta?.coverageClass).toBe(0); // lowest coverage
    expect(salta?.signalClass).toBe(2); // highest signal → risk corner
    expect(salta?.coverageValue).toBe(30);
    expect(salta?.signalValue).toBe(40);
    expect(salta?.suppressed).toBe(false);

    const caba = cellByCode(cells, "AR-C");
    expect(caba?.coverageClass).toBe(2); // highest coverage
    expect(caba?.signalClass).toBe(0); // lowest signal → calm corner
  });

  it("joins case/whitespace-insensitively on province name", () => {
    const cells = buildBivariateCells(
      coverageFc([{ code: "AR-A", name: " Salta ", value: 30 }]),
      signalFc([{ name: "salta", count: 40 }]),
    );
    expect(cellByCode(cells, "AR-A")?.signalValue).toBe(40);
  });
});

describe("buildBivariateCells — k-anon suppression propagation (privacy invariant)", () => {
  it("a coverage-suppressed unit is suppressed and carries NO classes", () => {
    const cells = buildBivariateCells(
      coverageFc([
        { code: "AR-A", name: "Salta", value: null, suppressed: true },
        { code: "AR-B", name: "Buenos Aires", value: 55 },
      ]),
      signalFc([
        { name: "Salta", count: 40 },
        { name: "Buenos Aires", count: 12 },
      ]),
    );
    const salta = cellByCode(cells, "AR-A");
    expect(salta?.suppressed).toBe(true);
    expect(salta?.coverageClass).toBeNull();
    expect(salta?.signalClass).toBeNull();
  });

  it("a signal-suppressed OR null-count unit propagates to suppressed (never inferred)", () => {
    const cells = buildBivariateCells(
      coverageFc([
        { code: "AR-A", name: "Salta", value: 30 },
        { code: "AR-B", name: "Jujuy", value: 45 },
      ]),
      signalFc([
        { name: "Salta", count: null, suppressed: true },
        { name: "Jujuy", count: null }, // null count == k-anon hidden
      ]),
    );
    expect(cellByCode(cells, "AR-A")?.suppressed).toBe(true);
    expect(cellByCode(cells, "AR-A")?.coverageClass).toBeNull();
    expect(cellByCode(cells, "AR-B")?.suppressed).toBe(true);
  });

  it("a unit merely MISSING from the signal input is no-data, NOT suppressed", () => {
    const cells = buildBivariateCells(
      coverageFc([{ code: "AR-A", name: "Salta", value: 30 }]),
      signalFc([{ name: "Otra", count: 5 }]),
    );
    const salta = cellByCode(cells, "AR-A");
    expect(salta?.suppressed).toBe(false);
    expect(salta?.signalValue).toBeNull();
    expect(salta?.signalClass).toBeNull(); // no signal → withhold color, but no hatch
  });

  it("suppressed values never shift the tercile boundaries", () => {
    // AR-Z is suppressed with an extreme raw value; it must not enter the terciles.
    const cells = buildBivariateCells(
      coverageFc([
        { code: "AR-A", name: "A", value: 10 },
        { code: "AR-B", name: "B", value: 20 },
        { code: "AR-C", name: "C", value: 30 },
        { code: "AR-Z", name: "Z", value: null, suppressed: true },
      ]),
      signalFc([
        { name: "A", count: 1 },
        { name: "B", count: 2 },
        { name: "C", count: 3 },
        { name: "Z", count: 9999, suppressed: true },
      ]),
    );
    // With only 10/20/30 in the coverage distribution, C (30) is the high tercile.
    expect(cellByCode(cells, "AR-C")?.coverageClass).toBe(2);
    expect(cellByCode(cells, "AR-Z")?.suppressed).toBe(true);
  });
});
