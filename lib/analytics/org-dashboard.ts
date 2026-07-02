// lib/org-dashboard.ts — Org operations dashboard projections (Wave 3 Item 17)
//
// Pure projections over the event log and custody rows — no new schema, no
// migrations. All helpers are org-scoped and read-only.
//
// Projections:
//   - intakesLastWeek:     shelter_intake_recorded events in the last 7 days
//   - availableForAdopt:   active shelter_custody pets with adoption_eligible=true
//   - activeAdoptions:     open adoption_application_submitted events (no resolution)
//   - requiresAction:      custody animals with overdue vaccine/deworming or long stay
//
// Import computeOccupancyBreakdown from lib/org-census.ts for the Ocupación KPI.

import { and, count, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";

import {
  appointments,
  db,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of days before a stay is considered "long-stay" and surfaces as action-needed. */
export const LONG_STAY_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Today's agenda — powers the solo-clinic agenda-first landing (four-actor lean
// IA critique §3). Same Argentina-TZ midnight-to-midnight window as the full
// agenda page (app/org/[orgToken]/agenda/page.tsx).
// ---------------------------------------------------------------------------

/** One appointment on the org's day view, shaped for the agenda-first landing. */
export type TodayAgendaItem = {
  appointmentToken: string;
  status: string;
  startsAt: Date;
  offeringTitle: string;
  serviceKind: string;
  petName: string;
  petPublicToken: string;
  ownerName: string | null;
};

/** Today's appointments for an org (Argentina time), soonest first. */
export async function fetchTodayAgenda(organizationId: string): Promise<TodayAgendaItem[]> {
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const localMidnight = new Date(`${todayStr}T00:00:00.000-03:00`);
  const localNextMidnight = new Date(localMidnight.getTime() + MS_PER_DAY);

  return db
    .select({
      appointmentToken: appointments.publicToken,
      status: appointments.status,
      startsAt: timeSlots.startsAt,
      offeringTitle: serviceOfferings.displayName,
      serviceKind: serviceOfferings.serviceKind,
      petName: pets.name,
      petPublicToken: pets.publicToken,
      ownerName: profiles.displayName,
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(profiles, eq(profiles.id, appointments.ownerUserId))
    .where(
      and(
        eq(appointments.organizationId, organizationId),
        gte(timeSlots.startsAt, localMidnight),
        lt(timeSlots.startsAt, localNextMidnight),
      ),
    )
    .orderBy(timeSlots.startsAt);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Aggregated dashboard metrics for an org panel.
 * All counts are non-negative integers; 0 is a valid "all clear" value.
 */
export type OrgDashboardMetrics = {
  /** Animals admitted via shelter_intake_recorded in the last 7 calendar days. */
  intakesLastWeek: number;
  /** Animals currently in shelter_custody with adoption_eligible = true. */
  availableForAdopt: number;
  /** Open adoption applications (submitted, not yet resolved or finalized). */
  activeAdoptions: number;
  /** Animals in custody that have at least one action-required flag. */
  requiresActionCount: number;
};

/** A single animal that requires operator attention. */
export type RequiresActionItem = {
  petId: string;
  petPublicToken: string;
  petName: string;
  petSpecies: string;
  /** Why this animal needs attention — multiple flags may apply. */
  reasons: ActionReason[];
  /** Days in custody (from ownership.startedAt to now), for display. */
  daysInCustody: number;
};

export type ActionReason =
  | "overdue_vaccine"
  | "overdue_deworming"
  | "active_medication_no_dose"
  | "long_stay";

// ---------------------------------------------------------------------------
// Raw SQL helper types for pg results
// ---------------------------------------------------------------------------

type CountRow = { n: string | number };

type ActionRow = {
  pet_id: string;
  pet_public_token: string;
  pet_name: string;
  pet_species: string;
  days_in_custody: string | number;
  overdue_vaccine: boolean;
  overdue_deworming: boolean;
  active_medication_no_dose: boolean;
  long_stay: boolean;
};

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/**
 * Count shelter_intake_recorded events authored by this org in the last 7 days.
 *
 * Uses authorOrganizationId so only intakes recorded by the org are counted —
 * not intakes on pets in its custody that were authored externally.
 */
export async function fetchIntakesLastWeek(organizationId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * MS_PER_DAY);
  const [row] = await db
    .select({ n: count() })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.eventType, "shelter_intake_recorded"),
        eq(petEvents.authorOrganizationId, organizationId),
        gt(petEvents.occurredAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Count pets currently in shelter_custody of this org with adoption_eligible = true.
 */
export async function fetchAvailableForAdoption(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerOrganizationId, organizationId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
        eq(pets.adoptionEligible, true),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Count open adoption applications for pets under this org's custody.
 *
 * An application is open when there is an adoption_application_submitted event
 * with no subsequent adoption_application_resolved event for the same pet and
 * application, and no adoption_finalized event on the pet.
 *
 * Uses a raw SQL query matching the adopciones/page.tsx pattern (authoritative).
 */
export async function fetchActiveAdoptions(organizationId: string): Promise<number> {
  const rows = await db.execute<CountRow>(sql`
    SELECT COUNT(*)::int AS n
    FROM pet_events s
    JOIN ownerships o
      ON o.pet_id = s.pet_id
      AND o.role = 'shelter_custody'
      AND o.ended_at IS NULL
      AND o.owner_organization_id = ${organizationId}
    WHERE s.event_type = 'adoption_application_submitted'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events d
        WHERE d.pet_id = s.pet_id
          AND d.event_type = 'adoption_application_resolved'
          AND d.payload->>'application_event_id' = s.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM pet_events f
        WHERE f.pet_id = s.pet_id AND f.event_type = 'adoption_finalized'
      )
  `);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Return the list of animals in this org's active custody that require attention.
 *
 * Flags checked (OR logic — any flag surfaces the animal):
 *   - overdue_vaccine:           latest vaccination_administered.proxima_dosis_at < today
 *   - overdue_deworming:         latest deworming_administered.proxima_dosis_at < today
 *   - active_medication_no_dose: has medication_started with no paired medication_stopped,
 *                                but no medication_dose_taken in the last 24 h
 *   - long_stay:                 ownership.started_at < (now - LONG_STAY_DAYS days)
 *
 * Sorted by daysInCustody descending (longest-stay first).
 * Returns at most 50 results (dashboard queue, not a full list).
 */
export async function fetchRequiresAction(organizationId: string): Promise<RequiresActionItem[]> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

  // long_stay_days (admin-rules-console, design ADR-4 item 4) — resolved via
  // the ORG's own jurisdiction, once per dashboard render.
  const [org] = await db
    .select({
      jurisdictionCountry: organizations.jurisdictionCountry,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const longStayRule = await resolveBusinessRule("long_stay_days", {
    country: org?.jurisdictionCountry ?? "AR",
    province: org?.jurisdictionProvince ?? null,
    locality: org?.jurisdictionLocality ?? null,
  });
  const longStayDays = longStayRule.payload.days;

  // Pass timestamps as ISO strings so postgres.js serialises them correctly
  // in raw sql`` templates (Drizzle operators handle Date natively; raw params need explicit ::timestamptz).
  const longStayCutoffIso = new Date(today.getTime() - longStayDays * MS_PER_DAY).toISOString();

  // CTE-based query: compute flags in the inner CTE, then filter on the outer
  // WHERE (not HAVING, which requires GROUP BY). The inner SELECT evaluates
  // each flag as a boolean expression per custody row.
  const rows = await db.execute<ActionRow>(sql`
    WITH flagged AS (
      SELECT
        p.id::text                                                       AS pet_id,
        p.public_token                                                   AS pet_public_token,
        p.name                                                           AS pet_name,
        p.species                                                        AS pet_species,
        EXTRACT(EPOCH FROM (NOW() - o.started_at))::int / 86400         AS days_in_custody,

        -- overdue_vaccine: latest vaccination with proxima_dosis_at in the past
        EXISTS (
          SELECT 1
          FROM pet_events v
          WHERE v.pet_id = p.id
            AND v.event_type = 'vaccination_administered'
            AND v.proxima_dosis_at IS NOT NULL
            AND v.proxima_dosis_at < ${todayStr}::date
            AND NOT EXISTS (
              SELECT 1 FROM pet_events v2
              WHERE v2.pet_id = p.id
                AND v2.event_type = 'vaccination_administered'
                AND v2.occurred_at > v.occurred_at
            )
        ) AS overdue_vaccine,

        -- overdue_deworming: latest deworming with proxima_dosis_at in the past
        EXISTS (
          SELECT 1
          FROM pet_events dw
          WHERE dw.pet_id = p.id
            AND dw.event_type = 'deworming_administered'
            AND dw.proxima_dosis_at IS NOT NULL
            AND dw.proxima_dosis_at < ${todayStr}::date
            AND NOT EXISTS (
              SELECT 1 FROM pet_events dw2
              WHERE dw2.pet_id = p.id
                AND dw2.event_type = 'deworming_administered'
                AND dw2.occurred_at > dw.occurred_at
            )
        ) AS overdue_deworming,

        -- active_medication_no_dose: open medication_started + no dose in last 24h
        EXISTS (
          SELECT 1 FROM pet_events ms
          WHERE ms.pet_id = p.id
            AND ms.event_type = 'medication_started'
            AND NOT EXISTS (
              SELECT 1 FROM pet_events mstop
              WHERE mstop.pet_id = p.id
                AND mstop.event_type = 'medication_stopped'
                AND mstop.payload->>'medication_started_event_id' = ms.id::text
            )
            AND NOT EXISTS (
              SELECT 1 FROM pet_events dose
              WHERE dose.pet_id = p.id
                AND dose.event_type = 'medication_dose_taken'
                AND dose.payload->>'medication_started_event_id' = ms.id::text
                AND dose.occurred_at > NOW() - INTERVAL '24 hours'
            )
        ) AS active_medication_no_dose,

        -- long_stay: custody started before the cutoff date
        (o.started_at < ${longStayCutoffIso}::timestamptz) AS long_stay

      FROM ownerships o
      JOIN pets p ON p.id = o.pet_id
      WHERE o.owner_organization_id = ${organizationId}
        AND o.role = 'shelter_custody'
        AND o.ended_at IS NULL
    )
    SELECT *
    FROM flagged
    WHERE overdue_vaccine
       OR overdue_deworming
       OR active_medication_no_dose
       OR long_stay
    ORDER BY long_stay DESC, days_in_custody DESC
    LIMIT 50
  `);

  return rows.map((row) => {
    const reasons: ActionReason[] = [];
    if (row.overdue_vaccine) reasons.push("overdue_vaccine");
    if (row.overdue_deworming) reasons.push("overdue_deworming");
    if (row.active_medication_no_dose) reasons.push("active_medication_no_dose");
    if (row.long_stay) reasons.push("long_stay");
    return {
      petId: row.pet_id,
      petPublicToken: row.pet_public_token,
      petName: row.pet_name,
      petSpecies: row.pet_species,
      reasons,
      daysInCustody: Number(row.days_in_custody ?? 0),
    };
  });
}

/**
 * Fetch all four dashboard metrics in parallel.
 *
 * This is the main entry point for the org panel page — runs all projection
 * queries concurrently and returns a flat metrics object.
 */
export async function fetchOrgDashboardMetrics(
  organizationId: string,
): Promise<OrgDashboardMetrics> {
  const [intakesLastWeek, availableForAdopt, activeAdoptions, actionItems] = await Promise.all([
    fetchIntakesLastWeek(organizationId),
    fetchAvailableForAdoption(organizationId),
    fetchActiveAdoptions(organizationId),
    fetchRequiresAction(organizationId),
  ]);
  return {
    intakesLastWeek,
    availableForAdopt,
    activeAdoptions,
    requiresActionCount: actionItems.length,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (no DB — testable without Postgres)
// ---------------------------------------------------------------------------

/** Human-readable label for an ActionReason. */
export function actionReasonLabel(reason: ActionReason): string {
  switch (reason) {
    case "overdue_vaccine":
      return "Vacuna vencida";
    case "overdue_deworming":
      return "Desparasitación vencida";
    case "active_medication_no_dose":
      return "Medicación sin dosis registrada";
    case "long_stay":
      return `Estadía larga (+${LONG_STAY_DAYS} días)`;
  }
}

/** Map an action reason to an a11y-safe icon name (icon + text, never color-only). */
export function actionReasonIcon(reason: ActionReason): string {
  switch (reason) {
    case "overdue_vaccine":
    case "overdue_deworming":
      return "alert-triangle";
    case "active_medication_no_dose":
      return "medicacion";
    case "long_stay":
      return "clock";
  }
}
