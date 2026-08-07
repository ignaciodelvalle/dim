// Unit tests for requestPasswordResetAction and updatePasswordAction.
//
// Strategy: mock `@/lib/supabase/server` to avoid real Supabase calls.
// The same pattern is used in auth-actions.test.ts and signup-validation.test.ts.
//
// Covers:
//   requestPasswordResetAction:
//     - missing email → validation error
//     - valid email → generic message (regardless of whether account exists)
//     - Supabase error still returns the same generic message (no leakage)
//   updatePasswordAction:
//     - no session (getUser returns null) → rejects with expiry message
//     - session present + short password → validation error
//     - session present + mismatched passwords → validation error
//     - session present + valid passwords → calls updateUser and returns ok

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// requestPasswordResetAction now reads request headers (callerIp) for its
// per-IP + per-email rate-limit budgets. Provide a trusted edge IP.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "10.0.0.1" : null),
  })),
}));

// Rate limiter: allow by default, overridable per test. Keep the REAL
// RateLimitError / callerIp / emailRateLimitKey so the action's branch logic
// and key derivation stay honest.
const { mockEnforceRateLimit } = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  };
});

import { requestPasswordResetAction, updatePasswordAction } from "@/app/actions/password-reset";
import { RateLimitError } from "@/lib/infra/rate-limit";
import { createClient } from "@/lib/supabase/server";

beforeEach(() => {
  mockEnforceRateLimit.mockReset();
  mockEnforceRateLimit.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// Build a mock Supabase client shaped for requestPasswordResetAction.
function mockResetClient({ error = null }: { error?: unknown } = {}) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error });
  vi.mocked(createClient).mockResolvedValue({
    auth: { resetPasswordForEmail },
  } as never);
  return { resetPasswordForEmail };
}

// Build a mock Supabase client shaped for updatePasswordAction.
function mockUpdateClient({
  user = null as { id: string } | null,
  userError = null as unknown,
  updateError = null as unknown,
} = {}) {
  const updateUser = vi.fn().mockResolvedValue({ error: updateError });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
      updateUser,
      signOut,
    },
  } as never);
  return { updateUser, signOut };
}

// ---------------------------------------------------------------------------
// requestPasswordResetAction
// ---------------------------------------------------------------------------

describe("requestPasswordResetAction", () => {
  it("returns a validation error when email is empty", async () => {
    mockResetClient();
    const result = await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "" }),
    );
    expect(result.error).toBeTruthy();
    expect(result.message).toBeNull();
  });

  it("returns the generic message for a valid email (account exists path)", async () => {
    mockResetClient({ error: null });
    const result = await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "user@example.com" }),
    );
    expect(result.error).toBeNull();
    expect(result.message).toBeTruthy();
    // Must contain the generic 'si existe una cuenta' copy — never 'found' / 'not found'.
    expect(result.message).toMatch(/si existe una cuenta/i);
  });

  it("returns the SAME generic message when Supabase returns an error (no account leakage)", async () => {
    mockResetClient({ error: { message: "User not found" } });
    const result = await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "nobody@example.com" }),
    );
    // The action intentionally ignores the Supabase error to avoid leaking
    // whether the account exists — the message must be the same generic one.
    expect(result.error).toBeNull();
    expect(result.message).toMatch(/si existe una cuenta/i);
  });

  it("calls resetPasswordForEmail with the provided email", async () => {
    const { resetPasswordForEmail } = mockResetClient();
    await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "ana@mimar.ar" }),
    );
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@mimar.ar",
      expect.objectContaining({ redirectTo: expect.stringContaining("/recuperar/actualizar") }),
    );
  });

  it("enforces a per-IP and a per-email budget before sending a recovery email", async () => {
    const { resetPasswordForEmail } = mockResetClient();
    await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "ana@mimar.ar" }),
    );
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_password_reset_ip",
      "10.0.0.1",
      expect.any(Object),
    );
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_password_reset_email",
      expect.any(String),
      expect.any(Object),
    );
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
  });

  it("returns a friendly error and sends NO email when rate-limited", async () => {
    const { resetPasswordForEmail } = mockResetClient();
    mockEnforceRateLimit.mockRejectedValueOnce(
      new RateLimitError(new Date(Date.now() + 60_000), "auth_password_reset_ip"),
    );
    const result = await requestPasswordResetAction(
      { message: null, error: null },
      makeForm({ email: "ana@mimar.ar" }),
    );
    expect(result.error).toMatch(/demasiados intentos/i);
    expect(result.message).toBeNull();
    // Fail closed: no recovery email is dispatched once the budget is spent.
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updatePasswordAction
// ---------------------------------------------------------------------------

describe("updatePasswordAction", () => {
  it("rejects when there is no valid session", async () => {
    mockUpdateClient({ user: null });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "nuevaPass1!", confirmPassword: "nuevaPass1!" }),
    );
    expect(result.error).toBeTruthy();
    expect(result.ok).toBeFalsy();
  });

  it("rejects when getUser itself returns an error (session tampered)", async () => {
    mockUpdateClient({ user: null, userError: { message: "invalid JWT" } });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "nuevaPass1!", confirmPassword: "nuevaPass1!" }),
    );
    expect(result.error).toBeTruthy();
    expect(result.ok).toBeFalsy();
  });

  it("rejects when the password is shorter than 8 characters", async () => {
    mockUpdateClient({ user: { id: "user-uuid" } });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "short", confirmPassword: "short" }),
    );
    expect(result.error).toMatch(/8 caracteres/);
  });

  it("rejects when the passwords do not match", async () => {
    mockUpdateClient({ user: { id: "user-uuid" } });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "validPassword1!", confirmPassword: "different!" }),
    );
    expect(result.error).toMatch(/no coinciden/);
  });

  it("calls updateUser and returns ok when session is valid and passwords match", async () => {
    const { updateUser } = mockUpdateClient({ user: { id: "user-uuid" } });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "seguraPass1!", confirmPassword: "seguraPass1!" }),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: "seguraPass1!" });
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
  });

  // MED-5: a reset is the canonical response to a compromised account, so any
  // pre-existing attacker session must be revoked. scope:"others" kills every
  // OTHER session while preserving the current recovery session (reset UX).
  it("revokes all OTHER sessions after a successful password update", async () => {
    const { signOut } = mockUpdateClient({ user: { id: "user-uuid" } });
    await updatePasswordAction(
      { error: null },
      makeForm({ password: "seguraPass1!", confirmPassword: "seguraPass1!" }),
    );
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("does NOT revoke other sessions when the password update fails", async () => {
    const { signOut } = mockUpdateClient({
      user: { id: "user-uuid" },
      updateError: { message: "Password too weak" },
    });
    await updatePasswordAction(
      { error: null },
      makeForm({ password: "seguraPass1!", confirmPassword: "seguraPass1!" }),
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still returns ok when the session revocation itself fails (non-fatal)", async () => {
    const { signOut } = mockUpdateClient({ user: { id: "user-uuid" } });
    signOut.mockRejectedValueOnce(new Error("network glitch"));
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "seguraPass1!", confirmPassword: "seguraPass1!" }),
    );
    // The password was already changed — a sign-out hiccup must not surface as a
    // hard error to the user.
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it("surfaces Supabase error when updateUser fails", async () => {
    mockUpdateClient({
      user: { id: "user-uuid" },
      updateError: { message: "Password too weak" },
    });
    const result = await updatePasswordAction(
      { error: null },
      makeForm({ password: "validPass1!", confirmPassword: "validPass1!" }),
    );
    expect(result.error).toBeTruthy();
    expect(result.ok).toBeFalsy();
  });
});
