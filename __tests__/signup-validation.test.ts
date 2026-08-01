// Unit tests for signupAction and completeIdentityAction validation gates.
//
// Every case here fails validation BEFORE the Supabase client is created, so
// no auth or DB interaction happens — same pattern as claim-gate.test.ts.
//
// completeIdentityAction requires an active session (supabase.auth.getUser) to
// proceed past validation. Tests that exercise pre-session guards are possible
// because the DNI format check runs before the session lookup. Tests that
// require an authenticated user are skipped with a note.

import { describe, expect, it, vi } from "vitest";

// signupAction now derives callerIp from request headers for its per-IP
// rate-limit budget. Mock next/headers so the header read succeeds. Note the
// mock intentionally omits `cookies`, so a validation-passing test still throws
// downstream at createClient()'s cookies() call — preserving the original
// "reaches Supabase" assertion.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === "x-real-ip" ? "10.0.0.1" : null),
  })),
}));

// Rate limiter: allow by default so validation-gate tests reach (or clear) it.
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

import { completeIdentityAction, signupAction } from "@/app/actions/auth";

function buildAuthForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", "ana@example.com");
  fd.set("password", "supersecreta");
  fd.set("confirmPassword", "supersecreta");
  fd.set("tosAccepted", "on");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function buildIdentityForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("firstName", "Ana");
  fd.set("lastName", "Pérez");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe("signupAction — validation gates", () => {
  it("rejects when email is missing", async () => {
    const fd = buildAuthForm({ email: "" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/Faltan datos/);
  });

  it("rejects when password is missing", async () => {
    const fd = buildAuthForm({ password: "", confirmPassword: "" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/Faltan datos/);
  });

  it("rejects passwords under 8 characters", async () => {
    const fd = buildAuthForm({ password: "corta", confirmPassword: "corta" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/al menos 8 caracteres/);
  });

  it("rejects when passwords do not match", async () => {
    const fd = buildAuthForm({ confirmPassword: "otracontraseña" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/no coinciden/);
  });

  it("rejects when confirmPassword is absent entirely", async () => {
    const fd = buildAuthForm();
    fd.delete("confirmPassword");
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/no coinciden/);
  });

  it("rejects when the TOS checkbox is not accepted", async () => {
    const fd = buildAuthForm();
    fd.delete("tosAccepted");
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/Términos/);
  });

  it("does not require displayName — validation passes and action reaches Supabase", async () => {
    // Verifies that step 1 no longer validates displayName. A valid form
    // without displayName must pass all pre-Supabase guards and then throw at
    // the Next.js `cookies()` call (no request context in unit tests).
    // That throw confirms validation was cleared — it's NOT a "Faltan datos" error.
    const fd = buildAuthForm();
    // displayName is intentionally absent.
    await expect(signupAction({ error: null }, fd)).rejects.toThrow(/request scope|cookies/i);
  });
});

describe("completeIdentityAction — pre-session validation gates", () => {
  // These tests exercise guards that run before supabase.auth.getUser.
  //
  // CORRECTED 2026-08-01. The comment that used to sit here said:
  //
  //   "The action will redirect to /signup (NEXT_REDIRECT) when it reaches the
  //    session check and no session exists"
  //
  // That was false twice over. completeIdentityAction has not redirected since
  // the anti-loop fix — on a missing session it RETURNS an honest error, and
  // __tests__/signup-no-session-guard.test.ts fails loudly if redirect() is
  // ever called from it. So the comment documented, as expected behaviour, the
  // exact bug a sibling test file exists to prevent.
  //
  // What actually throws in these "valid input" cases is:
  //
  //   Error: `cookies` was called outside a request scope.
  //
  // — createClient() reaching for Next's request context, which unit tests do
  // not have. The old assertions were a bare `rejects.toThrow()`, which cannot
  // tell that throw apart from any other. Measured: with the DNI format check
  // replaced by `if (false)`, all three "accepts a valid DNI" tests still
  // passed. They asserted nothing about DNI acceptance.
  //
  // The matcher below fixes that. It still cannot reach the profile write, but
  // it is no longer vacuous: a REJECTED DNI would return a validation error
  // instead of throwing, so `rejects` fails — which is precisely the claim
  // "this DNI is accepted". The specific pattern additionally pins WHERE
  // execution got to, so an unrelated throw can never be mistaken for success.
  const REACHED_REQUEST_BOUNDARY = /request scope|cookies/i;

  it("rejects when firstName is empty", async () => {
    const fd = buildIdentityForm({ firstName: "" });
    const result = await completeIdentityAction({ error: null }, fd);
    expect(result.error).toMatch(/nombre y apellido/);
  });

  it("rejects when lastName is empty", async () => {
    const fd = buildIdentityForm({ lastName: "" });
    const result = await completeIdentityAction({ error: null }, fd);
    expect(result.error).toMatch(/nombre y apellido/);
  });

  it("rejects a DNI with letters", async () => {
    const fd = buildIdentityForm({ dni: "abc1234" });
    const result = await completeIdentityAction({ error: null }, fd);
    expect(result.error).toMatch(/7 u 8 dígitos/);
  });

  it("rejects a DNI that is too short (< 7 digits)", async () => {
    const fd = buildIdentityForm({ dni: "123456" });
    const result = await completeIdentityAction({ error: null }, fd);
    expect(result.error).toMatch(/7 u 8 dígitos/);
  });

  it("rejects a DNI that is too long (> 8 digits)", async () => {
    const fd = buildIdentityForm({ dni: "123456789" });
    const result = await completeIdentityAction({ error: null }, fd);
    expect(result.error).toMatch(/7 u 8 dígitos/);
  });

  it("accepts a valid 7-digit DNI: no validation error, execution reaches the session boundary", async () => {
    const fd = buildIdentityForm({ dni: "1234567" });
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow(
      REACHED_REQUEST_BOUNDARY,
    );
  });

  it("accepts a valid 8-digit DNI: no validation error, execution reaches the session boundary", async () => {
    const fd = buildIdentityForm({ dni: "34567890" });
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow(
      REACHED_REQUEST_BOUNDARY,
    );
  });

  it("accepts a missing DNI — the field is optional", async () => {
    const fd = buildIdentityForm();
    // No dni set — optional field omitted entirely.
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow(
      REACHED_REQUEST_BOUNDARY,
    );
  });

  it("strips dots and spaces from DNI before validating the format", async () => {
    // "34.567.890" → "34567890": 8 digits, valid. If the stripping were removed
    // the raw value would fail DNI_RE and the action would RETURN an error
    // instead of throwing, so this assertion genuinely covers the stripping.
    const fd = buildIdentityForm({ dni: "34.567.890" });
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow(
      REACHED_REQUEST_BOUNDARY,
    );
  });
});
