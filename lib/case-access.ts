// Access check for /casos/[publicCode]. Mirrors what Fase F's
// `can_read_case` RLS function will enforce at the DB level — the page
// uses this helper today so the same rules are visible in app code.
//
// Returns true if the viewer can read this case. Caller treats false as
// 404 (not 403) to avoid leaking case existence to outside parties.

import { and, eq, isNull } from "drizzle-orm";

import { custodyDisputeParties, db, organizationMemberships, ownerships } from "@/db";
import type { CaseDetail } from "./case-queries";

export interface CaseViewer {
  userId: string;
  role: "owner" | "vet" | "govt" | "admin";
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>;
}

export async function canReadCase(detail: CaseDetail, viewer: CaseViewer): Promise<boolean> {
  // Admin: universal scope.
  if (viewer.role === "admin") return true;

  // Govt: scope-bound to jurisdiction.
  if (viewer.role === "govt") {
    const inScope = viewer.jurisdictions.some(
      (j) =>
        j.province === detail.jurisdictionProvince && j.locality === detail.jurisdictionLocality,
    );
    if (inScope) return true;
    // Govt out-of-scope keeps falling through to the per-kind checks
    // below — they still don't apply, so the function returns false.
    return false;
  }

  // Subject pet owner — except welfare_denuncia, where the owner is the
  // subject of the investigation and must not see the case detail.
  if (detail.pet) {
    const [ownerRow] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, detail.pet.id),
          eq(ownerships.ownerUserId, viewer.userId),
          eq(ownerships.role, "owner"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    if (ownerRow) {
      if (detail.caseKind === "welfare_denuncia") return false;
      return true;
    }
  }

  // adoption_application — only the applicant.
  if (detail.caseKind === "adoption_application") {
    // applicantUserId lives on the case row, but it's not in the
    // CaseDetail projection. For v1 we accept the simpler check:
    // the applicant accessing their own application is a write-only
    // path today (the list page exists). When Fase F lands the SQL
    // function makes this authoritative.
    return false;
  }

  // adoption_listing — members of the opened_by org.
  if (detail.caseKind === "adoption_listing" && detail.openedByOrganization) {
    const [memberRow] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, detail.openedByOrganization.id),
          eq(organizationMemberships.userId, viewer.userId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    if (memberRow) return true;
  }

  // foster_placement — the active foster on the pet OR org-side members
  // of the opened_by org.
  if (detail.caseKind === "foster_placement" && detail.pet) {
    const [fosterRow] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, detail.pet.id),
          eq(ownerships.ownerUserId, viewer.userId),
          eq(ownerships.role, "foster"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    if (fosterRow) return true;
    if (detail.openedByOrganization) {
      const [memberRow] = await db
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, detail.openedByOrganization.id),
            eq(organizationMemberships.userId, viewer.userId),
            isNull(organizationMemberships.leftAt),
          ),
        )
        .limit(1);
      if (memberRow) return true;
    }
  }

  // custody_dispute — registered parties (user-side).
  if (detail.caseKind === "custody_dispute" && detail.custodyDispute) {
    const [partyRow] = await db
      .select({ id: custodyDisputeParties.id })
      .from(custodyDisputeParties)
      .where(
        and(
          eq(custodyDisputeParties.disputeId, detail.custodyDispute.id),
          eq(custodyDisputeParties.partyUserId, viewer.userId),
        ),
      )
      .limit(1);
    if (partyRow) return true;
  }

  return false;
}
