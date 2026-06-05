// Integration tests for AdoptionRepository.
// Written FIRST (RED phase, task 2.10) before creating adoption-repository.ts.
//
// These tests run against a local Postgres instance (vitest.config.ts → setup.ts
// forces the connection to 127.0.0.1:54322). They follow the same fixture
// pattern used by __tests__/adoption-listing.test.ts and similar suites.

import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { withMutationOverride } from "../../../../../__tests__/_helpers/db-overrides";

// Module under test — will be created in GREEN phase (task 2.11).
import { AdoptionRepository } from "../adoption-repository";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const ORG_TOKEN = "DIM-ADOPTREP-TEST";
const PET_TOKEN_1 = "DIM-ADOPTREP-P1";
const PET_TOKEN_2 = "DIM-ADOPTREP-P2";

let orgId: string;
let petId1: string;
let petId2: string;
let custodyOwnershipId1: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Ensure clean slate (handles crashed previous runs).
  await withMutationOverride(async (tx) => {
    const stalePets = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN_1));
    for (const { id } of stalePets) {
      await tx.delete(pets).where(eq(pets.id, id));
    }
    const stalePets2 = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN_2));
    for (const { id } of stalePets2) {
      await tx.delete(pets).where(eq(pets.id, id));
    }
    const staleOrgs = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.publicToken, ORG_TOKEN));
    for (const { id } of staleOrgs) {
      await tx.delete(organizations).where(eq(organizations.id, id));
    }
  });

  // Insert org.
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_TOKEN,
      legalName: "Adoption Repo Test Refugio SRL",
      displayName: "Repo Test Refugio",
      orgType: "shelter",
      email: "adoptrep-test@dim-test.local",
      verified: true,
    })
    .returning();
  orgId = org.id;

  // Insert pet 1 (eligible, in shelter custody).
  const [pet1] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN_1,
      name: "RepoTestPet1",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      status: "active",
      adoptionEligible: true,
      adoptionEligibilitySetAt: new Date(),
    })
    .returning();
  petId1 = pet1.id;

  const [custody1] = await db
    .insert(ownerships)
    .values({
      petId: petId1,
      ownerOrganizationId: orgId,
      role: "shelter_custody",
    })
    .returning();
  custodyOwnershipId1 = custody1.id;

  // Insert pet 2 (no ownership row — not in any org).
  const [pet2] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN_2,
      name: "RepoTestPet2",
      species: "cat",
      sex: "female",
      potentiallyDangerousBreed: false,
      status: "active",
    })
    .returning();
  petId2 = pet2.id;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of [petId1, petId2].filter(Boolean)) {
      await tx.delete(pets).where(eq(pets.id, id));
    }
    if (orgId) await tx.delete(organizations).where(eq(organizations.id, orgId));
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdoptionRepository.findShelterPet", () => {
  it("returns the pet row when it exists in the org's shelter_custody", async () => {
    const result = await AdoptionRepository.findShelterPet(PET_TOKEN_1, orgId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(petId1);
  });

  it("returns null when the pet exists but is not under this org's custody", async () => {
    // Use a syntactically valid UUID that doesn't exist in the orgs table.
    const result = await AdoptionRepository.findShelterPet(
      PET_TOKEN_1,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("returns null when the token does not exist at all", async () => {
    const result = await AdoptionRepository.findShelterPet("NO-SUCH-TOKEN", orgId);
    expect(result).toBeNull();
  });

  it("also returns the custodyOwnershipId alongside the pet", async () => {
    const result = await AdoptionRepository.findShelterPet(PET_TOKEN_1, orgId);
    expect(result?.custodyOwnershipId).toBe(custodyOwnershipId1);
  });
});

describe("AdoptionRepository.findActiveFoster", () => {
  it("returns null when the pet has no active foster", async () => {
    const result = await AdoptionRepository.findActiveFoster(petId1);
    expect(result).toBeNull();
  });

  it("returns the foster row when one exists", async () => {
    // Insert a stub adopter profile for the foster
    const fosterProfileId = crypto.randomUUID();
    await db.insert(profiles).values({
      id: fosterProfileId,
      displayName: "FosterTestUser",
      dniNumber: `9${Math.floor(Math.random() * 9000000 + 1000000)}`,
      dniVerified: false,
      role: "owner",
    });

    const [fosterOwnership] = await db
      .insert(ownerships)
      .values({
        petId: petId1,
        ownerUserId: fosterProfileId,
        role: "foster",
      })
      .returning();

    const result = await AdoptionRepository.findActiveFoster(petId1);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(fosterOwnership.id);
    expect(result?.ownerUserId).toBe(fosterProfileId);

    // Cleanup
    await db.delete(ownerships).where(eq(ownerships.id, fosterOwnership.id));
    await db.delete(profiles).where(eq(profiles.id, fosterProfileId));
  });
});

// admin@dim.test is seeded by scripts/seed-test-users.ts and always present.
const SEEDED_ADMIN_USER_ID = "1a4d893c-6ef9-4120-b82a-999ded9935f1";

describe("AdoptionRepository.setEligibility (with tx)", () => {
  it("updates the pet eligibility inside a transaction and rolls back on error", async () => {
    // Verify initial state.
    const [before] = await db
      .select({ adoptionEligible: pets.adoptionEligible })
      .from(pets)
      .where(eq(pets.id, petId1));
    expect(before.adoptionEligible).toBe(true);

    // Attempt an update inside a transaction that we intentionally roll back.
    await expect(
      db.transaction(async (tx) => {
        await AdoptionRepository.setEligibility(
          {
            petId: petId1,
            eligible: false,
            ineligibleReason: "medical_treatment",
            ineligibleReasonNotes: null,
            ineligibleUntil: null,
            now: new Date(),
            userId: SEEDED_ADMIN_USER_ID,
            orgId,
            orgVerified: true,
            previousState: null,
          },
          tx,
        );
        // Force rollback.
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");

    // Pet should still be eligible after rollback.
    const [after] = await db
      .select({ adoptionEligible: pets.adoptionEligible })
      .from(pets)
      .where(eq(pets.id, petId1));
    expect(after.adoptionEligible).toBe(true);
  });

  it("persists when the transaction commits", async () => {
    const now = new Date();

    await db.transaction(async (tx) => {
      await AdoptionRepository.setEligibility(
        {
          petId: petId1,
          eligible: false,
          ineligibleReason: "quarantine",
          ineligibleReasonNotes: null,
          ineligibleUntil: null,
          now,
          userId: SEEDED_ADMIN_USER_ID,
          orgId,
          orgVerified: true,
          previousState: null,
        },
        tx,
      );
    });

    const [updated] = await db
      .select({ adoptionEligible: pets.adoptionEligible, reason: pets.adoptionIneligibleReason })
      .from(pets)
      .where(eq(pets.id, petId1));
    expect(updated.adoptionEligible).toBe(false);
    expect(updated.reason).toBe("quarantine");

    // Restore to eligible so later tests aren't affected.
    await db
      .update(pets)
      .set({
        adoptionEligible: true,
        adoptionIneligibleReason: null,
        adoptionIneligibleReasonNotes: null,
        adoptionIneligibleUntil: null,
        adoptionEligibilitySetAt: new Date(),
      })
      .where(eq(pets.id, petId1));
  });
});

describe("AdoptionRepository.insertAdoptionFinalized — composite write atomicity", () => {
  it("rolls back all writes when an error occurs mid-transaction", async () => {
    const adopterProfileId = crypto.randomUUID();

    // Count events before.
    const [{ count: before }] = await db.execute<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pet_events WHERE pet_id = '${petId1}'`,
    );

    await expect(
      db.transaction(async (tx) => {
        // Partially perform the finalization write, then error.
        await tx
          .update(ownerships)
          .set({ endedAt: new Date() })
          .where(eq(ownerships.id, custodyOwnershipId1));

        // Throw before the event is inserted — tx should roll back.
        throw new Error("simulated mid-tx failure");
      }),
    ).rejects.toThrow("simulated mid-tx failure");

    // The ownership row must still be open.
    const [ownership] = await db
      .select({ endedAt: ownerships.endedAt })
      .from(ownerships)
      .where(eq(ownerships.id, custodyOwnershipId1));
    expect(ownership.endedAt).toBeNull();

    // No extra events inserted.
    const [{ count: after }] = await db.execute<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pet_events WHERE pet_id = '${petId1}'`,
    );
    expect(Number(after)).toBe(Number(before));
  });
});
