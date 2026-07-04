import { describe, expect, it } from "vitest";

import { rankWorstUnits } from "../ranking";
import type { FeatureCollection } from "../types";

// Helper: a value-carrying feature (province choropleth shape).
function rateFeature(
  provinceCode: string,
  label: string,
  value: number | null,
  suppressed = false,
) {
  return {
    type: "Feature" as const,
    geometry: null,
    properties: { provinceCode, label, value, suppressed },
  };
}

// Helper: an aggregated-point (density) feature.
function densityFeature(place: string, count: number | null, suppressed = false) {
  return {
    type: "Feature" as const,
    geometry:
      count == null
        ? null
        : { type: "Point" as const, coordinates: [-60, -35] as [number, number] },
    properties: { place, province: place, locality: null, level: "province", count, suppressed },
  };
}

function fc(features: Array<ReturnType<typeof rateFeature> | ReturnType<typeof densityFeature>>) {
  return { type: "FeatureCollection", features } as unknown as FeatureCollection;
}

describe("rankWorstUnits — rate layers (brecha vs meta)", () => {
  it("ranks units BELOW target by gap descending (worst gap first)", () => {
    const features = fc([
      rateFeature("AR-F", "Formosa", 31),
      rateFeature("AR-B", "Buenos Aires", 78),
      rateFeature("AR-H", "Chaco", 38),
      rateFeature("AR-X", "Córdoba", 90), // above meta — excluded
    ]);

    const rows = rankWorstUnits(features, { kind: "rate", target: 80, limit: 10 });

    expect(rows.map((r) => r.label)).toEqual(["Formosa", "Chaco", "Buenos Aires"]);
    expect(rows[0]).toMatchObject({ key: "AR-F", value: 31, gap: 49 });
  });

  it("excludes suppressed and non-numeric cells (privacy invariant — no value from a k-anon cell)", () => {
    const features = fc([
      rateFeature("AR-F", "Formosa", 31),
      rateFeature("AR-S", "Suprimida", null, true),
      rateFeature("AR-N", "SinDato", null),
    ]);

    const rows = rankWorstUnits(features, { kind: "rate", target: 80 });

    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("AR-F");
  });

  it("returns an empty ranking when no unit is below meta", () => {
    const features = fc([
      rateFeature("AR-B", "Buenos Aires", 85),
      rateFeature("AR-X", "Córdoba", 92),
    ]);
    expect(rankWorstUnits(features, { kind: "rate", target: 80 })).toEqual([]);
  });

  it("caps the ranking at the requested limit (Worst-N = 10)", () => {
    const features = fc(Array.from({ length: 15 }, (_, i) => rateFeature(`AR-${i}`, `P${i}`, i)));
    expect(rankWorstUnits(features, { kind: "rate", target: 80, limit: 10 })).toHaveLength(10);
  });
});

describe("rankWorstUnits — density layers (count desc)", () => {
  it("ranks by count descending, gap null, dropping suppressed cells", () => {
    const features = fc([
      densityFeature("Rosario", 12),
      densityFeature("Suprimida", null, true),
      densityFeature("La Plata", 40),
    ]);

    const rows = rankWorstUnits(features, { kind: "density", limit: 10 });

    expect(rows.map((r) => r.label)).toEqual(["La Plata", "Rosario"]);
    expect(rows[0]).toMatchObject({ value: 40, gap: null });
  });
});
