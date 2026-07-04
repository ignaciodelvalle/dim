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
