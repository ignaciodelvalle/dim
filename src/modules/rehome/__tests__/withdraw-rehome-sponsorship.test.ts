// withdrawRehomeSponsorship — the use-case against a FAKE port (unit project).
// Layer: Unit. The real-Postgres proof of the same transaction lives in
// __tests__/rehome-withdraw-flow.test.ts (serial `db` project); this file pins
// the two things a fake can prove better than a database can: WHAT the
// use-case says to people, and HOW it fails.
//
// WU5 review (LOW), two items:
//   - The adopter whose application the org had already APPROVED got the same
//     "tu postulación quedó cerrada" as someone never reviewed. That person
//     was days from an adoption; the notice has to acknowledge the approval
//     and say the adoption will not happen.
//   - A serialization failure (40P01 deadlock, 40001 serialization) inside the
//     transaction surfaced as an unhandled action error. It is now a refusal
//     in es-AR that names what happened and what to do; every other error
//     still propagates unchanged.

import { describe, expect, it, vi } from "vitest";

import type { RehomeWithdrawPort, StrandedApplication } from "../application/ports";
import { withdrawRehomeSponsorship } from "../application/withdraw-rehome-sponsorship";

const PET = {
  id: "pet-1",
  publicToken: "DIM-TEST-0001",
  name: "Tango",
  status: "active",
  jurisdictionProvince: "Buenos Aires",
  jurisdictionLocality: "La Plata",
  localityId: null,
  inCustodyDispute: false,
  rabiesObservationStatus: null,
  adoptionIneligibleUntil: null,
};

const ORG = {
  id: "org-1",
  displayName: "Refugio Padrino",
  publicToken: "DIM-ORG-0001",
  orgType: "shelter",
  verified: true,
};

function makePort(stranded: StrandedApplication[] = []): RehomeWithdrawPort {
  return {
    findPetByToken: vi.fn().mockResolvedValue(PET),
    findLiveOwnerRow: vi.fn().mockResolvedValue({ id: "own-owner-1" }),
    lockLiveOwnerRow: vi.fn().mockResolvedValue({ id: "own-owner-1" }),
    acquirePetAdvisoryLock: vi.fn().mockResolvedValue(undefined),
    findOrgById: vi.fn().mockResolvedValue(ORG),
    orgAdminAndCoordinatorUserIds: vi.fn().mockResolvedValue(["coord-1"]),
    findDisplayName: vi.fn().mockResolvedValue("Ana Titular"),
    findOpenSponsorshipForPet: vi
      .fn()
      .mockResolvedValue({ ownershipId: "own-custody-1", sponsoringOrganizationId: ORG.id }),
    endCustodyRow: vi.fn().mockResolvedValue({ ended: true }),
    unpublishListing: vi.fn().mockResolvedValue(undefined),
    endSponsorshipByTitular: vi.fn().mockResolvedValue(undefined),
    findOpenListingCase: vi.fn().mockResolvedValue({ id: "case-listing", publicCode: "CAS-0001" }),
    closeListingCase: vi.fn().mockResolvedValue({ won: true }),
    findApplicationsOnListing: vi.fn().mockResolvedValue(stranded),
    closeApplicationByTitular: vi.fn().mockResolvedValue(undefined),
    findOpenRequestForPet: vi.fn().mockResolvedValue(null),
    lockRequestCase: vi.fn().mockResolvedValue(null),
    closeRequestCase: vi.fn().mockResolvedValue(undefined),
  };
}

const transaction = async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb("fake-tx");
const deps = (repo: RehomeWithdrawPort) => ({ repo, now: () => new Date(), transaction });
const input = { petPublicToken: PET.publicToken, titularUserId: "titular-1" };

describe("withdrawRehomeSponsorship — what the stranded applicants are told", () => {
  it("an APPROVED-but-unfinalized adopter is told the approval existed and the adoption will not happen", async () => {
    const repo = makePort([
      { applicationId: "app-approved", applicantUserId: "adopter-1", approved: true },
    ]);
    const r = await withdrawRehomeSponsorship(input, deps(repo));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const notice = r.notifications.find((n) => n.userId === "adopter-1");
    expect(notice?.notificationType).toBe("adoption_application_closed");
    expect(notice?.title).toMatch(/había sido aprobada/);
    expect(notice?.body).toMatch(/antes de concretar la adopción/);
    expect(notice?.body).toMatch(/no va a realizarse/);
    expect(notice?.body).toMatch(/No hace falta que hagas nada/);
  });

  it("a PENDING applicant keeps the plain close — nothing had been promised to them", async () => {
    const repo = makePort([
      { applicationId: "app-pending", applicantUserId: "applicant-1", approved: false },
    ]);
    const r = await withdrawRehomeSponsorship(input, deps(repo));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const notice = r.notifications.find((n) => n.userId === "applicant-1");
    expect(notice?.title).toBe("Tu postulación por Tango quedó cerrada");
    expect(notice?.body).toMatch(/titular retiró la búsqueda de hogar/);
    expect(notice?.body).not.toMatch(/aprobada/);
  });

  it("one notice per applicant, the org's admins told separately", async () => {
    const repo = makePort([
      { applicationId: "app-approved", applicantUserId: "adopter-1", approved: true },
      { applicationId: "app-pending", applicantUserId: "applicant-1", approved: false },
    ]);
    const r = await withdrawRehomeSponsorship(input, deps(repo));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notifications.map((n) => n.userId).sort()).toEqual([
      "adopter-1",
      "applicant-1",
      "coord-1",
    ]);
  });
});

describe("withdrawRehomeSponsorship — lock order and how the transaction fails", () => {
  it("takes the pet advisory lock before the owner-row lock", async () => {
    const repo = makePort();
    const order: string[] = [];
    (repo.acquirePetAdvisoryLock as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("advisory");
    });
    (repo.lockLiveOwnerRow as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("owner-row");
      return { id: "own-owner-1" };
    });
    const r = await withdrawRehomeSponsorship(input, deps(repo));
    expect(r.ok).toBe(true);
    expect(repo.acquirePetAdvisoryLock).toHaveBeenCalledWith(PET.id, "fake-tx");
    expect(order).toEqual(["advisory", "owner-row"]);
  });

  for (const code of ["40P01", "40001"]) {
    it(`a ${code} inside the transaction is a readable refusal, not an unhandled error`, async () => {
      const repo = makePort();
      const failing = async () => {
        // The shape drizzle 0.45 throws: the SQLSTATE lives on `cause`.
        const err = new Error("Failed query: update ownerships …");
        (err as Error & { cause: unknown }).cause = { code, message: "deadlock detected" };
        throw err;
      };
      const r = await withdrawRehomeSponsorship(input, { ...deps(repo), transaction: failing });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/Tango/);
      expect(r.error).toMatch(/al mismo tiempo/);
      expect(r.error).toMatch(/Volvé a intentar/);
      expect(r.error).not.toMatch(/deadlock|Failed query/);
    });
  }

  it("any other failure still propagates — a refusal must not hide a real bug", async () => {
    const repo = makePort();
    const failing = async () => {
      throw new Error("boom");
    };
    await expect(
      withdrawRehomeSponsorship(input, { ...deps(repo), transaction: failing }),
    ).rejects.toThrow("boom");
  });
});
