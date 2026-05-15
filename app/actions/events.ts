"use server";

// Server actions for owner-recordable events.
//
// Each event-type form has its own action because the payloads differ. The
// shared pattern: verify ownership of the target pet, build the event payload,
// insert into pet_events (and optionally a Reminder) atomically, redirect
// back to the pet's detail page.

import { attachments, db, ownerships, petEvents, pets, reminders } from "@/db";
import { parseDateInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, eq, isNull } from "drizzle-orm";
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
  const { supabase, user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
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
  const { supabase, user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
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
  const { supabase, user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
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

export async function setPetFoundAction(publicToken: string): Promise<void> {
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) {
    throw new Error(ownershipError ?? "No autorizado.");
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
