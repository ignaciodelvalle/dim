"use server";

// Bite reporting + 10-day rabies observation lifecycle. See
// docs/superpowers/specs/2026-05-18-bite-rabies-observation-design.md v1.1.
//
// Bites are NOT a standalone event_type. They live inside `incident_reported`
// with `payload.incident_type='bite_inflicted'`. The atomic insert pair is:
//   1) incident_reported (the bite)
//   2) rabies_observation_started (the 10-day clock)
// plus a pets.rabies_observation_status='in_progress' dual-write.
//
// Authority notifications are best-effort — if they fail, the bite still
// registers (per spec D14). The two pet_events inserts and the pets UPDATE
// are atomic; authority routing happens outside the tx.

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { cases, db, notifications, ownerships, petEvents, pets } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { closeCase, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { requireAlivePetAccess } from "@/lib/pet-access";
import {
  type RabiesObservationOutcome,
  computeObservationUntil,
  outcomeToStatus,
} from "@/lib/rabies-observation";

export type BiteFormState = { error: string | null };

// Looks up the most recent vaccination_administered event whose payload
// vaccine_name matches "antirrábica" (case + accent insensitive in Spanish)
// or English "rabies". Computes whether the vaccine was still current at the
// moment of the bite. If next_due_at is missing, defaults to a 1-year window
// from administration date (common veterinary practice for the AR rabies vaccine).
async function computeRabiesVaccineValidAtBite(petId: string, biteDate: Date): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "vaccination_administered"),
        sql`(${petEvents.payload}->>'vaccine_name') ~* '(antirr[áa]bica|rabies)'`,
      ),
    )
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  if (!latest) return false;
  const payload = latest.payload as Record<string, unknown>;
  const nextDueAt = payload.next_due_at;
  if (typeof nextDueAt === "string") {
    const due = new Date(nextDueAt);
    if (Number.isFinite(due.getTime())) return due > biteDate;
  }
  // Fallback: assume valid for 1 year from administered date.
  const administered = new Date(latest.occurredAt);
  if (!Number.isFinite(administered.getTime())) return false;
  const oneYearLater = new Date(administered);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return oneYearLater > biteDate;
}

export async function reportBiteAction(
  publicToken: string,
  _prev: BiteFormState,
  formData: FormData,
): Promise<BiteFormState> {
  // 1. Auth + pet access (alive pets only).
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  // 2. Refuse if an observation is already active.
  if (pet.rabiesObservationStatus === "in_progress") {
    return {
      error: "Esta mascota ya está en observación antirrábica por otra mordedura activa.",
    };
  }

  // 3. Parse + validate form input.
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!occurredAtRaw) return { error: "Indicá la fecha del incidente." };
  const occurredAt = new Date(occurredAtRaw);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { error: "Fecha del incidente inválida." };
  }
  if (occurredAt > new Date()) return { error: "La fecha no puede ser futura." };

  const victimKindRaw = String(formData.get("victimKind") ?? "");
  if (!["human", "animal", "unknown"].includes(victimKindRaw)) {
    return { error: "Indicá el tipo de víctima." };
  }
  const victimKind = victimKindRaw as "human" | "animal" | "unknown";

  const severityRaw = String(formData.get("severity") ?? "");
  if (!["minor", "moderate", "severe"].includes(severityRaw)) {
    return { error: "Indicá la severidad." };
  }
  const severity = severityRaw as "minor" | "moderate" | "severe";

  const confirmed = formData.get("confirmObservation") === "on";
  if (!confirmed) {
    return {
      error:
        "Tenés que confirmar que entendés que esto inicia una observación obligatoria de 10 días.",
    };
  }

  const locationDescription = String(formData.get("locationDescription") ?? "").trim() || null;
  const context = String(formData.get("context") ?? "").trim() || null;
  const victimContactName = String(formData.get("victimContactName") ?? "").trim() || null;
  const victimContactPhone = String(formData.get("victimContactPhone") ?? "").trim() || null;
  const victimAgeEstimate = String(formData.get("victimAgeEstimate") ?? "").trim() || null;

  // 4. Snapshot rabies-vaccine status at the moment of the bite.
  const rabiesVaccineValid = await computeRabiesVaccineValidAtBite(pet.id, occurredAt);

  const now = new Date();
  const observationUntil = computeObservationUntil(occurredAt);

  // 5. Atomic: open bite_incident case + incident_reported +
  //    rabies_observation_started + pet UPDATE + owner notification.
  //    Authority notifications are best-effort (post-tx).
  try {
    await db.transaction(async (tx) => {
      // Cases system (Fase D2): open the bite_incident case first so the
      // 2 events that follow carry its case_id.
      const caseRow = await openCase(
        {
          kind: "bite_incident",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedByUserId: user.id,
          openedReason: `Bite incident reported by owner — victim=${victimKind}, severity=${severity}`,
        },
        tx,
      );

      const incidentPayload = validateEventPayload("incident_reported", {
        incident_type: "bite_inflicted",
        severity,
        injuries_summary: null,
        vet_involved: null,
        location_description: locationDescription,
        victim_kind: victimKind,
        victim_contact_name: victimContactName,
        victim_contact_phone: victimContactPhone,
        victim_pet_id: null,
        victim_age_estimate: victimAgeEstimate,
        context,
        rabies_vaccine_valid_at_incident: rabiesVaccineValid,
        reporter_role: "owner",
      });
      const [biteEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "incident_reported",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: incidentPayload,
          caseId: caseRow.id,
        })
        .returning();

      const observationPayload = validateEventPayload("rabies_observation_started", {
        bite_event_id: biteEvent.id,
        observation_until: observationUntil.toISOString(),
        location: "in_situ",
        official_site_organization_id: null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "rabies_observation_started",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        ...eventAuthorship,
        payload: observationPayload,
        caseId: caseRow.id,
      });

      await tx
        .update(pets)
        .set({ rabiesObservationStatus: "in_progress", updatedAt: now })
        .where(eq(pets.id, pet.id));

      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "rabies_observation_started_owner",
        severity: "warning",
        title: `Observación antirrábica iniciada — ${pet.name}`,
        body: `Por la mordedura del ${occurredAt.toLocaleDateString("es-AR")}, ${pet.name} entra en observación antirrábica de 10 días. Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}. Si notás síntomas raros (salivación excesiva, agresividad inusual, parálisis), consultá al veterinario de inmediato.`,
        relatedPetId: pet.id,
        relatedCaseId: caseRow.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${pet.publicToken}`,
      });
    });
  } catch (err) {
    console.error("reportBiteAction tx failed:", err);
    return {
      error: `No se pudo reportar la mordedura: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // 6. Best-effort: notify authorities in the pet's jurisdiction. Failure does
  //    NOT undo the bite — it's already in the immutable log (spec D14).
  try {
    if (pet.jurisdictionProvince && pet.jurisdictionLocality) {
      const authorityIds = await findAuthoritiesForJurisdiction({
        province: pet.jurisdictionProvince,
        locality: pet.jurisdictionLocality,
      });
      if (authorityIds.length > 0) {
        await db.insert(notifications).values(
          authorityIds.map((authorityId) => ({
            userId: authorityId,
            notificationType: "bite_reported_authority",
            severity: severity === "severe" ? ("urgent" as const) : ("warning" as const),
            title: `Mordedura reportada — ${pet.name} (${pet.species})`,
            body: `Reportada por el dueño. Víctima: ${victimKind}. Severidad: ${severity}. Antirrábica vigente al momento: ${rabiesVaccineValid ? "sí" : "NO"}. Observación 10 días iniciada.`,
            relatedPetId: pet.id,
          })),
        );
      }
    }
  } catch (err) {
    console.error("reportBiteAction authority notification failed:", err);
  }

  revalidatePath(`/mis-mascotas/${publicToken}`);
  redirect(`/mis-mascotas/${publicToken}?evento=mordedura_reportada`);
}

// Owner closes the observation manually after 10 days. Restricted to the
// happy path: outcome='negative', no escalating symptoms during the period.
// Escalating symptom_observed events with rabies_suspected in
// alerted_disease_codes force professional closure (vet/govt).
export async function ownerCloseRabiesObservationAction(
  publicToken: string,
): Promise<{ error: string | null }> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  if (pet.rabiesObservationStatus !== "in_progress") {
    return { error: "No hay observación activa que cerrar." };
  }

  const [startedEvent] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "rabies_observation_started")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  if (!startedEvent) {
    return { error: "Inconsistencia interna: status in_progress sin evento started." };
  }

  const startedPayload = startedEvent.payload as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;
  if (!observationUntil || !Number.isFinite(observationUntil.getTime())) {
    return { error: "Inconsistencia interna: observation_until inválido." };
  }

  const now = new Date();
  if (now < observationUntil) {
    return {
      error: `Aún no se cumplieron los 10 días. Esperá hasta el ${observationUntil.toLocaleDateString(
        "es-AR",
      )}.`,
    };
  }

  // Block if any symptom_observed during the period flagged rabies_suspected.
  const escalating = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "symptom_observed"),
        gte(petEvents.occurredAt, startedEvent.occurredAt),
        sql`(${petEvents.payload}->'alerted_disease_codes') @> '"rabies_suspected"'::jsonb`,
      ),
    )
    .limit(1);
  if (escalating.length > 0) {
    return {
      error:
        "Hubo síntomas compatibles con rabia durante la observación. Este cierre requiere intervención profesional (veterinario o autoridad sanitaria). Contactá a tu vet.",
    };
  }

  const biteEventId = startedPayload.bite_event_id as string;
  // Cases system (Fase D2): find the open bite_incident case to attach
  // the ended event + close. Falls back to null when no case exists
  // (legacy rows from before D2).
  const [biteCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "bite_incident"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      const endedPayload = validateEventPayload("rabies_observation_ended", {
        bite_event_id: biteEventId,
        observation_started_event_id: startedEvent.id,
        outcome: "negative",
        closed_by_role: "owner",
        closure_notes: "Cerrado por dueño tras 10 días sin síntomas escalables",
        death_event_id: null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "rabies_observation_ended",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        ...eventAuthorship,
        payload: endedPayload,
        caseId: biteCase?.id ?? null,
      });
      await tx
        .update(pets)
        .set({ rabiesObservationStatus: "completed_negative", updatedAt: now })
        .where(eq(pets.id, pet.id));
      if (biteCase) {
        await closeCase({ caseId: biteCase.id, reason: "resolved", closedByUserId: user.id }, tx);
      }
      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "rabies_observation_completed_negative_owner",
        severity: "info",
        title: `Observación completada — ${pet.name}`,
        body: `La observación antirrábica de 10 días terminó sin incidentes. ${pet.name} sigue normal.`,
        relatedPetId: pet.id,
        relatedCaseId: biteCase?.id ?? null,
      });
    });
  } catch (err) {
    console.error("ownerCloseRabiesObservationAction failed:", err);
    return {
      error: `No se pudo cerrar la observación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath(`/mis-mascotas/${publicToken}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Org-side reporting (Fase 4)
// ---------------------------------------------------------------------------
//
// Vets and shelter coordinators with the `bite.report` capability can register
// a bite on a pet they do NOT custody — a witnessed or clinically-known
// incident on a pet held by some other party (owner-held, or another org).
// The flow mirrors reportBiteAction but:
//   - auth via requireCapability instead of pet ownership
//   - reporter_role mapped from organizations.org_type
//   - authorRole + authorOrganizationId set to the acting org
//   - the pet's owner (if any) gets a warning-level notification so they're
//     aware their pet was reported as biting

// Maps the org's org_type to the reporter_role enum used inside
// incident_reported.payload. Defaults to "witness" for org types that don't
// fit one of the medical/animal-welfare buckets.
function orgTypeToReporterRole(orgType: string): "vet" | "shelter" | "govt" | "witness" {
  switch (orgType) {
    case "clinic":
      return "vet";
    case "shelter":
    case "rescue_network":
      return "shelter";
    case "sanitary_authority":
      return "govt";
    default:
      return "witness";
  }
}

export type ReportBiteFromOrgFormState = { error: string | null };

export async function reportBiteFromOrgAction(
  orgToken: string,
  _prev: ReportBiteFromOrgFormState,
  formData: FormData,
): Promise<ReportBiteFromOrgFormState> {
  // 1. Capability gate. We don't pre-scope to a specific org here — the
  // requireCapability helper resolves the most-recently-joined active
  // membership when organizationId is undefined; the caller passes
  // organizationId explicitly when navigating from a specific org portal.
  // (The route binds orgToken; we re-resolve via the membership lookup below.)
  const cap = await requireCapability("bite.report");
  if (cap.error !== null) return { error: cap.error };
  const { user, organization } = cap;

  // 2. Locate the target pet by public_token from the form.
  const petPublicTokenRaw = String(formData.get("petPublicToken") ?? "").trim();
  if (!petPublicTokenRaw) return { error: "Indicá el token público de la mascota." };
  const [pet] = await db
    .select()
    .from(pets)
    .where(eq(pets.publicToken, petPublicTokenRaw))
    .limit(1);
  if (!pet) return { error: "No encontramos una mascota con ese token." };
  if (pet.status === "deceased") {
    return { error: "Esta mascota está registrada como fallecida." };
  }
  if (pet.rabiesObservationStatus === "in_progress") {
    return {
      error: "Esta mascota ya está en observación antirrábica por otra mordedura activa.",
    };
  }

  // 3. Parse the bite-specific fields (same shape as reportBiteAction).
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!occurredAtRaw) return { error: "Indicá la fecha del incidente." };
  const occurredAt = new Date(occurredAtRaw);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { error: "Fecha del incidente inválida." };
  }
  if (occurredAt > new Date()) return { error: "La fecha no puede ser futura." };

  const victimKindRaw = String(formData.get("victimKind") ?? "");
  if (!["human", "animal", "unknown"].includes(victimKindRaw)) {
    return { error: "Indicá el tipo de víctima." };
  }
  const victimKind = victimKindRaw as "human" | "animal" | "unknown";

  const severityRaw = String(formData.get("severity") ?? "");
  if (!["minor", "moderate", "severe"].includes(severityRaw)) {
    return { error: "Indicá la severidad." };
  }
  const severity = severityRaw as "minor" | "moderate" | "severe";

  if (formData.get("confirmObservation") !== "on") {
    return {
      error:
        "Tenés que confirmar que entendés que esto inicia una observación obligatoria de 10 días.",
    };
  }

  const locationDescription = String(formData.get("locationDescription") ?? "").trim() || null;
  const context = String(formData.get("context") ?? "").trim() || null;
  const victimContactName = String(formData.get("victimContactName") ?? "").trim() || null;
  const victimContactPhone = String(formData.get("victimContactPhone") ?? "").trim() || null;
  const victimAgeEstimate = String(formData.get("victimAgeEstimate") ?? "").trim() || null;
  const injuriesSummary = String(formData.get("injuriesSummary") ?? "").trim() || null;
  const vetInvolved = formData.get("vetInvolved") === "on";

  // 4. Snapshot rabies-vaccine status at the moment of the bite.
  const rabiesVaccineValid = await computeRabiesVaccineValidAtBite(pet.id, occurredAt);

  const reporterRole = orgTypeToReporterRole(organization.orgType);
  const now = new Date();
  const observationUntil = computeObservationUntil(occurredAt);
  const eventAuthorship = {
    authorRole: reporterRole === "vet" ? ("vet" as const) : ("shelter" as const),
    authorOrganizationId: organization.id,
    authorVerified: organization.verified,
  };

  // 5. Atomic: open bite_incident case + incident_reported +
  //    rabies_observation_started + pet UPDATE.
  try {
    await db.transaction(async (tx) => {
      // Cases system (Fase D2): open bite_incident case attributed to the
      // reporting org.
      const caseRow = await openCase(
        {
          kind: "bite_incident",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince,
          jurisdictionLocality: pet.jurisdictionLocality,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          openedReason: `Bite incident reported by ${organization.displayName} (${reporterRole}) — victim=${victimKind}, severity=${severity}`,
        },
        tx,
      );

      const incidentPayload = validateEventPayload("incident_reported", {
        incident_type: "bite_inflicted",
        severity,
        injuries_summary: injuriesSummary,
        vet_involved: vetInvolved,
        location_description: locationDescription,
        victim_kind: victimKind,
        victim_contact_name: victimContactName,
        victim_contact_phone: victimContactPhone,
        victim_pet_id: null,
        victim_age_estimate: victimAgeEstimate,
        context,
        rabies_vaccine_valid_at_incident: rabiesVaccineValid,
        reporter_role: reporterRole,
      });
      const [biteEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "incident_reported",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: incidentPayload,
          caseId: caseRow.id,
        })
        .returning();

      const observationPayload = validateEventPayload("rabies_observation_started", {
        bite_event_id: biteEvent.id,
        observation_until: observationUntil.toISOString(),
        location: "in_situ",
        official_site_organization_id: null,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "rabies_observation_started",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        ...eventAuthorship,
        payload: observationPayload,
        caseId: caseRow.id,
      });

      await tx
        .update(pets)
        .set({ rabiesObservationStatus: "in_progress", updatedAt: now })
        .where(eq(pets.id, pet.id));

      // Notify the pet's active owner — they need to know their pet was
      // reported as biting by a third party.
      const [activeOwnership] = await tx
        .select({ ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (activeOwnership?.ownerUserId) {
        await tx.insert(notifications).values({
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
    console.error("reportBiteFromOrgAction tx failed:", err);
    return {
      error: `No se pudo reportar la mordedura: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // 6. Best-effort authority notification.
  try {
    if (pet.jurisdictionProvince && pet.jurisdictionLocality) {
      const authorityIds = await findAuthoritiesForJurisdiction({
        province: pet.jurisdictionProvince,
        locality: pet.jurisdictionLocality,
      });
      if (authorityIds.length > 0) {
        await db.insert(notifications).values(
          authorityIds.map((authorityId) => ({
            userId: authorityId,
            notificationType: "bite_reported_authority",
            severity: severity === "severe" ? ("urgent" as const) : ("warning" as const),
            title: `Mordedura reportada — ${pet.name} (${pet.species})`,
            body: `Reportada por ${organization.displayName} (${reporterRole}). Víctima: ${victimKind}. Severidad: ${severity}. Antirrábica vigente al momento: ${rabiesVaccineValid ? "sí" : "NO"}. Observación 10 días iniciada.`,
            relatedPetId: pet.id,
          })),
        );
      }
    }
  } catch (err) {
    console.error("reportBiteFromOrgAction authority notification failed:", err);
  }

  revalidatePath(`/org/${orgToken}`);
  redirect(`/org/${orgToken}?evento=mordedura_reportada`);
}

// ---------------------------------------------------------------------------
// Professional closure (Fase 6) — admin/govt
// ---------------------------------------------------------------------------
//
// Unlike ownerCloseRabiesObservationAction (which restricts to outcome
// 'negative' after 10 days with no escalations), professionals can close
// with any outcome at any time during the period — they have clinical /
// authority standing to declare the result. Govt actors are scoped by
// their assigned localities.

const PROFESSIONAL_OUTCOMES: RabiesObservationOutcome[] = [
  "negative",
  "positive_rabies",
  "dead",
  "lost_to_followup",
];

export type ProfessionalCloseResult = { error: string | null };

export async function professionalCloseRabiesObservationAction(
  petPublicToken: string,
  formData: FormData,
): Promise<ProfessionalCloseResult> {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const outcomeRaw = String(formData.get("outcome") ?? "").trim();
  if (!PROFESSIONAL_OUTCOMES.includes(outcomeRaw as RabiesObservationOutcome)) {
    return { error: "Outcome inválido." };
  }
  const outcome = outcomeRaw as RabiesObservationOutcome;
  const closureNotes = String(formData.get("closureNotes") ?? "").trim() || null;

  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, petPublicToken)).limit(1);
  if (!pet) return { error: "Mascota no encontrada." };
  if (pet.rabiesObservationStatus !== "in_progress") {
    return { error: "Esta mascota no tiene una observación activa." };
  }

  // Govt scope check — admin sees universally.
  if (profile.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === pet.jurisdictionProvince && j.locality === pet.jurisdictionLocality,
    );
    if (!inScope) {
      return {
        error: "Esta mascota no está dentro de tu cobertura asignada.",
      };
    }
  }

  const [startedEvent] = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "rabies_observation_started")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  if (!startedEvent) return { error: "Inconsistencia: status in_progress sin evento started." };

  const startedPayload = startedEvent.payload as Record<string, unknown>;
  const biteEventId = startedPayload.bite_event_id as string;
  const now = new Date();

  // Cases system (Fase D2): outcome → closed_reason mapping. Outcomes
  // that reach a real determination (negative/positive_rabies/dead) close
  // as `resolved`; `lost_to_followup` is `cancelled` (we couldn't get a
  // determination).
  const closedReason: "resolved" | "cancelled" =
    outcome === "lost_to_followup" ? "cancelled" : "resolved";
  const [biteCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "bite_incident"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      const endedPayload = validateEventPayload("rabies_observation_ended", {
        bite_event_id: biteEventId,
        observation_started_event_id: startedEvent.id,
        outcome,
        closed_by_role: profile.role,
        closure_notes: closureNotes,
        death_event_id: null,
      });
      // petEvents.authorRole enum doesn't include 'admin' — both admin and
      // govt log as 'govt' for column-level authorship. The Zod payload's
      // closed_by_role keeps the precise distinction (admin | govt).
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "rabies_observation_ended",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: profile.id,
        authorRole: "govt",
        authorOrganizationId: null,
        authorVerified: false,
        payload: endedPayload,
        caseId: biteCase?.id ?? null,
      });
      await tx
        .update(pets)
        .set({ rabiesObservationStatus: outcomeToStatus(outcome), updatedAt: now })
        .where(eq(pets.id, pet.id));
      if (biteCase) {
        await closeCase(
          { caseId: biteCase.id, reason: closedReason, closedByUserId: profile.id },
          tx,
        );
      }

      // Notify the active owner of the professional closure.
      const [activeOwnership] = await tx
        .select({ ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (activeOwnership?.ownerUserId) {
        const severity = outcome === "positive_rabies" ? ("urgent" as const) : ("info" as const);
        await tx.insert(notifications).values({
          userId: activeOwnership.ownerUserId,
          notificationType: "rabies_observation_completed_professional_owner",
          severity,
          title: `Observación cerrada profesionalmente — ${pet.name}`,
          body: `La observación antirrábica de ${pet.name} fue cerrada por ${profile.role === "admin" ? "un administrador" : "una autoridad sanitaria"} con outcome: ${outcome}.${closureNotes ? ` Notas: ${closureNotes}` : ""}`,
          relatedPetId: pet.id,
          relatedCaseId: biteCase?.id ?? null,
        });
      }
    });
  } catch (err) {
    console.error("professionalCloseRabiesObservationAction tx failed:", err);
    return {
      error: `No se pudo cerrar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect("/admin/observaciones");
}
