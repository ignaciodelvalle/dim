"use server";

// Server actions for the lost-mode cockpit.
//
// setPetDisclosurePrefsAction — toggles a single disclosure preference on
// the pets row. Called by LostDisclosureCard's per-row form submit.
// Returns void so Next.js can revalidate the route automatically.

import type { DisclosurePrefs } from "@/components/pet-profile/LostDisclosureCard";
import { db, pets } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Toggle a single disclosure pref on a pet's row.
 *
 * @param publicToken - The pet's public token (bound by the calling server component).
 * @param key         - Which preference to update.
 * @param next        - The new boolean value.
 */
export async function setPetDisclosurePrefsAction(
  publicToken: string,
  key: keyof DisclosurePrefs,
  next: boolean,
): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  await db
    .update(pets)
    .set({ [key]: next, updatedAt: new Date() })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/mis-mascotas/${publicToken}`);
}
