// Pure helpers for THRESHOLD-CLASSED choropleth color scales (panorama redesign
// Theme 3 — "solid, classed, high-contrast fills").
//
// The situation-room choropleths used to color every unit by a CONTINUOUS 2-stop
// linear interpolation over the observed min/max. When real values cluster tight
// (e.g. rabies coverage ~34–65% against an 80% meta) that compresses every unit
// into a narrow low-contrast slice and the map "reads flat" — a failure the legend
// code itself documented (legend-histogram.ts). Classing fixes it: values are
// bucketed into a handful of discrete CLASSES, each painted a distinct color from
// the dark-map ramp, so differences read at a glance.
//
// Two classing policies (PO decision, threshold-by-meta):
//   - META  : a policy-meaningful target exists → fixed cutoffs anchored on it
//             (e.g. meta 80% → break at 40 / 60 / 80: below-half / approaching /
//             near / met). Comparable across jurisdictions, stable over time.
//   - QUANTILE: no meta → data-driven quantile breaks over the value set, so each
//             class holds roughly the same number of units (balanced contrast).
//
// A LOCKED domain (time-scrub scale-lock) overrides the value-derived breaks with
// deterministic EQUAL-INTERVAL cutoffs over the frozen [min,max], so a unit keeps
// the same class-color across every as-of frame of a scrub (no per-frame rebasing
// = no flicker). This mirrors the pre-existing `domainOverride` contract.
//
// Kept pure (no maplibre runtime, no DOM) so the bucketing + color assignment are
// unit-testable in isolation. Callers (province-choropleth-style, division-fill,
// MapLegends) build the MapLibre `["step", …]` expression / legend swatches from
// the SAME breaks + colors, so on-map fill and off-canvas legend never disagree.

import { SCALE_BLUE_DARK_SEQ } from "@/lib/analytics/viz-scales";

/** How many classes a classed scale renders (→ CLASS_COUNT-1 interior breaks). */
export const CLASS_COUNT = 5;

/** A resolved classed scale: ascending interior breaks + one color per class.
 *  Invariant: `colors.length === breaks.length + 1`. */
export type ClassScale = {
  breaks: number[];
  colors: string[];
  method: "meta" | "quantile" | "interval" | "flat";
};

/**
 * Pick `n` colors evenly sampled from the 5-stop dark sequential ramp
 * (SCALE_BLUE_DARK_SEQ — luminance INCREASES with value, so a hot class is the
 * brightest thing on the navy canvas). n=5 → the whole ramp; n=4 → [0,1,3,4]
 * (drops one mid stop but keeps both poles); n=1 → the mid stop (a single flat
 * class). No new palette is introduced — this only re-samples the existing ramp.
 */
export function classColors(n: number): string[] {
  const scale = SCALE_BLUE_DARK_SEQ;
  if (n <= 1) return [scale[Math.floor(scale.length / 2)]];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (scale.length - 1)) / (n - 1));
    out.push(scale[idx]);
  }
  return out;
}

/** Sort ascending, drop non-finite, keep only STRICTLY increasing values —
 *  MapLibre `step` throws on duplicate/non-ascending thresholds. */
function dedupeAscending(values: number[]): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v > out[out.length - 1]) out.push(v);
  }
  return out;
}

/** Linear-interpolated quantile over an ASCENDING-sorted array, p ∈ [0,1]. */
function quantileSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Resolve the classed scale (breaks + colors) for a value set.
 *
 * @param values  every unit's value (no-data / suppressed cells are excluded by
 *                the caller — they are painted their own category, never a class).
 * @param opts.target       a policy meta → META policy (fixed cutoffs on the meta).
 * @param opts.lockedDomain a frozen [min,max] (scrub scale-lock) → EQUAL-INTERVAL
 *                          cutoffs, deterministic across frames. Wins over target.
 */
export function computeClassScale(
  values: readonly number[],
  opts?: { target?: number | null; lockedDomain?: { min: number; max: number } | null },
): ClassScale {
  const target = opts?.target ?? null;
  const locked = opts?.lockedDomain ?? null;
  const finite = values.filter((v) => typeof v === "number" && Number.isFinite(v));

  // Scale-lock: equal-interval over the frozen domain (frame-stable colors).
  if (locked && locked.max > locked.min) {
    const breaks = dedupeAscending(
      Array.from(
        { length: CLASS_COUNT - 1 },
        (_, i) => locked.min + ((locked.max - locked.min) * (i + 1)) / CLASS_COUNT,
      ),
    );
    return { breaks, colors: classColors(breaks.length + 1), method: "interval" };
  }

  // Meta policy: fixed cutoffs at half / three-quarters / the meta itself.
  // For a meta of 80 → [40, 60, 80] → classes <40 / 40–60 / 60–80 / ≥80.
  if (target != null && Number.isFinite(target) && target > 0) {
    const breaks = dedupeAscending([0.5 * target, 0.75 * target, target]);
    return { breaks, colors: classColors(breaks.length + 1), method: "meta" };
  }

  if (finite.length === 0) return { breaks: [], colors: classColors(1), method: "flat" };

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  // Degenerate range (all equal) → a single flat class; MapLibre `step` needs a
  // real ascending threshold, so a break-less scale is a flat fill (see stepExpr).
  if (!(max > min)) return { breaks: [], colors: classColors(1), method: "flat" };

  // Too few units for meaningful quantiles → equal-interval over the range.
  if (finite.length < CLASS_COUNT) {
    const breaks = dedupeAscending(
      Array.from(
        { length: CLASS_COUNT - 1 },
        (_, i) => min + ((max - min) * (i + 1)) / CLASS_COUNT,
      ),
    );
    return { breaks, colors: classColors(breaks.length + 1), method: "interval" };
  }

  // Quantile breaks: each class holds ~1/CLASS_COUNT of the units.
  const sorted = [...finite].sort((a, b) => a - b);
  const breaks = dedupeAscending(
    Array.from({ length: CLASS_COUNT - 1 }, (_, i) =>
      quantileSorted(sorted, (i + 1) / CLASS_COUNT),
    ),
  );
  return { breaks, colors: classColors(breaks.length + 1), method: "quantile" };
}

/**
 * Build a MapLibre `["step", input, c0, t1, c1, t2, c2, …]` output expression
 * from a resolved ClassScale. `input` is the value-lookup sub-expression (e.g. a
 * `match` on the polygon `code`). A break-less scale (single flat class) returns
 * the lone color string — MapLibre `step` requires ≥ 1 ascending threshold.
 */
export function stepColorExpr(input: unknown, scale: ClassScale): unknown {
  if (scale.breaks.length === 0) return scale.colors[0];
  const out: unknown[] = ["step", input, scale.colors[0]];
  for (let i = 0; i < scale.breaks.length; i++) {
    out.push(scale.breaks[i], scale.colors[i + 1]);
  }
  return out;
}

/** One legend swatch row: the class color + its half-open value range [lo, hi).
 *  `lo` is null for the first (open-below) class; `hi` is null for the last
 *  (open-above) class. Callers format the numbers for display. */
export type ClassSwatch = { color: string; lo: number | null; hi: number | null };

/** Expand a ClassScale into legend swatch rows (color + value range per class). */
export function classSwatches(scale: ClassScale): ClassSwatch[] {
  const { breaks, colors } = scale;
  return colors.map((color, i) => ({
    color,
    lo: i === 0 ? null : breaks[i - 1],
    hi: i === colors.length - 1 ? null : breaks[i],
  }));
}
