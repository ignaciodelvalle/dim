// Use-case: createVaccineReminderAction — create a vaccine reminder for a pet
// (strangler migration 42/61).
//
// Auth guard (requireOwnedPetByToken) is included verbatim so the use-case
// enforces ownership from the module layer.

import { db, reminders } from "@/db";
import { parseDateInput } from "@/lib/format";
import { requireOwnedPetByToken } from "@/lib/pets";
import { redirect } from "next/navigation";

import type { ReminderFormState } from "./types";

export async function createVaccineReminderAction(
  publicToken: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return { error: "Sesión expirada." };
  const { user, pet } = session;

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!dueAtRaw) return { error: "Falta la fecha estimada." };

  const dueAt = parseDateInput(dueAtRaw);
  if (!dueAt) return { error: "Fecha inválida." };

  try {
    await db.insert(reminders).values({
      petId: pet.id,
      userId: user.id,
      reminderType: "vaccine",
      dueAt,
      title: vaccineName,
      description,
    });
  } catch (err) {
    return {
      error: `No se pudo crear el recordatorio: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
