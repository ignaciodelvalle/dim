// Unit tests for all WU-3 transfers use-cases.
// TDD: RED → GREEN — tests written first, then implementations.
//
// Uses a fake TransfersRepository (vi.fn() stubs) — no DB, no Next.js.
// Each describe block covers one use-case; guards are tested per spec R1-R11.

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransfersRepository } from "../../infrastructure/transfers-repository";

import { acceptCrossOrgTransfer } from "../accept-cross-org-transfer";
import { acceptPetTransfer } from "../accept-pet-transfer";
import { cancelCrossOrgTransfer } from "../cancel-cross-org-transfer";
import { cancelPetTransfer } from "../cancel-pet-transfer";
import { expireCrossOrgTransfers } from "../expire-cross-org-transfers";
import { expirePetTransfers } from "../expire-pet-transfers";
import { getTransferForViewer } from "../get-transfer-for-viewer";
// ---------------------------------------------------------------------------
// Imports — these will fail (RED) until implementation files exist
// ---------------------------------------------------------------------------
import { initiatePetTransfer } from "../initiate-pet-transfer";
import { proposeCrossOrgTransfer } from "../propose-cross-org-transfer";
import { rejectCrossOrgTransfer } from "../reject-cross-org-transfer";
import { rejectPetTransfer } from "../reject-pet-transfer";
import { transferCustody } from "../transfer-custody";

// ---------------------------------------------------------------------------
// Fake repo builder
// ---------------------------------------------------------------------------

function makePet(overrides: Record<string, unknown> = {}) {
  return {
    id: "pet-1",
    publicToken: "PT-tok",
    name: "Luna",
    status: "found",
    inCustodyDispute: false,
    jurisdictionProvince: null,
    jurisdictionLocality: null,
    ...overrides,
  };
}

function makeTransfer(overrides: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: "tr-1",
    publicToken: "PTR-tok",
    petId: "pet-1",
    fromOwnerId: "user-sender",
    toOwnerId: "user-recipient",
    toOwnerEmail: "recipient@example.com",
    status: "pending",
    reason: "gift",
    note: null,
    expiresAt,
    respondedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    publicCode: "CASE-001",
    caseKind: "custody_transfer_handshake",
    status: "open",
    primaryPetId: "pet-1",
    openedByOrganizationId: "org-sender",
    receiverOrganizationId: "org-receiver",
    openedAt: new Date(),
    ...overrides,
  };
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-receiver",
    displayName: "Refugio Receptor",
    verified: true,
    status: "active",
    ...overrides,
  };
}

function makeProposalEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    petId: "pet-1",
    eventType: "custody_transfer_proposed",
    caseId: "case-1",
    payload: {
      from_organization_id: "org-sender",
      to_organization_id: "org-receiver",
      reason: "space_constraint",
    },
    recordedAt: new Date(),
    ...overrides,
  };
}

function makeFakeRepo(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
): typeof TransfersRepository {
  return {
    // shared reads
    findPetByToken: vi.fn().mockResolvedValue(makePet()),
    findActiveOwnerOwnership: vi
      .fn()
      .mockResolvedValue({ id: "own-1", ownerUserId: "user-sender" }),
    findUserIdByEmail: vi.fn().mockResolvedValue(null),
    // owner-flow writes
    insertPetTransfer: vi.fn().mockResolvedValue(undefined),
    findTransferByToken: vi.fn().mockResolvedValue(makeTransfer()),
    updateTransferStatus: vi.fn().mockResolvedValue(undefined),
    expirablePetTransfers: vi.fn().mockResolvedValue([]),
    closeOwnerOwnerships: vi.fn().mockResolvedValue(undefined),
    insertOwnerOwnership: vi.fn().mockResolvedValue({ id: "own-new" }),
    insertPetEvent: vi.fn().mockResolvedValue({ id: "evt-new" }),
    // cross-org reads
    findActiveShelterCustody: vi.fn().mockResolvedValue({ id: "cust-1" }),
    findReceiverOrg: vi.fn().mockResolvedValue(makeOrg()),
    findOpenHandshakeCase: vi.fn().mockResolvedValue(null),
    findOpenDispute: vi.fn().mockResolvedValue(null),
    openHandshakeCase: vi.fn().mockResolvedValue(makeCase()),
    proposalEventsForCase: vi.fn().mockResolvedValue([makeProposalEvent()]),
    endShelterCustody: vi.fn().mockResolvedValue(undefined),
    insertShelterCustody: vi.fn().mockResolvedValue({ id: "cust-new" }),
    orgCoordinatorAdminUserIds: vi.fn().mockResolvedValue([{ userId: "coord-1" }]),
    closeCase: vi.fn().mockResolvedValue(undefined),
    findOpenCustodyEpisode: vi.fn().mockResolvedValue(null),
    // direct-transfer reads
    findPetUnderOrg: vi.fn().mockResolvedValue({
      pet: makePet(),
      ownershipId: "own-src",
      ownershipRole: "shelter_custody",
    }),
    findActiveFosterRow: vi.fn().mockResolvedValue(null),
    orgAdminUserIds: vi.fn().mockResolvedValue([{ userId: "admin-1" }]),
    // direct-transfer writes
    closeOwnershipById: vi.fn().mockResolvedValue(undefined),
    closeFosterOwnership: vi.fn().mockResolvedValue(undefined),
    // notifications
    insertNotifications: vi.fn().mockResolvedValue(undefined),
    // cross-org case lookup by publicCode (for accept/reject/cancel)
    findCaseByPublicCode: vi.fn().mockResolvedValue(makeCase()),
    // cross-org expiry (repo-level helpers pulled from lib)
    findExpirableCrossOrgCases: vi.fn().mockResolvedValue([]),
    expireOneCrossOrgCase: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as typeof TransfersRepository;
}

const fakeTx = "fake-tx" as unknown;
// fakeTransaction is a module-level let so each beforeEach can re-set the
// implementation after mockClear, avoiding a vitest 4.x timing issue where
// mockClear() across multiple describe blocks drops the implementation.
let fakeTransaction = vi
  .fn()
  .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));

// ---------------------------------------------------------------------------
// R1 — initiatePetTransfer
// ---------------------------------------------------------------------------

describe("initiatePetTransfer", () => {
  const actor = { user: { id: "user-sender" } };
  const baseInput = {
    petToken: "PT-tok",
    toEmail: "recipient@example.com",
    reason: "gift",
    note: null as string | null,
    callerEmail: "sender@example.com",
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error for invalid email", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(
      { ...baseInput, toEmail: "not-an-email" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/email/i);
  });

  it("returns error for invalid reason", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(
      { ...baseInput, reason: "random" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/motivo/i);
  });

  it("returns error when pet not found", async () => {
    const repo = makeFakeRepo({ findPetByToken: vi.fn().mockResolvedValue(null) });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when pet is deceased", async () => {
    const repo = makeFakeRepo({
      findPetByToken: vi.fn().mockResolvedValue(makePet({ status: "deceased" })),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/fallecida/i);
  });

  it("returns error when pet is lost", async () => {
    const repo = makeFakeRepo({
      findPetByToken: vi.fn().mockResolvedValue(makePet({ status: "lost" })),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/perdida/i);
  });

  it("returns error when pet is in custody dispute", async () => {
    const repo = makeFakeRepo({
      findPetByToken: vi.fn().mockResolvedValue(makePet({ inCustodyDispute: true })),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/disputa/i);
  });

  it("returns error when caller is not the active owner", async () => {
    const repo = makeFakeRepo({
      findActiveOwnerOwnership: vi.fn().mockResolvedValue(null),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/dueño actual/i);
  });

  it("returns error when caller owns and tries self-transfer", async () => {
    const repo = makeFakeRepo({
      findUserIdByEmail: vi.fn().mockResolvedValue("user-sender"),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/mismo/i);
  });

  it("succeeds and calls insertPetTransfer", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertPetTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ petId: "pet-1", fromOwnerId: "user-sender" }),
      fakeTx,
    );
  });

  it("returns transferToken with PTR- prefix", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; value: { transferToken: string } };
    expect(r.value.transferToken).toMatch(/^PTR-/);
  });

  it("returns sender notification", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_initiated");
    expect(n).toBeDefined();
    expect(n?.userId).toBe("user-sender");
  });

  it("returns recipient notification when recipient known", async () => {
    const repo = makeFakeRepo({
      findUserIdByEmail: vi.fn().mockResolvedValue("user-recipient"),
    });
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_received");
    expect(n).toBeDefined();
    expect(n?.userId).toBe("user-recipient");
  });

  it("does not return recipient notification when recipient unknown (invite path)", async () => {
    const repo = makeFakeRepo();
    const result = await initiatePetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_received");
    expect(n).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R2 — acceptPetTransfer
// ---------------------------------------------------------------------------

describe("acceptPetTransfer", () => {
  const actor = { user: { id: "user-recipient" } };
  const baseInput = {
    transferToken: "PTR-tok",
    callerEmail: "recipient@example.com",
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when transfer not found", async () => {
    const repo = makeFakeRepo({ findTransferByToken: vi.fn().mockResolvedValue(null) });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrada/i);
  });

  it("returns error when transfer is not pending", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ status: "accepted" })),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/accepted|aceptada/i);
  });

  it("returns error when transfer is expired", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(makeTransfer({ expiresAt: new Date(Date.now() - 1000) })),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/expir/i);
  });

  it("returns error when caller is not the recipient (id mismatch)", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ toOwnerId: "other-user" })),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/propuesta no es para/i);
  });

  it("returns error when caller is the sender (own transfer)", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: "user-recipient", toOwnerId: "user-recipient" }),
        ),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/propia/i);
  });

  it("accepts by email when toOwnerId is null and email matches", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ toOwnerId: null, toOwnerEmail: "recipient@example.com" }),
        ),
      findPetByToken: vi.fn().mockResolvedValue(makePet()),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("calls closeOwnerOwnerships then insertOwnerOwnership inside tx", async () => {
    const repo = makeFakeRepo();
    await acceptPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.closeOwnerOwnerships).toHaveBeenCalledWith("pet-1", fakeTx);
    expect(repo.insertOwnerOwnership).toHaveBeenCalledWith(
      expect.objectContaining({ petId: "pet-1", ownerUserId: "user-recipient" }),
      fakeTx,
    );
  });

  it("emits custody_transferred event inside tx", async () => {
    const repo = makeFakeRepo();
    await acceptPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "custody_transferred", authorRole: "owner" }),
      fakeTx,
    );
  });

  it("returns sender notification on success", async () => {
    const repo = makeFakeRepo();
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_accepted");
    expect(n).toBeDefined();
    expect(n?.userId).toBe("user-sender");
  });
});

// ---------------------------------------------------------------------------
// R3 — rejectPetTransfer
// ---------------------------------------------------------------------------

describe("rejectPetTransfer", () => {
  const actor = { user: { id: "user-recipient" } };
  const baseInput = {
    transferToken: "PTR-tok",
    callerEmail: "recipient@example.com",
    reason: null as string | null,
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when transfer not found", async () => {
    const repo = makeFakeRepo({ findTransferByToken: vi.fn().mockResolvedValue(null) });
    const result = await rejectPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when status is not pending", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ status: "cancelled" })),
    });
    const result = await rejectPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/cancelled|cancelada/i);
  });

  it("returns error when caller is not recipient", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ toOwnerId: "other-user" })),
    });
    const result = await rejectPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/propuesta no es para/i);
  });

  it("calls updateTransferStatus with rejected inside tx", async () => {
    const repo = makeFakeRepo();
    await rejectPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.updateTransferStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected" }),
      fakeTx,
    );
  });

  it("returns sender notification with reason included when present", async () => {
    const repo = makeFakeRepo();
    const result = await rejectPetTransfer(
      { ...baseInput, reason: "Me arrepentí" },
      { repo, actor, transaction: fakeTransaction },
    );
    const r = result as { ok: true; notifications: { body: string; userId: string }[] };
    const n = r.notifications.find((n) => n.userId === "user-sender");
    expect(n?.body).toContain("Me arrepentí");
  });

  it("returns ok on success", async () => {
    const repo = makeFakeRepo();
    const result = await rejectPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// R4 — cancelPetTransfer
// ---------------------------------------------------------------------------

describe("cancelPetTransfer", () => {
  const actor = { user: { id: "user-sender" } };
  const baseInput = { transferToken: "PTR-tok" };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when transfer not found", async () => {
    const repo = makeFakeRepo({ findTransferByToken: vi.fn().mockResolvedValue(null) });
    const result = await cancelPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when caller is not the sender", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ fromOwnerId: "other-user" })),
    });
    const result = await cancelPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/emisor/i);
  });

  it("returns error when status is not pending", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ status: "rejected" })),
    });
    const result = await cancelPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/rejected|rechazada/i);
  });

  it("calls updateTransferStatus with cancelled inside tx", async () => {
    const repo = makeFakeRepo();
    await cancelPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.updateTransferStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" }),
      fakeTx,
    );
  });

  it("returns recipient notification when toOwnerId is set", async () => {
    const repo = makeFakeRepo();
    const result = await cancelPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_cancelled");
    expect(n).toBeDefined();
    expect(n?.userId).toBe("user-recipient");
  });

  it("does not return notification when toOwnerId is null", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ toOwnerId: null })),
    });
    const result = await cancelPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_cancelled");
    expect(n).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R5 — getTransferForViewer
// ---------------------------------------------------------------------------

describe("getTransferForViewer", () => {
  const actor = { user: { id: "user-sender" } };
  const baseInput = {
    transferToken: "PTR-tok",
    callerEmail: "sender@example.com",
  };

  it("returns error when transfer not found", async () => {
    const repo = makeFakeRepo({ findTransferByToken: vi.fn().mockResolvedValue(null) });
    const result = await getTransferForViewer(baseInput, { repo, actor });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrada/i);
  });

  it("returns error when caller is neither sender nor recipient", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(makeTransfer({ fromOwnerId: "other-user", toOwnerId: "yet-another" })),
    });
    const result = await getTransferForViewer(baseInput, { repo, actor });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/accesible/i);
  });

  it("returns isSender=true when caller is sender", async () => {
    const repo = makeFakeRepo();
    const result = await getTransferForViewer(baseInput, { repo, actor });
    const r = result as { ok: true; value: { isSender: boolean } };
    expect(r.value.isSender).toBe(true);
  });

  it("returns isRecipient=true when caller is recipient by id", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(makeTransfer({ fromOwnerId: "other-user", toOwnerId: "user-sender" })),
    });
    const result = await getTransferForViewer(baseInput, { repo, actor });
    const r = result as { ok: true; value: { isRecipient: boolean } };
    expect(r.value.isRecipient).toBe(true);
  });

  it("returns isRecipient=true when caller matches by email (open invite)", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(
        makeTransfer({
          fromOwnerId: "other-user",
          toOwnerId: null,
          toOwnerEmail: "sender@example.com",
        }),
      ),
    });
    const result = await getTransferForViewer(baseInput, { repo, actor });
    const r = result as { ok: true; value: { isRecipient: boolean } };
    expect(r.value.isRecipient).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R6 — expirePetTransfers
// ---------------------------------------------------------------------------

describe("expirePetTransfers", () => {
  it("returns expired count of 0 when no stale transfers", async () => {
    const repo = makeFakeRepo({ expirablePetTransfers: vi.fn().mockResolvedValue([]) });
    const result = await expirePetTransfers({ repo });
    expect(result).toMatchObject({ ok: true, value: { expired: 0 } });
  });

  it("expires each stale transfer per-row (not single tx)", async () => {
    const rows = [
      { id: "tr-1", petId: "pet-1", fromOwnerId: "user-sender", publicToken: "PTR-1" },
      { id: "tr-2", petId: "pet-2", fromOwnerId: "user-sender2", publicToken: "PTR-2" },
    ];
    const repo = makeFakeRepo({ expirablePetTransfers: vi.fn().mockResolvedValue(rows) });
    const result = await expirePetTransfers({ repo });
    const r = result as { ok: true; value: { expired: number } };
    expect(r.value.expired).toBe(2);
    expect(repo.updateTransferStatus).toHaveBeenCalledTimes(2);
  });

  it("continues loop on per-row failure", async () => {
    const rows = [
      { id: "tr-1", petId: "pet-1", fromOwnerId: "user-sender", publicToken: "PTR-1" },
      { id: "tr-2", petId: "pet-2", fromOwnerId: "user-sender2", publicToken: "PTR-2" },
    ];
    const repo = makeFakeRepo({
      expirablePetTransfers: vi.fn().mockResolvedValue(rows),
      updateTransferStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error("db hiccup"))
        .mockResolvedValue(undefined),
    });
    const result = await expirePetTransfers({ repo });
    const r = result as { ok: true; value: { expired: number } };
    // Only the second row succeeded
    expect(r.value.expired).toBe(1);
  });

  it("sends fromOwnerId notification per row", async () => {
    const rows = [{ id: "tr-1", petId: "pet-1", fromOwnerId: "user-sender", publicToken: "PTR-1" }];
    const repo = makeFakeRepo({ expirablePetTransfers: vi.fn().mockResolvedValue(rows) });
    const result = await expirePetTransfers({ repo });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "pet_transfer_expired");
    expect(n?.userId).toBe("user-sender");
  });
});

// ---------------------------------------------------------------------------
// R7 — proposeCrossOrgTransfer
// ---------------------------------------------------------------------------

describe("proposeCrossOrgTransfer", () => {
  const actor = {
    user: { id: "org-user-1" },
    organization: {
      id: "org-sender",
      publicToken: "sender-tok",
      verified: true,
      displayName: "Sender Org",
    },
  };
  const baseInput = {
    senderOrgToken: "sender-tok",
    petPublicToken: "PT-tok",
    receiverOrgId: "org-receiver",
    reason: "space_constraint",
    notes: null as string | null,
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when senderOrgToken does not match actor org", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(
      { ...baseInput, senderOrgToken: "wrong-tok" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/distinta a la sender/i);
  });

  it("returns error for invalid reason", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(
      { ...baseInput, reason: "bad-reason" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/motivo/i);
  });

  it("returns error when other reason without notes", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(
      { ...baseInput, reason: "other", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/nota/i);
  });

  it("returns error when pet not found", async () => {
    const repo = makeFakeRepo({ findPetByToken: vi.fn().mockResolvedValue(null) });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when sender has no active custody", async () => {
    const repo = makeFakeRepo({ findActiveShelterCustody: vi.fn().mockResolvedValue(null) });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/custodia activa/i);
  });

  it("returns error when receiver equals sender", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(
      { ...baseInput, receiverOrgId: "org-sender" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/propia organización/i);
  });

  it("returns error when receiver org not found", async () => {
    const repo = makeFakeRepo({ findReceiverOrg: vi.fn().mockResolvedValue(null) });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/destinataria no encontrada/i);
  });

  it("returns error when receiver org not verified", async () => {
    const repo = makeFakeRepo({
      findReceiverOrg: vi.fn().mockResolvedValue(makeOrg({ verified: false })),
    });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/verificada/i);
  });

  it("returns error when open handshake exists", async () => {
    const repo = makeFakeRepo({
      findOpenHandshakeCase: vi.fn().mockResolvedValue({ id: "existing-case" }),
    });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/pendiente/i);
  });

  it("returns error when custody dispute exists", async () => {
    const repo = makeFakeRepo({
      findOpenDispute: vi.fn().mockResolvedValue({ id: "dispute-1" }),
    });
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/disputa/i);
  });

  it("succeeds and calls openHandshakeCase inside tx", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(repo.openHandshakeCase).toHaveBeenCalledWith(
      expect.objectContaining({ receiverOrganizationId: "org-receiver" }),
      fakeTx,
    );
  });

  it("returns publicCode from case", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; value: { publicCode: string } };
    expect(r.value.publicCode).toBe("CASE-001");
  });

  it("returns receiver coordinator notifications", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_proposed_receiver",
    );
    expect(n?.userId).toBe("coord-1");
  });

  it("returns sender user notification", async () => {
    const repo = makeFakeRepo();
    const result = await proposeCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_proposed_sender",
    );
    expect(n?.userId).toBe("org-user-1");
  });
});

// ---------------------------------------------------------------------------
// R8 — acceptCrossOrgTransfer
// ---------------------------------------------------------------------------

describe("acceptCrossOrgTransfer", () => {
  const actor = {
    user: { id: "recv-user-1" },
    organization: {
      id: "org-receiver",
      publicToken: "receiver-tok",
      verified: true,
      displayName: "Receiver Org",
    },
  };
  const baseInput = {
    receiverOrgToken: "receiver-tok",
    casePublicCode: "CASE-001",
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when receiverOrgToken does not match", async () => {
    const repo = makeFakeRepo();
    const result = await acceptCrossOrgTransfer(
      { ...baseInput, receiverOrgToken: "wrong-tok" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/distinta a la receiver/i);
  });

  it("returns error when case not found", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(null),
      // acceptCrossOrgTransfer loads case by public code via a repo method
      findCaseByPublicCode: vi.fn().mockResolvedValue(null),
    });
    // We simulate case-not-found by having no case method return null
    // The use-case implementation will use a repo.findCaseByPublicCode call
    const repoWithNoCase = makeFakeRepo({
      findCaseByPublicCode: vi.fn().mockResolvedValue(null),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo: repoWithNoCase,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrado/i);
  });

  it("returns error when duplicate proposal events detected", async () => {
    const repo = makeFakeRepo({
      proposalEventsForCase: vi.fn().mockResolvedValue([makeProposalEvent(), makeProposalEvent()]),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/duplicadas/i);
  });

  it("returns error when canonical receiver does not match caller org", async () => {
    // Use null in both case col and payload to force canonical resolution to "different-org"
    // (payload-only fallback). This avoids triggering drift.
    const repo = makeFakeRepo({
      findCaseByPublicCode: vi.fn().mockResolvedValue(makeCase({ receiverOrganizationId: null })),
      proposalEventsForCase: vi.fn().mockResolvedValue([
        makeProposalEvent({
          payload: {
            from_organization_id: "org-sender",
            to_organization_id: "different-org",
            reason: "x",
          },
        }),
      ]),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/dirigida a tu organización/i);
  });

  it("returns error when drift detected between case and payload sender", async () => {
    const repo = makeFakeRepo({
      proposalEventsForCase: vi.fn().mockResolvedValue([
        makeProposalEvent({
          payload: {
            from_organization_id: "wrong-sender",
            to_organization_id: "org-receiver",
            reason: "x",
          },
        }),
      ]),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/inconsistencia/i);
  });

  it("succeeds: emits custody_transferred + flips ownerships inside tx", async () => {
    const repo = makeFakeRepo();
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "custody_transferred", authorRole: "shelter" }),
      fakeTx,
    );
    expect(repo.endShelterCustody).toHaveBeenCalledWith("pet-1", "org-sender", fakeTx);
    expect(repo.insertShelterCustody).toHaveBeenCalledWith(
      expect.objectContaining({ ownerOrganizationId: "org-receiver" }),
      fakeTx,
    );
  });

  it("closes handshake case inside tx", async () => {
    const repo = makeFakeRepo();
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-1", reason: "resolved" }),
      fakeTx,
    );
  });

  it("returns sender coordinator notifications", async () => {
    const repo = makeFakeRepo();
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_accepted_sender",
    );
    expect(n?.userId).toBe("coord-1");
  });
});

// ---------------------------------------------------------------------------
// R9 — rejectCrossOrgTransfer
// ---------------------------------------------------------------------------

describe("rejectCrossOrgTransfer", () => {
  const actor = {
    user: { id: "recv-user-1" },
    organization: {
      id: "org-receiver",
      publicToken: "receiver-tok",
      verified: true,
      displayName: "Receiver Org",
    },
  };
  const baseInput = {
    receiverOrgToken: "receiver-tok",
    casePublicCode: "CASE-001",
    reason: null as string | null,
    message: null as string | null,
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when receiverOrgToken does not match", async () => {
    const repo = makeFakeRepo();
    const result = await rejectCrossOrgTransfer(
      { ...baseInput, receiverOrgToken: "wrong-tok" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/distinta a la receiver/i);
  });

  it("returns error when case not found", async () => {
    const repo = makeFakeRepo({ findCaseByPublicCode: vi.fn().mockResolvedValue(null) });
    const result = await rejectCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when canonical receiver does not match caller", async () => {
    // Case has no receiverOrganizationId (legacy row) — payload fallback resolves to "other-org"
    // This produces the "not directed to your org" error, not drift.
    const repo = makeFakeRepo({
      findCaseByPublicCode: vi.fn().mockResolvedValue(makeCase({ receiverOrganizationId: null })),
      proposalEventsForCase: vi.fn().mockResolvedValue([
        makeProposalEvent({
          payload: {
            from_organization_id: "org-sender",
            to_organization_id: "other-org",
            reason: "x",
          },
        }),
      ]),
    });
    const result = await rejectCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/dirigida a tu organización/i);
  });

  it("emits note_added and closes case inside tx", async () => {
    const repo = makeFakeRepo();
    const result = await rejectCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "note_added" }),
      fakeTx,
    );
    expect(repo.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cancelled" }),
      fakeTx,
    );
  });

  it("returns sender coordinator notification", async () => {
    const repo = makeFakeRepo();
    const result = await rejectCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_rejected_sender",
    );
    expect(n?.userId).toBe("coord-1");
  });
});

// ---------------------------------------------------------------------------
// R10 — cancelCrossOrgTransfer
// ---------------------------------------------------------------------------

describe("cancelCrossOrgTransfer", () => {
  const actor = {
    user: { id: "sender-user-1" },
    organization: {
      id: "org-sender",
      publicToken: "sender-tok",
      verified: true,
      displayName: "Sender Org",
    },
  };
  const baseInput = {
    senderOrgToken: "sender-tok",
    casePublicCode: "CASE-001",
    reason: null as string | null,
    message: null as string | null,
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when senderOrgToken does not match", async () => {
    const repo = makeFakeRepo();
    const result = await cancelCrossOrgTransfer(
      { ...baseInput, senderOrgToken: "wrong-tok" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/distinta a la sender/i);
  });

  it("returns error when case not found", async () => {
    const repo = makeFakeRepo({ findCaseByPublicCode: vi.fn().mockResolvedValue(null) });
    const result = await cancelCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns error when case is not open", async () => {
    const repo = makeFakeRepo({
      findCaseByPublicCode: vi.fn().mockResolvedValue(makeCase({ status: "cancelled" })),
    });
    const result = await cancelCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/abierto/i);
  });

  it("returns error when caller org is not the opener", async () => {
    const repo = makeFakeRepo({
      findCaseByPublicCode: vi
        .fn()
        .mockResolvedValue(makeCase({ openedByOrganizationId: "other-org" })),
    });
    const result = await cancelCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/propuso/i);
  });

  it("emits note_added and closes case inside tx", async () => {
    const repo = makeFakeRepo();
    const result = await cancelCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "note_added" }),
      fakeTx,
    );
    expect(repo.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cancelled" }),
      fakeTx,
    );
  });

  it("returns receiver coordinator notification when receiverOrgId known", async () => {
    const repo = makeFakeRepo();
    const result = await cancelCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_cancelled_receiver",
    );
    expect(n?.userId).toBe("coord-1");
  });
});

// ---------------------------------------------------------------------------
// expireCrossOrgTransfers (cron)
// ---------------------------------------------------------------------------

describe("expireCrossOrgTransfers", () => {
  it("returns stats with zero when no expired cases", async () => {
    const repo = makeFakeRepo({ findExpirableCrossOrgCases: vi.fn().mockResolvedValue([]) });
    const result = await expireCrossOrgTransfers({ repo });
    expect(result).toMatchObject({ ok: true, value: { expired: 0 } });
  });

  it("calls expireOneCrossOrgCase for each candidate", async () => {
    const candidates = [
      {
        id: "c1",
        publicCode: "C1",
        primaryPetId: "p1",
        openedByOrganizationId: "o1",
        receiverOrganizationId: "o2",
      },
      {
        id: "c2",
        publicCode: "C2",
        primaryPetId: "p2",
        openedByOrganizationId: "o1",
        receiverOrganizationId: "o2",
      },
    ];
    const repo = makeFakeRepo({
      findExpirableCrossOrgCases: vi.fn().mockResolvedValue(candidates),
    });
    await expireCrossOrgTransfers({ repo });
    expect(repo.expireOneCrossOrgCase).toHaveBeenCalledTimes(2);
  });

  it("continues loop on per-case failure", async () => {
    const candidates = [
      {
        id: "c1",
        publicCode: "C1",
        primaryPetId: "p1",
        openedByOrganizationId: "o1",
        receiverOrganizationId: "o2",
      },
      {
        id: "c2",
        publicCode: "C2",
        primaryPetId: "p2",
        openedByOrganizationId: "o1",
        receiverOrganizationId: "o2",
      },
    ];
    const repo = makeFakeRepo({
      findExpirableCrossOrgCases: vi.fn().mockResolvedValue(candidates),
      expireOneCrossOrgCase: vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue(undefined),
    });
    const result = await expireCrossOrgTransfers({ repo });
    const r = result as { ok: true; value: { expired: number } };
    expect(r.value.expired).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// R11 — transferCustody
// ---------------------------------------------------------------------------

describe("transferCustody", () => {
  const actor = {
    user: { id: "src-user-1" },
    organization: {
      id: "org-source",
      publicToken: "src-tok",
      verified: true,
      displayName: "Source Org",
    },
  };
  const baseInput = {
    petPublicToken: "PT-tok",
    destinationOrgId: "dest-org",
    newRoleRaw: "shelter_custody",
    notes: null as string | null,
  };

  beforeEach(() => {
    fakeTransaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) => cb(fakeTx));
  });

  it("returns error when destinationOrgId is missing", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(
      { ...baseInput, destinationOrgId: "" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/destino/i);
  });

  it("returns error when dest equals source org", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(
      { ...baseInput, destinationOrgId: "org-source" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/misma/i);
  });

  it("returns error when pet not under caller org", async () => {
    const repo = makeFakeRepo({ findPetUnderOrg: vi.fn().mockResolvedValue(null) });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/custodia de tu organización/i);
  });

  it("returns error when source role is not transferable", async () => {
    const repo = makeFakeRepo({
      findPetUnderOrg: vi.fn().mockResolvedValue({
        pet: makePet(),
        ownershipId: "own-src",
        ownershipRole: "foster",
      }),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/rol/i);
  });

  it("returns error when destination org not found", async () => {
    const repo = makeFakeRepo({ findReceiverOrg: vi.fn().mockResolvedValue(null) });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/destino no encontrada/i);
  });

  it("returns error when destination org not verified", async () => {
    const repo = makeFakeRepo({
      findReceiverOrg: vi.fn().mockResolvedValue(makeOrg({ verified: false })),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/verificada/i);
  });

  it("silently coerces invalid newRole to shelter_custody", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(
      { ...baseInput, newRoleRaw: "invalid-role" },
      { repo, actor, transaction: fakeTransaction },
    );
    // Should still succeed — role coercion is silent
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertShelterCustody).toHaveBeenCalledWith(
      expect.objectContaining({ role: "shelter_custody" }),
      fakeTx,
    );
  });

  it("closes source ownership inside tx", async () => {
    const repo = makeFakeRepo();
    await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.closeOwnershipById).toHaveBeenCalledWith("own-src", expect.any(Date), fakeTx);
  });

  it("emits custody_transferred event inside tx", async () => {
    const repo = makeFakeRepo();
    await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "custody_transferred", authorRole: "shelter" }),
      fakeTx,
    );
  });

  it("closes foster and emits foster_ended BEFORE custody_transferred when foster exists", async () => {
    const fosterRow = { id: "foster-own", ownerUserId: "foster-user" };
    const repo = makeFakeRepo({ findActiveFosterRow: vi.fn().mockResolvedValue(fosterRow) });
    await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });

    const eventCalls = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls;
    const fosterEndedIdx = eventCalls.findIndex(
      (c: unknown[]) => (c[0] as { eventType: string }).eventType === "foster_ended",
    );
    const custodyTransferredIdx = eventCalls.findIndex(
      (c: unknown[]) => (c[0] as { eventType: string }).eventType === "custody_transferred",
    );
    expect(fosterEndedIdx).toBeLessThan(custodyTransferredIdx);
  });

  it("notifies destination admins only (not coordinators)", async () => {
    const repo = makeFakeRepo({
      orgAdminUserIds: vi.fn().mockResolvedValue([{ userId: "admin-dest" }]),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "custody_received");
    expect(n?.userId).toBe("admin-dest");
  });

  it("notifies foster user when foster exists", async () => {
    const fosterRow = { id: "foster-own", ownerUserId: "foster-user" };
    const repo = makeFakeRepo({ findActiveFosterRow: vi.fn().mockResolvedValue(fosterRow) });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "foster_ended_by_transfer");
    expect(n?.userId).toBe("foster-user");
  });
});
