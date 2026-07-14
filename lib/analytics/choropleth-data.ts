// Province-choropleth data shaping — shared by the /gob/* jurisdiction
// dashboards that feed <MapChoroplethDynamic> a province-keyed cell list
// (task #31c dedup: this shaping was re-derived nearly identically at four
// call sites — /gob/poblacion, /gob/censo, /gob/perdidas, /gob/vigilancia).
//
// Two genuinely different shapes existed, so two small functions, not one
// forced-generic one:
//   toChoroplethData      — one row per province already (poblacion, censo):
//                            straight 1:1 map, unknown provinces fall back to
//                            their raw name as the "code" (never dropped).
//   aggregateChoroplethData — raw rows that may repeat a province and must be
//                            summed into one cell per code (perdidas,
//                            vigilancia): rows whose code can't be resolved
//                            are dropped, not fallen back.
//
// Pure — no DB, no React/next imports. See choropleth-data.test.ts.

import { PROVINCE_ISO_MAP } from "./govt-dashboards";

/**
 * {code, value, label} triple consumed by MapChoropleth's `data` prop
 * (components/charts/MapChoropleth.tsx `ChoroplethRegionDatum`). Declared
 * locally — structurally identical — so this lib module stays framework-free.
 */
export type ChoroplethCell = { code: string; value: number; label: string };

/**
 * Maps rows that already carry one entry per province straight to choropleth
 * cells — no aggregation. Province names absent from PROVINCE_ISO_MAP fall
 * back to the raw name as the code (matches the pre-extraction behavior at
 * both call sites: a row is never silently dropped here). The label is
 * always the raw province name.
 *
 * Shared by /gob/poblacion (`coverage.byProvince`, value = `ratePct`) and
 * /gob/censo (`provinceRows`, value = `count`).
 */
export function toChoroplethData<T extends { province: string }>(
  rows: T[],
  getValue: (row: T) => number,
): ChoroplethCell[] {
  return rows.map((r) => ({
    code: PROVINCE_ISO_MAP[r.province] ?? r.province,
    value: getValue(r),
    label: r.province,
  }));
}

/**
 * Aggregates rows into one cell per resolved code, summing `getValue` for
 * rows that share a code. Rows whose `keyOf` resolves to a falsy code
 * (no province, or a province absent from PROVINCE_ISO_MAP) are dropped —
 * unlike `toChoroplethData`, there is no raw-name fallback here.
 *
 * Shared by /gob/perdidas (`aggregateLostByProvince`: counts lost pets per
 * province, keyOf resolves the raw province name through PROVINCE_ISO_MAP)
 * and /gob/vigilancia (`provinceChoroplethData`: sums per-locality case
 * counts that already carry a resolved `code` up to province level).
 */
export function aggregateChoroplethData<T>(
  rows: T[],
  keyOf: (row: T) => string | null | undefined,
  getValue: (row: T) => number,
  labelFor: (value: number) => string,
): ChoroplethCell[] {
  const codeToValue = new Map<string, number>();
  for (const row of rows) {
    const code = keyOf(row);
    if (!code) continue;
    codeToValue.set(code, (codeToValue.get(code) ?? 0) + getValue(row));
  }
  return Array.from(codeToValue.entries()).map(([code, value]) => ({
    code,
    value,
    label: labelFor(value),
  }));
}
