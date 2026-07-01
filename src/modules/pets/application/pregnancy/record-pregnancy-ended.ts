// Writer: recordPregnancyEndedWriter (strangler migration 18/61).

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db, notifications, petEvents, pets, reminders } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";

import type { PregnancyOutcome, RecordPregnancyEndedParams, RecordPregnancyResult } from "./types";

function statusFromOutcome(outcome: PregnancyOutcome): string {
  return `completed_${outcome}`;
}

export async function recordPregnancyEndedWriter(
  params: RecordPregnancyEndedParams,
): Promise<RecordPregnancyResult> {
  if (params.pet.pregnancyStatus !== "in_progress") {
    return {
      ok: false,
      error: "Esta mascota no tiene un embarazo activo para cerrar.",
    };
  }
  if (params.outcome !== "live_birth" && params.liveBirthsCount !== null) {
    return {
      ok: false,
      error: "live_births_count solo es válido si el resultado es parto exitoso.",
    };
  }
  if (params.outcome === "live_birth" && (params.liveBirthsCount ?? 0) < 1) {
    return { ok: false, error: "Indicá la cantidad de crías nacidas vivas (mínimo 1)." };
  }

  const now = params.now ?? new Date();
  let eventId = "";
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("clinical_info_logged", {
        sub_kind: "pregnancy",
        pregnancy_phase: "ended",
        title: "Fin del embarazo",
        details: null,
        performed_by: params.vetConsulted,
        outcome: params.outcome,
        live_births_count: params.outcome === "live_birth" ? params.liveBirthsCount : null,
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
        .set({ pregnancyStatus: statusFromOutcome(params.outcome) })
        .where(eq(pets.id, params.pet.id));

      // Cancel future pregnancy checkup reminders tied to the open
      // pregnancy_started event(s) of this pet. Filter on payload.sub_kind
      // so unrelated clinical_info_logged rows don't get touched.
      const startedEvents = await tx
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, params.pet.id),
            eq(petEvents.eventType, "clinical_info_logged"),
            sql`${petEvents.payload}->>'sub_kind' = 'pregnancy'`,
            sql`${petEvents.payload}->>'pregnancy_phase' = 'started'`,
          ),
        );
      const startedIds = startedEvents.map((r) => r.id);
      if (startedIds.length > 0) {
        await tx
          .update(reminders)
          .set({ completedAt: now })
          .where(
            and(
              inArray(reminders.sourceEventId, startedIds),
              isNull(reminders.completedAt),
              gt(reminders.dueAt, now),
            ),
          );
      }

      // Owner notification — copy varies by outcome (spec §5.2 step 5-6).
      const owner = params.recordedByUserId;
      let title = "";
      let body = "";
      if (params.outcome === "live_birth") {
        title = `¡Felicitaciones! Quedó registrado el parto de ${params.pet.name}`;
        body = "Acabás de desbloquear el logro 'Tuve crías' en el perfil de tu mascota.";
      } else if (params.outcome === "stillbirth" || params.outcome === "miscarriage") {
        title = `Cierre del embarazo de ${params.pet.name}`;
        body =
          "Lamentamos la pérdida. Te recomendamos un seguimiento veterinario en los próximos días.";
      } else {
        title = `Cierre del embarazo de ${params.pet.name}`;
        body = "Quedó registrado en la libreta.";
      }
      await tx.insert(notifications).values({
        userId: owner,
        notificationType: "pregnancy_ended_owner",
        severity: params.outcome === "live_birth" ? "success" : "info",
        title,
        body,
        relatedPetId: params.pet.id,
        relatedEventId: event.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${params.pet.publicToken}`,
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
  return { ok: true, eventId, reminderCount: 0 };
}
