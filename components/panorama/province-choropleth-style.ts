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
import { COLOR_NO_DATA } from "@/lib/analytics/viz-scales";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

/** A province feature's properties (as emitted by buildProvinceChoroplethFeatures). */
type ProvinceFeatureProps = { provinceCode?: string; value?: number };

/**
 * Adversarial-review fix (2026-07-11, MED #3): NaN hardening for the MAPLIBRE
 * fill path, not just the JS mirror (colorForValue). `typeof value === "number"`
 * is true for NaN, so a NaN-carrying feature entered the `match` pairs and the
 * `["step", …]` expression painted it as the LOWEST class — indistinguishable
 * from a genuinely low value. A finite check routes NaN to the match default
 * (-1 → COLOR_NO_DATA) instead. Type predicate so the narrowing survives.
 */
function isFiniteValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** value min/max over a province layer's features (for the scale legend). */
export type ScaleBounds = { min: number; max: number };

/** Collect the (provinceCode, value) pairs — the value-by-code join the fill
 *  `match` reads. Non-finite / code-less features are dropped (NaN hardening). */
function provincePairs(features: FeatureCollection): Array<[string, number]> {
  const pairs: Array<[string, number]> = [];
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || !isFiniteValue(p.value)) continue;
    pairs.push([p.provinceCode, p.value]);
  }
  return pairs;
}

/**
 * P3 consolidation — the SINGLE classed-province `fill-color` assembly shared by
 * BOTH the sequential (provinceColorExpr) and META (provinceMetaColorExpr) paths,
 * and by the first-class `ChoroplethEncoding` value object (encoding.ts). Given a
 * feature set and its ALREADY-RESOLVED ClassScale, it builds the exact
 * `case → match → step` expression both paths used to assemble independently:
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. a `case` short-circuits the -1 no-data cells to COLOR_NO_DATA (k-anon /
 *     absence honesty — a suppressed or absent cell never enters a color class);
 *  3. the rest are THRESHOLD-CLASSED via `stepColorExpr(valueMatch, scale)`.
 * The scale is passed in (never recomputed here), so the fill and any legend /
 * inset sampling that read the SAME scale object cannot drift. Returns a flat
 * COLOR_NO_DATA expression when the layer carries no values.
 */
export function classedProvinceFill(
  features: FeatureCollection,
  scale: ClassScale,
): ExpressionSpecification {
  const pairs = provincePairs(features);
  if (pairs.length === 0) return COLOR_NO_DATA as unknown as ExpressionSpecification;

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
 * Build the data-driven `fill-color` for a province choropleth.
 *  1. a `match` maps each province code → its value (default -1 = "no data");
 *  2. provinces with no value (-1) get COLOR_NO_DATA;
 *  3. the rest are THRESHOLD-CLASSED into the dark-map ramp via a MapLibre
 *     `["step", …]` expression — each class a distinct color so tight-clustered
 *     values read at a glance (see class-scale.ts). Sequential province layers
 *     carry no policy meta (rate layers with a `complianceTarget` take the classed
 *     META path — provinceMetaColorExpr — instead), so the breaks are QUANTILE over
 *     the value set — frozen across a scrub via `lockedBreaks` (still quantile).
 * Returns a flat COLOR_NO_DATA expression when the layer has no values.
 */
/**
 * The THRESHOLD-CLASSED scale (breaks + colors) a SEQUENTIAL province choropleth
 * renders — the single source of truth shared by the map fill (provinceColorExpr,
 * below) and the off-canvas legend (lifted through SituationalMap so the swatch
 * ranges always describe the painted colors, including under a scrub scale-lock).
 * `lockedBreaks` are the frozen live-edge quantile breaks a scrub reuses; when
 * present the scale renders those exact breaks instead of re-deriving quantiles
 * from the current frame (frame-stable colors, still quantile-balanced).
 * Returns null when the layer has no numeric values (the fill paints all neutral).
 */
export function provinceSeqClassScale(
  features: FeatureCollection,
  lockedBreaks?: readonly number[] | null,
): ClassScale | null {
  const values: number[] = [];
  for (const f of features.features) {
    const p = f.properties as ProvinceFeatureProps;
    if (typeof p.provinceCode !== "string" || !isFiniteValue(p.value)) continue;
    values.push(p.value);
  }
  if (values.length === 0) return null;
  return computeClassScale(values, { lockedBreaks: lockedBreaks ?? null });
}

export function provinceColorExpr(
  features: FeatureCollection,
  // Optional frozen breaks (fix: time-scrub color-scale lock). When supplied, the
  // classed scale renders these frozen live-edge quantile breaks instead of the
  // frame's own quantiles, so a value keeps the same class-color across every
  // as-of frame.
  lockedBreaks?: readonly number[] | null,
): ExpressionSpecification {
  const scale = provinceSeqClassScale(features, lockedBreaks);
  // No data at all — paint everything neutral.
  if (scale === null) return COLOR_NO_DATA as unknown as ExpressionSpecification;
  // P3: the fill is assembled from the ONE resolved scale (classedProvinceFill),
  // the same assembly the META path and the ChoroplethEncoding value object use.
  return classedProvinceFill(features, scale);
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
    if (typeof p.provinceCode === "string" && isFiniteValue(p.value)) {
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
  // The META scale's breaks come from the target only ([0.5T, 0.75T, T]) — frame-
  // stable, value-independent. P3: assembled through the SAME classedProvinceFill
  // as the sequential path (single fill assembly), from the ONE resolved scale.
  return classedProvinceFill(features, computeClassScale([], { target }));
}

/** Compute the value min/max for a province layer's features (scale legend).
 * Returns null when the layer has no numeric values. */
export function provinceValueBounds(features: FeatureCollection): ScaleBounds | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const f of features.features) {
    const v = (f.properties as ProvinceFeatureProps).value;
    if (!isFiniteValue(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}
