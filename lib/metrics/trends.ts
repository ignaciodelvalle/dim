// Bucketed time-series (trend) projections for the gob dashboards (D1).
//
// WHY THIS EXISTS
// ---------------
// Every gob surface was a snapshot (KPIs + flat tables/bars). The event log is
// inherently temporal, yet nothing showed direction over time. These fetchers
// add per-period buckets the existing chart primitives can render:
//
//   - fetchDeathCausesTrend     → stacked (cause × bucket) for /gob/mortalidad
//   - fetchBitesTrend           → single-series bites/bucket
//   - fetchOutbreakSignalsTrend → single-series outbreak signals/bucket
//   - fetchRabiesCoverageTrend  → single-series % dogs vaccinated/bucket
//
// CONTRACT (all fetchers)
//   - Scope-aware via ProjectionContext: admin universal; govt intersects its
//     jurisdiction pairs (petsScopeClause / petEventsScopeClause).
//   - Bucket granularity is the period's natural unit (week ≤120d, else month),
//     chosen by bucketGranularityFor and pushed to SQL date_trunc().
//   - k-anonymity (k=5) on small per-bucket cells via the pure suppress* helpers
//     in lib/metrics/timeseries.ts. 0-counts are never masked (a true zero is a
//     non-identifying signal the operator needs).
//   - es-AR labels only — raw enums are mapped at the surface (deathCauseLabel).
//
// The SQL grouping lives here; the branching transforms (granularity, pivot,
// suppression) live in the pure, DB-free timeseries.ts module so they are
// unit-tested without a live Postgres.

import { and, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";

import type { ProjectionContext } from "./context";
import { petEventsScopeClause, petsScopeClause } from "./scope";
import {
  type BucketGranularity,
  type SeriesBucketRow,
  type StackedSeries,
  bucketGranularityFor,
  dateTruncUnit,
  formatBucketLabel,
  pivotStackedSeries,
  suppressSmallBuckets,
  suppressSmallStackedCells,
} from "./timeseries";

/** True when a govt actor has no jurisdictions — every projection is empty. */
function isEmptyScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

/** Shared single-series trend return shape. */
export type SingleSeriesTrend = {
  granularity: BucketGranularity;
  points: Array<{ x: string; y: number }>;
  /** Number of per-bucket cells masked by k-anonymity. */
  suppressedCount: number;
};

/** Stacked (multi-series) trend return shape. */
export type StackedTrend = {
  granularity: BucketGranularity;
  series: StackedSeries;
  suppressedCount: number;
};

const EMPTY_SINGLE = (granularity: BucketGranularity): SingleSeriesTrend => ({
  granularity,
  points: [],
  suppressedCount: 0,
});

const EMPTY_STACKED = (granularity: BucketGranularity): StackedTrend => ({
  granularity,
  series: { seriesKeys: [], points: [] },
  suppressedCount: 0,
});

// Postgres date_trunc requires its field arg as a string LITERAL — passing the
// unit as a bind param (date_trunc($1, ts)) fails to plan and 500s the query.
// `unit` is a fixed 'week'|'month' enum (dateTruncUnit), re-whitelisted here,
// so inlining it via sql.raw is injection-safe (no user input reaches it).
function truncBucket(unit: "week" | "month") {
  const u = unit === "week" ? "week" : "month";
  return sql<string>`date_trunc(${sql.raw(`'${u}'`)}, ${petEvents.occurredAt})`;
}

// ---------------------------------------------------------------------------
// D1.1 — Death causes per bucket (STACKED) — backs /gob/mortalidad
// ---------------------------------------------------------------------------

/**
 * Deaths grouped by (period bucket, cause) over death_recorded events.
 *
 * Replaces the flat ISO-week×cause table on /gob/mortalidad with a stacked
 * time-series. Scope is anchored to the pet row via INNER JOIN pets and
 * restricted by petsScopeClause(ctx) (the death payload carries no jurisdiction
 * fields — same pattern as fetchMortalityDisposition). Per (bucket, cause) cells
 * below k=5 are masked.
 */
export async function fetchDeathCausesTrend(ctx: ProjectionContext): Promise<StackedTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return EMPTY_STACKED(granularity);

  const unit = dateTruncUnit(granularity);
  const bucket = truncBucket(unit);
  const scope = petsScopeClause(ctx);
  const conditions = [
    eq(petEvents.eventType, "death_recorded"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      bucket,
      cause: sql<string>`COALESCE(${petEvents.payload}->>'cause', 'unknown')`,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .groupBy(bucket, sql`COALESCE(${petEvents.payload}->>'cause', 'unknown')`)
    .orderBy(bucket);

  const seriesRows: SeriesBucketRow[] = rows.map((r) => {
    const start = new Date(r.bucket);
    return {
      bucketStart: start.toISOString(),
      bucketLabel: formatBucketLabel(start, granularity),
      seriesKey: r.cause,
      count: r.n,
    };
  });

  const pivoted = pivotStackedSeries(seriesRows);
  const { series, suppressedCount } = suppressSmallStackedCells(pivoted, 5);
  return { granularity, series, suppressedCount };
}

// ---------------------------------------------------------------------------
// D1.2 — Bites per bucket (single series) — backs /gob home
// ---------------------------------------------------------------------------

/**
 * Bite incidents (incident_reported, incident_type='bite_inflicted') grouped by
 * period bucket. Scope via petEventsScopeClause (payload jurisdiction fields).
 */
export async function fetchBitesTrend(ctx: ProjectionContext): Promise<SingleSeriesTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return EMPTY_SINGLE(granularity);

  const unit = dateTruncUnit(granularity);
  const bucket = truncBucket(unit);
  const scope = petEventsScopeClause(ctx);
  const conditions = [
    eq(petEvents.eventType, "incident_reported"),
    sql`(${petEvents.payload}->>'incident_type') = ${"bite_inflicted"}`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      bucket,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);

  return finalizeSingleSeries(rows, granularity);
}

// ---------------------------------------------------------------------------
// D1.3 — Outbreak signals per bucket (single series) — backs /gob/analytics
// ---------------------------------------------------------------------------

/**
 * Outbreak signals (eventType LIKE 'outbreak_%') grouped by period bucket.
 * Scope via petEventsScopeClause (payload jurisdiction fields), matching the
 * existing fetchZoonosisTrend scope semantics.
 */
export async function fetchOutbreakSignalsTrend(
  ctx: ProjectionContext,
): Promise<SingleSeriesTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return EMPTY_SINGLE(granularity);

  const unit = dateTruncUnit(granularity);
  const bucket = truncBucket(unit);
  const scope = petEventsScopeClause(ctx);
  const conditions = [
    sql`${petEvents.eventType} LIKE ${"outbreak_%"}`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      bucket,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);

  return finalizeSingleSeries(rows, granularity);
}

// ---------------------------------------------------------------------------
// D1.4 — Rabies coverage over time (single series, %) — optional surface
// ---------------------------------------------------------------------------

/**
 * Per-bucket count of DISTINCT dogs receiving a rabies vaccination. This is a
 * "vaccinations applied per period" trend (a flow), NOT a recomputed stock
 * coverage ratio per bucket — the active-dog denominator is a "now" snapshot
 * and cannot be meaningfully back-dated per historical bucket without a
 * point-in-time population, which the event log does not carry.
 *
 * Rabies-vaccine match uses the SAME accent-aware regex as fetchRabiesCoverage
 * (~* '(antirr[áa]bica|rabies)') so "is a rabies vaccine" stays consistent.
 * Scope to dogs via INNER JOIN pets + species filter.
 */
export async function fetchRabiesVaccinationTrend(
  ctx: ProjectionContext,
): Promise<SingleSeriesTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return EMPTY_SINGLE(granularity);

  const unit = dateTruncUnit(granularity);
  const bucket = truncBucket(unit);
  const scope = petEventsScopeClause(ctx);
  const conditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    // Amendment overlay (audit A2): a corrected vaccine_name counts by its
    // CURRENT value, matching the TS read boundaries.
    sql`(${amendedPayloadText("vaccine_name")}) ~* '(antirr[áa]bica|rabies)'`,
    eq(pets.species, "dog"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      bucket,
      n: countDistinct(petEvents.petId),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);

  return finalizeSingleSeries(rows, granularity);
}

// ---------------------------------------------------------------------------
// D2 — Generic single-series KPI trend — backs sparklines on all KPI tiles
// ---------------------------------------------------------------------------

/**
 * Count of `pet_events` with the given `eventType`, bucketed by period
 * (week for ≤120d, month otherwise), scoped to the viewer's jurisdiction.
 *
 * This is the generic building block for KPI sparklines introduced in
 * Dashboards vNext Fase 0.  It intentionally mirrors `fetchBitesTrend` and
 * `fetchOutbreakSignalsTrend`: same `truncBucket` helper (injection-safe
 * date_trunc inliner), same `finalizeSingleSeries`, same `petEventsScopeClause`.
 *
 * Usage:
 *   const trend = await fetchKpiTrend("vaccination_administered", ctx);
 *   // trend.points → [{ x: "2026-W03", y: 14 }, …]
 *
 * @param eventType - The exact `pet_events.event_type` value to count.
 * @param ctx       - ProjectionContext (actor + scope + period).
 */
export async function fetchKpiTrend(
  eventType: string,
  ctx: ProjectionContext,
): Promise<SingleSeriesTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return EMPTY_SINGLE(granularity);

  const unit = dateTruncUnit(granularity);
  const bucket = truncBucket(unit);
  const scope = petEventsScopeClause(ctx);
  const conditions = [
    eq(petEvents.eventType, eventType),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      bucket,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);

  return finalizeSingleSeries(rows, granularity);
}

// ---------------------------------------------------------------------------
// Shared single-series finalizer: label → suppress → return.
// ---------------------------------------------------------------------------

function finalizeSingleSeries(
  rows: Array<{ bucket: string; n: number }>,
  granularity: BucketGranularity,
): SingleSeriesTrend {
  const labeled = rows
    .map((r) => {
      const start = new Date(r.bucket);
      return { start: start.toISOString(), x: formatBucketLabel(start, granularity), y: r.n };
    })
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ x, y }) => ({ x, y }));

  const { points, suppressedCount } = suppressSmallBuckets(labeled, 5);
  return { granularity, points, suppressedCount };
}
