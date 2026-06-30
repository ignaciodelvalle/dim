"use server";

// lost-mode.ts — thin shim (strangler migration 61/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/pets/application/lost-mode/
//
// CRITICAL: Every runtime export in a "use server" file must be an async function.

import type { DisclosurePrefs } from "@/components/pet-profile/LostDisclosureCard";
import { requirePetAccess } from "@/lib/pet-access";
import { setPetDisclosurePrefs } from "@/src/modules/pets/application/lost-mode/set-pet-disclosure-prefs";

export async function setPetDisclosurePrefsAction(
  publicToken: string,
  key: keyof DisclosurePrefs,
  next: boolean,
): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  return setPetDisclosurePrefs(access.pet.id, publicToken, key, next);
}
