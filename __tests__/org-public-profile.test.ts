// Visibility gate + projection tests for queryOrgPublicProfile (handoff
// P2-12). The query is the single source of truth for which orgs are
// reachable at /refugios/[orgToken] — if this test passes, all the
// downstream panels render against a stable contract.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, organizations } from "@/db";
import { queryOrgPublicProfile } from "@/lib/org-public-profile";

const TOKEN_VERIFIED_SHELTER = "DIM-PUB-VFD1";
const TOKEN_VERIFIED_RESCUE = "DIM-PUB-VFD2";
const TOKEN_UNVERIFIED = "DIM-PUB-UNVF";
const TOKEN_CLINIC = "DIM-PUB-CLIN";
const ALL_TOKENS = [TOKEN_VERIFIED_SHELTER, TOKEN_VERIFIED_RESCUE, TOKEN_UNVERIFIED, TOKEN_CLINIC];

beforeAll(async () => {
  // Clean up any leftovers.
  for (const token of ALL_TOKENS) {
    await db.delete(organizations).where(eq(organizations.publicToken, token));
  }

  await db.insert(organizations).values([
    {
      publicToken: TOKEN_VERIFIED_SHELTER,
      legalName: "Refugio Verificado SRL",
      displayName: "Refugio Verificado",
      orgType: "shelter",
      email: "vfd1@dim-test.local",
      verified: true,
      description: "Cuidamos animales rescatados desde 2018.",
      discloseAddress: true,
      latitude: "-34.603722",
      longitude: "-58.381592",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    },
    {
      publicToken: TOKEN_VERIFIED_RESCUE,
      legalName: "Red Rescate AC",
      displayName: "Red Rescate",
      orgType: "rescue_network",
      email: "vfd2@dim-test.local",
      verified: true,
      discloseAddress: false,
      latitude: "-34.6",
      longitude: "-58.4",
    },
    {
      publicToken: TOKEN_UNVERIFIED,
      legalName: "Refugio Sin Verificar",
      displayName: "Sin Verificar",
      orgType: "shelter",
      email: "unvf@dim-test.local",
      verified: false,
    },
    {
      publicToken: TOKEN_CLINIC,
      legalName: "Clinica Veterinaria",
      displayName: "Clinica",
      orgType: "clinic",
      email: "clin@dim-test.local",
      verified: true,
    },
  ]);
});

afterAll(async () => {
  for (const token of ALL_TOKENS) {
    await db.delete(organizations).where(eq(organizations.publicToken, token));
  }
});

describe("queryOrgPublicProfile — visibility gate", () => {
  it("returns the profile for a verified shelter", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_SHELTER);
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBe("Refugio Verificado");
    expect(profile?.orgType).toBe("shelter");
    expect(profile?.description).toBe("Cuidamos animales rescatados desde 2018.");
  });

  it("returns the profile for a verified rescue_network", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_RESCUE);
    expect(profile).not.toBeNull();
    expect(profile?.orgType).toBe("rescue_network");
  });

  it("returns null for an unverified org (any orgType)", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_UNVERIFIED);
    expect(profile).toBeNull();
  });

  it("returns null for a verified clinic (off-spec orgType)", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_CLINIC);
    expect(profile).toBeNull();
  });

  it("returns null for a nonexistent token", async () => {
    const profile = await queryOrgPublicProfile("DIM-NONE-XXXX");
    expect(profile).toBeNull();
  });
});

describe("queryOrgPublicProfile — disclose_address gate", () => {
  it("exposes lat/lng when disclose_address=true", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_SHELTER);
    expect(profile?.latitude).toBeCloseTo(-34.603722, 5);
    expect(profile?.longitude).toBeCloseTo(-58.381592, 5);
  });

  it("nulls lat/lng when disclose_address=false (even if columns set)", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_RESCUE);
    expect(profile?.latitude).toBeNull();
    expect(profile?.longitude).toBeNull();
  });
});

describe("queryOrgPublicProfile — projection shape", () => {
  it("includes internal id (used for membership joins)", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_SHELTER);
    expect(profile?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("verifiedBy is null when verified_by_user_id is null (default)", async () => {
    const profile = await queryOrgPublicProfile(TOKEN_VERIFIED_SHELTER);
    expect(profile?.verifiedBy).toBeNull();
  });
});
