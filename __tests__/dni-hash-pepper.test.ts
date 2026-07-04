// DNI pepper fail-closed guard (deploy-readiness residual, 2026-07-04).
// ====================================================================
//
// getPepper() must REFUSE to hash DNIs in production when the pepper is unset
// or still the public committed dev default — hashing the 7-8 digit Argentine
// DNI space with a known pepper makes every stored hash rainbow-reversible.
//
// The guard is NODE_ENV === "production" REGARDLESS of host (the earlier
// `&& process.env.VERCEL` clause let a non-Vercel prod deploy hash with the
// public dev pepper). These tests pin that contract: prod fails closed, and
// local/test keep the dev-pepper fallback so the suite and dev DB still hash.

import { afterEach, describe, expect, it, vi } from "vitest";

import { hashDni } from "@/lib/utils/dni-hash";

const DNI = "30123456";
const HEX_64 = /^[0-9a-f]{64}$/;

describe("dni-hash pepper fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws in production when DNI_HASH_PEPPER is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("throws in production when DNI_HASH_PEPPER is still the public dev default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DNI_HASH_PEPPER", "dim-test-pepper-v1");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("fails closed on a NON-Vercel production deploy (VERCEL unset)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("hashes in production when a non-default secret pepper is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DNI_HASH_PEPPER", "a-real-kms-managed-secret-v1");
    expect(hashDni(DNI)).toMatch(HEX_64);
  });

  it("keeps the dev-pepper fallback outside production (local/test unchanged)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(hashDni(DNI)).toMatch(HEX_64);
  });
});
