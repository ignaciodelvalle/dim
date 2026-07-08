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
  | "esterilizacion"
  | "mortalidad";

/** Point/cluster layers plot individual features; choropleth layers shade
 * locality rollups (computed via lib/metrics with k-anon suppression). */
export type GeomType = "point" | "choropleth";

/**
 * The AGGREGATION AXIS of a choropleth layer (U5). This is DISTINCT from the
 * scope filter (PanoramaScope) — the scope narrows WHAT the viewer sees; the
 * level changes HOW it is aggregated and rendered:
 *  - `locality` — per (province, locality) rollup → centroid graduated symbols
 *                 (k-anon k=5 suppression on small cells).
 *  - `province` — per provinceCode rollup → filled choropleth over the local
 *                 ar-provinces polygons (no k-anon: province cells are large).
 * Point layers ignore the level entirely.
 */
export type AggregationLevel = "locality" | "province";

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

/**
 * The data-type taxonomy used for F1 aggregation routing (Panorama v2).
 *
 *  - `"rate"`      — current-state rollup expressing a *rate/coverage* (cobertura).
 *                    Rendered as a province/locality choropleth. Not aggregated by
 *                    the per-unit point aggregation path.
 *  - `"density"`   — event-count-based density layer (perdidas, mordeduras, denuncias).
 *                    F1: one graduated circle per administrative unit (province or
 *                    locality) encoding the event count. Toggle axis applies.
 *  - `"signal"`    — public-health surveillance signal layer (zoonosis).
 *                    Same graduated-circle aggregation as density in F1.
 *  - `"reference"` — individual operational locations that MUST NOT be aggregated
 *                    (refugios, decomisos). Each represents a distinct entity or
 *                    expediente; spatial merging would destroy that identity.
 *                    Rendered as discrete pins regardless of the toggle axis.
 */
export type LayerDataType = "rate" | "density" | "signal" | "reference";

// --- panorama-ia-v2 descriptor extension (design §2) -------------------------

/**
 * How a layer is drawn at a given administrative level.
 *  - `choropleth-fill`  — fill the polygon (a rate at province; a rate at
 *                         locality once locality polygons exist — Fase 2).
 *  - `graduated-symbol` — bubble/circle sized (or diverging-colored) by value;
 *                         used for counts and for the interim locality path of
 *                         rate layers before real locality polygons land.
 *  - `clustered-points` — discrete pins, optionally clustered (reference layers —
 *                         never aggregated).
 */
export type RenderMode = "choropleth-fill" | "graduated-symbol" | "clustered-points";

/**
 * Per-administrative-level render policy — the design §3.1 fix for the national
 * "green blob": nationally a layer fills province polygons; entering a province
 * (scope or zoom) switches to the locality mark. `autoLevel.belowZoom` is the
 * camera threshold that forces `level` (nacional → province) regardless of the
 * point count. The render branch resolves the mark via `derivedLevel(scope,zoom)`
 * then reads `renderPolicy[level]`.
 */
export type RenderPolicy = {
  province: RenderMode;
  locality: RenderMode;
  /** Below this camera zoom, force `level` (nacional overview → province fill). */
  autoLevel?: { belowZoom: number; level: AggregationLevel };
  /**
   * panorama-event-points (design D5): the NEAR-ZOOM mark drawn when points mode
   * is active (camera ≥ Z_POINTS AND a province is in scope — see
   * situational-map-utils `pointsEligible`). Absence = the layer NEVER shows real
   * dots (denuncias, mordeduras until its writer lands, reference layers): points
   * mode falls back to the `level` mark. Only `perdidas` sets this in Slice 1
   * (`clustered-points`). NOTE (A7): this descriptor is documentation of intent;
   * the runtime switch is imperative in PanoramaConsole (it never reads
   * renderPolicy) — the two are kept in sync via `POINTS_LAYER_IDS`.
   */
  points?: RenderMode;
};

/**
 * How a k-anon-suppressed cell is drawn (spatial honesty of the k=5 rule).
 *  - `hatched` — diagonal hatch, perceptually distinct from "no data" (rate /
 *                choropleth layers, where a suppressed area must not read as
 *                a plain grey no-data polygon).
 *  - `muted`   — dimmed neutral (density-point layers; reference layers never
 *                aggregate, so this is a no-op for them).
 */
export type SuppressionStyle = "muted" | "hatched";

/**
 * Declarative raw material for the plain-language per-view caption (design §2.4).
 * The pure builder `captionFor(layer, level, period)` assembles the es-AR
 * sentence; the descriptor only declares the WORDS (never the final sentence),
 * so the domain stays framework-free.
 */
export type LayerCaption = {
  /** Unit noun per level, e.g. { province: "provincia", locality: "localidad" }. */
  unit: Record<AggregationLevel, string>;
  /** The measure in plain es-AR: "cobertura antirrábica", "denuncias de bienestar". */
  measure: string;
  /**
   * How the sentence is anchored in time:
   *  - `period`  → "últimos N días" (event-windowed layers).
   *  - `current` → "estado actual"  (current-state rollups: cobertura, mortalidad).
   */
  window: "period" | "current";
};

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
  /**
   * Whether the layer is event-windowable in time (spec F4 temporal reproduction).
   * `true`  — the loader filters an `occurred_at/created_at/opened_at` so the layer
   *           can be reconstructed "as of t" while the TimeScrubber plays.
   * `false` — no usable time dimension in v1 (refugios) or a CURRENT-STATE rollup
   *           (cobertura/mortalidad are pets.status / EXISTS snapshots, not windowed).
   *           These are DIMMED while a scrub is active rather than shown as if as-of-t.
   */
  temporal: boolean;
  /**
   * F1 data-type taxonomy. Drives which aggregation/rendering path the layer
   * takes in Panorama v2:
   *  - `"rate"` / `"density"` / `"signal"` → see LayerDataType JSDoc.
   *  - `"reference"` → discrete pins; never aggregated by the point-aggregation path.
   */
  dataType: LayerDataType;
  /**
   * F5: the legal/public-health compliance target for `dataType: "rate"` layers.
   * When set, the province choropleth renders as a DIVERGENT scale anchored at
   * this value (below = warning pole, above = good pole). Non-rate layers omit
   * this field — using a diverging scale for a density count is misleading.
   *
   * Unit: same as the layer's `value` property (percentage for cobertura: 0–100).
   */
  complianceTarget?: number;

  // --- panorama-ia-v2 descriptor extension (design §2.2) ---------------------

  /**
   * Per-level render policy (design §3.1). Resolves the "green blob": nationally
   * a layer fills province polygons; entering a province switches to the locality
   * mark. Replaces the render rule previously implicit in SituationalMap.
   */
  renderPolicy: RenderPolicy;

  /**
   * How suppressed (k<5) cells are drawn. Rate/choropleth → "hatched" (distinct
   * from no-data); density-point/reference → "muted".
   */
  suppressionStyle: SuppressionStyle;

  /** Declarative material for the plain-language per-view caption (design §2.4). */
  caption: LayerCaption;
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
