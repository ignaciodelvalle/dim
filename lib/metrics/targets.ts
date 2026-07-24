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

import { pluralizeEs } from "@/lib/utils/format";

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

  /**
   * % of ENO (Enfermedades de Notificación Obligatoria) alert cases resolved
   * within the regulatory SLA window.
   *
   * Programmatic benchmark — derived from ANMAT/SENASA operational targets.
   * See Paquete ENO (surveillance-metrics.ts) for the fetcher.
   */
  ENO_SLA_PCT: 95,

  /**
   * % of adopters who return to the programme within 12 months (repeat adoptions
   * or follow-up visits), used to measure programme retention and engagement.
   *
   * Programmatic benchmark — programme internal KPI.
   */
  ADOPTION_RETURN_RATE_PCT: 10,

  /**
   * % of PPP-flagged (potencialmente peligrosos) dogs with a
   * dangerous_breed_attested event on record.
   *
   * Legal mandate (Ley CABA 4078 / Ley Prov. 14.107): attestation is
   * compulsory for every PPP dog, so the only defensible target is 100.
   */
  PPP_ATTESTATION_PCT: 100,
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
// toneForBreachCeiling — non-celebratory tone for "breach threshold, not a
// target to reach" metrics (screenshot review finding #12)
// ---------------------------------------------------------------------------

/**
 * Tone for a metric whose target is a MAXIMUM ceiling that only exists to
 * flag a breach — never a value worth painting "ok"/green as you approach
 * it. `toneForTarget(value, target, { higherIsBetter: false })` returns
 * "ok" for any value at or under the ceiling, which reads as a success
 * signal even at, say, 16,7% against a 25% breach threshold — a real
 * compliance/data gap (mortality_unknown_disposal_rate's own catalog caveat:
 * "Umbral de incumplimiento (no meta a alcanzar)" — a breach threshold, not
 * a target to reach). This helper drops the "ok" band entirely: "neutral"
 * below the ceiling (no false-positive success framing), "warn"/"danger"
 * above it, same bands as toneForTarget.
 */
export function toneForBreachCeiling(
  value: number,
  ceiling: number,
  opts: { warnBand?: number } = {},
): "neutral" | "warn" | "danger" {
  const tone = toneForTarget(value, ceiling, { ...opts, higherIsBetter: false });
  return tone === "ok" ? "neutral" : tone;
}

// ---------------------------------------------------------------------------
// enoSlaTone — tone for the SLA ENO KPI tile (A7)
// ---------------------------------------------------------------------------

/**
 * Tone for the SLA ENO tile. The on-time percentage only counts DELIVERED
 * notifications, so it can read 100% while notifications sit past their
 * sla_due_at undelivered — QA 2026-07-03 caught "100% · Normal" rendered
 * next to "12 en breach activo". Open breaches must degrade the tone
 * regardless of the delivered-on-time percentage.
 */
export function enoSlaTone(eno: {
  onTimePct: number | null;
  breachedOpen: number;
}): ToneResult | undefined {
  const pctTone =
    eno.onTimePct !== null ? toneForTarget(eno.onTimePct, TARGETS.ENO_SLA_PCT) : undefined;
  if (eno.breachedOpen > 0) return pctTone === "danger" ? "danger" : "warn";
  return pctTone;
}

/**
 * Headline value + sub-line for the SLA ENO tile — shared coherence rule
 * (qa-triage-2026-07-23, finding #12; same shape already proven in
 * components/admin/AdminKpiStrip.tsx, Cowork A3/C1). `onTimePct` is
 * period-scoped over DELIVERED rows only, so it can read "100%" while
 * notifications sit pending PAST their sla_due_at — a tile that headlines the
 * historical % next to a live breach count contradicts itself ("100%" vs "12
 * en incumplimiento"). When there is an active breach, this LEADS with the
 * live, actionable "N vencidas ahora" and demotes the historical % to a
 * clearly labeled "(referencia)" sub-line; otherwise it reports the
 * historical % as the headline (nothing to contradict when there's no open
 * breach) with a median-latency or no-data sub.
 */
export function enoSlaHeadline(
  eno: { onTimePct: number | null; breachedOpen: number; medianLatencyHours: number | null },
  formatPct: (v: number | null) => string,
): { value: string; sub: string } {
  const pctLabel = formatPct(eno.onTimePct);
  if (eno.breachedOpen > 0) {
    return {
      value: `${eno.breachedOpen} vencidas ahora`,
      // red-team-admin #1: state WHY 100% and "N vencidas" coexist — the % is over
      // delivered rows only; the breached-open ones are a disjoint pending set.
      sub:
        eno.onTimePct !== null
          ? `Cumplimiento histórico ${pctLabel} de las entregadas — no incluye estas ${eno.breachedOpen} pendientes vencidas (referencia)`
          : "Sin entregas en el período",
    };
  }
  return {
    value: pctLabel,
    sub:
      eno.medianLatencyHours !== null
        ? `Mediana ${eno.medianLatencyHours} h`
        : "Sin entregas en el período",
  };
}

// ---------------------------------------------------------------------------
// rabiesComplianceHeadline — breach-aware headline for the rabies-10d tile (K2)
// ---------------------------------------------------------------------------

/**
 * Headline value + sub-line for the rabies_observation_compliance_10d tile —
 * same breach-aware swap as enoSlaHeadline above (qa-triage-2026-07-23,
 * finding #12 pattern). `compliancePct` is period-scoped over CLOSED
 * observations only, so it can read "100%" while observations sit OPEN past
 * their 10-day legal window (`openBreaches`, a live "now" snapshot — see
 * kpi-catalog.ts's A9 caveat). When there is an open breach, this LEADS with
 * the live, actionable "N fuera de plazo ahora" and demotes the historical %
 * to a clearly labeled "(referencia)" sub-line; otherwise it reports the
 * historical % as the headline with the closed-count sub (nothing to
 * contradict when there's no open breach).
 */
export function rabiesComplianceHeadline(
  rabies: { compliancePct: number | null; openBreaches: number; closed: number },
  formatPct: (v: number | null) => string,
): { value: string; sub: string } {
  const pctLabel = formatPct(rabies.compliancePct);
  if (rabies.openBreaches > 0) {
    return {
      value: `${rabies.openBreaches} fuera de plazo ahora`,
      sub:
        rabies.compliancePct !== null
          ? `Cumplimiento histórico ${pctLabel} de las cerradas (referencia)`
          : "Sin cierres en el período",
    };
  }
  return {
    value: pctLabel,
    sub: `${rabies.closed} ${pluralizeEs(rabies.closed, "cerrada")} en el período`,
  };
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

// ---------------------------------------------------------------------------
// decisionsDeltaPct — 7d-vs-prior-7d delta for the approvals queue KPI
// ---------------------------------------------------------------------------

/**
 * Compute the "Decisiones 7d" delta percentage shared by the admin landing and
 * the /admin/sistema dashboard.
 *
 * `fetchDecisionsMetrics` returns approved/rejected counts for the trailing 7d
 * and 30d windows but NOT a dedicated prior-7d baseline. We approximate the
 * prior 7d as the first 23 days of the 30d window scaled down to a 7-day span:
 *
 *   total7d   = approved7d + rejected7d
 *   total30d  = approved30d + rejected30d
 *   prior23d  = total30d − total7d            (decisions in days 8..30)
 *   priorWeek = round(prior23d / 23 * 7)      (≈ prior 7d baseline)
 *   delta     = computeDeltaPct(total7d, priorWeek)
 *
 * Returns `null` when `prior23d <= 0` (no baseline to compare against — the KPI
 * then omits the deltaV2 chip). This is the single source of truth so the two
 * pages can't drift (critique C28).
 *
 * PURE — no DB, no side effects.
 *
 * @param d - The decisions counts from `fetchDecisionsMetrics`.
 * @returns The rounded percent change, or `null` when there is no prior baseline.
 */
export function decisionsDeltaPct(d: {
  approved7d: number;
  rejected7d: number;
  approved30d: number;
  rejected30d: number;
}): number | null {
  const total7d = d.approved7d + d.rejected7d;
  const total30d = d.approved30d + d.rejected30d;
  const prior23d = total30d - total7d; // approx prior 7d baseline ≈ prior23d/23*7
  if (prior23d <= 0) return null;
  return computeDeltaPct(total7d, Math.round((prior23d / 23) * 7));
}
