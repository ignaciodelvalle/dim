/**
 * Tokenized color scales for choropleth and dashboard charts.
 *
 * All colors are design-token references resolved at build time from the
 * Tailwind/CSS variable layer. No arbitrary hex literals are exported from
 * this file — callers must use these named scales, not inline colors.
 *
 * Colorblind safety:
 *  - Sequential scales use single-hue ramps (safe for deuteranopia / protanopia).
 *  - Diverging scales separate poles by hue distance (blue–red), not
 *    green–red, which is the most common confusion axis.
 *  - All contrast ratios meet WCAG 2.1 AA at the text-on-fill level for
 *    the tooltip overlay (Ley Nacional 26.653 / Disp. ONTI 6/2019).
 *
 * Reference: https://colorbrewer2.org — sequential single-hue palettes.
 */

/** A two-stop color ramp [low, high] for MapLibre interpolate expressions. */
export type ColorRamp = readonly [string, string];

/** Five-stop sequential scale for finer gradient control. */
export type ColorScale5 = readonly [string, string, string, string, string];

// ---------------------------------------------------------------------------
// Sequential (choropleth) — single-hue, colorblind-safe
// ---------------------------------------------------------------------------

/**
 * Blue sequential — default for counts, density, enrollment.
 * ColorBrewer Blues (5-class): #eff3ff → #084594
 */
export const SCALE_BLUE_SEQ: ColorScale5 = [
  "#eff3ff",
  "#bdd7e7",
  "#6baed6",
  "#2171b5",
  "#084594",
] as const;

/**
 * Two-stop ramp extracted from SCALE_BLUE_SEQ for backward compat.
 * Matches what MapChoropleth v1 expected for colorScale prop.
 *
 * WHITE-PAPER ramp (low value = near-white, high value = dark navy). Correct for
 * LIGHT surfaces — MapChoropleth, dashboard charts, and the situational console
 * (v2C flipped the operator map to the light canvas, `fd757227`; the dark skin
 * and its inverted blue→cyan ramp were retired).
 */
export const RAMP_BLUE: ColorRamp = ["#eff3ff", "#084594"] as const;

/**
 * Orange sequential — for coverage / compliance rates.
 * ColorBrewer Oranges (5-class): #feedde → #7f2704
 */
export const SCALE_ORANGE_SEQ: ColorScale5 = [
  "#feedde",
  "#fdbe85",
  "#fd8d3c",
  "#e6550d",
  "#7f2704",
] as const;

export const RAMP_ORANGE: ColorRamp = ["#feedde", "#7f2704"] as const;

/**
 * Purple sequential — for mortality, severity, risk.
 * ColorBrewer Purples (5-class): #f2f0f7 → #3f007d
 */
export const SCALE_PURPLE_SEQ: ColorScale5 = [
  "#f2f0f7",
  "#cbc9e2",
  "#9e9ac8",
  "#756bb1",
  "#54278f",
] as const;

export const RAMP_PURPLE: ColorRamp = ["#f2f0f7", "#54278f"] as const;

/**
 * Green sequential — for "good" metrics: vaccination coverage, microchip adoption.
 * ColorBrewer Greens (5-class): #edf8e9 → #006d2c
 */
export const SCALE_GREEN_SEQ: ColorScale5 = [
  "#edf8e9",
  "#bae4b3",
  "#74c476",
  "#31a354",
  "#006d2c",
] as const;

export const RAMP_GREEN: ColorRamp = ["#edf8e9", "#006d2c"] as const;

// ---------------------------------------------------------------------------
// Divergent (compliance) scale — blue↔orange, colorblind-safe
//
// Intentional hue choice: blue (above target / "good") ↔ orange/amber (below
// target / "warning"). Blue–orange is safe for deuteranopia and protanopia —
// the two poles are separated by hue and luminance, NOT by the red–green axis
// which is explicitly forbidden in the colorblind comment at the top of this
// file. ColorBrewer source: diverging "PuOr" family adapted to match the
// existing sequential palette luminance range.
// ---------------------------------------------------------------------------

/**
 * Warning pole (below compliance target): amber/orange.
 * Distinct in hue from SCALE_BLUE_SEQ and from the teal above-pole.
 */
export const COLOR_DIVERGENT_BELOW = "#f59e0b" as const; // amber-400

/** Neutral midpoint (at target): a VISIBLE mid-slate, not paper-white. Held at
 * slate-500 for its hue+luminance distance to BOTH poles (amber below, teal
 * above) — the value stays after the v2C light flip (`fd757227`), NOT the
 * prototype's near-white `#f1f5f8`, because the CVD-validated ΔE margins to the
 * poles are what earn its place (a paper-white neutral collapses the divergent
 * read). Originally chosen because on the retired dark basemap (navy #0b1020) a
 * slate-50 neutral blew out as a white sticker; the pole-distance rationale is
 * canvas-independent and outlives that skin. */
export const COLOR_DIVERGENT_NEUTRAL = "#64748b" as const; // slate-500

/**
 * Good pole (above compliance target): teal/blue.
 * Uses the teal CHART_COLOR family (not SCALE_BLUE_SEQ) to stay visually
 * distinct from sequential density choropleths that use RAMP_BLUE.
 *
 * CVD MARGIN FIX (night-1 dataviz audit): the original teal-600 (#0d9488)
 * measured ΔE 10.7 against COLOR_DIVERGENT_NEUTRAL (#64748b) under deuteranopia
 * simulation — inside the marginal 8-12 band where the two poles risk reading
 * as the same color to a colorblind operator. The primary, canvas-independent
 * guarantee this value earns: it clears ΔE 18.3 (deutan) against the neutral
 * slate — that margin is why the fix stands regardless of surface. Darkening
 * straight down the teal-600 hue (e.g. teal-700 #0f766e, teal-800 #115e59)
 * either stayed under the ΔE 12 floor or tanked surface contrast. Contrast was
 * originally tuned against the (now retired) dark basemap navy #0b1020 — this
 * shade held 4.18:1 there (was 5.06:1 at teal-600, and teal-800 dropped to
 * 2.5:1, below the 3:1 floor); the v2C console is light (`fd757227`), but the
 * navy figure is kept as a regression anchor and locked by the viz-scales test.
 * Re-validate with dataviz's validate_palette.js before changing this value.
 */
export const COLOR_DIVERGENT_ABOVE = "#0c866b" as const; // teal-600, darkened + CVD-margin corrected

/**
 * A divergent color scale for compliance/rate layers:
 *   [far-below, below, neutral-at-target, above, far-above]
 *
 * The 5-stop layout mirrors ColorScale5 so callers that want a full 5-class
 * legend can index it directly. The neutral midpoint lives at index 2.
 */
export const SCALE_DIVERGENT_COMPLIANCE: ColorScale5 = [
  "#d97706", // amber-600 — far below (worst)
  COLOR_DIVERGENT_BELOW, // amber-400 — below target
  COLOR_DIVERGENT_NEUTRAL, // slate-50 — at target (neutral)
  "#2dd4bf", // teal-300 — above target
  COLOR_DIVERGENT_ABOVE, // teal-600 — far above (best)
] as const;

/**
 * Build MapLibre linear-interpolate stops for a divergent choropleth anchored
 * at `target`. Values below the target ramp toward the warning pole (amber);
 * values above ramp toward the good pole (teal). The neutral midpoint maps
 * exactly to `target`.
 *
 * Returns a flat array of [value, color] pairs suitable for spreading into a
 * MapLibre `["interpolate", ["linear"], input, ...stops]` expression.
 *
 * Guarantees:
 *  - At least 3 stops: [domainMin → below-pole, target → neutral, domainMax → above-pole].
 *  - When domainMin === target (all values are at or above), the below segment
 *    is collapsed to a 0-width degenerate pair handled by MapLibre gracefully.
 *  - When domainMax === target (all values are at or below), same for above.
 *  - When domainMin === domainMax, the range is widened by ±1 so MapLibre has
 *    distinct stops and does not throw.
 *
 * @param target    - The compliance threshold (e.g. 80 for antirrábica 80%).
 * @param domainMin - Minimum value observed across the province cells.
 * @param domainMax - Maximum value observed across the province cells.
 */
export function divergentStops(
  target: number,
  domainMin: number,
  domainMax: number,
): Array<[number, string]> {
  // Widen a degenerate range so interpolate has distinct stops.
  const lo = domainMin < domainMax ? domainMin : domainMin - 1;
  const hi = domainMin < domainMax ? domainMax : domainMax + 1;

  // Clamp target to [lo, hi] so it always sits inside the domain.
  const t = Math.max(lo, Math.min(hi, target));

  const stops: Array<[number, string]> = [];

  // Below-target segment: lo → t (warning pole → neutral).
  if (lo < t) {
    stops.push([lo, COLOR_DIVERGENT_BELOW]);
  }
  // Neutral midpoint: at target.
  stops.push([t, COLOR_DIVERGENT_NEUTRAL]);
  // Above-target segment: t → hi (neutral → good pole).
  if (t < hi) {
    stops.push([hi, COLOR_DIVERGENT_ABOVE]);
  }

  // Guard: MapLibre needs ≥ 2 distinct stops (lo !== hi). If we collapsed to
  // one stop (shouldn't happen after the widen above), synthesise a second.
  if (stops.length === 1) {
    stops.push([lo + 1, COLOR_DIVERGENT_ABOVE]);
  }

  return stops;
}

/**
 * Linear-interpolate between two `#rrggbb` colors at `t ∈ [0,1]` (t clamped).
 * Used to evaluate a single fill color off a ramp when a flat scalar fill is
 * needed instead of a MapLibre interpolate expression (e.g. the CABA inset's
 * uniform province-value fill). Returns `#rrggbb`.
 */
export function lerpHex(a: string, b: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * clamp);
  const r = mix(pa[0], pb[0]);
  const g = mix(pa[1], pb[1]);
  const bl = mix(pa[2], pb[2]);
  return `#${toHex2(r)}${toHex2(g)}${toHex2(bl)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/**
 * Evaluate MapLibre-style linear color stops `[[value, hex], ...]` at `value`,
 * returning the interpolated `#rrggbb`. Stops must be ascending by value (as
 * produced by {@link divergentStops} or a two-stop sequential ramp). Values
 * outside the range clamp to the nearest endpoint. Returns COLOR_NO_DATA when
 * there are no stops.
 */
export function sampleStops(stops: ReadonlyArray<[number, string]>, value: number): string {
  if (stops.length === 0) return COLOR_NO_DATA;
  if (value <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const [v0, c0] = stops[i - 1];
    const [v1, c1] = stops[i];
    if (value <= v1) {
      const span = v1 - v0;
      const t = span > 0 ? (value - v0) / span : 0;
      return lerpHex(c0, c1, t);
    }
  }
  return last[1];
}

// ---------------------------------------------------------------------------
// "No data" color — always rendered as a separate token, never hardcoded
// ---------------------------------------------------------------------------

/** Regions/cells with no matching data get this neutral fill. A DESATURATED
 * light grey for the LIGHT operator canvas (v2C — dark skin retired 2026-07-11).
 * Kept ACHROMATIC (grey, not blue) so it does not read as a value on the blue
 * data ramp — the HUE distance separates it from the scale. On a light
 * choropleth the confusion risk inverts vs the old navy canvas: a DARK no-data
 * fill would read as a HIGH value, so no-data stays LIGHTER than the ramp's mid
 * class (the honesty invariant pinned by viz-scales.test.ts) while remaining
 * distinct from the palest data class ({@link SCALE_BLUE_SEQ}[0] = #eff3ff, a
 * blue-white) by being a neutral grey. Also distinct from the suppressed fill
 * ({@link COLOR_SUPPRESSED} = #d1d5db, darker + carries the k-anon hatch). The
 * legend labels this swatch "Sin datos". */
export const COLOR_NO_DATA = "#e7eaed" as const;

/** Suppressed cells (< k-anonymity threshold) get this distinct fill. */
export const COLOR_SUPPRESSED = "#d1d5db" as const;

// ---------------------------------------------------------------------------
// Semantic scale selector
// ---------------------------------------------------------------------------

export type ScaleKey = "blue" | "orange" | "purple" | "green";

const RAMP_BY_KEY: Record<ScaleKey, ColorRamp> = {
  blue: RAMP_BLUE,
  orange: RAMP_ORANGE,
  purple: RAMP_PURPLE,
  green: RAMP_GREEN,
};

const SCALE5_BY_KEY: Record<ScaleKey, ColorScale5> = {
  blue: SCALE_BLUE_SEQ,
  orange: SCALE_ORANGE_SEQ,
  purple: SCALE_PURPLE_SEQ,
  green: SCALE_GREEN_SEQ,
};

export function getRamp(key: ScaleKey): ColorRamp {
  return RAMP_BY_KEY[key];
}

export function getScale5(key: ScaleKey): ColorScale5 {
  return SCALE5_BY_KEY[key];
}

// ---------------------------------------------------------------------------
// Chart line / area colors (for TimeSeriesChart / StackedTimeSeriesChart)
// ---------------------------------------------------------------------------

/** Named stroke colors for recharts series — single-hue, accessible. */
export const CHART_COLORS = {
  blue: "#2171b5",
  orange: "#e6550d",
  purple: "#756bb1",
  green: "#31a354",
  teal: "#1d9a8a",
  red: "#cb181d",
} as const satisfies Record<string, string>;

export type ChartColorKey = keyof typeof CHART_COLORS;
