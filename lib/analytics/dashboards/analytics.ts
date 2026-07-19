// Analytics metrics — E5 (adoption rate, rabies vaccination rate, custody
// disputes, acquisition trend, death causes).
// Split out of lib/analytics/govt-dashboards.ts (engram refactor/govt-dashboards-split).

import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";

import { custodyDisputes, analyticsDb as db, petEvents, pets } from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  jurisdictionPairClause,
} from "@/lib/metrics";
import { DAY_MS, custodyDisputesScopeClause, petsScopeClause } from "./_scope";

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
 * RESOLVED (render-site): app/gob/analytics/page.tsx imports and renders
 * this exact constant (`label={RABIES_VACCINATION_RATE_LABEL_ES}`) instead of
 * repeating a similar-looking string — see
 * app/gob/analytics/_components/RegionRankingTable.test.tsx for the regression
 * guard against the old ambiguous "Cobertura antirrábica (mascotas)" copy.
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

  // 1-decimal precision (Math.round(x*1000)/10) so the display can render
  // "41,9%" instead of a fetcher-truncated 41% (KPI precision audit 2026-07-07).
  const adoptionRate =
    totalAcquisitions === 0 ? 0 : Math.round((adopted / totalAcquisitions) * 1000) / 10;
  const rabiesVaccinationRate =
    totalPets === 0 ? 0 : Math.round((rabiesVaccinated / totalPets) * 1000) / 10;

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
  opts: { since?: Date; adminProvince?: string; adminLocality?: string } = {},
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
  // Admin province drill-down (Panorama-style) — same pattern as
  // fetchAnalyticsMetrics/fetchPerdidasMetrics. Backward-compat: absent →
  // unrestricted, exactly as before.
  if (actor.role === "admin" && opts.adminProvince) {
    conditions.push(sql`${pets.jurisdictionProvince} = ${opts.adminProvince}`);
    if (opts.adminLocality) {
      conditions.push(sql`${pets.jurisdictionLocality} = ${opts.adminLocality}`);
    }
  }

  // Whether the petEvents query needs an innerJoin to pets for province scoping.
  // Govt always joins (jurisdiction pairs); admin+adminProvince also joins.
  const needsJoin = actor.role === "govt" || (actor.role === "admin" && !!opts.adminProvince);

  const baseQuery = needsJoin
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
    // UTC pin: same date_trunc('month') bucket-boundary rationale as above.
    const monthLabel = d.toLocaleString("es-AR", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
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
  opts: { since?: Date; adminProvince?: string; adminLocality?: string } = {},
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
  // Admin province drill-down (Panorama-style) — backward-compat: absent →
  // unrestricted, exactly as before.
  if (actor.role === "admin" && opts.adminProvince) {
    conditions.push(sql`${pets.jurisdictionProvince} = ${opts.adminProvince}`);
    if (opts.adminLocality) {
      conditions.push(sql`${pets.jurisdictionLocality} = ${opts.adminLocality}`);
    }
  }

  // Govt always joins (jurisdiction pairs); admin+adminProvince also joins.
  const needsJoin = actor.role === "govt" || (actor.role === "admin" && !!opts.adminProvince);

  const rows = await (needsJoin
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
