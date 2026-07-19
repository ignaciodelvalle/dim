// Pérdidas (lost pets) dashboard fetchers — E3.
// Split out of lib/analytics/govt-dashboards.ts (engram refactor/govt-dashboards-split).

import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { analyticsDb as db, ownerships, petEvents, pets, profiles } from "@/db";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  jurisdictionPairClause,
} from "@/lib/metrics";
import { likeContains } from "@/lib/utils/like-helpers";
import { DAY_MS, petsScopeClause } from "./_scope";

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
    /**
     * Admin province drill-down (mirrors fetchPerdidasMetrics). Only set when
     * actor.role === "admin" and a province was selected via the URL. Govt
     * callers must NOT pass this — their scope is already enforced by the
     * jurisdiction pairs applied below.
     */
    adminProvince?: string;
    adminLocality?: string;
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

  // Admin province/locality drill-down — same pattern as fetchPerdidasMetrics
  // and buildMaltratoListConditions. Admin has no assignments to narrow, so the
  // URL selection is applied as an explicit predicate instead.
  if (actor.role === "admin" && filters.adminProvince) {
    conditions.push(sql`${pets.jurisdictionProvince} = ${filters.adminProvince}`);
    if (filters.adminLocality) {
      conditions.push(sql`${pets.jurisdictionLocality} = ${filters.adminLocality}`);
    }
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
   * Pets in scope that TRULY recovered — went from 'lost' back to 'active' —
   * in the last 30 days. Detected via `status_changed` events where payload
   * `from_status = 'lost'` and `to_status = 'active'` and the event was
   * recorded within 30d.
   *
   * Deliberately narrower than "any exit from lost": a lost pet later marked
   * `deceased` is a BAJA, not a recovery, and must not inflate this KPI (PO
   * decision — "don't conflate the metric with its label", 2026-07-19). In
   * practice this exclusion is currently a no-op for volume: every writer of
   * `status_changed` with `from_status='lost'` — setPetFound
   * (src/modules/events/application/lifecycle/set-pet-found-use-case.ts) and
   * owner-accept-return (src/modules/return-to-owner/application/owner-accept-return.ts)
   * — always pairs it with `to_status='active'`. Death is recorded via a
   * separate `death_recorded` event + direct `updateDeceased()` projection
   * write (src/modules/events/application/lifecycle/death-record-use-case.ts);
   * it never emits a `status_changed` event, so lost→deceased status_changed
   * rows do not occur today. The `to_status='active'` predicate below is a
   * forward-guard, not a fix for an observed inflation.
   *
   * Payload convention: `{ from_status: string, to_status: string, ... }`
   * Canonical source: lib/events/event-schemas.ts `statusChanged` + AGENTS.md §Events table.
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
 *     payload.from_status='lost' AND payload.to_status='active' (true
 *     recovery only — excludes lost→deceased/other exits, which are BAJAS,
 *     not recoveries), trailing 30d.
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
     * Count-only fast path (perf audit 2026-07-19 qw#6): return just `activeCount`
     * via a single COUNT, skipping fetchLostPets (≤500 rows, 3 queries) and the
     * recovered-count join. `recoveredMonth` / `avgDaysActive` come back 0. The
     * /gob home renders ONLY activeCount, so it opts in; /gob/perdidas does not.
     */
    countOnly?: boolean;
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

  // Count-only fast path (qw#6): the /gob home shows only activeCount. Serve it
  // with the single COUNT above and skip the recovered join + fetchLostPets.
  if (opts?.countOnly) {
    const [activeRows] = await db
      .select({ n: count() })
      .from(pets)
      .where(and(...activeConditions));
    return { activeCount: activeRows?.n ?? 0, recoveredMonth: 0, avgDaysActive: 0 };
  }

  // 2. Count `status_changed` events where `from_status = 'lost'` AND
  // `to_status = 'active'` within 30d in scope — a TRUE recovery. A lost pet
  // later marked deceased (or any other non-active exit) is a BAJA, not a
  // recovery, and must not be counted here (PO decision 2026-07-19). We
  // scope-match on the pet's own jurisdiction columns, not the event payload,
  // because status_changed events may not carry jurisdiction in their payload
  // (it is present in outbreak_signal but not status_changed).
  const recoveredConditions = [
    eq(petEvents.eventType, "status_changed"),
    sql`(${petEvents.payload}->>'from_status') = 'lost'`,
    sql`(${petEvents.payload}->>'to_status') = 'active'`,
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
