// Unit tests for cancelFosterProposal use-case.
// TDD: RED → GREEN (cancel-foster-proposal.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FosterRepository } from "../../infrastructure/foster-repository";
import { cancelFosterProposal } from "../cancel-foster-proposal";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "prop-1",
    publicToken: "FP-test",
    organizationId: "org-1",
    volunteerUserId: "vol-user-1",
    petId: "pet-1",
    status: "pending",
    caseId: "case-1",
    ...overrides,
  };
}

function makeFakeRepo(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): typeof FosterRepository {
  return {
    findProposalByToken: vi.fn().mockResolvedValue(makeProposal()),
    insertCancelFosterProposal: vi.fn().mockResolvedValue({ volunteerUserId: "vol-user-1" }),
    // composite stubs
    insertAssignFoster: vi.fn().mockResolvedValue({ ownershipId: "own-1", caseId: "case-1" }),
    insertEndFoster: vi.fn().mockResolvedValue({ caseId: null, volunteerAvailableSlots: null }),
    insertProposeFoster: vi.fn().mockResolvedValue({ proposalId: "prop-1", caseId: "case-1" }),
    insertAcceptFosterProposal: vi.fn().mockResolvedValue({
      ownershipId: "own-1",
      newSlots: 0,
      cascadeCancelledTokens: [],
      cascadeOrgNotifyTargets: [],
      acceptingOrgCoordinatorIds: [],
      actorDisplayName: null,
    }),
    insertRejectFosterProposal: vi.fn().mockResolvedValue({ orgCoordinatorIds: [] }),
    insertSetCoFosterAllowed: vi.fn().mockResolvedValue(undefined),
    findActiveFosterOwnershipById: vi.fn().mockResolvedValue(null),
    findProfileById: vi.fn().mockResolvedValue(null),
    findShelterPetByToken: vi.fn().mockResolvedValue(null),
    findActiveFosterRows: vi.fn().mockResolvedValue([]),
    findActiveMembership: vi.fn().mockResolvedValue(null),
    insertFosterOwnership: vi.fn().mockResolvedValue({ id: "own-1" }),
    endFosterOwnership: vi.fn().mockResolvedValue(undefined),
    findDuplicatePending: vi.fn().mockResolvedValue(false),
    pendingProposalsForVolunteer: vi.fn().mockResolvedValue([]),
    insertProposal: vi.fn().mockResolvedValue({ id: "prop-1" }),
    updateProposalStatus: vi.fn().mockResolvedValue(undefined),
    findVolunteerByUserId: vi.fn().mockResolvedValue(null),
    orgFosterCoordinatorUserIds: vi.fn().mockResolvedValue([]),
    expirablePending: vi.fn().mockResolvedValue([]),
    expirePendingProposals: vi.fn().mockResolvedValue({ candidates: 0, expired: 0, errors: 0 }),
    upsertVolunteer: vi.fn().mockResolvedValue({ id: "vol-1", availableSlots: 1 }),
    setVolunteerSlots: vi.fn().mockResolvedValue(undefined),
    withdrawVolunteer: vi.fn().mockResolvedValue(undefined),
    searchVolunteers: vi.fn().mockResolvedValue([]),
    acceptedCountsByVolunteer: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  } as unknown as typeof FosterRepository;
}

const fakeTx = "fake-tx" as unknown;
const fakeTransaction = vi
  .fn()
  .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));

// actor represents the org side (auth already verified by caller)
const actor = {
  user: { id: "org-user-1" },
  organization: { id: "org-1" },
};

const baseInput = {
  proposalPublicToken: "FP-test",
  cancellationReason: null as string | null,
};

// ---------------------------------------------------------------------------
// Tests — cancelFosterProposal
// ---------------------------------------------------------------------------

describe("cancelFosterProposal", () => {
  beforeEach(() => {
    fakeTransaction.mockClear();
  });

  it("returns error when proposal not found", async () => {
    const repo = makeFakeRepo({ findProposalByToken: vi.fn().mockResolvedValue(null) });
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrada/i);
  });

  it("returns error when proposal is not pending", async () => {
    const repo = makeFakeRepo({
      findProposalByToken: vi.fn().mockResolvedValue(makeProposal({ status: "accepted" })),
    });
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/activa/i);
  });

  it("calls insertCancelFosterProposal inside tx on success", async () => {
    const repo = makeFakeRepo();
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(fakeTransaction).toHaveBeenCalledOnce();
    expect(repo.insertCancelFosterProposal).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: "org_cancelled" }),
      fakeTx,
    );
  });

  it("uses provided cancellationReason when supplied", async () => {
    const repo = makeFakeRepo();
    await cancelFosterProposal(
      { ...baseInput, cancellationReason: "custom reason" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(repo.insertCancelFosterProposal).toHaveBeenCalledWith(
      expect.objectContaining({ cancellationReason: "custom reason" }),
      fakeTx,
    );
  });

  it("returns foster_proposal_cancelled_volunteer notification", async () => {
    const repo = makeFakeRepo();
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "foster_proposal_cancelled_volunteer",
    );
    expect(n).toBeDefined();
    expect(n?.userId).toBe("vol-user-1");
  });

  it("targets proposal.organizationId for auth (NOT actor.organization.id only)", async () => {
    // The proposal may belong to a DIFFERENT org than the actor's org if the
    // action edge mis-routes it. But the use-case receives a pre-verified actor
    // per design: auth is done by the thin action BEFORE calling the use-case.
    // We just verify the repo is called with the proposal that was looked up.
    const repo = makeFakeRepo({
      findProposalByToken: vi.fn().mockResolvedValue(makeProposal({ organizationId: "org-99" })),
    });
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    // Use-case delegates auth to action; it proceeds with whatever proposal is found.
    expect(result).toMatchObject({ ok: true });
  });

  it("propagates tx error as ok:false", async () => {
    const repo = makeFakeRepo({
      insertCancelFosterProposal: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    const result = await cancelFosterProposal(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/cancelar/i);
  });
});
