// Shared DB helpers for admin-institutional use-cases.

import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";
import type { ActorProfile } from "@/lib/institutional-scope";

export async function loadActorProfile(actorUserId: string): Promise<ActorProfile | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, actorUserId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    role: row.role as ActorProfile["role"],
    accountType: row.accountType as ActorProfile["accountType"],
    deactivatedAt: row.deactivatedAt,
  };
}
