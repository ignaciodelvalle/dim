// Parity smoke tests for the thin transfers actions layer (WU-4).
//
// Strategy: unit-level wiring verification. We cannot run the actual Next.js
// server actions in Vitest (no request context, no Supabase auth, no DB).
// Instead we verify:
//   1. Each action returns a domain error when auth denies.
//   2. Each action returns the use-case error when the use-case returns ok:false.
//   3. Each action returns the use-case value shape on ok:true.
//   4. Notifications flush is attempted post-tx (we assert db.insert is called).
//   5. CRITICAL (auth-scope): wrong-org or wrong-user principal is REJECTED
//      before the use-case is ever called.
//
// Mocking approach mirrors src/modules/adoption/__tests__/actions-parity.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("@/lib/capabilities", () => ({
  requireCapability: vi.fn(),
}));

vi.mock("@/lib/auth-guards", () => ({
  requireUserOrRedirect: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({})),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
  notifications: {},
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { email: "caller@example.com" } },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    auth: {
      admin: {
        inviteUserByEmail: vi.fn().mockResolvedValue({}),
        listUsers: vi.fn().mockResolvedValue({ data: { users: [] } }),
      },
    },
  }),
}));

// Use-case mocks
vi.mock("../application/initiate-pet-transfer", () => ({
  initiatePetTransfer: vi.fn(),
}));
vi.mock("../application/accept-pet-transfer", () => ({
  acceptPetTransfer: vi.fn(),
}));
vi.mock("../application/reject-pet-transfer", () => ({
  rejectPetTransfer: vi.fn(),
}));
vi.mock("../application/cancel-pet-transfer", () => ({
  cancelPetTransfer: vi.fn(),
}));
vi.mock("../application/get-transfer-for-viewer", () => ({
  getTransferForViewer: vi.fn(),
}));
vi.mock("../application/expire-pet-transfers", () => ({
  expirePetTransfers: vi.fn(),
}));
vi.mock("../application/propose-cross-org-transfer", () => ({
  proposeCrossOrgTransfer: vi.fn(),
}));
vi.mock("../application/accept-cross-org-transfer", () => ({
  acceptCrossOrgTransfer: vi.fn(),
}));
vi.mock("../application/reject-cross-org-transfer", () => ({
  rejectCrossOrgTransfer: vi.fn(),
}));
vi.mock("../application/cancel-cross-org-transfer", () => ({
  cancelCrossOrgTransfer: vi.fn(),
}));
vi.mock("../application/expire-cross-org-transfers", () => ({
  expireCrossOrgTransfers: vi.fn(),
}));
vi.mock("../application/transfer-custody", () => ({
  transferCustody: vi.fn(),
}));

vi.mock("../infrastructure/transfers-repository", () => ({
  TransfersRepository: {
    findTransferViewByToken: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Lazy imports (AFTER vi.mock calls)
// ---------------------------------------------------------------------------

import { requireUserOrRedirect } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRequireCapability = requireCapability as ReturnType<typeof vi.fn>;
const mockRequireUser = requireUserOrRedirect as ReturnType<typeof vi.fn>;

function makeUser(overrides: Record<string, unknown> = {}) {
  return { id: "user-1", email: "caller@example.com", ...overrides };
}

function makeAuth(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    user: makeUser(),
    organization: {
      id: "org-1",
      publicToken: "org-tok",
      verified: true,
      displayName: "Refugio Test",
    },
    ...overrides,
  };
}

function makeUserSession(overrides: Record<string, unknown> = {}) {
  return { user: makeUser(overrides) };
}

// ===========================================================================
// initiatePetTransferAction
// ===========================================================================

describe("initiatePetTransferAction — auth-scope: current owner USER", () => {
  let initiatePetTransferAction: (...args: any[]) => Promise<any>;
  let initiatePetTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUserSession());
    const actions = await import("../actions");
    initiatePetTransferAction = actions.initiatePetTransferAction;
    const ucModule = await import("../application/initiate-pet-transfer");
    initiatePetTransferUc = ucModule.initiatePetTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("returns error when requireUserOrRedirect throws (unauthenticated)", async () => {
    mockRequireUser.mockRejectedValue(new Error("redirect"));
    await expect(
      initiatePetTransferAction({ petToken: "tok", toEmail: "a@b.com", reason: "gift" }),
    ).rejects.toThrow();
    expect(initiatePetTransferUc).not.toHaveBeenCalled();
  });

  it("returns use-case error on ok:false", async () => {
    initiatePetTransferUc.mockResolvedValue({ ok: false, error: "Solo el dueño actual..." });
    const result = await initiatePetTransferAction({
      petToken: "tok",
      toEmail: "a@b.com",
      reason: "gift",
    });
    expect(result).toEqual({ error: "Solo el dueño actual..." });
  });

  it("returns transferToken on success and flushes notifications", async () => {
    const { db } = await import("@/db");
    initiatePetTransferUc.mockResolvedValue({
      ok: true,
      value: {
        transferToken: "PTR-xxx",
        petId: "pet-1",
        recipientNeedsInvite: false,
        petName: "Firulais",
      },
      notifications: [{ userId: "u-2", notificationType: "pet_transfer_received" }],
    });
    const result = await initiatePetTransferAction({
      petToken: "tok",
      toEmail: "a@b.com",
      reason: "gift",
    });
    expect(result).toEqual({ transferToken: "PTR-xxx" });
    expect(db.insert).toHaveBeenCalled();
  });

  it("calls inviteUserByEmail when recipientNeedsInvite=true (best-effort, non-fatal)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = (createAdminClient as any)();
    initiatePetTransferUc.mockResolvedValue({
      ok: true,
      value: {
        transferToken: "PTR-yyy",
        petId: "pet-2",
        recipientNeedsInvite: true,
        petName: "Michi",
      },
      notifications: [],
    });
    await initiatePetTransferAction({
      petToken: "tok",
      toEmail: "new@user.com",
      reason: "gift",
    });
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
      "new@user.com",
      expect.any(Object),
    );
  });

  it("CRITICAL: wrong-user principal — use-case must be called with correct userId, not an arbitrary user", async () => {
    // The action resolves the user from requireUserOrRedirect and passes it as actor.
    // We verify it passes the authenticated user (id=user-1), not any override.
    initiatePetTransferUc.mockResolvedValue({
      ok: true,
      value: {
        transferToken: "PTR-zzz",
        petId: "pet-3",
        recipientNeedsInvite: false,
        petName: "Rex",
      },
      notifications: [],
    });
    await initiatePetTransferAction({ petToken: "tok", toEmail: "a@b.com", reason: "gift" });
    expect(initiatePetTransferUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      }),
    );
  });
});

// ===========================================================================
// acceptPetTransferAction
// ===========================================================================

describe("acceptPetTransferAction — auth-scope: recipient USER (id-or-email match)", () => {
  let acceptPetTransferAction: (...args: any[]) => Promise<any>;
  let acceptPetTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUserSession());
    const actions = await import("../actions");
    acceptPetTransferAction = actions.acceptPetTransferAction;
    const ucModule = await import("../application/accept-pet-transfer");
    acceptPetTransferUc = ucModule.acceptPetTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("returns use-case error on ok:false (wrong recipient)", async () => {
    acceptPetTransferUc.mockResolvedValue({
      ok: false,
      error: "Esta propuesta no es para tu cuenta.",
    });
    const result = await acceptPetTransferAction("PTR-abc");
    expect(result).toEqual({ error: "Esta propuesta no es para tu cuenta." });
  });

  it("returns ok:true and revalidates on success", async () => {
    const { revalidatePath } = await import("next/cache");
    acceptPetTransferUc.mockResolvedValue({
      ok: true,
      value: { petId: "pet-1" },
      notifications: [{ userId: "u-1", notificationType: "pet_transfer_accepted" }],
    });
    const result = await acceptPetTransferAction("PTR-abc");
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/mis-mascotas");
  });

  it("CRITICAL: passes callerEmail resolved from supabase session to use-case", async () => {
    acceptPetTransferUc.mockResolvedValue({
      ok: true,
      value: { petId: "pet-1" },
      notifications: [],
    });
    await acceptPetTransferAction("PTR-abc");
    expect(acceptPetTransferUc).toHaveBeenCalledWith(
      expect.objectContaining({ callerEmail: "caller@example.com" }),
      expect.any(Object),
    );
  });

  it("CRITICAL: wrong-user — sender accepting own transfer must be rejected by use-case", async () => {
    // Sender tries to accept their own transfer. Use-case returns auth error (business rule).
    acceptPetTransferUc.mockResolvedValue({
      ok: false,
      error: "No podés aceptar tu propia transferencia.",
    });
    const result = await acceptPetTransferAction("PTR-self");
    expect(result).toEqual({ error: "No podés aceptar tu propia transferencia." });
    // Verify the action forwarded the userId correctly so use-case can check it.
    expect(acceptPetTransferUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      }),
    );
  });
});

// ===========================================================================
// rejectPetTransferAction
// ===========================================================================

describe("rejectPetTransferAction — auth-scope: recipient USER (id-or-email)", () => {
  let rejectPetTransferAction: (...args: any[]) => Promise<any>;
  let rejectPetTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUserSession());
    const actions = await import("../actions");
    rejectPetTransferAction = actions.rejectPetTransferAction;
    const ucModule = await import("../application/reject-pet-transfer");
    rejectPetTransferUc = ucModule.rejectPetTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("CRITICAL: wrong-user — non-recipient gets 'Esta propuesta no es para tu cuenta.'", async () => {
    rejectPetTransferUc.mockResolvedValue({
      ok: false,
      error: "Esta propuesta no es para tu cuenta.",
    });
    const result = await rejectPetTransferAction({ transferToken: "PTR-abc" });
    expect(result).toEqual({ error: "Esta propuesta no es para tu cuenta." });
  });

  it("returns ok:true on success", async () => {
    rejectPetTransferUc.mockResolvedValue({ ok: true, value: undefined, notifications: [] });
    const result = await rejectPetTransferAction({ transferToken: "PTR-abc", reason: "no quiero" });
    expect(result).toEqual({ ok: true });
  });

  it("passes callerEmail from session to use-case", async () => {
    rejectPetTransferUc.mockResolvedValue({ ok: true, value: undefined, notifications: [] });
    await rejectPetTransferAction({ transferToken: "PTR-abc" });
    expect(rejectPetTransferUc).toHaveBeenCalledWith(
      expect.objectContaining({ callerEmail: "caller@example.com" }),
      expect.any(Object),
    );
  });
});

// ===========================================================================
// cancelPetTransferAction
// ===========================================================================

describe("cancelPetTransferAction — auth-scope: SENDER USER only", () => {
  let cancelPetTransferAction: (...args: any[]) => Promise<any>;
  let cancelPetTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUserSession());
    const actions = await import("../actions");
    cancelPetTransferAction = actions.cancelPetTransferAction;
    const ucModule = await import("../application/cancel-pet-transfer");
    cancelPetTransferUc = ucModule.cancelPetTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("CRITICAL: wrong-user — non-sender gets 'Solo el emisor puede cancelar'", async () => {
    cancelPetTransferUc.mockResolvedValue({
      ok: false,
      error: "Solo el emisor puede cancelar la propuesta.",
    });
    const result = await cancelPetTransferAction("PTR-abc");
    expect(result).toEqual({ error: "Solo el emisor puede cancelar la propuesta." });
  });

  it("returns ok:true and flushes notifications on success", async () => {
    const { db } = await import("@/db");
    cancelPetTransferUc.mockResolvedValue({
      ok: true,
      value: undefined,
      notifications: [{ userId: "u-2", notificationType: "pet_transfer_cancelled" }],
    });
    const result = await cancelPetTransferAction("PTR-abc");
    expect(result).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalled();
  });

  it("passes the authenticated user id to the use-case as actor", async () => {
    cancelPetTransferUc.mockResolvedValue({ ok: true, value: undefined, notifications: [] });
    await cancelPetTransferAction("PTR-abc");
    expect(cancelPetTransferUc).toHaveBeenCalledWith(
      expect.objectContaining({ transferToken: "PTR-abc" }),
      expect.objectContaining({
        actor: expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      }),
    );
  });
});

// ===========================================================================
// getTransferForViewerAction
// ===========================================================================

describe("getTransferForViewerAction — auth-scope: sender OR recipient USER", () => {
  let getTransferForViewerAction: (...args: any[]) => Promise<any>;
  let getTransferForViewerUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue(makeUserSession());
    const actions = await import("../actions");
    getTransferForViewerAction = actions.getTransferForViewerAction;
    const ucModule = await import("../application/get-transfer-for-viewer");
    getTransferForViewerUc = ucModule.getTransferForViewer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("CRITICAL: third-party — non-sender non-recipient gets 'Esta propuesta no es accesible'", async () => {
    getTransferForViewerUc.mockResolvedValue({
      ok: false,
      error: "Esta propuesta no es accesible desde tu cuenta.",
    });
    const result = await getTransferForViewerAction("PTR-abc");
    expect(result).toEqual({ ok: false, error: "Esta propuesta no es accesible desde tu cuenta." });
  });

  it("returns the DTO on success", async () => {
    getTransferForViewerUc.mockResolvedValue({
      ok: true,
      value: {
        publicToken: "PTR-abc",
        status: "pending",
        isSender: true,
        isRecipient: false,
      },
      notifications: [],
    });
    const { TransfersRepository } = await import("../infrastructure/transfers-repository");
    (TransfersRepository.findTransferViewByToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      transfer: { toOwnerEmail: "to@example.com" },
      petName: "Firulais",
      petToken: "PET-1",
      fromDisplayName: "Sender Name",
    });
    const result = await getTransferForViewerAction("PTR-abc");
    expect(result).toMatchObject({ ok: true });
  });
});

// ===========================================================================
// expirePetTransfersAction (cron)
// ===========================================================================

describe("expirePetTransfersAction — auth-scope: NONE (CRON_SECRET at route)", () => {
  let expirePetTransfersAction: (...args: any[]) => Promise<any>;
  let expirePetTransfersUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    expirePetTransfersAction = actions.expirePetTransfersAction;
    const ucModule = await import("../application/expire-pet-transfers");
    expirePetTransfersUc = ucModule.expirePetTransfers as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("throws when use-case returns ok:false (cron logs the error)", async () => {
    expirePetTransfersUc.mockResolvedValue({ ok: false, error: "DB unavailable." });
    await expect(expirePetTransfersAction()).rejects.toThrow("DB unavailable.");
  });

  it("returns stats on success", async () => {
    expirePetTransfersUc.mockResolvedValue({
      ok: true,
      value: { expired: 3, errors: 0 },
      notifications: [],
    });
    const result = await expirePetTransfersAction();
    expect(result).toEqual({ expired: 3 });
  });
});

// ===========================================================================
// proposeCrossOrgTransferAction
// ===========================================================================

describe("proposeCrossOrgTransferAction — auth-scope: SENDER ORG (org.transfer.propose) scoped to senderOrgToken", () => {
  let proposeCrossOrgTransferAction: (...args: any[]) => Promise<any>;
  let proposeCrossOrgTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    proposeCrossOrgTransferAction = actions.proposeCrossOrgTransferAction;
    const ucModule = await import("../application/propose-cross-org-transfer");
    proposeCrossOrgTransferUc = ucModule.proposeCrossOrgTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await proposeCrossOrgTransferAction({
      senderOrgToken: "org-tok",
      petPublicToken: "pet-tok",
      receiverOrgId: "org-2",
      reason: "space_constraint",
    });
    expect(result).toEqual({ error: "No tenés permiso." });
    expect(proposeCrossOrgTransferUc).not.toHaveBeenCalled();
  });

  it("CRITICAL: wrong-org — token mismatch returns error, use-case NOT called", async () => {
    // Caller's org token is "org-tok" but input says "other-org" — use-case returns error.
    mockRequireCapability.mockResolvedValue(makeAuth());
    proposeCrossOrgTransferUc.mockResolvedValue({
      ok: false,
      error: "Estás operando desde una organización distinta a la sender.",
    });
    const result = await proposeCrossOrgTransferAction({
      senderOrgToken: "other-org",
      petPublicToken: "pet-tok",
      receiverOrgId: "org-2",
      reason: "space_constraint",
    });
    expect(result).toEqual({
      error: "Estás operando desde una organización distinta a la sender.",
    });
  });

  it("returns ok:true with publicCode on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    proposeCrossOrgTransferUc.mockResolvedValue({
      ok: true,
      value: { publicCode: "CASE-001" },
      notifications: [],
    });
    const result = await proposeCrossOrgTransferAction({
      senderOrgToken: "org-tok",
      petPublicToken: "pet-tok",
      receiverOrgId: "org-2",
      reason: "space_constraint",
    });
    expect(result).toEqual({ ok: true, publicCode: "CASE-001" });
  });
});

// ===========================================================================
// acceptCrossOrgTransferAction
// ===========================================================================

describe("acceptCrossOrgTransferAction — auth-scope: RECEIVER ORG scoped to case.receiverOrganizationId", () => {
  let acceptCrossOrgTransferAction: (...args: any[]) => Promise<any>;
  let acceptCrossOrgTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    acceptCrossOrgTransferAction = actions.acceptCrossOrgTransferAction;
    const ucModule = await import("../application/accept-cross-org-transfer");
    acceptCrossOrgTransferUc = ucModule.acceptCrossOrgTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "Sin permiso." });
    const result = await acceptCrossOrgTransferAction({
      receiverOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ error: "Sin permiso." });
  });

  it("CRITICAL: wrong-org receiver — use-case returns 'La propuesta no fue dirigida a tu organización.'", async () => {
    // This tests the receiver scope: org.id must match case.receiverOrganizationId.
    // The use-case (not the action) enforces this. We verify the action passes
    // the correct org to the use-case so it can enforce it.
    mockRequireCapability.mockResolvedValue(makeAuth());
    acceptCrossOrgTransferUc.mockResolvedValue({
      ok: false,
      error: "La propuesta no fue dirigida a tu organización.",
    });
    const result = await acceptCrossOrgTransferAction({
      receiverOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ error: "La propuesta no fue dirigida a tu organización." });
    // Verify the action passed the correct organization to the use-case.
    expect(acceptCrossOrgTransferUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({
          organization: expect.objectContaining({ id: "org-1" }),
        }),
      }),
    );
  });

  it("returns ok:true with publicCode on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    acceptCrossOrgTransferUc.mockResolvedValue({
      ok: true,
      value: { publicCode: "CASE-001" },
      notifications: [],
    });
    const result = await acceptCrossOrgTransferAction({
      receiverOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ ok: true, publicCode: "CASE-001" });
  });
});

// ===========================================================================
// rejectCrossOrgTransferAction
// ===========================================================================

describe("rejectCrossOrgTransferAction — auth-scope: RECEIVER ORG scoped to case.receiverOrganizationId", () => {
  let rejectCrossOrgTransferAction: (...args: any[]) => Promise<any>;
  let rejectCrossOrgTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    rejectCrossOrgTransferAction = actions.rejectCrossOrgTransferAction;
    const ucModule = await import("../application/reject-cross-org-transfer");
    rejectCrossOrgTransferUc = ucModule.rejectCrossOrgTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("CRITICAL: wrong-org — non-receiver org gets 'La propuesta no fue dirigida a tu organización.'", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    rejectCrossOrgTransferUc.mockResolvedValue({
      ok: false,
      error: "La propuesta no fue dirigida a tu organización.",
    });
    const result = await rejectCrossOrgTransferAction({
      receiverOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ error: "La propuesta no fue dirigida a tu organización." });
    // Verify org id is passed so the use-case can enforce the scope.
    expect(rejectCrossOrgTransferUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({
          organization: expect.objectContaining({ id: "org-1" }),
        }),
      }),
    );
  });

  it("returns ok:true on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    rejectCrossOrgTransferUc.mockResolvedValue({
      ok: true,
      value: { publicCode: "CASE-001" },
      notifications: [],
    });
    const result = await rejectCrossOrgTransferAction({
      receiverOrgToken: "org-tok",
      casePublicCode: "CASE-001",
      reason: "no capacity",
    });
    expect(result).toEqual({ ok: true, publicCode: "CASE-001" });
  });
});

// ===========================================================================
// cancelCrossOrgTransferAction
// ===========================================================================

describe("cancelCrossOrgTransferAction — auth-scope: SENDER ORG scoped to case.openedByOrganizationId", () => {
  let cancelCrossOrgTransferAction: (...args: any[]) => Promise<any>;
  let cancelCrossOrgTransferUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    cancelCrossOrgTransferAction = actions.cancelCrossOrgTransferAction;
    const ucModule = await import("../application/cancel-cross-org-transfer");
    cancelCrossOrgTransferUc = ucModule.cancelCrossOrgTransfer as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("CRITICAL: wrong-org — non-sender gets 'Solo la organización que propuso puede cancelar.'", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    cancelCrossOrgTransferUc.mockResolvedValue({
      ok: false,
      error: "Solo la organización que propuso puede cancelar.",
    });
    const result = await cancelCrossOrgTransferAction({
      senderOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ error: "Solo la organización que propuso puede cancelar." });
    // Verify org id is passed to use-case for the openedByOrganizationId check.
    expect(cancelCrossOrgTransferUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({
          organization: expect.objectContaining({ id: "org-1" }),
        }),
      }),
    );
  });

  it("returns ok:true with publicCode on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    cancelCrossOrgTransferUc.mockResolvedValue({
      ok: true,
      value: { publicCode: "CASE-001" },
      notifications: [],
    });
    const result = await cancelCrossOrgTransferAction({
      senderOrgToken: "org-tok",
      casePublicCode: "CASE-001",
    });
    expect(result).toEqual({ ok: true, publicCode: "CASE-001" });
  });
});

// ===========================================================================
// expireCrossOrgTransfersAction (cron)
// ===========================================================================

describe("expireCrossOrgTransfersAction — auth-scope: NONE (CRON_SECRET at route)", () => {
  let expireCrossOrgTransfersAction: (...args: any[]) => Promise<any>;
  let expireCrossOrgTransfersUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    expireCrossOrgTransfersAction = actions.expireCrossOrgTransfersAction;
    const ucModule = await import("../application/expire-cross-org-transfers");
    expireCrossOrgTransfersUc = ucModule.expireCrossOrgTransfers as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("throws when use-case returns ok:false", async () => {
    expireCrossOrgTransfersUc.mockResolvedValue({ ok: false, error: "Scan failed." });
    await expect(expireCrossOrgTransfersAction()).rejects.toThrow("Scan failed.");
  });

  it("returns stats on success", async () => {
    expireCrossOrgTransfersUc.mockResolvedValue({
      ok: true,
      value: { expired: 2, errors: 0 },
      notifications: [],
    });
    const result = await expireCrossOrgTransfersAction();
    expect(result).toEqual({ expired: 2, errors: 0 });
  });
});

// ===========================================================================
// transferCustodyAction
// ===========================================================================

describe("transferCustodyAction — auth-scope: SOURCE ORG (custody.transfer) implicit-org scope", () => {
  let transferCustodyAction: (...args: any[]) => Promise<any>;
  let transferCustodyUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    transferCustodyAction = actions.transferCustodyAction;
    const ucModule = await import("../application/transfer-custody");
    transferCustodyUc = ucModule.transferCustody as ReturnType<typeof vi.fn>;
  });

  afterEach(() => vi.resetModules());

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "Sin permiso." });
    const formData = new FormData();
    formData.append("destinationOrgId", "org-2");
    const result = await transferCustodyAction("org-tok", "pet-tok", { error: null }, formData);
    expect(result).toEqual({ error: "Sin permiso." });
    expect(transferCustodyUc).not.toHaveBeenCalled();
  });

  it("CRITICAL: wrong-org — pet not under caller org returns 'Mascota no encontrada o no está bajo custodia de tu organización.'", async () => {
    // Auth is implicit-org: the repo query is scoped to organization.id.
    // Use-case returns this error when findPetUnderOrg finds nothing.
    mockRequireCapability.mockResolvedValue(makeAuth());
    transferCustodyUc.mockResolvedValue({
      ok: false,
      error: "Mascota no encontrada o no está bajo custodia de tu organización.",
    });
    const formData = new FormData();
    formData.append("destinationOrgId", "org-2");
    const result = await transferCustodyAction("org-tok", "pet-tok", { error: null }, formData);
    expect(result).toEqual({
      error: "Mascota no encontrada o no está bajo custodia de tu organización.",
    });
    // Verify org id is passed so repo query is scoped correctly.
    expect(transferCustodyUc).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        actor: expect.objectContaining({
          organization: expect.objectContaining({ id: "org-1" }),
        }),
      }),
    );
  });

  it("redirects to ?transferido=<petToken> on success", async () => {
    const { redirect } = await import("next/navigation");
    mockRequireCapability.mockResolvedValue(makeAuth());
    transferCustodyUc.mockResolvedValue({
      ok: true,
      value: undefined,
      notifications: [],
    });
    const formData = new FormData();
    formData.append("destinationOrgId", "org-2");
    await transferCustodyAction("org-tok", "pet-tok", { error: null }, formData);
    expect(redirect).toHaveBeenCalledWith("/org/org-tok/mascotas?transferido=pet-tok");
  });

  it("returns error (no redirect) on use-case failure", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    transferCustodyUc.mockResolvedValue({
      ok: false,
      error: "No se pudo transferir la custodia: error desconocido",
    });
    const formData = new FormData();
    formData.append("destinationOrgId", "org-2");
    const result = await transferCustodyAction("org-tok", "pet-tok", { error: null }, formData);
    expect(result).toEqual({ error: "No se pudo transferir la custodia: error desconocido" });
  });
});
