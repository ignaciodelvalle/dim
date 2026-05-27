// canReadCase anonymous branch (handoff P0-1). Verifies that:
//   - anon viewer (null) gets true for kinds in PUBLIC_ANONYMOUS_KINDS
//   - anon viewer gets false for every other kind → page surfaces notFound
//   - admin viewer always gets true (regression guard, no behavior change)

import { describe, expect, it } from "vitest";

import { canReadCase, isPubliclyVisibleKind } from "@/lib/case-access";
import { CASE_KINDS, type CaseKind } from "@/lib/case-kinds";
import type { CaseDetail } from "@/lib/case-queries";

const ANON = null;
const ADMIN = {
  userId: "00000000-0000-0000-0000-000000000001",
  role: "admin" as const,
  jurisdictions: [],
};

function fixtureDetail(kind: CaseKind): CaseDetail {
  // Minimal CaseDetail — canReadCase only touches caseKind for the anon
  // and admin branches under test. The owner/foster/dispute branches do
  // DB joins; those are covered elsewhere.
  return {
    id: "fixture-id",
    publicCode: "CAS-TEST-0001",
    caseKind: kind,
    status: "open",
    closedReason: null,
    supersededByCaseId: null,
    primarySubjectKind: "registered_pet",
    pet: null,
    primaryLocationLat: null,
    primaryLocationLng: null,
    jurisdictionCountry: "AR",
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    openedAt: new Date(),
    openedByUser: null,
    openedByOrganization: null,
    closedByUser: null,
    closedAt: null,
    openedReason: null,
    custodyDispute: null,
    events: [],
  } as unknown as CaseDetail;
}

describe("canReadCase — anonymous branch (P0-1)", () => {
  it("returns true for every kind in the public allow-list", async () => {
    const publicKinds: CaseKind[] = [
      "bite_incident",
      "lost_pet_episode",
      "adoption_listing",
      "welfare_denuncia",
    ];
    for (const kind of publicKinds) {
      const ok = await canReadCase(fixtureDetail(kind), ANON);
      expect(ok, `${kind} should be publicly visible`).toBe(true);
    }
  });

  it("returns false for every kind NOT in the public allow-list", async () => {
    const privateKinds = CASE_KINDS.filter(
      (k): k is CaseKind =>
        !["bite_incident", "lost_pet_episode", "adoption_listing", "welfare_denuncia"].includes(k),
    );
    for (const kind of privateKinds) {
      const ok = await canReadCase(fixtureDetail(kind), ANON);
      expect(ok, `${kind} must NOT be publicly visible (anon should 404)`).toBe(false);
    }
  });

  it("admin retains universal access for every kind (regression guard)", async () => {
    for (const kind of CASE_KINDS) {
      const ok = await canReadCase(fixtureDetail(kind), ADMIN);
      expect(ok, `admin should always read ${kind}`).toBe(true);
    }
  });
});

describe("isPubliclyVisibleKind", () => {
  it("matches the four critique-mandated kinds", () => {
    expect(isPubliclyVisibleKind("bite_incident")).toBe(true);
    expect(isPubliclyVisibleKind("lost_pet_episode")).toBe(true);
    expect(isPubliclyVisibleKind("adoption_listing")).toBe(true);
    expect(isPubliclyVisibleKind("welfare_denuncia")).toBe(true);
  });

  it("rejects every other kind", () => {
    expect(isPubliclyVisibleKind("custody_dispute")).toBe(false);
    expect(isPubliclyVisibleKind("adoption_application")).toBe(false);
    expect(isPubliclyVisibleKind("foster_placement")).toBe(false);
    expect(isPubliclyVisibleKind("microchip_remediation")).toBe(false);
    expect(isPubliclyVisibleKind("not-a-real-kind")).toBe(false);
  });
});
