// Internal read helper — resolves the sanitary_authority organization for a
// user. NOT a server action: this module is intentionally outside any
// "use server" file so it cannot be invoked from the client with an
// attacker-supplied userId (authz triage 2026-07-04). Callers must supply a
// session-derived userId.

import { and, eq, isNull } from "drizzle-orm";

import { db, organizationMemberships, organizations } from "@/db";

/**
 * Returns the sanitary_authority organization where `userId` holds an active
 * membership. Returns null when no such org exists.
 */
export async function resolveGovtOrgForUser(userId: string): Promise<{
  id: string;
  displayName: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
} | null> {
  const [row] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizations.orgType, "sanitary_authority"),
        eq(organizations.status, "active"),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
