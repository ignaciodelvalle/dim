// Unit tests for PetCurrentStateSection field visibility logic.
//
// Since this project has no DOM renderer (no @testing-library/react or jsdom),
// we test the pure helper function that derives which fields to render.
// The component itself delegates all conditional logic to this helper.

import { describe, expect, it } from "vitest";
import { type CurrentStatePet, deriveCurrentStateFields } from "./PetCurrentStateSection.helpers";

function makePet(overrides: Partial<CurrentStatePet> = {}): CurrentStatePet {
  return {
    microchipId: null,
    microchipImplantedAt: null,
    tattooCode: null,
    tattooLocation: null,
    estimatedWeightKg: null,
    knownAllergies: null,
    trainingLevel: null,
    favouriteFoods: null,
    pregnancyStatus: null,
    rabiesObservationStatus: null,
    ...overrides,
  };
}

describe("deriveCurrentStateFields — tattoo and microchip (AC-A4, AC-A5, AC-A6)", () => {
  it("both microchip and tattoo present → both fields in result (AC-A6)", () => {
    const fields = deriveCurrentStateFields(
      makePet({ microchipId: "900123456789", tattooCode: "DIM-001" }),
      [],
    );
    expect(fields.microchip).not.toBeNull();
    expect(fields.tattoo).not.toBeNull();
  });

  it("only microchip present → microchip field present, tattoo absent (AC-A6)", () => {
    const fields = deriveCurrentStateFields(makePet({ microchipId: "900123456789" }), []);
    expect(fields.microchip).not.toBeNull();
    expect(fields.tattoo).toBeNull();
  });

  it("only tattoo present → tattoo field present, microchip absent (AC-A6)", () => {
    const fields = deriveCurrentStateFields(makePet({ tattooCode: "DIM-001" }), []);
    expect(fields.microchip).toBeNull();
    expect(fields.tattoo).not.toBeNull();
  });

  it("neither microchip nor tattoo → both absent (AC-A5 for tattoo)", () => {
    const fields = deriveCurrentStateFields(makePet(), []);
    expect(fields.microchip).toBeNull();
    expect(fields.tattoo).toBeNull();
  });

  it("tattoo field includes code when tattooCode is set (AC-A4)", () => {
    const fields = deriveCurrentStateFields(
      makePet({ tattooCode: "DIM-001", tattooLocation: "inner_ear_left" }),
      [],
    );
    expect(fields.tattoo).not.toBeNull();
    expect(fields.tattoo?.code).toBe("DIM-001");
    expect(fields.tattoo?.location).toBe("inner_ear_left");
  });
});

describe("deriveCurrentStateFields — weight field", () => {
  it("weight absent when estimatedWeightKg is null", () => {
    const fields = deriveCurrentStateFields(makePet(), []);
    expect(fields.weight).toBeNull();
  });

  it("weight present when estimatedWeightKg is set", () => {
    const fields = deriveCurrentStateFields(makePet({ estimatedWeightKg: "12.5" }), []);
    expect(fields.weight).not.toBeNull();
    expect(fields.weight?.kg).toBe("12.5");
  });

  it("weight lastRecordedAt derived from most-recent weight_recorded event", () => {
    const events = [
      { eventType: "weight_recorded", occurredAt: new Date("2024-01-15") },
      { eventType: "weight_recorded", occurredAt: new Date("2024-06-01") },
    ];
    const fields = deriveCurrentStateFields(makePet({ estimatedWeightKg: "12.5" }), events);
    expect(fields.weight?.lastRecordedAt).toEqual(new Date("2024-06-01"));
  });
});

describe("deriveCurrentStateFields — pregnancy line", () => {
  it("pregnancy rendered when pregnancyStatus is in_progress", () => {
    const fields = deriveCurrentStateFields(makePet({ pregnancyStatus: "in_progress" }), []);
    expect(fields.pregnancy).not.toBeNull();
  });

  it("pregnancy absent when pregnancyStatus is null", () => {
    const fields = deriveCurrentStateFields(makePet(), []);
    expect(fields.pregnancy).toBeNull();
  });
});
