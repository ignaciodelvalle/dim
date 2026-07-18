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

// POOL: analyticsDb (session pooler), NOT the OLTP transaction pooler — these are
// read-only multi-statement dashboard aggregates (registryCounts feeds /admin/programa,
// /gob/programa, /admin/censo, /gob/censo). supavisor transaction mode (6543) has a
// measured >100x pathology for this fan-out shape (db/index.ts); session mode serves it
// normally. Locally analyticsDb falls back to DATABASE_URL (identical dev/test).
import { analyticsDb as db, petEvents, pets } from "@/db";

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

/**
 * Estimated dogs per inhabitant — used to derive an estimated CANINE population
 * from the human census.
 *
 * WHY A FACTOR: `jurisdictions_census.population` holds INDEC 2022 **human**
 * totals (migration 0067/0153), NOT a dog census. Coverage metrics are
 * dogs-based, so expressing "el padrón cubre X% de la población canina
 * estimada" requires a dog-ownership factor applied to the human population.
 *
 * NO OFFICIAL NATIONAL FIGURE EXISTS: neither INDEC, SENASA nor the Ministerio
 * de Salud publish a verifiable national dog-population count (verified
 * 2026-07-18 research pass — datos-investigados-2026-07-18/poblacion-canina-denominador.md).
 * The widely-repeated "~10 millones de perros" / "1 perro cada 10 habitantes"
 * figures are press claims with NO primary citation and are NOT attributable to
 * OMS/OPS — that attribution could not be verified against any primary source
 * and must never be used here.
 *
 * VALUE / PROVENANCE: 0.158 dogs/inhabitant — dogs-per-inhabitant ratio from the
 * GCBA Encuesta Anual de Hogares (EAH) 2022, módulo Tenencia responsable de
 * perros y gatos: 493.676 perros over CABA's 3.121.707 habitantes (INDEC Censo
 * 2022) = 0,158 (≈16 perros cada 100 hab., the research package's headline
 * "0,16 perros/hab."). This is the highest-confidence CITABLE anchor available
 * (an official household survey, not a press estimate) — see
 * poblacion-canina-denominador.md option A. Applied nationally as a FIRST-PASS
 * proxy; this is an explicit ASSUMPTION, not a measured national figure — CABA
 * (the capital) is documented to have atypically LOW dog ownership vs the rest
 * of the country, so this ratio is a defensible FLOOR, likely an
 * underestimate nationally. The OPS/PANAFTOSA 2026 methodology (the field's
 * current authority) explicitly discourages extrapolating national dog
 * populations from fixed ratios and recommends household sampling instead —
 * this factor is a stopgap until a per-jurisdiction canine census or a
 * PANAFTOSA-method estimate becomes available, at which point this constant
 * should be replaced with a real dog-population column and the derivation
 * dropped.
 *
 * Every surface that uses it MUST name it as "estimada" so the number is never
 * read as a hard count (design rule: name your denominator).
 */
export const ESTIMATED_DOGS_PER_INHABITANT = 0.158;

/**
 * Registry-coverage-of-census shape: the SECOND denominator that turns a bare
 * registry coverage % into an honest "of what" statement.
 */
export type CensusCoverage = {
  /**
   * Estimated canine population = round(humanPopulation × ESTIMATED_DOGS_PER_INHABITANT).
   * The denominator of the registry-growth KPI.
   */
  censusDenominator: number;
  /**
   * registryDogs / censusDenominator × 100, one decimal — "el padrón cubre X% de
   * la población canina estimada". The pilot's registry-growth curve.
   */
  censusCoveragePct: number;
};

/**
 * Estimate the canine population from a human census total.
 *
 * Returns `null` when there is no usable human population (≤ 0) — i.e. the
 * jurisdiction has no census row, in which case callers show only the registry
 * denominator plus a "sin estimación censal" note (never a fabricated estimate).
 *
 * PURE — no DB, no side effects.
 */
export function estimateDogPopulation(humanPopulation: number): number | null {
  if (!Number.isFinite(humanPopulation) || humanPopulation <= 0) return null;
  const estimate = Math.round(humanPopulation * ESTIMATED_DOGS_PER_INHABITANT);
  return estimate > 0 ? estimate : null;
}

/**
 * Compute the registry-coverage-of-census pair (the double denominator's second
 * half) from the registered-dog count and the human census population.
 *
 * Returns `null` when no canine estimate can be derived (no census row) so the
 * display degrades to "sin estimación censal" gracefully.
 *
 * PURE — no DB, no side effects. Unit-tested in census.test.ts.
 */
export function computeCensusCoverage(
  registryDogs: number,
  humanPopulation: number,
): CensusCoverage | null {
  const censusDenominator = estimateDogPopulation(humanPopulation);
  if (censusDenominator === null) return null;
  const censusCoveragePct = Math.round((registryDogs / censusDenominator) * 1000) / 10;
  return { censusDenominator, censusCoveragePct };
}

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
/**
 * KPI: not yet in lib/metrics/kpi-catalog.ts (composite registry-health
 * counts — no cross-surface label ambiguity reported).
 *
 * NUMERATOR:   total = active/lost pets; active = status='active'; dormant =
 *              active/lost pets with NO qualifying owner event (any type
 *              except credential_scanned) after the dormancy cutoff;
 *              incomplete = active/lost pets missing chip OR unknown sex OR
 *              no locality; byLocality = per-locality counts.
 * DENOMINATOR: n/a — absolute counts (dormant/incomplete are subsets of total,
 *              not separately-denominated rates).
 * SOURCE:      pets, pet_events (any type except credential_scanned), pet_identifications.
 * CADENCE:     point-in-time snapshot; dormancy cutoff is dormantMonths back
 *              from ctx.period.until.
 * SUPPRESSION: byLocality is k-anon suppressed (k=5) via suppressedMetric;
 *              the other counts are unsuppressed.
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
 *
 * KPI tags: NUMERATOR = COUNT pets.created_at per bucket (in period, in
 * scope, status IN active/lost). DENOMINATOR = n/a (a count series). SOURCE =
 * pets. CADENCE = ctx.period, bucketed weekly/monthly. SUPPRESSION = k=5.
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
/**
 * KPI: not yet in lib/metrics/kpi-catalog.ts (a 4-stage funnel — related to,
 * but NOT the same fetcher as, microchip_penetration in compliance-metrics.ts;
 * `chipped` here shares that KPI's exact numerator/denominator by construction).
 *
 * NUMERATOR:   total = active/lost pets; chipped = active pets with an active
 *              microchip_iso identification; isoValid = chipped pets whose
 *              ISO country/manufacturer/national-id fields pass the 3-4-8-char
 *              structural check; scanned = DISTINCT pets with a
 *              credential_scanned event IN THE CTX PERIOD (period-bounded —
 *              see module-level FunnelStages doc).
 * DENOMINATOR: n/a — a monotonic funnel (each stage a subset of the last for
 *              chip→isoValid; scanned is an independent, non-nested signal).
 * SOURCE:      pets, pet_identifications, pet_events (credential_scanned).
 * CADENCE:     total/chipped/isoValid are point-in-time; scanned is bounded
 *              to ctx.period.
 * SUPPRESSION: none (assertFunnelMonotonic throws if the chip→isoValid
 *              invariant is violated, but that is a data-integrity guard, not
 *              privacy suppression).
 *
 * @param ctx - ProjectionContext (actor + scope + period).
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

  // isoValid MUST apply the SAME population predicate as `chipped`
  // (activeCond) — without it, a deceased pet's valid ISO chip counted in
  // isoValid but not in chipped, violating the funnel monotonic assert and
  // 500ing /admin/censo the moment the data held one such pet. It also
  // counts DISTINCT pets (not identification rows) for the same reason.
  const isoConditions = [sql`pi.kind = 'microchip_iso'`, sql`pi.status = 'active'`, activeCond];
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
        valid: sql<number>`count(DISTINCT pi.pet_id) FILTER (WHERE ${validIso})::int`,
        chipped: sql<number>`count(DISTINCT pi.pet_id)::int`,
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
 *
 * KPI tags: NUMERATOR = COUNT DISTINCT active/lost pets per province.
 * DENOMINATOR = n/a (absolute count per province). SOURCE = pets. CADENCE =
 * point-in-time. SUPPRESSION = none (province cells are never small).
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
