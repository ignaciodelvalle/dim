// Shared helpers for admin-proposals use-cases.
//
// loadActorAuthority: shared by proposeVetUpgradeForUser and
// proposeOrgVerificationForOrg.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";

// ---------------------------------------------------------------------------
// loadActorAuthority
// ---------------------------------------------------------------------------

type ActorAuthority = {
  profile: { id: string; role: "admin" | "govt" };
  jurisdictions: { province: string; locality: string }[];
};

export async function loadActorAuthority(
  actorUserId: string,
): Promise<ActorAuthority | { error: string }> {
  const [profile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);
  if (!profile || (profile.role !== "admin" && profile.role !== "govt")) {
    return { error: "Solo govt o admin pueden proponer cambios." };
  }
  // AC1 defense-in-depth: deactivated authorities cannot propose changes, even
  // if the inner writer is reached directly (the /gob guard already rejects
  // them at the request boundary; this mirrors that at the data layer).
  if (profile.deactivatedAt !== null) {
    return { error: "La cuenta está desactivada." };
  }
  return {
    profile: { id: profile.id, role: profile.role },
    jurisdictions: [],
    // Govt's assignments aren't strictly needed for the propose path —
    // capability is enforced per type below. We keep the shape uniform
    // with admin-decisions.ts for symmetry.
  };
}
