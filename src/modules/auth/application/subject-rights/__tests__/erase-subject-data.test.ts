// Unit tests for eraseMySubjectDataAction (Wave D2, Ley 25.326 art. 16).
//
// Finding 27-#2: erasure must delete the auth.users row after the RPC redacts
// the app-side data — otherwise the email + password hash survive forever and
// the subject can log back in to an account whose PII is already gone.
//
// Pure mock-based: no DB, no Supabase instance. We assert the ordering (RPC
// first, then deleteUser) and the failure-tolerance contract (a deleteUser
// failure logs but still completes the erasure).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireUser = vi.fn();
vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: () => mockRequireUser(),
}));

const mockRpc = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { signOut: () => mockSignOut() },
  })),
}));

const mockDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { deleteUser: (...args: unknown[]) => mockDeleteUser(...args) } },
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { eraseMySubjectDataAction } from "../erase-subject-data";

const USER_ID = "user-erase-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ user: { id: USER_ID } });
  mockRpc.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockDeleteUser.mockResolvedValue({ error: null });
});

describe("eraseMySubjectDataAction", () => {
  it("rejects a too-short reason without calling the RPC", async () => {
    const result = await eraseMySubjectDataAction("no");
    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes the auth.users row after the RPC succeeds (finding 27-#2)", async () => {
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("erase_subject_data", {
      p_user_id: USER_ID,
      p_reason: "borro mi cuenta",
    });
    expect(mockDeleteUser).toHaveBeenCalledWith(USER_ID);

    // Ordering: RPC (app-side redaction) must run before the auth row is deleted.
    const rpcOrder = mockRpc.mock.invocationCallOrder[0];
    const deleteOrder = mockDeleteUser.mock.invocationCallOrder[0];
    expect(rpcOrder).toBeLessThan(deleteOrder);
    // Session dropped after both.
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("does not delete the auth row when the RPC fails", async () => {
    mockRpc.mockResolvedValue({ error: { message: "boom" } });
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(false);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("still completes when auth-row deletion fails (logs, does not block)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteUser.mockResolvedValue({ error: { message: "auth down" } });
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("still completes when the admin client throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDeleteUser.mockRejectedValue(new Error("network"));
    const result = await eraseMySubjectDataAction("borro mi cuenta");
    expect(result.ok).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
