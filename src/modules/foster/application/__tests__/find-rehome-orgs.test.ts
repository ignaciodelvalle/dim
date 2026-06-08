// Unit tests for findRehomeOrgs pure helper and sendRehomeRequest use-case.
// No DB needed — all behavior is pure logic or faked repos.
// TDD cycle: RED → GREEN

import { describe, expect, it, vi } from "vitest";
import { type RehomeOrgCandidate, filterRehomeOrgCandidates } from "../find-rehome-orgs";

// ---------------------------------------------------------------------------
// filterRehomeOrgCandidates — pure function tests
// ---------------------------------------------------------------------------

describe("filterRehomeOrgCandidates", () => {
  const makeOrg = (overrides: Partial<RehomeOrgCandidate> = {}): RehomeOrgCandidate => ({
    id: "org-1",
    displayName: "Refugio Test",
    orgType: "shelter",
    verified: true,
    publicToken: "org-tok-1",
    email: "test@refugio.org",
    phone: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    ...overrides,
  });

  it("includes verified shelters", () => {
    const orgs = [makeOrg({ orgType: "shelter", verified: true })];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("org-1");
  });

  it("includes verified rescue_networks", () => {
    const orgs = [makeOrg({ orgType: "rescue_network", verified: true })];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(1);
  });

  it("excludes unverified orgs", () => {
    const orgs = [makeOrg({ verified: false })];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(0);
  });

  it("excludes verified clinics (wrong type)", () => {
    const orgs = [makeOrg({ orgType: "clinic", verified: true })];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(0);
  });

  it("excludes verified sanitary_authority orgs", () => {
    const orgs = [makeOrg({ orgType: "sanitary_authority", verified: true })];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(0);
  });

  it("returns empty when no orgs match", () => {
    const result = filterRehomeOrgCandidates([]);
    expect(result).toHaveLength(0);
  });

  it("keeps only shelter and rescue_network from mixed list", () => {
    const orgs = [
      makeOrg({ id: "org-1", orgType: "shelter", verified: true }),
      makeOrg({ id: "org-2", orgType: "clinic", verified: true }),
      makeOrg({ id: "org-3", orgType: "rescue_network", verified: true }),
      makeOrg({ id: "org-4", orgType: "shelter", verified: false }),
    ];
    const result = filterRehomeOrgCandidates(orgs);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["org-1", "org-3"]);
  });
});

// ---------------------------------------------------------------------------
// sendRehomeRequest — use-case test
// ---------------------------------------------------------------------------

import type { FosterRepository } from "../../infrastructure/foster-repository";
import { sendRehomeRequest } from "../find-rehome-orgs";

function makeFakeRepo(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): typeof FosterRepository {
  return {
    findPetByToken: vi.fn().mockResolvedValue({
      id: "pet-1",
      name: "Luna",
      publicToken: "PT-tok",
    }),
    findActiveFosterByUser: vi.fn().mockResolvedValue({
      id: "own-foster-1",
      ownerUserId: "foster-user-1",
      petId: "pet-1",
    }),
    findOrgById: vi.fn().mockResolvedValue({
      id: "org-1",
      displayName: "Refugio Test",
      verified: true,
      orgType: "shelter",
    }),
    orgAdminAndCoordinatorUserIds: vi
      .fn()
      .mockResolvedValue([{ userId: "admin-1" }, { userId: "coord-1" }]),
    // unused — required for type compatibility
    findShelterPetByToken: vi.fn().mockResolvedValue(null),
    findActiveFosterRows: vi.fn().mockResolvedValue([]),
    insertEndFoster: vi.fn().mockResolvedValue({ caseId: null, volunteerAvailableSlots: null }),
    insertAssignFoster: vi.fn().mockResolvedValue({ ownershipId: "own-1", caseId: "case-1" }),
    insertProposeFoster: vi.fn().mockResolvedValue({ proposalId: "prop-1", caseId: "case-2" }),
    insertAcceptFosterProposal: vi.fn().mockResolvedValue({
      ownershipId: "own-1",
      newSlots: 0,
      cascadeCancelledTokens: [],
      cascadeOrgNotifyTargets: [],
      acceptingOrgCoordinatorIds: [],
      actorDisplayName: null,
    }),
    insertRejectFosterProposal: vi.fn().mockResolvedValue({ orgCoordinatorIds: [] }),
    insertCancelFosterProposal: vi.fn().mockResolvedValue({ volunteerUserId: "vol-user-1" }),
    insertSetCoFosterAllowed: vi.fn().mockResolvedValue(undefined),
    findActiveFosterOwnershipById: vi.fn().mockResolvedValue(null),
    findProfileById: vi.fn().mockResolvedValue({
      id: "foster-user-1",
      displayName: "María García",
      phone: "+54 11 1234-5678",
      accountType: "personal",
      role: null,
      dniVerified: false,
    }),
    findActiveMembership: vi.fn().mockResolvedValue(null),
    insertFosterOwnership: vi.fn().mockResolvedValue({ id: "own-1" }),
    endFosterOwnership: vi.fn().mockResolvedValue(undefined),
    findVolunteerByUserId: vi.fn().mockResolvedValue(null),
    findProposalByToken: vi.fn().mockResolvedValue(null),
    findDuplicatePending: vi.fn().mockResolvedValue(false),
    pendingProposalsForVolunteer: vi.fn().mockResolvedValue([]),
    insertProposal: vi.fn().mockResolvedValue({ id: "prop-1" }),
    updateProposalStatus: vi.fn().mockResolvedValue(undefined),
    orgFosterCoordinatorUserIds: vi.fn().mockResolvedValue([]),
    expirablePending: vi.fn().mockResolvedValue([]),
    expirePendingProposals: vi.fn().mockResolvedValue({ candidates: 0, expired: 0, errors: 0 }),
    upsertVolunteer: vi.fn().mockResolvedValue({ id: "vol-1", availableSlots: 1 }),
    setVolunteerSlots: vi.fn().mockResolvedValue(undefined),
    withdrawVolunteer: vi.fn().mockResolvedValue(undefined),
    searchVolunteers: vi.fn().mockResolvedValue([]),
    acceptedCountsByVolunteer: vi.fn().mockResolvedValue(new Map()),
    findOrgCustodyByPetId: vi.fn().mockResolvedValue(null),
    insertConvertFosterToOwner: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as typeof FosterRepository;
}

const actor = { user: { id: "foster-user-1" } };

describe("sendRehomeRequest", () => {
  it("returns error when pet is not found", async () => {
    const repo = makeFakeRepo({ findPetByToken: vi.fn().mockResolvedValue(null) });
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-1" },
      { repo, actor },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/mascota/i);
  });

  it("returns error when caller is not the active foster", async () => {
    const repo = makeFakeRepo({ findActiveFosterByUser: vi.fn().mockResolvedValue(null) });
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-1" },
      { repo, actor },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/tránsito activo/i);
  });

  it("returns error when target org is not found or not verified shelter/rescue_network", async () => {
    const repo = makeFakeRepo({
      findOrgById: vi.fn().mockResolvedValue(null),
    });
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-999" },
      { repo, actor },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/organización/i);
  });

  it("returns error when target org is a clinic (not shelter/rescue_network)", async () => {
    const repo = makeFakeRepo({
      findOrgById: vi.fn().mockResolvedValue({
        id: "org-1",
        displayName: "Clínica Test",
        verified: true,
        orgType: "clinic",
      }),
    });
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-1" },
      { repo, actor },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/tipo/i);
  });

  it("emits notifications to org admins and coordinators on success", async () => {
    const repo = makeFakeRepo();
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-1" },
      { repo, actor },
    );
    expect(result).toMatchObject({ ok: true });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    // Both admin-1 and coord-1 should receive a notification.
    const targetUserIds = r.notifications.map((n) => n.userId);
    expect(targetUserIds).toContain("admin-1");
    expect(targetUserIds).toContain("coord-1");
  });

  it("notification body includes pet name and foster contact info", async () => {
    const repo = makeFakeRepo();
    const result = await sendRehomeRequest(
      { petPublicToken: "PT-tok", targetOrgId: "org-1" },
      { repo, actor },
    );
    const r = result as { ok: true; notifications: { body: string; userId: string }[] };
    const adminNotif = r.notifications.find((n) => n.userId === "admin-1");
    expect(adminNotif?.body).toContain("Luna");
    expect(adminNotif?.body).toContain("María García");
  });
});
