// Panorama aggregate cube BUILDER (road-to-10 infra #1, migration 0139).
//
// ORCHESTRATOR AMENDMENT over docs/plans/2026-07-11-cube-design.md: the builder is
// a TypeScript worker that REUSES the existing choropleth loaders — NOT a plpgsql
// re-expression. It calls the SAME `loadChoroplethByLevel` invocations the live
// admin-national read uses (metric rollups → aggregateCellsToDepartment → k-anon →
// complementarySuppress → province sums incl. the no-locality residual) and writes
// the RESULT in ONE transaction. This makes SQL/TS drift structurally impossible:
// the cube stores exactly what the loader produced, so the reader replaying
// build-features over it is a set-equal (order-independent) FeatureCollection to a
// live read (parity is near-tautology). NOTE: the guarantee is SET equality — same
// features, envelope, and flags irrespective of row order — NOT literal byte order;
// do not build an order-sensitive consumer on top of it.
//
// PRIVACY: the loaders already null every sub-k count before returning (suppressed
// cells carry value = null). So a raw sub-k value NEVER enters this module's memory,
// let alone the store — there is no private build layer at all. The worst a mis-wired
// reader can emit is a NULL.
//
// UNSCOPED, GEOGRAPHICALLY-DECOMPOSED: the build runs the loaders as an ADMIN actor
// with NO drill (national). Because every rollup is COUNT(DISTINCT pets.id) and each
// pet has exactly one home (province, locality→department), a province total is the
// exact sum of its departments and the national suppression is the correct suppression
// for any COMPLETE geographic slice (admin national, or an admin province drill —
// complementarySuppress is province-grouped, so a province's group is identical whether
// computed nationally or scoped to it). Locality drills are NOT cube-served (see the
// reader) because a department cell here aggregates ALL localities in the department,
// not the single drilled locality.

import { type SQL, sql } from "drizzle-orm";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { analyticsDb, panoramaCube, panoramaCubeMeta, petEvents } from "@/db";
import * as schema from "@/db/schema";
import type { NewPanoramaCubeRow } from "@/db/schema";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import type {
  ChoroplethCell,
  ProvinceChoroplethCell,
} from "@/src/modules/panorama/application/build-features";
import {
  type ChoroplethMetric,
  loadChoroplethByLevel,
  noLocalityByProvince,
} from "@/src/modules/panorama/infrastructure/repository";

/** The 5 choropleth metrics the cube covers (v1). Mirrors the layer→metric map
 * in get-layer-features.ts (cobertura→rabies-coverage, etc.). */
export const CUBE_METRICS: readonly ChoroplethMetric[] = [
  "rabies-coverage",
  "sterilization-coverage",
  "microchip-penetration",
  "ppp-compliance",
  "mortality",
] as const;

/** The admin-national actor the build runs the loaders as: no jurisdictions, no
 * drill → petsScope resolves to null (national), the whole decomposed set. */
const ADMIN: DashboardActor = { role: "admin" };
const NO_JURISDICTIONS: DashboardJurisdiction[] = [];

/** Per-metric build outcome, for the report. */
export type CubeBuildMetricStat = {
  metric: ChoroplethMetric;
  departmentRows: number;
  provinceRows: number;
  suppressed: number;
};

export type CubeBuildResult = {
  status: "ok" | "error";
  rowCount: number;
  durationMs: number;
  watermark: Date | null;
  builtAt: Date;
  perMetric: CubeBuildMetricStat[];
  error?: string;
};

/** Serialize a number to the string form Drizzle expects for a `numeric` column.
 * null stays null (suppressed department values, absent centroids). */
function num(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** Map with bounded concurrency (the analytics pool is small; don't fan out 24
 * province reads at once). Preserves input order in the output. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Assemble the readable cube rows for one metric by REUSING the live loaders.
 *
 *  - PROVINCE grain: `loadChoroplethByLevel(metric, "province", admin, [])` — one
 *    ratePct/count cell per mappable province (≤24 rows, never truncated). Stored as
 *    unit_level='province', carrying that province's no-locality residual so the
 *    reader can reproduce noLocalityCount.
 *
 *  - DEPARTMENT grain: built PER PROVINCE — `loadChoroplethByLevel(metric,
 *    "locality", admin, [], province)` for each province with data. WHY per province,
 *    not one national call: the national locality rollup is CAPPED at PER_LAYER_CAP
 *    (2000) and the seed exceeds it, so a national build is TRUNCATED — slicing it per
 *    province would drop most localities. A province-scoped rollup is complete (well
 *    under the cap), so its department cells are correct AND set-equal (order-
 *    independent) to a live province drill (the reader calls the same loader). The
 *    national department view
 *    is therefore NOT cube-served (it is the truncated live view; see the reader).
 */
async function buildMetricRows(
  metric: ChoroplethMetric,
): Promise<{ rows: NewPanoramaCubeRow[]; stat: CubeBuildMetricStat }> {
  const [prov, residual] = await Promise.all([
    loadChoroplethByLevel(metric, "province", ADMIN, NO_JURISDICTIONS),
    noLocalityByProvince(metric, ADMIN, NO_JURISDICTIONS),
  ]);

  const residualByProvince = new Map<string, number>();
  for (const r of residual) residualByProvince.set(r.province, r.count);

  const provinceCells = prov.cells as ProvinceChoroplethCell[];
  const provinceNames = provinceCells.map((c) => c.label);

  // Department cells per province (complete, untruncated) — matches a live province
  // drill exactly (same loader call).
  const deptPerProvince = await mapLimit(provinceNames, 6, (p) =>
    loadChoroplethByLevel(metric, "locality", ADMIN, NO_JURISDICTIONS, p),
  );

  const rows: NewPanoramaCubeRow[] = [];

  // Department grain. `cell.key` (`${province}|${unitCode}`) is unique per unit →
  // the PK's unit_code. `cell.locality` is the display label (department/barrio name).
  let suppressed = 0;
  let departmentRows = 0;
  for (const dr of deptPerProvince) {
    for (const cell of dr.cells as ChoroplethCell[]) {
      departmentRows += 1;
      if (cell.suppressed) suppressed += 1;
      rows.push({
        metric,
        unitLevel: "department",
        province: cell.province,
        unitCode: cell.key,
        label: cell.locality,
        departmentCode: cell.departmentCode ?? null,
        departmentName: cell.departmentName ?? null,
        centroidLat: cell.centroidLat,
        centroidLng: cell.centroidLng,
        value: num(cell.value),
        den: null,
        noLocality: null,
        suppressed: cell.suppressed,
        // The reused loader merges primary + complementary into one partition and
        // nulls the raw count, so the two cannot be distinguished at store time. The
        // differencing-defense PROPERTY is enforced upstream (complementarySuppress)
        // and pinned by the sub-k invariant test; this flag stays false in v1.
        complementary: false,
      });
    }
  }

  // Province grain. unit_code = provinceCode (unique, non-null, from the loader);
  // province + label = the province display name. value = ratePct or count.
  for (const cell of provinceCells) {
    rows.push({
      metric,
      unitLevel: "province",
      province: cell.label,
      unitCode: cell.provinceCode,
      label: cell.label,
      departmentCode: null,
      departmentName: null,
      centroidLat: null,
      centroidLng: null,
      value: num(cell.value),
      den: null,
      noLocality: residualByProvince.get(cell.label) ?? 0,
      suppressed: false,
      complementary: false,
    });
  }

  return {
    rows,
    stat: { metric, departmentRows, provinceRows: provinceCells.length, suppressed },
  };
}

/** Chunked multi-row insert (bounds the bind-parameter count well under 65535). */
async function insertRows(
  tx: PostgresJsDatabase<typeof schema>,
  rows: NewPanoramaCubeRow[],
): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(panoramaCube).values(rows.slice(i, i + CHUNK));
  }
}

/**
 * Full-rebuild the cube. Reads (loaders) run OUTSIDE the write transaction on the
 * analytics pool; the write (DELETE + INSERT + meta) runs INSIDE one transaction on
 * a DEDICATED session-pooler client with a generous 120s statement_timeout (this is
 * a background build — NOT withDbBudget's 8s request budget). Postgres MVCC gives
 * every reader the ENTIRE old cube or the ENTIRE new one, never a half-swap.
 *
 * On any failure the write transaction rolls back (last-good cube untouched) and the
 * meta row is stamped status='error' in a separate statement — an honest, detectable
 * degradation the reader's staleness gate catches.
 */
export async function refreshCube(): Promise<CubeBuildResult> {
  const t0 = Date.now();
  const builtAt = new Date();

  // Build watermark: transaction time — "what the system knew when the cube was
  // built" (MAX(recorded_at)). A row inserted mid-build is attributed to the NEXT
  // refresh (watermark is a floor, not a fence) — acceptable at day granularity.
  const [wm] = await analyticsDb
    .select({ w: sql<string | null>`max(${petEvents.recordedAt})` })
    .from(petEvents);
  // Raw max() comes back as a string; normalize to Date for the meta column + report.
  const watermark = wm?.w ? new Date(wm.w) : null;

  // Reuse the live loaders for all 5 metrics (reads, no transaction). Sequential
  // per metric to bound concurrency on the small analytics pool (each metric's 3
  // queries still run in parallel inside buildMetricRows) — the build is off the
  // request path, so total wall-clock, not per-metric latency, is what matters.
  const built: { rows: NewPanoramaCubeRow[]; stat: CubeBuildMetricStat }[] = [];
  for (const m of CUBE_METRICS) {
    built.push(await buildMetricRows(m));
  }
  const allRows = built.flatMap((b) => b.rows);
  const perMetric = built.map((b) => b.stat);

  // Dedicated write client: session pooler (honors the GUC), generous timeout.
  const writeUrl = (process.env.ANALYTICS_DATABASE_URL ?? process.env.DATABASE_URL) as string;
  const writeClient = postgres(writeUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
    idle_timeout: 5,
    max_lifetime: 300,
    connection: {
      // 120s — a background build, not a request. Session mode honors this GUC.
      options: "-c statement_timeout=120000 -c idle_in_transaction_session_timeout=120000",
      // Distinct name exempts the build from the stuck-backend reaper
      // (migration 0136 targets application_name='Supavisor' only). The write
      // txn is seconds-long anyway; this is belt-and-braces.
      application_name: "cube-builder",
    },
    onnotice: () => {},
  });
  const writeDb = drizzle(writeClient, { schema });

  try {
    await writeDb.transaction(async (tx) => {
      // Atomic full swap: clear then repopulate inside one transaction.
      await tx.delete(panoramaCube);
      await insertRows(tx, allRows);
      const durationMs = Date.now() - t0;
      await tx
        .update(panoramaCubeMeta)
        .set({
          builtAt,
          watermark,
          status: "ok",
          rowCount: allRows.length,
          durationMs,
        })
        .where(sql`${panoramaCubeMeta.id} = 1` as SQL);
    });

    return {
      status: "ok",
      rowCount: allRows.length,
      durationMs: Date.now() - t0,
      watermark,
      builtAt,
      perMetric,
    };
  } catch (err) {
    // Failed transaction rolled back → last-good cube intact. Record the failure so
    // the reader's staleness gate falls back to live (status != 'ok').
    const message = err instanceof Error ? err.message : String(err);
    try {
      await writeDb
        .update(panoramaCubeMeta)
        .set({ status: "error" })
        .where(sql`${panoramaCubeMeta.id} = 1` as SQL);
    } catch {
      // best-effort; the build already failed.
    }
    return {
      status: "error",
      rowCount: 0,
      durationMs: Date.now() - t0,
      watermark,
      builtAt,
      perMetric,
      error: message,
    };
  } finally {
    await writeClient.end({ timeout: 5 });
  }
}
