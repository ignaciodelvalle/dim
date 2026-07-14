// Panorama ViewState P2 — the declarative capability gate (task #65 / WS-4).
//
// `capabilitiesFor(view, runtime)` is the SINGLE pure function that answers
// "given what the operator selected (the canonical ViewState) plus the runtime
// facts a projection cannot know statically (live zoom, the caller-derived
// aggregation level), HOW must the panorama be shown?". Every surface reads THIS
// instead of re-deriving its own copy of the decision — the coherence invariant
// (map = legend = numbers = caption) stops being defended per-fix and becomes
// structurally impossible: two surfaces reading one value cannot diverge.
//
// This module REPLACES four families of scattered predicates (design §2):
//   1. isMeta ×4 — the `dataType==="rate" && complianceTarget!=null` copy-paste
//      (SituationalMap ×2, MapLegends, map-popup) → the resolved `encoding.kind`.
//   2. bivariate gating — the hardcoded `preset==="brotes-activos"` string
//      (PanoramaConsole) → `allowedControls.bivariateEligible`, a registry
//      predicate that names NO preset id.
//   3. temporal ×~10 — `layer.temporal` reads → `allowedControls.scrubber` +
//      `allowedRepresentations`.
//   4. (P4) points-mode / LOD → `representationPerZoom` (declared here from
//      `renderPolicy`; the runtime band selection is wired in P4).
//
// Pure — NO @/db, NO next, NO React, NO maplibre (hexagonal domain purity,
// enforced by the biome noRestrictedImports override for src/modules/*/domain/**).
// DERIVATION ONLY: this file computes; it never reads component state.

import { roleOf } from "./compatibility";
import { PANORAMA_LAYERS, getLayer, isTemporalLayer } from "./layers";
import type {
  AggregationLevel,
  LayerId,
  PanoramaLayer,
  RenderMode,
  SuppressionStyle,
} from "./types";
import type { EncodingId, PanoramaViewState, Representation } from "./view-state";

// ---------------------------------------------------------------------------
// Runtime inputs — the facts a static projection cannot know
// ---------------------------------------------------------------------------

/**
 * The runtime facts the gate needs beyond the canonical ViewState.
 *
 * `level` is DERIVED (not stored) by the situational-map layer via
 * `derivedLevelWithHysteresis(prev, scope, zoom)` — that derivation is stateful
 * (it consults the previous level inside the Schmitt dead-band), so it lives
 * where the hysteresis state lives (the React map layer), and the caller passes
 * the result in. The gate ECHOES it in `capabilities.level` so every surface
 * reads the ONE value instead of re-deriving its own (design §1.1 / §4.3).
 */
export type CapabilityRuntime = {
  /** live camera zoom — the only continuous input; labels LOD bands (P4). */
  zoom: number;
  /** the caller-derived aggregation level (single source once echoed). */
  level: AggregationLevel;
};

// ---------------------------------------------------------------------------
// Output shape (design §2)
// ---------------------------------------------------------------------------

/** Which modifiers apply — replaces every scattered `layer.temporal` /
 *  preset-string read site. */
export type AllowedControls = {
  /** temporal layers present ⇒ the time-scrubber is live. */
  scrubber: boolean;
  /** scrubbing AND a temporal base ⇒ the valid/transaction bitemporal lens. */
  basisToggle: boolean;
  /** base is a rate-with-target AND a signal is active AND province level ⇒ the
   *  bivariate "riesgo de brotes" 3×3 encoding is offered. NO preset id here. */
  bivariateEligible: boolean;
};

/**
 * The encoding for what is painted (P2 resolves `kind` only — the full first-class
 * Encoding value object, with the scale + legend model, is the P3 consolidation).
 * `kind` is the single source the former isMeta copy-paste read: `choropleth-meta`
 * for a rate layer with a compliance target, `choropleth-seq` otherwise.
 */
export type ResolvedEncoding = {
  kind: EncodingId;
  /** the feature property painted (the rollup value in v1). */
  field: string;
  /** how a k-anon-suppressed cell is drawn (from the base layer's declaration). */
  suppression: SuppressionStyle;
};

/**
 * Camera zoom at/above which points-capable layers swap their aggregated mark
 * for REAL event-location dots — with a province in scope (design D1). Moved
 * here from `situational-map-utils` at P4b: the LOD thresholds are part of the
 * layer DECLARATION the gate projects, not map-component trivia. Deeper than
 * Z_DIVISIONS (6.5): real dots are only legible — and only defensible (the
 * operator is looking INSIDE their turf) — at street scale.
 */
export const Z_POINTS = 10;

/** The representation to draw at each zoom band, per layer — declared from
 *  `renderPolicy` (design §5). P2 DECLARED it; P4b makes the map READ it against
 *  live zoom (`markForZoom`), replacing the imperative `pointsEligible` /
 *  `POINTS_LAYER_IDS` switch (A7). */
export type ZoomRepresentation = {
  /** below the locality band → the national mark (province choropleth / bubble). */
  national: RenderMode;
  /** province/locality in scope, mid zoom → the drilled mark. */
  drilled: RenderMode;
  /** near zoom in scope → real points (if `renderPolicy.points`) else drilled. */
  near: RenderMode;
  /**
   * Camera zoom below which the NATIONAL mark applies regardless of the
   * scope-derived level (from `renderPolicy.autoLevel.belowZoom`). `null` = the
   * layer never forces the national mark (reference pins render at any zoom).
   * This is the structural GHOST fix: scope-wins keeps `level="locality"` at any
   * zoom, so before P4b a scoped operator zooming out to the national frame
   * painted hundreds of stale locality marks — the declared autoLevel was never
   * read at runtime.
   */
  nationalBelowZoom: number | null;
  /** Camera zoom at/above which — with a province in scope — the NEAR band applies. */
  nearAtZoom: number;
  /** near is a REAL-dots mark that needs the dedicated points fetch. */
  pointsCapable: boolean;
};

/** The LOD band the camera is in for one layer (design §5). */
export type ZoomBand = "national" | "drilled" | "near";

/**
 * P4b — resolve the LOD band + mark for one layer at the live camera. Pure
 * `(declaration, zoom, scope) → mark`: evaluated on every render, so no stale
 * imperative state can linger (the A7 fix). Band boundaries come from the
 * layer's own declaration; the near band additionally requires a province in
 * scope (real dots are an inside-your-turf mark — the server independently
 * re-derives this, see get-layer-features).
 */
export function markForZoom(
  rep: ZoomRepresentation,
  zoom: number,
  provinceInScope: boolean,
): { band: ZoomBand; mark: RenderMode } {
  if (provinceInScope && zoom >= rep.nearAtZoom) return { band: "near", mark: rep.near };
  if (rep.nationalBelowZoom !== null && zoom < rep.nationalBelowZoom) {
    return { band: "national", mark: rep.national };
  }
  return { band: "drilled", mark: rep.drilled };
}

export type PanoramaCapabilities = {
  /** the resolved aggregation level — DERIVED, echoed as the single source. */
  level: AggregationLevel;
  /** which modifiers apply. */
  allowedControls: AllowedControls;
  /** which dock tabs / representations light up (temporal off ⇒ no timeline). */
  allowedRepresentations: Representation[];
  /** the encoding for what is painted (scale ALWAYS matches paint — P3 structural). */
  encoding: ResolvedEncoding;
  /** CABA inset: visibility + the SAME encoding the main map uses (P3 structural). */
  insetBehavior: { visible: boolean; encoding: ResolvedEncoding | null };
  /** LOD — the representation per zoom band, per active layer (P4 wires the read). */
  representationPerZoom: Record<string, ZoomRepresentation>;
};

// ---------------------------------------------------------------------------
// Shared registry predicates — the SINGLE definition every former copy reads.
// ---------------------------------------------------------------------------

/** The minimal shape the META predicate needs — every isMeta call site (an
 *  ActiveLayer, a legend row, a popup readout input) is structurally compatible. */
export type MetaLayerLike = { dataType?: string; complianceTarget?: number };

/**
 * The former `isMeta` predicate, defined ONCE. A rate layer with a compliance
 * target renders the classed-step META choropleth (`choropleth-meta`); every
 * other choropleth base renders the sequential scale (`choropleth-seq`). This is
 * the single source the four copy-pasted call sites now read, so they cannot
 * drift from each other or from the gate's resolved `encoding.kind`.
 */
export function isMetaLayer<T extends MetaLayerLike>(
  layer: T,
): layer is T & { complianceTarget: number } {
  return layer.dataType === "rate" && typeof layer.complianceTarget === "number";
}

/** The base (rate|density) layer among the active set, or null. F2 guarantees at
 *  most one base is active, so the first match IS the base. */
function baseLayerOf(layers: readonly LayerId[]): PanoramaLayer | null {
  for (const id of layers) {
    const layer = getLayer(id);
    if (layer && roleOf(layer) === "base") return layer;
  }
  return null;
}

/**
 * Bivariate eligibility. The "riesgo de brotes" 3×3 encoding crosses a coverage
 * axis with an outbreak-signal axis at province framing.
 *
 * P2 CONSTRAINT (zero-UX-change): the bivariate JOIN (`buildBivariateCells`) is
 * still hardcoded to read cobertura × zoonosis, and the old gate was exactly the
 * `brotes-activos` preset — i.e. the active set {cobertura, zoonosis}. So
 * eligibility is pinned to that exact pair. A broader "any rate-with-target base
 * × any signal" predicate would offer the toggle for hand-edited combos (e.g.
 * esterilización × zoonosis, reachable in two clicks) the join CANNOT render —
 * a byte-identity + correctness regression. P3 generalizes the join and this
 * predicate together; until then this names the two layer ids the join supports
 * (layer ids, not a preset id — design §2.1). See the P2 review (2026-07-12).
 */
export function bivariateEligibleFor(layers: readonly LayerId[], level: AggregationLevel): boolean {
  if (level !== "province") return false;
  const active = new Set(layers);
  return active.size === 2 && active.has("cobertura") && active.has("zoonosis");
}

/** Resolve the base layer's encoding kind (design §3 — P2 resolves kind only). */
function resolveEncoding(base: PanoramaLayer | null): ResolvedEncoding {
  if (base === null) {
    return { kind: "choropleth-seq", field: "value", suppression: "muted" };
  }
  let kind: EncodingId;
  if (base.geomType === "choropleth") {
    kind = isMetaLayer(base) ? "choropleth-meta" : "choropleth-seq";
  } else if (roleOf(base) === "reference") {
    kind = "reference";
  } else {
    // density / signal point base → aggregated graduated symbols. The near-zoom
    // real-points swap is an LOD band (representationPerZoom), resolved at P4.
    kind = "graduated";
  }
  return { kind, field: "value", suppression: base.suppressionStyle };
}

/** Declare the per-zoom-band representation for one layer from its renderPolicy. */
function zoomRepresentationOf(layer: PanoramaLayer): ZoomRepresentation {
  const rp = layer.renderPolicy;
  return {
    national: rp.province,
    drilled: rp.locality,
    near: rp.points ?? rp.locality,
    nationalBelowZoom: rp.autoLevel ? rp.autoLevel.belowZoom : null,
    nearAtZoom: Z_POINTS,
    pointsCapable: rp.points != null,
  };
}

/**
 * The per-layer zoom representation, precomputed ONCE from the static registry
 * (renderPolicy never changes at runtime). This is the SAME value
 * `capabilitiesFor` exposes per active layer — exported so render-path memos
 * that run before the gate memo (the console's activeLayers assembly) read the
 * one declaration instead of re-deriving their own copy.
 */
export const ZOOM_REPRESENTATIONS: Readonly<Record<LayerId, ZoomRepresentation>> = (() => {
  const out = {} as Record<LayerId, ZoomRepresentation>;
  for (const layer of PANORAMA_LAYERS) out[layer.id] = zoomRepresentationOf(layer);
  return out;
})();

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * The declarative capability gate. Pure `(view, runtime) → capabilities`. Every
 * panorama surface projects from this ONE value; none re-derives its own.
 */
export function capabilitiesFor(
  view: PanoramaViewState,
  runtime: CapabilityRuntime,
): PanoramaCapabilities {
  const { level } = runtime;
  const layers = view.layers;
  const base = baseLayerOf(layers);

  // Temporal: the scrubber is live iff at least one active layer is event-
  // windowable (isTemporalLayer over the ACTIVE set) — the aggregate that the
  // scattered `temporalAvailable` read reproduced.
  const scrubber = layers.some((id) => isTemporalLayer(id));
  const scrubbing = view.asOf !== null;
  const basisToggle = scrubbing && base !== null && isTemporalLayer(base.id);

  const bivariateEligible = bivariateEligibleFor(layers, level);

  // Representations: registros + stats are always available; the timeline
  // (temporal reproduction) lights up only when the scrubber is live.
  const allowedRepresentations: Representation[] = ["registros", "stats"];
  if (scrubber) allowedRepresentations.push("timeline");

  const encoding = resolveEncoding(base);

  const representationPerZoom: Record<string, ZoomRepresentation> = {};
  for (const id of layers) {
    const rep = ZOOM_REPRESENTATIONS[id];
    if (rep) representationPerZoom[id] = rep;
  }

  // CABA inset: it projects the SAME encoding the main map paints (P3 structural).
  // Visibility depends on the live camera bbox (a runtime the map owns), so the
  // gate exposes the encoding the inset MUST adopt; the map supplies visibility.
  const insetBehavior = {
    visible: level === "province",
    encoding: base !== null ? encoding : null,
  };

  return {
    level,
    allowedControls: { scrubber, basisToggle, bivariateEligible },
    allowedRepresentations,
    encoding,
    insetBehavior,
    representationPerZoom,
  };
}
