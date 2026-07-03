// Use-case: updateEmergencyContactsForUser — narrow write for `?sheet=emergencia`
// (pet-document-redesign ADR-13, Phase 5).
//
// The 4 vet/emergency-contact fields live on `profiles` (per-user, not
// per-pet — see update-profile.ts), but the entry point is the pet profile's
// CredentialFace EmergencyCard. `updateProfileForUser`'s schema requires
// `displayName` (non-optional) — this use-case loads the viewer's CURRENT
// displayName and passes it through unchanged so the caller never has to
// carry or resubmit it, keeping the write scoped to only the fields
// EmergencyContactFields actually renders.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";

import type { UpdateProfileResult } from "./types";
import { updateProfileForUser } from "./update-profile";

export type UpdateEmergencyContactsInput = {
  preferredVetName?: string;
  preferredVetPhone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

export async function updateEmergencyContactsForUser(
  userId: string,
  input: UpdateEmergencyContactsInput,
): Promise<UpdateProfileResult> {
  const [current] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!current) return { error: "NOT_FOUND" };

  return updateProfileForUser(userId, {
    displayName: current.displayName,
    ...input,
  });
}
