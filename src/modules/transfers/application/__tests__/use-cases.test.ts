// Unit tests for all WU-3 transfers use-cases.
// TDD: RED → GREEN — tests written first, then implementations.
//
// Uses a fake TransfersRepository (vi.fn() stubs) — no DB, no Next.js.
// Each describe block covers one use-case; guards are tested per spec R1-R11.

import { randomUUID } from "node:crypto";
import { validateEventPayload } from "@/lib/events/event-schemas";
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
    findPetPublicTokenById: vi.fn().mockResolvedValue("PET-pub-tok"),
    orgPublicTokenById: vi.fn().mockResolvedValue("receiver-tok"),
    findActiveOwnerOwnership: vi
      .fn()
      .mockResolvedValue({ id: "own-1", ownerUserId: "user-sender" }),
    findPetStatusById: vi.fn().mockResolvedValue({ status: "found", inCustodyDispute: false }),
    findUserIdByEmail: vi.fn().mockResolvedValue(null),
    // owner-flow writes
    insertPetTransfer: vi.fn().mockResolvedValue(undefined),
    findTransferByToken: vi.fn().mockResolvedValue(makeTransfer()),
    findTransferByIdForUpdate: vi.fn().mockResolvedValue(makeTransfer()),
    updateTransferStatus: vi.fn().mockResolvedValue(1),
    expirablePetTransfers: vi.fn().mockResolvedValue([]),
    closeOwnerOwnerships: vi.fn().mockResolvedValue(undefined),
    insertOwnerOwnership: vi.fn().mockResolvedValue({ id: "own-new" }),
    insertPetEvent: vi.fn().mockResolvedValue({ id: "evt-new" }),
    // cross-org reads
    findActiveShelterCustody: vi.fn().mockResolvedValue({ id: "cust-1" }),
    findActiveOwnerOwnershipForOrg: vi.fn().mockResolvedValue({ id: "own-src" }),
    findReceiverOrg: vi.fn().mockResolvedValue(makeOrg()),
    findOpenHandshakeCase: vi.fn().mockResolvedValue(null),
    findOpenDispute: vi.fn().mockResolvedValue(null),
    openHandshakeCase: vi.fn().mockResolvedValue(makeCase()),
    proposalEventsForCase: vi.fn().mockResolvedValue([makeProposalEvent()]),
    endShelterCustody: vi.fn().mockResolvedValue(undefined),
    endOwnerOwnershipForOrg: vi.fn().mockResolvedValue(undefined),
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
    // cross-org concurrency guard (advisory lock + in-tx case status re-check)
    acquirePetAdvisoryLock: vi.fn().mockResolvedValue(undefined),
    caseStatusById: vi.fn().mockResolvedValue("open"),
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

  // -------------------------------------------------------------------------
  // Event-integrity regression (staging bug, PTR-8M3K-2K43): the emitted
  // custody_transferred payload MUST pass the REAL event schema. The other
  // tests here mock insertPetEvent, so they never exercised validation — which
  // is exactly why the malformed P2P payload reached staging.
  // -------------------------------------------------------------------------

  // UUID-shaped ids — the P2P schema requires from_user_id/to_user_id to be uuids.
  const SENDER_UUID = "11111111-1111-4111-8111-111111111111";
  const RECIPIENT_UUID = "22222222-2222-4222-8222-222222222222";
  const uuidActor = { user: { id: RECIPIENT_UUID } };

  it("emits a custody_transferred payload that passes the real event schema (P2P variant)", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: "gift" }),
        ),
      findTransferByIdForUpdate: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: "gift" }),
        ),
      // The sender is still the single active owner (TR-C1 custody guard).
      findActiveOwnerOwnership: vi
        .fn()
        .mockResolvedValue({ id: "own-1", ownerUserId: SENDER_UUID }),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor: uuidActor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });

    const eventArg = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      eventType: string;
      payload: Record<string, unknown>;
    };
    expect(eventArg.eventType).toBe("custody_transferred");
    expect(eventArg.payload).toMatchObject({
      from_user_id: SENDER_UUID,
      to_user_id: RECIPIENT_UUID,
      from_role: "owner",
      to_role: "owner",
      reason: "gift",
      transfer_token: "PTR-tok",
    });
    // The exact boundary that threw the raw zod error in staging.
    expect(() => validateEventPayload("custody_transferred", eventArg.payload)).not.toThrow();
  });

  it("coalesces a null transfer reason to 'other' and stays schema-valid", async () => {
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: null }),
        ),
      findTransferByIdForUpdate: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: null }),
        ),
      // The sender is still the single active owner (TR-C1 custody guard).
      findActiveOwnerOwnership: vi
        .fn()
        .mockResolvedValue({ id: "own-1", ownerUserId: SENDER_UUID }),
    });
    await acceptPetTransfer(baseInput, { repo, actor: uuidActor, transaction: fakeTransaction });
    const eventArg = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      payload: { reason: string };
    };
    expect(eventArg.payload.reason).toBe("other");
    expect(() => validateEventPayload("custody_transferred", eventArg.payload)).not.toThrow();
  });

  it("moves ownership to the acceptor: closes prior ownerships BEFORE opening the acceptor's", async () => {
    const repo = makeFakeRepo();
    await acceptPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    const closeOrder = (repo.closeOwnerOwnerships as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const insertOrder = (repo.insertOwnerOwnership as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(insertOrder);
    // The new active-owner row is the acceptor (projection reflects new owner).
    expect(repo.insertOwnerOwnership).toHaveBeenCalledWith(
      expect.objectContaining({ petId: "pet-1", ownerUserId: "user-recipient" }),
      fakeTx,
    );
  });

  it("surfaces a friendly message (not the raw zod error) when the event payload is invalid", async () => {
    // Force the real validation boundary to reject by making insertPetEvent run
    // the actual validator against a deliberately malformed payload.
    const repo = makeFakeRepo({
      findTransferByToken: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: "gift" }),
        ),
      findTransferByIdForUpdate: vi
        .fn()
        .mockResolvedValue(
          makeTransfer({ fromOwnerId: SENDER_UUID, toOwnerId: RECIPIENT_UUID, reason: "gift" }),
        ),
      insertPetEvent: vi.fn().mockImplementation(() => {
        validateEventPayload("custody_transferred", { bogus: true });
      }),
      // The sender is still the single active owner (TR-C1 custody guard) — the
      // failure under test is the event payload, not the custody re-check.
      findActiveOwnerOwnership: vi
        .fn()
        .mockResolvedValue({ id: "own-1", ownerUserId: SENDER_UUID }),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor: uuidActor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    const err = (result as { ok: false; error: string }).error;
    // Friendly Spanish message, and NONE of the raw zod leakage.
    expect(err).toMatch(/No pudimos completar la transferencia/i);
    expect(err).not.toMatch(/unrecognized_keys|Invalid payload|zod|from_role/i);
  });

  // -------------------------------------------------------------------------
  // Fix A — concurrency: in-tx lock + re-check, not the unique-index side effect
  // -------------------------------------------------------------------------

  it("locks the transfer row FOR UPDATE inside the tx before mutating ownerships", async () => {
    const repo = makeFakeRepo();
    await acceptPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    // The row lock runs with the tx client, before the ownership close/insert.
    expect(repo.findTransferByIdForUpdate).toHaveBeenCalledWith("tr-1", fakeTx);
    const lockOrder = (repo.findTransferByIdForUpdate as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const closeOrder = (repo.closeOwnerOwnerships as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(closeOrder);
  });

  it("flips status conditionally with expectedStatus=pending", async () => {
    const repo = makeFakeRepo();
    await acceptPetTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.updateTransferStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted", expectedStatus: "pending" }),
      fakeTx,
    );
  });

  it("aborts in-tx when the locked row is no longer pending (concurrent accept already won)", async () => {
    // The pre-tx read still says pending (stale), but the FOR UPDATE re-read
    // under the lock sees the row already accepted by a racing writer.
    const repo = makeFakeRepo({
      findTransferByToken: vi.fn().mockResolvedValue(makeTransfer({ status: "pending" })),
      findTransferByIdForUpdate: vi.fn().mockResolvedValue(makeTransfer({ status: "accepted" })),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/accepted|aceptada/i);
    // The guard fired BEFORE any ownership mutation — integrity is not held by
    // the unique-active-owner index side effect.
    expect(repo.closeOwnerOwnerships).not.toHaveBeenCalled();
    expect(repo.insertOwnerOwnership).not.toHaveBeenCalled();
    expect(repo.insertPetEvent).not.toHaveBeenCalled();
  });

  it("aborts when the conditional status flip updates zero rows (lost race under the lock)", async () => {
    // Lock re-read passes (still pending), but the conditional UPDATE matches
    // no row — another writer flipped it between the lock read and the update.
    const repo = makeFakeRepo({
      findTransferByIdForUpdate: vi.fn().mockResolvedValue(makeTransfer({ status: "pending" })),
      updateTransferStatus: vi.fn().mockResolvedValue(0),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/ya está/i);
  });

  // -------------------------------------------------------------------------
  // TR-C1 (CRITICAL): accept must RE-VALIDATE the PET under the lock, not just
  // the transfer row. closeOwnerOwnerships ends the CURRENT active owner, so a
  // stale transfer accepted after custody moved elsewhere is custody theft.
  // -------------------------------------------------------------------------

  it("rejects a stale A→B accept after a dispute moved custody A→C (C keeps the pet)", async () => {
    // transfer.fromOwnerId is "user-sender" (A). A govt dispute already moved
    // custody to C, so the current active owner is "user-C" ≠ A. Accepting the
    // stale A→B transfer must be REJECTED — and NO ownership row may be touched,
    // so C keeps custody.
    const repo = makeFakeRepo({
      findActiveOwnerOwnership: vi.fn().mockResolvedValue({ id: "own-C", ownerUserId: "user-C" }),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/titularidad cambió/i);
    // Custody untouched — C's ownership survives; no new owner minted.
    expect(repo.closeOwnerOwnerships).not.toHaveBeenCalled();
    expect(repo.insertOwnerOwnership).not.toHaveBeenCalled();
    expect(repo.insertPetEvent).not.toHaveBeenCalled();
  });

  it("rejects accept while the pet is in an open custody dispute", async () => {
    const repo = makeFakeRepo({
      findPetStatusById: vi.fn().mockResolvedValue({ status: "found", inCustodyDispute: true }),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/disputa/i);
    expect(repo.closeOwnerOwnerships).not.toHaveBeenCalled();
  });

  it("rejects accept of a pet that is now reported lost", async () => {
    const repo = makeFakeRepo({
      findPetStatusById: vi.fn().mockResolvedValue({ status: "lost", inCustodyDispute: false }),
    });
    const result = await acceptPetTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/perdida/i);
    expect(repo.closeOwnerOwnerships).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Concurrency: guarded expiry must NOT stomp a transfer another writer
  // already resolved between the scan and the UPDATE (expectedStatus=pending).
  // -------------------------------------------------------------------------

  it("passes expectedStatus=pending so the UPDATE is guarded against a concurrent flip", async () => {
    const rows = [{ id: "tr-1", petId: "pet-1", fromOwnerId: "user-sender", publicToken: "PTR-1" }];
    const repo = makeFakeRepo({ expirablePetTransfers: vi.fn().mockResolvedValue(rows) });
    await expirePetTransfers({ repo });
    expect(repo.updateTransferStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired", expectedStatus: "pending" }),
    );
  });

  it("does not expire (skips row, no notification) when the transfer was concurrently resolved (zero rows updated)", async () => {
    const rows = [
      { id: "tr-1", petId: "pet-1", fromOwnerId: "user-sender", publicToken: "PTR-1" },
      { id: "tr-2", petId: "pet-2", fromOwnerId: "user-sender2", publicToken: "PTR-2" },
    ];
    const repo = makeFakeRepo({
      expirablePetTransfers: vi.fn().mockResolvedValue(rows),
      // tr-1 was accepted/rejected/cancelled by a concurrent writer between the
      // scan and this UPDATE → guarded UPDATE matches zero rows. tr-2 still pending.
      updateTransferStatus: vi.fn().mockResolvedValueOnce(0).mockResolvedValue(1),
    });
    const result = await expirePetTransfers({ repo });
    const r = result as {
      ok: true;
      value: { expired: number };
      notifications: { relatedPetId: string }[];
    };
    // Only the still-pending row was expired.
    expect(r.value.expired).toBe(1);
    // No expiry notification for the stomped row.
    expect(r.notifications.find((n) => n.relatedPetId === "pet-1")).toBeUndefined();
    expect(r.notifications.find((n) => n.relatedPetId === "pet-2")).toBeDefined();
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

  // -------------------------------------------------------------------------
  // TR-H1: the source org must STILL HOLD custody under the lock. A concurrent
  // return-to-owner that ended the source's shelter_custody would otherwise
  // leave insertShelterCustody(receiver) landing anyway → phantom custodian.
  // -------------------------------------------------------------------------

  it("rejects when the source org no longer holds custody (concurrent release), writing no phantom row", async () => {
    const repo = makeFakeRepo({
      findActiveShelterCustody: vi.fn().mockResolvedValue(null),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/ya no tiene la custodia/i);
    // No custody mutation happened — no phantom shelter_custody for the receiver.
    expect(repo.insertShelterCustody).not.toHaveBeenCalled();
    expect(repo.endShelterCustody).not.toHaveBeenCalled();
    expect(repo.closeCase).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Role honoring: proposals carry from_role / to_role (direct-custody handoff).
  // -------------------------------------------------------------------------

  it("honors to_role=owner: opens receiver ownership as owner + records to_role", async () => {
    const repo = makeFakeRepo({
      proposalEventsForCase: vi.fn().mockResolvedValue([
        makeProposalEvent({
          payload: {
            from_organization_id: "org-sender",
            to_organization_id: "org-receiver",
            reason: "org_to_org_handoff",
            from_role: "shelter_custody",
            to_role: "owner",
          },
        }),
      ]),
    });
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertShelterCustody).toHaveBeenCalledWith(
      expect.objectContaining({ ownerOrganizationId: "org-receiver", role: "owner" }),
      fakeTx,
    );
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "custody_transferred",
        payload: expect.objectContaining({ to_role: "owner" }),
      }),
      fakeTx,
    );
  });

  it("honors from_role=owner: ends the source owner ownership (not shelter_custody)", async () => {
    const repo = makeFakeRepo({
      proposalEventsForCase: vi.fn().mockResolvedValue([
        makeProposalEvent({
          payload: {
            from_organization_id: "org-sender",
            to_organization_id: "org-receiver",
            reason: "org_to_org_handoff",
            from_role: "owner",
            to_role: "shelter_custody",
          },
        }),
      ]),
    });
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.endOwnerOwnershipForOrg).toHaveBeenCalledWith("pet-1", "org-sender", fakeTx);
    expect(repo.endShelterCustody).not.toHaveBeenCalled();
  });

  it("defaults to shelter_custody when the proposal omits roles (legacy/return-to-owner)", async () => {
    const repo = makeFakeRepo();
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.endShelterCustody).toHaveBeenCalledWith("pet-1", "org-sender", fakeTx);
    expect(repo.endOwnerOwnershipForOrg).not.toHaveBeenCalled();
    expect(repo.insertShelterCustody).toHaveBeenCalledWith(
      expect.objectContaining({ role: "shelter_custody" }),
      fakeTx,
    );
  });

  // -------------------------------------------------------------------------
  // Foster cascade fires at ACCEPT (not at propose) — the direct-custody handoff
  // used to close an active foster at flip time; that cascade now lands here.
  // -------------------------------------------------------------------------

  it("closes the active foster and emits foster_ended BEFORE custody_transferred", async () => {
    const repo = makeFakeRepo({
      findActiveFosterRow: vi
        .fn()
        .mockResolvedValue({ id: "foster-own", ownerUserId: "foster-user" }),
    });
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.closeFosterOwnership).toHaveBeenCalledWith("foster-own", expect.any(Date), fakeTx);
    const eventCalls = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls;
    const fosterEndedIdx = eventCalls.findIndex(
      (c: unknown[]) => (c[0] as { eventType: string }).eventType === "foster_ended",
    );
    const custodyTransferredIdx = eventCalls.findIndex(
      (c: unknown[]) => (c[0] as { eventType: string }).eventType === "custody_transferred",
    );
    expect(fosterEndedIdx).toBeGreaterThanOrEqual(0);
    expect(fosterEndedIdx).toBeLessThan(custodyTransferredIdx);
    // custody_transferred references the foster_ended event id.
    const transferredCall = eventCalls[custodyTransferredIdx][0] as {
      payload: { foster_ended_event_id: string | null };
    };
    expect(transferredCall.payload.foster_ended_event_id).toBeTruthy();
  });

  it("notifies the foster user when a foster was closed by the accepted handoff", async () => {
    const repo = makeFakeRepo({
      findActiveFosterRow: vi
        .fn()
        .mockResolvedValue({ id: "foster-own", ownerUserId: "foster-user" }),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find((n) => n.notificationType === "foster_ended_by_transfer");
    expect(n?.userId).toBe("foster-user");
  });

  it("does NOT run the foster cascade when there is no active foster", async () => {
    const repo = makeFakeRepo();
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.closeFosterOwnership).not.toHaveBeenCalled();
    const eventCalls = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      eventCalls.some(
        (c: unknown[]) => (c[0] as { eventType: string }).eventType === "foster_ended",
      ),
    ).toBe(false);
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

  // -------------------------------------------------------------------------
  // Concurrency: advisory lock + in-tx case-status re-check BEFORE the
  // destructive custody writes (the pre-tx status check is a stale read).
  // -------------------------------------------------------------------------

  it("acquires the pet advisory lock and re-checks case status before any destructive write", async () => {
    const repo = makeFakeRepo();
    await acceptCrossOrgTransfer(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.acquirePetAdvisoryLock).toHaveBeenCalledWith("pet-1", fakeTx);
    expect(repo.caseStatusById).toHaveBeenCalledWith("case-1", fakeTx);
    const lockOrder = (repo.acquirePetAdvisoryLock as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const statusOrder = (repo.caseStatusById as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const insertOrder = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    // lock → status re-check → destructive event insert.
    expect(lockOrder).toBeLessThan(statusOrder);
    expect(statusOrder).toBeLessThan(insertOrder);
  });

  it("aborts in-tx when the case was concurrently closed (no custody flip)", async () => {
    // Pre-tx read still says open (stale), but the in-tx re-check under the lock
    // sees the case already closed by a racing reject/cancel/expire.
    const repo = makeFakeRepo({
      findCaseByPublicCode: vi.fn().mockResolvedValue(makeCase({ status: "open" })),
      caseStatusById: vi.fn().mockResolvedValue("cancelled"),
    });
    const result = await acceptCrossOrgTransfer(baseInput, {
      repo,
      actor,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/abierto/i);
    // The guard fired BEFORE any destructive custody write.
    expect(repo.insertPetEvent).not.toHaveBeenCalled();
    expect(repo.endShelterCustody).not.toHaveBeenCalled();
    expect(repo.insertShelterCustody).not.toHaveBeenCalled();
    expect(repo.closeCase).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Consent handshake: transferCustody OPENS a proposal (custody_transfer_proposed)
  // and never flips ownership unilaterally. The flip happens at ACCEPT time.
  // -------------------------------------------------------------------------

  it("returns error when an open handshake already exists for the pet", async () => {
    const repo = makeFakeRepo({
      findOpenHandshakeCase: vi.fn().mockResolvedValue({ id: "hs-1" }),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/pendiente/i);
  });

  it("returns error when an open custody dispute exists for the pet", async () => {
    const repo = makeFakeRepo({
      findOpenDispute: vi.fn().mockResolvedValue({ id: "dispute-1" }),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/disputa/i);
  });

  it("opens the handshake case inside tx (does NOT flip ownership)", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: true });
    expect(repo.openHandshakeCase).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverOrganizationId: "org-receiver",
        openedByOrganizationId: "org-source",
      }),
      fakeTx,
    );
    // No unilateral flip: source is not closed, no receiver ownership opened,
    // no custody_transferred emitted.
    expect(repo.closeOwnershipById).not.toHaveBeenCalled();
    expect(repo.insertShelterCustody).not.toHaveBeenCalled();
    const eventCalls = (repo.insertPetEvent as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      eventCalls.some(
        (c: unknown[]) => (c[0] as { eventType: string }).eventType === "custody_transferred",
      ),
    ).toBe(false);
  });

  it("emits custody_transfer_proposed carrying from_role + to_role", async () => {
    const repo = makeFakeRepo();
    await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "custody_transfer_proposed",
        authorRole: "shelter",
        payload: expect.objectContaining({
          from_organization_id: "org-source",
          to_organization_id: "org-receiver",
          from_role: "shelter_custody",
          to_role: "shelter_custody",
        }),
      }),
      fakeTx,
    );
  });

  it("carries to_role=owner when the permanent-owner outcome is requested", async () => {
    const repo = makeFakeRepo();
    await transferCustody(
      { ...baseInput, newRoleRaw: "owner" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "custody_transfer_proposed",
        payload: expect.objectContaining({ to_role: "owner" }),
      }),
      fakeTx,
    );
  });

  it("carries from_role=owner when the source holds the pet as permanent owner", async () => {
    const repo = makeFakeRepo({
      findPetUnderOrg: vi.fn().mockResolvedValue({
        pet: makePet(),
        ownershipId: "own-src",
        ownershipRole: "owner",
      }),
    });
    await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "custody_transfer_proposed",
        payload: expect.objectContaining({ from_role: "owner" }),
      }),
      fakeTx,
    );
  });

  it("silently coerces invalid newRole to shelter_custody in the proposal", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(
      { ...baseInput, newRoleRaw: "invalid-role" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertPetEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "custody_transfer_proposed",
        payload: expect.objectContaining({ to_role: "shelter_custody" }),
      }),
      fakeTx,
    );
  });

  it("notifies receiver coordinators/admins of the incoming proposal", async () => {
    const repo = makeFakeRepo({
      orgCoordinatorAdminUserIds: vi.fn().mockResolvedValue([{ userId: "coord-dest" }]),
    });
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_proposed_receiver",
    );
    expect(n?.userId).toBe("coord-dest");
  });

  it("returns a sender confirmation notification", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const n = r.notifications.find(
      (n) => n.notificationType === "cross_org_transfer_proposed_sender",
    );
    expect(n?.userId).toBe("src-user-1");
  });

  it("returns the created handshake publicCode", async () => {
    const repo = makeFakeRepo();
    const result = await transferCustody(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; value: { publicCode: string } };
    expect(r.value.publicCode).toBe("CASE-001");
  });
});
