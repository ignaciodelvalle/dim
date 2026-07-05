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
    // ARCH-S: microchipId / microchipCountryCode / microchipImplantedAt /
    // microchipImplantedBy / microchipLocation removed from ExistingPetSnapshot.
    // Chip diff is no longer part of diffPet; chip presence is tracked via
    // existingCanonicalIds in the update-pet use-case.
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
    emergencyInfoVisible: false,
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

  it("does NOT include microchip fields in the diff (ARCH-S: chip tracked via existingCanonicalIds)", () => {
    // diffPet no longer diffs microchip_id / microchip_country_code /
    // microchip_implanted_at / microchip_implanted_by / microchip_location.
    // Chip presence is detected via existingCanonicalIds.hasMicrochip in update-pet.ts.
    const existing = makeExisting();
    const parsed = makeParsed({ microchipId: "982000411234567" });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "microchip_id")).toBeUndefined();
    expect(result.find((e) => e.field === "microchip_country_code")).toBeUndefined();
    expect(result.find((e) => e.field === "microchip_implanted_at")).toBeUndefined();
    expect(result.find((e) => e.field === "microchip_implanted_by")).toBeUndefined();
    expect(result.find((e) => e.field === "microchip_location")).toBeUndefined();
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
// FULL-LOCK: species + jurisdiction are NOT diffable (PO decision #40)
// ---------------------------------------------------------------------------

describe("diffPet — FULL-LOCK excludes species and jurisdiction", () => {
  it("does NOT include species in the diff even when it differs", () => {
    const existing = makeExisting({ species: "dog" });
    const parsed = makeParsed({ species: "cat" });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "species")).toBeUndefined();
  });

  it("does NOT include jurisdiction_province in the diff even when it differs", () => {
    const existing = makeExisting({ jurisdictionProvince: "Buenos Aires" });
    const parsed = makeParsed({ jurisdictionProvince: "CABA" });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "jurisdiction_province")).toBeUndefined();
  });

  it("does NOT include jurisdiction_locality in the diff even when it differs", () => {
    const existing = makeExisting({ jurisdictionLocality: "La Plata" });
    const parsed = makeParsed({ jurisdictionLocality: "Quilmes" });
    const result = diffPet(existing, parsed, false);
    expect(result.find((e) => e.field === "jurisdiction_locality")).toBeUndefined();
  });

  it("returns an empty diff when ONLY species and jurisdiction differ", () => {
    const existing = makeExisting({
      species: "dog",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });
    const parsed = makeParsed({
      species: "cat",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    });
    const result = diffPet(existing, parsed, false);
    expect(result).toEqual([]);
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
