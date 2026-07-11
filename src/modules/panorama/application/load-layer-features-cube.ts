// Cube-backed layer reader (road-to-10 infra #1, migration 0139) — behind CUBE_READS.
//
// Serves the 5 CHOROPLETH layers for ADMIN actors (national + a whole-province drill)
// from the precomputed panorama_cube, producing the SAME LayerFeaturesResult envelope
// the live path returns — by reconstructing the loaders' cell shapes and reusing the
// EXACT `buildChoroplethFeatures` / `buildProvinceChoroplethFeatures` transforms. So a
// cube-served response is byte-identical to the live one (pinned by the parity test).
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
//     department nationally — filtering can't recover the single-locality count, so
//     locality drills stay live. (This narrows the design's Decision 4, which listed
//     locality drills as eligible; verified against the fold — they are not.)
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
import type { DashboardActor } from "@/lib/metrics";

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
import type { LayerFeaturesResult } from "./get-layer-features";

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
  const metric = CUBE_LAYER_METRIC[layer];
  if (!metric) return null;

  // --- staleness gate ---
  const meta = await readCubeMeta();
  if (!meta || meta.status !== "ok" || !meta.builtAt) return null;
  const builtAt = meta.builtAt;
  if (Date.now() - builtAt.getTime() > CUBE_STALE_MAX_MS) return null;

  // --- read + rebuild the envelope ---
  const rows = await readCubeRows(metric, adminProvince);

  if (level === "province") {
    const cells: ProvinceChoroplethCell[] = rows
      .filter((r) => r.unitLevel === "province")
      .map((r) => ({
        provinceCode: r.unitCode,
        label: r.label ?? r.province,
        value: Number(r.value ?? 0),
      }));
    return {
      builtAt,
      result: {
        features: buildProvinceChoroplethFeatures(cells),
        truncated: false,
        suppressedCount: 0,
        noLocalityCount: 0,
        level: "province",
      },
    };
  }

  // Department (locality-axis) grain.
  const deptRows = rows.filter((r) => r.unitLevel === "department");
  const cells: ChoroplethCell[] = deptRows.map((r) => cellFromRow(r));
  const suppressedCount = deptRows.reduce((n, r) => n + (r.suppressed ? 1 : 0), 0);
  // noLocalityCount: sum the province-grain residual over the in-scope provinces
  // (national = all rows; a province drill already filtered to that province).
  const noLocalityCount = rows
    .filter((r) => r.unitLevel === "province")
    .reduce((n, r) => n + (r.noLocality ?? 0), 0);

  return {
    builtAt,
    result: {
      features: buildChoroplethFeatures(cells),
      truncated: false,
      suppressedCount,
      noLocalityCount,
      level: "locality",
    },
  };
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
