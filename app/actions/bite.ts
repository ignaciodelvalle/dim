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

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, notifications, petEvents, pets } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { validateEventPayload } from "@/lib/event-schemas";
import { requireAlivePetAccess } from "@/lib/pet-access";
import { computeObservationUntil } from "@/lib/rabies-observation";

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

  // 5. Atomic: incident_reported + rabies_observation_started + pet UPDATE +
  //    owner notification. Authority notifications are best-effort (post-tx).
  try {
    await db.transaction(async (tx) => {
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
      });
      await tx
        .update(pets)
        .set({ rabiesObservationStatus: "completed_negative", updatedAt: now })
        .where(eq(pets.id, pet.id));
      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "rabies_observation_completed_negative_owner",
        severity: "info",
        title: `Observación completada — ${pet.name}`,
        body: `La observación antirrábica de 10 días terminó sin incidentes. ${pet.name} sigue normal.`,
        relatedPetId: pet.id,
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
