// Helper: load the active govt jurisdiction rows for a user.
// Extracted from app/actions/welfare-triage.ts::getActiveGovtScopeForUser.
// Exported as a module helper (also re-exported from the shim for listing pages).

import { and, eq, isNull } from "drizzle-orm";

import { db, govtAssignments, profiles } from "@/db";

export type GovtJurisdiction = {
  province: string;
  locality: string;
};

/**
 * Return all active (non-revoked) govt_assignments rows for `userId`.
 * Empty array for admins (callers use universal scope) or users with no
 * active assignments.
 */
export async function getActiveGovtScopeForUser(userId: string): Promise<GovtJurisdiction[]> {
  const rows = await db
    .select({
      province: govtAssignments.jurisdictionProvince,
      locality: govtAssignments.jurisdictionLocality,
    })
    .from(govtAssignments)
    .innerJoin(profiles, eq(profiles.id, govtAssignments.userId))
    .where(and(eq(govtAssignments.userId, userId), isNull(govtAssignments.revokedAt)));
  return rows;
}
