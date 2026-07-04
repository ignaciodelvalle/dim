// Pure helpers for SituationalMap viewport and empty-state logic.
//
// Extracted from SituationalMap.tsx so they can be unit-tested without a DOM
// or maplibre-gl runtime. The component imports these directly; tests import
// from this module to avoid pulling in maplibre-gl which is unavailable in
// the Vitest environment.

import type { PresetFraming } from "@/src/modules/panorama/domain/presets";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

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
