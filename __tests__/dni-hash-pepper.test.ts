// DNI pepper fail-closed guard (deploy-readiness residual, 2026-07-04).
// ====================================================================
//
// getPepper() must REFUSE to hash DNIs in production when the pepper is unset
// or still the public committed dev default — hashing the 7-8 digit Argentine
// DNI space with a known pepper makes every stored hash rainbow-reversible.
//
// The guard fires on a REAL production DEPLOYMENT = NODE_ENV="production" AND a
// REMOTE database (any host: Vercel or self-hosted). `next start` for local QA
// runs in production mode against the LOCAL Supabase and must keep the dev-pepper
// fallback — otherwise the local production-mode server 500s at boot. These tests
// pin that contract: a remote-DB prod deploy fails closed; local prod-mode QA and
// test keep the dev-pepper fallback.

import { afterEach, describe, expect, it, vi } from "vitest";

import { hashDni } from "@/lib/utils/dni-hash";

const DNI = "30123456";
const HEX_64 = /^[0-9a-f]{64}$/;
const REMOTE_DB = "postgres://user:pass@db.prod.example.com:5432/dim";
const LOCAL_DB = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

describe("dni-hash pepper fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws on a remote-DB production deploy when DNI_HASH_PEPPER is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_DB);
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("throws on a remote-DB production deploy when DNI_HASH_PEPPER is still the public dev default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_DB);
    vi.stubEnv("DNI_HASH_PEPPER", "dim-test-pepper-v1");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("fails closed on a self-hosted (non-Vercel) production deploy — keyed on the remote DB, not VERCEL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", REMOTE_DB);
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(() => hashDni(DNI)).toThrow(/DNI_HASH_PEPPER/);
  });

  it("hashes on a production deploy when a non-default secret pepper is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_DB);
    vi.stubEnv("DNI_HASH_PEPPER", "a-real-kms-managed-secret-v1");
    expect(hashDni(DNI)).toMatch(HEX_64);
  });

  it("does NOT throw in production MODE against a LOCAL db (next start QA) — keeps the dev fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", LOCAL_DB);
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(hashDni(DNI)).toMatch(HEX_64);
  });

  it("keeps the dev-pepper fallback outside production (local/test unchanged)", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DNI_HASH_PEPPER", "");
    expect(hashDni(DNI)).toMatch(HEX_64);
  });
});
