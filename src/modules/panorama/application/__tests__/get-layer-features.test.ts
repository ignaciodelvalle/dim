// Unit tests for getLayerFeatures (F1 Panorama v2 contract).
//
// The infrastructure repository is mocked entirely — no DB, no network. All
// tests verify the use-case orchestration: correct loader is called with the
// right arguments, return value matches the envelope contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/panorama/infrastructure/repository", () => ({
  loadPerdidasByUnit: vi.fn(),
  loadPerdidasEvents: vi.fn(),
  loadMordedurassByUnit: vi.fn(),
  loadBiteEvents: vi.fn(),
  loadDenunciasByUnit: vi.fn(),
  loadDenunciaCentroids: vi.fn(),
  loadZoonosisByUnit: vi.fn(),
  loadShelters: vi.fn(),
  loadDecomisos: vi.fn(),
  loadChoroplethByLevel: vi.fn(),
}));

import type {
  AggregatedPointRows,
  ChoroplethRows,
  PointEventsRows,
} from "@/src/modules/panorama/infrastructure/repository";
import {
  loadBiteEvents,
  loadChoroplethByLevel,
  loadDecomisos,
  loadDenunciaCentroids,
  loadDenunciasByUnit,
  loadMordedurassByUnit,
  loadPerdidasByUnit,
  loadPerdidasEvents,
  loadShelters,
  loadZoonosisByUnit,
} from "@/src/modules/panorama/infrastructure/repository";

import { getLayerFeatures, resolvePointsMode } from "../get-layer-features";

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

/** A minimal AggregatedPointRows envelope for the per-unit loaders. */
function aggRows(over: Partial<AggregatedPointRows> = {}): AggregatedPointRows {
  return {
    cells: [
      {
        key: "Buenos Aires",
        province: "Buenos Aires",
        locality: null,
        centroidLat: "-34.6037000",
        centroidLng: "-58.3816000",
        count: 12,
        suppressed: false,
      },
    ],
    suppressedCount: 0,
    truncated: false,
    ...over,
  };
}

const mockLoadPerdidas = vi.mocked(loadPerdidasByUnit);
const mockLoadPerdidasEvents = vi.mocked(loadPerdidasEvents);
const mockLoadMordeduras = vi.mocked(loadMordedurassByUnit);
const mockLoadBiteEvents = vi.mocked(loadBiteEvents);
const mockLoadDenuncias = vi.mocked(loadDenunciasByUnit);
const mockLoadDenunciaCentroids = vi.mocked(loadDenunciaCentroids);
const mockLoadZoonosis = vi.mocked(loadZoonosisByUnit);
const mockLoadShelters = vi.mocked(loadShelters);
const mockLoadDecomisos = vi.mocked(loadDecomisos);
const mockLoadChoropleth = vi.mocked(loadChoroplethByLevel);

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// F1 density+signal loaders — aggregated point contract
// ---------------------------------------------------------------------------

describe("getLayerFeatures — perdidas (F1 aggregated point)", () => {
  it("calls loadPerdidasByUnit with (level, actor, jurisdictions, since, asOf) and returns aggregated envelope", async () => {
    const rows = aggRows();
    mockLoadPerdidas.mockResolvedValue(rows);

    const actor = { role: "govt" as const };
    const jur = [{ province: "Buenos Aires", locality: "La Plata" }];
    const since = new Date("2026-06-01T00:00:00.000Z");
    const asOf = new Date("2026-06-15T00:00:00.000Z");

    const result = await getLayerFeatures("perdidas", actor, jur, { since, asOf }, "province");

    expect(mockLoadPerdidas).toHaveBeenCalledOnce();
    expect(mockLoadPerdidas).toHaveBeenCalledWith(
      "province",
      actor,
      jur,
      since,
      asOf,
      undefined,
      undefined,
    );

    // Return shape: aggregated features + envelope.
    expect(result.level).toBe("province");
    expect(result.truncated).toBe(false);
    expect(result.suppressedCount).toBe(0);
    // One feature per cell.
    expect(result.features.features).toHaveLength(1);
  });

  it("threads asOf into the loader — asOf is NOT a post-fetch filter", async () => {
    mockLoadPerdidas.mockResolvedValue(aggRows());

    const asOf = new Date("2026-06-08T00:00:00.000Z");
    await getLayerFeatures(
      "perdidas",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z"), asOf },
      "locality",
    );

    expect(mockLoadPerdidas).toHaveBeenCalledWith(
      "locality",
      { role: "admin" },
      [],
      expect.any(Date),
      asOf,
      undefined,
      undefined,
    );
  });

  it("passes actor+jurisdictions through without widening scope", async () => {
    mockLoadPerdidas.mockResolvedValue(aggRows());
    const jur = [{ province: "Salta", locality: "Salta" }];

    await getLayerFeatures("perdidas", { role: "govt" }, jur, {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(mockLoadPerdidas).toHaveBeenCalledWith(
      expect.any(String),
      { role: "govt" },
      jur,
      expect.any(Date),
      undefined,
      undefined,
      undefined,
    );
  });

  it("returns buildAggregatedPointFeatures output with correct level in envelope", async () => {
    mockLoadPerdidas.mockResolvedValue(aggRows({ truncated: true, suppressedCount: 2 }));

    const result = await getLayerFeatures(
      "perdidas",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
    );

    expect(result.level).toBe("locality");
    expect(result.truncated).toBe(true);
    expect(result.suppressedCount).toBe(2);
    expect(result.features.type).toBe("FeatureCollection");
  });
});

// ---------------------------------------------------------------------------
// panorama-event-points Slice 1 — near-zoom REAL sighting dots + server gate.
// ---------------------------------------------------------------------------

function eventRows(over: Partial<PointEventsRows> = {}): PointEventsRows {
  return {
    rows: [
      {
        publicToken: "DIM-AAAA-1111",
        name: "Firulai",
        species: "dog",
        status: "lost",
        locationLat: "-34.6037000",
        locationLng: "-58.3816000",
        lastSeenAt: "2026-06-19T12:00:00.000Z",
        locationSource: "gps",
      },
    ],
    truncated: false,
    noCoordCount: 0,
    ...over,
  };
}

describe("resolvePointsMode (server-authoritative gate — A1)", () => {
  it("is false when mode is not 'points' regardless of province", () => {
    expect(resolvePointsMode(null, true)).toBe(false);
    expect(resolvePointsMode("aggregated", true)).toBe(false);
  });

  it("is false when mode=points but NO province is resolved (no national dot-dump)", () => {
    // admin session with mode=points and no province → aggregated, never dots.
    expect(resolvePointsMode("points", false)).toBe(false);
  });

  it("is true only when mode=points AND a province is resolved", () => {
    expect(resolvePointsMode("points", true)).toBe(true);
  });
});

describe("getLayerFeatures — perdidas points mode (Slice 1)", () => {
  it("routes to loadPerdidasEvents (NOT the aggregated loader) and returns a points envelope", async () => {
    mockLoadPerdidasEvents.mockResolvedValue(eventRows({ truncated: true, noCoordCount: 3 }));

    const actor = { role: "govt" as const };
    const jur = [{ province: "Córdoba", locality: "Córdoba" }];
    const since = new Date("2026-06-01T00:00:00.000Z");
    const asOf = new Date("2026-06-15T00:00:00.000Z");

    const result = await getLayerFeatures(
      "perdidas",
      actor,
      jur,
      { since, asOf },
      "locality",
      "Córdoba",
      "Córdoba",
      /* pointsMode */ true,
    );

    // The aggregated loader is NOT called; the per-event dot loader is.
    expect(mockLoadPerdidas).not.toHaveBeenCalled();
    expect(mockLoadPerdidasEvents).toHaveBeenCalledWith(
      actor,
      jur,
      since,
      asOf,
      "Córdoba",
      "Córdoba",
    );
    expect(result.mode).toBe("points");
    expect(result.truncated).toBe(true);
    // Distinct residual field (A6) — NOT noLocalityCount.
    expect(result.sinUbicacionCount).toBe(3);
    expect(result.features.features).toHaveLength(1);
    // The dot carries the public-by-consent props, no province (A3/D7).
    expect(result.features.features[0].properties).toMatchObject({
      token: "DIM-AAAA-1111",
      locationSource: "gps",
    });
    expect(
      (result.features.features[0].properties as Record<string, unknown>).province,
    ).toBeUndefined();
  });

  it("falls back to the aggregated loader when pointsMode is false (default)", async () => {
    mockLoadPerdidas.mockResolvedValue(aggRows());

    const result = await getLayerFeatures(
      "perdidas",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
    );

    expect(mockLoadPerdidasEvents).not.toHaveBeenCalled();
    expect(mockLoadPerdidas).toHaveBeenCalledOnce();
    expect(result.mode).toBeUndefined();
  });
});

describe("getLayerFeatures — mordeduras (F1 aggregated point)", () => {
  it("calls loadMordedurassByUnit with correct args and returns envelope", async () => {
    mockLoadMordeduras.mockResolvedValue(aggRows());

    const actor = { role: "admin" as const };
    const asOf = new Date("2026-06-08T00:00:00.000Z");

    const result = await getLayerFeatures(
      "mordeduras",
      actor,
      [],
      { since: new Date("2026-06-01T00:00:00.000Z"), asOf },
      "province",
    );

    expect(mockLoadMordeduras).toHaveBeenCalledWith(
      "province",
      actor,
      [],
      expect.any(Date),
      asOf,
      undefined,
      undefined,
    );
    expect(result.level).toBe("province");
  });
});

// ---------------------------------------------------------------------------
// panorama-event-points Slice 2 — mordeduras REAL incident dots (operator-scoped).
// ---------------------------------------------------------------------------

describe("getLayerFeatures — mordeduras points mode (Slice 2)", () => {
  it("routes to loadBiteEvents (NOT the aggregated loader), scope-bound, and returns a points envelope", async () => {
    mockLoadBiteEvents.mockResolvedValue({
      rows: [
        {
          id: "evt-1",
          locationLat: "-31.4200000",
          locationLng: "-64.1800000",
          incidentType: "bite_inflicted",
          severity: "moderate",
          occurredAt: "2026-06-19T12:00:00.000Z",
        },
      ],
      truncated: false,
      noCoordCount: 4,
    });

    const actor = { role: "govt" as const };
    const jur = [{ province: "Córdoba", locality: "Córdoba" }];
    const since = new Date("2026-06-01T00:00:00.000Z");

    const result = await getLayerFeatures(
      "mordeduras",
      actor,
      jur,
      { since },
      "locality",
      "Córdoba",
      "Córdoba",
      /* pointsMode */ true,
    );

    // The aggregated loader is NOT called; the per-event dot loader is — scope
    // (adminProvince/Locality) is threaded so a govt user stays jurisdiction-bound.
    expect(mockLoadMordeduras).not.toHaveBeenCalled();
    expect(mockLoadBiteEvents).toHaveBeenCalledWith(
      actor,
      jur,
      since,
      undefined,
      "Córdoba",
      "Córdoba",
    );
    expect(result.mode).toBe("points");
    // Older coord-less bites → honest residual (not a fake dot).
    expect(result.sinUbicacionCount).toBe(4);
    expect(result.features.features).toHaveLength(1);
    // Bite dot carries NO token/pet and NO province → no k-anon unit-history fetch.
    const props = result.features.features[0].properties as Record<string, unknown>;
    expect(props.incidentType).toBe("bite_inflicted");
    expect(props.province).toBeUndefined();
    expect(props.token).toBeUndefined();
  });

  it("falls back to the aggregated loader when pointsMode is false", async () => {
    mockLoadMordeduras.mockResolvedValue(aggRows());
    const result = await getLayerFeatures(
      "mordeduras",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
    );
    expect(mockLoadBiteEvents).not.toHaveBeenCalled();
    expect(mockLoadMordeduras).toHaveBeenCalledOnce();
    expect(result.mode).toBeUndefined();
  });
});

describe("getLayerFeatures — denuncias (F1 aggregated point)", () => {
  it("calls loadDenunciasByUnit — exact coordinate never leaves repository", async () => {
    const rows = aggRows({
      cells: [
        {
          key: "Córdoba|Córdoba",
          province: "Córdoba",
          locality: "Córdoba",
          centroidLat: "-31.4200000",
          centroidLng: "-64.1800000",
          count: 7,
          suppressed: false,
        },
      ],
    });
    mockLoadDenuncias.mockResolvedValue(rows);

    const jur = [{ province: "Córdoba", locality: "Córdoba" }];
    const result = await getLayerFeatures(
      "denuncias",
      { role: "govt" },
      jur,
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
    );

    expect(mockLoadDenuncias).toHaveBeenCalledWith(
      "locality",
      { role: "govt" },
      jur,
      expect.any(Date),
      undefined,
      undefined,
      undefined,
    );
    expect(result.features.features).toHaveLength(1);
    expect(result.level).toBe("locality");
  });
});

// ---------------------------------------------------------------------------
// panorama-event-points Slice 3 — denuncias LOCALITY-CENTROID dots.
// The exact welfare_reports coordinate is NEVER selected (anonymous-reporter
// invariant); loadDenunciaCentroids snaps to the ar_localities centroid.
// ---------------------------------------------------------------------------

describe("getLayerFeatures — denuncias points mode (Slice 3)", () => {
  it("routes to loadDenunciaCentroids and emits COARSE centroid features (never exact coord)", async () => {
    mockLoadDenunciaCentroids.mockResolvedValue({
      rows: [
        {
          // ALREADY the locality centroid — the loader never returns the exact coord.
          centroidLat: "-31.4200000",
          centroidLng: "-64.1800000",
          province: "Córdoba",
          locality: "Córdoba",
          severity: "high",
          kind: "physical_abuse",
          createdAt: "2026-06-19T12:00:00.000Z",
        },
      ],
      truncated: false,
    });

    const actor = { role: "govt" as const };
    const jur = [{ province: "Córdoba", locality: "Córdoba" }];
    const since = new Date("2026-06-01T00:00:00.000Z");

    const result = await getLayerFeatures(
      "denuncias",
      actor,
      jur,
      { since },
      "locality",
      "Córdoba",
      "Córdoba",
      /* pointsMode */ true,
    );

    expect(mockLoadDenuncias).not.toHaveBeenCalled();
    expect(mockLoadDenunciaCentroids).toHaveBeenCalledWith(
      actor,
      jur,
      since,
      undefined,
      "Córdoba",
      "Córdoba",
    );
    expect(result.mode).toBe("points");
    expect(result.features.features).toHaveLength(1);
    // The dot is flagged COARSE — the popup/drawer must say "ubicación aproximada".
    const props = result.features.features[0].properties as Record<string, unknown>;
    expect(props.coarse).toBe(true);
    // Plotted at the locality centroid we handed the loader (never an exact addr).
    expect(result.features.features[0].geometry).toMatchObject({
      coordinates: [-64.18, -31.42],
    });
  });
});

describe("getLayerFeatures — zoonosis (F1 aggregated signal point)", () => {
  it("calls loadZoonosisByUnit and returns aggregated envelope", async () => {
    mockLoadZoonosis.mockResolvedValue(aggRows());

    const result = await getLayerFeatures(
      "zoonosis",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "province",
    );

    expect(mockLoadZoonosis).toHaveBeenCalledWith(
      "province",
      { role: "admin" },
      [],
      expect.any(Date),
      undefined,
      undefined,
      undefined,
    );
    expect(result.level).toBe("province");
    expect(result.features.type).toBe("FeatureCollection");
  });

  // panorama-event-points Slice 3 — zoonosis TIER DECISION: stays aggregated even
  // in points mode. Both outbreak_signal writers persist NO columnar
  // location_lat/lng (only pet_jurisdiction_* snapshots), so there is nothing to
  // plot as a real dot. Rendering an aggregate/centroid is the honest choice
  // (plan §5 "if the writer sets no coords → aggregated + document the gap").
  it("stays AGGREGATED in points mode — no real dots (writer persists no coords)", async () => {
    mockLoadZoonosis.mockResolvedValue(aggRows());

    const result = await getLayerFeatures(
      "zoonosis",
      { role: "govt" },
      [{ province: "Córdoba", locality: "Córdoba" }],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
      "Córdoba",
      "Córdoba",
      /* pointsMode */ true,
    );

    // Still the per-unit aggregated loader — points mode is a no-op for zoonosis.
    expect(mockLoadZoonosis).toHaveBeenCalledOnce();
    expect(result.mode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Reference layers — discrete pins, unaffected by the aggregation axis.
// ---------------------------------------------------------------------------

describe("getLayerFeatures — refugios (reference layer)", () => {
  it("calls loadShelters (no period, no level) and returns point features", async () => {
    mockLoadShelters.mockResolvedValue({
      rows: [
        {
          id: "org-1",
          publicToken: "SH-001",
          displayName: "Refugio Luna",
          locationLat: "-34.92",
          locationLng: "-57.95",
          verified: true,
        },
      ],
      truncated: false,
    });

    const result = await getLayerFeatures(
      "refugios",
      { role: "govt" },
      [{ province: "Buenos Aires", locality: "La Plata" }],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      // level is ignored by reference layers
      "province",
    );

    expect(mockLoadShelters).toHaveBeenCalledOnce();
    expect(result.truncated).toBe(false);
    expect(result.suppressedCount).toBe(0);
    expect(result.features.features).toHaveLength(1);
    // Reference layers return level="locality" (envelope default — not driven by toggle).
    expect(result.level).toBe("locality");
  });
});

describe("getLayerFeatures — decomisos (reference layer)", () => {
  it("calls loadDecomisos and returns point features", async () => {
    mockLoadDecomisos.mockResolvedValue({
      rows: [
        {
          id: "case-1",
          publicCode: "DEC-001",
          status: "open",
          centroidLat: "-34.92",
          centroidLng: "-57.95",
          openedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      truncated: false,
    });

    const result = await getLayerFeatures("decomisos", { role: "admin" }, [], {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(mockLoadDecomisos).toHaveBeenCalledOnce();
    expect(result.features.features).toHaveLength(1);
    expect(result.level).toBe("locality");
  });
});

// ---------------------------------------------------------------------------
// Choropleth layers — unchanged contract, both levels.
// ---------------------------------------------------------------------------

describe("getLayerFeatures — mortalidad (LOCALITY choropleth)", () => {
  it("delegates to loadChoroplethByLevel at locality level and echoes the envelope", async () => {
    mockLoadChoropleth.mockResolvedValue({
      cells: [
        {
          key: "Buenos Aires|La Plata",
          province: "Buenos Aires",
          locality: "La Plata",
          centroidLat: "-34.92",
          centroidLng: "-57.95",
          value: 12,
          suppressed: false,
        },
        {
          key: "Salta|Cafayate",
          province: "Salta",
          locality: "Cafayate",
          centroidLat: "-26.07",
          centroidLng: "-65.98",
          value: null,
          suppressed: true,
        },
      ],
      suppressedCount: 1,
      truncated: false,
    } as ChoroplethRows);

    // Default level is "locality".
    const result = await getLayerFeatures("mortalidad", { role: "admin" }, [], {
      since: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(mockLoadChoropleth).toHaveBeenCalledWith(
      "mortality",
      "locality",
      { role: "admin" },
      [],
      undefined,
      undefined,
    );
    expect(result.features.features).toHaveLength(2);
    expect(result.suppressedCount).toBe(1);
    expect(result.level).toBe("locality");
    const suppressed = result.features.features.find(
      (f) => (f.properties as { suppressed?: boolean }).suppressed === true,
    );
    expect((suppressed?.properties as { value: number | null }).value).toBeNull();
  });
});

describe("getLayerFeatures — cobertura (PROVINCE choropleth)", () => {
  it("delegates to loadChoroplethByLevel at province level (filled polygons, ratePct values)", async () => {
    mockLoadChoropleth.mockResolvedValue({
      cells: [
        // value = ratePct (true percentage, not raw count) — the rate-as-count fix.
        { provinceCode: "AR-B", label: "Buenos Aires", value: 61 },
        { provinceCode: "AR-X", label: "Córdoba", value: 9 },
      ],
      truncated: false,
    } as unknown as ChoroplethRows);

    const result = await getLayerFeatures(
      "cobertura",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "province",
    );

    expect(mockLoadChoropleth).toHaveBeenCalledWith(
      "rabies-coverage",
      "province",
      { role: "admin" },
      [],
      undefined,
      undefined,
    );
    expect(result.level).toBe("province");
    expect(result.features.features).toHaveLength(2);
    expect(result.features.features[0].geometry).toBeNull();
    expect(result.features.features[0].properties).toMatchObject({
      provinceCode: "AR-B",
      value: 61,
      suppressed: false,
    });
    expect(result.suppressedCount).toBe(0);
  });
});

describe("getLayerFeatures — esterilizacion (North-Star PROVINCE choropleth)", () => {
  it("routes to sterilization-coverage metric (ratePct values, divergent at target 70)", async () => {
    mockLoadChoropleth.mockResolvedValue({
      cells: [
        { provinceCode: "AR-B", label: "Buenos Aires", value: 72 },
        { provinceCode: "AR-X", label: "Córdoba", value: 58 },
      ],
      truncated: false,
    } as unknown as ChoroplethRows);

    const result = await getLayerFeatures(
      "esterilizacion",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "province",
    );

    expect(mockLoadChoropleth).toHaveBeenCalledWith(
      "sterilization-coverage",
      "province",
      { role: "admin" },
      [],
      undefined,
      undefined,
    );
    expect(result.level).toBe("province");
    expect(result.features.features).toHaveLength(2);
    expect(result.features.features[0].properties).toMatchObject({
      provinceCode: "AR-B",
      value: 72,
    });
  });

  it("routes to sterilization-coverage at locality level (count-density, v1)", async () => {
    mockLoadChoropleth.mockResolvedValue({
      cells: [],
      suppressedCount: 0,
      noLocalityCount: 0,
      truncated: false,
    } as ChoroplethRows);

    const result = await getLayerFeatures(
      "esterilizacion",
      { role: "admin" },
      [],
      { since: new Date("2026-06-01T00:00:00.000Z") },
      "locality",
    );

    expect(mockLoadChoropleth).toHaveBeenCalledWith(
      "sterilization-coverage",
      "locality",
      { role: "admin" },
      [],
      undefined,
      undefined,
    );
    expect(result.level).toBe("locality");
  });
});
