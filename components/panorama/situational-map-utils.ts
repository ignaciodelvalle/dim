// Pure helpers for SituationalMap viewport and empty-state logic.
//
// Extracted from SituationalMap.tsx so they can be unit-tested without a DOM
// or maplibre-gl runtime. The component imports these directly; tests import
// from this module to avoid pulling in maplibre-gl which is unavailable in
// the Vitest environment.

import type { PresetFraming } from "@/src/modules/panorama/domain/presets";
import type {
  AggregationLevel,
  FeatureCollection,
  PanoramaScope,
} from "@/src/modules/panorama/domain/types";

// ---------------------------------------------------------------------------
// panorama-ia-v2 §1.1 — derived aggregation level (replaces AggregationToggle)
// ---------------------------------------------------------------------------

/** Camera zoom at/above which the national view drills to the locality mark. */
export const Z_LOCALITY = 5;

/**
 * Derive the aggregation level from (scope, zoom) — the level is no longer a
 * manual control (design §1.1). PO decision #1: BOTH a scope selection AND
 * zooming in trigger the locality mark, preferring the finer precision whenever
 * it renders. A selected province/locality scope WINS over zoom (you asked to
 * look inside a jurisdiction, so you see its localities even zoomed far out);
 * otherwise the national view stays at `province` until the camera crosses
 * `belowZoom` (Z_LOCALITY), which is what kills the national "green blob".
 *
 * Pure — no map, no DOM. `zoom` is the current camera zoom (SituationalMap
 * reads it from maplibre); `belowZoom` is the layer's autoLevel threshold.
 */
export function derivedLevel(
  scope: PanoramaScope,
  zoom: number,
  belowZoom: number = Z_LOCALITY,
): AggregationLevel {
  // Scope wins: any province/locality selection means "look inside" → locality.
  if (scope.province != null || scope.locality != null) return "locality";
  // National scope: the camera decides. At/above the threshold → locality.
  return zoom >= belowZoom ? "locality" : "province";
}

// ---------------------------------------------------------------------------
// panorama magnetic-zoom Phase 2 — hysteresis around the province↔locality flip
// ---------------------------------------------------------------------------
//
// The single Z_LOCALITY threshold makes the level FLICKER: a camera that settles
// right on 5.0 (or a frame that lands there) toggles province↔locality on every
// jitter, each flip triggering a refetch of the active level-sensitive layers.
// A Schmitt-trigger band fixes it: enter locality only well ABOVE the old line,
// fall back to province only well BELOW it, and hold the previous level inside
// the dead-band so tiny oscillations produce ZERO flips.

/** Zoom at/above which national scope ENTERS locality (upper Schmitt edge). */
export const Z_LOCALITY_ENTER = 5.4;
/** Zoom below which national scope EXITS back to province (lower Schmitt edge). */
export const Z_LOCALITY_EXIT = 4.6;

/**
 * Derive the aggregation level with hysteresis — the flip-free counterpart of
 * `derivedLevel`. The scope-wins rule is UNCHANGED (any province/locality scope
 * is always locality). For national scope the flip is a Schmitt trigger:
 *
 *  - `zoom >= Z_LOCALITY_ENTER` → locality (decisive drill-in past the boundary),
 *  - `zoom <  Z_LOCALITY_EXIT`  → province (decisive pull-out below the boundary),
 *  - otherwise (inside the dead-band) → keep `prev` — no flip, no refetch.
 *
 * Pure — no map, no DOM. `prev` is the CURRENT aggregation level (the caller
 * threads it via a ref); it is only consulted for national scope inside the band.
 */
export function derivedLevelWithHysteresis(
  prev: AggregationLevel,
  scope: PanoramaScope,
  zoom: number,
): AggregationLevel {
  // Scope wins over the camera, exactly as `derivedLevel` — a jurisdiction drill
  // always shows its localities regardless of zoom.
  if (scope.province != null || scope.locality != null) return "locality";
  if (zoom >= Z_LOCALITY_ENTER) return "locality";
  if (zoom < Z_LOCALITY_EXIT) return "province";
  return prev;
}

/**
 * Max-zoom a PROGRAMMATIC camera move (initial fit, jurisdiction viewport, preset
 * frame) should clamp to so it lands DECISIVELY below the province↔locality flip.
 * A frame is only "magnetic" when its natural landing zoom falls within ±0.5 of
 * the old Z_LOCALITY line — otherwise it keeps its default max-zoom and lands
 * wherever it naturally would. This snaps the near-boundary case to just under
 * the flip so an automated frame never leaves the level teetering.
 */
export const FRAMING_SNAP_MAX_ZOOM = Z_LOCALITY - 0.25;

/** True when a programmatic landing zoom is close enough to the flip to snap. */
export function shouldSnapFraming(landingZoom: number): boolean {
  return Math.abs(landingZoom - Z_LOCALITY) <= 0.5;
}

// ---------------------------------------------------------------------------
// panorama-event-points Slice 1 — near-zoom real-location dot mode (design D1/D2)
// ---------------------------------------------------------------------------

/**
 * Camera zoom at/above which the map switches from graduated count-bubbles to
 * REAL event-location dots (design D1). Deeper than Z_DIVISIONS (6.5): real dots
 * are only legible — and only defensible (the operator is looking INSIDE their
 * turf) — at street scale. `mode` is ORTHOGONAL to `level` (design D6/A4): the
 * aggregation level stays a 2-state province|locality axis; points mode is an
 * additive dimension that swaps the perdidas mark for individual sighting dots.
 */
export const Z_POINTS = 10;

/**
 * UX-only predicate for near-zoom real-dot mode (design D1/D2). True when the
 * camera is at/beyond Z_POINTS AND a province is in scope (an explicit picker
 * selection or a govt operator's implicit single-province scope).
 *
 * SECURITY (A1): this is a CLIENT UX gate only — it decides whether the console
 * REQUESTS points mode. It is NOT the security boundary. The server independently
 * re-derives points mode (`mode=points` AND a province is actually resolved) and
 * govt users stay bound by `petsScope`; a crafted `?mode=points` with no province
 * MUST NOT return dots. See app/api/panorama/[layer]/route.ts + get-layer-features.
 */
export function pointsEligible(scope: PanoramaScope, zoom: number): boolean {
  return zoom >= Z_POINTS && scope.province != null;
}

// ---------------------------------------------------------------------------
// Empty-state helpers (PR-6)
// ---------------------------------------------------------------------------
//
// Fixes the empty-state overlay firing incorrectly when the only active layer
// is a province choropleth (geometry: null features that color the shared
// basemap polygons). Province choropleth layers ARE visible on the map even
// though their GeoJSON features carry no Point geometry — they drive the polygon
// fill-color expression on the shared ar-provinces basemap source.

/**
 * Minimal subset of ActiveLayer used by the pure helpers here.
 * Must stay structurally compatible with the full ActiveLayer in SituationalMap.tsx.
 */
export type ActiveLayerLike = {
  geomType: "point" | "choropleth";
  level?: string;
  features: FeatureCollection;
};

/**
 * Count features across all active layers that have renderable Point geometry.
 *
 * Province-choropleth layers (geomType="choropleth", level="province") carry
 * features with `geometry: null` — they color the basemap polygon by data-join,
 * not by plotting a GeoJSON Point. Those features are NOT renderable in the
 * traditional sense (countable as "points on the map") but the layer IS visible.
 * Counting them as zero here is intentional — `hasProvinceChoroplethLayer` is
 * the companion guard that tells callers whether to suppress the empty-state.
 */
export function countRenderableFeatures(layers: ActiveLayerLike[]): number {
  return layers.reduce((sum, l) => {
    const withGeometry = l.features.features.filter((f) => f.geometry !== null);
    return sum + withGeometry.length;
  }, 0);
}

/**
 * True when at least one active layer is a province-level choropleth.
 *
 * Province choropleth layers color the local ar-provinces basemap polygons via
 * a data-driven fill expression. Their features carry `geometry: null` (no
 * Point to plot), so `countRenderableFeatures` returns 0 for them. The
 * SituationalMap must NOT show the "Sin datos" overlay when this returns true,
 * because the province fills ARE visible regardless of the point count.
 */
export function hasProvinceChoroplethLayer(layers: ActiveLayerLike[]): boolean {
  return layers.some((l) => l.geomType === "choropleth" && l.level === "province");
}

// ---------------------------------------------------------------------------
// A1 — Autozoom viewport helper (PR-7)
// ---------------------------------------------------------------------------

/**
 * A typed descriptor of the viewport transition the map should execute.
 *
 *  - `fitBounds` — fit the map to a [[minLng,minLat],[maxLng,maxLat]] bounding box.
 *    Used for national (no selection) and province-level zoom.
 *  - `flyTo` — animate (or jump) to a specific coordinate at a given zoom level.
 *    Used for locality-level zoom (locality centroid, no polygon available).
 */
export type ViewportDescriptor =
  | { kind: "fitBounds"; bbox: [[number, number], [number, number]] }
  | { kind: "flyTo"; center: [number, number]; zoom: number };

/** Minimal GeoJSON feature shape needed for bbox computation. */
type ProvinceLike = {
  properties: { code: string; [key: string]: unknown } | null;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
};

/**
 * Compute the bounding box of a single GeoJSON Polygon or MultiPolygon feature.
 * Returns null when the geometry is null or an unrecognised type.
 */
function polygonBbox(feature: ProvinceLike): [[number, number], [number, number]] | null {
  const geom = feature.geometry;
  if (!geom) return null;

  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  function visitRing(ring: [number, number][]) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates as [number, number][][]) {
      visitRing(ring);
    }
  } else if (geom.type === "MultiPolygon") {
    for (const polygon of geom.coordinates as [number, number][][][]) {
      for (const ring of polygon) {
        visitRing(ring);
      }
    }
  } else {
    return null;
  }

  if (!Number.isFinite(minLng) || maxLng <= minLng || maxLat <= minLat) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Compute the viewport descriptor for the current jurisdiction selection.
 *
 * Priority (most → least specific):
 *  1. Locality centroid provided → `flyTo` at that centroid, zoom 9.5.
 *  2. Province code provided → `fitBounds` to the province polygon's bbox.
 *  3. Neither → `fitBounds` to the national fallback bbox.
 *
 * The function never throws; it returns the national bbox in all error cases
 * (unknown province code, missing geometry, empty feature list).
 *
 * @param provinceCode  ISO 3166-2:AR code (e.g. "AR-X") or null for national.
 * @param localityCenter  [lng, lat] centroid of the selected locality, or null.
 * @param provinceFeatures  The loaded ar-provinces basemap features. Expected
 *   to have `properties.code` (ISO code) and Polygon/MultiPolygon geometry.
 * @param nationalBbox  Fallback bbox used when no selection is active or when
 *   the province feature cannot be found.
 */
export function computeJurisdictionViewport(
  provinceCode: string | null,
  localityCenter: [number, number] | null,
  provinceFeatures: ProvinceLike[],
  nationalBbox: [[number, number], [number, number]],
): ViewportDescriptor {
  // Locality is most specific — always zooms to the centroid.
  if (localityCenter !== null) {
    return { kind: "flyTo", center: localityCenter, zoom: 9.5 };
  }

  // Province selected — zoom to the province polygon bbox.
  if (provinceCode !== null && provinceFeatures.length > 0) {
    const feature = provinceFeatures.find((f) => f.properties?.code === provinceCode);
    if (feature) {
      const bbox = polygonBbox(feature);
      if (bbox) return { kind: "fitBounds", bbox };
    }
    // Province code provided but feature not found (e.g. basemap failed to
    // load) — fall through to national.
  }

  // No selection (or province not in basemap) → national bbox.
  return { kind: "fitBounds", bbox: nationalBbox };
}

// ---------------------------------------------------------------------------
// Zoom-driven division activation (PO directive 2026-07-07)
// ---------------------------------------------------------------------------
//
// "A partir de cierto punto SIEMPRE mostrar las localidades" — the admin
// divisions (departamentos / barrios) must appear automatically once the camera
// zooms past a sensible threshold, for ANY operator, with or without an explicit
// province selection. Standard web-map behavior: country → provinces; zoom in →
// departamentos/barrios of whatever province(s) are in view.

/**
 * Camera zoom at/above which admin divisions activate for the province(s) in
 * view. Chosen empirically from the provinces GeoJSON extents: at z≈6.5 roughly
 * one large province fills the viewport width (~7° of longitude at a typical
 * width), so departamento outlines read legibly without clutter; below it the
 * national multi-province view stays clean (provinces only). CABA shares this
 * cutoff — its ~0.19° extent is only reached when the camera is well past it, so
 * its barrios naturally appear only when deeply zoomed in.
 */
export const Z_DIVISIONS = 6.5;

/** A [[minLng,minLat],[maxLng,maxLat]] bounding box. */
export type Bbox = [[number, number], [number, number]];

/** True when two bounding boxes overlap (inclusive edges). Cheap AABB test. */
export function bboxesIntersect(a: Bbox, b: Bbox): boolean {
  const [[aMinLng, aMinLat], [aMaxLng, aMaxLat]] = a;
  const [[bMinLng, bMinLat], [bMaxLng, bMaxLat]] = b;
  return aMinLng <= bMaxLng && aMaxLng >= bMinLng && aMinLat <= bMaxLat && aMaxLat >= bMinLat;
}

/** A province code paired with its precomputed polygon bbox. */
export type ProvinceBbox = { code: string; bbox: Bbox };

/**
 * Precompute a simple bbox per province feature ONCE (perf: point 5 of the
 * directive). Features with unusable geometry are skipped. Cache the result and
 * reuse it across every viewport resolution — the bboxes never change.
 */
export function computeProvinceBboxes(features: ProvinceLike[]): ProvinceBbox[] {
  const out: ProvinceBbox[] = [];
  for (const f of features) {
    const code = f.properties?.code;
    if (typeof code !== "string") continue;
    const bbox = polygonBbox(f);
    if (bbox) out.push({ code, bbox });
  }
  return out;
}

/**
 * Resolve which province(s) should render admin divisions RIGHT NOW.
 *
 * Precedence (point 2 — compose, don't replace):
 *  1. An explicit province selection/scope ALWAYS wins, at any zoom → that one
 *     province (the existing single-province behavior, unchanged).
 *  2. No selection: the camera decides. Below the threshold → [] (clean national
 *     provinces view). At/above it → every province whose bbox intersects the
 *     camera viewport (approximate + cheap; a neighboring-province false positive
 *     is harmless — it just draws extra outlines).
 *
 * Pure — no map, no DOM. Returns ISO province codes; the caller splits CABA
 * (→ barrios) from the rest (→ departamentos).
 */
export function resolveDivisionProvinces(params: {
  selectedProvince: string | null;
  zoom: number;
  cameraBbox: Bbox | null;
  provinceBboxes: ProvinceBbox[];
  threshold?: number;
}): string[] {
  const { selectedProvince, zoom, cameraBbox, provinceBboxes, threshold = Z_DIVISIONS } = params;
  // Selection wins, regardless of zoom.
  if (selectedProvince) return [selectedProvince];
  // No selection: only the camera can activate divisions, past the cutoff.
  if (zoom < threshold || cameraBbox === null) return [];
  return provinceBboxes.filter((p) => bboxesIntersect(p.bbox, cameraBbox)).map((p) => p.code);
}

// ---------------------------------------------------------------------------
// panorama-redesign Fase 1 — preset frame viewport helper
// ---------------------------------------------------------------------------

/**
 * Resolve the viewport for a preset's optional map framing (camera-only —
 * data scope is untouched). Mirrors computeJurisdictionViewport so the frame
 * effect in SituationalMap stays a thin apply step.
 *
 *  - `{ kind: "national" }` → fitBounds to the captured national bbox, or the
 *    AR fallback when the first-load fit hasn't resolved yet.
 *  - `{ kind: "bbox" }` → fitBounds to the explicit bounds.
 *  - absent (null/undefined) → null: the camera MUST NOT move (backward-
 *    compatible presets keep today's behavior).
 *
 * @param framing  The preset's framing field, if any.
 * @param nationalBbox  The bbox captured after the map's initial fit, or null.
 * @param fallbackBbox  The static AR bbox used when no national bbox exists.
 */
export function computePresetFrameViewport(
  framing: PresetFraming | null | undefined,
  nationalBbox: [[number, number], [number, number]] | null,
  fallbackBbox: [[number, number], [number, number]],
): ViewportDescriptor | null {
  if (framing == null) return null;
  if (framing.kind === "bbox") return { kind: "fitBounds", bbox: framing.bounds };
  return { kind: "fitBounds", bbox: nationalBbox ?? fallbackBbox };
}
