// Use-case: deleteVaccineReminderAction — delete a vaccine reminder (strangler migration 42/61).
//
// Auth guard (requireOwnedPetByToken) is included verbatim so the use-case
// enforces ownership from the module layer.

import { db, reminders } from "@/db";
import { requireOwnedPetByToken } from "@/lib/pets";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function deleteVaccineReminderAction(publicToken: string, reminderId: string) {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) {
    throw new Error("No autorizado.");
  }
  const { pet } = session;

  await db.delete(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.petId, pet.id)));

  redirect(`/mis-mascotas/${publicToken}`);
}
