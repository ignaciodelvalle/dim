// set-pet-disclosure-prefs use-case (strangler migration 61/61).
//
// Auth guard (requirePetAccess) is enforced by the caller (shim). This
// use-case receives the already-resolved petId so it never re-fetches.

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { DisclosurePrefs } from "@/components/pet-profile/LostDisclosureCard";
import { db, pets } from "@/db";

/**
 * Toggle a single disclosure pref on a pet's row.
 *
 * @param petId       - The pet's internal id (resolved by the calling shim).
 * @param publicToken - The pet's public token (for cache revalidation).
 * @param key         - Which preference to update.
 * @param next        - The new boolean value.
 */
export async function setPetDisclosurePrefs(
  petId: string,
  publicToken: string,
  key: keyof DisclosurePrefs,
  next: boolean,
): Promise<void> {
  await db
    .update(pets)
    .set({ [key]: next, updatedAt: new Date() })
    .where(eq(pets.id, petId));

  revalidatePath(`/mis-mascotas/${publicToken}`);
}
