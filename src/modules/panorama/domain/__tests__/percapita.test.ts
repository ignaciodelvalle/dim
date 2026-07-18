// Per-cápita encoding domain (panorama-percapita v1 — PROVINCE grain).
//
// Contract under test:
//  1. Eligibility is a DECLARED per-layer property (PERCAPITA_ELIGIBLE_IDS):
//     only COUNT-shaped province layers where a human-population denominator is
//     meaningful. Rate/% layers, already-normalized layers, reference layers and
//     department-grain layers are excluded.
//  2. perCapitaRate: value10k = count / population * 10_000 (2-decimal round);
//     a missing/invalid denominator yields null — NEVER 0 (no fabricated rate).
//  3. enrichPerCapita joins province cells to the census lookup by normalized
//     province name; an unmatched province surfaces as no-data (per10k null).
//  4. projectPerCapita swaps count → per10k for the map projection; a k-anon
//     suppressed count STAYS suppressed (no rate from a hidden count).
//  5. Census metadata (year/source) reaches the caption footer, never hardcoded.

import { describe, expect, it } from "vitest";

import { PANORAMA_LAYERS, getLayer } from "../layers";
import {
  type CensusLookup,
  PERCAPITA_ELIGIBLE_IDS,
  PERCAPITA_UNIT_LABEL,
  censusMetaOf,
  enrichPerCapita,
  isPercapitaEligible,
  perCapitaRate,
  percapitaEligibleFor,
  percapitaFooterLabel,
  percapitaLayerLabel,
  projectPerCapita,
} from "../percapita";
import type { FeatureCollection, LayerId } from "../types";

const LOOKUP: CensusLookup = {
  populations: {
    "Buenos Aires": 17_569_053,
    CABA: 3_120_612,
    Córdoba: 3_978_984,
    "Tierra del Fuego": 190_641,
  },
  year: 2022,
  source: "INDEC Censo 2022",
};

function provinceFeature(
  province: string,
  count: number | null,
  suppressed = false,
): FeatureCollection["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-60, -35] },
    properties: {
      place: province,
      province,
      locality: null,
      departmentCode: null,
      level: "province",
      count,
      suppressed,
    },
  };
}

function fc(features: FeatureCollection["features"]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("PERCAPITA_ELIGIBLE_IDS — the declared layer eligibility", () => {
  it("declares exactly the count-shaped province event/report layers", () => {
    expect([...PERCAPITA_ELIGIBLE_IDS].sort()).toEqual(
      ["denuncias", "mordeduras", "perdidas", "sintomas"].sort(),
    );
  });

  it("every eligible layer is a COUNT-shaped density point layer (no double-divide risk)", () => {
    // A rate/% layer must never be divided by population again; every eligible
    // layer serves RAW per-province counts (dataType density, point geometry).
    for (const id of PERCAPITA_ELIGIBLE_IDS) {
      const layer = getLayer(id);
      expect(layer, id).toBeDefined();
      expect(layer?.dataType, id).toBe("density");
      expect(layer?.geomType, id).toBe("point");
      expect(layer?.complianceTarget, id).toBeUndefined();
    }
  });

  it("excludes rate/%, already-normalized, index, reference and department-grain layers", () => {
    const excluded: LayerId[] = [
      "cobertura", // % of dogs vaccinated — not per-inhabitant
      "esterilizacion", // % rate
      "microchip", // % rate
      "ppp", // % rate
      "antiparasitario", // % rate
      "reunificacion", // ratePct signal
      "acceso-veterinario", // already per-1.000 pets
      "indice-territorial", // 0-100 index
      "zoonosis", // department grain at national — no department denominator in v1
      "mortalidad", // pet deaths: meaningful denominator is the pet registry, not humans
      "refugios",
      "clinicas",
      "decomisos", // reference pins — individual entities, never counts per unit
    ];
    for (const id of excluded) {
      expect(isPercapitaEligible(id), id).toBe(false);
    }
  });

  it("stays consistent with the registry (no eligible id missing from the catalog)", () => {
    const known = new Set(PANORAMA_LAYERS.map((l) => l.id));
    for (const id of PERCAPITA_ELIGIBLE_IDS) expect(known.has(id), id).toBe(true);
  });
});

describe("percapitaEligibleFor — the view-level gate predicate", () => {
  it("offers per-cápita at province level when every aggregating layer is eligible", () => {
    expect(percapitaEligibleFor(["denuncias"], "province")).toBe(true);
    expect(percapitaEligibleFor(["mordeduras"], "province")).toBe(true);
    // Reference layers never establish a unit — they don't block (bienestar preset).
    expect(percapitaEligibleFor(["denuncias", "decomisos"], "province")).toBe(true);
  });

  it("refuses below province framing (no department denominator in v1)", () => {
    expect(percapitaEligibleFor(["denuncias"], "locality")).toBe(false);
  });

  it("refuses when a non-eligible aggregating layer shares the map (mixed units)", () => {
    // sintomas preset: sintomas + zoonosis — zoonosis has no province denominator
    // (department grain) so ONE shared graduated scale would mix units.
    expect(percapitaEligibleFor(["sintomas", "zoonosis"], "province")).toBe(false);
    expect(percapitaEligibleFor(["perdidas", "reunificacion"], "province")).toBe(false);
    expect(percapitaEligibleFor(["cobertura"], "province")).toBe(false);
  });

  it("refuses an empty view (nothing to normalize)", () => {
    expect(percapitaEligibleFor([], "province")).toBe(false);
  });
});

describe("perCapitaRate — value10k = count / population * 10_000", () => {
  it("computes the per-10k rate, rounded to 2 decimals", () => {
    expect(perCapitaRate(154, 482_019)).toBe(3.19);
    expect(perCapitaRate(100, 17_569_053)).toBe(0.06);
    expect(perCapitaRate(0, 190_641)).toBe(0);
  });

  it("returns null — never 0 — for a missing count (suppressed upstream)", () => {
    expect(perCapitaRate(null, 482_019)).toBeNull();
    expect(perCapitaRate(undefined, 482_019)).toBeNull();
  });

  it("returns null — never 0 — for an invalid denominator", () => {
    expect(perCapitaRate(10, null)).toBeNull();
    expect(perCapitaRate(10, undefined)).toBeNull();
    expect(perCapitaRate(10, 0)).toBeNull();
    expect(perCapitaRate(10, -5)).toBeNull();
    expect(perCapitaRate(10, Number.NaN)).toBeNull();
  });
});

describe("enrichPerCapita — the census join (server-side, name-normalized)", () => {
  it("joins by province name and carries population, per10k and census metadata", () => {
    const out = enrichPerCapita(fc([provinceFeature("Córdoba", 200)]), LOOKUP);
    const p = out.features[0].properties;
    expect(p.population).toBe(3_978_984);
    expect(p.per10k).toBe(0.5);
    expect(p.censusYear).toBe(2022);
    expect(p.censusSource).toBe("INDEC Censo 2022");
    // The raw count is untouched — the projection (not the join) swaps values.
    expect(p.count).toBe(200);
  });

  it("joins accent/case-insensitively (mirrors the bivariate normName rule)", () => {
    const out = enrichPerCapita(fc([provinceFeature("cordoba", 200)]), LOOKUP);
    expect(out.features[0].properties.per10k).toBe(0.5);
  });

  it("surfaces an unmatched province as no-data (null), NEVER 0", () => {
    const out = enrichPerCapita(fc([provinceFeature("Provincia Fantasma", 42)]), LOOKUP);
    const p = out.features[0].properties;
    expect(p.population).toBeNull();
    expect(p.per10k).toBeNull();
    expect(p.count).toBe(42);
  });

  it("keeps a k-anon suppressed cell suppressed — no rate from a hidden count", () => {
    const out = enrichPerCapita(fc([provinceFeature("CABA", null, true)]), LOOKUP);
    const p = out.features[0].properties;
    expect(p.per10k).toBeNull();
    expect(p.suppressed).toBe(true);
  });

  it("passes non-province features through untouched", () => {
    const locality = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [-60, -35] as [number, number] },
      properties: { province: "CABA", locality: "Palermo", level: "locality", count: 7 },
    };
    const out = enrichPerCapita(fc([locality]), LOOKUP);
    expect(out.features[0].properties).toEqual(locality.properties);
  });
});

describe("projectPerCapita — the client projection the map paints", () => {
  it("swaps count → per10k and marks the feature perCapita", () => {
    const enriched = enrichPerCapita(fc([provinceFeature("Córdoba", 200)]), LOOKUP);
    const out = projectPerCapita(enriched);
    const p = out.features[0].properties;
    expect(p.count).toBe(0.5);
    expect(p.perCapita).toBe(true);
    expect(p.suppressed).toBe(false);
  });

  it("a suppressed cell stays suppressed with no value", () => {
    const enriched = enrichPerCapita(fc([provinceFeature("CABA", null, true)]), LOOKUP);
    const out = projectPerCapita(enriched);
    const p = out.features[0].properties;
    expect(p.count).toBeNull();
    expect(p.suppressed).toBe(true);
  });

  it("an un-enriched feature (stale cache, census unavailable) reads as no-data", () => {
    const out = projectPerCapita(fc([provinceFeature("Córdoba", 200)]));
    const p = out.features[0].properties;
    expect(p.count).toBeNull();
    expect(p.suppressed).toBe(false);
  });
});

describe("census metadata → footer (never hardcoded)", () => {
  it("censusMetaOf reads year/source from the enriched collection", () => {
    const enriched = enrichPerCapita(fc([provinceFeature("CABA", 3)]), LOOKUP);
    expect(censusMetaOf(enriched)).toEqual({ year: 2022, source: "INDEC Censo 2022" });
  });

  it("censusMetaOf is null for an un-enriched collection", () => {
    expect(censusMetaOf(fc([provinceFeature("CABA", 3)]))).toBeNull();
  });

  it("percapitaFooterLabel formats the honest footer from the table's metadata", () => {
    expect(percapitaFooterLabel({ year: 2022, source: "INDEC Censo 2022" })).toBe(
      "Tasas por 10.000 habitantes — Censo 2022 (INDEC)",
    );
    // A future census re-seed flows through without a code change.
    expect(percapitaFooterLabel({ year: 2032, source: "INDEC Censo 2032" })).toBe(
      "Tasas por 10.000 habitantes — Censo 2032 (INDEC)",
    );
  });

  it("percapitaLayerLabel appends the per-10k unit to the layer label", () => {
    expect(percapitaLayerLabel("Denuncias de bienestar")).toBe(
      `Denuncias de bienestar (${PERCAPITA_UNIT_LABEL})`,
    );
  });
});
