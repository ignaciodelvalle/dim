// Use-case: report-bite-from-org (org path).
//
// Migrated from app/actions/bite.ts::reportBiteFromOrgAction.
// Auth (requireCapability("bite.report")) handled by caller (actions.ts).
//
// Parity quirks:
//   - Uses plain insertIncidentEvent (NOT idempotent) — asymmetry with owner path preserved.
//   - reporter_role derived from orgTypeToReporterRole (domain/bite.ts).
//   - Active owner notified inside tx; authority fan-out post-tx.
//   - noRedirect=1 returns { ok, petToken } instead of triggering redirect.
//   - AUDIT_LOG: NONE.

import { validateEventPayload } from "@/lib/event-schemas";

import { orgTypeToReporterRole } from "../domain/bite";
import { computeObservationUntil, isRabiesVaccineValid } from "../domain/rabies-observation";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportBiteFromOrgInput = {
  pet: {
    id: string;
    publicToken: string;
    name: string;
    species: string;
    status: string;
    rabiesObservationStatus: string | null;
    jurisdictionProvince: string | null;
    jurisdictionLocality: string | null;
  };
  user: { id: string };
  organization: {
    id: string;
    displayName: string;
    orgType: string;
    verified: boolean;
  };
  occurredAt: Date;
  victimKind: "human" | "animal" | "unknown";
  severity: "minor" | "moderate" | "severe";
  locationDescription: string | null;
  context: string | null;
  victimContactName: string | null;
  victimContactPhone: string | null;
  victimAgeEstimate: string | null;
  injuriesSummary: string | null;
  vetInvolved: boolean;
  eventJurisdictionProvince: string | null;
  eventJurisdictionLocality: string | null;
  noRedirect: boolean;
  orgToken: string;
};

type Deps = {
  repo: Pick<
    SurveillanceRepository,
    | "findLatestRabiesVaccineEvent"
    | "insertIncidentEvent"
    | "insertObservationStarted"
    | "setObservationStatus"
    | "findActiveOwnership"
    | "insertNotifications"
  >;
  openCase: (
    input: {
      kind: string;
      primarySubjectKind: string;
      primaryPetId: string;
      jurisdictionProvince: string | null;
      jurisdictionLocality: string | null;
      openedByUserId: string;
      openedByOrganizationId: string;
      openedReason: string;
    },
    tx: unknown,
  ) => Promise<{ id: string }>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  findAuthoritiesForJurisdiction: (jurisdiction: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
};

export type ReportBiteFromOrgResult = UseCaseResult<{
  petToken: string | undefined;
  noRedirect: boolean;
}>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function reportBiteFromOrg(
  input: ReportBiteFromOrgInput,
  deps: Deps,
): Promise<ReportBiteFromOrgResult> {
  const { repo, openCase, transaction, findAuthoritiesForJurisdiction } = deps;
  const { pet, user, organization, occurredAt } = input;

  const reporterRole = orgTypeToReporterRole(organization.orgType);
  const caseProvince = input.eventJurisdictionProvince ?? pet.jurisdictionProvince;
  const caseLocality = input.eventJurisdictionLocality ?? pet.jurisdictionLocality;

  // eventAuthorship for org: authorRole=vet when vet, shelter otherwise
  const eventAuthorship = {
    authorRole: reporterRole === "vet" ? ("vet" as const) : ("shelter" as const),
    authorOrganizationId: organization.id,
    authorVerified: organization.verified,
  };

  // 1. Snapshot rabies-vaccine status pre-tx.
  const latestVaccineEvent = await repo.findLatestRabiesVaccineEvent(pet.id);
  const rabiesVaccineValid = isRabiesVaccineValid(latestVaccineEvent, occurredAt);

  const now = new Date();
  const observationUntil = computeObservationUntil(occurredAt);
  const pendingNotifications: NewNotification[] = [];

  try {
    await transaction(async (tx) => {
      // 2. Open bite_incident case (event jurisdiction overrides pet jurisdiction).
      const caseRow = await openCase(
        {
          kind: "bite_incident",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: caseProvince,
          jurisdictionLocality: caseLocality,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          openedReason: `Bite incident reported by ${organization.displayName} (${reporterRole}) — victim=${input.victimKind}, severity=${input.severity}`,
        },
        tx,
      );

      // 3. Plain insert (org path — NOT idempotent, parity asymmetry preserved).
      const incidentPayload = validateEventPayload("incident_reported", {
        incident_type: "bite_inflicted",
        severity: input.severity,
        injuries_summary: input.injuriesSummary,
        vet_involved: input.vetInvolved,
        location_description: input.locationDescription,
        victim_kind: input.victimKind,
        victim_contact_name: input.victimContactName,
        victim_contact_phone: input.victimContactPhone,
        victim_pet_id: null,
        victim_age_estimate: input.victimAgeEstimate,
        context: input.context,
        rabies_vaccine_valid_at_incident: rabiesVaccineValid,
        reporter_role: reporterRole,
        jurisdiction_province: input.eventJurisdictionProvince,
        jurisdiction_locality: input.eventJurisdictionLocality,
      });

      const biteEvent = await repo.insertIncidentEvent(
        {
          petId: pet.id,
          eventType: "incident_reported",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: incidentPayload,
          caseId: caseRow.id,
        } as Parameters<typeof repo.insertIncidentEvent>[0],
        tx as Parameters<typeof repo.insertIncidentEvent>[1],
      );

      // 4. Insert rabies_observation_started.
      const observationPayload = validateEventPayload("rabies_observation_started", {
        bite_event_id: biteEvent.id,
        observation_until: observationUntil.toISOString(),
        location: "in_situ",
        official_site_organization_id: null,
      });
      await repo.insertObservationStarted(
        {
          petId: pet.id,
          eventType: "rabies_observation_started",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: observationPayload,
          caseId: caseRow.id,
        } as Parameters<typeof repo.insertObservationStarted>[0],
        tx as Parameters<typeof repo.insertObservationStarted>[1],
      );

      // 5. Update pet status.
      await repo.setObservationStatus(
        pet.id,
        "in_progress",
        now,
        tx as Parameters<typeof repo.setObservationStatus>[3],
      );

      // 6. Notify the active owner (inside tx — they need to know their pet was reported by 3rd party).
      const activeOwnership = await repo.findActiveOwnership(
        pet.id,
        tx as Parameters<typeof repo.findActiveOwnership>[1],
      );
      if (activeOwnership?.ownerUserId) {
        pendingNotifications.push({
          userId: activeOwnership.ownerUserId,
          notificationType: "bite_reported_by_org_owner",
          severity: "warning",
          title: `Mordedura reportada por ${organization.displayName} — ${pet.name}`,
          body: `${organization.displayName} reportó una mordedura del ${occurredAt.toLocaleDateString("es-AR")} en ${pet.name}. Inicia un período de observación antirrábica de 10 días. Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}. Si discrepás con el reporte, contactá al refugio/clínica o a tu autoridad sanitaria.`,
          relatedPetId: pet.id,
          relatedCaseId: caseRow.id,
          ctaLabel: "Ver mascota",
          ctaUrl: `/mis-mascotas/${pet.publicToken}`,
        });
      }
    });
  } catch (err) {
    console.error("reportBiteFromOrg tx failed:", err);
    return {
      ok: false,
      error: `No se pudo reportar la mordedura: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // 7. Authority fan-out (best-effort — post-tx).
  if (pet.jurisdictionProvince && pet.jurisdictionLocality) {
    try {
      const authorityIds = await findAuthoritiesForJurisdiction({
        province: pet.jurisdictionProvince,
        locality: pet.jurisdictionLocality,
      });
      for (const authorityId of authorityIds) {
        pendingNotifications.push({
          userId: authorityId,
          notificationType: "bite_reported_authority",
          severity: input.severity === "severe" ? "urgent" : "warning",
          title: `Mordedura reportada — ${pet.name} (${pet.species})`,
          body: `Reportada por ${organization.displayName} (${reporterRole}). Víctima: ${input.victimKind}. Severidad: ${input.severity}. Antirrábica vigente al momento: ${rabiesVaccineValid ? "sí" : "NO"}. Observación 10 días iniciada.`,
          relatedPetId: pet.id,
          // Authority recipient: surveillance hub (cannot open /mis-mascotas).
          ctaLabel: "Ver vigilancia",
          ctaUrl: "/gob/vigilancia",
        });
      }
    } catch (err) {
      console.error("reportBiteFromOrg authority fan-out failed:", err);
    }
  }

  return {
    ok: true,
    value: {
      petToken: input.noRedirect ? pet.publicToken : undefined,
      noRedirect: input.noRedirect,
    },
    notifications: pendingNotifications,
  };
}
