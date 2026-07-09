// k-anonymity redaction for sub-region (department / barrio) case counts.
//
// Pure module (no db import) so the redaction contract is unit-testable.
// fetchCasesPerSubregion routes every return through redactSmallSubregionCells —
// the boundary mandated by lib/metrics/anonymity.ts for locality-grouped output.

import { suppressSmallCells } from "@/lib/metrics";

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
 */
export function redactSmallSubregionCells(rows: SubregionCaseCount[]): SubregionCaseCount[] {
  const { suppressed } = suppressSmallCells(
    rows.filter((r) => r.count > 0),
    { count: (r) => r.count, key: (r) => r.code },
  );
  const suppressedCodes = new Set(suppressed.map((r) => r.code));
  return rows.map((r) => (suppressedCodes.has(r.code) ? { ...r, count: 0, suppressed: true } : r));
}
