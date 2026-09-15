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
//   verifyPasswordResetCodeAction (the web code step, PO decision 2026-09-13):
//     - wrong code, expired code and no-such-account share ONE sentence
//     - budgets are spent before GoTrue; rate-limited sends nothing to GoTrue
//     - success returns the N3 redirect to /recuperar/actualizar
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
import { verifyPasswordResetCodeAction } from "@/src/modules/auth/actions";

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
    // The mail carries a code now; the web copy must not promise a link.
    expect(result.message).toMatch(/código/);
    expect(result.message).not.toMatch(/enlace/i);
    // The address is echoed so the code step can send it with the code.
    expect(result.email).toBe("user@example.com");
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
    // Byte-identical to the account-exists path, echo included.
    expect(result.email).toBe("nobody@example.com");
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
// verifyPasswordResetCodeAction
// ---------------------------------------------------------------------------

// GoTrue answers every refused recovery code with this exact error — a wrong
// code, an expired one, a spent one, and a code for an address with no account.
const GOTRUE_OTP_REFUSAL = {
  message: "Token has expired or is invalid",
  code: "otp_expired",
  status: 403,
};

function mockVerifyClient(answer: { error?: unknown; session?: unknown } = {}) {
  const verifyOtp = vi.fn().mockResolvedValue({
    data: {
      user: null,
      session: answer.session === undefined ? { access_token: "a" } : answer.session,
    },
    error: answer.error ?? null,
  });
  vi.mocked(createClient).mockResolvedValue({ auth: { verifyOtp } } as never);
  return { verifyOtp };
}

const INVALID_CODE_SENTENCE =
  "El código no es válido o ya venció. Pedí uno nuevo y volvé a intentar.";

describe("verifyPasswordResetCodeAction", () => {
  it("verifies the code as a recovery OTP and returns the redirect to /recuperar/actualizar", async () => {
    const { verifyOtp } = mockVerifyClient();
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: " ana@mimar.ar ", code: "123 456" }),
    );
    // Trimmed address; whitespace removed from a pasted code.
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "ana@mimar.ar",
      token: "123456",
      type: "recovery",
    });
    expect(result).toEqual({ error: null, redirectTo: "/recuperar/actualizar" });
  });

  it("refuses a wrong code with the invalid-code sentence and no redirect", async () => {
    mockVerifyClient({ error: GOTRUE_OTP_REFUSAL, session: null });
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "000000" }),
    );
    expect(result.error).toBe(INVALID_CODE_SENTENCE);
    expect(result.redirectTo).toBeUndefined();
  });

  it("refuses an expired code with the same sentence (GoTrue cannot tell them apart)", async () => {
    mockVerifyClient({ error: { ...GOTRUE_OTP_REFUSAL }, session: null });
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "654321" }),
    );
    expect(result.error).toBe(INVALID_CODE_SENTENCE);
    expect(result.redirectTo).toBeUndefined();
  });

  it("answers an address with NO account byte-identically to a wrong code (anti-enumeration)", async () => {
    mockVerifyClient({ error: GOTRUE_OTP_REFUSAL, session: null });
    const known = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "111111" }),
    );
    mockVerifyClient({ error: GOTRUE_OTP_REFUSAL, session: null });
    const unknown = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "nadie@example.com", code: "111111" }),
    );
    expect(JSON.stringify(unknown)).toBe(JSON.stringify(known));
  });

  it("does not treat a missing session as success", async () => {
    mockVerifyClient({ error: null, session: null });
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "123456" }),
    );
    expect(result.error).toBe(INVALID_CODE_SENTENCE);
    expect(result.redirectTo).toBeUndefined();
  });

  it("asks for the code when the field is blank, without touching GoTrue or the limiter", async () => {
    const { verifyOtp } = mockVerifyClient();
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "   " }),
    );
    expect(result.error).toMatch(/código de 6 dígitos/);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });

  it("spends a per-IP and a per-email VERIFY budget, distinct from the request buckets", async () => {
    mockVerifyClient();
    await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "123456" }),
    );
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_password_reset_verify_ip",
      "10.0.0.1",
      expect.any(Object),
    );
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "auth_password_reset_verify_email",
      expect.any(String),
      expect.any(Object),
    );
    // The per-email key is the hash, never the cleartext address.
    const keys = mockEnforceRateLimit.mock.calls.map((call) => String(call[1]));
    expect(keys.some((k) => k.includes("ana@mimar.ar"))).toBe(false);
  });

  it("returns the rate-limit sentence and never calls GoTrue once a budget is spent", async () => {
    const { verifyOtp } = mockVerifyClient();
    mockEnforceRateLimit.mockRejectedValueOnce(
      new RateLimitError(new Date(Date.now() + 60_000), "auth_password_reset_verify_ip"),
    );
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "123456" }),
    );
    expect(result.error).toMatch(/demasiados intentos/i);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("maps a GoTrue rate limit to the rate-limit sentence, not to a code verdict", async () => {
    mockVerifyClient({
      error: { message: "rate limit", code: "over_request_rate_limit", status: 429 },
      session: null,
    });
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "123456" }),
    );
    expect(result.error).toMatch(/demasiados intentos/i);
  });

  it("reports an unavailable provider without blaming the code", async () => {
    const verifyOtp = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.mocked(createClient).mockResolvedValue({ auth: { verifyOtp } } as never);
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "123456" }),
    );
    expect(result.error).toMatch(/no pudimos verificar/i);
    expect(result.error).not.toBe(INVALID_CODE_SENTENCE);
  });

  it("never echoes the submitted code back in its state", async () => {
    mockVerifyClient({ error: GOTRUE_OTP_REFUSAL, session: null });
    const result = await verifyPasswordResetCodeAction(
      { error: null },
      makeForm({ email: "ana@mimar.ar", code: "987654" }),
    );
    expect(JSON.stringify(result)).not.toContain("987654");
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
