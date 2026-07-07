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
  // These tests exercise guards that run before requireUserOrRedirect /
  // supabase.auth.getUser. The action will redirect to /signup (NEXT_REDIRECT)
  // when it reaches the session check and no session exists — that's expected
  // for the "valid input" cases below. We only assert on validation errors here.

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

  it("accepts a valid 7-digit DNI and proceeds to session check", async () => {
    const fd = buildIdentityForm({ dni: "1234567" });
    // Reaches the session check → redirect("/signup") thrown as NEXT_REDIRECT.
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow();
  });

  it("accepts a valid 8-digit DNI and proceeds to session check", async () => {
    const fd = buildIdentityForm({ dni: "34567890" });
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow();
  });

  it("accepts missing DNI (field is optional) and proceeds to session check", async () => {
    const fd = buildIdentityForm();
    // No dni set — optional field omitted entirely.
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow();
  });

  it("strips dots and spaces from DNI before validation", async () => {
    const fd = buildIdentityForm({ dni: "34.567.890" });
    // After stripping: "34567890" — 8 digits — valid → proceeds to session check.
    await expect(completeIdentityAction({ error: null }, fd)).rejects.toThrow();
  });
});
