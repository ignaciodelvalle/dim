// Pure styling helpers for the U5 province-choropleth render mode.
//
// Extracted from SituationalMap so they are unit-testable WITHOUT importing
// maplibre-gl (and its CSS side-effect). These build the data-driven fill-color
// expression and the legend bounds from a layer's province features — no map
// mutation, no DOM, no external provider. The SituationalMap consumes them.
//
// The color expression mirrors the MapChoropleth approach (a value lookup +
// linear interpolation across a tokenized ramp) but joins on the LOCAL polygon
// `code` property — so it colors the ar-provinces basemap polygons, never an
// external raster.

import type { ExpressionSpecification } from "maplibre-gl";

import { COLOR_NO_DATA, RAMP_BLUE } from "@/lib/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

/** A province feature's properties (as emitted by buildProvinceChoroplethFeatures). */
type ProvinceFeatureProps = { provinceCode?: string; value?: number };

/** value min/max over a province layer's features (for the scale legend). */
export type ScaleBounds = { min: number; max: number };

/**
 * Build the data-driven `fill-color` for a province choropleth.
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. provinces with no value (-1) get COLOR_NO_DATA;
 *  3. the rest are interpolated across [min,max] into RAMP_BLUE.
 * Returns a flat COLOR_NO_DATA expression when the layer has no values, and
 * widens a degenerate single-value range so `interpolate` has distinct stops.
 */
export function provinceColorExpr(features: FeatureCollection): ExpressionSpecification {
  const pairs: Array<[string, number]> = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || typeof p.value !== "number") continue;
    pairs.push([p.provinceCode, p.value]);
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  // No data at all — paint everything neutral.
  if (pairs.length === 0) return COLOR_NO_DATA as unknown as ExpressionSpecification;

  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;

  // value-by-code lookup (default -1 → "no data"). MapLibre `match` labels are
  // string|number; province codes are strings.
  const valueMatch = [
    "match",
    ["get", "code"],
    ...pairs.flatMap(([code, value]) => [code, value] as [string, number]),
    -1,
  ] as unknown as ExpressionSpecification;

  return [
    "case",
    ["==", valueMatch, -1],
    COLOR_NO_DATA,
    ["interpolate", ["linear"], valueMatch, lo, RAMP_BLUE[0], hi, RAMP_BLUE[1]],
  ] as unknown as ExpressionSpecification;
}

/** Compute the value min/max for a province layer's features (scale legend).
 * Returns null when the layer has no numeric values. */
export function provinceValueBounds(features: FeatureCollection): ScaleBounds | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const f of features.features) {
    const v = (f.properties as ProvinceFeatureProps).value;
    if (typeof v !== "number") continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}
