// k-Anonymity suppression for locality-grouped projections.
//
// This is the boundary that was mandated by AGENTS.md § "Aggregation & privacy policy"
// (k=5 suppression) but never implemented. Every fetcher that groups by locality
// MUST route its output through suppressSmallCells before returning.
//
// The branded SuppressedCells type (defined in types.ts) enforces this at compile
// time: a raw Row[] is not assignable to SuppressedCells.

import type { Cell, MetricResult, SuppressedCells } from "./types";

export type { Cell, MetricResult, SuppressedCells };

/** Options for suppressSmallCells. */
export type SuppressOpts<Row> = {
  /** Extract the population count for a row (used to compare against k). */
  count: (r: Row) => number;
  /** Extract the grouping key (e.g. locality name) for audit/reporting. */
  key: (r: Row) => string;
  /**
   * Minimum cell size. Cells with count < k are suppressed.
   * Default: 5 (per AGENTS.md "Aggregation & privacy policy").
   */
  k?: number;
  /**
   * Optional rollup: fold suppressed rows into a coarser jurisdiction instead
   * of dropping them. Receives the array of suppressed rows; return a
   * replacement rolled-up row (or null to discard instead of rolling up).
   */
  rollup?: (suppressed: Row[]) => Row | null;
};

/**
 * Suppress cells below the k-anonymity threshold.
 *
 * Behavior:
 *  - Rows with `count(row) >= k` → visible (pass through).
 *  - Rows with `count(row) < k`  → suppressed.
 *  - If `rollup` is provided, the suppressed rows are passed to it and the
 *    result (if non-null) is added to visible. Otherwise they are discarded.
 *  - Returns { visible, suppressed, suppressedCount } so the UI can show
 *    "N localities hidden (privacy)" when suppressedCount > 0.
 *
 * The returned `visible` array carries the brand that satisfies SuppressedCells
 * when `Row extends Cell`. For generic Row types, callers can use the raw
 * `visible`/`suppressed` arrays directly.
 */
export function suppressSmallCells<Row>(
  rows: Row[],
  opts: SuppressOpts<Row>,
): {
  visible: SuppressedCells;
  suppressed: Row[];
  suppressedCount: number;
} {
  const k = opts.k ?? 5;
  const visible: Row[] = [];
  const suppressed: Row[] = [];

  for (const row of rows) {
    if (opts.count(row) >= k) {
      visible.push(row);
    } else {
      suppressed.push(row);
    }
  }

  if (suppressed.length > 0 && opts.rollup) {
    const rolled = opts.rollup(suppressed);
    if (rolled !== null) visible.push(rolled);
  }

  // Brand the visible array as SuppressedCells.
  // The cast is safe: suppressSmallCells is the ONLY place that can construct
  // a SuppressedCells value — that is the enforcement boundary.
  return {
    visible: visible as unknown as SuppressedCells,
    suppressed,
    suppressedCount: suppressed.length,
  };
}

/**
 * Convenience wrapper that returns the MetricResult shape expected by
 * locality-grouped fetchers.
 *
 * Example:
 *   return suppressedMetric(rows, { count: r => r.count, key: r => r.locality });
 */
export function suppressedMetric<Row>(
  rows: Row[],
  opts: SuppressOpts<Row>,
): MetricResult<SuppressedCells> {
  const { visible, suppressedCount } = suppressSmallCells(rows, opts);
  return { value: visible, suppressedCount };
}
