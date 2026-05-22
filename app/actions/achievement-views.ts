"use server";

// markAchievementSeenAction — records the first time an owner sees an earned
// achievement badge on their pet's profile. Drives the 7-day badge-pulse UX.
//
// Idempotent: uses onConflictDoNothing on the (user_id, pet_id, achievement_id)
// unique key — safe to call multiple times without creating duplicate rows.
//
// Write path: Drizzle service role (bypasses RLS). RLS SELECT/INSERT/UPDATE
// policies in 0046_pet_achievement_views.sql are the defence-in-depth gate
// for any future direct-write path.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, petAchievementViews } from "@/db";
import { ACHIEVEMENTS_CATALOG } from "@/lib/achievements/catalog";
import { requirePetAccess } from "@/lib/pet-access";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const ACHIEVEMENT_IDS = ACHIEVEMENTS_CATALOG.map((a) => a.id) as [string, ...string[]];

const InputSchema = z.object({
  petPublicToken: z.string().min(1, "petPublicToken is required"),
  achievementId: z.enum(ACHIEVEMENT_IDS, {
    errorMap: () => ({ message: "Unknown achievementId" }),
  }),
});

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function markAchievementSeenAction(
  petPublicToken: string,
  achievementId: string,
): Promise<{ ok: true } | { error: string }> {
  // 1. Validate input before hitting the DB.
  const parsed = InputSchema.safeParse({ petPublicToken, achievementId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // 2. Pet access check — owner-only guard.
  const access = await requirePetAccess(petPublicToken);
  if (!access.ok) {
    return { error: "Pet not found or access denied" };
  }
  if (access.accessPath !== "owner") {
    return { error: "Only the pet owner can record achievement views" };
  }

  const { user, pet } = access;

  // 3. Upsert — onConflictDoNothing is idempotent on the natural key.
  await db
    .insert(petAchievementViews)
    .values({
      userId: user.id,
      petId: pet.id,
      achievementId: parsed.data.achievementId,
    })
    .onConflictDoNothing();

  // 4. Revalidate the pet profile so the next SSR pass picks up the new row.
  revalidatePath(`/mis-mascotas/${petPublicToken}`);

  return { ok: true };
}
