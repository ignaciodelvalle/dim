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
