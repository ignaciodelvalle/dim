// Province-tier k-anonymity for the PUBLIC open-data datasets (Epic B, item 1).
//
// The authenticated Panorama province choropleth publishes province aggregates
// UNSUPPRESSED (repository.ts § U5: "Province returns filled-polygon cells (no
// k-anon)") — acceptable for a jurisdiction-scoped government operator, NOT for
// an anonymous open-data download. Ley 27.275 active transparency requires the
// data be OPEN, so the same province aggregates must be re-published to the
// public — and that re-publication is what this module protects.
//
// It routes the province tier through the SAME primitives the locality tier uses
// (lib/metrics/anonymity.ts): the k=5 small-cell rule and complementary
// (secondary) suppression against a differencing attack. The ONLY differences
// from the locality path are (a) the differencing group is the NATION (a single
// group across all provinces) rather than the province, because the coarser
// published aggregate above a province row is the national total; and (b) rate
// datasets protect the numerator and its complement in addition to the
// population base (see isRateCellProtected).
//
// Pure and DB-free by design so the privacy rule is unit-testable without a DB.
// The suppressed marker below is the ONLY thing a protected cell ever emits — a
// suppressed cell NEVER carries a numeric value, a numerator, or a denominator.

import { complementarySuppress, suppressSmallCells } from "@/lib/metrics/anonymity";

/** k-anonymity threshold — AGENTS.md "Aggregation & privacy policy" (k=5). */
export const OPEN_DATA_K = 5;

/** The exact string a suppressed numeric cell renders/exports as. Never 0 — a
 *  suppressed value is WITHHELD, not zero (a false zero would itself leak that
 *  the true count is sub-k, and read as real data). */
export const SUPPRESSED_MARKER = "suprimido por privacidad";

/** The complementary-suppression group for the province tier: the whole country.
 *  The published aggregate one level coarser than a province row is the national
 *  total, so a lone suppressed province is recoverable by subtracting the visible
 *  provinces from that national total — the group across which a single hidden
 *  cell must not be isolable is therefore national. */
const NATIONAL_GROUP = "AR";

/** A raw DENSITY province row (a count metric, e.g. mortality): `count` is the
 *  number of individuals in the cell — the quantity k protects directly. */
export type DensityRow = {
  provinceCode: string;
  provinceName: string;
  count: number;
};

/** A raw RATE province row (a proportion metric, e.g. rabies coverage):
 *  `numerator` / `denominator` are the underlying counts; `ratePct` the derived
 *  percentage (0-100). BOTH counts are needed to decide suppression honestly —
 *  a rate published with its base leaks the numerator by multiplication. */
export type RateRow = {
  provinceCode: string;
  provinceName: string;
  numerator: number;
  denominator: number;
  ratePct: number;
};

/** A row tagged with its suppression decision. The row object is unchanged; the
 *  dataset layer decides what to emit (values, or SUPPRESSED_MARKER) from the
 *  flag. Input order is preserved. */
export type TaggedRow<Row> = { row: Row; suppressed: boolean };

/** A strictly-positive count below k is a PROTECTED small group. Exactly 0 is
 *  NOT protected: an empty group re-identifies no one (same "zero nuance" as
 *  suppressDelta in lib/metrics/anonymity.ts). */
function isProtectedCount(n: number, k: number): boolean {
  return n > 0 && n < k;
}

/**
 * Whether a RATE cell must be suppressed. Three ways a rate + base can expose a
 * small group, any of which protects the cell:
 *  1. `denominator < k` — the population base itself is a sub-k group. This IS
 *     the k-anon small-cell rule (suppressSmallCells) applied to the base.
 *  2. `numerator` is a protected small positive — e.g. "2 of 9 000 dogs
 *     vaccinated" isolates those 2 owners.
 *  3. `denominator - numerator` (the complement) is a protected small positive —
 *     e.g. "8 998 of 9 000 vaccinated" isolates the 2 who are NOT.
 * Pure; exported for direct unit testing.
 */
export function isRateCellProtected(
  numerator: number,
  denominator: number,
  k = OPEN_DATA_K,
): boolean {
  if (denominator < k) return true;
  return isProtectedCount(numerator, k) || isProtectedCount(denominator - numerator, k);
}

/** Tag original rows by identity against the final suppressed partition,
 *  preserving input order. suppressSmallCells / complementarySuppress both keep
 *  the original row object references, so Set identity membership is exact. */
function tagByIdentity<Row>(
  original: readonly Row[],
  suppressed: readonly Row[],
): TaggedRow<Row>[] {
  const suppressedSet = new Set<Row>(suppressed);
  return original.map((row) => ({ row, suppressed: suppressedSet.has(row) }));
}

/**
 * Suppress a DENSITY province dataset (count metric). Mirrors toChoroplethCells
 * exactly — suppressSmallCells(k=5) then complementarySuppress — but grouped
 * nationally (see NATIONAL_GROUP). A province with a sub-k count is suppressed;
 * if that leaves exactly one suppressed cell nationally, the next-smallest
 * visible province is also suppressed so the lone hidden count cannot be
 * recovered from the national total.
 */
export function suppressDensityProvinces(
  rows: readonly DensityRow[],
  k = OPEN_DATA_K,
): TaggedRow<DensityRow>[] {
  const primary = suppressSmallCells([...rows], {
    count: (r) => r.count,
    key: (r) => r.provinceCode,
    k,
  });
  const { suppressed } = complementarySuppress(
    primary.visible as unknown as readonly DensityRow[],
    primary.suppressed,
    { group: () => NATIONAL_GROUP, count: (r) => r.count },
  );
  return tagByIdentity(rows, suppressed);
}

/**
 * Suppress a RATE province dataset (proportion metric). Primary suppression uses
 * isRateCellProtected (population base + numerator + complement); complementary
 * suppression then defends the NUMERATOR against differencing across the
 * national numerator total (count = numerator — the quantity a published
 * national total would let an attacker subtract toward). A province whose base,
 * numerator, or complement is sub-k is suppressed; a lone national suppression
 * pulls in the next-smallest-numerator visible province.
 */
export function suppressRateProvinces(
  rows: readonly RateRow[],
  k = OPEN_DATA_K,
): TaggedRow<RateRow>[] {
  const primaryVisible: RateRow[] = [];
  const primarySuppressed: RateRow[] = [];
  for (const r of rows) {
    if (isRateCellProtected(r.numerator, r.denominator, k)) primarySuppressed.push(r);
    else primaryVisible.push(r);
  }
  const { suppressed } = complementarySuppress(primaryVisible, primarySuppressed, {
    group: () => NATIONAL_GROUP,
    count: (r) => r.numerator,
  });
  return tagByIdentity(rows, suppressed);
}
