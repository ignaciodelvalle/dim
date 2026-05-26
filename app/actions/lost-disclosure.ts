"use server";

// Toggle one disclosure pref while the pet is lost.
//
// The five disclosure flags (first_name, phone, email, last_location,
// finder_form) live on the `pets` row and govern what the public credential
// shows while the pet is in lost mode. They are initially set by
// `setPetLostAction` from the MarkLostForm; this action lets the owner
// edit them on the fly from the lost cockpit without re-opening the form.

import { db, pets } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type DisclosurePrefKey =
  | "discloseFirstNameWhenLost"
  | "disclosePhoneWhenLost"
  | "discloseEmailWhenLost"
  | "discloseLastLocationWhenLost"
  | "allowFinderFormWhenLost";

export async function togglePetDisclosurePrefAction(
  publicToken: string,
  key: DisclosurePrefKey,
  next: boolean,
): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  if (pet.status !== "lost") {
    // Defense in depth — the cockpit (and therefore this form) only
    // renders in lost mode. Direct invocation hits this guard.
    throw new Error("La mascota no está en modo perdida.");
  }

  await db
    .update(pets)
    .set({ [key]: next, updatedAt: new Date() })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/p/${publicToken}`);
}
