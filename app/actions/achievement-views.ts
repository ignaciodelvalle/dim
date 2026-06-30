"use server";

// achievement-views.ts — thin shim (strangler migration 51/61).
//
// Business logic moved to:
//   src/modules/pets/application/achievements/mark-achievement-seen.ts

import { markAchievementSeen } from "@/src/modules/pets/application/achievements/mark-achievement-seen";

// @no-auth-required: auth enforced inside the delegated use-case (requirePetAccess
// runs after input validation that must precede it — lifting would reorder)
export async function markAchievementSeenAction(
  petPublicToken: string,
  achievementId: string,
): Promise<{ ok: true } | { error: string }> {
  return markAchievementSeen(petPublicToken, achievementId);
}
