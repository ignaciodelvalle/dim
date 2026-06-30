"use server";

// lost-mode.ts — thin shim (strangler migration 61/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/pets/application/lost-mode/
//
// CRITICAL: Every runtime export in a "use server" file must be an async function.

import type { DisclosurePrefs } from "@/components/pet-profile/LostDisclosureCard";
import { setPetDisclosurePrefs } from "@/src/modules/pets/application/lost-mode/set-pet-disclosure-prefs";

export async function setPetDisclosurePrefsAction(
  publicToken: string,
  key: keyof DisclosurePrefs,
  next: boolean,
): Promise<void> {
  return setPetDisclosurePrefs(publicToken, key, next);
}
