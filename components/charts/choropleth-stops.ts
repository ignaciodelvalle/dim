// Pure stop-building for MapChoropleth's fill-color interpolate expression.
//
// MapLibre rejects the WHOLE fill-color expression when interpolate input
// stops are not strictly ascending ("Input/output pairs for 'interpolate'
// expressions must be arranged with input values in strictly ascending
// order") — the regions-fill layer then never paints on the govt/admin
// choropleths (QA round 2 finding #3). Degenerate data gets there easily:
// every region carrying the same value collapses min === max; NaN values
// poison Math.min/Math.max entirely.
//
// This module centralizes the guarantees so the map component can't drift:
//   - the computed domain is always finite with maxVal > minVal;
//   - the returned stops are always >= 2 pairs, sorted, deduped, and
//     strictly ascending — whatever the input data looks like.
//
// Extracted from MapChoropleth.tsx so it is unit-testable WITHOUT importing
// maplibre-gl (same pattern as components/panorama/province-choropleth-style.ts).

import {
  CLASS_COUNT,
  type ClassScale,
  type ClassSwatch,
  classColors,
  classSwatches,
  computeClassScale,
} from "@/components/panorama/class-scale";
import { divergentStops } from "@/lib/analytics/viz-scales";

export type ChoroplethDomain = { minVal: number; maxVal: number };

/**
 * Compute the interpolation domain from region values.
 * Non-finite values (NaN/±Infinity) are ignored; an empty (or fully
 * non-finite) input falls back to [0, 1]; a uniform input widens to
 * [v, v + 1] so interpolate always has distinct stops.
 */
export function choroplethDomain(values: number[]): ChoroplethDomain {
  const finite = values.filter((v) => Number.isFinite(v));
  const minVal = finite.length > 0 ? Math.min(...finite) : 0;
  const rawMax = finite.length > 0 ? Math.max(...finite) : 0;
  const maxVal = rawMax > minVal ? rawMax : minVal + 1;
  return { minVal, maxVal };
}

/**
 * Build the [value, color] interpolation stops for the choropleth fill.
 *
 * - `sequential` (default): [min → colorScale[0], max → colorScale[1]].
 * - `divergent` (requires finite `target`): orange→neutral→teal anchored at
 *   the compliance target via divergentStops (same helper as SituationalMap).
 *
 * The result is passed through `sanitizeStops`, so callers can spread it
 * into `["interpolate", ["linear"], input, ...flat]` without any further
 * validation.
 */
export function choroplethColorStops(args: {
  domain: ChoroplethDomain;
  colorScale: readonly [string, string];
  scaleMode?: "sequential" | "divergent";
  target?: number;
}): Array<[number, string]> {
  const { minVal, maxVal } = args.domain;
  const isDivergent =
    args.scaleMode === "divergent" &&
    typeof args.target === "number" &&
    Number.isFinite(args.target);

  const stops: Array<[number, string]> = isDivergent
    ? divergentStops(args.target as number, minVal, maxVal)
    : [
        [minVal, args.colorScale[0]],
        [maxVal, args.colorScale[1]],
      ];

  return sanitizeStops(stops, args.colorScale);
}

/**
 * One clickable legend bin.
 *
 * Semantics (aligned with MapLibre `step` / panorama's half-open classing):
 *  - `lo` is the INCLUSIVE lower bound; `null` = open below.
 *  - `hi` is the EXCLUSIVE upper bound; `null` = open above.
 *  - `color` is the painted class fill for this bin — present only for the
 *    classed sequential scale, where the bin row doubles as the color legend
 *    (single source of truth: swatch color === painted fill). Divergent bins
 *    keep the separate gradient legend and carry no color.
 */
export type ChoroplethLegendBin = {
  label: string;
  color?: string;
  lo: number | null;
  hi: number | null;
};

/** A resolved classed sequential scale + its legend bins — both derived from
 *  the SAME breaks/colors so on-map fill and legend can never disagree. */
export type ChoroplethClassed = { scale: ClassScale; bins: ChoroplethLegendBin[] };

/** Round a class break to a readable precision for the legend label.
 *  (Same convention as panorama's MapLegends formatBound — kept local because
 *  MapLegends' formatter is private to that client component.) */
function formatBound(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded.toLocaleString("es-AR");
}

/** es-AR range label for one class swatch. Half-open disambiguation mirrors
 *  panorama's MapLegends: the interior range reads "lo – <hi" so the exclusive
 *  upper bound is explicit (a value exactly AT a break belongs to the UPPER
 *  class — pinned by class-scale.test.ts). */
function swatchBinLabel(s: ClassSwatch): string {
  if (s.lo === null && s.hi === null) return "Todos";
  if (s.lo === null) return `< ${formatBound(s.hi as number)}`;
  if (s.hi === null) return `≥ ${formatBound(s.lo as number)}`;
  return `${formatBound(s.lo)} – <${formatBound(s.hi)}`;
}

/**
 * Resolve the CLASSED sequential scale for MapChoropleth (dataviz review #5 —
 * port of the Panorama Theme-3 fix). The continuous 2-stop min→max ramp
 * compressed clustered counts into a narrow low-contrast slice and the map
 * read flat; classing buckets values into discrete classes painted distinct
 * steps of the governed SCALE_BLUE_SEQ ramp (components/panorama/class-scale.ts
 * — REUSED, not reimplemented).
 *
 * Returns the scale (for the MapLibre `step` fill expression) AND the legend
 * bins derived from the same breaks/colors — the single source of truth that
 * guarantees legend === painted encoding.
 *
 * Narrow INTEGER domain (visual review 2026-07-23 #3, carried over): an
 * integer span with fewer than CLASS_COUNT distinct steps (e.g. "Casos
 * abiertos" 4→6) classes one bucket per integer value ("4", "5", "6") instead
 * of fractional quantile cutoffs that would produce empty/misleading classes.
 *
 * Suppressed (k-anon) and non-finite values are excluded — they are painted
 * their own categorical states, never a class. A degenerate domain (empty or
 * all-equal) yields a single flat class and NO bins.
 */
export function choroplethClassed(
  data: ReadonlyArray<{ value: number; suppressed?: boolean }>,
): ChoroplethClassed {
  const values = data.filter((d) => !d.suppressed && Number.isFinite(d.value)).map((d) => d.value);

  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (Number.isInteger(min) && Number.isInteger(max) && max > min && max - min < CLASS_COUNT) {
      // One class per integer value: breaks at min+1 … max ⇒ class i holds
      // exactly the value min+i under step semantics (v ≥ break → next class).
      const breaks = Array.from({ length: max - min }, (_, i) => min + i + 1);
      const colors = classColors(breaks.length + 1);
      const scale: ClassScale = { breaks, colors, method: "interval" };
      const bins: ChoroplethLegendBin[] = Array.from({ length: max - min + 1 }, (_, i) => {
        const v = min + i;
        return {
          label: v.toLocaleString("es-AR"),
          color: colors[i],
          lo: v,
          hi: v === max ? null : v + 1,
        };
      });
      return { scale, bins };
    }
  }

  const scale = computeClassScale(values);
  if (scale.breaks.length === 0) return { scale, bins: [] };
  const bins = classSwatches(scale).map((s) => ({
    label: swatchBinLabel(s),
    color: s.color,
    lo: s.lo,
    hi: s.hi,
  }));
  return { scale, bins };
}

/**
 * Legend bins for the DIVERGENT compliance scale: two half-open bins split at
 * the target — "bajo meta (< t)" / "sobre meta (≥ t)". Half-open (hi exclusive)
 * so a value exactly AT the target belongs to "sobre meta" only, matching the
 * labels. The divergent fill stays a continuous interpolation (unchanged).
 */
export function divergentLegendBins(target: number): ChoroplethLegendBin[] {
  if (!Number.isFinite(target)) return [];
  return [
    { label: `bajo meta (< ${target.toLocaleString("es-AR")})`, lo: null, hi: target },
    { label: `sobre meta (≥ ${target.toLocaleString("es-AR")})`, lo: target, hi: null },
  ];
}

/**
 * Defensive normalization of interpolate stops: drop non-finite inputs,
 * sort ascending, dedupe equal inputs (first occurrence wins), and
 * guarantee at least 2 strictly ascending pairs. `colorScale` supplies the
 * fallback colors when everything was dropped.
 */
export function sanitizeStops(
  stops: Array<[number, string]>,
  colorScale: readonly [string, string],
): Array<[number, string]> {
  const sorted = stops.filter(([value]) => Number.isFinite(value)).sort((a, b) => a[0] - b[0]);

  const out: Array<[number, string]> = [];
  for (const stop of sorted) {
    if (out.length === 0 || stop[0] > out[out.length - 1][0]) out.push(stop);
  }

  if (out.length === 0) {
    return [
      [0, colorScale[0]],
      [1, colorScale[1]],
    ];
  }
  if (out.length === 1) {
    out.push([out[0][0] + 1, colorScale[1]]);
  }
  return out;
}
