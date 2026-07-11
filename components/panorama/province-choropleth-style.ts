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

import {
  type ClassScale,
  computeClassScale,
  stepColorExpr,
} from "@/components/panorama/class-scale";
import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  divergentStops,
} from "@/lib/analytics/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

/** A province feature's properties (as emitted by buildProvinceChoroplethFeatures). */
type ProvinceFeatureProps = { provinceCode?: string; value?: number };

/**
 * panorama-ia-v2 §3.2 — the FIXED scale domain for `dataType: "rate"` layers.
 *
 * Rate choropleths (cobertura, esterilización) are percentages: color every
 * province on the SAME 0–100 axis so a single hot province cannot wash out the
 * rest and the compliance-target anchor stays comparable across jurisdictions.
 * Passed as `domainBounds` to provinceDivergentColorExpr for rate layers instead
 * of the observed range (which would rescale per dataset and break comparability).
 */
export const FIXED_RATE_DOMAIN = { min: 0, max: 100 } as const;

/** value min/max over a province layer's features (for the scale legend). */
export type ScaleBounds = { min: number; max: number };

/**
 * Build the data-driven `fill-color` for a province choropleth.
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. provinces with no value (-1) get COLOR_NO_DATA;
 *  3. the rest are THRESHOLD-CLASSED into the dark-map ramp via a MapLibre
 *     `["step", …]` expression — each class a distinct color so tight-clustered
 *     values read at a glance (see class-scale.ts). Sequential province layers
 *     carry no policy meta (rate layers with a `complianceTarget` take the classed
 *     META path — provinceMetaColorExpr — instead), so the breaks are QUANTILE over
 *     the value set — or deterministic EQUAL-INTERVAL when a scrub domain is locked.
 * Returns a flat COLOR_NO_DATA expression when the layer has no values.
 */
/**
 * The THRESHOLD-CLASSED scale (breaks + colors) a SEQUENTIAL province choropleth
 * renders — the single source of truth shared by the map fill (provinceColorExpr,
 * below) and the off-canvas legend (lifted through SituationalMap so the swatch
 * ranges always describe the painted colors, including under a scrub scale-lock).
 * `domainOverride` is the frozen [min,max] a scrub locks; when present the scale
 * uses deterministic equal-interval breaks instead of the frame's own quantiles.
 * Returns null when the layer has no numeric values (the fill paints all neutral).
 */
export function provinceSeqClassScale(
  features: FeatureCollection,
  domainOverride?: { min: number; max: number } | null,
): ClassScale | null {
  const values: number[] = [];
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || typeof p.value !== "number") continue;
    values.push(p.value);
  }
  if (values.length === 0) return null;
  return computeClassScale(values, { lockedDomain: domainOverride ?? null });
}

export function provinceColorExpr(
  features: FeatureCollection,
  // Optional domain override (fix: time-scrub color-scale lock). When supplied,
  // the classed scale uses equal-interval breaks over this fixed [min,max]
  // instead of the frame's own quantiles, so a value keeps the same class-color
  // across every as-of frame.
  domainOverride?: { min: number; max: number } | null,
): ExpressionSpecification {
  const pairs: Array<[string, number]> = [];
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || typeof p.value !== "number") continue;
    pairs.push([p.provinceCode, p.value]);
  }
  const scale = provinceSeqClassScale(features, domainOverride);
  // No data at all — paint everything neutral.
  if (pairs.length === 0 || scale === null) {
    return COLOR_NO_DATA as unknown as ExpressionSpecification;
  }

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
    stepColorExpr(valueMatch, scale),
  ] as unknown as ExpressionSpecification;
}

/**
 * The THRESHOLD-CLASSED scale (breaks + colors) a META'd rate province choropleth
 * renders — the classed-step META path (class-scale.ts): fixed cutoffs anchored on
 * the compliance target T at [0.5T, 0.75T, T] → 4 classes (<0.5T / 0.5–0.75T /
 * 0.75–T / ≥T). PO decision (ratified in live QA): cobertura / esterilización /
 * microchip / ppp render on these fixed threshold classes, NOT the amber/teal
 * divergent scale they used before — the meta breaks are comparable across
 * jurisdictions and stable over time, and the classes read at a glance on the navy
 * canvas.
 *
 * Frame-stable BY CONSTRUCTION: the breaks depend only on the target, never on the
 * frame's values, so a time-scrub needs no domain lock here (contrast the
 * sequential path, which locks its quantile domain). The single source of truth
 * shared by the map fill (provinceMetaColorExpr) and the off-canvas legend swatches
 * (lifted through SituationalMap, parity with provinceSeqClassScale). Returns null
 * when the layer has no numeric values (the fill paints all neutral).
 */
export function provinceMetaClassScale(
  features: FeatureCollection,
  target: number,
): ClassScale | null {
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode === "string" && typeof p.value === "number") {
      // The META path ignores the value set (breaks come from the target only);
      // an empty array is enough to trigger it once we know data exists.
      return computeClassScale([], { target });
    }
  }
  return null;
}

/**
 * Build the data-driven `fill-color` for a META'd rate province choropleth — the
 * classed-step META replacement for the divergent path (see provinceMetaClassScale).
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. provinces with no value (-1) get COLOR_NO_DATA (k-anon honesty: a suppressed
 *     or absent cell never enters a color class — the short-circuit stays in front);
 *  3. the rest are THRESHOLD-CLASSED into the dark-map ramp via a MapLibre
 *     `["step", …]` expression using the META breaks [0.5T, 0.75T, T].
 * Returns a flat COLOR_NO_DATA expression when the layer has no values.
 */
export function provinceMetaColorExpr(
  features: FeatureCollection,
  target: number,
): ExpressionSpecification {
  const pairs: Array<[string, number]> = [];
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || typeof p.value !== "number") continue;
    pairs.push([p.provinceCode, p.value]);
  }
  // No data at all — paint everything neutral.
  if (pairs.length === 0) return COLOR_NO_DATA as unknown as ExpressionSpecification;

  const scale = computeClassScale([], { target });

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
    stepColorExpr(valueMatch, scale),
  ] as unknown as ExpressionSpecification;
}

/**
 * Build the data-driven `fill-color` for a DIVERGENT province choropleth
 * (F5 — `dataType: "rate"` layers with a `complianceTarget`).
 *
 * The color expression structure:
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. provinces with no value (-1) get COLOR_NO_DATA;
 *  3. the rest are interpolated along a diverging orange→neutral→teal ramp
 *     anchored at `target` (warning below, good above — colorblind-safe).
 *
 * @param features      - Province feature collection (same shape as provinceColorExpr).
 * @param target        - The compliance threshold (e.g. 80 for antirrábica 80%).
 * @param domainBounds  - Optional override for [min, max]; defaults to the
 *                        observed range so callers can pre-compute or clamp.
 */
export function provinceDivergentColorExpr(
  features: FeatureCollection,
  target: number,
  domainBounds?: { min: number; max: number },
): ExpressionSpecification {
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

  const lo = domainBounds?.min ?? (Number.isFinite(min) ? min : 0);
  const hi = domainBounds?.max ?? (Number.isFinite(max) ? max : lo + 1);

  const valueMatch = [
    "match",
    ["get", "code"],
    ...pairs.flatMap(([code, value]) => [code, value] as [string, number]),
    -1,
  ] as unknown as ExpressionSpecification;

  // Build divergent interpolation stops anchored at the target.
  const stops = divergentStops(target, lo, hi);
  // Flatten stops into [v0, c0, v1, c1, ...] for MapLibre interpolate.
  const flatStops = stops.flat();

  return [
    "case",
    ["==", valueMatch, -1],
    COLOR_NO_DATA,
    ["interpolate", ["linear"], valueMatch, ...flatStops],
  ] as unknown as ExpressionSpecification;
}

// Re-export pole colors so the legend in SituationalMap.tsx can reference
// them without importing from lib/viz-scales directly.
export { COLOR_DIVERGENT_BELOW, COLOR_DIVERGENT_NEUTRAL, COLOR_DIVERGENT_ABOVE };

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
