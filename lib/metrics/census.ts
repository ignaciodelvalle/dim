// lib/metrics/census.ts — Paquete E: censo poblacional & salud del registro.
//
// Three async fetchers built on ProjectionContext, scoped and period-aware:
//
//   registryCounts(ctx, dormantMonths?)  → total, active, dormant, incomplete, byLocality
//   registrationTrend(ctx)               → single-series altas nuevas (pets.created_at)
//   identificationFunnel(ctx)            → total→chipped→isoValid→scanned funnel
//
// DORMANT DEFINITION
// ------------------
// A pet is dormant when it has been active/lost but the OWNER has performed no
// qualifying event in the last N months. We use a NOT EXISTS correlated subquery
// on pet_events EXCLUDING event_type = 'credential_scanned': scans are auto-purged
// at 90 days by the cron (scan-retention.ts) and are not owner-initiated activity.
// Pets with zero qualifying events (e.g. registered but never had any vet/owner
// interaction beyond import) ALSO count as dormant — the subquery returns false
// for them and they satisfy NOT EXISTS.
//
// FUNNEL SCAN STAGE
// -----------------
// The `scanned` stage counts DISTINCT pets with a credential_scanned event in the
// ctx period window. Because scan events are purged at 90d, this stage is inherently
// period-bounded: a pet scanned 6 months ago does not appear here today. This is
// documented in the label "escaneada en el período" and in the FunnelStages type.
//
// PURE PREDICATES
// ---------------
// isIncompleteProfile, classifyDormant, assertFunnelMonotonic, and funnelPercents
// are pure (no DB, no side effects) so they can be unit-tested without Postgres.

import { and, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";

import { suppressedMetric } from "./anonymity";
import type { ProjectionContext } from "./context";
import { activePetsCondition } from "./population";
import { petsScopeClause } from "./scope";
import {
  bucketGranularityFor,
  dateTruncUnit,
  formatBucketLabel,
  suppressSmallBuckets,
} from "./timeseries";
import type { SingleSeriesTrend } from "./trends";
import type { Cell, MetricResult, SuppressedCells } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Months of owner inactivity before a pet is considered dormant. */
export const DORMANT_MONTHS_DEFAULT = 12;

// ---------------------------------------------------------------------------
// Pure predicates (unit-testable, DB-free)
// ---------------------------------------------------------------------------

/**
 * Returns true when the pet profile is considered incomplete.
 * A profile is incomplete if it is missing ANY of:
 *   - an active microchip_iso identification
 *   - a known sex (sex !== 'unknown')
 *   - a jurisdiction locality
 */
export function isIncompleteProfile({
  hasChip,
  sex,
  hasLocality,
}: {
  hasChip: boolean;
  sex: string;
  hasLocality: boolean;
}): boolean {
  return !hasChip || sex === "unknown" || !hasLocality;
}

/**
 * Classify a pet as dormant based on its last qualifying owner-activity event.
 *
 * @param lastOwnerEventAt - Date of last qualifying owner event, or null if none.
 * @param now              - Current date reference.
 * @param months           - Dormancy threshold in months.
 * @returns true if the pet is dormant (no owner activity in the last N months).
 */
export function classifyDormant(lastOwnerEventAt: Date | null, now: Date, months: number): boolean {
  if (lastOwnerEventAt === null) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return lastOwnerEventAt < cutoff;
}

/**
 * The stages of the identification funnel.
 * Each value is a count of distinct pets reaching that stage.
 * Monotonicity (chip chain only): total >= chipped >= isoValid. `scanned` is an
 * INDEPENDENT period-bounded signal — a pet can be scanned without an ISO chip,
 * so scanned may exceed isoValid; it is not part of the subset chain.
 */
export type FunnelStages = {
  /** Total active/lost pets in scope. */
  total: number;
  /** Pets with at least one active microchip_iso identification. */
  chipped: number;
  /** Chipped pets whose microchip_iso has valid ISO 11784/11785 decomposition. */
  isoValid: number;
  /**
   * Distinct pets with a credential_scanned event in the ctx period.
   * PERIOD-BOUNDED: scan events are purged at 90d — a pet scanned outside the
   * window does not appear here. The UI labels this "escaneada en el período".
   */
  scanned: number;
};

/**
 * Assert that the CHIP funnel stages are monotonically non-increasing:
 * total >= chipped >= isoValid (each a strict subset of the previous).
 *
 * `scanned` is deliberately NOT asserted here. A pet can be scanned in the
 * period WITHOUT having an ISO chip, so scanned may legitimately exceed isoValid
 * (or even total, if a since-deceased pet was scanned). It is an independent,
 * period-bounded signal — asserting isoValid >= scanned was a false invariant
 * that crashed /admin/censo when scans outnumbered ISO chips.
 *
 * Used as a runtime invariant guard — call before returning from identificationFunnel.
 */
export function assertFunnelMonotonic(stages: FunnelStages): void {
  const { total, chipped, isoValid } = stages;
  if (total < chipped) {
    throw new Error(`Funnel invariant violated: total(${total}) < chipped(${chipped})`);
  }
  if (chipped < isoValid) {
    throw new Error(`Funnel invariant violated: chipped(${chipped}) < isoValid(${isoValid})`);
  }
}

/**
 * Compute each funnel stage as a percentage of the total.
 * Returns values rounded to one decimal. total → 100%.
 */
export function funnelPercents(stages: FunnelStages): Record<keyof FunnelStages, number> {
  const { total, chipped, isoValid, scanned } = stages;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return {
    total: 100,
    chipped: pct(chipped),
    isoValid: pct(isoValid),
    scanned: pct(scanned),
  };
}

// ---------------------------------------------------------------------------
// Registry counts shape
// ---------------------------------------------------------------------------

export type RegistryCounts = {
  /** Total active/lost pets in scope (denominator). */
  total: number;
  /** Pets with status='active' in scope. */
  active: number;
  /**
   * Active/lost pets with no qualifying owner-activity event in the last
   * DORMANT_MONTHS_DEFAULT months (or the provided threshold). Pets with
   * zero qualifying events also count as dormant. Excludes credential_scanned
   * events, which are auto-purged at 90d and are not owner-initiated activity.
   */
  dormant: number;
  /**
   * Active/lost pets missing ANY of: active microchip_iso, known sex,
   * or jurisdiction_locality.
   */
  incomplete: number;
  /**
   * Per-locality registry count, k-anonymity suppressed (k=5).
   * Use for the locality-level choropleth/breakdown.
   */
  byLocality: MetricResult<SuppressedCells>;
};

// ---------------------------------------------------------------------------
// DB-bound fetchers
// ---------------------------------------------------------------------------

/** True when a govt actor has no assigned jurisdictions — all queries return zeros. */
function isEmptyScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

/**
 * Aggregate registry health counts scoped to the ProjectionContext.
 *
 * @param ctx            - ProjectionContext (actor + scope + period).
 * @param dormantMonths  - Inactivity threshold in months. Default: DORMANT_MONTHS_DEFAULT (12).
 */
export async function registryCounts(
  ctx: ProjectionContext,
  dormantMonths: number = DORMANT_MONTHS_DEFAULT,
): Promise<RegistryCounts> {
  const empty: RegistryCounts = {
    total: 0,
    active: 0,
    dormant: 0,
    incomplete: 0,
    byLocality: { value: [] as unknown as SuppressedCells, suppressedCount: 0 },
  };
  if (isEmptyScope(ctx)) return empty;

  const scope = petsScopeClause(ctx);
  const activeCond = activePetsCondition(ctx);

  // Cutoff date for dormancy (N months ago from the period's `until` boundary).
  const dormancyCutoff = new Date(ctx.period.until);
  dormancyCutoff.setMonth(dormancyCutoff.getMonth() - dormantMonths);

  // EXISTS subquery: pet has at least one qualifying owner-activity event after the cutoff.
  // Excludes credential_scanned — auto-purged at 90d, not owner-initiated activity.
  // NOTE: bind the cutoff as an ISO string, not a raw Date. Interpolating a JS
  // Date into a sql`` fragment makes postgres-js (prepare:false) try to serialize
  // it via a Buffer/string path and throw ERR_INVALID_ARG_TYPE ("Received an
  // instance of Date"), which crashes /admin/programa, /censo and /poblacion.
  // The ISO string is implicitly cast to timestamptz by the >= comparison.
  const dormancyCutoffIso = dormancyCutoff.toISOString();
  const hasRecentOwnerActivity = sql`EXISTS (
    SELECT 1 FROM pet_events pe
    WHERE pe.pet_id = ${pets.id}
      AND pe.event_type <> 'credential_scanned'
      AND pe.occurred_at >= ${dormancyCutoffIso}
  )`;

  // EXISTS subquery: pet has an active microchip_iso identification.
  const hasChip = sql`EXISTS (
    SELECT 1 FROM pet_identifications pi
    WHERE pi.pet_id = ${pets.id}
      AND pi.kind = 'microchip_iso'
      AND pi.status = 'active'
  )`;

  // A profile is incomplete if missing chip, OR sex is unknown, OR no locality.
  const isIncomplete = sql`(
    NOT ${hasChip}
    OR ${pets.sex} = 'unknown'
    OR ${pets.jurisdictionLocality} IS NULL
  )`;

  const [totalRows, activeRows, dormantRows, incompleteRows, localityRows] = await Promise.all([
    // total = active/lost pets in scope
    db
      .select({ n: count() })
      .from(pets)
      .where(activeCond),

    // active = status='active' only (excludes lost)
    db
      .select({ n: count() })
      .from(pets)
      .where(scope ? and(eq(pets.status, "active"), sql`(${scope})`) : eq(pets.status, "active")),

    // dormant = active/lost with NO owner-activity event after the cutoff
    // (NOT EXISTS on the qualifying events subquery)
    db
      .select({ n: count() })
      .from(pets)
      .where(and(activeCond, sql`NOT ${hasRecentOwnerActivity}`)),

    // incomplete = active/lost missing chip OR unknown sex OR no locality
    db
      .select({ n: count() })
      .from(pets)
      .where(and(activeCond, isIncomplete)),

    // byLocality = per-locality count for k-anon choropleth
    db
      .select({
        locality: pets.jurisdictionLocality,
        n: count(),
      })
      .from(pets)
      .where(activeCond)
      .groupBy(pets.jurisdictionLocality),
  ]);

  const localityCells: Cell[] = localityRows.map((r) => ({
    key: r.locality ?? "—",
    count: r.n,
  }));
  const byLocality = suppressedMetric(localityCells, {
    count: (c) => c.count,
    key: (c) => c.key,
  });

  return {
    total: totalRows[0]?.n ?? 0,
    active: activeRows[0]?.n ?? 0,
    dormant: dormantRows[0]?.n ?? 0,
    incomplete: incompleteRows[0]?.n ?? 0,
    byLocality,
  };
}

/**
 * Bucketed registration trend: count of newly registered pets per week/month.
 *
 * Buckets pets.created_at (NOT pet_events) so this is a true "altas nuevas"
 * series. Scope is petsScopeClause (jurisdiction filter on the pets table).
 * k-anonymity applied via suppressSmallBuckets (k=5).
 */
export async function registrationTrend(ctx: ProjectionContext): Promise<SingleSeriesTrend> {
  const granularity = bucketGranularityFor(ctx.period);
  if (isEmptyScope(ctx)) return { granularity, points: [], suppressedCount: 0 };

  const unit = dateTruncUnit(granularity);
  const u = unit === "week" ? "week" : "month";
  // Injection-safe: `u` is a whitelisted literal, not user input.
  const bucket = sql<string>`date_trunc(${sql.raw(`'${u}'`)}, ${pets.createdAt})`;

  const scope = petsScopeClause(ctx);
  const conditions = [
    gte(pets.createdAt, ctx.period.since),
    lte(pets.createdAt, ctx.period.until),
    sql`${pets.status} IN ('active', 'lost')`,
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({ bucket, n: count() })
    .from(pets)
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);

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

/**
 * Identification funnel: how many pets in scope reach each identification stage.
 *
 * Stages: total → chipped → isoValid → scanned (in ctx period).
 * Monotonicity is asserted before return.
 *
 * See FunnelStages for the `scanned` period-bounded caveat.
 */
export async function identificationFunnel(ctx: ProjectionContext): Promise<FunnelStages> {
  if (isEmptyScope(ctx)) return { total: 0, chipped: 0, isoValid: 0, scanned: 0 };

  const scope = petsScopeClause(ctx);
  const activeCond = activePetsCondition(ctx);

  // Reuses the same EXISTS pattern as fetchMicrochipPenetration (lib/compliance-metrics.ts)
  const hasChipExists = sql`EXISTS (
    SELECT 1 FROM pet_identifications pi
    WHERE pi.pet_id = ${pets.id}
      AND pi.kind = 'microchip_iso'
      AND pi.status = 'active'
  )`;

  // ISO structural validity check — 3-field ISO 11784/11785 decomposition.
  // Reuses logic from fetchIsoValidity (lib/compliance-metrics.ts).
  // char() columns are blank-padded by Postgres, so we trim before measuring length.
  const validIso = sql`(
    pi.iso_country_code IS NOT NULL AND length(btrim(pi.iso_country_code)) = 3
    AND pi.iso_manufacturer_code IS NOT NULL AND length(btrim(pi.iso_manufacturer_code)) = 4
    AND pi.iso_national_id IS NOT NULL AND length(btrim(pi.iso_national_id)) = 8
  )`;

  const isoConditions = [sql`pi.kind = 'microchip_iso'`, sql`pi.status = 'active'`];
  if (scope) isoConditions.push(sql`(${scope})`);

  // scanned: DISTINCT pets with a credential_scanned event in the ctx period.
  // Not a self-scan (non-self is the relevant owner/vet signal; self-scans via
  // app are excluded by the event schema — scanned_by_role != 'owner').
  const scanConditions = [
    eq(petEvents.eventType, "credential_scanned"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  // Scope scanned via JOIN to pets (scan events don't carry jurisdiction payload fields).
  const scopedScanQuery = db
    .select({ n: countDistinct(petEvents.petId) })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(scope ? and(...scanConditions, sql`(${scope})`) : and(...scanConditions));

  const [totalRows, chippedRows, isoRows, scannedRows] = await Promise.all([
    db.select({ n: count() }).from(pets).where(activeCond),

    db.select({ n: count() }).from(pets).where(and(activeCond, hasChipExists)),

    db
      .select({
        valid: sql<number>`count(*) FILTER (WHERE ${validIso})::int`,
        chipped: sql<number>`count(*)::int`,
      })
      .from(sql`pet_identifications pi`)
      .innerJoin(pets, sql`${pets.id} = pi.pet_id`)
      .where(and(...isoConditions)),

    scopedScanQuery,
  ]);

  const total = totalRows[0]?.n ?? 0;
  const chipped = chippedRows[0]?.n ?? 0;
  const isoValid = Number(isoRows[0]?.valid ?? 0);
  const scanned = scannedRows[0]?.n ?? 0;

  const stages: FunnelStages = { total, chipped, isoValid, scanned };
  assertFunnelMonotonic(stages);
  return stages;
}

// ---------------------------------------------------------------------------
// Province-level choropleth (no suppression — province aggregates are never small)
// ---------------------------------------------------------------------------

export type ProvinceRegistryRow = {
  /** Province name as stored in pets.jurisdiction_province. */
  province: string;
  /** Count of distinct active/lost pets in the province. */
  count: number;
};

/**
 * Count distinct active/lost pets grouped by province (no k-anon suppression at
 * province level — cell sizes are always large enough to be non-identifying).
 *
 * Used for the cross-jurisdiction choropleth and ranked table in /admin/censo.
 * Does NOT extend Panorama's ChoroplethMetric — it's a standalone projection.
 */
export async function registryByProvince(ctx: ProjectionContext): Promise<ProvinceRegistryRow[]> {
  if (isEmptyScope(ctx)) return [];

  const activeCond = activePetsCondition(ctx);

  const rows = await db
    .select({
      province: pets.jurisdictionProvince,
      n: countDistinct(pets.id),
    })
    .from(pets)
    .where(activeCond)
    .groupBy(pets.jurisdictionProvince)
    .orderBy(sql`count(distinct ${pets.id}) desc`);

  return rows
    .filter((r): r is typeof r & { province: string } => r.province !== null)
    .map((r) => ({ province: r.province, count: r.n }));
}
