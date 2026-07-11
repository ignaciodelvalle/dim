// Regression test for lib/pet-identifiers.ts (ARCH-Q).
//
// fetchActiveIdentifications' single-pet query omits petId from the select
// (the WHERE already filters by it), so rows key under the single-pet
// sentinel. The original implementation indexed the result by the pet's UUID
// and therefore ALWAYS returned empty identifications — every migrated
// single-pet reader silently lost chip/tattoo data. These tests pin the
// helper against the real DB so that bug class cannot return.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petIdentifications, pets } from "@/db";
import { fetchComplianceStatesForPets } from "@/lib/analytics/owner-dashboard";
import {
  batchFetchActiveIdentifications,
  fetchActiveIdentifications,
} from "@/lib/infra/pet-identifiers";

const seedPetIds: string[] = [];

const CHIP_CODE = "858000099990001";
const TATTOO_CODE = "ARCHQ-REGRESSION";

beforeAll(async () => {
  const [chipPet] = await db
    .insert(pets)
    .values({
      publicToken: `TEST-IDH-${Date.now()}-A`,
      name: "Identifiers Helper Test A",
      species: "dog",
      sex: "male",
      status: "active",
    })
    .returning({ id: pets.id });
  const [barePet] = await db
    .insert(pets)
    .values({
      publicToken: `TEST-IDH-${Date.now()}-B`,
      name: "Identifiers Helper Test B",
      species: "cat",
      sex: "female",
      status: "active",
    })
    .returning({ id: pets.id });
  seedPetIds.push(chipPet.id, barePet.id);

  await db.insert(petIdentifications).values([
    {
      petId: chipPet.id,
      kind: "microchip_iso",
      code: CHIP_CODE,
      recordedAt: new Date().toISOString().slice(0, 10),
      isoCountryCode: CHIP_CODE.slice(0, 3),
      isoManufacturerCode: CHIP_CODE.slice(3, 7),
      isoNationalId: CHIP_CODE.slice(7, 15),
      isoCompliant: true,
    },
    {
      petId: chipPet.id,
      kind: "tattoo",
      code: TATTOO_CODE,
      recordedAt: new Date().toISOString().slice(0, 10),
      tattooLocation: "inner_ear_left",
    },
  ]);
});

afterAll(async () => {
  if (seedPetIds.length > 0) {
    await db.delete(petIdentifications).where(inArray(petIdentifications.petId, seedPetIds));
    await db.delete(pets).where(inArray(pets.id, seedPetIds));
  }
});

describe("fetchActiveIdentifications (single pet)", () => {
  it("returns the active chip and tattoo for a pet that has them", async () => {
    const result = await fetchActiveIdentifications(seedPetIds[0]);
    expect(result.microchip?.code).toBe(CHIP_CODE);
    expect(result.microchip?.isoCountryCode).toBe("858");
    expect(result.tattoo?.code).toBe(TATTOO_CODE);
    expect(result.tattoo?.tattooLocation).toBe("inner_ear_left");
  });

  it("returns empty identifications for a pet without any", async () => {
    const result = await fetchActiveIdentifications(seedPetIds[1]);
    expect(result.microchip).toBeNull();
    expect(result.tattoo).toBeNull();
  });
});

describe("batchFetchActiveIdentifications", () => {
  it("keys results by petId and omits identifier-less pets", async () => {
    const map = await batchFetchActiveIdentifications(seedPetIds);
    expect(map.get(seedPetIds[0])?.microchip?.code).toBe(CHIP_CODE);
    expect(map.has(seedPetIds[1])).toBe(false);
  });
});

describe("fetchComplianceStatesForPets microchip sourcing", () => {
  // Regression for the list-vs-profile mismatch: the list surface used to pass
  // microchipCode: null, so a pet with a declared chip read "Sin registro" on
  // /mis-mascotas while the profile said "Declarada · sin verificar". The list
  // now sources the code from batchFetchActiveIdentifications — same source the
  // profile header uses.
  // The userId only scopes event/reminder lookups; identifications are fetched
  // by petId. A throwaway UUID yields zero events — exactly the declared-code,
  // no-professional-event branch this regression pins.
  const strangerId = crypto.randomUUID();

  it("feeds the pet's active chip code into the list compliance state", async () => {
    const states = await fetchComplianceStatesForPets(strangerId, seedPetIds);
    const chipCard = states.get(seedPetIds[0])?.cards.find((c) => c.key === "microchip");
    expect(chipCard).toBeDefined();
    // Code known from identifications, no professional implant event → declared.
    expect(chipCard?.state).toBe("Declarada · sin verificar");
    expect(chipCard?.detail).toBe(CHIP_CODE);
  });

  it("keeps 'Sin registro' for a pet without identifications", async () => {
    const states = await fetchComplianceStatesForPets(strangerId, [seedPetIds[1]]);
    const chipCard = states.get(seedPetIds[1])?.cards.find((c) => c.key === "microchip");
    expect(chipCard?.state).toBe("Sin registro");
    expect(chipCard?.detail).toBeNull();
  });
});
