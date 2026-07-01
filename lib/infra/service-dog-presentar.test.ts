// Tests for the service-dog presentation page helpers.
//
// The /asistencia/presentar route uses these pure-logic helpers so the
// guards and URL construction can be tested without a Next.js runtime.
// Commit 4 of pet-profile-v2 Slice C.

import { describe, expect, it } from "vitest";

import { buildPublicVerifyUrl, isCredentialPresentable } from "@/lib/infra/service-dog-presentar";

describe("isCredentialPresentable", () => {
  it("returns true when credential is vigente and in service", () => {
    expect(isCredentialPresentable({ credentialStatus: "vigente", inService: true })).toBe(true);
  });

  it("returns false when credential is not vigente", () => {
    expect(isCredentialPresentable({ credentialStatus: "vencida", inService: true })).toBe(false);
    expect(isCredentialPresentable({ credentialStatus: "revocada", inService: true })).toBe(false);
    expect(
      isCredentialPresentable({ credentialStatus: "pendiente_verificacion", inService: true }),
    ).toBe(false);
    expect(isCredentialPresentable({ credentialStatus: "en_entrenamiento", inService: true })).toBe(
      false,
    );
  });

  it("returns false when inService is false even if vigente", () => {
    expect(isCredentialPresentable({ credentialStatus: "vigente", inService: false })).toBe(false);
  });

  it("returns false when no service dog row exists (null)", () => {
    expect(isCredentialPresentable(null)).toBe(false);
  });
});

describe("buildPublicVerifyUrl", () => {
  it("builds the public verify URL from a publicToken", () => {
    const url = buildPublicVerifyUrl("abc123");
    expect(url).toBe("/p/abc123");
  });

  it("handles tokens with special chars in the path segment", () => {
    const url = buildPublicVerifyUrl("tok-xyz_789");
    expect(url).toBe("/p/tok-xyz_789");
  });
});
