// Panorama layer registry — pure, declarative (spec §4 / §13.5).
//
// Adding a layer is declarative: one entry here. The infrastructure repository
// switches on `source` to load features; the LayerPanel renders this list as
// the legend (color + label). NO @/db / next imports (domain purity).

import type { LayerId, PanoramaLayer } from "./types";

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
  },
  {
    id: "mordeduras",
    label: "Mordeduras / antirrábica",
    geomType: "point",
    source: "pet_events:bite",
    color: "#f28e2b",
    scopeFilterable: true,
    privacy: "none",
  },
  {
    id: "denuncias",
    label: "Denuncias de bienestar",
    geomType: "point",
    source: "welfare_reports",
    color: "#b07aa1",
    scopeFilterable: true,
    privacy: "coarse",
  },
  {
    id: "zoonosis",
    label: "Zoonosis / señales",
    geomType: "point",
    source: "outbreak_signals",
    color: "#9c755f",
    scopeFilterable: true,
    privacy: "none",
  },
  {
    id: "refugios",
    label: "Refugios",
    geomType: "point",
    source: "organizations:shelter",
    color: "#4e79a7",
    scopeFilterable: true,
    privacy: "none",
  },
  {
    id: "decomisos",
    label: "Decomisos",
    geomType: "point",
    source: "cases:decomiso",
    color: "#76b7b2",
    scopeFilterable: true,
    privacy: "none",
  },
  // --- choropleth (locality rollups via lib/metrics) ---
  {
    id: "cobertura",
    label: "Cobertura antirrábica",
    geomType: "choropleth",
    source: "metrics:rabies-coverage",
    color: "#59a14f",
    scopeFilterable: true,
    privacy: "none",
  },
  {
    id: "mortalidad",
    label: "Mortalidad / disposición",
    geomType: "choropleth",
    source: "metrics:mortality",
    color: "#bab0ac",
    scopeFilterable: true,
    privacy: "none",
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
