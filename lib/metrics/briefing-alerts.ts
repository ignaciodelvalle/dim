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
import type { KpiDefinition, KpiId, KpiUnit } from "./kpi-catalog";
import { KPI_CATALOG } from "./kpi-catalog";
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
const ALERT_ACTIONS: Partial<Record<KpiId, { route: string; label: string }>> = {
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
  // Campañas owns its own completion-rate decision 1:1.
  campaign_completion_rate: { route: "/gob/campanas", label: "Ver en Campañas" },
  // ENO SLA is a bandeja-de-salida delivery concern.
  eno_sla_compliance: { route: "/gob/outbox", label: "Ver en Bandeja de salida" },
};

/** Resolve a candidate's action, validating the route still exists in the
 *  manifest. Returns undefined when unmapped or manifest-orphaned — the
 *  candidate is dropped rather than linking to an unverified destination. */
function resolveAlertAction(kpiId: KpiId): { href: string; label: string } | undefined {
  const action = ALERT_ACTIONS[kpiId];
  if (!action) return undefined;
  const entry = getScreenManifestEntry(action.route);
  if (!entry) return undefined;
  return { href: entry.route, label: action.label };
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

function formatValue(value: number, unit: KpiUnit): string {
  const rounded = Math.round(value);
  return unit === "percent" ? `${rounded}%` : `${rounded}`;
}

function buildTitle(descriptor: KpiDefinition, value: number, target: number): string {
  return `${descriptor.label} ${formatValue(value, descriptor.unit)} — meta ${formatValue(target, descriptor.unit)} (${descriptor.target?.source ?? ""})`;
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
 */
export function buildBriefingAlerts(
  candidates: readonly BriefingAlertCandidate[],
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

    alerts.push({
      id: candidate.kpiId,
      title: buildTitle(descriptor, candidate.value, descriptor.target.value),
      evidence: {
        value: candidate.value,
        target: descriptor.target.value,
        unit: descriptor.unit,
        n: candidate.n,
        source: descriptor.target.source,
      },
      severity,
      confidence,
      actionHref: action.href,
      actionLabel: action.label,
      gap,
    });
  }

  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "alta" ? -1 : 1;
    return b.gap - a.gap;
  });

  return alerts.slice(0, MAX_BRIEFING_ALERTS).map(({ gap, ...alert }) => alert);
}
