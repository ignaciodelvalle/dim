// Real KPI fetchers for the /gob home dashboard (L-followup sprint).
//
// Each fetcher respects the viewer's jurisdiction scope:
//   admin  → universal (no WHERE clause on jurisdiction)
//   govt   → their assigned jurisdiction pairs only
//
// Scope clause pattern mirrors lib/govt-dashboards.ts.

import { and, count, countDistinct, gte, lt, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { cases, db, petEvents, pets } from "@/db";

export type DashboardActor = { role: "admin" | "govt" };
export type DashboardJurisdiction = { province: string; locality: string };

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal scope helpers
// ---------------------------------------------------------------------------

// Scope clause for pets rows (uses pets.jurisdictionProvince/Locality).
function petsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// Scope clause for pet_events rows — uses the JSONB payload fields that
// vaccination_administered and incident_reported events store.
// See: lib/govt-dashboards.ts → petEventsScopeClause (same pattern).
function petEventsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) => sql`(
      (${petEvents.payload}->>'pet_jurisdiction_province') = ${j.province}
      AND (${petEvents.payload}->>'pet_jurisdiction_locality') = ${j.locality}
    )`,
  );
  return sql.join(pairs, sql` OR `);
}

// Scope clause for cases rows (uses cases.jurisdictionProvince/Locality).
function casesScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${cases.jurisdictionProvince} = ${j.province} AND ${cases.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// ---------------------------------------------------------------------------
// KPI 1 — Rabies vaccination coverage
// ---------------------------------------------------------------------------

export type RabiesCoverageKpi = {
  /** % of dogs in scope with ≥1 rabies vaccination event in the last 12 months. */
  current: number;
  /** Hardcoded public-health target. Configurable in a future sprint. */
  target: number;
  /** Number of distinct localities in scope with ≥1 dog. */
  partidos: number;
};

export async function fetchRabiesCoverage(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<RabiesCoverageKpi> {
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { current: 0, target: 80, partidos: 0 };
  }

  const since12m = new Date(Date.now() - 365 * DAY_MS);

  const petsScope = petsScopeClause(actor, jurisdictions);
  const eventsScope = petEventsScopeClause(actor, jurisdictions);

  const dogsConditions = [sql`${pets.species} = ${"dog"}`];
  if (petsScope) dogsConditions.push(sql`(${petsScope})`);

  // Distinct dogs with a rabies vaccination event in scope, last 12 months.
  // vaccination_administered payload carries `vaccine_name`; ILIKE '%rabi%'
  // catches "rabia", "rabies", "antirrábica" (note: without accent — ILIKE is
  // ASCII-case-insensitive only; %rabi% covers the accented variant's prefix).
  const rabiesVaccConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    sql`(${petEvents.payload}->>'vaccine_name') ILIKE ${"%rabi%"}`,
    gte(petEvents.occurredAt, since12m),
  ];
  if (eventsScope) rabiesVaccConditions.push(sql`(${eventsScope})`);
  // Scope to dogs only by joining pets.
  if (actor.role === "govt") {
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    rabiesVaccConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }
  rabiesVaccConditions.push(sql`${pets.species} = ${"dog"}`);

  // Partidos: distinct localities with ≥1 dog in scope.
  const [dogsRows, vaccDogRows, partidosRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...dogsConditions)),

    // Distinct dog petIds with a qualifying rabies vax event (join pets to filter species).
    db
      .select({ n: countDistinct(petEvents.petId) })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .where(and(...rabiesVaccConditions)),

    db
      .select({ n: countDistinct(pets.jurisdictionLocality) })
      .from(pets)
      .where(and(...dogsConditions)),
  ]);

  const totalDogs = dogsRows[0]?.n ?? 0;
  const vaccinatedDogs = vaccDogRows[0]?.n ?? 0;
  const current = totalDogs === 0 ? 0 : Math.round((vaccinatedDogs / totalDogs) * 100);

  return {
    current,
    target: 80,
    partidos: partidosRows[0]?.n ?? 0,
  };
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

export async function fetchSterilizationMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<SterilizationKpi> {
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { count: 0, deltaPct: 0, orgs: 0 };
  }

  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS);
  const since60d = new Date(now - 60 * DAY_MS);

  const scope = petEventsScopeClause(actor, jurisdictions);

  const baseConditions = [eq(petEvents.eventType, "sterilization_performed")];
  if (scope) baseConditions.push(sql`(${scope})`);

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
  const deltaPct = prevCount === 0 ? 0 : Math.round(((currentCount - prevCount) / prevCount) * 100);

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

// v1 population estimate: 3_000_000 for admin / universal scope. For scoped
// govt views, derive a rough estimate from distinct localities * 50_000.
// TODO(L-followup): replace with census data from a jurisdictions table.
const ADMIN_POPULATION_ESTIMATE = 3_000_000;
const LOCALITY_POPULATION_ESTIMATE = 50_000;

export async function fetchBitesPer10k(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<BitesPer10kKpi> {
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { rate: 0, delta: 0, reports: 0 };
  }

  const now = Date.now();
  const since12m = new Date(now - 365 * DAY_MS);
  const since24m = new Date(now - 730 * DAY_MS);

  const scope = petEventsScopeClause(actor, jurisdictions);

  const baseConditions = [
    eq(petEvents.eventType, "incident_reported"),
    sql`(${petEvents.payload}->>'incident_type') = ${"bite_inflicted"}`,
  ];
  if (scope) baseConditions.push(sql`(${scope})`);

  const currentConditions = [...baseConditions, gte(petEvents.occurredAt, since12m)];
  const prevConditions = [
    ...baseConditions,
    gte(petEvents.occurredAt, since24m),
    lt(petEvents.occurredAt, since12m),
  ];

  const [currentRows, prevRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...currentConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...prevConditions)),
  ]);

  const reports = currentRows[0]?.n ?? 0;
  const prevReports = prevRows[0]?.n ?? 0;

  const population =
    actor.role === "admin"
      ? ADMIN_POPULATION_ESTIMATE
      : jurisdictions.length * LOCALITY_POPULATION_ESTIMATE;

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
   * Leptospirosis cases.
   * TODO(L-followup): no dedicated event type or case_kind exists yet. Returns 0
   * until a `lepto_observation_started` event or equivalent is introduced.
   */
  lepto: number;
  /**
   * Hidatidosis cases.
   * TODO(L-followup): no dedicated event type or case_kind exists yet. Returns 0
   * until a `hidat_observation_started` event or equivalent is introduced.
   */
  hidat: number;
  /**
   * Net change in opens vs the prior 7-day window (this week opens minus last
   * week opens for rabies_observation_started + open bite_incident cases).
   */
  deltaWeek: number;
};

export async function fetchActiveZoonosis(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ActiveZoonosisKpi> {
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { count: 0, rabies: 0, lepto: 0, hidat: 0, deltaWeek: 0 };
  }

  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS);
  const since14d = new Date(now - 14 * DAY_MS);

  const petsScope = petsScopeClause(actor, jurisdictions);
  const eventsScope = petEventsScopeClause(actor, jurisdictions);
  const casesScope = casesScopeClause(actor, jurisdictions);

  // 1. Pets with active rabies observation (status column on pets table).
  const rabiesConditions = [sql`${pets.rabiesObservationStatus} = ${"in_progress"}`];
  if (petsScope) rabiesConditions.push(sql`(${petsScope})`);

  // 2. Open bite_incident cases in scope.
  const biteCaseConditions = [eq(cases.caseKind, "bite_incident"), eq(cases.status, "open")];
  if (casesScope) biteCaseConditions.push(sql`(${casesScope})`);

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

  const [rabiesRows, biteCaseRows, thisWeekRows, lastWeekRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...rabiesConditions)),
    db
      .select({ n: count() })
      .from(cases)
      .where(and(...biteCaseConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...startedThisWeekConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...startedLastWeekConditions)),
  ]);

  const rabies = rabiesRows[0]?.n ?? 0;
  // Deduplicate: bite cases include active rabies obs; use the larger of the two
  // as the total (a bite_incident case is opened alongside each rabies obs).
  const biteCases = biteCaseRows[0]?.n ?? 0;
  const total = Math.max(rabies, biteCases);

  const thisWeek = thisWeekRows[0]?.n ?? 0;
  const lastWeek = lastWeekRows[0]?.n ?? 0;
  const deltaWeek = thisWeek - lastWeek;

  return {
    count: total,
    rabies,
    lepto: 0, // TODO(L-followup): no lepto event type exists yet
    hidat: 0, // TODO(L-followup): no hidat event type exists yet
    deltaWeek,
  };
}
