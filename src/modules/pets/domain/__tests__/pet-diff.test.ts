// Unit tests for pet-diff.ts — pure, no DB.
// Written FIRST (RED phase, task 1.3) before creating pet-diff.ts.

import { describe, expect, it } from "vitest";

import { diffPet } from "../pet-diff";
import type { ParsedPet } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Minimal existing pet row shape needed by diffPet.
// Matches the Pet type from @/db (relevant fields only).
type ExistingPetFixture = Parameters<typeof diffPet>[0];

function makeExisting(overrides: Partial<ExistingPetFixture> = {}): ExistingPetFixture {
  return {
    name: "Rex",
    species: "dog",
    sex: "male",
    breed: "labrador",
    dateOfBirth: "2021-01-01",
    color: "yellow",
    microchipId: null,
    microchipCountryCode: null,
    microchipImplantedAt: null,
    microchipImplantedBy: null,
    microchipLocation: null,
    estimatedWeightKg: "25",
    favouriteFoods: ["chicken"],
    knownAllergies: null,
    trainingLevel: "basic",
    potentiallyDangerousBreed: false,
    insuranceCompany: null,
    insurancePolicyNumber: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    acquisitionMethod: "adopted",
    ...overrides,
  };
}

function makeParsed(overrides: Partial<ParsedPet> = {}): ParsedPet {
  return {
    name: "Rex",
    species: "dog",
    sex: "male",
    breed: "labrador",
    dateOfBirth: "2021-01-01",
    birthDateIsEstimated: false,
    color: "yellow",
    microchipId: null,
    microchipCountryCode: null,
    microchipImplantedAt: null,
    microchipImplantedBy: null,
    microchipLocation: null,
    estimatedWeightKg: "25",
    favouriteFoods: ["chicken"],
    knownAllergies: [],
    trainingLevel: "basic",
    insuranceCompany: null,
    insurancePolicyNumber: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    acquisitionMethod: "adopted",
    emergencyInfoVisible: false,
    permanentConditions: [],
    permanentConditionsOther: null,
    discloseConditionsPublicly: false,
    custodyKind: "owner",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Changed-fields detection
// ---------------------------------------------------------------------------

describe("diffPet — changed-fields detection", () => {
  it("returns empty array when no fields changed", () => {
    const existing = makeExisting();
    const parsed = makeParsed();
    const result = diffPet(existing, parsed, false);
    expect(result).toEqual([]);
  });

  it("detects a changed name", () => {
    const existing = makeExisting({ name: "Rex" });
    const parsed = makeParsed({ name: "Max" });
    const result = diffPet(existing, parsed, false);
    const nameEntry = result.find((e) => e.field === "name");
    expect(nameEntry).toEqual({ field: "name", old: "Rex", new: "Max" });
  });

  it("detects a changed breed", () => {
    const existing = makeExisting({ breed: "labrador" });
    const parsed = makeParsed({ breed: "beagle" });
    const result = diffPet(existing, parsed, false);
    const entry = result.find((e) => e.field === "breed");
    expect(entry).toEqual({ field: "breed", old: "labrador", new: "beagle" });
  });

  it("detects a changed potentiallyDangerousBreed flag", () => {
    const existing = makeExisting({ potentiallyDangerousBreed: false });
    const parsed = makeParsed();
    const result = diffPet(existing, parsed, true); // PPP changed
    const entry = result.find((e) => e.field === "potentially_dangerous_breed");
    expect(entry).toEqual({
      field: "potentially_dangerous_breed",
      old: false,
      new: true,
    });
  });

  it("detects microchip_id change from null to value", () => {
    const existing = makeExisting({ microchipId: null });
    const parsed = makeParsed({ microchipId: "982000411234567" });
    const result = diffPet(existing, parsed, false);
    const entry = result.find((e) => e.field === "microchip_id");
    expect(entry).toEqual({
      field: "microchip_id",
      old: null,
      new: "982000411234567",
    });
  });

  it("returns multiple changed fields when several differ", () => {
    const existing = makeExisting({ name: "Rex", breed: "labrador" });
    const parsed = makeParsed({ name: "Max", breed: "beagle" });
    const result = diffPet(existing, parsed, false);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.map((e) => e.field)).toContain("name");
    expect(result.map((e) => e.field)).toContain("breed");
  });
});

// ---------------------------------------------------------------------------
// JSON-equality skip (arrays compared by value, not reference)
// ---------------------------------------------------------------------------

describe("diffPet — JSON-equality skip for array fields", () => {
  it("skips favouriteFoods when content is equal", () => {
    const existing = makeExisting({ favouriteFoods: ["chicken", "rice"] });
    // parsePetForm produces non-null array, diffPet normalizes empty→null
    const parsed = makeParsed({ favouriteFoods: ["chicken", "rice"] });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "favourite_foods")).toBeUndefined();
  });

  it("detects favouriteFoods change when arrays differ", () => {
    const existing = makeExisting({ favouriteFoods: ["chicken"] });
    const parsed = makeParsed({ favouriteFoods: ["chicken", "rice"] });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "favourite_foods")).toBeDefined();
  });

  it("treats empty favouriteFoods array as null for comparison (matches original behavior)", () => {
    // Original: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null
    const existing = makeExisting({ favouriteFoods: null });
    const parsed = makeParsed({ favouriteFoods: [] }); // empty → null in diff
    const result = diffPet(existing, parsed, false);
    // null vs null → no change
    expect(result.find((e) => e.field === "favourite_foods")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// emergencyInfoVisible NOT in diff (spec: flag-only, no event)
// ---------------------------------------------------------------------------

describe("diffPet — emergencyInfoVisible excluded from diff", () => {
  it("does NOT include emergencyInfoVisible in the diff output", () => {
    const existing = makeExisting();
    // emergencyInfoVisible changed from false to true
    const parsed = makeParsed({ emergencyInfoVisible: true });
    const result = diffPet(existing, parsed, false);
    const entry = result.find((e) => e.field === "emergency_info_visible");
    expect(entry).toBeUndefined();
  });

  it("returns empty diff when ONLY emergencyInfoVisible changes", () => {
    const existing = makeExisting();
    const parsed = makeParsed({ emergencyInfoVisible: true });
    const result = diffPet(existing, parsed, false);
    expect(result).toEqual([]);
  });
});
