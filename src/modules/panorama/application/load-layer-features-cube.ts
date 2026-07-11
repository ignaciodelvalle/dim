// Cube-backed layer reader (road-to-10 infra #1, migration 0139) — behind CUBE_READS.
//
// Serves the 5 CHOROPLETH layers for ADMIN actors (national + a whole-province drill)
// from the precomputed panorama_cube, producing the SAME LayerFeaturesResult envelope
// the live path returns — by reconstructing the loaders' cell shapes and reusing the
// EXACT `buildChoroplethFeatures` / `buildProvinceChoroplethFeatures` transforms. So a
// cube-served response is a set-equal (order-independent) FeatureCollection to the live
// one — same features, envelope, and flags regardless of row order, NOT literal byte
// order (pinned by the parity test's order-independent normalization).
//
// The cube COMPOSES IN FRONT of the live Data Cache: an eligible request reads the
// cube; everything else keeps the current cached-live path untouched. Flag default OFF
// (CUBE_READS unset/≠'1' → this returns null → caller falls back to live).
//
// ELIGIBILITY (all must hold, else null → live):
//   - CUBE_READS === '1'.
//   - layer ∈ {cobertura, esterilizacion, microchip, ppp, mortalidad}.
//   - actor is ADMIN.
//   - NOT a locality drill (adminLocality unset). A locality drill counts ONE
//     locality, but a cube department cell aggregates ALL localities in the
//     department — filtering can't recover the single-locality count, so locality
//     drills stay live. (This narrows the design's Decision 4, which listed locality
//     drills as eligible; verified against the fold — they are not.)
//   - NOT the national DEPARTMENT (locality-axis) view: the national locality rollup
//     is capped at PER_LAYER_CAP (2000) and the seed exceeds it, so the live national
//     department view is TRUNCATED (and non-deterministic). The cube is built per
//     province (complete), so it CANNOT reproduce that truncated view byte-for-byte —
//     national+department stays live. The cube serves national+PROVINCE (the national
//     default grain) and BOTH grains for a whole-province drill (complete, untruncated).
//   - verifiedOnly === false (the cube stores the default numerator; the "solo
//     firmado" narrowing is not precomputed).
//   - cube fresh: status === 'ok' AND now − built_at ≤ STALE_MAX.
//
// WHY admin-only + complete slices: the cube is stored UNSCOPED and decomposed to
// department with suppression baked over the NATIONAL set. That is exactly correct for
// any reader who sees a COMPLETE geographic slice (national; or a whole province, since
// complementarySuppress is province-grouped). A partial slice (a govt scoped to a
// subset of a province's departments) could differ, so govt stays live in v1.

import type { PanoramaCubeRow } from "@/db/schema";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import { readCubeMeta, readCubeRows } from "@/src/modules/panorama/infrastructure/repository";
import type { ChoroplethMetric } from "@/src/modules/panorama/infrastructure/repository";

import type { LayerId } from "@/src/modules/panorama/domain/types";
import type { AggregationLevel } from "@/src/modules/panorama/domain/types";
import {
  type ChoroplethCell,
  type ProvinceChoroplethCell,
  buildChoroplethFeatures,
  buildProvinceChoroplethFeatures,
} from "./build-features";
import type { LayerFeaturesResult, LayerPeriod } from "./get-layer-features";
import {
  type LayerCacheStatus,
  loadLayerFeaturesCached,
  loadLayerFeaturesCachedWithMeta,
} from "./load-layer-features-cached";

/** The choropleth layers the cube covers, mapped to their metric (mirrors the
 * layer→metric switch in get-layer-features.ts). A layer absent here is not cubeable. */
const CUBE_LAYER_METRIC: Partial<Record<LayerId, ChoroplethMetric>> = {
  cobertura: "rabies-coverage",
  esterilizacion: "sterilization-coverage",
  microchip: "microchip-penetration",
  ppp: "ppp-compliance",
  mortalidad: "mortality",
};

/** Max age of the cube before a read falls back to live. Current-state choropleth
 * tolerates staleness well (day-granularity data); 6h per the locked answer. */
export const CUBE_STALE_MAX_MS = 6 * 60 * 60 * 1000;

/** Whether cube reads are enabled (flag default OFF; absent = OFF). */
export function cubeReadsEnabled(): boolean {
  return process.env.CUBE_READS === "1";
}

/** A cube-served layer result plus the cube's build timestamp (surfaced as the
 * data-freshness "Datos al" for cube-served layers — the cube's age is declared). */
export type CubeLayerResult = {
  result: LayerFeaturesResult;
  builtAt: Date;
};

/**
 * Try to serve a choropleth layer from the cube. Returns null when the request is
 * not cube-eligible OR the cube is stale/absent — the caller then uses the live path
 * (identical outcome to CUBE_READS off, per request).
 */
export async function loadLayerFeaturesFromCube(
  layer: LayerId,
  actor: DashboardActor,
  level: AggregationLevel,
  adminProvince?: string,
  adminLocality?: string,
  verifiedOnly = false,
): Promise<CubeLayerResult | null> {
  // --- eligibility (cheap checks first, no DB) ---
  if (!cubeReadsEnabled()) return null;
  if (actor.role !== "admin") return null;
  if (adminLocality) return null; // locality drill → live (see header)
  if (verifiedOnly) return null;
  // National DEPARTMENT view is the truncated live view — not cube-serviceable
  // (see header). Only national+province and a whole-province drill are eligible.
  if (level === "locality" && !adminProvince) return null;
  const metric = CUBE_LAYER_METRIC[layer];
  if (!metric) return null;

  // --- staleness gate ---
  const meta = await readCubeMeta();
  if (!meta || meta.status !== "ok" || !meta.builtAt) return null;
  const builtAt = meta.builtAt;
  if (Date.now() - builtAt.getTime() > CUBE_STALE_MAX_MS) return null;

  // --- read + rebuild the envelope ---
  const rows = await readCubeRows(metric, adminProvince);
  return { builtAt, result: assembleCubeLayerResult(rows, level) };
}

/**
 * Rebuild the loader's LayerFeaturesResult envelope from stored cube rows. Pure
 * (no DB) — exported so the truncation threading is testable without a build.
 *
 * TRUNCATION (CB1): the builder captures each province's department-grain
 * `truncated` flag (its LOCALITY rollup hitting PER_LAYER_CAP — reachable at
 * Buenos Aires scale, ~2000 INDEC localities) in the province row's `den` column
 * (0/1 — reserved-column reuse, see buildProvinceCubeRows). The department grain
 * threads it through here so a cube-served drill can never claim false
 * completeness (live parity: the live loader would say truncated too). The
 * province grain is structurally never truncated (≤24 rows from the loader).
 */
export function assembleCubeLayerResult(
  rows: PanoramaCubeRow[],
  level: AggregationLevel,
): LayerFeaturesResult {
  if (level === "province") {
    const cells: ProvinceChoroplethCell[] = rows
      .filter((r) => r.unitLevel === "province")
      .map((r) => ({
        provinceCode: r.unitCode,
        label: r.label ?? r.province,
        value: Number(r.value ?? 0),
      }));
    return {
      features: buildProvinceChoroplethFeatures(cells),
      truncated: false,
      suppressedCount: 0,
      noLocalityCount: 0,
      level: "province",
    };
  }

  // Department (locality-axis) grain.
  const deptRows = rows.filter((r) => r.unitLevel === "department");
  const cells: ChoroplethCell[] = deptRows.map((r) => cellFromRow(r));
  const suppressedCount = deptRows.reduce((n, r) => n + (r.suppressed ? 1 : 0), 0);
  const provinceRows = rows.filter((r) => r.unitLevel === "province");
  // noLocalityCount: sum the province-grain residual over the in-scope provinces
  // (national = all rows; a province drill already filtered to that province).
  const noLocalityCount = provinceRows.reduce((n, r) => n + (r.noLocality ?? 0), 0);
  // Truncated iff ANY in-scope province's department rollup hit the cap at build
  // (den = 1 on its province row; eligibility means "any" is a single province).
  const truncated = provinceRows.some((r) => (r.den ?? 0) !== 0);

  return {
    features: buildChoroplethFeatures(cells),
    truncated,
    suppressedCount,
    noLocalityCount,
    level: "locality",
  };
}

/** Which path served a layer request: the cube, or the live (cached) path. */
export type LayerSource = "cube" | "live";

/** A layer result plus which path served it (for the `x-layer-source` header) and,
 * for a cube hit, the cube's build timestamp; for a live hit, the Data Cache status. */
export type LayerFeaturesSourced = {
  result: LayerFeaturesResult;
  source: LayerSource;
  /** Present when source === 'cube' — the cube's freshness timestamp. */
  builtAt?: Date;
  /** Present when source === 'live' — the Data Cache hit/miss/bypass status. */
  cacheStatus?: LayerCacheStatus;
};

/**
 * Pick cube-vs-live per request, reporting which path served (the API route echoes
 * it as `x-layer-source`). Eligible + fresh → cube; otherwise the existing cached-live
 * path, UNTOUCHED. A cube read error degrades to live (never throws out the door).
 */
export async function loadLayerFeaturesCubeOrCachedWithMeta(
  layer: LayerId,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: LayerPeriod,
  level: AggregationLevel = "locality",
  adminProvince?: string,
  adminLocality?: string,
  pointsMode = false,
  verifiedOnly = false,
): Promise<LayerFeaturesSourced> {
  if (!pointsMode) {
    try {
      const cube = await loadLayerFeaturesFromCube(
        layer,
        actor,
        level,
        adminProvince,
        adminLocality,
        verifiedOnly,
      );
      if (cube) return { result: cube.result, source: "cube", builtAt: cube.builtAt };
    } catch {
      // Cube read failed → fall through to live (identical to CUBE_READS off).
    }
  }
  const live = await loadLayerFeaturesCachedWithMeta(
    layer,
    actor,
    jurisdictions,
    period,
    level,
    adminProvince,
    adminLocality,
    pointsMode,
    verifiedOnly,
  );
  return { result: live.result, source: "live", cacheStatus: live.status };
}

/**
 * Thin cube-or-live variant for callers that don't need the source meta (the SSR
 * pages). Same eligibility; a cube read error degrades to the live cached path.
 */
export async function loadLayerFeaturesCubeOrCached(
  layer: LayerId,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: LayerPeriod,
  level: AggregationLevel = "locality",
  adminProvince?: string,
  adminLocality?: string,
  pointsMode = false,
  verifiedOnly = false,
): Promise<LayerFeaturesResult> {
  if (!pointsMode) {
    try {
      const cube = await loadLayerFeaturesFromCube(
        layer,
        actor,
        level,
        adminProvince,
        adminLocality,
        verifiedOnly,
      );
      if (cube) return cube.result;
    } catch {
      // fall through to live
    }
  }
  return loadLayerFeaturesCached(
    layer,
    actor,
    jurisdictions,
    period,
    level,
    adminProvince,
    adminLocality,
    pointsMode,
    verifiedOnly,
  );
}

/** Reconstruct the loader's ChoroplethCell from a stored department row. Mirrors
 * `toChoroplethCells` output exactly so build-features emits identical features. */
function cellFromRow(r: PanoramaCubeRow): ChoroplethCell {
  return {
    key: r.unitCode,
    province: r.province,
    locality: r.label ?? "",
    centroidLat: r.centroidLat,
    centroidLng: r.centroidLng,
    departmentCode: r.departmentCode,
    departmentName: r.departmentName,
    value: r.suppressed ? null : r.value == null ? null : Number(r.value),
    suppressed: r.suppressed,
  };
}
