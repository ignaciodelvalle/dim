// Unit tests for the SituationalMap autozoom viewport helper (A1 — PR-7).
//
// computeJurisdictionViewport is a PURE function: given the operator's current
// jurisdiction selection (province code or locality centroid) plus the loaded
// basemap province features and the national fallback bbox, it returns a typed
// viewport descriptor that the component applies to the MapLibre instance.
//
// No DOM, no MapLibre runtime needed — the logic is fully pure.

import { describe, expect, it } from "vitest";

import {
  type ViewportDescriptor,
  computeJurisdictionViewport,
} from "@/components/panorama/situational-map-utils";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal GeoJSON feature stub for a province polygon. */
function makeProvinceFeature(
  code: string,
  coordinates: [number, number][],
): {
  properties: { code: string; name: string } | null;
  geometry: { type: string; coordinates: unknown } | null;
} {
  return {
    properties: { code, name: code },
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

// National fallback bbox (continental Argentina).
const NATIONAL_BBOX: [[number, number], [number, number]] = [
  [-73.58, -55.05],
  [-53.64, -21.78],
];

// A tiny square province covering roughly Córdoba area.
const CORDOBA_COORDS: [number, number][] = [
  [-65.77, -35.0],
  [-61.44, -35.0],
  [-61.44, -29.3],
  [-65.77, -29.3],
  [-65.77, -35.0],
];
const CORDOBA_FEATURE = makeProvinceFeature("AR-X", CORDOBA_COORDS);

// A very small polygon to test the tiny-province path (no meaningful bbox difference).
const CABA_COORDS: [number, number][] = [
  [-58.53, -34.71],
  [-58.33, -34.71],
  [-58.33, -34.53],
  [-58.53, -34.53],
  [-58.53, -34.71],
];
const CABA_FEATURE = makeProvinceFeature("AR-C", CABA_COORDS);

const PROVINCE_FEATURES = [CORDOBA_FEATURE, CABA_FEATURE];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeJurisdictionViewport — no selection (national)", () => {
  it("returns fitBounds with national bbox when provinceCode and localityCenter are both null", () => {
    const result = computeJurisdictionViewport(null, null, PROVINCE_FEATURES, NATIONAL_BBOX);
    expect(result).toEqual<ViewportDescriptor>({ kind: "fitBounds", bbox: NATIONAL_BBOX });
  });

  it("returns fitBounds with national bbox when province features list is empty", () => {
    const result = computeJurisdictionViewport("AR-X", null, [], NATIONAL_BBOX);
    expect(result).toEqual<ViewportDescriptor>({ kind: "fitBounds", bbox: NATIONAL_BBOX });
  });

  it("returns national bbox when the given provinceCode is not found in features", () => {
    const result = computeJurisdictionViewport("AR-Z", null, PROVINCE_FEATURES, NATIONAL_BBOX);
    expect(result).toEqual<ViewportDescriptor>({ kind: "fitBounds", bbox: NATIONAL_BBOX });
  });
});

describe("computeJurisdictionViewport — province selected", () => {
  it("returns fitBounds with the province polygon's bbox when a province is selected", () => {
    const result = computeJurisdictionViewport("AR-X", null, PROVINCE_FEATURES, NATIONAL_BBOX);
    expect(result.kind).toBe("fitBounds");
    if (result.kind !== "fitBounds") throw new Error("narrow");
    const [[minLng, minLat], [maxLng, maxLat]] = result.bbox;
    // The bbox should encompass all CORDOBA_COORDS.
    expect(minLng).toBeCloseTo(-65.77, 2);
    expect(minLat).toBeCloseTo(-35.0, 2);
    expect(maxLng).toBeCloseTo(-61.44, 2);
    expect(maxLat).toBeCloseTo(-29.3, 2);
  });

  it("handles MultiPolygon province geometries by spanning all rings", () => {
    // CABA is a MultiPolygon in the real basemap — simulate it here.
    const multi = {
      properties: { code: "AR-C", name: "CABA" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[CABA_COORDS], [CORDOBA_COORDS]],
      },
    };
    const result = computeJurisdictionViewport("AR-C", null, [multi], NATIONAL_BBOX);
    expect(result.kind).toBe("fitBounds");
    if (result.kind !== "fitBounds") throw new Error("narrow");
    // Bbox must span BOTH rings (the wider Córdoba ring determines outer bounds).
    const [[minLng, minLat], [maxLng, maxLat]] = result.bbox;
    expect(minLng).toBeLessThanOrEqual(-65.77);
    expect(maxLng).toBeGreaterThanOrEqual(-58.33);
    expect(minLat).toBeLessThanOrEqual(-35.0);
    expect(maxLat).toBeGreaterThanOrEqual(-29.3);
  });

  it("falls through to national bbox when provinceCode is selected but localityCenter is also present — locality takes precedence", () => {
    // When both are provided, locality is more specific → flyTo.
    const result = computeJurisdictionViewport(
      "AR-X",
      [-64.18, -31.41], // Córdoba city centroid
      PROVINCE_FEATURES,
      NATIONAL_BBOX,
    );
    expect(result.kind).toBe("flyTo");
  });
});

describe("computeJurisdictionViewport — locality selected", () => {
  it("returns flyTo with the locality centroid and zoom ~9.5 when localityCenter is provided", () => {
    const center: [number, number] = [-64.18, -31.41]; // Córdoba city
    const result = computeJurisdictionViewport("AR-X", center, PROVINCE_FEATURES, NATIONAL_BBOX);
    expect(result.kind).toBe("flyTo");
    if (result.kind !== "flyTo") throw new Error("narrow");
    expect(result.center).toEqual(center);
    // Zoom should be around 9.5 (the task spec value).
    expect(result.zoom).toBeGreaterThanOrEqual(9);
    expect(result.zoom).toBeLessThanOrEqual(11);
  });

  it("returns flyTo even when no province features are provided (locality does not need them)", () => {
    const center: [number, number] = [-58.38, -34.61]; // Buenos Aires city
    const result = computeJurisdictionViewport(null, center, [], NATIONAL_BBOX);
    expect(result.kind).toBe("flyTo");
    if (result.kind !== "flyTo") throw new Error("narrow");
    expect(result.center).toEqual(center);
  });
});
