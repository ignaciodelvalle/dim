// Pure helpers for the locality-choropleth DIVISION FILL render mode.
//
// A single-province scope now renders real administrative divisions:
//   - CABA (AR-C)  → the 48 barrios      (public/geo/caba-barrios.geojson)
//   - any other    → that province's departamentos (public/geo/ar-departments.geojson)
//
// These outlines are ALWAYS drawn for a scoped province (even with no data — the
// PO directive "siempre mostrar la división al menos"). Where the active locality
// choropleth base layer has data, its cells are joined to the division polygons
// and rendered as a POLYGON FILL, replacing the old graduated centroid-circle
// hack. Cells with NO polygon match fall back to the centroid circle (no data
// loss). Suppressed cells that DO match a division render outline-only (no fill).
//
// Extracted from SituationalMap so the join + color expression are unit-testable
// WITHOUT importing maplibre-gl (only its expression TYPE is imported). The map
// consumes `joinCellsToDivisions` (which FeatureCollection to feed the circle
// source) and `divisionFillColorExpr` (the data-driven polygon fill).

import type { ExpressionSpecification } from "maplibre-gl";

import { RAMP_BLUE } from "@/lib/analytics/viz-scales";
import { normalizeBarioCode, normalizeDepartmentCode } from "@/lib/infra/geo-join";
import type { FeatureCollection, PanoramaFeature } from "@/src/modules/panorama/domain/types";

/** Which administrative division a scoped province drills to. */
export type DivisionLevel = "barrio" | "department";

/** The subset of a locality choropleth cell's properties the join reads. */
export type ChoroplethCellProps = {
  province?: string;
  locality?: string;
  departmentCode?: string | null;
  departmentName?: string | null;
  value?: number | null;
  suppressed?: boolean;
};

/**
 * The division join code for one locality choropleth cell.
 *  - `barrio` (CABA): the normalized barrio slug derived from the locality name,
 *    using the SHARED canonical normalizer (lib/infra/geo-join → same slug the
 *    govt dashboards + MapChoropleth compute, so codes never drift).
 *  - `department`: the INDEC 5-digit code the repository carried on the cell
 *    (from ar_localities), zero-padded for safety.
 * Returns null when the cell cannot be mapped to a division (no locality name /
 * no department code) — such a cell falls back to its centroid circle.
 */
export function divisionCodeForCell(
  props: ChoroplethCellProps,
  level: DivisionLevel,
): string | null {
  if (level === "barrio") {
    const raw = props.locality;
    if (!raw) return null;
    const code = normalizeBarioCode(raw);
    return code.length > 0 ? code : null;
  }
  const raw = props.departmentCode;
  if (!raw) return null;
  return normalizeDepartmentCode(raw);
}

/** Result of joining a locality choropleth layer to its division polygons. */
export type DivisionJoin = {
  /**
   * Fill value per division code — the SUM of the non-suppressed cells that map
   * to that division. A department can aggregate several localities; CABA is
   * effectively 1:1. Divisions with no visible cell are absent (→ outline only).
   */
  values: Map<string, number>;
  /**
   * The cells that did NOT match a loaded division polygon (unknown code, or a
   * code not present in this province's division set). These keep their centroid
   * circle so no data is lost. Matched cells — including suppressed ones — are
   * excluded here: a matched suppressed cell renders as an OUTLINE-only division,
   * never also a muted circle (no double-encoding).
   */
  unmatched: FeatureCollection;
};

/**
 * Join a locality choropleth layer's cells to the active province's division
 * polygons. `divisionCodes` is the set of `code` properties present in the loaded
 * division GeoJSON (barrios or the filtered departamentos).
 *
 * K-anon (k=5) is preserved: a suppressed cell (value=null) never contributes to
 * `values`, so a division whose only cells are suppressed stays fill-less
 * (outline only) — the conservative policy the task mandates. A department whose
 * visible localities cross k while some constituents were suppressed shows the
 * sum of the VISIBLE localities only; the suppressed ones are simply omitted,
 * inventing no new disclosure semantics.
 */
export function joinCellsToDivisions(
  features: FeatureCollection,
  level: DivisionLevel,
  divisionCodes: ReadonlySet<string>,
): DivisionJoin {
  return joinCellsToDivisionsMulti(features, [{ level, codes: divisionCodes }]);
}

/**
 * Generalization of {@link joinCellsToDivisions} to SEVERAL division levels at
 * once — the zoom-driven multi-province case. When the camera zooms past the
 * division threshold with multiple provinces in view, the loaded division source
 * is the UNION of their polygons: departamentos (for every non-CABA province) AND
 * CABA barrios, two different code spaces coexisting in one source.
 *
 * Each cell is tried against the levels in order; the first level whose code set
 * contains the cell's code claims it. The two spaces are disjoint in practice (a
 * departamento cell carries a numeric INDEC code; a CABA barrio cell carries a
 * locality slug), so order is not load-bearing. A cell matched by NO level falls
 * back to its centroid circle (unmatched); k-anon is preserved exactly as in the
 * single-level path — a matched-but-suppressed cell adds no fill (outline only).
 */
export function joinCellsToDivisionsMulti(
  features: FeatureCollection,
  levels: ReadonlyArray<{ level: DivisionLevel; codes: ReadonlySet<string> }>,
): DivisionJoin {
  const values = new Map<string, number>();
  const unmatched: PanoramaFeature[] = [];

  for (const f of features.features) {
    const props = (f.properties ?? {}) as ChoroplethCellProps;
    let matched = false;
    for (const { level, codes } of levels) {
      const code = divisionCodeForCell(props, level);
      if (code === null || !codes.has(code)) continue;
      matched = true;
      // Matched: contributes to the fill only when visible (k-anon). A matched
      // but suppressed cell is intentionally dropped → outline only.
      if (props.suppressed !== true && typeof props.value === "number") {
        values.set(code, (values.get(code) ?? 0) + props.value);
      }
      break;
    }
    if (!matched) unmatched.push(f);
  }

  return { values, unmatched: { type: "FeatureCollection", features: unmatched } };
}

/** A fully-transparent fill — a division with no (visible) data shows outline only. */
const TRANSPARENT = "rgba(0,0,0,0)";

/**
 * Build the data-driven `fill-color` for the division choropleth. Mirrors the
 * province choropleth's structure (a `match` on the polygon `code` → value, then
 * a linear interpolation across RAMP_BLUE) but paints divisions WITHOUT a value
 * transparent instead of the no-data grey — the always-visible outline is the
 * "no data" signal, so an unfilled division must let it show through.
 *
 * Returns a flat transparent expression when there are no values (nothing to
 * fill — only outlines), and widens a degenerate single-value range so
 * `interpolate` always has distinct stops.
 */
export function divisionFillColorExpr(
  values: ReadonlyMap<string, number>,
): ExpressionSpecification {
  if (values.size === 0) return TRANSPARENT as unknown as ExpressionSpecification;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const pairs: Array<[string, number]> = [];
  for (const [code, value] of values) {
    pairs.push([code, value]);
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1;

  const valueMatch = [
    "match",
    ["get", "code"],
    ...pairs.flatMap(([code, value]) => [code, value] as [string, number]),
    -1,
  ] as unknown as ExpressionSpecification;

  return [
    "case",
    ["==", valueMatch, -1],
    TRANSPARENT,
    ["interpolate", ["linear"], valueMatch, lo, RAMP_BLUE[0], hi, RAMP_BLUE[1]],
  ] as unknown as ExpressionSpecification;
}

/** value min/max over a division values map (for the fill legend). null when empty. */
export function divisionValueBounds(
  values: ReadonlyMap<string, number>,
): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values.values()) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/**
 * Filter a raw ar-departments FeatureCollection to the departamentos of one
 * province, by INDEC prefix (first 2 digits of the 5-digit code). Keeps the perf
 * budget: the 693 KB national file is fetched once but only the active province's
 * polygons are handed to MapLibre as a source.
 */
export function filterDepartmentsByPrefix(
  fc: { features: Array<{ properties?: { code?: string } | null }> },
  prefix: string,
): Array<{ properties?: { code?: string } | null }> {
  return fc.features.filter((f) => {
    const code = f.properties?.code;
    return typeof code === "string" && normalizeDepartmentCode(code).startsWith(prefix);
  });
}
