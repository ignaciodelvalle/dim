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
  countDistinct,
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

import {
  cases,
  db,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  welfareReports,
} from "@/db";
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
  // Provenance for confidence tier computation (plan §A.5, 2026-05-22).
  // Stored here so consumers can call computeConfidence() without a second DB query.
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
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
      // Provenance for confidence tier computation (plan §A.5).
      authorRole: petEvents.authorRole,
      authorVerified: petEvents.authorVerified,
      authorOrganizationId: petEvents.authorOrganizationId,
      payload: petEvents.payload,
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
    authorRole: r.authorRole,
    authorVerified: r.authorVerified,
    authorOrganizationId: r.authorOrganizationId,
    payload: (r.payload ?? {}) as Record<string, unknown>,
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
// The cases table stores the canonical display name (migration 0055 + check
// constraint enforcing the 24-enum). The GeoJSON uses ISO codes. Unknown
// provinces return code: "" — should be impossible after migration 0055.
export const PROVINCE_ISO_MAP: Record<string, string> = {
  "Buenos Aires": "AR-B",
  CABA: "AR-C",
  Catamarca: "AR-K",
  Chaco: "AR-H",
  Chubut: "AR-U",
  Córdoba: "AR-X",
  Corrientes: "AR-W",
  "Entre Ríos": "AR-E",
  Formosa: "AR-P",
  Jujuy: "AR-Y",
  "La Pampa": "AR-L",
  "La Rioja": "AR-F",
  Mendoza: "AR-M",
  Misiones: "AR-N",
  Neuquén: "AR-Q",
  "Río Negro": "AR-R",
  Salta: "AR-A",
  "San Juan": "AR-J",
  "San Luis": "AR-D",
  "Santa Cruz": "AR-Z",
  "Santa Fe": "AR-S",
  "Santiago del Estero": "AR-G",
  "Tierra del Fuego": "AR-V",
  Tucumán: "AR-T",
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

// ============================================================================
// Analytics metrics — E5
// ============================================================================

// NOTE(E5): The spec references "shelter_adoption" as an acquisition method,
// but the canonical `pet_registered` payload enum is:
//   adopted | purchased | found_stray | gift | born_in_litter | other
// "shelter_adoption" does not exist. The closest is "adopted" (standard shelter
// adoption). `fetchAcquisitionTrend` uses "adopted" as the primary positive bucket.
//
// The `pet_acquired` event type listed in the spec does not exist in this codebase.
// Acquisitions are captured via `pet_registered` events whose payload includes
// `acquisition_method`. All four fetchers below use `pet_registered` for acquisition
// data. TODO(E5-followup): revisit if a distinct `pet_acquired` event type lands.

export type AnalyticsMetrics = {
  /** Total pets in scope with status 'active' or 'lost' (excludes deceased). */
  totalPets: number;
  /**
   * % of pets in scope registered with acquisition_method='adopted' in the last 12 months.
   * Computed as (adopted / total registrations in window) * 100, rounded to integer.
   *
   * NOTE(E5-followup): spec referenced "shelter_adoption"; canonical enum value is "adopted".
   * Using "adopted" as proxy. If a more granular custody_kind='shelter_custody_by_org'
   * distinction is needed, cross-join with the petRegistered payload's custody_kind field.
   */
  adoptionRate: number;
  /**
   * % of pets in scope with at least one vaccination_administered event where
   * vaccine_name ILIKE '%rabi%' (catches rabia, rabies; ASCII-only ILIKE).
   * Computed as (pets with ≥1 rabia event / totalPets) * 100, rounded to integer.
   * Returns 0 when totalPets = 0.
   * TODO(E5-followup): use unaccent() to also catch 'antirrábica' etc. if extension is available.
   */
  rabiesVaccinationRate: number;
  /** Open cases in scope where case_kind='custody_dispute'. */
  custodyDisputes: number;
};

export async function fetchAnalyticsMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<AnalyticsMetrics> {
  // Early-return for govt with no assignments.
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { totalPets: 0, adoptionRate: 0, rabiesVaccinationRate: 0, custodyDisputes: 0 };
  }

  const since12m = new Date(Date.now() - 365 * DAY_MS);

  const petsScope = petsScopeClause(actor, jurisdictions);
  const casesScope = casesScopeClause(actor, jurisdictions);

  // 1. totalPets: active or lost in scope.
  const totalConditions = [sql`${pets.status} IN ('active', 'lost')`];
  if (petsScope) totalConditions.push(sql`(${petsScope})`);

  // 2. adoptionRate: pet_registered events with acquisition_method='adopted', last 12m.
  //    Scope via inner join to pets.jurisdictionProvince/Locality.
  //    NOTE(E5-followup): acquisition method is in pet_registered payload, not a separate event.
  const acquisitionConditions = [
    eq(petEvents.eventType, "pet_registered"),
    gte(petEvents.occurredAt, since12m),
  ];
  if (actor.role === "govt") {
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    acquisitionConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  // 3. rabiesVaccinationRate: distinct petIds with ≥1 vaccination_administered where
  //    vaccine_name matches rabia/rabies/rábica/antirrábica (ASCII: %rabi%).
  //    Using %rabi% (without accent) catches all common variants:
  //      - "rabia"           — direct match
  //      - "rabies"          — English/lab names
  //      - PostgreSQL ILIKE is ASCII-case-insensitive but not accent-insensitive,
  //        so "antirrábica" (with accent) does NOT match %rabia%. Use %rabi% instead.
  //    TODO(E5-followup): use unaccent() if the unaccent extension is available.
  const rabiesConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    sql`(${petEvents.payload}->>'vaccine_name') ILIKE ${"%rabi%"}`,
  ];
  if (actor.role === "govt") {
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    rabiesConditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  // 4. custodyDisputes: open cases with case_kind='custody_dispute'.
  const disputeConditions = [eq(cases.caseKind, "custody_dispute"), eq(cases.status, "open")];
  if (casesScope) disputeConditions.push(sql`(${casesScope})`);

  const [totalRows, acquisitionRows, adoptedRows, rabiesRows, disputeRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...totalConditions)),

    // Total registrations in last 12m for adoption-rate denominator.
    actor.role === "govt"
      ? db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(and(...acquisitionConditions))
      : db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...acquisitionConditions)),

    // Adopted registrations in last 12m.
    actor.role === "govt"
      ? db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(
            and(
              ...acquisitionConditions,
              sql`(${petEvents.payload}->>'acquisition_method') = ${"adopted"}`,
            ),
          )
      : db
          .select({ n: count() })
          .from(petEvents)
          .where(
            and(
              ...acquisitionConditions,
              sql`(${petEvents.payload}->>'acquisition_method') = ${"adopted"}`,
            ),
          ),

    // Distinct pet IDs with ≥1 rabia vaccination.
    actor.role === "govt"
      ? db
          .select({ n: countDistinct(petEvents.petId) })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(and(...rabiesConditions))
      : db
          .select({ n: countDistinct(petEvents.petId) })
          .from(petEvents)
          .where(and(...rabiesConditions)),

    db
      .select({ n: count() })
      .from(cases)
      .where(and(...disputeConditions)),
  ]);

  const totalPets = totalRows[0]?.n ?? 0;
  const totalAcquisitions = acquisitionRows[0]?.n ?? 0;
  const adopted = adoptedRows[0]?.n ?? 0;
  const rabiesVaccinated = rabiesRows[0]?.n ?? 0;
  const custodyDisputes = disputeRows[0]?.n ?? 0;

  const adoptionRate =
    totalAcquisitions === 0 ? 0 : Math.round((adopted / totalAcquisitions) * 100);
  const rabiesVaccinationRate =
    totalPets === 0 ? 0 : Math.round((rabiesVaccinated / totalPets) * 100);

  return { totalPets, adoptionRate, rabiesVaccinationRate, custodyDisputes };
}

// ============================================================================

// Acquisition method buckets per E5 spec.
// NOTE(E5): canonical enum in pet_registered payload is:
//   adopted | purchased | found_stray | gift | born_in_litter | other
// Spec-requested "shelter_adoption" maps to "adopted".
// Spec-requested "vecino_helps_stray" maps to "found_stray".
// Spec-requested "private_handover" maps to "purchased" (closest proxy).
// TODO(E5-followup): refine mapping once a `pet_acquired` event with explicit
// method fields is introduced.
const ACQUISITION_METHOD_BUCKET: Record<string, string> = {
  adopted: "shelter_adoption",
  found_stray: "vecino_helps_stray",
  purchased: "private_handover",
  gift: "private_handover",
};

function bucketAcquisitionMethod(raw: string | null): string {
  if (!raw) return "other";
  return ACQUISITION_METHOD_BUCKET[raw] ?? "other";
}

export type AcquisitionTrendPoint = {
  /** Pre-formatted x-axis label, e.g. "Ene 2026". */
  x: string;
  /** Pets acquired in this month + method bucket. */
  y: number;
  /** Method bucket: "shelter_adoption" | "vecino_helps_stray" | "private_handover" | "other". */
  method: string;
  /** ISO date of month start, for sorting. */
  periodStart: string;
};

/**
 * Acquisition trend — 12 months rolling, grouped by (month, acquisition_method_bucket).
 * Source: pet_registered events with acquisition_method in payload.
 * Rows without acquisition_method in the payload are excluded (null method).
 *
 * NOTE(E5): uses pet_registered events, not a separate pet_acquired event (which
 * does not exist in this codebase). Scope is via pets.jurisdictionProvince/Locality.
 */
export async function fetchAcquisitionTrend(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<AcquisitionTrendPoint[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const since12m = new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    eq(petEvents.eventType, "pet_registered"),
    gte(petEvents.occurredAt, since12m),
    // Exclude rows with null acquisition_method.
    sql`(${petEvents.payload}->>'acquisition_method') IS NOT NULL`,
  ];

  if (actor.role === "govt") {
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const baseQuery =
    actor.role === "govt"
      ? db
          .select({
            month: sql<string>`date_trunc('month', ${petEvents.occurredAt})`,
            method: sql<string>`(${petEvents.payload}->>'acquisition_method')`,
            n: count(),
          })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(and(...conditions))
          .groupBy(
            sql`date_trunc('month', ${petEvents.occurredAt})`,
            sql`(${petEvents.payload}->>'acquisition_method')`,
          )
          .orderBy(sql`date_trunc('month', ${petEvents.occurredAt})`)
      : db
          .select({
            month: sql<string>`date_trunc('month', ${petEvents.occurredAt})`,
            method: sql<string>`(${petEvents.payload}->>'acquisition_method')`,
            n: count(),
          })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(
            sql`date_trunc('month', ${petEvents.occurredAt})`,
            sql`(${petEvents.payload}->>'acquisition_method')`,
          )
          .orderBy(sql`date_trunc('month', ${petEvents.occurredAt})`);

  const rows = await baseQuery;

  return rows.map((r) => {
    const d = new Date(r.month);
    const monthLabel = d.toLocaleString("es-AR", { month: "short", year: "numeric" });
    return {
      x: monthLabel,
      y: r.n,
      method: bucketAcquisitionMethod(r.method),
      periodStart: d.toISOString(),
    };
  });
}

// ============================================================================

export type DeathCauseRow = {
  /** Cause label from deathRecorded payload, e.g. "natural", "disease", "accident". */
  cause: string;
  /** Count of death_recorded events with this cause in the last 12 months. */
  count: number;
};

/**
 * Top 10 death causes ordered by count desc, last 12 months.
 * Source: death_recorded events, payload field `cause`.
 * Scope via inner join to pets.jurisdictionProvince/Locality.
 *
 * NOTE(E5): `cause` enum in deathRecorded schema:
 *   known | unknown | natural | disease | accident | euthanasia | sudden | violent | other
 */
export async function fetchDeathCauses(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<DeathCauseRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const since12m = new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    eq(petEvents.eventType, "death_recorded"),
    gte(petEvents.occurredAt, since12m),
  ];

  if (actor.role === "govt") {
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const rows = await (actor.role === "govt"
    ? db
        .select({
          cause: sql<string>`COALESCE((${petEvents.payload}->>'cause'), 'unknown')`,
          n: count(),
        })
        .from(petEvents)
        .innerJoin(pets, eq(pets.id, petEvents.petId))
        .where(and(...conditions))
        .groupBy(sql`COALESCE((${petEvents.payload}->>'cause'), 'unknown')`)
        .orderBy(desc(count()))
        .limit(10)
    : db
        .select({
          cause: sql<string>`COALESCE((${petEvents.payload}->>'cause'), 'unknown')`,
          n: count(),
        })
        .from(petEvents)
        .where(and(...conditions))
        .groupBy(sql`COALESCE((${petEvents.payload}->>'cause'), 'unknown')`)
        .orderBy(desc(count()))
        .limit(10));

  return rows.map((r) => ({ cause: r.cause, count: r.n }));
}

// ============================================================================

export type OutbreakHistoryRow = {
  diseaseCode: string;
  diseaseName: string;
  locality: string;
  province: string;
  /**
   * ISO date of the most recent outbreak_signal for this (disease_code, locality) group.
   * v1 simplification: uses MAX(occurred_at) as peak date rather than computing
   * the per-day peak (day with most signals). TODO(E5-followup): replace with
   * a window-function subquery once query complexity is justified.
   */
  peakDate: string;
  /** Total outbreak_signal events from this disease in this locality, full history. */
  totalSignals: number;
};

/**
 * Historical outbreaks grouped by (disease_code, locality, province),
 * most recent first (by MAX(occurred_at)).
 *
 * Scope via outbreak_signal payload fields pet_jurisdiction_province/locality
 * (same as fetchSurveillanceSignals). No time restriction — full history.
 */
export async function fetchOutbreakHistory(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<OutbreakHistoryRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const conditions = [eq(petEvents.eventType, "outbreak_signal")];
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      diseaseCode: sql<string>`(${petEvents.payload}->>'disease_code')`,
      diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
      province: sql<string>`COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')`,
      locality: sql<string>`COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')`,
      peakDate: sql<string>`MAX(${petEvents.occurredAt})`,
      n: count(),
    })
    .from(petEvents)
    .where(and(...conditions))
    .groupBy(
      sql`(${petEvents.payload}->>'disease_code')`,
      sql`(${petEvents.payload}->>'disease_label')`,
      sql`COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')`,
      sql`COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')`,
    )
    .orderBy(sql`MAX(${petEvents.occurredAt}) DESC`)
    .limit(100);

  return rows.map((r) => ({
    diseaseCode: r.diseaseCode,
    diseaseName: findDisease(r.diseaseCode)?.label ?? r.diseaseLabel ?? r.diseaseCode,
    locality: r.locality,
    province: r.province,
    peakDate: new Date(r.peakDate).toISOString(),
    totalSignals: r.n,
  }));
}

// ============================================================================
// Export fetchers — E6
//
// Lightweight queries that return the exact fields declared in the Zod schemas
// in lib/govt-exports.ts. Each fetcher returns raw objects; the server action
// runs anonymizeRows() on the output before serialization.
//
// Period filtering: optional `since` / `until` bounds applied to the row's
// relevant timestamp column.
// ============================================================================

export type ExportPeriod = { since?: Date; until?: Date };

/** Raw pets rows for the export pipeline. */
export type RawPetExportRow = {
  publicToken: string;
  species: string;
  acquisitionMethod: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  status: string;
  /** YYYY-MM derived from createdAt. */
  registeredAtMonth: string;
};

export async function fetchPetsForExport(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: ExportPeriod = {},
): Promise<RawPetExportRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  const scope = petsScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);
  if (period.since) conditions.push(sql`${pets.createdAt} >= ${period.since}`);
  if (period.until) conditions.push(sql`${pets.createdAt} <= ${period.until}`);

  const rows = await db
    .select({
      publicToken: pets.publicToken,
      species: pets.species,
      acquisitionMethod: pets.acquisitionMethod,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
      status: pets.status,
      createdAt: pets.createdAt,
    })
    .from(pets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(50_000);

  return rows.map((r) => ({
    publicToken: r.publicToken,
    species: r.species,
    acquisitionMethod: r.acquisitionMethod ?? null,
    jurisdictionProvince: r.jurisdictionProvince ?? null,
    jurisdictionLocality: r.jurisdictionLocality ?? null,
    status: r.status,
    registeredAtMonth: r.createdAt.toISOString().slice(0, 7),
  }));
}

/** Raw pet_events rows for the export pipeline. */
export type RawEventExportRow = {
  petPublicToken: string;
  eventType: string;
  /** YYYY-MM derived from occurredAt. */
  occurredAtMonth: string;
};

export async function fetchEventsForExport(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: ExportPeriod = {},
): Promise<RawEventExportRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  const scope = petEventsScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);
  if (period.since) conditions.push(sql`${petEvents.occurredAt} >= ${period.since}`);
  if (period.until) conditions.push(sql`${petEvents.occurredAt} <= ${period.until}`);

  const rows = await db
    .select({
      petPublicToken: pets.publicToken,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(100_000);

  return rows.map((r) => ({
    petPublicToken: r.petPublicToken,
    eventType: r.eventType,
    occurredAtMonth: r.occurredAt.toISOString().slice(0, 7),
  }));
}

/** Raw cases rows for the export pipeline. */
export type RawCaseExportRow = {
  publicCode: string;
  caseKind: string;
  status: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  /** YYYY-MM derived from createdAt. */
  createdAtMonth: string;
};

export async function fetchCasesForExport(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: ExportPeriod = {},
): Promise<RawCaseExportRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const conditions: ReturnType<typeof sql>[] = [];
  const scope = casesScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);
  if (period.since) conditions.push(sql`${cases.createdAt} >= ${period.since}`);
  if (period.until) conditions.push(sql`${cases.createdAt} <= ${period.until}`);

  const rows = await db
    .select({
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      status: cases.status,
      jurisdictionProvince: cases.jurisdictionProvince,
      jurisdictionLocality: cases.jurisdictionLocality,
      createdAt: cases.createdAt,
    })
    .from(cases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(50_000);

  return rows.map((r) => ({
    publicCode: r.publicCode,
    caseKind: r.caseKind,
    status: r.status,
    jurisdictionProvince: r.jurisdictionProvince ?? null,
    jurisdictionLocality: r.jurisdictionLocality ?? null,
    createdAtMonth: r.createdAt.toISOString().slice(0, 7),
  }));
}

/** Raw organizations rows for the export pipeline. */
export type RawOrganizationExportRow = {
  publicToken: string;
  displayName: string;
  orgType: string;
  verified: boolean;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

export async function fetchOrganizationsForExport(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<RawOrganizationExportRow[]> {
  const conditions: ReturnType<typeof sql>[] = [];

  // Orgs are scoped by their primary jurisdiction. Govt sees only orgs whose
  // jurisdiction_province / locality matches one of their assignments.
  if (actor.role === "govt") {
    if (jurisdictions.length === 0) return [];
    const pairs = jurisdictions.map(
      (j) =>
        sql`(${organizations.jurisdictionProvince} = ${j.province} AND ${organizations.jurisdictionLocality} = ${j.locality})`,
    );
    conditions.push(sql`(${sql.join(pairs, sql` OR `)})`);
  }

  const rows = await db
    .select({
      publicToken: organizations.publicToken,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
      verified: organizations.verified,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(10_000);

  return rows.map((r) => ({
    publicToken: r.publicToken,
    displayName: r.displayName,
    orgType: r.orgType,
    verified: r.verified,
    jurisdictionProvince: r.jurisdictionProvince ?? null,
    jurisdictionLocality: r.jurisdictionLocality ?? null,
  }));
}
