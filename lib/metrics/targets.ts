// lib/metrics/targets.ts — Centralised benchmark targets and tone helpers.
//
// PURPOSE
// -------
// Magic numbers for legal/programmatic targets were previously scattered across
// multiple files:
//   - cobertura antirrábica 80 %  → lib/govt-home-kpis.ts fetchRabiesCoverage
//                                    + src/modules/panorama/domain/layers.ts complianceTarget
//   - microchip 80 %              → /gob dashboard
//   - tasa de adopción 20 %       → /gob/analytics
//   - reunificación 39 %          → /gob/perdidas
//   - completitud campañas 70 %   → /gob/campanas
//   - trazabilidad disposición 75 % + unknown-breach 25 % → /gob/mortalidad
//
// This module is the single source of truth. DB-bound callers read from here;
// the page layer passes the value to each <OpKpi bar={…} />.
//
// PURE — no DB, no side effects. Every export is unit-testable without a
// live Postgres or Next.js runtime.

// ---------------------------------------------------------------------------
// TARGETS — named benchmark constants
// ---------------------------------------------------------------------------

/**
 * Programme-wide benchmark targets, as set by regulation or internal KPIs.
 *
 * All values are percentages (0–100).
 * Keep in alphabetical order; add a comment when the source changes.
 */
export const TARGETS = {
  /** % of dogs in scope with a valid antirrábica vaccination on record. */
  RABIES_COVERAGE_PCT: 80,

  /** % of pets in scope with an active microchip identification. */
  MICROCHIP_PENETRATION_PCT: 80,

  /** % of shelter intake pets that exit via adoption. */
  ADOPTION_RATE_PCT: 20,

  /** % of lost-mode pets reunited with their owner. */
  REUNIFICATION_PCT: 39,

  /** % of campaign vaccination sessions that reached the planned quota. */
  CAMPAIGN_COMPLETION_PCT: 70,

  /**
   * % of death_recorded events that carry a known disposal method AND facility.
   * Values below this trigger a "disposición sin trazabilidad" warning.
   */
  DISPOSAL_TRACEABILITY_PCT: 75,

  /**
   * Maximum acceptable % of deaths with an unknown disposition.
   * Lower-is-better metric: values ABOVE this threshold are a breach.
   */
  DISPOSAL_UNKNOWN_BREACH_PCT: 25,

  /**
   * % of active pets in scope that have received a sterilization_performed event.
   *
   * Programmatic benchmark (NOT a legal mandate like RABIES_COVERAGE_PCT).
   * Source: programme internal KPI — goal for population containment.
   * See Paquete G (population-control.ts) for the fetcher that uses this.
   */
  STERILIZATION_COVERAGE_PCT: 70,

  /**
   * Months of owner inactivity before a pet is classified as dormant (Paquete E).
   * Used as the tooltip reference value in the Dormant KPI.
   */
  DORMANT_MONTHS: 12,
} as const;

// ---------------------------------------------------------------------------
// toneForTarget — divergent traffic-light tone for a KPI vs its target
// ---------------------------------------------------------------------------

type ToneResult = "ok" | "warn" | "danger";

type ToneOpts = {
  /**
   * Width of the warn band below the target (as a percentage of the target).
   * e.g. warnBand=0.5 and target=80 → warn when value is in [40, 80).
   * Default: 0.5 (50 % of target).
   */
  warnBand?: number;
  /**
   * When true (default), higher values are better (e.g. coverage).
   * When false, lower values are better (e.g. unknown-disposition rate).
   */
  higherIsBetter?: boolean;
};

/**
 * Map a numeric `value` to a divergent traffic-light tone relative to a
 * `target`, so every KPI can render a consistent colour signal.
 *
 * Higher-is-better (default):
 *   value >= target          → "ok"
 *   target*warnBand <= value < target → "warn"
 *   value < target*warnBand  → "danger"
 *
 * Lower-is-better (higherIsBetter: false):
 *   value <= target          → "ok"
 *   target < value <= target*(1+warnBand) → "warn"
 *   value > target*(1+warnBand) → "danger"
 *
 * @param value - The current observed metric value (0–100 for percentages).
 * @param target - The benchmark target value.
 * @param opts - Optional configuration (warnBand, higherIsBetter).
 */
export function toneForTarget(value: number, target: number, opts: ToneOpts = {}): ToneResult {
  const warnBand = opts.warnBand ?? 0.5;
  const higherIsBetter = opts.higherIsBetter ?? true;

  if (higherIsBetter) {
    // Higher is better: target is the floor we want to be above.
    if (value >= target) return "ok";
    if (value >= target * (1 - warnBand)) return "warn";
    return "danger";
  }
  // Lower is better: target is the ceiling we must stay below.
  if (value <= target) return "ok";
  if (value <= target * (1 + warnBand)) return "warn";
  return "danger";
}

// ---------------------------------------------------------------------------
// computeDeltaPct — percent change vs a prior-period value
// ---------------------------------------------------------------------------

/**
 * Compute the percent change of `current` relative to `prior`.
 *
 * Formula: ((current − prior) / prior) * 100, rounded to one decimal.
 *
 * Edge cases:
 *   prior === 0 AND current === 0 → 0  (no change from a zero baseline)
 *   prior === 0 AND current !== 0 → 0  (Infinity guard — return 0 with comment)
 *
 * The prior===0 guard matches the inline logic in `fetchSterilizationMetrics`
 * (lib/govt-home-kpis.ts line 185), centralised here so every KPI uses the
 * same convention instead of ad-hoc per-fetcher handling.
 *
 * @param current - The value for the current period.
 * @param prior   - The value for the comparison period.
 */
export function computeDeltaPct(current: number, prior: number): number {
  // Guard against division by zero — returning Infinity or NaN would
  // silently propagate through every downstream formatter and chart.
  // Agreed convention: when the prior period is zero, the delta is 0
  // (we cannot express a meaningful percentage from a zero baseline).
  if (prior === 0) return 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}
