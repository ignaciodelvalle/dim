// Read helpers for the /gob regional dashboards (Fase 11).
//
// Surfaces:
//   - Vigilancia: outbreak_signal events filtered to the govt's scope.
//   - Pérdidas:  pets in status='lost' filtered to the govt's scope.
//
// All helpers accept the actor + jurisdictions tuple already produced by
// requireAdminOrGovtOrRedirect — admin sees universal scope (jurisdictions
// is empty by contract for admin), govt sees only rows matching one of their
// active assignments.

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";

import { cases, db, ownerships, petEvents, pets, profiles, welfareReports } from "@/db";
import { findDisease } from "@/lib/diseases";

export type DashboardActor = { role: "admin" | "govt" };

export type DashboardJurisdiction = { province: string; locality: string };

export type SurveillanceFilters = {
  /** Inclusive lower bound for occurredAt. */
  since: Date;
  /** Optional disease_code narrow filter. */
  diseaseCode?: string | null;
};

export type SurveillanceSignal = {
  signalEventId: string;
  petId: string;
  petPublicToken: string;
  petName: string;
  petSpecies: string;
  diseaseCode: string;
  diseaseName: string;
  province: string | null;
  locality: string | null;
  detectedAt: Date;
};

export type DiseaseSummary = {
  diseaseCode: string;
  diseaseName: string;
  count30d: number;
  count7d: number;
  count24h: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Build the scope-match SQL clause on outbreak_signal events. Admin gets no
// scope filter (returns `null` from this helper so the caller can omit the
// clause). Govt gets a disjunction of `(province=X AND locality=Y)` pairs.
function outbreakSignalScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) {
    // Govt with no active assignments — match nothing.
    return sql`false`;
  }
  const pairs = jurisdictions.map(
    (j) => sql`(
      (${petEvents.payload}->>'pet_jurisdiction_province') = ${j.province}
      AND (${petEvents.payload}->>'pet_jurisdiction_locality') = ${j.locality}
    )`,
  );
  return sql.join(pairs, sql` OR `);
}

export async function fetchSurveillanceSignals(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  filters: SurveillanceFilters,
): Promise<SurveillanceSignal[]> {
  const conditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, filters.since),
  ];
  if (filters.diseaseCode) {
    conditions.push(sql`(${petEvents.payload}->>'disease_code') = ${filters.diseaseCode}`);
  }
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      signalEventId: petEvents.id,
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      petSpecies: pets.species,
      diseaseCode: sql<string>`(${petEvents.payload}->>'disease_code')`,
      diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
      province: sql<string | null>`(${petEvents.payload}->>'pet_jurisdiction_province')`,
      locality: sql<string | null>`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
      detectedAt: petEvents.occurredAt,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...conditions))
    .orderBy(desc(petEvents.occurredAt))
    .limit(500);

  return rows.map((r) => ({
    signalEventId: r.signalEventId,
    petId: r.petId,
    petPublicToken: r.petPublicToken,
    petName: r.petName,
    petSpecies: r.petSpecies,
    diseaseCode: r.diseaseCode,
    diseaseName: findDisease(r.diseaseCode)?.label ?? r.diseaseLabel ?? r.diseaseCode,
    province: r.province,
    locality: r.locality,
    detectedAt: r.detectedAt,
  }));
}

// 30-day rollup grouped by disease_code, with sub-counts for the last 7 days
// and 24h. Pulls from the same scoped query as the detail feed so the totals
// match exactly.
export async function fetchDiseaseSummary(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<DiseaseSummary[]> {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const signals = await fetchSurveillanceSignals(actor, jurisdictions, { since: since30 });

  const now = Date.now();
  const byCode = new Map<string, DiseaseSummary>();
  for (const s of signals) {
    const entry = byCode.get(s.diseaseCode) ?? {
      diseaseCode: s.diseaseCode,
      diseaseName: s.diseaseName,
      count30d: 0,
      count7d: 0,
      count24h: 0,
    };
    const age = now - s.detectedAt.getTime();
    entry.count30d += 1;
    if (age <= 7 * DAY_MS) entry.count7d += 1;
    if (age <= DAY_MS) entry.count24h += 1;
    byCode.set(s.diseaseCode, entry);
  }

  return [...byCode.values()].sort((a, b) => b.count30d - a.count30d);
}

export type LostPetRow = {
  petId: string;
  petPublicToken: string;
  petName: string;
  species: string;
  province: string | null;
  locality: string | null;
  markedLostAt: Date | null;
  lastSeenLat: number | null;
  lastSeenLng: number | null;
  ownerDisplayName: string | null;
};

export async function fetchLostPets(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  filters: { since?: Date; species?: string } = {},
): Promise<LostPetRow[]> {
  const conditions = [eq(pets.status, "lost")];
  if (filters.species) conditions.push(eq(pets.species, filters.species));

  // Govt scope filters on the pet's own jurisdiction columns. Pets without a
  // declared jurisdiction are excluded from the govt view (no way to scope-match)
  // but visible to admin.
  if (actor.role === "govt") {
    if (jurisdictions.length === 0) return [];
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const baseRows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      species: pets.species,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(and(...conditions))
    .limit(500);

  if (baseRows.length === 0) return [];

  // Pull the latest status_changed → 'lost' event per pet to get markedLostAt
  // and last-seen coords (from the event row's location_point columns).
  const petIds = baseRows.map((r) => r.petId);
  const lostEvents = await db
    .select({
      petId: petEvents.petId,
      occurredAt: petEvents.occurredAt,
      locationLat: petEvents.locationLat,
      locationLng: petEvents.locationLng,
    })
    .from(petEvents)
    .where(
      and(
        inArray(petEvents.petId, petIds),
        eq(petEvents.eventType, "status_changed"),
        sql`(${petEvents.payload}->>'to_status') = 'lost'`,
      ),
    )
    .orderBy(desc(petEvents.occurredAt));

  const lostMetaByPet = new Map<
    string,
    { occurredAt: Date; locationLat: string | null; locationLng: string | null }
  >();
  for (const e of lostEvents) {
    if (!lostMetaByPet.has(e.petId)) {
      lostMetaByPet.set(e.petId, {
        occurredAt: e.occurredAt,
        locationLat: e.locationLat,
        locationLng: e.locationLng,
      });
    }
  }

  // Resolve the active owner's display name via ownerships → profiles.
  const ownerMap = new Map<string, string>();
  const activeOwnerRows = await db
    .select({
      petId: ownerships.petId,
      ownerUserId: ownerships.ownerUserId,
      displayName: profiles.displayName,
    })
    .from(ownerships)
    .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        inArray(ownerships.petId, petIds),
        isNull(ownerships.endedAt),
        eq(ownerships.role, "owner"),
      ),
    );
  for (const r of activeOwnerRows) ownerMap.set(r.petId, r.displayName);

  const sinceFloor = filters.since?.getTime() ?? null;

  return baseRows
    .map((r): LostPetRow => {
      const meta = lostMetaByPet.get(r.petId);
      return {
        petId: r.petId,
        petPublicToken: r.petPublicToken,
        petName: r.petName,
        species: r.species,
        province: r.province,
        locality: r.locality,
        markedLostAt: meta?.occurredAt ?? null,
        lastSeenLat: meta?.locationLat ? Number(meta.locationLat) : null,
        lastSeenLng: meta?.locationLng ? Number(meta.locationLng) : null,
        ownerDisplayName: ownerMap.get(r.petId) ?? null,
      };
    })
    .filter((r) => (sinceFloor === null ? true : (r.markedLostAt?.getTime() ?? 0) >= sinceFloor))
    .sort((a, b) => (b.markedLostAt?.getTime() ?? 0) - (a.markedLostAt?.getTime() ?? 0));
}

// ============================================================================
// Pérdidas metrics — E3
// ============================================================================

export type PerdidasMetrics = {
  /** Pets in scope currently in status='lost'. */
  activeCount: number;
  /**
   * Pets in scope that transitioned from 'lost' to any other status in the last
   * 30 days. Detected via `status_changed` events where payload `from_status =
   * 'lost'` and `to_status != 'lost'` and the event was recorded within 30d.
   *
   * Payload convention: `{ from_status: string, to_status: string, ... }`
   * Canonical source: lib/event-schemas.ts `statusChanged` + AGENTS.md §Events table.
   */
  recoveredMonth: number;
  /**
   * Average number of days currently-lost pets have been lost (now -
   * markedLostAt). Derived from the occurredAt of the pet's most recent
   * `status_changed` event where `to_status = 'lost'`. Returns 0 if there are
   * no active lost pets in scope.
   */
  avgDaysActive: number;
};

export async function fetchPerdidasMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<PerdidasMetrics> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS);

  // 1. Count active lost pets in scope.
  const activeConditions = [eq(pets.status, "lost")];
  const petsScope = petsScopeClause(actor, jurisdictions);
  if (petsScope) activeConditions.push(sql`(${petsScope})`);

  // 2. Count `status_changed` events where `from_status = 'lost'` within 30d in scope.
  // These events represent pets that were recovered (or had their status changed)
  // away from 'lost'. We scope-match on the pet's own jurisdiction columns, not
  // the event payload, because status_changed events may not carry jurisdiction
  // in their payload (it is present in outbreak_signal but not status_changed).
  const recoveredConditions = [
    eq(petEvents.eventType, "status_changed"),
    sql`(${petEvents.payload}->>'from_status') = 'lost'`,
    sql`(${petEvents.payload}->>'to_status') != 'lost'`,
    gte(petEvents.occurredAt, since30d),
  ];
  // Apply scope by joining to pets.
  if (actor.role === "govt") {
    if (jurisdictions.length === 0) {
      // No assignments — return zeros immediately.
      return { activeCount: 0, recoveredMonth: 0, avgDaysActive: 0 };
    }
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    recoveredConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  // 3. Average days active: average of (now - occurredAt) for the most recent
  // `status_changed → lost` event per pet, for pets currently in status='lost'.
  // We compute this in JS after fetching the per-pet markedLostAt timestamps via
  // fetchLostPets so we reuse the already-correct scoping logic.

  const [activeRows, recoveredRows, lostPets] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...activeConditions)),
    actor.role === "govt"
      ? db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(and(...recoveredConditions))
      : db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...recoveredConditions)),
    fetchLostPets(actor, jurisdictions),
  ]);

  const activeCount = activeRows[0]?.n ?? 0;
  const recoveredMonth = recoveredRows[0]?.n ?? 0;

  // Compute average days from markedLostAt for currently-lost pets.
  const withDate = lostPets.filter((p) => p.markedLostAt !== null);
  const avgDaysActive =
    withDate.length === 0
      ? 0
      : Math.round(
          withDate.reduce(
            (sum, p) => sum + (now - (p.markedLostAt?.getTime() ?? now)) / DAY_MS,
            0,
          ) / withDate.length,
        );

  return { activeCount, recoveredMonth, avgDaysActive };
}

// ============================================================================
// Vigilancia metrics — E2
// ============================================================================

export type VigilanciaMetrics = {
  /** outbreak_signal events in scope with status='open', last 30 days. */
  outbreakActiveCount: number;
  /** cases where caseKind='rabies_observation' AND status='open'. */
  rabiesActiveCount: number;
  /** pets in scope created today (since midnight local time). */
  petsRegisteredToday: number;
  /** pet_events where event_type='vaccination_administered' in scope, last 7 days. */
  vaccinationsThisWeek: number;
};

// Hardcoded province-name → ISO 3166-2:AR code map.
// The cases table stores free-text province names; the GeoJSON uses ISO codes.
// Limitation: only common Argentine provinces are mapped here. Unknown provinces
// return code: "". Extend this map as new jurisdictions are onboarded.
export const PROVINCE_ISO_MAP: Record<string, string> = {
  "Ciudad Autónoma de Buenos Aires": "AR-C",
  "Buenos Aires": "AR-B",
  Córdoba: "AR-X",
  "Santa Fe": "AR-S",
  Mendoza: "AR-M",
  Tucumán: "AR-T",
  "Entre Ríos": "AR-E",
  Salta: "AR-A",
  Misiones: "AR-N",
  Chaco: "AR-H",
  Corrientes: "AR-W",
  Santiago: "AR-G",
  "San Juan": "AR-J",
  "Río Negro": "AR-R",
  Neuquén: "AR-Q",
  Jujuy: "AR-Y",
  Formosa: "AR-P",
  "San Luis": "AR-D",
  Catamarca: "AR-K",
  "La Rioja": "AR-F",
  Chubut: "AR-U",
  "Santa Cruz": "AR-Z",
  "Tierra del Fuego": "AR-V",
  "La Pampa": "AR-L",
};

// Build a scope clause for the `cases` table. Admin: null (no restriction).
// Govt: OR of (jurisdictionProvince=X AND jurisdictionLocality=Y) pairs.
function casesScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${cases.jurisdictionProvince} = ${j.province} AND ${cases.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// Build a scope clause for `pets` based on jurisdiction columns.
function petsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

// Build a scope clause for `pet_events` using the JSONB payload province/locality fields.
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

export async function fetchVigilanciaMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<VigilanciaMetrics> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS);
  const since7d = new Date(now - 7 * DAY_MS);
  // "Today" starts at midnight UTC to match server-side time. If the project
  // later moves to AR timezone, change this to use startOf('day', 'America/Argentina/Buenos_Aires').
  const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  // 1. Count open outbreak_signal events from the last 30 days scoped to user.
  const outbreakConditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, since30d),
  ];
  const outbreakScope = outbreakSignalScopeClause(actor, jurisdictions);
  if (outbreakScope) outbreakConditions.push(sql`(${outbreakScope})`);

  // 2. Count open cases with caseKind='rabies_observation'.
  const rabiesConditions = [eq(cases.caseKind, "rabies_observation"), eq(cases.status, "open")];
  const casesScope = casesScopeClause(actor, jurisdictions);
  if (casesScope) rabiesConditions.push(sql`(${casesScope})`);

  // 3. Count pets created today.
  const petsConditions = [gte(pets.createdAt, todayStart)];
  const petsScope = petsScopeClause(actor, jurisdictions);
  if (petsScope) petsConditions.push(sql`(${petsScope})`);

  // 4. Count vaccination_administered events in the last 7 days.
  const vaccConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    gte(petEvents.occurredAt, since7d),
  ];
  // Vaccination events store jurisdiction in JSONB payload (same shape as outbreak_signal).
  const vaccScope = petEventsScopeClause(actor, jurisdictions);
  if (vaccScope) vaccConditions.push(sql`(${vaccScope})`);

  const [outbreakRows, rabiesRows, petsRows, vaccRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...outbreakConditions)),
    db
      .select({ n: count() })
      .from(cases)
      .where(and(...rabiesConditions)),
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...petsConditions)),
    db
      .select({ n: count() })
      .from(petEvents)
      .where(and(...vaccConditions)),
  ]);

  return {
    outbreakActiveCount: outbreakRows[0]?.n ?? 0,
    rabiesActiveCount: rabiesRows[0]?.n ?? 0,
    petsRegisteredToday: petsRows[0]?.n ?? 0,
    vaccinationsThisWeek: vaccRows[0]?.n ?? 0,
  };
}

// ============================================================================

export type LocalityCaseCount = {
  province: string;
  locality: string;
  /**
   * ISO 3166-2:AR code matching the GeoJSON `code` property if known.
   * Empty string if the province is not in PROVINCE_ISO_MAP.
   */
  code: string;
  count: number;
};

/**
 * Counts of open cases grouped by (province, locality). Used for the
 * <MapChoropleth metric="cases_open"> on /gob/vigilancia.
 *
 * Province code mapping: uses PROVINCE_ISO_MAP (hardcoded). The cases table
 * stores jurisdictionProvince as free-text; the GeoJSON uses ISO 3166-2:AR codes.
 * Cases in provinces not present in the map return code: "".
 */
export async function fetchCasesPerLocality(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<LocalityCaseCount[]> {
  const conditions = [eq(cases.status, "open")];
  const scope = casesScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      province: cases.jurisdictionProvince,
      locality: cases.jurisdictionLocality,
      n: count(),
    })
    .from(cases)
    .where(and(...conditions))
    .groupBy(cases.jurisdictionProvince, cases.jurisdictionLocality);

  return rows
    .filter((r) => r.province !== null)
    .map((r) => ({
      province: r.province as string,
      locality: r.locality ?? "",
      code: PROVINCE_ISO_MAP[r.province as string] ?? "",
      count: r.n,
    }));
}

// ============================================================================

export type ZoonosisTrendPoint = {
  /** Pre-formatted x-axis label, e.g. "ene.", "feb.". Month abbreviation in es-AR locale. */
  x: string;
  /** Count of outbreak_signal events in that month. */
  y: number;
  /** ISO date of the period start (month start), for upstream sorting. */
  periodStart: string;
};

/**
 * Outbreak signal counts grouped by month, last 12 months, within the user's
 * scope. Used for <TimeSeriesChart> on /gob/vigilancia.
 *
 * We use date_trunc('month', occurred_at) to group by calendar month. The
 * pet_events table lacks a dedicated "event_category" column — we match on
 * eventType LIKE 'outbreak_%' by listing all known outbreak_* event types.
 * Currently only 'outbreak_signal' exists; this pattern extends naturally.
 */
export async function fetchZoonosisTrend(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ZoonosisTrendPoint[]> {
  const since12m = new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    sql`${petEvents.eventType} LIKE ${"outbreak_%"}`,
    gte(petEvents.occurredAt, since12m),
  ];
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      month: sql<string>`date_trunc('month', ${petEvents.occurredAt})`,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('month', ${petEvents.occurredAt})`)
    .orderBy(sql`date_trunc('month', ${petEvents.occurredAt})`);

  return rows.map((r) => {
    const d = new Date(r.month);
    return {
      x: d.toLocaleString("es-AR", { month: "short" }),
      y: r.n,
      periodStart: d.toISOString(),
    };
  });
}

// ============================================================================
// Maltrato (welfare_reports) metrics — E4
// ============================================================================

// Build a scope clause for the `welfare_reports` table.
// Admin: null (no restriction). Govt: OR of jurisdiction pair matches.
function welfareReportsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${welfareReports.jurisdictionProvince} = ${j.province} AND ${welfareReports.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

const TERMINAL_STATUSES = ["closed", "invalid", "duplicate"] as const;

export type WelfareMetrics = {
  /** Welfare reports in scope with assigned_to_user_id IS NULL AND status NOT in closed/invalid/duplicate. */
  unassignedCount: number;
  /** Welfare reports in scope assigned to currentUserId, status open|triaged|in_progress. */
  myCount: number;
  /** Welfare reports in scope with status='in_progress'. */
  inProgressCount: number;
  /** Welfare reports in scope closed in the last 30 days. */
  closedMonth: number;
};

export async function fetchWelfareMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  currentUserId: string,
): Promise<WelfareMetrics> {
  const scope = welfareReportsScopeClause(actor, jurisdictions);

  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { unassignedCount: 0, myCount: 0, inProgressCount: 0, closedMonth: 0 };
  }

  const since30d = new Date(Date.now() - 30 * DAY_MS);

  // 1. Unassigned: assigned_to_user_id IS NULL AND status NOT IN terminal.
  const unassignedConditions = [
    isNull(welfareReports.assignedToUserId),
    not(inArray(welfareReports.status, [...TERMINAL_STATUSES])),
  ];
  if (scope) unassignedConditions.push(sql`(${scope})`);

  // 2. Mine: assigned to currentUserId, status in non-terminal active states.
  const myConditions = [
    eq(welfareReports.assignedToUserId, currentUserId),
    not(inArray(welfareReports.status, [...TERMINAL_STATUSES])),
  ];
  if (scope) myConditions.push(sql`(${scope})`);

  // 3. In-progress: status='in_progress'.
  const inProgressConditions = [eq(welfareReports.status, "in_progress")];
  if (scope) inProgressConditions.push(sql`(${scope})`);

  // 4. Closed in last 30 days: status='closed' AND closed_at >= 30d ago.
  const closedMonthConditions = [
    eq(welfareReports.status, "closed"),
    gte(welfareReports.closedAt, since30d),
  ];
  if (scope) closedMonthConditions.push(sql`(${scope})`);

  const [unassignedRows, myRows, inProgressRows, closedMonthRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(welfareReports)
      .where(and(...unassignedConditions)),
    db
      .select({ n: count() })
      .from(welfareReports)
      .where(and(...myConditions)),
    db
      .select({ n: count() })
      .from(welfareReports)
      .where(and(...inProgressConditions)),
    db
      .select({ n: count() })
      .from(welfareReports)
      .where(and(...closedMonthConditions)),
  ]);

  return {
    unassignedCount: unassignedRows[0]?.n ?? 0,
    myCount: myRows[0]?.n ?? 0,
    inProgressCount: inProgressRows[0]?.n ?? 0,
    closedMonth: closedMonthRows[0]?.n ?? 0,
  };
}

// ============================================================================
// Welfare timeline — E4
// ============================================================================

export type TimelineEvent = {
  id: string;
  occurredAt: Date;
  /** e.g. 'created', 'triaged', 'assigned', 'in_progress', 'closed', 'invalid', 'duplicate', 'pet_event' */
  kind: string;
  actorName?: string;
  summary: string;
};

/**
 * Derives a chronological list of timeline events for a welfare report.
 *
 * Sources:
 *  1. Synthetic 'created' event from welfare_reports.created_at.
 *  2. Synthetic 'triaged' event from welfare_reports.triaged_at (if present).
 *  3. Synthetic 'closed' / status event from welfare_reports.closed_at + status.
 *  4. Synthetic 'assigned' event from welfare_reports.assigned_to_user_id (if set).
 *  5. pet_events linked via welfare_reports.case_id → cases → pet_events (optional enrichment).
 *
 * Actor names resolved from profiles in a single batch query.
 */
export async function fetchWelfareTimeline(reportId: string): Promise<TimelineEvent[]> {
  const [report] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, reportId))
    .limit(1);

  if (!report) return [];

  const events: TimelineEvent[] = [];

  // Collect actor IDs to batch-resolve display names.
  const actorIdSet = new Set<string>();
  if (report.reporterUserId) actorIdSet.add(report.reporterUserId);
  if (report.triagedByUserId) actorIdSet.add(report.triagedByUserId);
  if (report.assignedToUserId) actorIdSet.add(report.assignedToUserId);

  // Pull pet_events linked via the case if available.
  let linkedPetEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: Date;
    recordedByUserId: string | null;
  }> = [];
  if (report.caseId) {
    const [linkedCase] = await db
      .select({ primaryPetId: cases.primaryPetId })
      .from(cases)
      .where(eq(cases.id, report.caseId))
      .limit(1);

    if (linkedCase?.primaryPetId) {
      linkedPetEvents = await db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          recordedByUserId: petEvents.recordedByUserId,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, linkedCase.primaryPetId),
            gte(petEvents.occurredAt, report.createdAt),
          ),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(20);

      for (const e of linkedPetEvents) {
        if (e.recordedByUserId) actorIdSet.add(e.recordedByUserId);
      }
    }
  }

  // Batch-resolve actor names.
  const actorIds = [...actorIdSet];
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const nameRows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, actorIds));
    for (const r of nameRows) actorNames.set(r.id, r.displayName);
  }

  // 1. Created event.
  events.push({
    id: `created-${report.id}`,
    occurredAt: report.createdAt,
    kind: "created",
    actorName: report.reporterUserId
      ? (actorNames.get(report.reporterUserId) ?? undefined)
      : undefined,
    summary: "Denuncia registrada en el sistema.",
  });

  // 2. Triaged event.
  if (report.triagedAt) {
    events.push({
      id: `triaged-${report.id}`,
      occurredAt: report.triagedAt,
      kind: "triaged",
      actorName: report.triagedByUserId
        ? (actorNames.get(report.triagedByUserId) ?? undefined)
        : undefined,
      summary: "Denuncia revisada por la autoridad.",
    });
  }

  // 3. Assigned event (synthetic — we know it's assigned but not when; use triagedAt or now).
  if (report.assignedToUserId) {
    const assignedName = actorNames.get(report.assignedToUserId) ?? "un agente";
    events.push({
      id: `assigned-${report.id}`,
      occurredAt: report.triagedAt ?? report.createdAt,
      kind: "assigned",
      actorName: assignedName,
      summary: `Caso asignado a ${assignedName}.`,
    });
  }

  // 4. In-progress / closed / terminal status events.
  if (report.status === "in_progress" && report.triagedAt) {
    events.push({
      id: `in_progress-${report.id}`,
      occurredAt: report.triagedAt,
      kind: "in_progress",
      summary: "Seguimiento activo iniciado.",
    });
  }
  if (report.closedAt) {
    const closedKindLabel =
      report.status === "invalid"
        ? "Cerrada por falta de sustento."
        : report.status === "duplicate"
          ? "Marcada como duplicada."
          : "Denuncia cerrada con resolución.";
    events.push({
      id: `closed-${report.id}`,
      occurredAt: report.closedAt,
      kind: report.status,
      summary: closedKindLabel,
    });
  }

  // 5. Pet events linked via case.
  for (const e of linkedPetEvents) {
    events.push({
      id: `pet-event-${e.id}`,
      occurredAt: e.occurredAt,
      kind: "pet_event",
      actorName: e.recordedByUserId ? (actorNames.get(e.recordedByUserId) ?? undefined) : undefined,
      summary: `Evento de mascota: ${e.eventType.replace(/_/g, " ")}.`,
    });
  }

  // Sort chronologically.
  return events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}
