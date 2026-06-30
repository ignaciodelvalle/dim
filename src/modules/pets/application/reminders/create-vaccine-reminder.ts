// Use-case: createVaccineReminder — create a vaccine reminder for a pet
// (strangler migration 42/61).
//
// Auth guard (requireOwnedPetByToken) is enforced by the caller (shim). This
// use-case receives the already-resolved userId, petId, and publicToken.

import { db, reminders } from "@/db";
import { parseDateInput } from "@/lib/format";
import { redirect } from "next/navigation";

import type { ReminderFormState } from "./types";

export async function createVaccineReminder(
  userId: string,
  petId: string,
  publicToken: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!dueAtRaw) return { error: "Falta la fecha estimada." };

  const dueAt = parseDateInput(dueAtRaw);
  if (!dueAt) return { error: "Fecha inválida." };

  try {
    await db.insert(reminders).values({
      petId,
      userId,
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
