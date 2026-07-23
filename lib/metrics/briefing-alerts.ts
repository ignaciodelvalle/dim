// lib/metrics/briefing-alerts.ts — THE BRIEFING alert engine (C6b, docs/reviews/
// results/2026-07-22-plan-maestro-integridad.md §C6 "Capa 1: BRIEFING").
//
// WHY THIS EXISTS
// ----------------
// C6's "toda pantalla declara su decisión dueña" makes /gob home a BRIEFING:
// "¿qué 3 cosas priorizo hoy?" (lib/ui/screen-manifest.ts's GOB_PANEL entry).
// A briefing needs a ranked, bounded list of "what's off-target right now" —
// not a wall of KPI tiles the operator has to interpret themselves. This
// module is the PURE composition step: given the metric values the /gob home
// page ALREADY fetches (zero new query fan-out — hard constraint) plus their
// lib/metrics/kpi-catalog.ts descriptors (targets, guards, confidence —
// C1's contract), produce a ranked, capped-at-5 list of alerts.
//
// GUARDS (non-negotiable — this is the fence that keeps the briefing honest):
//   - No `target`, or `semaphore.paintAgainst !== "target"` → never alerts.
//     No target means no gap; a semaphore explicitly excluded from painting a
//     legal-verdict tone (e.g. ppp_registry_compliance) must not be reframed
//     as an urgent gap either — same C1 principle, applied one layer up.
//   - `zeroDenominatorGate` fires (n===0 and the descriptor declares
//     guards.zeroDenominator) → never alerts. An alert built from a 0/0 ratio
//     is exactly the fabricated-signal class C1 killed at the tile level;
//     this engine must not resurrect it at the briefing level.
//   - `smallNGate` fires (0 < n < guards.smallN.min) → never alerts. A
//     confident-sounding gap over a handful of cases is not a priority — it's
//     noise dressed as urgency.
//   - value already meets or beats the target (tone === "ok") → never alerts.
//     A briefing only surfaces gaps; a met target is evidence, not an alert
//     (it still shows in the "Brechas vs meta" KPI strip under the alerts).
//
// SCOPE NOTE — higher-is-better only: every candidate this module currently
// resolves an action for (see ALERT_ACTIONS) is a "more is better" ratio
// (coverage/penetration/traceability/reunification/completion/compliance).
// `custody_return_rate` (lower-is-better) is deliberately NOT registered —
// this engine's tone/gap math assumes higherIsBetter, and no /gob-home
// candidate reads a lower-is-better ratio today. Wiring a lower-is-better KPI
// through this engine needs an explicit direction parameter, not a silent
// sign flip; left as a documented gap rather than guessed at.
//
// PURE — no DB, no React. Every export is unit-tested in briefing-alerts.test.ts.

import { getScreenManifestEntry } from "@/lib/ui/screen-manifest";
import { formatPercent } from "@/lib/utils/format";
import { type ForecastTrendPoint, forecastToTarget } from "./forecast-to-target";
import type { KpiDefinition, KpiId, KpiUnit } from "./kpi-catalog";
import { KPI_CATALOG, formatKpiTarget } from "./kpi-catalog";
import { smallNGate, zeroDenominatorGate } from "./presentation-guards";
import { toneForTarget } from "./targets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BriefingAlertSeverity = "alta" | "media";
export type BriefingAlertConfidence = "alta" | "media" | "baja";

/**
 * One metric value the /gob home page already fetched, offered as a
 * candidate for the briefing. The engine decides whether it actually
 * produces an alert (guards above) — passing a candidate never guarantees
 * an alert is emitted.
 */
export type BriefingAlertCandidate = {
  /** Catalog id — the descriptor supplies target/semaphore/guards/confidence. */
  kpiId: KpiId;
  /** Current observed value, same unit as the descriptor (percent: 0–100). */
  value: number;
  /**
   * Sample size / denominator the guard engine checks against — e.g.
   * `registryDenominator` for rabies coverage, `mortality.total` for
   * disposal traceability. This is NOT the rate itself.
   */
  n: number;
  /**
   * Whether a descriptor-declared secondary confidence input (e.g. a census
   * row) is actually present for this render. Omit when the descriptor's
   * confidence prose has no such conditional input — confidence then derives
   * from `n`/guards/caveat alone.
   */
  auxPresent?: boolean;
  /**
   * FORECAST-A-META: the metric's OWN trend series, if this candidate's KPI
   * carries a `forecast` descriptor (lib/metrics/kpi-catalog.ts's
   * KpiForecast) AND the caller's page already fetched it (zero new query
   * fan-out — the same rule the module header's guards enforce for
   * target/gap math). Omit when no such trend is at hand; the alert still
   * fires on target/gap alone, simply without a forecast line (see the
   * "insufficient" guard note below).
   */
  trend?: ForecastTrendPoint[];
};

/** The numbers behind an alert — rendered as the tile's evidence line. */
export type BriefingAlertEvidence = {
  value: number;
  target: number;
  unit: KpiUnit;
  /** Sample size the ratio was computed over. */
  n: number;
  /** Legal/programmatic source of the target (Ley/programa/benchmark). */
  source: string;
  /**
   * FORECAST-A-META: the forecast-to-target line (lib/metrics/
   * forecast-to-target.ts's `.line`), appended to the alert's evidence when
   * the descriptor carries `forecast` AND the candidate supplied a `trend`
   * with enough points. Undefined — never a fabricated line — whenever the
   * descriptor has no `forecast`, no trend was passed, or the engine itself
   * guards out (insufficient/met, though "met" cannot reach here — a met
   * target never becomes an alert in the first place, see below).
   */
  forecastLine?: string;
};

export type BriefingAlert = {
  id: KpiId;
  /** es-AR, states the GAP: "Trazabilidad de disposición 33% — meta 75% (Ley 5470)". */
  title: string;
  evidence: BriefingAlertEvidence;
  severity: BriefingAlertSeverity;
  confidence: BriefingAlertConfidence;
  actionHref: string;
  actionLabel: string;
};

export const MAX_BRIEFING_ALERTS = 5;

// ---------------------------------------------------------------------------
// Owning-screen resolution — lib/ui/screen-manifest.ts is the single source.
// ---------------------------------------------------------------------------
//
// Registered for every catalog KPI that CAN produce a gap alert (has a
// `target` + `semaphore.paintAgainst: "target"`, higher-is-better) — not only
// the ones /gob/page.tsx passes as candidates today. This is deliberately
// forward-compatible: a future candidate for reunification_rate or
// campaign_completion_rate (once their fetchers join the home page's bounded
// Promise.all) resolves its action for free, without touching this map.
//
// `route` is validated against SCREEN_MANIFEST at resolve time (not just
// trusted as a string) — a route that gets renamed/removed there silently
// drops the alert instead of linking to a manifest-orphaned URL.
//
// `query` (optional): appended verbatim to the validated `entry.route` to
// land on a specific tab of a fused hub (F2, 2026-07-22) — the manifest only
// tracks the bare hub route, not per-tab deep links, so the tab selector
// lives here instead.
const ALERT_ACTIONS: Partial<Record<KpiId, { route: string; label: string; query?: string }>> = {
  // Programa layer — "¿el programa cumple sus metas de cobertura?" IS the
  // owning decision for a coverage-gap alert (deliberately NOT /gob/analytics:
  // that screen's decision is about background TRENDS, "profundidad" layer —
  // a different question than "is this metric off its target today").
  rabies_coverage_dogs_12m: { route: "/gob/programa", label: "Ver en Programa" },
  microchip_penetration: { route: "/gob/programa", label: "Ver en Programa" },
  // Mortalidad owns its own decision 1:1 — exact match.
  mortality_disposal_traceability: {
    route: "/gob/mortalidad",
    label: "Ver en Mortalidad y disposición",
  },
  // Situación layer — perdidas' decision is literally about reunification follow-up.
  reunification_rate: { route: "/gob/perdidas", label: "Ver en Pérdidas" },
  // Vigilancia owns rabies-observation surveillance.
  rabies_observation_compliance_10d: { route: "/gob/vigilancia", label: "Ver en Vigilancia" },
  // Campañas owns its own completion-rate decision 1:1. F2 fusion (2026-07-22):
  // /gob/campanas is now the Operativos hub's "campanas" tab (the hub's
  // default is "alcance", so the query suffix is required to land on the
  // right tab, not just the hub route).
  campaign_completion_rate: {
    route: "/gob/operativos",
    label: "Ver en Campañas",
    query: "?vista=campanas",
  },
  // ENO SLA is a bandeja-de-salida delivery concern.
  eno_sla_compliance: { route: "/gob/outbox", label: "Ver en Bandeja de salida" },
  // Vigilancia also owns the escalation-gap transparency pairing (claim #4,
  // cursor red-team 2026-07-23) — same screen as rabies_observation_compliance_10d.
  bite_escalation_gap: { route: "/gob/vigilancia", label: "Ver en Vigilancia" },
};

/** Resolve a candidate's action, validating the route still exists in the
 *  manifest. Returns undefined when unmapped or manifest-orphaned — the
 *  candidate is dropped rather than linking to an unverified destination. */
function resolveAlertAction(kpiId: KpiId): { href: string; label: string } | undefined {
  const action = ALERT_ACTIONS[kpiId];
  if (!action) return undefined;
  const entry = getScreenManifestEntry(action.route);
  if (!entry) return undefined;
  return { href: `${entry.route}${action.query ?? ""}`, label: action.label };
}

// ---------------------------------------------------------------------------
// Confidence derivation
// ---------------------------------------------------------------------------

/**
 * Derive the alert's confidence label from what's ACTUALLY at hand for this
 * render — never from the descriptor's prose alone (that's fixed at
 * catalog-write time; a live render can be thinner than the catalog's best
 * case, e.g. no census row this month).
 *
 *  - "baja": n sits under 2× the descriptor's smallN floor — the guard
 *    didn't fire (n is above the floor), but the sample is still thin enough
 *    that a confident-sounding gap deserves an explicit caveat.
 *  - "media": a declared secondary input is explicitly absent
 *    (`auxPresent === false`, e.g. no census row), OR the descriptor's own
 *    caveat flags seed-thin/low-density data, OR the descriptor hasn't been
 *    reached by the C1 confidence-prose sweep yet (no `confidence` field —
 *    don't claim "alta" on undocumented trust).
 *  - "alta": none of the above — a real target, a comfortable sample, and a
 *    documented confidence basis.
 */
export function deriveAlertConfidence(
  descriptor: Pick<KpiDefinition, "guards" | "confidence" | "caveat">,
  input: { n: number; auxPresent?: boolean },
): BriefingAlertConfidence {
  const smallNMin = descriptor.guards?.smallN?.min;
  if (smallNMin !== undefined && input.n < smallNMin * 2) return "baja";
  if (input.auxPresent === false) return "media";
  if (descriptor.caveat?.toLowerCase().includes("seed-density")) return "media";
  if (!descriptor.confidence) return "media";
  return "alta";
}

// ---------------------------------------------------------------------------
// Title / value formatting
// ---------------------------------------------------------------------------

// Bug fix (qa-triage-2026-07-23, finding #6 — rounding drift): this used to
// render `${Math.round(value)}%` (a bare 0-decimal integer), while every KPI
// tile the alert links to (OpKpi via formatPercent) renders 1 decimal — e.g.
// the SAME underlying value read "34%" in an alert and "33,7%" on its own
// tile. Routing through the shared `formatPercent` (lib/utils/format.ts, the
// ONE rounding rule for every rate in the app) makes the alert's number
// byte-identical to the tile it points at — never a second, independently
// -rounded opinion of the same metric.
function formatValue(value: number, unit: KpiUnit): string {
  if (unit === "percent") return formatPercent(value);
  return `${Math.round(value)}`;
}

function buildTitle(descriptor: KpiDefinition, value: number): string {
  // C1 fix (claim #6, cursor red-team 2026-07-23): route the target+source
  // clause through formatKpiTarget so a law-sourced but non-statutory target
  // (e.g. rabies coverage's 80%) never reads as "the law set this number" —
  // see KpiTargetSourceKind. `descriptor.target` is guaranteed by the caller
  // (buildBriefingAlerts only reaches here after its `!descriptor.target`
  // guard already dropped the candidate).
  const targetClause = descriptor.target ? formatKpiTarget(descriptor.target, descriptor.unit) : "";
  return `${descriptor.label} ${formatValue(value, descriptor.unit)} — ${targetClause}`;
}

// ---------------------------------------------------------------------------
// Surveillance urgency alerts — claim #4 (cursor red-team 2026-07-23): the
// Panel/briefing showed a genuinely measured-zero "0 observaciones rábicas
// abiertas" while Vigilancia's OWN screen carried 14 bite reports (12m), 0 of
// them escalated, and 3 observations already past the 10-day legal deadline —
// real surveillance urgency the briefing never surfaced. bite_escalation_gap
// and rabies_observation_compliance_10d's `openBreaches` are NOT target-gap
// shaped (see their kpi-catalog.ts caveats: a deliberate transparency PAIR,
// never a ratio/verdict) — buildBriefingAlerts' target-gap machinery above
// does not apply to them. This is a SEPARATE, honest composition path with
// its OWN guards: an alert fires only on a REAL gap (never a genuine 0/0),
// copy never implies a legal verdict the underlying KPI's own semaphore
// forbids, and severity for the deadline-breach alert derives from the
// breach itself (a live legal-deadline miss), not a painted color.
// ---------------------------------------------------------------------------

export type SurveillanceUrgencyCandidate =
  | {
      kind: "escalation_gap";
      /** Reuses bites_per_10k's `reports` field — trailing 12 months. */
      bites12m: number;
      /** Reuses open_rabies_observations' `count` field — 'now' snapshot. */
      openObservations: number;
    }
  | {
      kind: "deadline_breach";
      /** rabies_observation_compliance_10d's A9 `openBreaches` — a live
       *  snapshot of observations already open past the legal window. */
      openBreaches: number;
    };

/** Builds one alert from a surveillance-urgency candidate, or undefined when
 *  the candidate doesn't actually show a gap (never fabricated on a genuine
 *  0/0 — e.g. 0 bites, or 0 open breaches, produces no alert). */
function buildUrgencyAlert(
  candidate: SurveillanceUrgencyCandidate,
): (BriefingAlert & { gap: number }) | undefined {
  if (candidate.kind === "escalation_gap") {
    // The gap this KPI exists to surface: bites WERE reported, but zero
    // observations are open right now — reports that never escalated. When
    // observations ARE open, or no bites were reported at all, there is no
    // gap to alert on (a genuine 0/0 or a healthy escalation rate).
    if (candidate.bites12m === 0 || candidate.openObservations > 0) return undefined;
    const descriptor = KPI_CATALOG.bite_escalation_gap;
    const action = resolveAlertAction("bite_escalation_gap");
    if (!action) return undefined;
    return {
      id: "bite_escalation_gap",
      title: `${descriptor.label}: ${candidate.bites12m} mordeduras (12m) vs ${candidate.openObservations} observaciones abiertas — la ausencia de escalamiento no implica ausencia de riesgo`,
      evidence: {
        value: candidate.bites12m,
        target: 0,
        unit: "count",
        n: candidate.bites12m,
        source: "Vigilancia — brecha de escalamiento, no un mandato legal",
      },
      // Never a legal-verdict severity (the KPI's own semaphore: "none"
      // forbids painting a color from this pairing) — "media" reads as an
      // attention signal, not a breach.
      severity: "media",
      confidence: "media",
      actionHref: action.href,
      actionLabel: action.label,
      gap: candidate.bites12m,
    };
  }

  // deadline_breach
  if (candidate.openBreaches === 0) return undefined;
  const descriptor = KPI_CATALOG.rabies_observation_compliance_10d;
  const action = resolveAlertAction("rabies_observation_compliance_10d");
  if (!action) return undefined;
  const source = descriptor.target?.source ?? "";
  return {
    id: "rabies_observation_compliance_10d",
    title: `${candidate.openBreaches} ${candidate.openBreaches === 1 ? "observación rábica supera" : "observaciones rábicas superan"} el plazo legal de 10 días (${source})`,
    evidence: {
      value: candidate.openBreaches,
      target: 0,
      unit: "count",
      n: candidate.openBreaches,
      source,
    },
    // A live legal-deadline miss — the one urgency-signal case that DOES
    // warrant "alta": this is an active breach, not a painted tone guess.
    severity: "alta",
    confidence: "alta",
    actionHref: action.href,
    actionLabel: action.label,
    gap: candidate.openBreaches,
  };
}

// ---------------------------------------------------------------------------
// buildBriefingAlerts — the main export
// ---------------------------------------------------------------------------

/**
 * Compose the ranked, capped-at-5 briefing alert list from candidate metric
 * values. Candidates that fail a guard (no target / semaphore:none /
 * zero-denominator / small-N / target already met) are silently dropped —
 * NOT ranked last, never rendered. Ranking: severity desc (alta before
 * media), then gap size desc (bigger miss first).
 *
 * `urgencySignals` (claim #4, cursor red-team 2026-07-23) — the OPTIONAL
 * second candidate class for the two non-target-gap surveillance signals
 * (escalation gap, deadline breach). Merged into the SAME ranked/capped list
 * via buildUrgencyAlert, so a genuine legal-deadline breach can outrank a
 * target-gap alert exactly as its severity implies.
 */
export function buildBriefingAlerts(
  candidates: readonly BriefingAlertCandidate[],
  urgencySignals: readonly SurveillanceUrgencyCandidate[] = [],
): BriefingAlert[] {
  const alerts: Array<BriefingAlert & { gap: number }> = [];

  for (const candidate of candidates) {
    const descriptor = KPI_CATALOG[candidate.kpiId];

    // No target, or a semaphore that refuses to paint a legal-verdict tone
    // (paintAgainst: "none") → no gap can honestly be computed. This also
    // covers descriptors that omit `semaphore` entirely (the C1 barrido
    // hasn't reached them yet) — absence of an explicit "target" opt-in is
    // treated the same as an explicit "none".
    if (!descriptor.target || descriptor.semaphore?.paintAgainst !== "target") continue;

    // Unmeasurable-data guards — an alert from a 0/0 ratio or a handful of
    // cases is exactly the dishonesty C1 killed at the tile level.
    if (zeroDenominatorGate(descriptor, candidate.n)) continue;
    if (smallNGate(descriptor, candidate.n)) continue;

    const tone = toneForTarget(candidate.value, descriptor.target.value);
    // Target met (or beaten) — evidence, not an alert.
    if (tone === "ok") continue;

    const action = resolveAlertAction(candidate.kpiId);
    // No owning screen registered (or the manifest no longer carries the
    // registered route) — drop rather than link to an unverified destination.
    if (!action) continue;

    const gap = descriptor.target.value - candidate.value;
    const severity: BriefingAlertSeverity = tone === "danger" ? "alta" : "media";
    const confidence = deriveAlertConfidence(descriptor, {
      n: candidate.n,
      auxPresent: candidate.auxPresent,
    });

    // FORECAST-A-META: only when the descriptor declares a qualifying trend
    // source AND this candidate actually supplied one — guards flow through
    // the engine itself (an insufficient/flat/receding trend simply yields no
    // `.line`, never a fabricated one). SCOPE NOTE above: this engine's
    // gap/tone math is higher-is-better-only, so forecastToTarget is called
    // with its default (higherIsBetter: true) — consistent with every KPI
    // this module resolves an action for today.
    const forecastLine =
      descriptor.forecast && candidate.trend && candidate.trend.length > 0
        ? (forecastToTarget({
            current: candidate.value,
            target: descriptor.target.value,
            trend: candidate.trend,
          }).line ?? undefined)
        : undefined;

    alerts.push({
      id: candidate.kpiId,
      title: buildTitle(descriptor, candidate.value),
      evidence: {
        value: candidate.value,
        target: descriptor.target.value,
        unit: descriptor.unit,
        n: candidate.n,
        source: descriptor.target.source,
        forecastLine,
      },
      severity,
      confidence,
      actionHref: action.href,
      actionLabel: action.label,
      gap,
    });
  }

  for (const signal of urgencySignals) {
    const built = buildUrgencyAlert(signal);
    if (built) alerts.push(built);
  }

  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "alta" ? -1 : 1;
    return b.gap - a.gap;
  });

  return alerts.slice(0, MAX_BRIEFING_ALERTS).map(({ gap, ...alert }) => alert);
}
