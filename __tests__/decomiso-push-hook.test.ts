// Wiring test: the decomiso notification flushes call the Web Push seam
// (lib/infra/web-push.ts sendPushForNotifications) after a successful insert.
//
// PO decision 2026-07-16: decomiso (and welfare) flushes join the 13 sites
// already hooked to the push seam. This pins ONE decomiso path
// (rejectDecomisoHandoffAction) — the other three flush blocks are the same
// 3-line pattern in the same file. Urgent-only filtering lives INSIDE the
// seam, so the flush passes every pending row through.
//
// Everything is mocked — no DB, no auth session.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSendPushForNotifications = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/infra/web-push", () => ({
  sendPushForNotifications: mockSendPushForNotifications,
}));

const PENDING_ROWS = [
  {
    userId: "govt-user-1",
    notificationType: "decomiso_handoff_rejected",
    severity: "urgent",
    title: "Handoff de decomiso rechazado",
    body: "La organización destinataria rechazó la custodia.",
    ctaUrl: "/gob/decomisos",
  },
];

const mockInsertValues = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ id: "org-1" }]),
        })),
      })),
    })),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    insert: vi.fn(() => ({ values: mockInsertValues })),
  },
  notifications: {},
  organizations: { publicToken: "publicToken" },
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireDecomisoPrincipal: vi.fn(),
}));

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  requireCapability: vi.fn(async () => ({
    error: null,
    user: { id: "org-user-1" },
    organization: { id: "org-1", publicToken: "ORG-TOKEN-1", displayName: "Refugio Test" },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/src/modules/decomiso/application/resolve-govt-org", () => ({
  resolveGovtOrgForUser: vi.fn(),
}));

vi.mock("@/src/modules/decomiso/application/execute-decomiso", () => ({
  executeDecomiso: vi.fn(),
  validateExecuteDecomiso: vi.fn(),
}));

vi.mock("@/src/modules/decomiso/application/accept-decomiso-handoff", () => ({
  acceptDecomisoHandoffInTx: vi.fn(),
  validateAcceptDecomisoHandoff: vi.fn(),
}));

vi.mock("@/src/modules/decomiso/application/reassign-decomiso", () => ({
  reassignDecomisoInTx: vi.fn(),
  validateReassignDecomiso: vi.fn(),
}));

const mockValidateReject = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    caseRow: { id: "case-1", publicCode: "DEC-0001" },
    govtOrgId: "govt-org-1",
    reasonNote: null,
  })),
);
const mockRejectInTx = vi.hoisted(() =>
  vi.fn(async () => ({ pendingNotifications: PENDING_ROWS })),
);
vi.mock("@/src/modules/decomiso/application/reject-decomiso-handoff", () => ({
  rejectDecomisoHandoffInTx: mockRejectInTx,
  validateRejectDecomisoHandoff: mockValidateReject,
}));

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("rejectDecomisoHandoffAction — web-push hook", () => {
  beforeEach(() => {
    mockSendPushForNotifications.mockClear();
    mockInsertValues.mockClear().mockResolvedValue(undefined);
  });

  it("calls sendPushForNotifications with the flushed rows after a successful insert", async () => {
    const { rejectDecomisoHandoffAction } = await import("@/app/actions/decomiso");

    const result = await rejectDecomisoHandoffAction({
      receiverOrgToken: "ORG-TOKEN-1",
      casePublicCode: "DEC-0001",
    });

    expect(result).toEqual({ ok: true, publicCode: "DEC-0001" });
    expect(mockInsertValues).toHaveBeenCalledWith(PENDING_ROWS);
    expect(mockSendPushForNotifications).toHaveBeenCalledOnce();
    expect(mockSendPushForNotifications).toHaveBeenCalledWith(PENDING_ROWS);
  });

  it("does not call the push seam when the notifications insert fails (best-effort chain)", async () => {
    mockInsertValues.mockRejectedValueOnce(new Error("insert down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rejectDecomisoHandoffAction } = await import("@/app/actions/decomiso");
    const result = await rejectDecomisoHandoffAction({
      receiverOrgToken: "ORG-TOKEN-1",
      casePublicCode: "DEC-0001",
    });

    // Action still succeeds — the flush is best-effort.
    expect(result).toEqual({ ok: true, publicCode: "DEC-0001" });
    expect(mockSendPushForNotifications).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
