// k-anonymity redaction for sub-region (department / barrio) case counts.
//
// Pure module (no db import) so the redaction contract is unit-testable.
// fetchCasesPerSubregion routes every return through redactSmallSubregionCells —
// the boundary mandated by lib/metrics/anonymity.ts for locality-grouped output.

import { complementarySuppress, suppressSmallCells } from "@/lib/metrics";

export type SubregionCaseCount = {
  /** Matches `feature.properties.code` in the sub-region GeoJSON:
   *  - Non-CABA: 5-digit INDEC department_code (e.g. "06007")
   *  - CABA: normalized barrio key (NFD-stripped, lowercase, e.g. "agronomia")
   */
  code: string;
  /** Display name of the sub-region (department name or barrio name). */
  name: string;
  /**
   * Count of open cases assigned to this sub-region.
   * REDACTED to 0 when `suppressed` is true — callers never see 1..k-1.
   */
  count: number;
  /**
   * k-anonymity suppression (k=5, AGENTS.md aggregation policy): true when the
   * sub-region has 1..4 open cases. The raw count is redacted at this boundary;
   * render suppressed cells with the hatch pattern, never as a number.
   */
  suppressed?: boolean;
};

/**
 * Redact sub-k cells before the data leaves the analytics module. Zero-count
 * rows stay visible as zero ("no cases" reveals nothing about individuals);
 * rows with 1..k-1 cases are marked suppressed and their count is zeroed so
 * no caller can leak them.
 *
 * Also runs COMPLEMENTARY suppression (statistical-disclosure control,
 * lib/metrics/anonymity.ts `complementarySuppress` jsdoc) — mirrors the same
 * pass Panorama's own repository pipeline runs after `suppressSmallCells`
 * (src/modules/panorama/infrastructure/repository.ts `toChoroplethCells`).
 * Without it, a caller that publishes an unsuppressed coarser total
 * elsewhere (e.g. a province summary stat alongside this department/barrio
 * drill) would leak a lone k<5-suppressed cell by subtraction:
 * `hidden = total − Σ(visible cells)`. Every call into this function is
 * already scoped to ONE province drill (aggregateRowsByDepartment takes a
 * single provinceIso per call; the CABA barrio path is likewise one call for
 * all of CABA), so all rows form a single group — group by a constant key.
 *
 * Direction-of-safety: `complementarySuppress` only ever MOVES a row from
 * `visible` into `suppressed` (see its implementation — it builds a
 * `toPromote` set from `visible` and filters it out, appending to
 * `suppressed`; it never removes anything from `suppressed`). So this pass
 * can only suppress MORE cells than the primary k-anon pass alone, never
 * fewer — it cannot un-suppress or reveal anything.
 */
export function redactSmallSubregionCells(rows: SubregionCaseCount[]): SubregionCaseCount[] {
  const { visible, suppressed } = suppressSmallCells(
    rows.filter((r) => r.count > 0),
    { count: (r) => r.count, key: (r) => r.code },
  );
  const { suppressed: allSuppressed } = complementarySuppress(
    visible as unknown as readonly SubregionCaseCount[],
    suppressed,
    { group: () => "single-province-drill", count: (r) => r.count },
  );
  const suppressedCodes = new Set(allSuppressed.map((r) => r.code));
  return rows.map((r) => (suppressedCodes.has(r.code) ? { ...r, count: 0, suppressed: true } : r));
}
