// Writer: recordPregnancyStartedWriter (strangler migration 18/61).

import { eq } from "drizzle-orm";

import { db, notifications, petEvents, pets, reminders } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";

import type { RecordPregnancyResult, RecordPregnancyStartedParams } from "./types";

// Species-specific gestation window. Spec PR6 + §9 reminders.
const PREGNANCY_DURATION_WEEKS: Record<string, number> = {
  dog: 9,
  cat: 9,
  other: 9,
};

export async function recordPregnancyStartedWriter(
  params: RecordPregnancyStartedParams,
): Promise<RecordPregnancyResult> {
  if (params.pet.sex !== "female") {
    return { ok: false, error: "Solo se pueden registrar embarazos en hembras." };
  }
  if (!Object.hasOwn(PREGNANCY_DURATION_WEEKS, params.pet.species)) {
    return { ok: false, error: "Especie no soportada para embarazos." };
  }
  if (params.pet.pregnancyStatus === "in_progress") {
    return {
      ok: false,
      error:
        "Esta mascota ya tiene un embarazo en seguimiento. Cerralo primero antes de registrar uno nuevo.",
    };
  }

  const now = params.now ?? new Date();
  const speciesWeeks = PREGNANCY_DURATION_WEEKS[params.pet.species];
  const weeksRemaining =
    params.weeksAtDiagnosis !== null
      ? Math.max(speciesWeeks - params.weeksAtDiagnosis, 0)
      : speciesWeeks;
  const expectedBirthAt = new Date(params.occurredAt.getTime() + weeksRemaining * 7 * 86400000);

  let eventId = "";
  let reminderCount = 0;
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("clinical_info_logged", {
        sub_kind: "pregnancy",
        pregnancy_phase: "started",
        title: "Embarazo en seguimiento",
        details: null,
        performed_by: params.vetConsulted,
        weeks_at_diagnosis: params.weeksAtDiagnosis,
        vet_consulted: params.vetConsulted,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: params.pet.id,
          eventType: "clinical_info_logged",
          occurredAt: params.occurredAt,
          recordedAt: now,
          recordedByUserId: params.recordedByUserId,
          ...params.eventAuthorship,
          payload,
          notes: params.notes,
        })
        .returning();
      eventId = event.id;

      await tx
        .update(pets)
        .set({ pregnancyStatus: "in_progress" })
        .where(eq(pets.id, params.pet.id));

      // Biweekly checkup reminders until expected birth date.
      const reminderRows: (typeof reminders.$inferInsert)[] = [];
      const TWO_WEEKS_MS = 14 * 86400000;
      let cursor = new Date(params.occurredAt.getTime() + TWO_WEEKS_MS);
      while (cursor < expectedBirthAt) {
        reminderRows.push({
          petId: params.pet.id,
          userId: params.recordedByUserId,
          reminderType: "custom",
          dueAt: cursor,
          title: "Control veterinario de embarazo",
          description: "Recordatorio quincenal sugerido durante la gestación.",
          sourceEventId: event.id,
        });
        cursor = new Date(cursor.getTime() + TWO_WEEKS_MS);
      }
      if (reminderRows.length > 0) {
        await tx.insert(reminders).values(reminderRows);
        reminderCount = reminderRows.length;
      }

      await tx.insert(notifications).values({
        userId: params.recordedByUserId,
        notificationType: "pregnancy_started_owner",
        severity: "info",
        title: "Embarazo en seguimiento",
        body: "Te recomendamos llevar a tu mascota a controles veterinarios regulares durante la gestación.",
        relatedPetId: params.pet.id,
        relatedEventId: event.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${params.pet.publicToken}`,
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }

  return { ok: true, eventId, reminderCount };
}
