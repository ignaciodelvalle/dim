// Integration tests for pet_identifications + lib/identifications helpers
// (compliance handoff PR 0).
//
// Three contracts under test:
//  1. addIdentification persists chip rows with ISO 11784/11785 subfields
//     decomposed (country / manufacturer / national_id).
//  2. replaceIdentification swaps active rows atomically — old → replaced
//     with replaced_by_id pointing at the new row.
//  3. Tattoos legitimately collide across registries — two distinct rows
//     with the same `code` and `kind='tattoo'` must both insert; chips
//     with duplicate codes are rejected by the partial unique index.
//
// The migration's backfill correctness is verified manually + via the
// existing chip-match.test.ts (which uses the lookupByChip helper).

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petIdentifications, pets } from "@/db";
import {
  addIdentification,
  listIdentificationsForPet,
  markUnreadable,
  replaceIdentification,
} from "@/lib/identifications";
import { generatePublicToken } from "@/lib/publicToken";
import { withMutationOverride } from "./_helpers/db-overrides";

const createdPetIds: string[] = [];

// Helper: returns a 15-digit string with `prefix` as the first digit + 14
// digits derived from a random source. Always passes the chip_requires_iso_fields
// constraint and is collision-free across tests within a run.
let chipCounter = Date.now() % 100000;
function makeChip(prefix: number): string {
  chipCounter += 1;
  return `${prefix}${chipCounter.toString().padStart(14, "0")}`;
}

async function makePet(): Promise<string> {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      name: "IdTestPet",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
    })
    .returning();
  createdPetIds.push(pet.id);
  return pet.id;
}

beforeAll(async () => {
  // Nothing to set up — pet_identifications rows are owned by individual tests.
});

afterAll(async () => {
  // Identifications cascade on pet delete; pets need the override since
  // they're append-only-ish via triggers.
  await withMutationOverride(async (tx) => {
    for (const id of createdPetIds) {
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }
  });
});

// ---------------------------------------------------------------------------

describe("pet_identifications round-trip", () => {
  it("addIdentification persists a microchip_iso row with ISO subfields decomposed", async () => {
    const petId = await makePet();
    const code = makeChip(1);
    const add = await addIdentification({
      petId,
      kind: "microchip_iso",
      code,
      implantationSite: "interescapular",
    });
    expect("id" in add).toBe(true);
    if (!("id" in add)) return;

    const [row] = await db
      .select()
      .from(petIdentifications)
      .where(eq(petIdentifications.id, add.id));
    expect(row).toBeDefined();
    expect(row.kind).toBe("microchip_iso");
    expect(row.status).toBe("active");
    expect(row.code).toBe(code);
    expect(row.isoCountryCode).toBe(code.slice(0, 3));
    expect(row.isoManufacturerCode).toBe(code.slice(3, 7));
    expect(row.isoNationalId).toBe(code.slice(7, 15));
    expect(row.isoCompliant).toBe(true);
    expect(row.implantationSite).toBe("interescapular");
  });
});

// ---------------------------------------------------------------------------

describe("replaceIdentification", () => {
  it("flips the old chip to replaced + creates a new active chip + sets replaced_by_id", async () => {
    const petId = await makePet();
    const oldCode = makeChip(9);
    const newCode = makeChip(8);

    const add = await addIdentification({
      petId,
      kind: "microchip_iso",
      code: oldCode,
    });
    expect("id" in add).toBe(true);
    if (!("id" in add)) return;

    const result = await replaceIdentification({
      oldIdentificationId: add.id,
      reason: "damaged",
      newPayload: {
        petId,
        kind: "microchip_iso",
        code: newCode,
      },
    });
    expect("newId" in result).toBe(true);
    if (!("newId" in result)) return;

    const rows = await listIdentificationsForPet(petId);
    const oldRow = rows.find((r) => r.id === add.id);
    const newRow = rows.find((r) => r.id === result.newId);
    expect(oldRow?.status).toBe("replaced");
    expect(oldRow?.replacedById).toBe(result.newId);
    expect(oldRow?.replacementReason).toBe("damaged");
    expect(newRow?.status).toBe("active");
    expect(newRow?.code).toBe(newCode);
  });

  it("rejects replacement when the source is not active", async () => {
    const petId = await makePet();
    const code = makeChip(7);
    const add = await addIdentification({ petId, kind: "microchip_iso", code });
    if (!("id" in add)) throw new Error("setup failed");

    const mark = await markUnreadable(add.id);
    expect("ok" in mark).toBe(true);

    const replace = await replaceIdentification({
      oldIdentificationId: add.id,
      reason: "damaged",
      newPayload: {
        petId,
        kind: "microchip_iso",
        code: makeChip(6),
      },
    });
    expect("error" in replace).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("tattoo identifications collide legitimately", () => {
  it("inserts two tattoo rows with the same code on different pets (no unique index)", async () => {
    const petA = await makePet();
    const petB = await makePet();
    const sharedCode = "DUPECODE-2026";

    const a = await addIdentification({
      petId: petA,
      kind: "tattoo",
      code: sharedCode,
      tattooLocation: "inner_ear_left",
    });
    const b = await addIdentification({
      petId: petB,
      kind: "tattoo",
      code: sharedCode,
      tattooLocation: "inner_ear_right",
    });

    expect("id" in a).toBe(true);
    expect("id" in b).toBe(true);
  });

  it("rejects an active chip with a duplicate code (chip is unique)", async () => {
    const petA = await makePet();
    const petB = await makePet();
    const sharedChip = makeChip(5);

    const a = await addIdentification({ petId: petA, kind: "microchip_iso", code: sharedChip });
    expect("id" in a).toBe(true);

    const b = await addIdentification({ petId: petB, kind: "microchip_iso", code: sharedChip });
    expect("error" in b).toBe(true);
    if ("error" in b) {
      expect(b.error).toMatch(/ya está registrado/i);
    }
  });
});
