// Real KPI fetchers for the /gob home dashboard (L-followup sprint).
//
// Each fetcher respects the viewer's jurisdiction scope:
//   admin  → universal (no WHERE clause on jurisdiction)
//   govt   → their assigned jurisdiction pairs only
//
// All fetchers accept a ProjectionContext (actor + scope + period) built via
// buildProjectionContext() from lib/metrics/. Scope and period primitives are
// single-sourced there; k-anonymity suppression is enforced by
// lib/metrics/anonymity.ts where applicable.

import { and, count, countDistinct, gte, inArray, lt, lte, not, sql, sum } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { cases, db, jurisdictionsCensus, petEvents, pets, welfareReports } from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import {
  type ProjectionContext,
  RABIES_VACCINE_NAME_REGEX,
  TARGETS,
  dogsInScopeCondition,
  petEventsScopeClause,
  petsScopeClause,
} from "@/lib/metrics";
import { TERMINAL_STATUSES as WELFARE_TERMINAL_STATUSES } from "@/src/modules/welfare/domain/welfare-status-rules";

// Re-export types so callers that import from this module don't need to change.
export type { DashboardActor, DashboardJurisdiction, ProjectionContext } from "@/lib/metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal scope helpers (table-specific — not in lib/metrics)
// ---------------------------------------------------------------------------

// Scope clause for cases rows (uses cases.jurisdictionProvince/Locality).
function casesScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") {
    // Admin province drill-down: narrow to the selected province/locality.
    if (!ctx.adminProvince) return null;
    if (ctx.adminLocality) {
      return and(
        eq(cases.jurisdictionProvince, ctx.adminProvince),
        eq(cases.jurisdictionLocality, ctx.adminLocality),
      );
    }
    return eq(cases.jurisdictionProvince, ctx.adminProvince);
  }
  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${cases.jurisdictionProvince} = ${j.province} AND ${cases.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// Pets-table jurisdiction guard for govt scope (scope-security review
// 2026-07-04 Part A2). The payload's pet_jurisdiction_* fields are a snapshot
// taken at event time; when a pet moves (or seed data drifts) they diverge
// from the pet's CURRENT pets.jurisdiction_*, and a payload-only scope counts
// out-of-jurisdiction pets into govt aggregates. This guard requires the pet's
// current jurisdiction to be in scope too, via an EXISTS subquery so callers
// that don't join pets stay join-free. Admin (global scope, including the
// province drill-down) keeps its existing payload-based behavior — the guard
// applies ONLY to the govt branch.
function petsCurrentJurisdictionGuard(ctx: ProjectionContext) {
  if (ctx.scope.kind !== "jurisdictions") return null;
  const scope = petsScopeClause(ctx);
  if (!scope) return null;
  return sql`EXISTS (SELECT 1 FROM ${pets} WHERE ${pets.id} = ${petEvents.petId} AND (${scope}))`;
}

// Scope clause for welfare_reports rows.
function welfareReportsScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") {
    // Admin province drill-down: narrow to the selected province/locality.
    if (!ctx.adminProvince) return null;
    if (ctx.adminLocality) {
      return and(
        eq(welfareReports.jurisdictionProvince, ctx.adminProvince),
        eq(welfareReports.jurisdictionLocality, ctx.adminLocality),
      );
    }
    return eq(welfareReports.jurisdictionProvince, ctx.adminProvince);
  }
  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${welfareReports.jurisdictionProvince} = ${j.province} AND ${welfareReports.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// ---------------------------------------------------------------------------
// KPI 1 — Rabies vaccination coverage
// ---------------------------------------------------------------------------

/**
 * Canonical es-AR label for this KPI — DOGS ONLY, trailing 12 months.
 *
 * DISAMBIGUATION (critique-govt-2026-07-03.md, "Same metric, different
 * numbers" — 42% here vs 54% under the same old label elsewhere): this KPI is
 * DISTINCT from RABIES_VACCINATION_RATE_LABEL_ES (lib/analytics/govt-dashboards.ts),
 * which counts ALL species with no time window. Full numerator/denominator
 * breakdown of both lives in lib/metrics/kpi-catalog.ts
 * (rabies_coverage_dogs_12m vs rabies_vaccination_rate_all_species).
 *
 * FOLLOW-UP (render-site, out of this module's lane): app/gob/page.tsx and
 * src/modules/panorama/application/get-panorama-kpis.ts currently render this
 * KPI's label as a JSX/object literal, not by importing this constant — a
 * later pass should have them import RABIES_COVERAGE_LABEL_ES instead of
 * repeating the string.
 */
export const RABIES_COVERAGE_LABEL_ES = "Cobertura antirrábica — perros (12 meses)";

export type RabiesCoverageKpi = {
  /** % of dogs in scope with ≥1 rabies vaccination event in the last 12 months. */
  current: number;
  /** Public-health target from TARGETS.RABIES_COVERAGE_PCT. */
  target: number;
  /** Number of distinct localities in scope with ≥1 dog. */
  partidos: number;
  /** True when the scope contains ≥1 dog; false means "no population yet". */
  hasData: boolean;
};

/**
 * KPI: rabies_coverage_dogs_12m (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT DISTINCT dogs with ≥1 vaccination_administered event
 *              whose vaccine_name matches /(antirr[áa]bica|rabies)/i (accent-
 *              aware, amendment-overlay-aware), occurred_at in the trailing
 *              12 months ending at ctx.period.until.
 * DENOMINATOR: COUNT active/lost dogs (pets.species = 'dog') in scope.
 * SOURCE:      pets, pet_events (vaccination_administered).
 * CADENCE:     FIXED trailing 12 months ending at ctx.period.until — the window
 *              is INTRINSIC to the metric (annual rabies vaccination, Ley 22.953),
 *              NOT the caller's display period. See the since12m note below.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchRabiesCoverage(ctx: ProjectionContext): Promise<RabiesCoverageKpi> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { current: 0, target: TARGETS.RABIES_COVERAGE_PCT, partidos: 0, hasData: false };
  }

  // The numerator window is a FIXED 12 months ending at ctx.period.until, NOT
  // ctx.period.since. Rabies coverage is definitionally "share of dogs with a
  // valid (annual) rabies vaccine" — the 12-month window is intrinsic to the
  // metric (Ley 22.953), not a display choice. Before this, the numerator used
  // ctx.period.since, so a caller with a shorter display window (e.g. the
  // Panorama console's 90-day "cumplimiento" preset) computed coverage over 90
  // days — yielding 11% under the SAME "(perros, 12m)" label the /gob Panel
  // rendered as 42% over a true trailing-12m window (val-2-govt B1). Anchoring
  // to `until` keeps the metric period-aware for the time-scrubber's as-of view
  // and the period-over-period delta (prior window ends at period.since) while
  // guaranteeing every surface computes the SAME 12-month coverage.
  const coverageUntil = ctx.period.until;
  const since12m = new Date(coverageUntil.getTime() - 365 * DAY_MS);

  const eventsScope = petEventsScopeClause(ctx);
  const dogsCondition = dogsInScopeCondition(ctx);

  // Distinct dogs with a rabies vaccination event in scope, last 12 months.
  // vaccination_administered payload carries `vaccine_name`. Match the SAME
  // accent-aware regex the surveillance module uses
  // (~* '(antirr[áa]bica|rabies)'), NOT ILIKE '%rabi%': ILIKE is
  // accent-SENSITIVE, so it silently MISSED the canonical form name
  // "Antirrábica" (the accented á breaks the 'rabi' substring) and
  // undercounted coverage to ~zero. Keeping the same regex as
  // surveillance-repository.ts keeps "is a rabies vaccine" consistent.
  // vaccine_name reads through the amendment overlay (amendedPayloadText) so a
  // corrected vaccine counts with its CURRENT name, not the as-typed one
  // (projection-cron audit 2026-07-03 A2).
  const rabiesVaccConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    sql`(${amendedPayloadText("vaccine_name")}) ~* ${RABIES_VACCINE_NAME_REGEX}`,
    gte(petEvents.occurredAt, since12m),
    lte(petEvents.occurredAt, coverageUntil),
  ];
  if (eventsScope) rabiesVaccConditions.push(sql`(${eventsScope})`);
  // Scope to dogs only by joining pets.
  if (ctx.scope.kind === "jurisdictions") {
    const pairs = ctx.scope.jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    rabiesVaccConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }
  rabiesVaccConditions.push(sql`${pets.species} = ${"dog"}`);

  // Partidos: distinct localities with ≥1 dog in scope.
  const [dogsRows, vaccDogRows, partidosRows] = await Promise.all([
    db.select({ n: count() }).from(pets).where(dogsCondition),

    // Distinct dog petIds with a qualifying rabies vax event (join pets to filter species).
    db
      .select({ n: countDistinct(petEvents.petId) })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...rabiesVaccConditions)),

    db
      .select({ n: countDistinct(pets.jurisdictionLocality) })
      .from(pets)
      .where(dogsCondition),
  ]);

  const totalDogs = dogsRows[0]?.n ?? 0;
  const vaccinatedDogs = vaccDogRows[0]?.n ?? 0;
  const current = totalDogs === 0 ? 0 : Math.round((vaccinatedDogs / totalDogs) * 100);

  return {
    current,
    target: TARGETS.RABIES_COVERAGE_PCT,
    partidos: partidosRows[0]?.n ?? 0,
    hasData: totalDogs > 0,
  };
}

// ---------------------------------------------------------------------------
// KPI 1b — Rabies vaccination coverage, per province
// ---------------------------------------------------------------------------

export type RabiesCoverageByProvinceRow = {
  /** Province name as stored in pets.jurisdiction_province. */
  province: string;
  /** Coverage rate as a percentage (0–100): vaccinated dogs / total dogs * 100, rounded. */
  ratePct: number;
  /** Count of distinct vaccinated dogs in the province (numerator). */
  vaccinated: number;
  /** Total dogs in scope in the province (denominator). */
  total: number;
};

/**
 * Per-province rabies vaccination coverage.
 *
 * Mirrors `fetchRabiesCoverage` EXACTLY — same dogsCondition (species='dog' +
 * scope), same rabiesVaccConditions (regex-based accent-aware match), same 12m
 * window — but groups by `pets.jurisdiction_province` instead of aggregating
 * into a single national figure.
 *
 * Used by the Panorama choropleth to guarantee per-province rates are computed
 * with the same dogs-based denominator as the national KPI that the map links to.
 *
 * ratePct = total > 0 ? round(vaccinated / total * 100) : 0.
 */
/**
 * KPI: per-province breakdown of rabies_coverage_dogs_12m (see kpi-catalog.ts).
 * Same numerator/denominator/source/cadence as fetchRabiesCoverage, grouped by
 * pets.jurisdiction_province instead of aggregated nationally. SUPPRESSION: none.
 */
export async function fetchRabiesCoverageByProvince(
  ctx: ProjectionContext,
): Promise<RabiesCoverageByProvinceRow[]> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return [];
  }

  // FIXED trailing-12m window ending at ctx.period.until — SAME anchoring as
  // fetchRabiesCoverage (the metric's 12-month window is intrinsic, not the
  // display period), so the choropleth per-province rates never diverge from
  // the national KPI tile under a shorter display window (val-2-govt B1).
  const coverageUntil = ctx.period.until;
  const since12m = new Date(coverageUntil.getTime() - 365 * DAY_MS);

  const eventsScope = petEventsScopeClause(ctx);
  const dogsCondition = dogsInScopeCondition(ctx);

  // Rabies vaccination event conditions — SAME as fetchRabiesCoverage (regex,
  // not ILIKE, to match the accented canonical form "Antirrábica"; amendment
  // overlay via amendedPayloadText, audit A2).
  const rabiesVaccConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    sql`(${amendedPayloadText("vaccine_name")}) ~* ${RABIES_VACCINE_NAME_REGEX}`,
    gte(petEvents.occurredAt, since12m),
    lte(petEvents.occurredAt, coverageUntil),
  ];
  if (eventsScope) rabiesVaccConditions.push(sql`(${eventsScope})`);
  if (ctx.scope.kind === "jurisdictions") {
    const pairs = ctx.scope.jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    rabiesVaccConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }
  rabiesVaccConditions.push(sql`${pets.species} = ${"dog"}`);

  // Per-province total dogs (same dogsCondition as the national KPI).
  const totalByProvince = await db
    .select({
      province: pets.jurisdictionProvince,
      n: count(),
    })
    .from(pets)
    .where(and(dogsCondition, sql`${pets.jurisdictionProvince} IS NOT NULL`))
    .groupBy(pets.jurisdictionProvince);

  // Per-province vaccinated dogs: distinct dog petIds with a qualifying rabies
  // vax event, grouped by the pet's province.
  const vaccinatedByProvince = await db
    .select({
      province: pets.jurisdictionProvince,
      n: countDistinct(petEvents.petId),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...rabiesVaccConditions, sql`${pets.jurisdictionProvince} IS NOT NULL`))
    .groupBy(pets.jurisdictionProvince);

  // Merge totals and vaccinated counts into per-province rows.
  const vaccinatedMap = new Map<string, number>(
    vaccinatedByProvince
      .filter((r): r is typeof r & { province: string } => r.province !== null)
      .map((r) => [r.province, r.n]),
  );

  return totalByProvince
    .filter((r): r is typeof r & { province: string } => r.province !== null)
    .map((r) => {
      const vaccinated = vaccinatedMap.get(r.province) ?? 0;
      const total = r.n;
      return {
        province: r.province,
        ratePct: total > 0 ? Math.round((vaccinated / total) * 100) : 0,
        vaccinated,
        total,
      };
    });
}

// ---------------------------------------------------------------------------
// KPI 2 — Sterilization metrics
// ---------------------------------------------------------------------------

export type SterilizationKpi = {
  /** sterilization_performed events in scope in the last 30 days. */
  count: number;
  /**
   * % change vs the prior 30-day window.
   * 0 when there were no sterilizations in the prior window (avoids Infinity).
   */
  deltaPct: number;
  /** Distinct author organizations for the current 30-day window. */
  orgs: number;
};

/**
 * KPI: sterilizations_per_month (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT sterilization_performed events in the trailing 30 days.
 * DENOMINATOR: n/a — flow count, not a ratio (prior-30d count is used only to
 *              compute deltaPct, not as a KPI denominator).
 * SOURCE:      pet_events (sterilization_performed).
 * CADENCE:     trailing 30 days vs prior 30 days.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchSterilizationMetrics(ctx: ProjectionContext): Promise<SterilizationKpi> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { count: 0, deltaPct: 0, orgs: 0 };
  }

  // ctx.period covers the last 30d window; compute the prior 30d window from until.
  const since30d = ctx.period.since;
  const since60d = new Date(ctx.period.until.getTime() - 60 * DAY_MS);

  const scope = petEventsScopeClause(ctx);

  const baseConditions = [eq(petEvents.eventType, "sterilization_performed")];
  if (scope) baseConditions.push(sql`(${scope})`);
  // Payload jurisdiction is an event-time snapshot — also require the pet's
  // CURRENT jurisdiction in scope (scope-security review 2026-07-04 A2).
  const petsGuard = petsCurrentJurisdictionGuard(ctx);
  if (petsGuard) baseConditions.push(petsGuard);

  const currentConditions = [...baseConditions, gte(petEvents.occurredAt, since30d)];
  const prevConditions = [
    ...baseConditions,
    gte(petEvents.occurredAt, since60d),
    lt(petEvents.occurredAt, since30d),
  ];

  const [currentRows, prevRows, orgsRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...currentConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...prevConditions)),
    db
      .select({ n: countDistinct(petEvents.authorOrganizationId) })
      .from(petEvents)
      .where(and(...currentConditions)),
  ]);

  const currentCount = currentRows[0]?.n ?? 0;
  const prevCount = prevRows[0]?.n ?? 0;
  // Use the centralized computeDeltaPct which rounds to one decimal and guards /0.
  // Re-imported inline to avoid circular dep — TARGETS is already imported from lib/metrics.
  const deltaPct =
    prevCount === 0 ? 0 : Math.round(((currentCount - prevCount) / prevCount) * 1000) / 10;

  return {
    count: currentCount,
    deltaPct,
    orgs: orgsRows[0]?.n ?? 0,
  };
}

// ---------------------------------------------------------------------------
// KPI 3 — Bites per 10k population
// ---------------------------------------------------------------------------

export type BitesPer10kKpi = {
  /** Bite reports / (estimatedPopulation / 10_000), 1 decimal. */
  rate: number;
  /** rate minus the prior 12-month rate, 1 decimal. */
  delta: number;
  /** Raw count of incident_reported bite events in the last 12 months. */
  reports: number;
};

/**
 * Fetch the census-based population for the given jurisdictions.
 *
 * For admin (universal) scope: sum ALL rows in jurisdictions_census.
 * For scoped govt views: sum only the provinces present in the viewer's
 *   jurisdictions list (deduplicated — multiple localities in the same
 *   province count only once).
 *
 * Falls back to 0 when the table is empty or a province has no census row;
 * callers must guard against division by zero before using the result.
 */
async function fetchCensusPopulation(ctx: ProjectionContext): Promise<number> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) return 0;

  if (ctx.scope.kind === "global") {
    if (ctx.adminProvince) {
      // Admin province drill-down: use the selected province's census population
      // as the denominator (same approach as the scoped govt path below).
      const rows = await db
        .select({ total: sum(jurisdictionsCensus.population) })
        .from(jurisdictionsCensus)
        .where(eq(jurisdictionsCensus.provinceName, ctx.adminProvince));
      return Number(rows[0]?.total ?? 0);
    }
    // National total for unrestricted admin.
    const rows = await db
      .select({ total: sum(jurisdictionsCensus.population) })
      .from(jurisdictionsCensus);
    return Number(rows[0]?.total ?? 0);
  }

  // Scoped: deduplicate to unique province names, then sum those rows.
  const uniqueProvinces = [...new Set(ctx.scope.jurisdictions.map((j) => j.province))];
  if (uniqueProvinces.length === 0) return 0;

  const rows = await db
    .select({ total: sum(jurisdictionsCensus.population) })
    .from(jurisdictionsCensus)
    .where(inArray(jurisdictionsCensus.provinceName, uniqueProvinces));

  return Number(rows[0]?.total ?? 0);
}

/**
 * KPI: bites_per_10k (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT incident_reported events where payload.incident_type =
 *              'bite_inflicted', occurred_at in the trailing 12 months.
 * DENOMINATOR: jurisdictions_census.population (summed over scope) / 10,000.
 * SOURCE:      pet_events (incident_reported), jurisdictions_census.
 * CADENCE:     trailing 12 months vs prior 12 months.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchBitesPer10k(ctx: ProjectionContext): Promise<BitesPer10kKpi> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { rate: 0, delta: 0, reports: 0 };
  }

  const since12m = ctx.period.since;
  // Prior 12m window: go back another 12m from the start of the current window.
  const since24m = new Date(ctx.period.since.getTime() - 365 * DAY_MS);

  const scope = petEventsScopeClause(ctx);

  const baseConditions = [
    eq(petEvents.eventType, "incident_reported"),
    sql`(${petEvents.payload}->>'incident_type') = ${"bite_inflicted"}`,
  ];
  if (scope) baseConditions.push(sql`(${scope})`);
  // Payload jurisdiction is an event-time snapshot — also require the pet's
  // CURRENT jurisdiction in scope (scope-security review 2026-07-04 A2).
  const petsGuard = petsCurrentJurisdictionGuard(ctx);
  if (petsGuard) baseConditions.push(petsGuard);

  const currentConditions = [...baseConditions, gte(petEvents.occurredAt, since12m)];
  const prevConditions = [
    ...baseConditions,
    gte(petEvents.occurredAt, since24m),
    lt(petEvents.occurredAt, since12m),
  ];

  const [currentRows, prevRows, population] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...currentConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...prevConditions)),
    fetchCensusPopulation(ctx),
  ]);

  const reports = currentRows[0]?.n ?? 0;
  const prevReports = prevRows[0]?.n ?? 0;

  // Guard: if no census row exists for this jurisdiction, rate is 0 rather than
  // throwing a division-by-zero. This keeps the KPI card functional even before
  // the census table is fully seeded in a new environment.
  const rate = population === 0 ? 0 : Math.round((reports / (population / 10_000)) * 10) / 10;
  const prevRate =
    population === 0 ? 0 : Math.round((prevReports / (population / 10_000)) * 10) / 10;
  const delta = Math.round((rate - prevRate) * 10) / 10;

  return { rate, delta, reports };
}

// ---------------------------------------------------------------------------
// KPI 4 — Active zoonosis
// ---------------------------------------------------------------------------

export type ActiveZoonosisKpi = {
  /** Total active zoonosis signals: open bite_incident cases + active rabies observations. */
  count: number;
  /** Pets with an active rabies observation (rabies_observation_status='in_progress'). */
  rabies: number;
  /**
   * Leptospirosis cases — disease_reported events with disease='lepto'
   * in the last 30 days, scoped to the actor's jurisdiction(s).
   * Handoff P4-3.
   */
  lepto: number;
  /**
   * Hidatidosis cases — disease_reported events with disease='hidatidosis'
   * in the last 30 days, scoped to the actor's jurisdiction(s).
   * Handoff P4-3.
   */
  hidat: number;
  /**
   * Net change in opens vs the prior 7-day window (this week opens minus last
   * week opens for rabies_observation_started + open bite_incident cases).
   */
  deltaWeek: number;
};

/**
 * KPI: active_zoonosis_signals (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT DISTINCT pets with an active rabies observation
 *              (rabies_observation_status='in_progress') OR an open
 *              bite_incident case — deduplicated via UNION, not summed — PLUS
 *              COUNT disease_reported events (payload.disease='lepto', 30d)
 *              PLUS COUNT disease_reported events (payload.disease='hidatidosis', 30d).
 * DENOMINATOR: n/a — absolute count.
 * SOURCE:      pets, cases, pet_events (disease_reported, rabies_observation_started).
 * CADENCE:     rabies/bite components are a "now" snapshot; lepto/hidat are
 *              trailing 30 days.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchActiveZoonosis(ctx: ProjectionContext): Promise<ActiveZoonosisKpi> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { count: 0, rabies: 0, lepto: 0, hidat: 0, deltaWeek: 0 };
  }

  const now = ctx.period.until.getTime();
  const since7d = new Date(now - 7 * DAY_MS);
  const since14d = new Date(now - 14 * DAY_MS);
  const since30d = new Date(now - 30 * DAY_MS);

  const petsScope = petsScopeClause(ctx);
  const eventsScope = petEventsScopeClause(ctx);
  const casesScope = casesScopeClause(ctx);

  // Disease reports (handoff P4-3) — scoped + last 30 days, split by
  // the payload.disease discriminator. The disease_reported arms carry no pets
  // join (unlike the rabies/bite arms, which scope on pets/cases columns), so
  // they need the pets-table guard against payload-jurisdiction drift
  // (scope-security review 2026-07-04 A2).
  const petsGuard = petsCurrentJurisdictionGuard(ctx);

  const leptoConditions = [
    eq(petEvents.eventType, "disease_reported"),
    sql`(${petEvents.payload}->>'disease') = ${"lepto"}`,
    gte(petEvents.occurredAt, since30d),
  ];
  if (eventsScope) leptoConditions.push(sql`(${eventsScope})`);
  if (petsGuard) leptoConditions.push(petsGuard);

  const hidatConditions = [
    eq(petEvents.eventType, "disease_reported"),
    sql`(${petEvents.payload}->>'disease') = ${"hidatidosis"}`,
    gte(petEvents.occurredAt, since30d),
  ];
  if (eventsScope) hidatConditions.push(sql`(${eventsScope})`);
  if (petsGuard) hidatConditions.push(petsGuard);

  // 1. Pets with active rabies observation (status column on pets table).
  //    Returned separately for the sub-label in the KPI tile ("X rabia").
  const rabiesConditions = [sql`${pets.rabiesObservationStatus} = ${"in_progress"}`];
  if (petsScope) rabiesConditions.push(sql`(${petsScope})`);

  // 2. Deduplicated rabies+bite count: distinct pets that have EITHER an active
  //    rabies observation OR an open bite_incident case.
  //
  //    Math.max(rabies, biteCases) was incorrect: it assumed the two sets were
  //    fully nested, but a pet can appear in only one of them (e.g. a bite case
  //    opened before the vet triggers a rabies observation, or an obs still
  //    in_progress after the case closed). The correct dedup is a UNION of pet IDs
  //    from both sources followed by COUNT DISTINCT.
  //
  //    casesScope and petsScope are built with different column references
  //    (cases.jurisdiction* vs pets.jurisdiction*) — we build each WHERE arm
  //    separately and UNION the pet IDs before counting.
  const rabiesWhereFragments: ReturnType<typeof sql>[] = [
    sql`${pets.rabiesObservationStatus} = ${"in_progress"}`,
  ];
  if (petsScope) rabiesWhereFragments.push(sql`(${petsScope})`);
  const rabiesWhere = sql.join(rabiesWhereFragments, sql` AND `);

  // Build the bite-case WHERE fragment manually so we can embed it in raw SQL.
  const biteWhereFragments: ReturnType<typeof sql>[] = [
    sql`${cases.caseKind} = ${"bite_incident"}`,
    sql`${cases.status} = ${"open"}`,
  ];
  if (casesScope) biteWhereFragments.push(sql`(${casesScope})`);
  const biteWhere = sql.join(biteWhereFragments, sql` AND `);

  // 3. This week: rabies_observation_started events in scope.
  const startedThisWeekConditions = [
    eq(petEvents.eventType, "rabies_observation_started"),
    gte(petEvents.occurredAt, since7d),
  ];
  if (eventsScope) startedThisWeekConditions.push(sql`(${eventsScope})`);

  // 4. Last week: rabies_observation_started events in the 7d window before that.
  const startedLastWeekConditions = [
    eq(petEvents.eventType, "rabies_observation_started"),
    gte(petEvents.occurredAt, since14d),
    lt(petEvents.occurredAt, since7d),
  ];
  if (eventsScope) startedLastWeekConditions.push(sql`(${eventsScope})`);

  const [rabiesRows, deduplicatedBiteRabiesRows, thisWeekRows, lastWeekRows, leptoRows, hidatRows] =
    await Promise.all([
      db
        .select({ n: count() })
        .from(pets)
        .where(and(...rabiesConditions)),
      // Distinct pets in EITHER active-obs OR open-bite-case state.
      db.execute<{ n: string }>(sql`
        SELECT COUNT(DISTINCT pet_id)::text AS n FROM (
          SELECT id AS pet_id FROM pets WHERE ${rabiesWhere}
          UNION
          SELECT primary_pet_id AS pet_id FROM cases WHERE ${biteWhere} AND primary_pet_id IS NOT NULL
        ) combined
      `),
      db
        .select({ n: count() })
        .from(petEvents)
        .where(and(...startedThisWeekConditions)),
      db
        .select({ n: count() })
        .from(petEvents)
        .where(and(...startedLastWeekConditions)),
      db
        .select({ n: count() })
        .from(petEvents)
        .where(and(...leptoConditions)),
      db
        .select({ n: count() })
        .from(petEvents)
        .where(and(...hidatConditions)),
    ]);

  const rabies = rabiesRows[0]?.n ?? 0;
  const deduplicatedBiteRabies = Number(deduplicatedBiteRabiesRows[0]?.n ?? 0);
  const lepto = leptoRows[0]?.n ?? 0;
  const hidat = hidatRows[0]?.n ?? 0;
  // Total = deduplicated active-rabies-or-bite-case pets + disease report counts.
  const total = deduplicatedBiteRabies + lepto + hidat;

  const thisWeek = thisWeekRows[0]?.n ?? 0;
  const lastWeek = lastWeekRows[0]?.n ?? 0;
  const deltaWeek = thisWeek - lastWeek;

  return {
    count: total,
    rabies,
    lepto,
    hidat,
    deltaWeek,
  };
}

// ---------------------------------------------------------------------------
// KPI 5 — Open welfare reports (Denuncias ciudadanas)
// ---------------------------------------------------------------------------

// Statuses considered "terminal" — excluded from the active count. Sourced from
// the welfare domain's single TERMINAL_STATUSES (closed | invalid | duplicate) so
// spam/invalid denuncias do NOT inflate the "open denuncias" KPI. Before C4 this
// local copy omitted 'invalid', over-counting invalid reports as active.

export type OpenWelfareReportsKpi = {
  /** Count of welfare reports with a non-terminal status in scope. */
  count: number;
};

/**
 * Returns the count of active (non-terminal) welfare reports for the viewer's
 * jurisdiction. Mirrors the scope pattern used by fetchWelfareMetrics in
 * lib/govt-dashboards.ts.
 */
/**
 * KPI: open_welfare_reports (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT welfare_reports rows where status NOT IN ('closed', 'invalid', 'duplicate').
 * DENOMINATOR: n/a — absolute count.
 * SOURCE:      welfare_reports.
 * CADENCE:     point-in-time snapshot.
 * SUPPRESSION: none.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchOpenWelfareReportsCount(
  ctx: ProjectionContext,
): Promise<OpenWelfareReportsKpi> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { count: 0 };
  }

  const scope = welfareReportsScopeClause(ctx);

  const conditions = [not(inArray(welfareReports.status, [...WELFARE_TERMINAL_STATUSES]))];
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({ n: count() })
    .from(welfareReports)
    .where(and(...conditions));

  return { count: rows[0]?.n ?? 0 };
}
