"use server";

// Server actions for owner-managed reminders. Today only vaccine reminders
// have a UI; medication / appointment / custom share the schema but are not
// yet exposed in the owner PWA.

import { db, reminders } from "@/db";
import { parseDateInput } from "@/lib/format";
import { requireOwnedPetByToken } from "@/lib/pets";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type ReminderFormState = {
  error: string | null;
};

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

export async function deleteVaccineReminderAction(publicToken: string, reminderId: string) {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) {
    throw new Error("No autorizado.");
  }
  const { pet } = session;

  await db.delete(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.petId, pet.id)));

  redirect(`/mis-mascotas/${publicToken}`);
}
