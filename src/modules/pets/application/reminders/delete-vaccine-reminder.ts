// Use-case: deleteVaccineReminder — delete a vaccine reminder (strangler migration 42/61).
//
// Auth guard (requireOwnedPetByToken) is enforced by the caller (shim). This
// use-case receives the already-resolved petId and publicToken.

import { db, reminders } from "@/db";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export async function deleteVaccineReminder(petId: string, publicToken: string, reminderId: string) {
  await db.delete(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.petId, petId)));

  redirect(`/mis-mascotas/${publicToken}`);
}
