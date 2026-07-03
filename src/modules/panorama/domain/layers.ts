// Panorama layer registry — pure, declarative (spec §4 / §13.5).
//
// Adding a layer is declarative: one entry here. The infrastructure repository
// switches on `source` to load features; the LayerPanel renders this list as
// the legend (color + label). NO @/db / next imports (domain purity).

import { TARGETS } from "@/lib/metrics/targets";

import type { LayerDataType, LayerId, PanoramaLayer } from "./types";

// Re-export so callers that need the taxonomy do not also import from types.ts.
export type { LayerDataType };

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
