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
 * Complementary suppression (statistical-disclosure control) against a
 * differencing attack.
 *
 * When a coarser aggregate is published UNSUPPRESSED (the Panorama province
 * choropleth totals, spec §U5) while its finer breakdown is k-anon suppressed,
 * a group with EXACTLY ONE suppressed cell leaks that cell's exact count by
 * subtraction: `hidden = groupTotal − Σ(visible cells)`. Suppressing the small
 * cell alone is not enough — its value is recoverable from the siblings.
 *
 * The textbook fix is COMPLEMENTARY (a.k.a. secondary) suppression: whenever a
 * group has exactly one primary-suppressed cell AND at least one visible
 * sibling, ALSO suppress the next-smallest visible cell in that group, so no
 * single hidden value can be isolated by subtraction. After this pass every
 * group holds 0 or ≥2 suppressed cells — EXCEPT a group with a lone suppressed
 * cell and NO visible sibling (a single-cell group), which has nothing to
 * complement: its exposure is the published group total itself (the accepted
 * §U5 province-total disclosure), not a finer-tier differencing leak.
 *
 * Pure and generic: `group` extracts the aggregation group (e.g. province) and
 * `count` the cell population. Returns re-partitioned visible/suppressed arrays;
 * the caller renders the complementary cell with the SAME k-anon hatch (its
 * value is withheld identically — the user cannot tell primary from secondary).
 */
export function complementarySuppress<Row>(
  visible: readonly Row[],
  suppressed: readonly Row[],
  opts: { group: (r: Row) => string; count: (r: Row) => number },
): { visible: Row[]; suppressed: Row[] } {
  // Count primary-suppressed cells per group.
  const suppressedPerGroup = new Map<string, number>();
  for (const r of suppressed) {
    const g = opts.group(r);
    suppressedPerGroup.set(g, (suppressedPerGroup.get(g) ?? 0) + 1);
  }

  // For each group with exactly one suppressed cell, pick the smallest visible
  // sibling to promote into suppression (the complementary cell).
  const toPromote = new Set<Row>();
  for (const [g, n] of suppressedPerGroup) {
    if (n !== 1) continue;
    let smallest: Row | null = null;
    for (const r of visible) {
      if (opts.group(r) !== g) continue;
      if (smallest === null || opts.count(r) < opts.count(smallest)) smallest = r;
    }
    // No visible sibling → single-cell group; nothing to complement (see jsdoc).
    if (smallest !== null) toPromote.add(smallest);
  }

  if (toPromote.size === 0) return { visible: [...visible], suppressed: [...suppressed] };
  return {
    visible: visible.filter((r) => !toPromote.has(r)),
    suppressed: [...suppressed, ...toPromote],
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
