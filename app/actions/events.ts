"use server";

// Server actions for owner-recordable events.
//
// Each event-type form has its own action because the payloads differ. The
// shared pattern: verify ownership of the target pet, build the event payload,
// insert into pet_events (and optionally a Reminder) atomically, redirect
// back to the pet's detail page.

import { attachments, db, ownerships, petEvents, pets, reminders } from "@/db";
import { signalAuthorityReport } from "@/lib/authority";
import { findDisease, isReportable } from "@/lib/diseases";
import { findDrugByLabel } from "@/lib/drugs";
import { parseDateInput } from "@/lib/format";
import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/medication-schedule";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export type EventFormState = {
  error: string | null;
};

async function requireOwnedPet(publicToken: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, pet: null, error: "Sesión expirada." };

  const [row] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.userId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) return { supabase, user, pet: null, error: "Mascota no encontrada o sin permisos." };

  return { supabase, user, pet: row.pet, error: null };
}

async function requireOwnedAndAlive(publicToken: string) {
  const result = await requireOwnedPet(publicToken);
  if (result.error || !result.pet) return result;
  if (result.pet.status === "deceased") {
    return {
      supabase: result.supabase,
      user: result.user,
      pet: null,
      error: "Esta mascota está registrada como fallecida y no acepta nuevos eventos.",
    };
  }
  return result;
}

async function cleanupAttachment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
) {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Swallow — the row was never inserted, the file is orphaned at worst.
  }
}

// ---------------------------------------------------------------------------
// Vaccination
// ---------------------------------------------------------------------------

export async function createVaccinationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const batch = String(formData.get("batch") ?? "").trim() || null;
  const administeredBy = String(formData.get("administeredBy") ?? "").trim() || null;
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const sourceReminderId = String(formData.get("sourceReminderId") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) {
    return { error: "Fecha de próxima dosis inválida." };
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "vaccination_administered",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            vaccine_name: vaccineName,
            brand,
            batch,
            administered_by: administeredBy,
            next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
          },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Mark the source reminder (if any) as completed.
      if (sourceReminderId) {
        await tx
          .update(reminders)
          .set({ completedAt: now })
          .where(and(eq(reminders.id, sourceReminderId), eq(reminders.petId, pet.id)));
      }

      // Auto-create a vaccine reminder when next dose is known.
      if (nextDueAt) {
        await tx.insert(reminders).values({
          petId: pet.id,
          userId: user.id,
          reminderType: "vaccine",
          dueAt: nextDueAt,
          title: `Refuerzo: ${vaccineName}`,
          description: `Próxima dosis programada para ${pet.name}.`,
          sourceEventId: event.id,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la vacuna: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export async function createWeightAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const kgRaw = String(formData.get("kg") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!kgRaw) return { error: "Falta el peso." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const kgNum = Number.parseFloat(kgRaw);
  if (!Number.isFinite(kgNum) || kgNum <= 0) return { error: "Peso inválido." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();
  const kgStr = kgNum.toFixed(2);

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "weight_recorded",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: { kg: kgStr },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Update the denormalized cache so the pet card / detail show the latest
      // weight without re-scanning the event log.
      await tx.update(pets).set({ estimatedWeightKg: kgStr }).where(eq(pets.id, pet.id));
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el peso: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Note (free-form catch-all)
// ---------------------------------------------------------------------------

const NOTE_CATEGORIES = ["comportamiento", "dieta", "grooming", "estado_de_animo", "otro"];

export async function createNoteAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const text = String(formData.get("text") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!text) return { error: "Falta el contenido de la nota." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const category = NOTE_CATEGORIES.includes(categoryRaw) ? categoryRaw : null;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "note_added",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: { category, text },
          notes: null,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la nota: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Vet visit
// ---------------------------------------------------------------------------

export async function createVetVisitAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const reason = String(formData.get("reason") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const diagnosis = String(formData.get("diagnosis") ?? "").trim() || null;
  const vetName = String(formData.get("vetName") ?? "").trim() || null;
  const clinic = String(formData.get("clinic") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!reason) return { error: "Falta el motivo de la visita." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "vet_visit_logged",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: { reason, diagnosis, vet_name: vetName, clinic },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la visita: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Status changes (lost / found)
// ---------------------------------------------------------------------------

export async function setPetLostAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  if (pet.status === "lost") return { error: "Esta mascota ya está marcada como perdida." };
  if (pet.status === "deceased")
    return { error: "No se puede cambiar el estado de una mascota fallecida." };

  const lastKnownLocation = String(formData.get("lastKnownLocation") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const now = new Date();
  const fromStatus = pet.status;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "status_changed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: {
          from_status: fromStatus,
          to_status: "lost",
          last_known_location: lastKnownLocation,
          reason,
        },
      });
      await tx.update(pets).set({ status: "lost", updatedAt: now }).where(eq(pets.id, pet.id));
    });
  } catch (err) {
    return {
      error: `No se pudo marcar como perdida: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Deworming
// ---------------------------------------------------------------------------

export async function createDewormingAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const product = String(formData.get("product") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!product) return { error: "Falta el nombre del producto." };
  if (!["internal", "external", "both"].includes(type))
    return { error: "Tipo de antiparasitario inválido." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) return { error: "Fecha de próxima dosis inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "deworming_administered",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            product,
            type,
            next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
          },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Auto-create a reminder when next dose is known.
      if (nextDueAt) {
        await tx.insert(reminders).values({
          petId: pet.id,
          userId: user.id,
          reminderType: "deworming",
          dueAt: nextDueAt,
          title: `Refuerzo antiparasitario: ${product}`,
          description: `Próxima dosis programada para ${pet.name}.`,
          sourceEventId: event.id,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el antiparasitario: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Sterilization
// ---------------------------------------------------------------------------

export async function createSterilizationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const procedure = String(formData.get("procedure") ?? "").trim();
  const performedBy = String(formData.get("performedBy") ?? "").trim() || null;
  const clinic = String(formData.get("clinic") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!["castration", "spay"].includes(procedure)) return { error: "Procedimiento inválido." };
  if (!occurredAtRaw) return { error: "Falta la fecha de la cirugía." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "sterilization_performed",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: { procedure, performed_by: performedBy, clinic },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la esterilización: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Microchip
// ---------------------------------------------------------------------------

export async function createMicrochipAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const chipNumber = String(formData.get("chipNumber") ?? "").trim();
  const countryCode = String(formData.get("countryCode") ?? "").trim() || null;
  const implantedBy = String(formData.get("implantedBy") ?? "").trim() || null;
  const locationOnBody = String(formData.get("locationOnBody") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!chipNumber) return { error: "Falta el número de microchip." };
  if (!occurredAtRaw) return { error: "Falta la fecha de implantación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "microchip_implanted",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            chip_number: chipNumber,
            country_code: countryCode,
            implanted_by: implantedBy,
            location_on_body: locationOnBody,
          },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Back-fill denormalized microchip columns on the pets row only if they
      // are currently NULL (never overwrite existing data).
      if (!pet.microchipId) {
        await tx
          .update(pets)
          .set({
            microchipId: chipNumber,
            microchipCountryCode: countryCode ?? pet.microchipCountryCode,
            microchipImplantedAt: pet.microchipImplantedAt ?? occurredAt.toISOString().slice(0, 10),
            microchipImplantedBy: pet.microchipImplantedBy ?? implantedBy,
            microchipLocation: pet.microchipLocation ?? locationOnBody,
            updatedAt: new Date(),
          })
          .where(eq(pets.id, pet.id));
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el microchip: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication start
// ---------------------------------------------------------------------------

export async function createMedicationStartAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const drugName = String(formData.get("drugName") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const prescribedBy = String(formData.get("prescribedBy") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!drugName) return { error: "Falta el nombre del medicamento." };
  if (!dose) return { error: "Falta la dosis." };
  if (!occurredAtRaw) return { error: "Falta la fecha de inicio." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de inicio inválida." };

  // Frequency + schedule fields.
  const frequencyRaw = String(formData.get("frequency") ?? "").trim();
  const customHoursRaw = String(formData.get("customHours") ?? "").trim() || null;
  const durationDaysRaw = String(formData.get("durationDays") ?? "").trim() || null;
  const firstDoseAtRaw = String(formData.get("firstDoseAt") ?? "").trim() || null;

  if (!frequencyRaw) return { error: "Falta la frecuencia." };

  const parsedFreq = parseFrequencyFields(
    frequencyRaw,
    customHoursRaw,
    durationDaysRaw,
    firstDoseAtRaw,
  );
  if (parsedFreq.error !== null) return { error: parsedFreq.error };
  // TypeScript needs the explicit cast here because it can't narrow after the
  // error-field check on a discriminated union without a type predicate.
  const { frequency, customHours, durationDays, firstDoseAt } = parsedFreq as {
    error: null;
    frequency: import("@/lib/drugs").FrequencyKind;
    customHours: number | null;
    durationDays: number | null;
    firstDoseAt: Date;
  };

  const intervalHours = intervalHoursForFrequency(frequency, customHours);
  const schedule = generateDoseSchedule({ firstDoseAt, intervalHours, durationDays });

  // Try to match a catalog drug for richer payload.
  const matchedDrug = findDrugByLabel(drugName);

  const frequencyLabel = (FREQUENCY_LABELS as Record<string, string>)[frequency] ?? frequency;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "medication_started",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            drug_name: drugName,
            dose,
            frequency,
            prescribed_by: prescribedBy,
            drug_code: matchedDrug?.code ?? null,
            first_dose_at: firstDoseAt.toISOString(),
            duration_days: durationDays,
            custom_hours: frequency === "custom" ? customHours : null,
            schedule_count: schedule.length,
          },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Insert dose reminders if schedule is non-empty.
      if (schedule.length > 0) {
        await tx.insert(reminders).values(
          schedule.map((dueAt) => ({
            petId: pet.id,
            userId: user.id,
            reminderType: "medication" as const,
            dueAt,
            title: `${drugName} – Dosis`,
            description: `${dose}${frequencyLabel ? ` · ${frequencyLabel}` : ""}`,
            sourceEventId: event.id,
          })),
        );
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la medicación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication end
// ---------------------------------------------------------------------------

export async function createMedicationEndAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedAndAlive(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const medicationStartedEventId = String(formData.get("medicationStartedEventId") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!medicationStartedEventId) return { error: "Falta seleccionar la medicación." };
  if (!occurredAtRaw) return { error: "Falta la fecha de fin." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de fin inválida." };

  // Defense in depth: verify the referenced event belongs to this pet and is medication_started.
  const [sourceEvent] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.id, medicationStartedEventId),
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "medication_started"),
      ),
    )
    .limit(1);

  if (!sourceEvent) return { error: "Medicación de origen inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "medication_stopped",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            medication_started_event_id: medicationStartedEventId,
            reason,
          },
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Cancel future incomplete reminders tied to this medication source event.
      // Past-due-not-marked reminders are left as-is (they stay as a record of
      // missed doses and can still be marked by the owner).
      await tx
        .update(reminders)
        .set({ completedAt: now })
        .where(
          and(
            eq(reminders.sourceEventId, medicationStartedEventId),
            isNull(reminders.completedAt),
            gt(reminders.dueAt, now),
          ),
        );
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fin de medicación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication dose taken (adherence dual-write)
// ---------------------------------------------------------------------------

// Note: this action does NOT follow the useActionState(_previous, formData) pattern
// because it is invoked from a server-component form (no client-side state). It redirects
// on success and throws on hard errors (same pattern as deleteVaccineReminderAction).
export async function markMedicationDoseTakenAction(formData: FormData): Promise<void> {
  const reminderId = String(formData.get("reminderId") ?? "").trim();
  if (!reminderId) throw new Error("Falta el identificador del recordatorio.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada.");

  // Fetch the reminder and verify it belongs to a pet owned by this user.
  const [reminderRow] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, user.id)))
    .limit(1);

  if (!reminderRow) throw new Error("Recordatorio no encontrado o sin permisos.");
  if (reminderRow.reminderType !== "medication") throw new Error("Tipo de recordatorio inválido.");
  if (reminderRow.completedAt) throw new Error("Esta dosis ya fue marcada.");

  // Verify the pet is alive via requireOwnedAndAlive pattern (look up pet directly).
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.id, reminderRow.petId),
        eq(ownerships.userId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!petRow) throw new Error("Mascota no encontrada o sin permisos.");
  if (petRow.pet.status === "deceased") {
    throw new Error("Esta mascota está registrada como fallecida.");
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Mark reminder as completed.
      await tx.update(reminders).set({ completedAt: now }).where(eq(reminders.id, reminderId));

      // Dual-write: insert a medication_dose_taken event for full audit trail.
      await tx.insert(petEvents).values({
        petId: reminderRow.petId,
        eventType: "medication_dose_taken",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: {
          medication_started_event_id: reminderRow.sourceEventId ?? null,
          scheduled_for: reminderRow.dueAt.toISOString(),
          reminder_id: reminderId,
        },
      });
    });
  } catch (err) {
    throw new Error(
      `No se pudo marcar la dosis: ${err instanceof Error ? err.message : "error desconocido"}`,
    );
  }

  // Redirect to the pet's detail page using the pet's publicToken.
  const token = petRow.pet.publicToken;
  redirect(`/mis-mascotas/${token}`);
}

// ---------------------------------------------------------------------------
// Death record
// ---------------------------------------------------------------------------

const DEATH_CAUSES = ["known", "unknown", "natural", "disease", "accident", "euthanasia", "other"];
const DISPOSITION_METHODS = ["cremation", "burial", "rendering", "unknown"];

export async function createDeathRecordAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { supabase, user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  if (pet.status === "deceased")
    return { error: "Esta mascota ya está registrada como fallecida." };

  const cause = String(formData.get("cause") ?? "").trim();
  const causeDetail = String(formData.get("causeDetail") ?? "").trim() || null;
  const confirmedByVet = formData.get("confirmedByVet") === "true";
  const vetName = String(formData.get("vetName") ?? "").trim() || null;
  const dispositionMethodRaw = String(formData.get("dispositionMethod") ?? "").trim();
  const facility = String(formData.get("facility") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!DEATH_CAUSES.includes(cause)) return { error: "Causa de fallecimiento inválida." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const dispositionMethod = dispositionMethodRaw === "" ? null : dispositionMethodRaw;
  if (dispositionMethod !== null && !DISPOSITION_METHODS.includes(dispositionMethod)) {
    return { error: "Método de disposición inválido." };
  }

  const diseaseCodeRaw = String(formData.get("diseaseCode") ?? "").trim() || null;
  const confirmedByLab = formData.get("confirmedByLab") === "true";

  // Disease fields only valid when cause is "disease". Strip otherwise.
  const diseaseCode = cause === "disease" && diseaseCodeRaw ? diseaseCodeRaw : null;
  if (diseaseCode && !findDisease(diseaseCode)) {
    return { error: "Enfermedad no reconocida." };
  }
  const reportable = isReportable(diseaseCode);

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();
  let insertedEvent: { id: string } | null = null;

  try {
    await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "death_recorded",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: {
            cause,
            cause_detail: causeDetail,
            confirmed_by_vet: confirmedByVet || null,
            vet_name: vetName,
            disposition_method: dispositionMethod,
            facility,
            // Disease enrichment (only when cause === "disease")
            disease_code: diseaseCode,
            confirmed_by_lab: diseaseCode ? confirmedByLab : null,
            is_reportable: reportable,
          },
          notes,
        })
        .returning();

      insertedEvent = event;

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      await tx
        .update(pets)
        .set({ status: "deceased", deceasedAt: occurredAt, updatedAt: now })
        .where(eq(pets.id, pet.id));
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fallecimiento: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (reportable && diseaseCode && insertedEvent) {
    await signalAuthorityReport({
      eventId: (insertedEvent as { id: string }).id,
      petId: pet.id,
      diseaseCode,
      confirmedByLab,
      occurredAt,
      jurisdictionProvince: pet.jurisdictionProvince ?? null,
      jurisdictionLocality: pet.jurisdictionLocality ?? null,
    });
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

export async function setPetFoundAction(publicToken: string): Promise<void> {
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) {
    throw new Error(ownershipError ?? "No autorizado.");
  }
  if (pet.status === "deceased") {
    throw new Error("Esta mascota está registrada como fallecida y no acepta nuevos eventos.");
  }
  if (pet.status !== "lost") {
    // Idempotent — just redirect.
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(petEvents).values({
      petId: pet.id,
      eventType: "status_changed",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: user.id,
      authorRole: "owner",
      payload: {
        from_status: "lost",
        to_status: "active",
      },
    });
    await tx.update(pets).set({ status: "active", updatedAt: now }).where(eq(pets.id, pet.id));
  });

  redirect(`/mis-mascotas/${publicToken}`);
}
