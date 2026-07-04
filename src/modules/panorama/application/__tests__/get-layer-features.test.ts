// Unit tests for getLayerFeatures (F1 Panorama v2 contract).
//
// The infrastructure repository is mocked entirely — no DB, no network. All
// tests verify the use-case orchestration: correct loader is called with the
// right arguments, return value matches the envelope contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/panorama/infrastructure/repository", () => ({
  loadPerdidasByUnit: vi.fn(),
  loadMordedurassByUnit: vi.fn(),
  loadDenunciasByUnit: vi.fn(),
  loadZoonosisByUnit: vi.fn(),
  loadShelters: vi.fn(),
  loadDecomisos: vi.fn(),
  loadChoroplethByLevel: vi.fn(),
}));

import type {
  AggregatedPointRows,
  ChoroplethRows,
} from "@/src/modules/panorama/infrastructure/repository";
import {
  loadChoroplethByLevel,
  loadDecomisos,
  loadDenunciasByUnit,
  loadMordedurassByUnit,
  loadPerdidasByUnit,
  loadShelters,
  loadZoonosisByUnit,
} from "@/src/modules/panorama/infrastructure/repository";

import { getLayerFeatures } from "../get-layer-features";

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
const mockLoadMordeduras = vi.mocked(loadMordedurassByUnit);
const mockLoadDenuncias = vi.mocked(loadDenunciasByUnit);
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
