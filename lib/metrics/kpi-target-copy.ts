/**
 * How a KPI target renders as copy — extracted from kpi-catalog.ts on
 * 2026-08-01 under the same file-size pressure as kpi-guards.ts. It belongs
 * with the guards rather than with the descriptors: both answer "how does
 * this descriptor render HONESTLY", not "what does it measure".
 */
import type { KpiTarget, KpiUnit } from "./kpi-catalog";

/**
 * Render a target+source pair honestly, per `sourceKind` — the SINGLE place
 * that combines `target.value` and `target.source` into copy, so every
 * consumer (OpKpi's ⓘ popover, briefing-alerts' title) renders identically
 * and a future KPI can't reintroduce the "meta X% (Ley Y)" conflation.
 *
 * PURE — no DB, no React.
 */
export function formatKpiTarget(target: KpiTarget, unit: KpiUnit): string {
  const valueStr = `${target.value}${unit === "percent" ? "%" : ""}`;
  if (target.sourceKind === "programmatic-target") {
    return `Obligación: ${target.source} · Meta programática: ${valueStr}`;
  }
  // statutory-obligation and benchmark: the number and the source are either
  // the same fact (statutory) or carry no legal weight to conflate with
  // (benchmark) — the plain "Meta: X% (fuente)" form stays honest for both.
  return `Meta: ${valueStr} (${target.source})`;
}
