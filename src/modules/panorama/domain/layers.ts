// Panorama layer registry — pure, declarative (spec §4 / §13.5).
//
// Adding a layer is declarative: one entry here. The infrastructure repository
// switches on `source` to load features; the LayerPanel renders this list as
// the legend (color + label). NO @/db / next imports (domain purity).

import { TARGETS } from "@/lib/metrics/targets";

import type { AggregationLevel, LayerDataType, LayerId, PanoramaLayer } from "./types";

// Re-export so callers that need the taxonomy do not also import from types.ts.
export type { LayerDataType };

// --- panorama-ia-v2 descriptor extension (design §2.3) -----------------------

/** Unit noun per level — shared by every layer's caption (es-AR). */
const UNIT: Record<AggregationLevel, string> = {
  province: "provincia",
  locality: "localidad",
};

/**
 * Unit noun for the DIVISION-FILL (choropleth) layers, whose detail tier draws —
 * and, since PO "Option A", aggregates + k-anon-suppresses at — the administrative
 * DIVISION the map actually renders: the departamento/partido everywhere, the
 * barrio in CABA. The old shared `UNIT.locality = "localidad"` mislabeled that
 * tier ("Cada área es una localidad") while the polygon under it was a department.
 * A feminine noun ("división") keeps the caption template's "es una {unit}" grammar
 * correct; the parenthetical names the concrete unit at each scope.
 */
const UNIT_DIVISION: Record<AggregationLevel, string> = {
  province: "provincia",
  locality: "división (departamento/partido, o barrio en CABA)",
};

/**
 * Nacional overview forces the province mark below the locality camera threshold
 * (design §3.1 render-policy — kills the "green blob"). Z_LOCALITY ≈ 5.
 */
const AUTO_PROVINCE = { belowZoom: 5, level: "province" as const };

/**
 * v1 layer catalogue. Colors are a colorblind-distinguishable categorical set
 * (the layer list is the legend). Privacy follows spec §8: denuncias is
 * `coarse` (locality centroid only); everything else is `none` (public opt-in
 * data, operational data the operator is cleared for, or k-anon rollups).
 */
export const PANORAMA_LAYERS: readonly PanoramaLayer[] = [
  // --- point / cluster ---
  {
    id: "perdidas",
    label: "Perdidas / avistajes",
    geomType: "point",
    source: "pet_events:lost",
    color: "#e15759",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Lost/sighting events — event density, aggregated by unit in F1.
    dataType: "density",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
      // panorama-event-points Slice 1 (design D3/D5): at street zoom inside a
      // jurisdiction, perdidas swaps its count-bubbles for REAL sighting dots,
      // rendered through the shared clustered-points path.
      points: "clustered-points",
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "reportes de mascotas perdidas", window: "period" },
  },
  {
    id: "mordeduras",
    label: "Mordeduras / antirrábica",
    geomType: "point",
    source: "pet_events:bite",
    color: "#f28e2b",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Bite incident events — event density, aggregated by unit in F1.
    dataType: "density",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
      // panorama-event-points Slice 2: at street zoom INSIDE the operator's
      // jurisdiction, mordeduras swaps its count-bubbles for REAL incident-location
      // dots (the operator already sees these cases in /gob/vigilancia — no new
      // disclosure; scope-bound server-side by petsScope). Aggregated outside scope.
      points: "clustered-points",
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "eventos de mordedura / antirrábica", window: "period" },
  },
  {
    id: "denuncias",
    label: "Denuncias de bienestar",
    geomType: "point",
    source: "welfare_reports",
    color: "#b07aa1",
    scopeFilterable: true,
    privacy: "coarse",
    temporal: true,
    // Welfare report events — event density, aggregated by unit in F1.
    dataType: "density",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
      // panorama-event-points Slice 3: at street zoom, denuncias render at the
      // LOCALITY CENTROID only — a coarser dot that NEVER exposes the exact
      // report coordinate (anonymous-reporter protection; the exact
      // welfare_reports.location_lat/lng is never SELECTed — loadDenunciaCentroids
      // snaps to the ar_localities centroid). Privacy floor stays coarse.
      points: "clustered-points",
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "denuncias de bienestar", window: "period" },
  },
  {
    id: "zoonosis",
    label: "Zoonosis / señales",
    geomType: "point",
    source: "outbreak_signals",
    color: "#9c755f",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Public-health surveillance signals — aggregated by unit in F1.
    dataType: "signal",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "señales de zoonosis", window: "period" },
  },
  {
    id: "sintomas",
    label: "Síntomas / vigilancia sindrómica",
    geomType: "point",
    source: "pet_events:symptom",
    color: "#edc948",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Symptom-report events — event density, aggregated by unit in F1.
    dataType: "density",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "síntomas reportados", window: "period" },
  },
  {
    id: "reunificacion",
    label: "Reunificación (D4)",
    geomType: "point",
    source: "metrics:reunification",
    // NOT the stash's #59a14f — that collides with cobertura's green.
    color: "#86bcb6",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Reunification rate per unit — graduated symbol size encodes ratePct (0–100).
    dataType: "signal",
    renderPolicy: {
      province: "graduated-symbol",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "tasa de reunificación", window: "period" },
  },
  {
    id: "refugios",
    label: "Refugios",
    geomType: "point",
    source: "organizations:shelter",
    color: "#4e79a7",
    scopeFilterable: true,
    privacy: "none",
    // No time dimension — shelters are a current directory, not an event stream.
    temporal: false,
    // Individual shelter locations — NEVER aggregated (each is a distinct entity).
    dataType: "reference",
    // Reference: pins at every level, ignores autoLevel; suppression is a no-op.
    renderPolicy: { province: "clustered-points", locality: "clustered-points" },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "refugios registrados", window: "current" },
  },
  {
    id: "decomisos",
    label: "Decomisos",
    geomType: "point",
    source: "cases:decomiso",
    color: "#76b7b2",
    scopeFilterable: true,
    privacy: "none",
    temporal: true,
    // Individual decomiso expedientes — NEVER aggregated (each is a distinct case).
    dataType: "reference",
    // Reference: pins at every level, ignores autoLevel; suppression is a no-op.
    renderPolicy: { province: "clustered-points", locality: "clustered-points" },
    suppressionStyle: "muted",
    caption: { unit: UNIT, measure: "decomisos", window: "period" },
  },
  // --- choropleth (locality rollups via lib/metrics) ---
  {
    id: "esterilizacion",
    label: "Cobertura de esterilización",
    geomType: "choropleth",
    source: "metrics:sterilization-coverage",
    color: "#af7aa1",
    scopeFilterable: true,
    privacy: "none",
    // CURRENT-STATE rollup (EXISTS sterilization_performed) — not event-windowed in v1.
    temporal: false,
    // Coverage rate — rendered as choropleth via divergent scale at complianceTarget.
    dataType: "rate",
    // F5: divergent choropleth anchored at the esterilización programmatic benchmark (70%).
    // Province-level rendering anchors the divergent scale at this percentage value.
    // V1 locality level shows count-density (see repository.ts — rate-by-locality deferred).
    complianceTarget: TARGETS.STERILIZATION_COVERAGE_PCT,
    // Rate: fill at both levels (locality fill needs polygons — Fase 2; P0 renders
    // an interim divergent graduated-symbol, §2.3 footnote 1). Suppressed → hatched.
    renderPolicy: {
      province: "choropleth-fill",
      locality: "choropleth-fill",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "hatched",
    caption: { unit: UNIT_DIVISION, measure: "cobertura de esterilización", window: "current" },
  },
  {
    id: "microchip",
    label: "Penetración microchip (C1)",
    geomType: "choropleth",
    source: "metrics:microchip-penetration",
    // NOT the stash's #4e79a7 — that collides with refugios' blue.
    color: "#a0cbe8",
    scopeFilterable: true,
    privacy: "none",
    // CURRENT-STATE rollup (EXISTS active microchip_iso) — not event-windowed in v1.
    temporal: false,
    dataType: "rate",
    // F5: divergent choropleth anchored at the microchip programmatic benchmark.
    complianceTarget: TARGETS.MICROCHIP_PENETRATION_PCT,
    renderPolicy: {
      province: "choropleth-fill",
      locality: "choropleth-fill",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "hatched",
    caption: { unit: UNIT_DIVISION, measure: "penetración de microchip", window: "current" },
  },
  {
    id: "ppp",
    label: "Registro PPP (C7)",
    geomType: "choropleth",
    source: "metrics:ppp-compliance",
    color: "#ff9da7",
    scopeFilterable: true,
    privacy: "none",
    temporal: false,
    dataType: "rate",
    // Ley Prov 14.107 sets no universal % target for the dangerous-breed
    // registry; 80 is the program benchmark (mirrors the microchip/rabies
    // benchmark), not a legal mandate — no TARGETS const exists for this yet.
    complianceTarget: 80,
    renderPolicy: {
      province: "choropleth-fill",
      locality: "choropleth-fill",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "hatched",
    caption: { unit: UNIT_DIVISION, measure: "registro PPP", window: "current" },
  },
  {
    id: "cobertura",
    label: "Cobertura antirrábica (perros, 12m)",
    geomType: "choropleth",
    source: "metrics:rabies-coverage",
    color: "#59a14f",
    scopeFilterable: true,
    privacy: "none",
    // CURRENT-STATE rollup (EXISTS vaccination) — not event-windowed in v1.
    temporal: false,
    // Coverage rate — rendered as choropleth, NOT via the point-aggregation path.
    dataType: "rate",
    // F5: divergent choropleth anchored at the antirrábica legal target (80%).
    // get-panorama-kpis.ts uses coverage.target (also 80) from fetchRabiesCoverage.
    complianceTarget: 80,
    // Rate: fill at both levels (locality fill needs polygons — Fase 2; P0 renders
    // an interim divergent graduated-symbol, §2.3 footnote 1). Suppressed → hatched.
    renderPolicy: {
      province: "choropleth-fill",
      locality: "choropleth-fill",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "hatched",
    caption: { unit: UNIT_DIVISION, measure: "cobertura antirrábica", window: "current" },
  },
  {
    id: "mortalidad",
    label: "Mortalidad / disposición",
    geomType: "choropleth",
    source: "metrics:mortality",
    color: "#bab0ac",
    scopeFilterable: true,
    privacy: "none",
    // CURRENT-STATE rollup (pets.status='deceased') — not event-windowed in v1.
    temporal: false,
    // Mortality density — rendered as choropleth, NOT via the point-aggregation path.
    dataType: "density",
    // Province fill; no locality polygon → graduated symbol when scoped in (§2.3²).
    renderPolicy: {
      province: "choropleth-fill",
      locality: "graduated-symbol",
      autoLevel: AUTO_PROVINCE,
    },
    suppressionStyle: "hatched",
    caption: { unit: UNIT_DIVISION, measure: "mortalidad registrada", window: "current" },
  },
] as const;

const LAYER_BY_ID: ReadonlyMap<LayerId, PanoramaLayer> = new Map(
  PANORAMA_LAYERS.map((layer) => [layer.id, layer]),
);

export function getLayer(id: LayerId): PanoramaLayer | undefined {
  return LAYER_BY_ID.get(id);
}

/** Type guard for an arbitrary string (e.g. a route param /api/panorama/[layer]). */
export function isLayerId(value: string): value is LayerId {
  return LAYER_BY_ID.has(value as LayerId);
}

export const POINT_LAYERS: readonly PanoramaLayer[] = PANORAMA_LAYERS.filter(
  (l) => l.geomType === "point",
);

export const CHOROPLETH_LAYERS: readonly PanoramaLayer[] = PANORAMA_LAYERS.filter(
  (l) => l.geomType === "choropleth",
);

/** Layers that can be reconstructed "as of t" — the TimeScrubber refetches these
 * with `asOf`. Non-temporal layers (refugios + the current-state choropleths) are
 * dimmed while a scrub is active instead of showing stale data as if it were as-of-t. */
export const TEMPORAL_LAYERS: readonly PanoramaLayer[] = PANORAMA_LAYERS.filter((l) => l.temporal);

/** True when the layer is event-windowable in time (F4 temporal reproduction). */
export function isTemporalLayer(id: LayerId): boolean {
  return LAYER_BY_ID.get(id)?.temporal ?? false;
}

// ---------------------------------------------------------------------------
// F1 data-type taxonomy helpers (Panorama v2).
// ---------------------------------------------------------------------------

/**
 * Point layers whose events are AGGREGATED per administrative unit in F1.
 * These are the density (perdidas, mordeduras, denuncias) and signal (zoonosis)
 * layers. They do NOT include reference layers (refugios, decomisos) — those
 * always render as discrete pins.
 */
export const AGGREGATED_POINT_LAYERS: readonly PanoramaLayer[] = PANORAMA_LAYERS.filter(
  (l) => l.geomType === "point" && (l.dataType === "density" || l.dataType === "signal"),
);

/** Ids of the density+signal point layers, for fast membership tests. */
export const AGGREGATED_POINT_IDS: ReadonlySet<LayerId> = new Set(
  AGGREGATED_POINT_LAYERS.map((l) => l.id),
);

/**
 * Reference point layers — individual locations/expedientes that are NEVER
 * aggregated (refugios, decomisos). Their discrete-pin rendering is unchanged.
 */
export const REFERENCE_LAYERS: readonly PanoramaLayer[] = PANORAMA_LAYERS.filter(
  (l) => l.geomType === "point" && l.dataType === "reference",
);

/** True for density/signal point layers that F1 aggregates per unit. */
export function isAggregatedPointLayer(id: LayerId): boolean {
  return AGGREGATED_POINT_IDS.has(id);
}

/**
 * panorama-event-points (design D5): ids of the layers that swap to REAL
 * event-location dots at near zoom (renderPolicy.points set). Slice 1: perdidas
 * only. The console reads THIS to decide the imperative points-mode render switch
 * (A7 — renderPolicy is never read at runtime), keeping descriptor and behavior
 * in sync from a single declarative source.
 */
export const POINTS_LAYER_IDS: ReadonlySet<LayerId> = new Set(
  PANORAMA_LAYERS.filter((l) => l.renderPolicy.points != null).map((l) => l.id),
);

/** True when the layer renders real event-location dots in near-zoom points mode. */
export function isPointsLayer(id: LayerId): boolean {
  return POINTS_LAYER_IDS.has(id);
}
