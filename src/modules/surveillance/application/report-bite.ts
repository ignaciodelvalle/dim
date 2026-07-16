// Use-case: report-bite (owner path).
//
// Migrated from app/actions/bite.ts::reportBiteAction.
// Auth (requireAlivePetAccess) handled by caller (actions.ts).
//
// Parity quirks:
//   - Uses insertIncidentEventIdempotent (owner path only — org-bite uses plain insert).
//   - biteNoop early return: when idempotency key hits, skip observation + notifications.
//   - rabiesVaccineValid computed pre-tx via repo.findLatestRabiesVaccineEvent.
//   - Authority fan-out is post-tx best-effort — callers must handle.
//   - AUDIT_LOG: NONE (bite actions never wrote audit_log — preserve absence).

import { validateEventPayload } from "@/lib/events/event-schemas";
import { AR_TIME_ZONE, speciesLabel } from "@/lib/utils/format";

import type { OpenedReason } from "@/src/modules/cases/domain/opened-reason";
import { computeObservationUntil, isRabiesVaccineValid } from "../domain/rabies-observation";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import type { NewNotification, UseCaseResult } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportBiteInput = {
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
  eventAuthorship: {
    authorRole: string;
    authorOrganizationId: string | null;
    authorVerified: boolean;
  };
  occurredAt: Date;
  victimKind: "human" | "animal" | "unknown";
  severity: "minor" | "moderate" | "severe";
  locationDescription: string | null;
  context: string | null;
  victimContactName: string | null;
  victimContactPhone: string | null;
  victimAgeEstimate: string | null;
  clientIdempotencyKey: string | null;
  eventJurisdictionProvince: string | null;
  eventJurisdictionLocality: string | null;
  // panorama-event-points Slice 2: the incident coordinate (optional) captured by
  // the bite form's map pin, persisted COLUMNAR on the event so the mordeduras
  // near-zoom dot loader (loadBiteEvents) can plot it. Null when the reporter
  // dropped no pin → the bite is counted into the "sin ubicación exacta" residual,
  // never a faked centroid dot.
  locationLat: number | null;
  locationLng: number | null;
  locationSource: "gps" | "pin_manual" | "geocodificada" | null;
};

type Deps = {
  repo: Pick<
    SurveillanceRepository,
    | "findLatestRabiesVaccineEvent"
    | "insertIncidentEventIdempotent"
    | "insertObservationStarted"
    | "setObservationStatus"
    | "findGovtTargetsForJurisdiction"
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
      openedReason: OpenedReason;
    },
    tx: unknown,
  ) => Promise<{ id: string; publicCode: string }>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  findAuthoritiesForJurisdiction: (jurisdiction: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
};

export type ReportBiteResult = UseCaseResult<{ petToken: string; casePublicCode: string }>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function reportBite(input: ReportBiteInput, deps: Deps): Promise<ReportBiteResult> {
  const { repo, openCase, transaction, findAuthoritiesForJurisdiction } = deps;
  const { pet, user, eventAuthorship, occurredAt } = input;

  // 1. Snapshot rabies-vaccine status at the moment of the bite (pre-tx).
  const latestVaccineEvent = await repo.findLatestRabiesVaccineEvent(pet.id);
  const rabiesVaccineValid = isRabiesVaccineValid(latestVaccineEvent, occurredAt);

  const now = new Date();
  const observationUntil = computeObservationUntil(occurredAt);
  const pendingNotifications: NewNotification[] = [];
  // Case public code (CAS-XXXX-XXXX) — surfaced on the bite receipt so the
  // reporter can quote the incident later. Captured inside the tx.
  let casePublicCode = "";

  try {
    await transaction(async (tx) => {
      // 2. Open bite_incident case (pet jurisdiction).
      const caseRow = await openCase(
        {
          kind: "bite_incident",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedByUserId: user.id,
          openedReason: {
            code: "bite_reported_owner",
            victimKind: input.victimKind,
            severity: input.severity,
          },
        },
        tx,
      );
      casePublicCode = caseRow.publicCode;

      // 3. Insert incident_reported with idempotency key (owner path only).
      const incidentPayload = validateEventPayload("incident_reported", {
        incident_type: "bite_inflicted",
        severity: input.severity,
        injuries_summary: null,
        vet_involved: null,
        location_description: input.locationDescription,
        victim_kind: input.victimKind,
        victim_contact_name: input.victimContactName,
        victim_contact_phone: input.victimContactPhone,
        victim_pet_id: null,
        victim_age_estimate: input.victimAgeEstimate,
        context: input.context,
        rabies_vaccine_valid_at_incident: rabiesVaccineValid,
        reporter_role: "owner",
        jurisdiction_province: input.eventJurisdictionProvince,
        jurisdiction_locality: input.eventJurisdictionLocality,
        location_source: input.locationSource,
      });

      const { event: biteEvent, wasNoop: biteNoop } = await repo.insertIncidentEventIdempotent(
        {
          petId: pet.id,
          eventType: "incident_reported",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: incidentPayload,
          caseId: caseRow.id,
          clientIdempotencyKey: input.clientIdempotencyKey,
          // panorama-event-points Slice 2: persist the incident point COLUMNAR (numeric
          // string), mirroring the sighting writer. Null-coord bites fall into the residual.
          locationLat: input.locationLat != null ? String(input.locationLat) : null,
          locationLng: input.locationLng != null ? String(input.locationLng) : null,
        } as Parameters<typeof repo.insertIncidentEventIdempotent>[0],
        tx as Parameters<typeof repo.insertIncidentEventIdempotent>[1],
      );

      // 4. Idempotency noop — exit early, no observation, no notifications.
      if (biteNoop) return;

      // 5. Insert rabies_observation_started.
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

      // 6. Update pet status to in_progress.
      await repo.setObservationStatus(
        pet.id,
        "in_progress",
        now,
        tx as Parameters<typeof repo.setObservationStatus>[3],
      );

      // 7. Queue owner notification.
      pendingNotifications.push({
        userId: user.id,
        notificationType: "rabies_observation_started_owner",
        severity: "warning",
        title: `Observación antirrábica iniciada — ${pet.name}`,
        body: `Por la mordedura del ${occurredAt.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}, ${pet.name} entra en observación antirrábica de 10 días. Cierre estimado: ${observationUntil.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}. Si notás síntomas raros (salivación excesiva, agresividad inusual, parálisis), consultá al veterinario de inmediato.`,
        relatedPetId: pet.id,
        relatedCaseId: caseRow.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${pet.publicToken}`,
      });
    });
  } catch (err) {
    console.error("reportBite tx failed:", err);
    return {
      ok: false,
      error: `No se pudo reportar la mordedura: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // 8. Authority fan-out (best-effort — post-tx). Add to pendingNotifications.
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
          title: `Mordedura reportada — ${pet.name} (${speciesLabel(pet.species)})`,
          body: `Reportada por el dueño. Víctima: ${input.victimKind}. Severidad: ${input.severity}. Antirrábica vigente al momento: ${rabiesVaccineValid ? "sí" : "NO"}. Observación 10 días iniciada.`,
          relatedPetId: pet.id,
          // Authority recipient: surveillance hub (cannot open /mis-mascotas).
          ctaLabel: "Ver vigilancia",
          ctaUrl: "/gob/vigilancia",
        });
      }
    } catch (err) {
      console.error("reportBite authority fan-out failed:", err);
    }
  }

  return {
    ok: true,
    value: { petToken: pet.publicToken, casePublicCode },
    notifications: pendingNotifications,
  };
}
