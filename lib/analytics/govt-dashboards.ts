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
  type AnyColumn,
  type SQL,
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
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";

import {
  arLocalities,
  caseEvents,
  cases,
  custodyDisputes,
  db,
  jurisdictionsCensus,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  welfareReports,
} from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import { normalizeBarioCode } from "@/lib/infra/geo-join";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
  jurisdictionPairClause,
  petEventsScopeClause as metricsPetEventsScopeClause,
  petsScopeClause as metricsPetsScopeClause,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { provinceByCode } from "@/lib/reference/ar-provincias";
import { findDisease } from "@/lib/reference/diseases";
import { likeContains } from "@/lib/utils/like-helpers";
import { TERMINAL_STATUSES } from "@/src/modules/welfare/domain/welfare-status-rules";

// Re-export so existing callers that import from this module don't need to change.
export type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

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
  // Govt with no active assignments — match nothing.
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`(${petEvents.payload}->>'pet_jurisdiction_province')`,
      sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
    ) ?? sql`false`
  );
}

// Scope-security review 2026-07-04 (Part A1/A2): the payload's
// pet_jurisdiction_* fields are a snapshot taken at event time. When a pet
// moves (or seed data drifts), the payload and the pet's CURRENT
// pets.jurisdiction_* diverge, and a payload-only scope lets a govt viewer see
// out-of-jurisdiction pets. Govt fetchers must ALSO require the pet's current
// jurisdiction to be inside the viewer's scope. Admin keeps universal scope
// (returns null; the payload-based drill-down behavior is unchanged).
function petsCurrentJurisdictionClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): SQL | null {
  if (actor.role === "admin") return null;
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Same guard as petsCurrentJurisdictionClause, wrapped in an EXISTS subquery
// for pet_events queries that do NOT already join the pets table.
function petsCurrentJurisdictionExists(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): SQL | null {
  const clause = petsCurrentJurisdictionClause(actor, jurisdictions);
  if (!clause) return null;
  return sql`EXISTS (SELECT 1 FROM ${pets} WHERE ${pets.id} = ${petEvents.petId} AND (${clause}))`;
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
  // Rows return pet identifiers (name + public token) — require the pet's
  // CURRENT jurisdiction to be in scope too (pets is inner-joined below).
  const petsScope = petsCurrentJurisdictionClause(actor, jurisdictions);
  if (petsScope) conditions.push(sql`(${petsScope})`);

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

// Pure rollup: groups already-fetched signals by disease_code and computes
// sub-window counts (7d, 24h) in JS. No DB call. The caller is responsible
// for fetching signals with a window >= 30 days so count30d is correct.
export function computeDiseaseSummary(signals: SurveillanceSignal[]): DiseaseSummary[] {
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

// Period rollup grouped by disease_code (default last 30 days), with
// sub-counts for the last 7 days and 24h. Pulls from the same scoped query
// as the detail feed so the totals match exactly. `count30d` holds the
// window total (named for the default; callers may pass a custom `since`).
//
// When the caller already has a 30-day SurveillanceSignal[] in hand, prefer
// calling computeDiseaseSummary(signals) directly to avoid a second DB round-trip.
export async function fetchDiseaseSummary(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: { since?: Date } = {},
): Promise<DiseaseSummary[]> {
  const since = opts.since ?? new Date(Date.now() - 30 * DAY_MS);
  const signals = await fetchSurveillanceSignals(actor, jurisdictions, { since });
  return computeDiseaseSummary(signals);
}

export type LostPetRow = {
  petId: string;
  petPublicToken: string;
  petName: string;
  species: string;
  /** Current pet status. Used to show a status badge when displaying non-lost rows. */
  petStatus: string;
  province: string | null;
  locality: string | null;
  markedLostAt: Date | null;
  lastSeenLat: number | null;
  lastSeenLng: number | null;
  ownerDisplayName: string | null;
};

/** Valid values for the `status` filter. `null` / `undefined` defaults to `'lost'`. */
export const PET_STATUS_VALUES = ["active", "lost", "deceased"] as const;
export type PetStatusFilter = (typeof PET_STATUS_VALUES)[number] | "all";

export async function fetchLostPets(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  filters: {
    since?: Date;
    species?: string;
    status?: PetStatusFilter | null;
    q?: string | null;
  } = {},
): Promise<LostPetRow[]> {
  // Default to 'lost' only — preserves backward-compat for metrics and
  // any other caller that omits the status filter.
  const statusFilter = filters.status ?? "lost";
  const conditions =
    statusFilter === "all"
      ? [sql`${pets.status} IN ('active', 'lost', 'deceased')`]
      : [eq(pets.status, statusFilter)];
  if (filters.species) conditions.push(eq(pets.species, filters.species));

  // Govt scope filters on the pet's own jurisdiction columns. Pets without a
  // declared jurisdiction are excluded from the govt view (no way to scope-match)
  // but visible to admin.
  if (actor.role === "govt") {
    if (jurisdictions.length === 0) return [];
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    // pairs is non-null here because jurisdictions.length > 0 (guarded above).
    if (pairs) conditions.push(sql`(${pairs})`);
  }

  // Push `q` (text search) and `since` (lost-event window) into SQL so the
  // 500-row cap is applied AFTER filtering, not before. Previously the full
  // 500 rows were fetched and then reduced in JS — silently missing matches
  // that fell beyond the cap.
  //
  // `q` matches pets.name OR the active owner's displayName (ilike contains).
  // `since` requires a `status_changed → lost` event with occurredAt >= since.

  if (filters.since) {
    // Restrict to pets where the most recent "became lost" event is >= since.
    // Cast the Date to an ISO string so postgres.js serialises it correctly
    // inside the raw sql`` template (Drizzle operators handle Date natively,
    // but raw template parameters need explicit casting).
    const sinceIso = filters.since.toISOString();
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM pet_events pe_since
        WHERE pe_since.pet_id = ${pets.id}
          AND pe_since.event_type = 'status_changed'
          AND (pe_since.payload->>'to_status') = 'lost'
          AND pe_since.occurred_at >= ${sinceIso}::timestamptz
      )`,
    );
  }

  if (filters.q) {
    const pattern = likeContains(filters.q);
    // Match pet name or active owner's display name.
    // Use sql template for the OR to keep strict TypeScript happy (or() has an
    // undefined return when invoked with zero args; this variant always has two).
    // unaccent() on both column and pattern so "gonzalez" finds "González";
    // likeContains() already escapes % and _ (wildcard injection safe).
    conditions.push(
      sql`(
        unaccent(${pets.name}) ILIKE unaccent(${pattern}) ESCAPE '\'
        OR EXISTS (
          SELECT 1 FROM ownerships o_q
          JOIN profiles pr_q ON pr_q.id = o_q.owner_user_id
          WHERE o_q.pet_id = ${pets.id}
            AND o_q.role = 'owner'
            AND o_q.ended_at IS NULL
            AND unaccent(pr_q.display_name) ILIKE unaccent(${pattern}) ESCAPE '\'
        )
      )`,
    );
  }

  const baseRows = await db
    .select({
      petId: pets.id,
      petPublicToken: pets.publicToken,
      petName: pets.name,
      species: pets.species,
      petStatus: pets.status,
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

  // Both `q` and `since` are now pushed into SQL (see conditions above).
  // Sort by markedLostAt DESC so the most recently lost pets appear first.
  return baseRows
    .map((r): LostPetRow => {
      const meta = lostMetaByPet.get(r.petId);
      return {
        petId: r.petId,
        petPublicToken: r.petPublicToken,
        petName: r.petName,
        species: r.species,
        petStatus: r.petStatus,
        province: r.province,
        locality: r.locality,
        markedLostAt: meta?.occurredAt ?? null,
        lastSeenLat: meta?.locationLat ? Number(meta.locationLat) : null,
        lastSeenLng: meta?.locationLng ? Number(meta.locationLng) : null,
        ownerDisplayName: ownerMap.get(r.petId) ?? null,
      };
    })
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

/**
 * Compute perdidas metrics using a pre-fetched LostPetRow array.
 *
 * `opts.lostPets` — pass ONLY when the array represents the UNFILTERED
 * in-scope lost pets (i.e. no q / since / species / non-default status
 * filters were applied). avgDaysActive is a population metric that must
 * reflect ALL currently-lost pets in scope, not just those matching the
 * current display filters. When any display filter is active, omit opts so
 * fetchPerdidasMetrics calls fetchLostPets() internally without filters,
 * accepting the extra DB round-trip as semantically required.
 *
 * activeCount and recoveredMonth are always computed via independent COUNT
 * queries; they are unaffected by opts.lostPets.
 *
 * KPI: not yet in lib/metrics/kpi-catalog.ts (no cross-surface label
 * ambiguity reported for "Pérdidas activas" — documented here directly).
 *   NUMERATOR (activeCount):    COUNT pets WHERE status = 'lost', in scope.
 *   NUMERATOR (recoveredMonth): COUNT status_changed events where
 *     payload.from_status='lost' AND payload.to_status != 'lost', trailing 30d.
 *   NUMERATOR (avgDaysActive):  average of (now − markedLostAt) over
 *     currently-lost pets, in days.
 *   DENOMINATOR: n/a for all three — absolute counts / an average, not ratios.
 *   SOURCE:      pets, pet_events (status_changed).
 *   CADENCE:     activeCount/avgDaysActive are "now" snapshots; recoveredMonth
 *                is trailing 30 days.
 *   SUPPRESSION: none.
 */
export async function fetchPerdidasMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts?: {
    lostPets?: LostPetRow[];
    /**
     * Admin province drill-down (Panorama). Only set when actor.role === "admin"
     * and a province was selected. Never set from govt page code.
     */
    adminProvince?: string;
    adminLocality?: string;
  },
): Promise<PerdidasMetrics> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS);
  const adminProvince = opts?.adminProvince;
  const adminLocality = opts?.adminLocality;

  // 1. Count active lost pets in scope.
  const activeConditions = [eq(pets.status, "lost")];
  const petsScope = petsScopeClause(actor, jurisdictions);
  if (petsScope) activeConditions.push(sql`(${petsScope})`);
  // Admin province drill-down: append explicit province predicate (same pattern
  // as buildMaltratoListConditions). Govt users must NOT pass adminProvince.
  if (actor.role === "admin" && adminProvince) {
    activeConditions.push(sql`${pets.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) {
      activeConditions.push(sql`${pets.jurisdictionLocality} = ${adminLocality}`);
    }
  }

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
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    // pairs is non-null because jurisdictions.length > 0 (guarded above).
    if (pairs) recoveredConditions.push(sql`(${pairs})`);
  }
  // Admin province drill-down: narrow the recovered count to the province.
  // The pets table join is added below for the admin+province path.
  if (actor.role === "admin" && adminProvince) {
    recoveredConditions.push(sql`${pets.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) {
      recoveredConditions.push(sql`${pets.jurisdictionLocality} = ${adminLocality}`);
    }
  }

  // 3. Average days active: average of (now - occurredAt) for the most recent
  // `status_changed → lost` event per pet, for pets currently in status='lost'.
  // We compute this in JS using the per-pet markedLostAt timestamps from
  // fetchLostPets. If the caller already holds the lostPets array (e.g. /gob/perdidas
  // fetches it in parallel), pass it via opts.lostPets to avoid a redundant DB call.
  // For admin+province, filter the JS array to the province after fetching (the
  // LostPetRow already carries province/locality fields).

  const lostPetsPromise =
    opts?.lostPets !== undefined
      ? Promise.resolve(opts.lostPets)
      : fetchLostPets(actor, jurisdictions);

  // Whether to join the pets table for the recovered-count query.
  // Govt always joins (to apply jurisdiction pairs on pets columns).
  // Admin+province also needs the join to apply the province predicate.
  const needsRecoveredJoin = actor.role === "govt" || (actor.role === "admin" && !!adminProvince);

  const [activeRows, recoveredRows, lostPetsRaw] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...activeConditions)),
    needsRecoveredJoin
      ? db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(pets.id, petEvents.petId))
          .where(and(...recoveredConditions))
      : db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...recoveredConditions)),
    lostPetsPromise,
  ]);

  // For admin+province, narrow the lostPets JS array to the selected province.
  const lostPets =
    actor.role === "admin" && adminProvince
      ? lostPetsRaw.filter(
          (p) => p.province === adminProvince && (!adminLocality || p.locality === adminLocality),
        )
      : lostPetsRaw;

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

// Canonical list of Argentine provinces for /gob/* dashboard pages.
// Admin pages use all 24; govt pages derive a subset from their jurisdictions.
// Keep code/name aligned with PROVINCE_ISO_MAP and ar-provincias.ts.
export const GOB_ALL_PROVINCES: Array<{ code: string; name: string }> = [
  { code: "AR-C", name: "CABA" },
  { code: "AR-B", name: "Buenos Aires" },
  { code: "AR-X", name: "Córdoba" },
  { code: "AR-S", name: "Santa Fe" },
  { code: "AR-M", name: "Mendoza" },
  { code: "AR-T", name: "Tucumán" },
  { code: "AR-E", name: "Entre Ríos" },
  { code: "AR-A", name: "Salta" },
  { code: "AR-N", name: "Misiones" },
  { code: "AR-H", name: "Chaco" },
  { code: "AR-W", name: "Corrientes" },
  { code: "AR-K", name: "Catamarca" },
  { code: "AR-U", name: "Chubut" },
  { code: "AR-P", name: "Formosa" },
  { code: "AR-Y", name: "Jujuy" },
  { code: "AR-L", name: "La Pampa" },
  { code: "AR-F", name: "La Rioja" },
  { code: "AR-Q", name: "Neuquén" },
  { code: "AR-R", name: "Río Negro" },
  { code: "AR-J", name: "San Juan" },
  { code: "AR-D", name: "San Luis" },
  { code: "AR-Z", name: "Santa Cruz" },
  { code: "AR-G", name: "Santiago del Estero" },
  { code: "AR-V", name: "Tierra del Fuego" },
];

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
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${cases.jurisdictionProvince}`,
      sql`${cases.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Build a scope clause for the `custody_disputes` table — the domain aggregate
// that the /gob/disputas queue lists. Admin: null (no restriction). Govt: OR of
// (jurisdictionProvince=X AND jurisdictionLocality=Y) pairs; govt with no
// assignments → sql`false` (matches nothing).
//
// Exported so /gob/disputas builds its queue scope with the IDENTICAL predicate
// the analytics "Disputas de custodia" KPI counts — that shared predicate is
// what guarantees the KPI number reconciles with the queue (count↔queue parity).
export function custodyDisputesScopeClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): SQL | null {
  if (actor.role === "admin") return null;
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${custodyDisputes.jurisdictionProvince}`,
      sql`${custodyDisputes.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Thin adapters for the two scope helpers now canonical in lib/metrics/.
// The period is not relevant for scope-only use — trailing12m is a valid placeholder.
function petsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  return metricsPetsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m()),
  );
}

function petEventsScopeClause(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  return metricsPetEventsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m()),
  );
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

export type SubregionCaseCount = {
  /** Matches `feature.properties.code` in the sub-region GeoJSON:
   *  - Non-CABA: 5-digit INDEC department_code (e.g. "06007")
   *  - CABA: normalized barrio key (NFD-stripped, lowercase, e.g. "agronomia")
   */
  code: string;
  /** Display name of the sub-region (department name or barrio name). */
  name: string;
  /** Count of open cases assigned to this sub-region. */
  count: number;
};

/**
 * Open cases per sub-region within a selected province — the FULL sub-region set.
 *
 * Returns EVERY sub-region of the province (not only those with cases), each with
 * its open-case count (0 when there are none). This lets the caller frame and
 * render the whole province: sub-regions with 0 cases render grey via the
 * choropleth's missing-color branch.
 *
 * Branches on provinceIso:
 *
 * AR-C (CABA): one entry per barrio. `code` is the normalized barrio key (same
 *   normalization as caba-barrios.geojson) so it matches `feature.properties.code`
 *   exactly. The catch-all "Ciudad Autónoma de Buenos Aires" componente row is
 *   excluded. Open CABA cases are counted per barrio (jurisdictionLocality).
 *
 * Non-CABA: one entry per DISTINCT (department_code, department_name) in
 *   ar_localities for the province (removed_at IS NULL). Open-case counting is
 *   fan-out-safe: cases are first aggregated per normalized jurisdictionLocality,
 *   then each locality is mapped to a SINGLE deterministic department (DISTINCT ON
 *   normalized locality_name, ORDER BY department_name LIMIT 1 — same tiebreak as
 *   localityByName), then locality counts are summed into departments. A case in an
 *   ambiguous locality name (one name -> several departments) therefore counts toward
 *   exactly ONE department, never N. Localities with no matching ar_localities row
 *   contribute 0 to the choropleth but are still counted in fetchCasesPerLocality KPIs.
 *
 * Scope is enforced by casesScopeClause (same as all other cases fetchers).
 * Admin always sees all cases; govt sees only their assigned localities.
 */
export async function fetchCasesPerSubregion(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  provinceIso: string,
): Promise<SubregionCaseCount[]> {
  const scope = casesScopeClause(actor, jurisdictions);
  // Govt with no assignments can never see any case.
  if (scope !== null && jurisdictions.length === 0) return [];

  // Barrio slug normalization is the SHARED canonical one (lib/infra/geo-join):
  // one source of truth so the codes computed here match caba-barrios.geojson —
  // and the Panorama locality choropleth fill — at render time. This used to be a
  // local copy; it now delegates to avoid the two drifting apart.
  const normalizeBarrio = normalizeBarioCode;

  if (provinceIso === "AR-C") {
    // CABA: count open cases per barrio, then emit the FULL set of 48 barrios
    // (0-default), excluding the catch-all "Ciudad Autónoma de Buenos Aires".
    const conditions = [eq(cases.status, "open"), eq(cases.jurisdictionProvince, "CABA")];
    if (scope) conditions.push(sql`(${scope})`);

    const [caseRows, barrioRows] = await Promise.all([
      db
        .select({ locality: cases.jurisdictionLocality, n: count() })
        .from(cases)
        .where(and(...conditions))
        .groupBy(cases.jurisdictionLocality),
      db
        .select({ name: arLocalities.localityName })
        .from(arLocalities)
        .where(
          and(
            eq(arLocalities.provinceCode, "AR-C"),
            isNull(arLocalities.removedAt),
            ne(arLocalities.localityName, "Ciudad Autónoma de Buenos Aires"),
          ),
        ),
    ]);

    // Sum open-case counts per normalized barrio key.
    const countByCode = new Map<string, number>();
    for (const r of caseRows) {
      if (!r.locality) continue;
      const code = normalizeBarrio(r.locality);
      countByCode.set(code, (countByCode.get(code) ?? 0) + r.n);
    }

    // Emit one entry per barrio with a 0-default count.
    const byCode = new Map<string, SubregionCaseCount>();
    for (const b of barrioRows) {
      const code = normalizeBarrio(b.name);
      if (byCode.has(code)) continue;
      byCode.set(code, { code, name: b.name, count: countByCode.get(code) ?? 0 });
    }
    return [...byCode.values()];
  }

  // Non-CABA: resolve the canonical province display name (cases store the
  // display name, ar_localities stores the ISO code).
  const province = provinceByCode(provinceIso);
  if (!province) return [];
  const provinceDisplayName = province.name;

  // Locality-name normalization in SQL — accent/case-folded, dots stripped,
  // whitespace collapsed. Mirrors normalizeBarrio() / lib/ar-localidades normalize()
  // so the cases side and the ar_localities side bucket identically.
  function normNameSql(col: AnyColumn): SQL {
    // Note: the regex pattern is "\s+" — the doubled backslash in the TS string
    // literal produces a single backslash in the SQL sent to Postgres.
    return sql`btrim(regexp_replace(lower(translate(unaccent(${col}), '.', '')), '\\s+', ' ', 'g'))`;
  }

  // 1. Full department set: every distinct (code, name) in the province.
  //    Iterating in (code, name) order makes the first name per code deterministic.
  const deptRows = await db
    .select({ code: arLocalities.departmentCode, name: arLocalities.departmentName })
    .from(arLocalities)
    .where(
      and(
        eq(arLocalities.provinceCode, provinceIso),
        isNull(arLocalities.removedAt),
        isNotNull(arLocalities.departmentCode),
      ),
    )
    .orderBy(arLocalities.departmentCode, arLocalities.departmentName);

  const fullSet = new Map<string, SubregionCaseCount>();
  for (const r of deptRows) {
    if (!r.code) continue;
    if (fullSet.has(r.code)) continue; // first name wins (alpha order) = deterministic
    fullSet.set(r.code, { code: r.code, name: r.name ?? r.code, count: 0 });
  }

  // 2. Open-case counts aggregated per normalized jurisdictionLocality (scoped).
  const caseConditions = [
    eq(cases.status, "open"),
    eq(cases.jurisdictionProvince, provinceDisplayName),
  ];
  if (scope) caseConditions.push(sql`(${scope})`);

  const localityKey = normNameSql(cases.jurisdictionLocality);
  const caseRows = await db
    .select({ key: sql<string>`${localityKey}`, n: count() })
    .from(cases)
    .where(and(...caseConditions))
    .groupBy(localityKey);

  // 3. Map each normalized locality name -> a SINGLE deterministic department.
  //    Iterating in (normalized name, department_name) order and keeping the
  //    first row per key picks the alphabetically-first department — the same
  //    tiebreak as localityByName — so an ambiguous name resolves to exactly one.
  const arLocKey = normNameSql(arLocalities.localityName);
  const mapRows = await db
    .select({ key: sql<string>`${arLocKey}`, departmentCode: arLocalities.departmentCode })
    .from(arLocalities)
    .where(
      and(
        eq(arLocalities.provinceCode, provinceIso),
        isNull(arLocalities.removedAt),
        isNotNull(arLocalities.departmentCode),
      ),
    )
    .orderBy(arLocKey, arLocalities.departmentName);

  const deptByLocalityKey = new Map<string, string>();
  for (const r of mapRows) {
    if (!r.departmentCode) continue;
    if (deptByLocalityKey.has(r.key)) continue; // first row wins = deterministic
    deptByLocalityKey.set(r.key, r.departmentCode);
  }

  // 4. Sum each locality's open-case count into its single department.
  for (const r of caseRows) {
    const deptCode = deptByLocalityKey.get(r.key);
    if (!deptCode) continue; // locality has no matching ar_localities row
    const entry = fullSet.get(deptCode);
    if (entry) entry.count += r.n;
  }

  return [...fullSet.values()];
}

// ============================================================================

export type ProvinceCasesPerCapita = {
  province: string;
  /**
   * ISO 3166-2:AR code matching the GeoJSON `code` property if known.
   * Empty string if the province is not in PROVINCE_ISO_MAP.
   */
  code: string;
  /** Raw count of open cases in this province. */
  count: number;
  /**
   * Cases per 10,000 inhabitants (count / population * 10_000), rounded to
   * one decimal. `null` when there is no census row for the province (avoids
   * divide-by-zero; the UI falls back to showing the raw count in that case).
   */
  ratePer10k: number | null;
};

/**
 * Open cases per province with INDEC 2022 per-capita rate.
 *
 * Aggregates open cases by jurisdictionProvince, then LEFT JOINs the
 * jurisdictions_census table (province_name = jurisdiction_province) to
 * compute rate = count / population * 10_000.
 *
 * Join key: cases.jurisdictionProvince (canonical display name, same format
 * as jurisdictionsCensus.provinceName — both enforced by migration 0055
 * canonical check constraint). Match is exact text equality.
 *
 * Fallback: provinces with no census row get ratePer10k = null so callers
 * can display the raw count as a safe fallback.
 */
export async function fetchCasesPerCapita(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ProvinceCasesPerCapita[]> {
  const conditions = [eq(cases.status, "open")];
  const scope = casesScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  // Aggregate by province only (no locality grouping — per-capita is a
  // province-level figure because the census table is province-level).
  // The LEFT JOIN is 1:1 (province_name is the PK of jurisdictions_census),
  // so grouping by province alone and using MAX(population) is safe.
  const rows = await db
    .select({
      province: cases.jurisdictionProvince,
      n: count(),
      population: sql<string | null>`MAX(${jurisdictionsCensus.population})`,
    })
    .from(cases)
    .leftJoin(
      jurisdictionsCensus,
      and(
        eq(jurisdictionsCensus.provinceName, cases.jurisdictionProvince),
        eq(jurisdictionsCensus.censusYear, 2022),
      ),
    )
    .where(and(...conditions))
    .groupBy(cases.jurisdictionProvince);

  return rows
    .filter((r) => r.province !== null)
    .map((r) => {
      const pop = r.population !== null ? Number(r.population) : null;
      const ratePer10k =
        pop !== null && pop > 0 ? Math.round((r.n / pop) * 10_000 * 10) / 10 : null;
      return {
        province: r.province as string,
        code: PROVINCE_ISO_MAP[r.province as string] ?? "",
        count: r.n,
        ratePer10k,
      };
    });
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
  opts: { since?: Date } = {},
): Promise<ZoonosisTrendPoint[]> {
  const since12m = opts.since ?? new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    sql`${petEvents.eventType} LIKE ${"outbreak_%"}`,
    gte(petEvents.occurredAt, since12m),
  ];
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);
  // Payload jurisdiction is an event-time snapshot — also require the pet's
  // CURRENT jurisdiction in scope (scope-security review 2026-07-04 A2).
  const petsGuard = petsCurrentJurisdictionExists(actor, jurisdictions);
  if (petsGuard) conditions.push(petsGuard);

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
// Exported so the maltrato list page and its tests can reuse the same logic.
export function welfareReportsScopeClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
) {
  if (actor.role === "admin") return null;
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${welfareReports.jurisdictionProvince}`,
      sql`${welfareReports.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// ============================================================================
// Moderation queue WHERE-clause builder (jurisdiction denuncia moderation)
//
// The flagged-denuncia moderation queue. /admin/moderacion sees it universally;
// /gob/moderacion sees ONLY the viewer's assigned localities (govt) with the
// same predicate + the jurisdiction scope clause — so we don't fork a parallel
// query. A flagged report with no/ambiguous jurisdiction never matches a govt
// scope pair, so it stays admin-only (never invisible to everyone).
// ============================================================================

export type ModerationQueueStatus = "pending" | "resolved" | "all";

export type ModerationQueueFilters = {
  actor: DashboardActor;
  /** The viewer's active jurisdiction assignments (empty for admin = universal). */
  jurisdictions: DashboardJurisdiction[];
  /** pending = actionable (unresolved, not escalated); resolved; all = every flagged row in scope. */
  status: ModerationQueueStatus;
  kind?: string | null;
  severity?: string | null;
};

/**
 * Returns a Drizzle SQL condition for the flagged-denuncia moderation queue,
 * scoped to the viewer:
 *   - Only flagged rows (flaggedAt IS NOT NULL).
 *   - Jurisdiction scope (govt: assignment pairs; admin: universal). Rows with
 *     no jurisdiction never match a govt pair, so they stay admin-only.
 *   - status: pending = unresolved AND not escalated (the govt actionable queue);
 *     resolved = moderation already resolved; all = every flagged row in scope.
 *   - Optional kind / severity narrow filters.
 *
 * Returns `sql\`false\`` when a govt viewer has no jurisdiction assignments.
 */
export function buildModerationQueueConditions(filters: ModerationQueueFilters): SQL {
  const { actor, jurisdictions, status, kind, severity } = filters;

  // Short-circuit: a govt with no assignments can never see any flagged row.
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return sql`false`;
  }

  const conditions: SQL[] = [isNotNull(welfareReports.flaggedAt) as SQL];

  // Jurisdiction scope (govt only — admin is unscoped/universal).
  const scope = welfareReportsScopeClause(actor, jurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  // Status bucket.
  if (status === "pending") {
    // Actionable queue: not yet resolved AND not handed off to admin.
    conditions.push(sql`(${welfareReports.moderationResolvedAt} IS NULL)`);
    conditions.push(sql`(${welfareReports.moderationEscalatedAt} IS NULL)`);
  } else if (status === "resolved") {
    conditions.push(sql`(${welfareReports.moderationResolvedAt} IS NOT NULL)`);
  }
  // "all" = every flagged row in scope (no extra clause).

  if (kind) conditions.push(eq(welfareReports.kind, kind as never) as SQL);
  if (severity) conditions.push(eq(welfareReports.severity, severity as never) as SQL);

  return and(...conditions) as SQL;
}

// TERMINAL_STATUSES (closed | invalid | duplicate) is imported from the welfare
// domain — the single source of truth shared with govt-home-kpis and
// owner-dashboard so every welfare count treats "terminal" identically (C4).

// ============================================================================
// Maltrato list WHERE-clause builder (E4 followup)
//
// Consolidates every filter that was previously applied in JS post-fetch into
// a composable Drizzle WHERE condition. Exported to allow unit testing without
// a full DB round-trip.
// ============================================================================

export type MaltratoQueue = "urgent" | "mine" | "all" | "overdue";

export type MaltratoListFilters = {
  actor: DashboardActor;
  /** Intersected (assignment ∩ UI selection) jurisdiction set from the page. */
  filteredJurisdictions: DashboardJurisdiction[];
  queue: MaltratoQueue;
  kind?: string | null;
  severity?: string | null;
  /** Status narrow filter — restores parity with the old JS ?status= param handling. */
  status?: string | null;
  /**
   * For ADMIN only: canonical province name selected in the URL (?province=).
   * Govt callers must NOT pass this — their scope is already enforced by
   * filteredJurisdictions; passing selectedProvince for govt could widen the scope.
   */
  selectedProvince?: string | null;
  /**
   * For ADMIN only: canonical locality name selected in the URL (?locality=).
   * See selectedProvince. Ignored unless selectedProvince is also set.
   */
  selectedLocality?: string | null;
  currentUserId: string;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns a Drizzle SQL condition that encodes every filter for the maltrato
 * triage list:
 *   - Jurisdiction scope (intersected assignments — never widens beyond them)
 *   - Moderation exclusion (flagged but not yet admin-resolved)
 *   - Kind / severity narrow filters
 *   - Queue predicate (urgent / mine / overdue / all)
 *
 * Returns `sql\`false\`` when a govt user has no jurisdiction assignments so
 * the query will always produce zero rows.
 */
export function buildMaltratoListConditions(filters: MaltratoListFilters) {
  const {
    actor,
    filteredJurisdictions,
    queue,
    kind,
    severity,
    status,
    selectedProvince,
    selectedLocality,
    currentUserId,
  } = filters;

  // Short-circuit: govt with no assignments can never see any row.
  if (actor.role === "govt" && filteredJurisdictions.length === 0) {
    return sql`false`;
  }

  const conditions = [];

  // 1. Jurisdiction scope (govt only — admin is unscoped by welfareReportsScopeClause).
  const scope = welfareReportsScopeClause(actor, filteredJurisdictions);
  if (scope) conditions.push(sql`(${scope})`);

  // 2. Admin province/locality filter — applies when an admin selects a province
  //    or province+locality via the URL (?province= / ?locality=). Govt users must
  //    NOT pass these fields; their scope is already enforced by filteredJurisdictions
  //    (intersection of assignments ∩ URL selection, computed in the page layer).
  if (actor.role === "admin" && selectedProvince) {
    if (selectedLocality) {
      conditions.push(
        and(
          eq(welfareReports.jurisdictionProvince, selectedProvince),
          eq(welfareReports.jurisdictionLocality, selectedLocality),
        ),
      );
    } else {
      conditions.push(eq(welfareReports.jurisdictionProvince, selectedProvince));
    }
  }

  // 3. Moderation exclusion — hide flagged rows awaiting admin review.
  conditions.push(
    sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
  );

  // 4. Kind narrow filter.
  if (kind) conditions.push(eq(welfareReports.kind, kind as never));

  // 5. Severity narrow filter.
  if (severity) conditions.push(eq(welfareReports.severity, severity as never));

  // 6. Status narrow filter — restores parity with the old ?status= JS filtering.
  if (status) conditions.push(eq(welfareReports.status, status as never));

  // 7. Queue predicate.
  switch (queue) {
    case "urgent":
      // Critical or high severity, not yet in a terminal status.
      // S-1: if severity is set to a non-(critical|high) value AND queue=urgent,
      // the AND of these two conditions is always false — contradictory filter → no rows by design.
      conditions.push(inArray(welfareReports.severity, ["critical", "high"]));
      conditions.push(not(inArray(welfareReports.status, [...TERMINAL_STATUSES])));
      break;
    case "mine":
      // Assigned to the current user (any non-terminal status).
      conditions.push(eq(welfareReports.assignedToUserId, currentUserId));
      break;
    case "overdue":
      // Status still open AND created more than 7 days ago without triage.
      conditions.push(eq(welfareReports.status, "open"));
      conditions.push(lt(welfareReports.createdAt, new Date(Date.now() - SEVEN_DAYS_MS)));
      break;
    default:
      // "all" — no extra filter.
      break;
  }

  return and(...conditions);
}

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
/**
 * Map a case_events row to a gov-timeline summary string. Returns null for
 * entry types that should NOT surface in the gov welfare timeline. The org
 * display name is read from the payload when present.
 *
 * Exported for testing (UI-7 Part C).
 */
export function caseEventTimelineSummary(
  entryType: string,
  notes: string | null,
  payload: unknown,
): string | null {
  const orgName =
    payload && typeof payload === "object" && "orgDisplayName" in payload
      ? String((payload as Record<string, unknown>).orgDisplayName)
      : null;
  const trimmedNotes = notes?.trim() ? notes.trim() : null;

  switch (entryType) {
    case "reporter_comment":
      return trimmedNotes
        ? `Comentario del denunciante: ${trimmedNotes}`
        : "El denunciante agregó un comentario.";
    case "org_intervention_taken":
      return orgName
        ? `${orgName} tomó la denuncia y está interviniendo.`
        : "La organización tomó la denuncia y está interviniendo.";
    case "org_intervention_note":
      return trimmedNotes
        ? `Nota de intervención${orgName ? ` (${orgName})` : ""}: ${trimmedNotes}`
        : "La organización agregó una nota de intervención.";
    case "org_intervention_return":
      return `${orgName ?? "La organización"} devolvió la denuncia${
        trimmedNotes ? `: ${trimmedNotes}` : "."
      }`;
    default:
      return null;
  }
}

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
  // Pull case_events (reporter comments + org intervention notes) so the gov
  // timeline shows them. These live in case_events, NOT welfare_reports, so the
  // gov detail was previously blind to them (UI-7 Part C).
  let linkedCaseEvents: Array<{
    id: string;
    entryType: string;
    occurredAt: Date;
    notes: string | null;
    payload: unknown;
    recordedByUserId: string | null;
  }> = [];
  if (report.caseId) {
    linkedCaseEvents = await db
      .select({
        id: caseEvents.id,
        entryType: caseEvents.entryType,
        occurredAt: caseEvents.occurredAt,
        notes: caseEvents.notes,
        payload: caseEvents.payload,
        recordedByUserId: caseEvents.recordedByUserId,
      })
      .from(caseEvents)
      .where(eq(caseEvents.caseId, report.caseId))
      .orderBy(desc(caseEvents.occurredAt))
      .limit(50);

    for (const e of linkedCaseEvents) {
      if (e.recordedByUserId) actorIdSet.add(e.recordedByUserId);
    }

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

  // 6. Case events — reporter comments + org intervention notes (UI-7 Part C).
  // Surfaced to gov so the maltrato detail shows the full case conversation.
  for (const e of linkedCaseEvents) {
    const summary = caseEventTimelineSummary(e.entryType, e.notes, e.payload);
    if (!summary) continue; // skip unknown / internal entry types
    events.push({
      id: `case-event-${e.id}`,
      occurredAt: e.occurredAt,
      kind: e.entryType,
      actorName: e.recordedByUserId ? (actorNames.get(e.recordedByUserId) ?? undefined) : undefined,
      summary,
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
   * vaccine_name matches rabia/rabies/antirrábica/antirrabica (accent-insensitive).
   * Uses unaccent() so accented forms like "antirrábica" are counted alongside
   * ASCII forms "rabia" and "rabies".
   * Computed as (pets with ≥1 rabia event / totalPets) * 100, rounded to integer.
   * Returns 0 when totalPets = 0.
   */
  rabiesVaccinationRate: number;
  /**
   * Open disputes in scope from the `custody_disputes` table — the SAME source
   * the /gob/disputas queue lists, so the KPI alarm and the queue reconcile.
   */
  custodyDisputes: number;
};

/**
 * Canonical es-AR label for the `rabiesVaccinationRate` field — ALL SPECIES,
 * all-time (no trailing window).
 *
 * DISAMBIGUATION (critique-govt-2026-07-03.md, "Same metric, different
 * numbers" — 54% here vs 42% under the same old label elsewhere): this KPI is
 * DISTINCT from RABIES_COVERAGE_LABEL_ES (lib/analytics/govt-home-kpis.ts),
 * which counts DOGS ONLY over a trailing 12-month window. Full
 * numerator/denominator breakdown of both lives in lib/metrics/kpi-catalog.ts
 * (rabies_vaccination_rate_all_species vs rabies_coverage_dogs_12m).
 *
 * FOLLOW-UP (render-site, out of this module's lane): app/gob/analytics/page.tsx
 * currently renders this KPI as `label="Cobertura antirrábica (mascotas)"` — a
 * later pass should import RABIES_VACCINATION_RATE_LABEL_ES instead of
 * repeating a similar-looking string that drove the original ambiguity.
 */
export const RABIES_VACCINATION_RATE_LABEL_ES =
  "Cobertura antirrábica — todas las mascotas (histórico)";

/**
 * KPI: rabiesVaccinationRate → rabies_vaccination_rate_all_species (see
 * lib/metrics/kpi-catalog.ts); adoptionRate → not yet catalogued (adoption
 * funnel, no ambiguity reported).
 *
 * rabiesVaccinationRate:
 *   NUMERATOR:   COUNT DISTINCT active/lost pets of ANY species with ≥1
 *                vaccination_administered event where
 *                unaccent(vaccine_name) ILIKE unaccent('%rabi%') (amendment-
 *                overlay-aware). NO occurred_at filter — all-time.
 *   DENOMINATOR: COUNT active/lost pets (any species) in scope (totalPets).
 *   SOURCE:      pets, pet_events (vaccination_administered).
 *   CADENCE:     all-time — recomputed per render, not windowed.
 *   SUPPRESSION: none.
 *
 * adoptionRate:
 *   NUMERATOR:   COUNT pet_registered events (trailing 12m, scoped) with
 *                payload.acquisition_method = 'adopted'.
 *   DENOMINATOR: COUNT pet_registered events (trailing 12m, scoped) — ALL
 *                acquisition methods, not just adoptions.
 *   SOURCE:      pet_events (pet_registered).
 *   CADENCE:     trailing 12 months.
 *   SUPPRESSION: none.
 *
 * @param actor - DashboardActor (role + id).
 * @param jurisdictions - Caller's assigned jurisdiction pairs (govt) or ignored (admin).
 * @param opts - since window override + optional admin province/locality drill-down.
 */
export async function fetchAnalyticsMetrics(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  opts: {
    since?: Date;
    /**
     * Admin province drill-down (Panorama). Only set when actor.role === "admin"
     * and a province was selected. Never set from govt page code.
     */
    adminProvince?: string;
    adminLocality?: string;
  } = {},
): Promise<AnalyticsMetrics> {
  // Early-return for govt with no assignments.
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { totalPets: 0, adoptionRate: 0, rabiesVaccinationRate: 0, custodyDisputes: 0 };
  }

  const since12m = opts.since ?? new Date(Date.now() - 365 * DAY_MS);
  const adminProvince = opts.adminProvince;
  const adminLocality = opts.adminLocality;

  const petsScope = petsScopeClause(actor, jurisdictions);

  // 1. totalPets: active or lost in scope.
  const totalConditions = [sql`${pets.status} IN ('active', 'lost')`];
  if (petsScope) totalConditions.push(sql`(${petsScope})`);
  // Admin province drill-down: append explicit province predicate (same pattern
  // as buildMaltratoListConditions). Govt users must NOT pass adminProvince.
  if (actor.role === "admin" && adminProvince) {
    totalConditions.push(sql`${pets.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) totalConditions.push(sql`${pets.jurisdictionLocality} = ${adminLocality}`);
  }

  // 2. adoptionRate: pet_registered events with acquisition_method='adopted', last 12m.
  //    Scope via inner join to pets.jurisdictionProvince/Locality.
  //    NOTE(E5-followup): acquisition method is in pet_registered payload, not a separate event.
  const acquisitionConditions = [
    eq(petEvents.eventType, "pet_registered"),
    gte(petEvents.occurredAt, since12m),
  ];
  if (actor.role === "govt") {
    // jurisdictions.length > 0 guaranteed by early-return at top of function.
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    if (pairs) acquisitionConditions.push(sql`(${pairs})`);
  }
  // Admin province drill-down for acquisition events: add province predicate.
  // The innerJoin to pets is added below via needsJoin.
  if (actor.role === "admin" && adminProvince) {
    acquisitionConditions.push(sql`${pets.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) {
      acquisitionConditions.push(sql`${pets.jurisdictionLocality} = ${adminLocality}`);
    }
  }

  // 3. rabiesVaccinationRate: distinct petIds with ≥1 vaccination_administered where
  //    vaccine_name accent-insensitively matches rabia/rabies/antirrábica/antirrabica.
  //    unaccent() strips diacritics on both sides so the pattern '%rabi%' catches:
  //      - "rabia"           → unaccent → "rabia"       → contains "rabi" ✓
  //      - "rabies"          → unaccent → "rabies"      → contains "rabi" ✓
  //      - "antirrábica"     → unaccent → "antirrabica" → contains "rabi" ✓
  //      - "Antirrábica"     → unaccent → "Antirrabica" → ILIKE catches case ✓
  //    Requires the unaccent extension (migration 0070; first referenced in 0055).
  const rabiesConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    // Amendment overlay (audit A2): match the CURRENT (corrected) vaccine name.
    sql`unaccent(${amendedPayloadText("vaccine_name")}) ILIKE unaccent(${"%rabi%"})`,
  ];
  if (actor.role === "govt") {
    // jurisdictions.length > 0 guaranteed by early-return at top of function.
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    if (pairs) rabiesConditions.push(sql`(${pairs})`);
  }
  // Admin province drill-down for rabies events: add province predicate.
  if (actor.role === "admin" && adminProvince) {
    rabiesConditions.push(sql`${pets.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) {
      rabiesConditions.push(sql`${pets.jurisdictionLocality} = ${adminLocality}`);
    }
  }

  // 4. custodyDisputes: open disputes in the `custody_disputes` table — the SAME
  //    source the /gob/disputas queue lists, so the KPI alarm and the queue
  //    always reconcile (count↔queue parity). This previously counted
  //    cases(case_kind='custody_dispute'), a SUPERSET that also includes
  //    location-subject rows with no custody_disputes aggregate (nothing for the
  //    queue to surface) — producing a "9" alarm over an empty queue.
  const disputeConditions = [eq(custodyDisputes.status, "open")];
  const disputesScope = custodyDisputesScopeClause(actor, jurisdictions);
  if (disputesScope) disputeConditions.push(sql`(${disputesScope})`);
  // Admin province drill-down (custody_disputes carries its own jurisdiction cols).
  if (actor.role === "admin" && adminProvince) {
    disputeConditions.push(sql`${custodyDisputes.jurisdictionProvince} = ${adminProvince}`);
    if (adminLocality) {
      disputeConditions.push(sql`${custodyDisputes.jurisdictionLocality} = ${adminLocality}`);
    }
  }

  // Whether petEvents sub-queries need an innerJoin to pets for province scoping.
  // Govt always joins (to apply jurisdiction pairs). Admin+province also joins.
  const needsJoin = actor.role === "govt" || (actor.role === "admin" && !!adminProvince);

  const [totalRows, acquisitionRows, adoptedRows, rabiesRows, disputeRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(pets)
      .where(and(...totalConditions)),

    // Total registrations in last 12m for adoption-rate denominator.
    needsJoin
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
    needsJoin
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
    needsJoin
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
      .from(custodyDisputes)
      .where(and(...disputeConditions)),
  ]);

  const totalPets = totalRows[0]?.n ?? 0;
  const totalAcquisitions = acquisitionRows[0]?.n ?? 0;
  const adopted = adoptedRows[0]?.n ?? 0;
  const rabiesVaccinated = rabiesRows[0]?.n ?? 0;
  // Named ...Count to avoid shadowing the imported `custodyDisputes` table used
  // in the query above (block-scoped const would otherwise capture it in TDZ).
  const custodyDisputesCount = disputeRows[0]?.n ?? 0;

  const adoptionRate =
    totalAcquisitions === 0 ? 0 : Math.round((adopted / totalAcquisitions) * 100);
  const rabiesVaccinationRate =
    totalPets === 0 ? 0 : Math.round((rabiesVaccinated / totalPets) * 100);

  return {
    totalPets,
    adoptionRate,
    rabiesVaccinationRate,
    custodyDisputes: custodyDisputesCount,
  };
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
  opts: { since?: Date } = {},
): Promise<AcquisitionTrendPoint[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const since12m = opts.since ?? new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    eq(petEvents.eventType, "pet_registered"),
    gte(petEvents.occurredAt, since12m),
    // Exclude rows with null acquisition_method.
    sql`(${petEvents.payload}->>'acquisition_method') IS NOT NULL`,
  ];

  if (actor.role === "govt") {
    // jurisdictions.length > 0 guaranteed by early-return above.
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    if (pairs) conditions.push(sql`(${pairs})`);
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
  opts: { since?: Date } = {},
): Promise<DeathCauseRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  const since12m = opts.since ?? new Date(Date.now() - 365 * DAY_MS);

  const conditions = [
    eq(petEvents.eventType, "death_recorded"),
    gte(petEvents.occurredAt, since12m),
  ];

  if (actor.role === "govt") {
    // jurisdictions.length > 0 guaranteed by early-return above.
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    );
    if (pairs) conditions.push(sql`(${pairs})`);
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
   * ISO date (YYYY-MM-DD) of the calendar day with the highest number of
   * outbreak_signal events for this (disease_code, locality, province) group.
   * Tie-break: highest signal count first, then most-recent day.
   */
  peakDate: string;
  /** Total outbreak_signal events from this disease in this locality, full history. */
  totalSignals: number;
};

/**
 * Historical outbreaks grouped by (disease_code, disease_label, locality, province),
 * ordered by most-recent signal descending.
 *
 * peakDate = the calendar day (date_trunc('day', occurred_at)::date) that
 * had the most outbreak_signal events within the group. Ties broken by most-
 * recent day. Group-level totalSignals counts all signals across all days.
 *
 * Implemented as a three-CTE query (daily → peak → totals) joined together so
 * that per-day counts, busiest-day selection (DISTINCT ON), and group totals
 * are each computed in a single pass.
 *
 * Scope via outbreak_signal payload fields pet_jurisdiction_province/locality
 * (same as fetchSurveillanceSignals). No time restriction — full history.
 */
export async function fetchOutbreakHistory(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<OutbreakHistoryRow[]> {
  if (actor.role === "govt" && jurisdictions.length === 0) return [];

  // Build the jurisdiction scope clause once; reused in both CTEs. The pets
  // guard (EXISTS on the pet's CURRENT jurisdiction) closes the payload-drift
  // hole for govt viewers (scope-security review 2026-07-04 A2).
  const scope = outbreakSignalScopeClause(actor, jurisdictions);
  const petsGuard = petsCurrentJurisdictionExists(actor, jurisdictions);
  const scopeFragment = sql.join(
    [scope ? sql` AND (${scope})` : sql``, petsGuard ? sql` AND ${petsGuard}` : sql``],
    sql``,
  );

  type RawRow = {
    disease_code: string;
    disease_label: string | null;
    province: string;
    locality: string;
    peak_day: string;
    total_signals: number;
    last_seen: string;
  };

  const rows = (await db.execute(sql`
    WITH daily AS (
      -- Per-(group, day) signal counts. Groups share the same 4-tuple key.
      SELECT
        (${petEvents.payload}->>'disease_code')                                AS disease_code,
        COALESCE((${petEvents.payload}->>'disease_label'), '')                 AS disease_label,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')      AS province,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')      AS locality,
        date_trunc('day', ${petEvents.occurredAt})::date                        AS day,
        COUNT(*)::int                                                           AS day_count
      FROM ${petEvents}
      WHERE ${petEvents.eventType} = 'outbreak_signal'${scopeFragment}
      GROUP BY disease_code, disease_label, province, locality, day
    ),
    peak AS (
      -- Pick the single busiest day per group.
      -- Tie-break: most signals first, then most-recent day.
      SELECT DISTINCT ON (disease_code, disease_label, province, locality)
        disease_code,
        disease_label,
        province,
        locality,
        day AS peak_day
      FROM daily
      ORDER BY disease_code, disease_label, province, locality,
               day_count DESC, day DESC
    ),
    totals AS (
      -- Group-level aggregates: total signal count + last-seen timestamp
      -- (used for ordering the final result).
      SELECT
        (${petEvents.payload}->>'disease_code')                                AS disease_code,
        COALESCE((${petEvents.payload}->>'disease_label'), '')                 AS disease_label,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_province'), '')      AS province,
        COALESCE((${petEvents.payload}->>'pet_jurisdiction_locality'), '')      AS locality,
        COUNT(*)::int                                                           AS total_signals,
        MAX(${petEvents.occurredAt})                                            AS last_seen
      FROM ${petEvents}
      WHERE ${petEvents.eventType} = 'outbreak_signal'${scopeFragment}
      GROUP BY disease_code, disease_label, province, locality
    )
    SELECT
      t.disease_code,
      t.disease_label,
      t.province,
      t.locality,
      p.peak_day,
      t.total_signals,
      t.last_seen
    FROM totals t
    JOIN peak p USING (disease_code, disease_label, province, locality)
    ORDER BY t.last_seen DESC
    LIMIT 100
  `)) as RawRow[];

  return rows.map((r) => ({
    diseaseCode: r.disease_code,
    diseaseName: findDisease(r.disease_code)?.label ?? (r.disease_label || null) ?? r.disease_code,
    locality: r.locality,
    province: r.province,
    // peak_day arrives as a Postgres ::date string (YYYY-MM-DD); wrap in Date
    // only to normalise, then emit as ISO date string.
    peakDate: new Date(r.peak_day).toISOString(),
    totalSignals: r.total_signals,
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
  // Bind dates as ISO strings — a raw JS Date in sql`` crashes postgres-js
  // (prepare:false) with ERR_INVALID_ARG_TYPE; the comparison casts to timestamptz.
  if (period.since) conditions.push(sql`${pets.createdAt} >= ${period.since.toISOString()}`);
  if (period.until) conditions.push(sql`${pets.createdAt} <= ${period.until.toISOString()}`);

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
  // Rows return the pet's public token — require the pet's CURRENT jurisdiction
  // to be in scope too (pets is inner-joined below), so a pet that moved away
  // doesn't leak its events into the old jurisdiction's export forever. Same
  // guard the sibling export/analytics fetchers got in the 2026-07-04 scope
  // review (fetchSurveillanceSignals, fetchZoonosisTrend, …).
  const petsScope = petsCurrentJurisdictionClause(actor, jurisdictions);
  if (petsScope) conditions.push(sql`(${petsScope})`);
  // Bind dates as ISO strings (see fetchPetsForExport) — raw Date in sql`` crashes postgres-js.
  if (period.since) conditions.push(sql`${petEvents.occurredAt} >= ${period.since.toISOString()}`);
  if (period.until) conditions.push(sql`${petEvents.occurredAt} <= ${period.until.toISOString()}`);

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
  // Bind dates as ISO strings (see fetchPetsForExport) — raw Date in sql`` crashes postgres-js.
  if (period.since) conditions.push(sql`${cases.createdAt} >= ${period.since.toISOString()}`);
  if (period.until) conditions.push(sql`${cases.createdAt} <= ${period.until.toISOString()}`);

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
    const pairs = jurisdictionPairClause(
      jurisdictions,
      sql`${organizations.jurisdictionProvince}`,
      sql`${organizations.jurisdictionLocality}`,
    );
    // pairs is non-null because jurisdictions.length > 0 (guarded above).
    if (pairs) conditions.push(sql`(${pairs})`);
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
