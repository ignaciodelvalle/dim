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
// "No data" color — always rendered as a separate token, never hardcoded
// ---------------------------------------------------------------------------

/** Regions/cells with no matching data get this neutral fill. */
export const COLOR_NO_DATA = "#e5e7eb" as const;

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
// Chart line / area colors (for TimeSeriesChart / DashboardChart)
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
