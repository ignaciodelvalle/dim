// `composePetIdentityEdit` — the overlay that lets a THREE-FIELD request reach a
// SEVENTEEN-COLUMN writer without wiping the fourteen it did not name.
//
// WHAT THIS FILE HAS TO PROVE, and why it is not "it copies some fields"
// ---------------------------------------------------------------------------
// `PetsRepository.updatePetProfile` writes every column in its `SET`
// unconditionally, from `parsed`. So the failure this function exists to prevent
// is not a compile error and not an exception: it is a 200, a
// `pet_profile_updated` event faithfully recording the loss, and an owner who
// corrected a typo in a name and lost their animal's weight, allergies, training
// level, insurance policy and permanent medical conditions in the same click.
//
// The first test therefore asserts the IDENTITY of every preserved field by
// name, rather than spot-checking two of them. A field added to `ParsedPet`
// later and forgotten here is exactly the regression, and the exhaustive
// comparison is what fails when it happens.

import { describe, expect, it } from "vitest";

import {
  type EditablePetSnapshot,
  composePetIdentityEdit,
} from "@/src/modules/pets/domain/pet-identity-edit";

/** A pet with EVERY optional field populated — a blank one proves nothing. */
function fullPet(over: Partial<EditablePetSnapshot> = {}): EditablePetSnapshot {
  return {
    name: "Pampa",
    species: "dog",
    sex: "female",
    breed: "Mestizo",
    dateOfBirth: "2021-03-04",
    birthDateIsEstimated: true,
    color: "Atigrada",
    estimatedWeightKg: "18.50",
    favouriteFoods: ["pollo", "zanahoria"],
    knownAllergies: ["polen"],
    trainingLevel: "basic",
    insuranceCompany: "Aseguradora Sur",
    insurancePolicyNumber: "POL-9182",
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "San Carlos de Bariloche",
    acquisitionMethod: "adopted",
    emergencyInfoVisible: true,
    permanentConditions: ["ciego", "otra"],
    permanentConditionsOther: "displasia de cadera",
    discloseConditionsPublicly: true,
    ...over,
  };
}

describe("composePetIdentityEdit — what the caller did not name survives", () => {
  it("carries every non-identity field through unchanged", () => {
    const existing = fullPet();
    const parsed = composePetIdentityEdit(existing, {
      name: "Pampita",
      breed: "Caniche",
      color: "Blanca",
    });

    // The three that were asked for.
    expect(parsed.name).toBe("Pampita");
    expect(parsed.breed).toBe("Caniche");
    expect(parsed.color).toBe("Blanca");

    // Everything the repository would otherwise have nulled or flipped.
    expect(parsed.species).toBe("dog");
    expect(parsed.sex).toBe("female");
    expect(parsed.dateOfBirth).toBe("2021-03-04");
    expect(parsed.birthDateIsEstimated).toBe(true);
    expect(parsed.estimatedWeightKg).toBe("18.50");
    expect(parsed.favouriteFoods).toEqual(["pollo", "zanahoria"]);
    expect(parsed.knownAllergies).toEqual(["polen"]);
    expect(parsed.trainingLevel).toBe("basic");
    expect(parsed.insuranceCompany).toBe("Aseguradora Sur");
    expect(parsed.insurancePolicyNumber).toBe("POL-9182");
    expect(parsed.jurisdictionProvince).toBe("Buenos Aires");
    expect(parsed.jurisdictionLocality).toBe("San Carlos de Bariloche");
    expect(parsed.acquisitionMethod).toBe("adopted");
    expect(parsed.emergencyInfoVisible).toBe(true);
    expect(parsed.permanentConditions).toEqual(["ciego", "otra"]);
    expect(parsed.permanentConditionsOther).toBe("displasia de cadera");
    expect(parsed.discloseConditionsPublicly).toBe(true);
  });

  it("does not silently drop a permanent condition the catalog no longer names", () => {
    // A row written before a catalog entry was renamed. Re-validating here would
    // remove it on the next unrelated name edit — a MEDICAL fact about the
    // animal, disappearing from a form that never mentioned it.
    const parsed = composePetIdentityEdit(
      fullPet({ permanentConditions: ["una_condicion_que_ya_no_existe"] }),
      { name: "Pampa", breed: null, color: null },
    );
    expect(parsed.permanentConditions).toEqual(["una_condicion_que_ya_no_existe"]);
  });

  it("turns null array columns into empty arrays, which the writer stores back as null", () => {
    // `ParsedPet` types both as `string[]`; the repository writes
    // `length > 0 ? arr : null`. So null in must become null out, and the empty
    // array is the only shape that survives the round trip.
    const parsed = composePetIdentityEdit(fullPet({ favouriteFoods: null, knownAllergies: null }), {
      name: "Pampa",
      breed: null,
      color: null,
    });
    expect(parsed.favouriteFoods).toEqual([]);
    expect(parsed.knownAllergies).toEqual([]);
  });

  it("names no microchip, so no chip can be added down this door", () => {
    // `isChipNewlyAdded` answers false for a null `microchipId`, which is what
    // keeps this endpoint from appending a `microchip_implanted` event. A chip
    // is added through its own path.
    const parsed = composePetIdentityEdit(fullPet(), {
      name: "Pampa",
      breed: null,
      color: null,
    });
    expect(parsed.microchipId).toBeNull();
    expect(parsed.microchipCountryCode).toBeNull();
    expect(parsed.microchipImplantedAt).toBeNull();
    expect(parsed.microchipImplantedBy).toBeNull();
    expect(parsed.microchipLocation).toBeNull();
  });

  it("clears breed and colour when asked to, rather than treating null as 'leave it'", () => {
    const parsed = composePetIdentityEdit(fullPet(), {
      name: "Pampa",
      breed: null,
      color: null,
    });
    expect(parsed.breed).toBeNull();
    expect(parsed.color).toBeNull();
  });

  it("never lets the request decide the species", () => {
    // There is no species field on this request by construction — the 2026-08-14
    // adversarial finding (a crafted `species=cat` passing the breed gate
    // against the wrong catalog) is unreachable here because the only species in
    // play is the persisted one.
    const parsed = composePetIdentityEdit(fullPet({ species: "cat" }), {
      name: "Michi",
      breed: null,
      color: null,
    });
    expect(parsed.species).toBe("cat");
  });
});
