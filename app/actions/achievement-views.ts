"use server";

// achievement-views.ts — thin shim (strangler migration 51/61).
//
// Business logic moved to:
//   src/modules/pets/application/achievements/mark-achievement-seen.ts

import { markAchievementSeen } from "@/src/modules/pets/application/achievements/mark-achievement-seen";

export async function markAchievementSeenAction(
  petPublicToken: string,
  achievementId: string,
): Promise<{ ok: true } | { error: string }> {
  return markAchievementSeen(petPublicToken, achievementId);
}
