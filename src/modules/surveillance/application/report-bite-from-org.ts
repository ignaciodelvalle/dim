// Use-case: report-bite-from-org (org path).
//
// Migrated from app/actions/bite.ts::reportBiteFromOrgAction.
// Auth (requireCapability("bite.report")) handled by caller (actions.ts).
//
// Parity quirks:
//   - Uses insertIncidentEventIdempotent (aligned with owner path in v1.0 fix/idempotency-guards).
//   - reporter_role derived from orgTypeToReporterRole (domain/bite.ts).
//   - Active owner notified inside tx; authority fan-out post-tx.
//   - noRedirect=1 returns { ok, petToken } instead of triggering redirect.
//   - AUDIT_LOG: NONE.

import { validateEventPayload } from "@/lib/events/event-schemas";
import { AR_TIME_ZONE, speciesLabel } from "@/lib/utils/format";

import type { OpenedReason } from "@/src/modules/cases/domain/opened-reason";
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
  clientIdempotencyKey: string | null;
  // panorama-event-points Slice 2: optional incident coordinate from the org bite
  // form's map pin, persisted COLUMNAR so the mordeduras near-zoom dot loader can
  // plot it. Null when no pin was dropped (counted into the residual, never faked).
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
      openedReason: OpenedReason;
    },
    tx: unknown,
  ) => Promise<{ id: string; publicCode: string }>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  findAuthoritiesForJurisdiction: (jurisdiction: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
  /**
   * A1 — the per-jurisdiction `rabies_observation_window` business rule,
   * resolved against the INCIDENT jurisdiction at report time (see
   * report-bite.ts for the prospective-deadline rationale).
   */
  resolveObservationWindow: (jurisdiction: {
    province: string | null;
    locality: string | null;
  }) => Promise<{ days: number }>;
  /**
   * Who is signing, and with what authority — read from the SIGNER's validated
   * matrícula, never from the organization's `verified` flag or its org_type.
   * Injected rather than imported so this use case keeps its no-DB shape.
   *
   * See the authorship note at the call in the body for what it replaced.
   */
  resolveSignerProvenance: (
    userId: string,
    organizationId: string,
  ) => Promise<{ authorRole: "vet" | "shelter"; authorVerified: boolean }>;
};

export type ReportBiteFromOrgResult = UseCaseResult<{
  petToken: string | undefined;
  noRedirect: boolean;
  casePublicCode: string;
}>;

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function reportBiteFromOrg(
  input: ReportBiteFromOrgInput,
  deps: Deps,
): Promise<ReportBiteFromOrgResult> {
  const { repo, openCase, transaction, findAuthoritiesForJurisdiction, resolveObservationWindow } =
    deps;
  const { pet, user, organization, occurredAt } = input;

  const reporterRole = orgTypeToReporterRole(organization.orgType);
  // LEGAL-ROUTING fix: incident jurisdiction (LocalityPickerAcross in
  // OrgBiteForm, or the map-pin reverse-geocode) overrides the pet's home
  // jurisdiction for BOTH the opened case AND the authority notification
  // fan-out below — a bite is the incident authority's problem, not the home
  // registry's. Falls back to pet home only when no incident location was
  // captured.
  const caseProvince = input.eventJurisdictionProvince ?? pet.jurisdictionProvince;
  const caseLocality = input.eventJurisdictionLocality ?? pet.jurisdictionLocality;

  // AUTHORSHIP — #43/#45 provenance, applied here late (2026-08-17).
  //
  // This block used to read:
  //   authorRole: reporterRole === "vet" ? "vet" : "shelter"   // from org_type
  //   authorVerified: organization.verified                    // from the org
  //
  // Both halves asked the ORGANIZATION a question only the PERSON can answer.
  // `orgTypeToReporterRole` maps org_type "clinic" to "vet", so every bite
  // report filed from a veterinaria was stamped authorRole "vet"; pairing that
  // with the org's `verified` flag — which an admin sets with one click —
  // resolved to `professional_verified` in computeConfidence, whose own table
  // defines that tier as "licensed veterinarian with verified matriculation".
  // A receptionist filing the report got the matriculated vet's seal, and this
  // is the path that opens a rabies observation window: a legally consequential
  // act (Ley 22.953) carrying a provenance claim nobody checked.
  //
  // `reporterRole` below still comes from org_type, and correctly so — it
  // records WHAT KIND of institution reported, which is a fact about the org.
  // Only the authorship claim moved to the signer.
  const signer = await deps.resolveSignerProvenance(user.id, organization.id);
  const eventAuthorship = {
    authorRole: signer.authorRole,
    authorOrganizationId: organization.id,
    authorVerified: signer.authorVerified,
  };

  // 1. Snapshot rabies-vaccine status pre-tx.
  const latestVaccineEvent = await repo.findLatestRabiesVaccineEvent(pet.id);
  const rabiesVaccineValid = isRabiesVaccineValid(latestVaccineEvent, occurredAt);

  const now = new Date();
  // A1 — the statutory window comes from the rules engine (same jurisdiction
  // the case routes to), not a hardcoded constant the dashboard disagrees with.
  const rabiesWindow = await resolveObservationWindow({
    province: caseProvince,
    locality: caseLocality,
  });
  const observationUntil = computeObservationUntil(occurredAt, rabiesWindow.days);
  const pendingNotifications: NewNotification[] = [];
  // Case public code (CAS-XXXX-XXXX) — surfaced on the bite receipt so the
  // clinic/refugio can quote the incident later. Captured inside the tx.
  let casePublicCode = "";

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
          openedReason: {
            code: "bite_reported_org",
            orgDisplayName: organization.displayName,
            reporterRole,
            victimKind: input.victimKind,
            severity: input.severity,
          },
        },
        tx,
      );
      casePublicCode = caseRow.publicCode;

      // 3. Idempotent insert (aligned with owner path — deduplicates on double-submit).
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

      // Idempotency: skip observation + notifications when the bite event
      // already exists (same key — double-submit or retry).
      if (biteNoop) return;

      // 4. Insert rabies_observation_started.
      const observationPayload = validateEventPayload("rabies_observation_started", {
        bite_event_id: biteEvent.id,
        observation_until: observationUntil.toISOString(),
        // Record the window that was actually applied, not just its end date:
        // downstream copy quotes a day count and, until 2026-08-17, quoted the
        // national 10 at owners whose jurisdiction runs 14.
        observation_days: rabiesWindow.days,
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
          // Same rule as the owner-side reporter (report-bite.ts, N2-a): the
          // observation is opened by law, not declared by whoever reported the
          // bite, so the asiento is authored by the system. Fixed in both
          // writers at once — one of them keeping the reporter's authorship
          // would just move the false stamp to the org path.
          authorRole: "system",
          authorOrganizationId: null,
          authorVerified: false,
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
          body: `${organization.displayName} reportó una mordedura del ${occurredAt.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })} en ${pet.name}. Inicia un período de observación antirrábica de ${rabiesWindow.days} días. Cierre estimado: ${observationUntil.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}. Si discrepás con el reporte, contactá al refugio/clínica o a tu autoridad sanitaria.`,
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

  // 7. Authority fan-out (best-effort — post-tx). Routes to the INCIDENT
  // jurisdiction (caseProvince/caseLocality), not the pet's home.
  //
  // A null jurisdiction does NOT skip the resolver (2026-08-17) — see the twin
  // comment in report-bite.ts. The guard used to mean the admin fallback never
  // ran for an incident with no geocoded jurisdiction.
  try {
    const authorityIds = await findAuthoritiesForJurisdiction({
      province: caseProvince ?? "",
      locality: caseLocality ?? "",
    });
    for (const authorityId of authorityIds) {
      pendingNotifications.push({
        userId: authorityId,
        notificationType: "bite_reported_authority",
        severity: input.severity === "severe" ? "urgent" : "warning",
        title: `Mordedura reportada — ${pet.name} (${speciesLabel(pet.species)})`,
        body: `Reportada por ${organization.displayName} (${reporterRole}). Víctima: ${input.victimKind}. Severidad: ${input.severity}. Antirrábica vigente al momento: ${rabiesVaccineValid ? "sí" : "NO"}. Observación de ${rabiesWindow.days} días iniciada.`,
        relatedPetId: pet.id,
        // Authority recipient: surveillance hub (cannot open /mis-mascotas).
        ctaLabel: "Ver vigilancia",
        ctaUrl: "/gob/vigilancia",
      });
    }
  } catch (err) {
    console.error("reportBiteFromOrg authority fan-out failed:", err);
  }

  return {
    ok: true,
    value: {
      petToken: input.noRedirect ? pet.publicToken : undefined,
      noRedirect: input.noRedirect,
      casePublicCode,
    },
    notifications: pendingNotifications,
  };
}
