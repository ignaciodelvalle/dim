"use server";

// Server actions for owner-recordable events.
//
// Each event-type form has its own action because the payloads differ. The
// shared pattern: verify ownership of the target pet, build the event payload,
// insert into pet_events (and optionally a Reminder) atomically, redirect
// back to the pet's detail page.

import { db, ownerships, petEvents, pets, reminders } from "@/db";
import { createClient } from "@/lib/supabase/server";
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
  if (!user) return { user: null, pet: null, error: "Sesión expirada." };

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
  if (!row) return { user, pet: null, error: "Mascota no encontrada o sin permisos." };

  return { user, pet: row.pet, error: null };
}

// ---------------------------------------------------------------------------
// Vaccination
// ---------------------------------------------------------------------------

export async function createVaccinationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const batch = String(formData.get("batch") ?? "").trim() || null;
  const administeredBy = String(formData.get("administeredBy") ?? "").trim() || null;
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? new Date(nextDueAtRaw) : null;
  if (nextDueAt && Number.isNaN(nextDueAt.getTime())) {
    return { error: "Fecha de próxima dosis inválida." };
  }

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
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const kgRaw = String(formData.get("kg") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!kgRaw) return { error: "Falta el peso." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const kgNum = Number.parseFloat(kgRaw);
  if (!Number.isFinite(kgNum) || kgNum <= 0) return { error: "Peso inválido." };

  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) return { error: "Fecha inválida." };

  const now = new Date();
  const kgStr = kgNum.toFixed(2);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "weight_recorded",
        occurredAt,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: { kg: kgStr },
        notes,
      });
      // Update the denormalized cache so the pet card / detail show the latest
      // weight without re-scanning the event log.
      await tx.update(pets).set({ estimatedWeightKg: kgStr }).where(eq(pets.id, pet.id));
    });
  } catch (err) {
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
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const text = String(formData.get("text") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!text) return { error: "Falta el contenido de la nota." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) return { error: "Fecha inválida." };

  const category = NOTE_CATEGORIES.includes(categoryRaw) ? categoryRaw : null;

  try {
    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: "note_added",
      occurredAt,
      recordedAt: new Date(),
      recordedByUserId: user.id,
      authorRole: "owner",
      payload: { category, text },
      notes: null,
    });
  } catch (err) {
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
  const { user, pet, error: ownershipError } = await requireOwnedPet(publicToken);
  if (ownershipError || !user || !pet) return { error: ownershipError ?? "No autorizado." };

  const reason = String(formData.get("reason") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const diagnosis = String(formData.get("diagnosis") ?? "").trim() || null;
  const vetName = String(formData.get("vetName") ?? "").trim() || null;
  const clinic = String(formData.get("clinic") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!reason) return { error: "Falta el motivo de la visita." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = new Date(occurredAtRaw);
  if (Number.isNaN(occurredAt.getTime())) return { error: "Fecha inválida." };

  try {
    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: "vet_visit_logged",
      occurredAt,
      recordedAt: new Date(),
      recordedByUserId: user.id,
      authorRole: "owner",
      payload: { reason, diagnosis, vet_name: vetName, clinic },
      notes,
    });
  } catch (err) {
    return {
      error: `No se pudo registrar la visita: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
