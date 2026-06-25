// Pure helpers for SituationalMap empty-state logic.
//
// Extracted from SituationalMap.tsx so they can be unit-tested without a DOM
// or maplibre-gl runtime. The component imports these directly; tests import
// from this module to avoid pulling in maplibre-gl which is unavailable in
// the Vitest environment.
//
// PR-6: fixes the empty-state overlay firing incorrectly when the only active
// layer is a province choropleth (geometry: null features that color the shared
// basemap polygons). Province choropleth layers ARE visible on the map even
// though their GeoJSON features carry no Point geometry — they drive the polygon
// fill-color expression on the shared ar-provinces basemap source.

import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

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
