// lib/metrics/population-control.ts — Paquete G: control poblacional.
//
// Three async fetchers + one trend reuse built on ProjectionContext,
// scoped and period-aware:
//
//   fetchSterilizationCoverage(ctx)       → { rate, sterilized, total, byProvince }
//   fetchActivePregnancies(ctx)           → count of in-progress pregnancies
//   fetchReproductiveOutcomes(ctx)        → grouped counts by outcome + registeredBirths
//   fetchNetGrowth(ctx)                   → { altas, registeredBirths, deaths, net }
//   fetchSterilizationNatalidadRatio(ctx) → sterilizations/births in period (null if den=0)
//   fetchSterilizationTrend(ctx)          → reuses fetchKpiTrend("sterilization_performed", ctx)
//
// NATALIDAD CAVEAT (CRITICAL — MUST NOT BE REMOVED):
// --------------------------------------------------
// `registeredBirths` counts ONLY tracked pregnancies with
// `payload->>'pregnancy_phase' = 'ended'` AND `payload->>'outcome' = 'live_birth'`
// (i.e. pregnancies recorded via `recordPregnancyEndedAction` in the system).
// There is NO total-births event: street/untracked litters and callejero births
// are invisible. Therefore:
//   - netGrowth.net is DIRECTIONAL, NOT exact.
//   - sterilizationNatalidadRatio is DIRECTIONAL, NOT exact.
//   - Both systematically UNDER-COUNT natalidad (under-estimate births → over-
//     estimate containment). Operators must treat them as indicators, not absolutes.
//
// This caveat MUST appear in the UI as an info tooltip + a caveat sub line:
//   "Solo partos en seguimiento — subestima la natalidad real"
//
// PURE HELPERS (unit-tested, DB-free):
// -------------------------------------
// computeNetGrowth, safeRatio, coverageRate

import { and, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";

import type { ProjectionContext } from "./context";
import { activePetsCondition } from "./population";
import { petEventsScopeClause, petsScopeClause } from "./scope";
import type { SingleSeriesTrend } from "./trends";
import { fetchKpiTrend } from "./trends";

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable, DB-free)
// ---------------------------------------------------------------------------

/**
 * Compute net population growth over a period.
 *
 * Formula: altas + births − deaths.
 * The result can be negative (population is contracting).
 *
 * @param altas  - New registrations in the period.
 * @param births - Registered live births in the period (tracked pregnancies only).
 * @param deaths - Deaths recorded in the period.
 */
export function computeNetGrowth({
  altas,
  births,
  deaths,
}: {
  altas: number;
  births: number;
  deaths: number;
}): number {
  return altas + births - deaths;
}

/**
 * Safe ratio: numerator / denominator.
 * Returns null when denominator is 0 (no meaningful ratio).
 *
 * @param num - Numerator.
 * @param den - Denominator.
 */
export function safeRatio(num: number, den: number): number | null {
  if (den === 0) return null;
  return num / den;
}

/**
 * Sterilization coverage rate as a percentage (0–100).
 * Returns 0 when total is 0 (empty population → no coverage signal).
 *
 * @param sterilized - Count of sterilized active pets.
 * @param total      - Count of all active pets.
 */
export function coverageRate(sterilized: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((sterilized / total) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Shared guard
// ---------------------------------------------------------------------------

/** True when a govt actor has no assigned jurisdictions — all queries return zeros/empty. */
function isEmptyScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

// ---------------------------------------------------------------------------
// Sterilization coverage
// ---------------------------------------------------------------------------

export type ProvinceSterlizationRow = {
  /** Province name as stored in pets.jurisdiction_province. */
  province: string;
  /** Sterilization coverage rate (0–100). */
  ratePct: number;
  /** Count of sterilized active pets in the province. */
  sterilized: number;
  /** Total active pets in the province (denominator). */
  total: number;
};

export type SterilizationCoverageResult = {
  /**
   * Sterilization coverage rate as a percentage (0–100).
   * sterilized / total * 100, rounded to one decimal.
   * 0 when total is 0.
   */
  rate: number;
  /** Count of distinct active pets with ≥1 sterilization_performed event. */
  sterilized: number;
  /** Count of active/lost pets in scope (denominator). */
  total: number;
  /**
   * Per-province breakdown for the choropleth.
   * No k-anonymity suppression at province level — cell sizes are always
   * large enough to be non-identifying.
   */
  byProvince: ProvinceSterlizationRow[];
};

/**
 * Sterilization coverage: what fraction of active pets in scope have received
 * at least one sterilization_performed event?
 *
 * Numerator: COUNT(DISTINCT pets) WHERE EXISTS sterilization_performed event.
 * Uses the same EXISTS subquery pattern as fetchMicrochipPenetration in
 * lib/compliance-metrics.ts — guaranteed same denominator, no fan-out.
 *
 * byProvince: per-province coverage for the choropleth. No k-anonymity
 * suppression at province level.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: sterilization_coverage_population (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT DISTINCT active/lost pets with ≥1 sterilization_performed
 *              event, ever (no time window on the event itself).
 * DENOMINATOR: COUNT active/lost pets in scope.
 * SOURCE:      pets, pet_events (sterilization_performed).
 * CADENCE:     point-in-time snapshot ("ever sterilized", not "in period").
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchSterilizationCoverage(
  ctx: ProjectionContext,
): Promise<SterilizationCoverageResult> {
  const empty: SterilizationCoverageResult = { rate: 0, sterilized: 0, total: 0, byProvince: [] };
  if (isEmptyScope(ctx)) return empty;

  const activeCond = activePetsCondition(ctx);

  // An active pet is "sterilized" if it has ≥1 sterilization_performed event.
  // EXISTS keeps the numerator/denominator on the SAME pet base (no fan-out).
  // Mirrors fetchMicrochipPenetration EXACTLY (lib/compliance-metrics.ts).
  const sterilizedExists = sql`EXISTS (
    SELECT 1 FROM pet_events pe
    WHERE pe.pet_id = ${pets.id}
      AND pe.event_type = 'sterilization_performed'
  )`;

  const [totalRows, sterilizedRows, provinceRows] = await Promise.all([
    db.select({ n: count() }).from(pets).where(activeCond),

    db
      .select({ n: countDistinct(pets.id) })
      .from(pets)
      .where(and(activeCond, sterilizedExists)),

    // Per-province sterilized/total for choropleth.
    db
      .select({
        province: pets.jurisdictionProvince,
        total: count(),
        sterilized: sql<number>`count(*) FILTER (WHERE ${sterilizedExists})::int`,
      })
      .from(pets)
      .where(activeCond)
      .groupBy(pets.jurisdictionProvince)
      .orderBy(sql`count(*) desc`),
  ]);

  const total = totalRows[0]?.n ?? 0;
  const sterilized = sterilizedRows[0]?.n ?? 0;

  const byProvince: ProvinceSterlizationRow[] = provinceRows
    .filter((r): r is typeof r & { province: string } => r.province !== null)
    .map((r) => ({
      province: r.province,
      total: r.total,
      sterilized: Number(r.sterilized),
      ratePct: coverageRate(Number(r.sterilized), r.total),
    }));

  return {
    rate: coverageRate(sterilized, total),
    sterilized,
    total,
    byProvince,
  };
}

// ---------------------------------------------------------------------------
// Active pregnancies
// ---------------------------------------------------------------------------

/**
 * Count of pets in scope with pregnancyStatus = 'in_progress'.
 *
 * Uses the denormalized pets.pregnancy_status column (D7 pattern: same as
 * pets.status for active/lost — authoritative at population scale).
 * Scope via petsScopeClause (jurisdiction filter on the pets table).
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: active_pregnancies (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT active/lost pets WHERE pregnancy_status = 'in_progress'.
 * DENOMINATOR: n/a — absolute count.
 * SOURCE:      pets (denormalized pregnancy_status column).
 * CADENCE:     point-in-time snapshot.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchActivePregnancies(ctx: ProjectionContext): Promise<number> {
  if (isEmptyScope(ctx)) return 0;

  const activeCond = activePetsCondition(ctx);
  const rows = await db
    .select({ n: count() })
    .from(pets)
    .where(and(activeCond, eq(pets.pregnancyStatus, "in_progress")));

  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Reproductive outcomes
// ---------------------------------------------------------------------------

export type ReproductiveOutcomeKey =
  | "live_birth"
  | "stillbirth"
  | "miscarriage"
  | "termination"
  | "unknown";

export type ReproductiveOutcomes = {
  /** Counts per outcome from clinical_info_logged pregnancy-ended events in the period. */
  byClinicalOutcome: Record<ReproductiveOutcomeKey, number>;
  /**
   * Count of live-birth events in the period.
   *
   * NATALIDAD CAVEAT: this only counts TRACKED pregnancies recorded in the
   * system. Street/untracked litters are invisible. This number systematically
   * UNDER-COUNTS real natalidad and must be labelled as such in the UI:
   *   "Solo partos en seguimiento — subestima la natalidad real"
   */
  registeredBirths: number;
  /**
   * Optional sum of live_births_count payload field for tracked live-birth events.
   * When > 0 this is a better proxy for animals born than event count.
   * May be 0 if reporters did not fill in the count field.
   */
  liveBirthsCountSum: number;
};

/**
 * Counts of clinical_info_logged events with sub_kind='pregnancy' AND
 * pregnancy_phase='ended', grouped by outcome, in ctx period, scoped.
 *
 * Event payload shape (from app/actions/pregnancy.ts):
 *   { sub_kind: 'pregnancy', pregnancy_phase: 'ended', outcome: <key>, live_births_count: N|null }
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: not yet in lib/metrics/kpi-catalog.ts (feeds sterilization_natalidad_ratio's
 * denominator — documented here directly, no cross-surface label ambiguity).
 *
 * NUMERATOR:   COUNT clinical_info_logged events (sub_kind='pregnancy',
 *              pregnancy_phase='ended'), grouped by payload.outcome.
 *              registeredBirths = the 'live_birth' bucket specifically.
 * DENOMINATOR: n/a — grouped counts, not a ratio.
 * SOURCE:      pet_events (clinical_info_logged).
 * CADENCE:     matches the caller's ProjectionContext period.
 * SUPPRESSION: none.
 *
 * NATALIDAD CAVEAT: only TRACKED pregnancies are counted — see the
 * module-level comment. registeredBirths under-counts real natalidad.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchReproductiveOutcomes(
  ctx: ProjectionContext,
): Promise<ReproductiveOutcomes> {
  const empty: ReproductiveOutcomes = {
    byClinicalOutcome: {
      live_birth: 0,
      stillbirth: 0,
      miscarriage: 0,
      termination: 0,
      unknown: 0,
    },
    registeredBirths: 0,
    liveBirthsCountSum: 0,
  };
  if (isEmptyScope(ctx)) return empty;

  const scope = petEventsScopeClause(ctx);

  const conditions = [
    eq(petEvents.eventType, "clinical_info_logged"),
    sql`${petEvents.payload}->>'sub_kind' = ${"pregnancy"}`,
    sql`${petEvents.payload}->>'pregnancy_phase' = ${"ended"}`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      outcome: sql<string>`COALESCE(${petEvents.payload}->>'outcome', 'unknown')`,
      n: count(),
      liveBirthsSum: sql<number>`COALESCE(SUM((${petEvents.payload}->>'live_births_count')::int) FILTER (WHERE ${petEvents.payload}->>'live_births_count' IS NOT NULL), 0)::int`,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .groupBy(sql`COALESCE(${petEvents.payload}->>'outcome', 'unknown')`);

  const VALID_OUTCOMES = new Set<ReproductiveOutcomeKey>([
    "live_birth",
    "stillbirth",
    "miscarriage",
    "termination",
    "unknown",
  ]);

  const counts: Record<ReproductiveOutcomeKey, number> = {
    live_birth: 0,
    stillbirth: 0,
    miscarriage: 0,
    termination: 0,
    unknown: 0,
  };
  let liveBirthsCountSum = 0;

  for (const row of rows) {
    const key = VALID_OUTCOMES.has(row.outcome as ReproductiveOutcomeKey)
      ? (row.outcome as ReproductiveOutcomeKey)
      : "unknown";
    counts[key] += row.n;
    if (key === "live_birth") {
      liveBirthsCountSum += Number(row.liveBirthsSum);
    }
  }

  return {
    byClinicalOutcome: counts,
    registeredBirths: counts.live_birth,
    liveBirthsCountSum,
  };
}

// ---------------------------------------------------------------------------
// Net growth
// ---------------------------------------------------------------------------

export type NetGrowthResult = {
  /** Count of new pet registrations (pets.created_at in period, in scope). */
  altas: number;
  /**
   * Registered live births in the period (tracked pregnancies only).
   *
   * NATALIDAD CAVEAT: systematically under-counts real natalidad.
   * Street/untracked litters are invisible. Display with caveat:
   *   "Solo partos en seguimiento — subestima la natalidad real"
   */
  registeredBirths: number;
  /** Count of death_recorded events in the period, scoped. */
  deaths: number;
  /**
   * Net = altas + registeredBirths − deaths.
   *
   * DIRECTIONAL, NOT EXACT — because registeredBirths under-counts real births.
   * A net < 0 is a strong containment signal; a net > 0 may be partially
   * explained by untracked litters.
   */
  net: number;
};

/**
 * Net population growth in the ctx period:
 *   net = altas + registeredBirths − deaths
 *
 * All three components use the same period (ctx.period.since / until) and
 * the same jurisdiction scope.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: not yet in lib/metrics/kpi-catalog.ts (composite of three event
 * counts — no cross-surface label ambiguity reported).
 *
 * NUMERATOR:   net = altas (pets.created_at in period) + registeredBirths
 *              (live_birth outcomes in period) − deaths (death_recorded
 *              events in period).
 * DENOMINATOR: n/a — a signed count, not a ratio.
 * SOURCE:      pets, pet_events (death_recorded, clinical_info_logged).
 * CADENCE:     matches the caller's ProjectionContext period.
 * SUPPRESSION: none.
 *
 * NATALIDAD CAVEAT: registeredBirths under-counts real natalidad (tracked
 * pregnancies only) — net is DIRECTIONAL, not exact. See module-level comment.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchNetGrowth(ctx: ProjectionContext): Promise<NetGrowthResult> {
  const empty: NetGrowthResult = { altas: 0, registeredBirths: 0, deaths: 0, net: 0 };
  if (isEmptyScope(ctx)) return empty;

  const scope = petsScopeClause(ctx);
  const evtScope = petEventsScopeClause(ctx);

  // altas: pets created in the period (same scope as activePetsCondition)
  const altasConditions = [
    gte(pets.createdAt, ctx.period.since),
    lte(pets.createdAt, ctx.period.until),
    sql`${pets.status} IN ('active', 'lost')`,
  ];
  if (scope) altasConditions.push(sql`(${scope})`);

  // deaths: death_recorded events in the period, scoped via JOIN to pets.
  // BOTH scope clauses apply: evtScope guards the event payload jurisdiction, and
  // the pets-table `scope` guards the pet's CURRENT jurisdiction (the queries
  // innerJoin pets). Without the pets-side clause a death/birth event whose
  // payload jurisdiction was in scope but whose pet has since moved out (or whose
  // payload drifted) leaked into a govt aggregate — the same payload-drift guard
  // altas already gets via `scope` (C3 / scope-security A2).
  const deathConditions = [
    eq(petEvents.eventType, "death_recorded"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (evtScope) deathConditions.push(sql`(${evtScope})`);
  if (scope) deathConditions.push(sql`(${scope})`);

  // registeredBirths: clinical_info_logged pregnancy-ended live_birth in the period
  const birthConditions = [
    eq(petEvents.eventType, "clinical_info_logged"),
    sql`${petEvents.payload}->>'sub_kind' = ${"pregnancy"}`,
    sql`${petEvents.payload}->>'pregnancy_phase' = ${"ended"}`,
    sql`${petEvents.payload}->>'outcome' = ${"live_birth"}`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (evtScope) birthConditions.push(sql`(${evtScope})`);
  if (scope) birthConditions.push(sql`(${scope})`);

  const [altasRows, deathRows, birthRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...altasConditions)),

    db
      .select({ n: count() })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...deathConditions)),

    db
      .select({ n: count() })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...birthConditions)),
  ]);

  const altas = altasRows[0]?.n ?? 0;
  const deaths = deathRows[0]?.n ?? 0;
  const registeredBirths = birthRows[0]?.n ?? 0;

  return {
    altas,
    registeredBirths,
    deaths,
    net: computeNetGrowth({ altas, births: registeredBirths, deaths }),
  };
}

// ---------------------------------------------------------------------------
// Sterilization/natalidad ratio
// ---------------------------------------------------------------------------

/**
 * Ratio of sterilization events performed in the period to registered births.
 *
 * Formula: COUNT(sterilization_performed) / registeredBirths.
 * Returns null when registeredBirths is 0 (no meaningful ratio, never divide by zero).
 *
 * NATALIDAD CAVEAT: registeredBirths under-counts real natalidad.
 * A ratio > 1 is a favourable containment signal but does NOT mean sterilizations
 * actually outnumber all litters — untracked births are invisible.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: sterilization_natalidad_ratio (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT sterilization_performed events in the ctx period.
 * DENOMINATOR: COUNT registered live births in the SAME period
 *              (clinical_info_logged, sub_kind='pregnancy',
 *              pregnancy_phase='ended', outcome='live_birth') — null when 0.
 * SOURCE:      pet_events (sterilization_performed, clinical_info_logged).
 * CADENCE:     matches the caller's ProjectionContext period.
 * SUPPRESSION: none.
 *
 * NATALIDAD CAVEAT: the denominator under-counts real natalidad — this ratio
 * OVER-estimates containment. Directional signal only. See module-level comment.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchSterilizationNatalidadRatio(
  ctx: ProjectionContext,
): Promise<number | null> {
  if (isEmptyScope(ctx)) return null;

  const evtScope = petEventsScopeClause(ctx);

  const sterilConditions = [
    eq(petEvents.eventType, "sterilization_performed"),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (evtScope) sterilConditions.push(sql`(${evtScope})`);

  const birthConditions = [
    eq(petEvents.eventType, "clinical_info_logged"),
    sql`${petEvents.payload}->>'sub_kind' = ${"pregnancy"}`,
    sql`${petEvents.payload}->>'pregnancy_phase' = ${"ended"}`,
    sql`${petEvents.payload}->>'outcome' = ${"live_birth"}`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
  ];
  if (evtScope) birthConditions.push(sql`(${evtScope})`);

  const [sterilRows, birthRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...sterilConditions)),

    db
      .select({ n: count() })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...birthConditions)),
  ]);

  const sterilizations = sterilRows[0]?.n ?? 0;
  const births = birthRows[0]?.n ?? 0;

  return safeRatio(sterilizations, births);
}

// ---------------------------------------------------------------------------
// Sterilization trend (reuse D2 generic KPI trend)
// ---------------------------------------------------------------------------

/**
 * Bucketed count of sterilization_performed events over the ctx period.
 * Reuses fetchKpiTrend — same granularity, same scope, same k-anonymity.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
/**
 * KPI: sterilization_performed events bucketed over time — the trend view of
 * sterilization_coverage_population's numerator (see kpi-catalog.ts). Reuses
 * fetchKpiTrend, so numerator/scope/k-anon (k=5) are identical to that helper.
 */
export async function fetchSterilizationTrend(ctx: ProjectionContext): Promise<SingleSeriesTrend> {
  return fetchKpiTrend("sterilization_performed", ctx);
}
