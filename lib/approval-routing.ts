// Routes an approval request to the right reviewers.
//
// Spec §6 (scope matching): govt sees only requests in the (province,
// locality) tuples they cover via govt_assignments. Admin sees everything
// admin-only (role upgrades to govt/admin, assignment grants) plus the
// fallback for any locality with no active govt.
//
// This module is the writer-side helper: given a jurisdiction, return the
// user IDs that should receive a "pending request" notification when an
// approval_request lands. Admin fallback fires only when no govt covers
// the locality, matching the visibility rule on the read side.

import { and, eq, isNull } from "drizzle-orm";

import { db, govtAssignments, profiles } from "@/db";

export type ApprovalJurisdiction = {
  province: string;
  locality: string;
};

// Returns the user IDs of every authority that should be notified about a
// new pending approval request for the given (province, locality).
//
// - If at least one govt has an active govt_assignment matching the
//   jurisdiction, return ONLY those govt user IDs. Admins do not get the
//   notification (they still SEE the request via the universal admin
//   policy, but they're not paged).
// - If no govt covers the jurisdiction, return every active admin so the
//   request lands in the admin queue with a notification.
//
// Empty result is possible only when there are no admins seeded — in
// which case the caller still writes the approval_request row and the
// founder will see it on next login.
export async function findAuthoritiesForJurisdiction(
  jurisdiction: ApprovalJurisdiction,
): Promise<string[]> {
  const govts = await db
    .select({ userId: govtAssignments.userId })
    .from(govtAssignments)
    .where(
      and(
        eq(govtAssignments.jurisdictionProvince, jurisdiction.province),
        eq(govtAssignments.jurisdictionLocality, jurisdiction.locality),
        isNull(govtAssignments.revokedAt),
      ),
    );

  if (govts.length > 0) {
    // Deduplicate — a single govt can hold multiple assignments in the same
    // locality across different countries / re-grants (shouldn't, but the
    // partial unique only covers active rows for the same exact tuple).
    return Array.from(new Set(govts.map((g) => g.userId)));
  }

  // Tightened per migration 0015: only active, non-deactivated institutional
  // admins receive fallback notifications.
  const admins = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
      ),
    );

  return admins.map((a) => a.id);
}
