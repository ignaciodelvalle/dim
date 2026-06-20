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

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { requestPasswordResetAction, updatePasswordAction } from "@/app/actions/password-reset";
import { createClient } from "@/lib/supabase/server";

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
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: userError }),
      updateUser,
    },
  } as never);
  return { updateUser };
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
