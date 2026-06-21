// Unit tests for the pure feature transforms (no DB) — one per layer.

import { describe, expect, it } from "vitest";

import {
  type BiteRow,
  type ChoroplethCell,
  type DecomisoRow,
  type DenunciaCentroidRow,
  type LostPointRow,
  type OutbreakRow,
  type ProvinceChoroplethCell,
  type ShelterRow,
  buildChoroplethFeatures,
  buildDecomisosFeatures,
  buildDenunciasFeatures,
  buildMordedurasFeatures,
  buildPerdidasFeatures,
  buildProvinceChoroplethFeatures,
  buildRefugiosFeatures,
  buildZoonosisFeatures,
} from "../build-features";

const row = (over: Partial<LostPointRow> = {}): LostPointRow => ({
  publicToken: "DIM-AAAA-1111",
  name: "Firulai",
  species: "dog",
  status: "lost",
  locationLat: "-34.6037000",
  locationLng: "-58.3816000",
  lastSeenAt: "2026-06-19T12:00:00.000Z",
  ...over,
});

describe("buildPerdidasFeatures", () => {
  it("wraps rows into a typed FeatureCollection with [lng, lat] points", () => {
    const fc = buildPerdidasFeatures([row()]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-58.3816, -34.6037]);
  });

  it("carries the public properties (token/name/species/status/lastSeenAt)", () => {
    const fc = buildPerdidasFeatures([row({ publicToken: "DIM-BBBB-2222", name: "Mishi" })]);
    expect(fc.features[0].properties).toEqual({
      token: "DIM-BBBB-2222",
      name: "Mishi",
      species: "dog",
      status: "lost",
      lastSeenAt: "2026-06-19T12:00:00.000Z",
    });
  });

  it("drops non-located rows (missing coordinate pair) from the point layer", () => {
    const fc = buildPerdidasFeatures([
      row({ publicToken: "ok" }),
      row({ publicToken: "no-lat", locationLat: null }),
      row({ publicToken: "no-lng", locationLng: null }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.token).toBe("ok");
  });

  it("returns an empty collection for no rows", () => {
    expect(buildPerdidasFeatures([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});

// --- mordeduras --------------------------------------------------------------

describe("buildMordedurasFeatures", () => {
  const biteRow = (over: Partial<BiteRow> = {}): BiteRow => ({
    id: "evt-1",
    locationLat: "-34.6",
    locationLng: "-58.4",
    incidentType: "bite_inflicted",
    severity: "moderate",
    occurredAt: "2026-06-10T00:00:00.000Z",
    ...over,
  });

  it("emits [lng,lat] points carrying incidentType/severity", () => {
    const fc = buildMordedurasFeatures([biteRow()]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-58.4, -34.6]);
    expect(fc.features[0].properties).toMatchObject({
      incidentType: "bite_inflicted",
      severity: "moderate",
    });
  });

  it("drops non-located bite rows", () => {
    const fc = buildMordedurasFeatures([biteRow({ locationLat: null })]);
    expect(fc.features).toHaveLength(0);
  });
});

// --- denuncias (coarse centroid) --------------------------------------------

describe("buildDenunciasFeatures", () => {
  const denRow = (over: Partial<DenunciaCentroidRow> = {}): DenunciaCentroidRow => ({
    centroidLat: "-31.4",
    centroidLng: "-64.2",
    province: "Córdoba",
    locality: "Córdoba",
    severity: "high",
    kind: "abandono",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  });

  it("plots the locality centroid and flags the feature as coarse (no exact coord)", () => {
    const fc = buildDenunciasFeatures([denRow()]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-64.2, -31.4]);
    // The coarse marker MUST be set; the props carry no exact lat/lng field.
    expect(fc.features[0].properties.coarse).toBe(true);
    expect(fc.features[0].properties).not.toHaveProperty("locationLat");
    expect(fc.features[0].properties).not.toHaveProperty("centroidLat");
  });

  it("drops reports whose locality has no resolvable centroid", () => {
    const fc = buildDenunciasFeatures([denRow({ centroidLat: null, centroidLng: null })]);
    expect(fc.features).toHaveLength(0);
  });
});

// --- zoonosis ----------------------------------------------------------------

describe("buildZoonosisFeatures", () => {
  it("emits located outbreak signals with disease metadata", () => {
    const row: OutbreakRow = {
      id: "sig-1",
      locationLat: "-24.8",
      locationLng: "-65.4",
      diseaseCode: "rabia",
      diseaseLabel: "Rabia",
      occurredAt: "2026-06-05T00:00:00.000Z",
    };
    const fc = buildZoonosisFeatures([row]);
    expect(fc.features[0].geometry?.coordinates).toEqual([-65.4, -24.8]);
    expect(fc.features[0].properties.diseaseCode).toBe("rabia");
  });
});

// --- refugios ----------------------------------------------------------------

describe("buildRefugiosFeatures", () => {
  it("emits shelter points with token/name/verified, dropping non-located", () => {
    const rows: ShelterRow[] = [
      {
        id: "o1",
        publicToken: "ORG-1",
        displayName: "Refugio Norte",
        locationLat: "-34.5",
        locationLng: "-58.5",
        verified: true,
      },
      {
        id: "o2",
        publicToken: "ORG-2",
        displayName: "Sin ubicación",
        locationLat: null,
        locationLng: null,
        verified: false,
      },
    ];
    const fc = buildRefugiosFeatures(rows);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({
      token: "ORG-1",
      name: "Refugio Norte",
      verified: true,
    });
  });
});

// --- decomisos ---------------------------------------------------------------

describe("buildDecomisosFeatures", () => {
  it("emits case points with code/status", () => {
    const row: DecomisoRow = {
      id: "c1",
      publicCode: "CASE-9",
      status: "open",
      centroidLat: "-32.9",
      centroidLng: "-60.7",
      openedAt: "2026-06-02T00:00:00.000Z",
    };
    const fc = buildDecomisosFeatures([row]);
    expect(fc.features[0].properties).toMatchObject({
      code: "CASE-9",
      status: "open",
      coarse: true,
    });
  });
});

// --- choropleth (graduated symbol, suppressed handling) ---------------------

describe("buildChoroplethFeatures", () => {
  const cell = (over: Partial<ChoroplethCell> = {}): ChoroplethCell => ({
    key: "Buenos Aires|La Plata",
    province: "Buenos Aires",
    locality: "La Plata",
    centroidLat: "-34.92",
    centroidLng: "-57.95",
    value: 12,
    suppressed: false,
    ...over,
  });

  it("plots visible cells carrying the real value", () => {
    const fc = buildChoroplethFeatures([cell()]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-57.95, -34.92]);
    expect(fc.features[0].properties).toEqual({
      province: "Buenos Aires",
      locality: "La Plata",
      value: 12,
      suppressed: false,
    });
  });

  it("renders suppressed cells with value=null (the real count never leaks)", () => {
    const fc = buildChoroplethFeatures([
      cell({ key: "Salta|Cafayate", value: 3, suppressed: true }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.suppressed).toBe(true);
    expect(fc.features[0].properties.value).toBeNull();
  });

  it("drops cells with no resolvable centroid", () => {
    const fc = buildChoroplethFeatures([cell({ centroidLat: null, centroidLng: null })]);
    expect(fc.features).toHaveLength(0);
  });
});

// --- province choropleth (U5: filled polygons, no geometry/centroid) --------

describe("buildProvinceChoroplethFeatures", () => {
  const pCell = (over: Partial<ProvinceChoroplethCell> = {}): ProvinceChoroplethCell => ({
    provinceCode: "AR-B",
    label: "Buenos Aires",
    value: 61,
    ...over,
  });

  it("emits ONE null-geometry feature per province (the polygon comes from the basemap)", () => {
    const fc = buildProvinceChoroplethFeatures([pCell()]);
    expect(fc.features).toHaveLength(1);
    // No point geometry — the map data-joins this to the ar-provinces polygon.
    expect(fc.features[0].geometry).toBeNull();
    expect(fc.features[0].properties).toEqual({
      provinceCode: "AR-B",
      province: "Buenos Aires",
      value: 61,
      suppressed: false,
    });
  });

  it("carries the value verbatim — province cells are NEVER suppressed (no k-anon)", () => {
    // A tiny province value (below the locality k=5 threshold) still shows.
    const fc = buildProvinceChoroplethFeatures([pCell({ provinceCode: "AR-V", value: 2 })]);
    expect(fc.features[0].properties.value).toBe(2);
    expect(fc.features[0].properties.suppressed).toBe(false);
  });

  it("drops cells with an unmappable (empty) province code", () => {
    const fc = buildProvinceChoroplethFeatures([pCell({ provinceCode: "" })]);
    expect(fc.features).toHaveLength(0);
  });
});
