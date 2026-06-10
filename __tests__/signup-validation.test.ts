// Unit tests for signupAction's pre-Supabase validation (signup hardening).
//
// Every case here fails validation BEFORE the Supabase client is created, so
// no auth or DB interaction happens — same pattern as claim-gate.test.ts.

import { describe, expect, it } from "vitest";

import { signupAction } from "@/app/actions/auth";

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("displayName", "Ana Pérez");
  fd.set("email", "ana@example.com");
  fd.set("password", "supersecreta");
  fd.set("confirmPassword", "supersecreta");
  fd.set("tosAccepted", "on");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

describe("signupAction — validation gates", () => {
  it("rejects when required fields are missing", async () => {
    const fd = buildForm({ email: "" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/Faltan datos/);
  });

  it("rejects passwords under 8 characters", async () => {
    const fd = buildForm({ password: "corta", confirmPassword: "corta" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/al menos 8 caracteres/);
  });

  it("rejects when passwords do not match", async () => {
    const fd = buildForm({ confirmPassword: "otracontraseña" });
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/no coinciden/);
  });

  it("rejects when confirmPassword is absent entirely", async () => {
    const fd = buildForm();
    fd.delete("confirmPassword");
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/no coinciden/);
  });

  it("rejects when the TOS checkbox is not accepted", async () => {
    const fd = buildForm();
    fd.delete("tosAccepted");
    const result = await signupAction({ error: null }, fd);
    expect(result.error).toMatch(/Términos/);
  });
});
