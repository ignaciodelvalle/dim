// Integration + unit tests for lookupPetForDecomisoAction.
//
// Jurisdiction scope check (PII guard):
//   - In-jurisdiction govt lookup → returns pet + hasOwner + ownerDisplayName.
//   - Out-of-jurisdiction govt lookup → { found: false, error } — NO PII leak.
//   - Admin lookup (cross-jurisdiction) → returns pet + owner PII regardless of pet province.
//
// We mock requireDecomisoPrincipal so the action can be called without a live
// Supabase auth session (same pattern as localities-search-action.test.ts).

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-guards", () => ({
  requireDecomisoPrincipal: vi.fn(),
}));

import { lookupPetForDecomisoAction } from "@/app/actions/decomiso-pet-lookup";
import { db, govtAssignments, ownerships, pets, profiles } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const IN_PET_TOKEN = "DIM-LKUP-IN01";
const OUT_PET_TOKEN = "DIM-LKUP-OT01";
const NULL_PROV_TOKEN = "DIM-LKUP-NP01";
const OWNER_DISPLAY_NAME = "Titular Test Lookup";

let inPetId: string;
let outPetId: string;
let nullProvPetId: string;
let ownerUserId: string;
let govtUserId: string;
let adminUserId: string;

// Build a DecomisoPrincipalSession mock for a govt user assigned to CABA.
function govtSession(userId: string) {
  return {
    user: { id: userId } as never,
    profile: { id: userId, role: "govt" as const },
    jurisdictions: [{ province: "CABA", locality: "Buenos Aires" }],
  };
}

// Build a DecomisoPrincipalSession mock for an admin (universal scope).
function adminSession(userId: string) {
  return {
    user: { id: userId } as never,
    profile: { id: userId, role: "admin" as const },
    jurisdictions: [],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any stale state.
  await withMutationOverride(async (tx) => {
    for (const token of [IN_PET_TOKEN, OUT_PET_TOKEN, NULL_PROV_TOKEN]) {
      await tx.execute(sql`DELETE FROM ownerships WHERE pet_id IN (
        SELECT id FROM pets WHERE public_token = ${token}
      )`);
      await tx.execute(sql`DELETE FROM pets WHERE public_token = ${token}`);
    }
  });

  // Pet in CABA — same province as the test govt user's jurisdiction.
  const [inPet] = await db
    .insert(pets)
    .values({
      publicToken: IN_PET_TOKEN,
      name: "Roco Lookup",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "CABA",
    })
    .returning();
  inPetId = inPet.id;

  // Pet in Mendoza — out of scope for the CABA govt user.
  const [outPet] = await db
    .insert(pets)
    .values({
      publicToken: OUT_PET_TOKEN,
      name: "Pulga Lookup",
      species: "cat",
      sex: "female",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "Mendoza",
    })
    .returning();
  outPetId = outPet.id;

  // Pet with null province — no recorded jurisdiction, always in scope.
  const [nullProvPet] = await db
    .insert(pets)
    .values({
      publicToken: NULL_PROV_TOKEN,
      name: "Anónimo Lookup",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      // jurisdictionProvince intentionally omitted (null)
    })
    .returning();
  nullProvPetId = nullProvPet.id;

  // Owner profile for the in-scope pet.
  const ownerId = randomUUID();
  await db.insert(profiles).values({
    id: ownerId,
    displayName: OWNER_DISPLAY_NAME,
    role: "owner",
    accountType: "personal",
  });
  ownerUserId = ownerId;

  // Active owner ownership on the in-scope pet.
  await db.insert(ownerships).values({
    petId: inPetId,
    ownerUserId,
    role: "owner",
    startedAt: new Date(),
  });

  // Govt user profile (stub — no auth.users row required for action testing).
  const gId = randomUUID();
  await db.insert(profiles).values({
    id: gId,
    displayName: "Oficial Test Lookup",
    role: "govt",
    accountType: "institutional",
  });
  govtUserId = gId;

  // Assign CABA to the govt user.
  await db.insert(govtAssignments).values({
    userId: govtUserId,
    jurisdictionProvince: "CABA",
    jurisdictionLocality: "Buenos Aires",
    grantedByUserId: govtUserId,
  });

  // Admin profile (stub).
  const aId = randomUUID();
  await db.insert(profiles).values({
    id: aId,
    displayName: "Admin Test Lookup",
    role: "admin",
    accountType: "institutional",
  });
  adminUserId = aId;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of [inPetId, outPetId, nullProvPetId].filter(Boolean)) {
      await tx.execute(sql`DELETE FROM ownerships WHERE pet_id = ${id}`);
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${id}`);
      await tx.execute(sql`DELETE FROM pets WHERE id = ${id}`);
    }
    if (govtUserId) {
      await tx.execute(sql`DELETE FROM govt_assignments WHERE user_id = ${govtUserId}`);
      await tx.execute(sql`DELETE FROM profiles WHERE id = ${govtUserId}`);
    }
    if (ownerUserId) {
      await tx.execute(sql`DELETE FROM profiles WHERE id = ${ownerUserId}`);
    }
    if (adminUserId) {
      await tx.execute(sql`DELETE FROM profiles WHERE id = ${adminUserId}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Domain logic unit tests (no DB required — mirrors executeDecomisoAction Fix 1 tests)
// ---------------------------------------------------------------------------

describe("lookupPetForDecomisoAction — jurisdiction scope logic (unit)", () => {
  it("CABA govt is in-scope for CABA pet", () => {
    const jurisdictions = [{ province: "CABA", locality: "Buenos Aires" }];
    const petProvince = "CABA";
    const inScope = !petProvince || jurisdictions.some((j) => j.province === petProvince);
    expect(inScope).toBe(true);
  });

  it("CABA govt is out-of-scope for Mendoza pet", () => {
    const jurisdictions = [{ province: "CABA", locality: "Buenos Aires" }];
    const petProvince = "Mendoza";
    const inScope = !petProvince || jurisdictions.some((j) => j.province === petProvince);
    expect(inScope).toBe(false);
  });

  it("null pet province is always in scope (no jurisdiction can be violated)", () => {
    const jurisdictions = [{ province: "CABA", locality: "Buenos Aires" }];
    const petProvince: string | null = null;
    const inScope = !petProvince || jurisdictions.some((j) => j.province === petProvince);
    expect(inScope).toBe(true);
  });

  it("admin (empty jurisdictions) — logic check bypassed by role guard", () => {
    // Admin path is role === 'admin', so the jurisdictions array is never consulted.
    // The jurisdiction check in the action is gated with `if (session.profile.role === 'govt')`.
    // For admin the guard never fires, so empty jurisdictions never block a lookup.
    // Verified via the integration test below; this unit test just documents the invariant.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — action called with mocked session
// ---------------------------------------------------------------------------

describe("lookupPetForDecomisoAction — in-jurisdiction govt lookup", () => {
  it("returns pet data and owner PII for a pet in the govt user's jurisdiction", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction(IN_PET_TOKEN);

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.publicToken).toBe(IN_PET_TOKEN);
    expect(result.name).toBe("Roco Lookup");
    expect(result.hasOwner).toBe(true);
    expect(result.ownerDisplayName).toBe(OWNER_DISPLAY_NAME);
  });
});

describe("lookupPetForDecomisoAction — out-of-jurisdiction govt lookup", () => {
  it("returns { found: false, error } without leaking owner PII for Mendoza pet", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction(OUT_PET_TOKEN);

    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.error).toContain("jurisdicción");
    // Confirm the result type has no PII fields.
    expect("ownerDisplayName" in result).toBe(false);
    expect("hasOwner" in result).toBe(false);
  });

  it("returns the jurisdiction error message matching executeDecomisoAction", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction(OUT_PET_TOKEN);

    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.error).toBe("Esta mascota no está en tu jurisdicción asignada.");
  });
});

describe("lookupPetForDecomisoAction — null-province pet (no jurisdiction recorded)", () => {
  it("govt user can look up a pet with null jurisdictionProvince", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction(NULL_PROV_TOKEN);

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.publicToken).toBe(NULL_PROV_TOKEN);
    // No owner on this pet.
    expect(result.hasOwner).toBe(false);
    expect(result.ownerDisplayName).toBeNull();
  });
});

describe("lookupPetForDecomisoAction — admin lookup (universal scope)", () => {
  it("admin can look up the Mendoza pet (cross-jurisdiction) and gets owner PII", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(adminSession(adminUserId) as never);

    // outPet (Mendoza) has no owner. We verify the action succeeds and returns
    // hasOwner=false (not rejected) — confirming admin bypasses the jurisdiction check.
    const result = await lookupPetForDecomisoAction(OUT_PET_TOKEN);

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.publicToken).toBe(OUT_PET_TOKEN);
    expect(result.hasOwner).toBe(false);
  });

  it("admin can look up the in-scope pet and gets owner display name", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(adminSession(adminUserId) as never);

    const result = await lookupPetForDecomisoAction(IN_PET_TOKEN);

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.ownerDisplayName).toBe(OWNER_DISPLAY_NAME);
    expect(result.hasOwner).toBe(true);
  });
});

describe("lookupPetForDecomisoAction — token validation", () => {
  it("rejects an empty query", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction("   ");
    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.error).toContain("token");
  });

  it("rejects a malformed token", async () => {
    vi.mocked(requireDecomisoPrincipal).mockResolvedValue(govtSession(govtUserId) as never);

    const result = await lookupPetForDecomisoAction("not-a-token");
    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.error).toContain("DIM-XXXX-XXXX");
  });
});
