// Panorama (Centro de Situación Nacional) — pure domain types.
//
// Hexagonal-lite domain layer: NO @/db, NO next, NO React. The biome
// `noRestrictedImports` override for src/modules/*/domain/** enforces this, so
// this module is provably free of infrastructure/framework coupling.
//
// Spec: docs/superpowers/specs/2026-06-21-national-situational-console-design.md
// Plan: docs/superpowers/plans/2026-06-21-national-situational-console.md (F1).

/** The v1 layer catalogue (spec §4 / §13.5). Adding a layer = a new id here +
 * a registry entry in layers.ts + a loader in the infrastructure repository. */
export type LayerId =
  | "perdidas"
  | "mordeduras"
  | "denuncias"
  | "zoonosis"
  | "refugios"
  | "decomisos"
  | "cobertura"
  | "mortalidad";

/** Point/cluster layers plot individual features; choropleth layers shade
 * locality rollups (computed via lib/metrics with k-anon suppression). */
export type GeomType = "point" | "choropleth";

/**
 * Privacy level of a layer's rendered geometry (spec §8).
 *  - `none`   — shown as stored: public data (lost last-seen, opt-in) or
 *               operational data the viewer is cleared for, plus k-anon rollups.
 *  - `coarse` — snapped to the locality centroid; the exact coordinate is NEVER
 *               part of the layer payload (denuncias default).
 *  - `gated`  — exact coordinate only on an authorized, audited open
 *               (emits `welfare_location_viewed`); never in the layer payload.
 */
export type LayerPrivacy = "none" | "coarse" | "gated";

/** Declarative registry entry. The layer list IS the legend (spec §4). */
export type PanoramaLayer = {
  id: LayerId;
  /** Human label (es-AR) shown in the LayerPanel legend. */
  label: string;
  geomType: GeomType;
  /** Loader key the infrastructure repository switches on (e.g. "pet_events:lost"). */
  source: string;
  /** Legend swatch color (hex). */
  color: string;
  /** Whether features are filtered by the viewer's jurisdiction scope.
   * Govt always intersects with its assigned jurisdiction; admin is universal. */
  scopeFilterable: boolean;
  privacy: LayerPrivacy;
};

// --- Typed GeoJSON (minimal subset the layers emit; RFC 7946) ----------------

/** [longitude, latitude] — GeoJSON coordinate order (RFC 7946 §3.1.1). */
export type GeoCoordinate = [number, number];

export type PointGeometry = { type: "Point"; coordinates: GeoCoordinate };

export type PanoramaFeature<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: "Feature";
  /** null for a non-located feature (missing/invalid coordinate pair). */
  geometry: PointGeometry | null;
  properties: P;
};

export type FeatureCollection<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: "FeatureCollection";
  features: Array<PanoramaFeature<P>>;
};

// --- Filters (spec §6) -------------------------------------------------------

export type PanoramaScope = {
  /** Always "AR" in v1. */
  country: string;
  province?: string | null;
  locality?: string | null;
};

export type PanoramaPeriod = {
  /** ISO date (inclusive lower bound). */
  from: string;
  /** ISO date (inclusive upper bound). */
  to: string;
};

export type PanoramaFilters = {
  scope: PanoramaScope;
  period: PanoramaPeriod;
  species?: string | null;
  severity?: string | null;
  caseStatus?: string | null;
};
