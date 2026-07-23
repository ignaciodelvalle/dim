// lib/metrics/impact-ranking.ts — GAP×POBLACIÓN ranking (PO-interview decision 2,
// item 1: "gap×población ranking + forecasts que informen qué falta").
//
// WHY THIS EXISTS
// ----------------
// The pre-existing "N provincias en alerta" KPI + "M de N combinaciones bajo
// meta" table are BOTH honest counts, but neither PRIORITIZES: every below-
// target row reads as equally urgent ("si todo está en peligro, nada está en
// peligro"). A province at 78% coverage with 40,000 estimated dogs and a
// province at 78% coverage with 400 estimated dogs are NOT the same problem —
// the first is where fixing the gap actually moves the national needle.
//
// This module ranks below-target rows by the estimated real-world UNITS still
// uncovered — "~N perros sin vacunar", never an abstract 0–100 score — so
// "cuál" (which jurisdiction) is answered, not just "cuántas" (how many).
//
// FORMULA
// -------
//   impact = (target − coverage) / 100 × population
//
// `population` is whatever population the CALLER supplies for that row (e.g.
// the census-derived estimated canine population from lib/metrics/census.ts's
// estimateDogPopulation — see the render-site wiring in app/gob/programa and
// app/admin/programa). This module does not fetch or estimate population
// itself — it only ranks rows the caller has already resolved a coverage,
// target, and (possibly null) population for.
//
// HONESTY GUARDS (in the engine, not the callers)
// ------------------------------------------------
//   - already-met (coverage >= target): EXCLUDED entirely — a met target is
//     evidence, not a gap to rank (same principle as forecastToTarget's "met"
//     branch and briefing-alerts.ts's tone==="ok" exclusion).
//   - no population (no census row for that jurisdiction): the row is kept
//     (it may still be genuinely below target) but ranked LAST, with
//     `impact: null` — NEVER a fabricated score. Callers render "sin dato
//     censal" for these rows, never a "0" or an invented number.
//   - rounding: impact is always Math.round()'d — a real headcount, never a
//     decimal "~14.3 perros".
//
// PURE — no DB, no React. Unit-tested in impact-ranking.test.ts.

/** One below-or-at-target row the caller wants ranked by real-world impact. */
export type ImpactRankable = {
  /** Display name — province, locality, or any other jurisdiction unit. */
  jurisdiction: string;
  /** Observed coverage rate (0–100). */
  coverage: number;
  /** Programme target (0–100), from lib/metrics/targets.ts's TARGETS. */
  target: number;
  /**
   * Estimated population this jurisdiction's gap applies to (e.g. estimated
   * canine population from census.ts's estimateDogPopulation). `null` when no
   * census row exists for this jurisdiction — NEVER a fabricated number.
   */
  population: number | null;
};

/** An `ImpactRankable` row plus the computed rank + impact. */
export type ImpactRow<T extends ImpactRankable = ImpactRankable> = T & {
  /**
   * Estimated real-world units uncovered: round((target − coverage) / 100 ×
   * population). `null` exactly when `population` was null (no census row) —
   * the row is still returned (ranked last), never silently dropped or given
   * an invented number.
   */
  impact: number | null;
  /** 1-based rank within the returned list — impact desc, unknowns last. */
  rank: number;
};

/** True when a row's coverage already meets or beats its target — no gap to rank. */
export function isImpactMet(row: Pick<ImpactRankable, "coverage" | "target">): boolean {
  return row.coverage >= row.target;
}

/**
 * (target − coverage) / 100 × population, rounded to the nearest whole unit —
 * the honest "estimated units uncovered" figure. Returns `null` when
 * `population` is unknown/non-positive (no census row) — never a fabricated
 * estimate. Callers MUST have already excluded met rows (isImpactMet) before
 * calling this — it does not itself guard against a negative (already-met)
 * gap.
 */
export function computeImpact(
  row: Pick<ImpactRankable, "coverage" | "target" | "population">,
): number | null {
  if (row.population === null || !Number.isFinite(row.population) || row.population <= 0) {
    return null;
  }
  const gapPct = row.target - row.coverage;
  return Math.round((gapPct / 100) * row.population);
}

/**
 * Rank rows by estimated real-world impact, descending. Already-met rows are
 * dropped entirely. Rows with no population estimate are kept but sorted to
 * the end (alphabetically among themselves), each carrying `impact: null`.
 *
 * Generic over `T` so callers can pass richer row shapes (e.g. OutlierRow +
 * a resolved `population` field) and get them back with `impact`/`rank`
 * attached, without losing any of the original fields (e.g. `metric`).
 */
export function rankByImpact<T extends ImpactRankable>(rows: readonly T[]): ImpactRow<T>[] {
  const belowTarget = rows.filter((r) => !isImpactMet(r));
  const withImpact = belowTarget.map((r) => ({ ...r, impact: computeImpact(r) }));

  const known = withImpact
    .filter((r): r is typeof r & { impact: number } => r.impact !== null)
    .sort((a, b) => b.impact - a.impact);
  const unknown = withImpact
    .filter((r) => r.impact === null)
    .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction, "es"));

  return [...known, ...unknown].map((row, i) => ({ ...row, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// Per-jurisdiction totals + "top N covers X% of the national gap" summary
// ---------------------------------------------------------------------------

/** Summed impact for one jurisdiction across however many rows it contributed. */
export type ImpactTotal = {
  jurisdiction: string;
  /** Sum of `computeImpact` across this jurisdiction's below-target rows.
   *  `null` when NONE of its rows had a population estimate (never a summed
   *  fabrication out of all-null inputs). */
  impact: number | null;
};

/**
 * Collapse possibly-multiple rows per jurisdiction (e.g. one row per
 * province×métrica combination from fetchCrossJurisdictionOutliers) into one
 * summed impact per jurisdiction. Already-met rows contribute nothing (same
 * exclusion as rankByImpact) — a jurisdiction whose every row is at/above
 * target never appears in the output at all.
 */
export function totalImpactByJurisdiction<T extends ImpactRankable>(
  rows: readonly T[],
): ImpactTotal[] {
  const totals = new Map<string, { sum: number; known: boolean }>();

  for (const row of rows) {
    if (isImpactMet(row)) continue;
    const impact = computeImpact(row);
    const entry = totals.get(row.jurisdiction) ?? { sum: 0, known: false };
    if (impact !== null) {
      entry.sum += impact;
      entry.known = true;
    }
    totals.set(row.jurisdiction, entry);
  }

  return [...totals.entries()].map(([jurisdiction, { sum, known }]) => ({
    jurisdiction,
    impact: known ? sum : null,
  }));
}

/** Default "top N" size for the impact summary line — matches the PO's own
 *  "top 5 por impacto" wording. */
export const DEFAULT_IMPACT_TOP_N = 5;

export type ImpactSummary = {
  /** Jurisdictions in the top N, highest impact first. */
  topJurisdictions: string[];
  /** Sum of impact across the top N jurisdictions. */
  topImpact: number;
  /** Sum of impact across EVERY jurisdiction with a known population — the
   *  "national gap" denominator the top N is measured against. */
  totalImpact: number;
  /** round(topImpact / totalImpact × 100, 1 decimal) — always ≤ 100 by
   *  construction (topImpact is a subset sum of totalImpact). */
  sharePct: number;
};

/**
 * Summarize "the top N jurisdictions by impact cover X% of the national gap"
 * — the PO's "El 60% del gap nacional está en: X, Y, Z" line. Returns `null`
 * when there is nothing to summarize (no jurisdiction has a known population,
 * or the known total is zero/negative) — never a fabricated percentage over
 * zero known data.
 */
export function summarizeTopImpact(
  totals: readonly ImpactTotal[],
  topN: number = DEFAULT_IMPACT_TOP_N,
): ImpactSummary | null {
  const known = totals.filter(
    (t): t is { jurisdiction: string; impact: number } => t.impact !== null && t.impact > 0,
  );
  if (known.length === 0) return null;

  const ranked = [...known].sort((a, b) => b.impact - a.impact);
  const totalImpact = ranked.reduce((sum, t) => sum + t.impact, 0);
  if (totalImpact <= 0) return null;

  const top = ranked.slice(0, topN);
  const topImpact = top.reduce((sum, t) => sum + t.impact, 0);
  const sharePct = Math.round((topImpact / totalImpact) * 1000) / 10;

  return {
    topJurisdictions: top.map((t) => t.jurisdiction),
    topImpact,
    totalImpact,
    sharePct,
  };
}

// ---------------------------------------------------------------------------
// es-AR display formatting (pure — no React)
// ---------------------------------------------------------------------------

const AR_INTEGER_FORMAT = new Intl.NumberFormat("es-AR");

/** es-AR thousands-separated integer ("1.982"). Never called on a decimal —
 *  every impact figure this module produces is already Math.round()'d. */
export function formatImpactUnits(units: number): string {
  return AR_INTEGER_FORMAT.format(units);
}

/** The note a row with `impact: null` must render — NEVER a "0" or a dash
 *  that could be misread as "no gap". */
export const NO_CENSUS_NOTE = "sin dato censal";

/**
 * The PO's "El 60% del gap nacional está en: X, Y, Z" line, built from a
 * resolved ImpactSummary. `sharePct` is rendered with an es-AR decimal comma
 * only when it isn't a whole number (mirrors lib/utils/format.ts's
 * formatPercent convention, kept local here to stay dependency-free/pure).
 */
export function formatTopImpactLine(summary: ImpactSummary): string {
  const pct = Number.isInteger(summary.sharePct)
    ? String(summary.sharePct)
    : summary.sharePct.toFixed(1).replace(".", ",");
  return `El ${pct}% del gap nacional está en: ${summary.topJurisdictions.join(", ")}`;
}
