// Unit tests for the Panorama layer registry (pure domain).

import { describe, expect, it } from "vitest";

import {
  AGGREGATED_POINT_IDS,
  AGGREGATED_POINT_LAYERS,
  CHOROPLETH_LAYERS,
  PANORAMA_LAYERS,
  POINT_LAYERS,
  REFERENCE_LAYERS,
  TEMPORAL_LAYERS,
  getLayer,
  isAggregatedPointLayer,
  isLayerId,
  isTemporalLayer,
} from "@/src/modules/panorama/domain/layers";
import type { LayerDataType, LayerPrivacy } from "@/src/modules/panorama/domain/types";

describe("PANORAMA_LAYERS registry", () => {
  it("has the 8 v1 layers with unique ids", () => {
    expect(PANORAMA_LAYERS).toHaveLength(8);
    const ids = PANORAMA_LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(8);
  });

  it("every layer declares all required fields with valid values", () => {
    const validGeom = new Set(["point", "choropleth"]);
    const validPrivacy = new Set<LayerPrivacy>(["none", "coarse", "gated"]);
    const validDataType = new Set<LayerDataType>(["rate", "density", "signal", "reference"]);
    for (const layer of PANORAMA_LAYERS) {
      expect(layer.label.length).toBeGreaterThan(0);
      expect(layer.source.length).toBeGreaterThan(0);
      expect(validGeom.has(layer.geomType)).toBe(true);
      expect(validPrivacy.has(layer.privacy)).toBe(true);
      expect(layer.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(typeof layer.scopeFilterable).toBe("boolean");
      expect(validDataType.has(layer.dataType)).toBe(true);
    }
  });

  it("partitions cleanly into point (6) and choropleth (2) layers", () => {
    expect(POINT_LAYERS).toHaveLength(6);
    expect(CHOROPLETH_LAYERS).toHaveLength(2);
    expect(POINT_LAYERS.length + CHOROPLETH_LAYERS.length).toBe(PANORAMA_LAYERS.length);
  });

  it("draws denuncias coarse (spec §8 PII) — no exact coordinate in the layer", () => {
    expect(getLayer("denuncias")?.privacy).toBe("coarse");
  });

  it("sources every choropleth rollup from lib/metrics (k-anon denominator)", () => {
    for (const layer of CHOROPLETH_LAYERS) {
      expect(layer.source.startsWith("metrics:")).toBe(true);
    }
  });

  it("makes every layer scope-filterable (govt intersects its jurisdiction)", () => {
    expect(PANORAMA_LAYERS.every((l) => l.scopeFilterable)).toBe(true);
  });

  it("marks event-windowable layers temporal and current-state ones not (F4)", () => {
    // Temporal: the 4 event-based point layers + perdidas (markedLostAt window).
    const temporalIds = TEMPORAL_LAYERS.map((l) => l.id).sort();
    expect(temporalIds).toEqual(
      ["decomisos", "denuncias", "mordeduras", "perdidas", "zoonosis"].sort(),
    );
    // Non-temporal: refugios (no time) + the two current-state choropleths.
    expect(isTemporalLayer("refugios")).toBe(false);
    expect(isTemporalLayer("cobertura")).toBe(false);
    expect(isTemporalLayer("mortalidad")).toBe(false);
    expect(isTemporalLayer("perdidas")).toBe(true);
  });
});

describe("F1 dataType taxonomy (Panorama v2)", () => {
  it("each layer has exactly one dataType from the valid set", () => {
    const validDataType = new Set<LayerDataType>(["rate", "density", "signal", "reference"]);
    for (const layer of PANORAMA_LAYERS) {
      expect(validDataType.has(layer.dataType)).toBe(true);
    }
  });

  it("assigns dataType correctly per layer", () => {
    expect(getLayer("cobertura")?.dataType).toBe("rate");
    expect(getLayer("mortalidad")?.dataType).toBe("density");
    expect(getLayer("perdidas")?.dataType).toBe("density");
    expect(getLayer("mordeduras")?.dataType).toBe("density");
    expect(getLayer("denuncias")?.dataType).toBe("density");
    expect(getLayer("zoonosis")?.dataType).toBe("signal");
    expect(getLayer("refugios")?.dataType).toBe("reference");
    expect(getLayer("decomisos")?.dataType).toBe("reference");
  });

  it("AGGREGATED_POINT_LAYERS contains the 4 density+signal point layers", () => {
    // perdidas, mordeduras, denuncias (density) + zoonosis (signal).
    // Does NOT include refugios/decomisos (reference) or mortalidad/cobertura (choropleth).
    const ids = AGGREGATED_POINT_LAYERS.map((l) => l.id).sort();
    expect(ids).toEqual(["denuncias", "mordeduras", "perdidas", "zoonosis"].sort());
  });

  it("AGGREGATED_POINT_IDS and isAggregatedPointLayer are consistent", () => {
    for (const layer of PANORAMA_LAYERS) {
      const expected = AGGREGATED_POINT_IDS.has(layer.id);
      expect(isAggregatedPointLayer(layer.id)).toBe(expected);
    }
  });

  it("REFERENCE_LAYERS contains only refugios and decomisos", () => {
    const ids = REFERENCE_LAYERS.map((l) => l.id).sort();
    expect(ids).toEqual(["decomisos", "refugios"].sort());
  });

  it("partition: AGGREGATED_POINT + REFERENCE covers all 6 point layers", () => {
    const allPointIds = POINT_LAYERS.map((l) => l.id).sort();
    const aggregatedAndReference = [...AGGREGATED_POINT_LAYERS, ...REFERENCE_LAYERS]
      .map((l) => l.id)
      .sort();
    expect(aggregatedAndReference).toEqual(allPointIds);
  });
});

describe("getLayer / isLayerId", () => {
  it("getLayer returns the entry for each known id", () => {
    expect(getLayer("perdidas")?.label).toBe("Perdidas / avistajes");
    expect(getLayer("mortalidad")?.geomType).toBe("choropleth");
  });

  it("isLayerId guards arbitrary strings (e.g. a route param)", () => {
    expect(isLayerId("mortalidad")).toBe(true);
    expect(isLayerId("perdidas")).toBe(true);
    expect(isLayerId("../../etc/passwd")).toBe(false);
    expect(isLayerId("escaneos")).toBe(false); // deferred to v2
    expect(isLayerId("")).toBe(false);
  });
});
