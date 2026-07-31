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

import { type GeoLevel, isCABA } from "@/lib/infra/geo-join";
import { PROVINCE_ISO_MAP } from "./govt-dashboards";
import type { SubregionCaseCount } from "./subregion-redaction";

/**
 * {code, value, label} triple consumed by MapChoropleth's `data` prop
 * (components/charts/MapChoropleth.tsx `ChoroplethRegionDatum`). Declared
 * locally — structurally identical — so this lib module stays framework-free.
 */
export type ChoroplethCell = {
  code: string;
  value: number;
  label: string;
  /** True when the cell's value was WITHHELD by k-anon. MapChoropleth reads this
   *  flag before any code path that could paint a number, so `value` is inert. */
  suppressed?: boolean;
};

/** A ChoroplethCell that may carry the k-anon suppressed flag (department/barrio drill). */
export type ScopedChoroplethCell = Pick<ChoroplethCell, "code" | "value"> & {
  label?: string;
  suppressed?: boolean;
};

/**
 * Maps rows that already carry one entry per province straight to choropleth
 * cells — no aggregation. Province names absent from PROVINCE_ISO_MAP fall
 * back to the raw name as the code (matches the pre-extraction behavior at
 * both call sites: a row is never silently dropped here). The label is
 * always the raw province name.
 *
 * Shared by /gob/poblacion (`coverage.byProvince`, value = `ratePct`) and
 * /gob/censo (`provinceRows`, value = `count`).
 *
 * NULL IS THE WITHHELD SIGNAL. `getValue` returning null means the row's value
 * was suppressed upstream (k-anon — the fetchers now hand back `number | null`
 * exactly so the absence survives the mapping). Such a cell is still EMITTED,
 * carrying `suppressed: true`, because a cell that DISAPPEARS at k makes absence
 * the disclosure channel and the map would stipple it "sin datos" — false, and a
 * tell that this province is different. Its `value: 0` is a placeholder the
 * renderer never reaches: MapChoropleth branches on the flag first.
 */
export function toChoroplethData<T extends { province: string }>(
  rows: T[],
  getValue: (row: T) => number | null,
): ChoroplethCell[] {
  return rows.map((r) => {
    const code = PROVINCE_ISO_MAP[r.province] ?? r.province;
    const value = getValue(r);
    return value === null
      ? { code, value: 0, suppressed: true, label: r.province }
      : { code, value, label: r.province };
  });
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

/** GeoJSON URL per drill-down level — mirrors MapChoropleth's own GEOJSON_BY_LEVEL. */
const SUBREGION_GEOJSON_URL: Record<"department" | "barrio", string> = {
  department: "/geo/ar-departments.geojson",
  barrio: "/geo/caba-barrios.geojson",
};

export type ScopedChoroplethProps = {
  level: GeoLevel;
  geojsonUrl?: string;
  visibleCodes?: string[];
  data: ScopedChoroplethCell[];
};

/**
 * Reusable scope-aware choropleth drill (design/scoped-choropleth-drill,
 * engram #1481): builds the `{level, geojsonUrl, visibleCodes, data}` bundle
 * to spread straight into `<MapChoroplethDynamic {...props} />`, auto-drilling
 * from province to department (or barrio, for CABA) grain the moment the
 * screen's jurisdiction filter selects a province.
 *
 * - No province selected, or `subregionCells` not available yet (null) →
 *   national view unchanged: `level: "province"`, the screen's own
 *   `provinceCells` (from `toChoroplethData`/`aggregateChoroplethData`), no
 *   geojsonUrl/visibleCodes override (MapChoropleth's province-level defaults
 *   already apply).
 * - Province selected → `level: "department"` (`"barrio"` for CABA, AR-C),
 *   the matching GeoJSON, `visibleCodes` = every sub-region of that province
 *   (zooms the map + filters the GeoJSON to just that province — see
 *   MapChoropleth's `visibleCodes` contract), and `data` built from
 *   `subregionCells`: k-anon-suppressed cells pass through with `value: 0,
 *   suppressed: true` (MapChoropleth already renders the hatch + tooltip +
 *   empty-state copy generically off that flag — no count is ever exposed
 *   here); zero-count non-suppressed cells are dropped so they render as
 *   "sin datos" (grey) instead of the lightest data color.
 *
 * Reusable by ANY /gob screen with a jurisdiction filter: pass the screen's
 * own province-level cells and its own `subregionCells` (built via
 * `aggregateRowsByDepartment`, lib/analytics/subregion-aggregate.ts) — this
 * function does no fetching and no aggregation, only prop-shaping, so it is
 * pure and framework-free like the rest of this module.
 */
export function scopedChoroplethProps(
  provinceCells: ChoroplethCell[],
  selectedProvinceIso: string | null | undefined,
  subregionCells: SubregionCaseCount[] | null | undefined,
): ScopedChoroplethProps {
  if (!selectedProvinceIso || !subregionCells) {
    return { level: "province", data: provinceCells };
  }

  const level: "department" | "barrio" = isCABA(selectedProvinceIso) ? "barrio" : "department";
  const data: ScopedChoroplethCell[] = subregionCells
    .filter((c) => c.count > 0 || c.suppressed)
    .map((c) =>
      c.suppressed
        ? { code: c.code, value: 0, suppressed: true, label: c.name }
        : { code: c.code, value: c.count, label: c.name },
    );

  return {
    level,
    geojsonUrl: SUBREGION_GEOJSON_URL[level],
    visibleCodes: subregionCells.map((c) => c.code),
    data,
  };
}
