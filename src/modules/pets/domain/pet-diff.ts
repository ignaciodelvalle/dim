// Pure diff computation for pet profile updates.
// Zero external imports — no @/db, drizzle-orm, or next imports allowed.
// Extracted from app/actions/pets.ts diffPet function.

import type { ParsedPet } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal existing-pet shape needed by diffPet.
 * Matches the fields diffed in the original pets.ts implementation.
 * We use a structural type instead of the full Drizzle Pet to keep domain pure.
 */
export type ExistingPetSnapshot = {
  name: string;
  species: string;
  sex: string | null;
  breed: string | null;
  dateOfBirth: string | null;
  color: string | null;
  microchipId: string | null;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
  estimatedWeightKg: string | null;
  favouriteFoods: string[] | null;
  knownAllergies: string[] | null;
  trainingLevel: string | null;
  potentiallyDangerousBreed: boolean;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  acquisitionMethod: string | null;
  // Required for flag-change detection in the update use-case.
  // emergencyInfoVisible is NOT diffed (UI preference, not pet fact) but
  // we do need to know if it changed to decide whether to skip the transaction.
  emergencyInfoVisible: boolean;
};

export type DiffEntry = {
  field: string;
  old: unknown;
  new: unknown;
};

// ---------------------------------------------------------------------------
// diffPet
// ---------------------------------------------------------------------------

/**
 * Computes the diff between an existing pet record and parsed form values.
 * Returns a list of { field, old, new } entries — these become the payload
 * of a single bundled pet_profile_updated event.
 *
 * emergencyInfoVisible is intentionally NOT diffed — it is a UI preference,
 * not a fact about the pet (see AGENTS.md → Core principles #2).
 *
 * potentiallyDangerousBreed is included because it is a resolved external
 * fact (jurisdiction-aware PPP evaluation), not a UI preference.
 */
export function diffPet(
  existing: ExistingPetSnapshot,
  parsed: ParsedPet,
  potentiallyDangerousBreed: boolean,
): DiffEntry[] {
  const fields: Array<{ field: string; oldVal: unknown; newVal: unknown }> = [
    { field: "name", oldVal: existing.name, newVal: parsed.name },
    { field: "species", oldVal: existing.species, newVal: parsed.species },
    { field: "sex", oldVal: existing.sex, newVal: parsed.sex },
    { field: "breed", oldVal: existing.breed, newVal: parsed.breed },
    { field: "date_of_birth", oldVal: existing.dateOfBirth, newVal: parsed.dateOfBirth },
    { field: "color", oldVal: existing.color, newVal: parsed.color },
    { field: "microchip_id", oldVal: existing.microchipId, newVal: parsed.microchipId },
    {
      field: "microchip_country_code",
      oldVal: existing.microchipCountryCode,
      newVal: parsed.microchipCountryCode,
    },
    {
      field: "microchip_implanted_at",
      oldVal: existing.microchipImplantedAt,
      newVal: parsed.microchipImplantedAt,
    },
    {
      field: "microchip_implanted_by",
      oldVal: existing.microchipImplantedBy,
      newVal: parsed.microchipImplantedBy,
    },
    {
      field: "microchip_location",
      oldVal: existing.microchipLocation,
      newVal: parsed.microchipLocation,
    },
    {
      field: "estimated_weight_kg",
      oldVal: existing.estimatedWeightKg,
      newVal: parsed.estimatedWeightKg,
    },
    {
      field: "favourite_foods",
      oldVal: existing.favouriteFoods,
      newVal: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
    },
    {
      field: "known_allergies",
      oldVal: existing.knownAllergies,
      newVal: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
    },
    { field: "training_level", oldVal: existing.trainingLevel, newVal: parsed.trainingLevel },
    {
      field: "potentially_dangerous_breed",
      oldVal: existing.potentiallyDangerousBreed,
      newVal: potentiallyDangerousBreed,
    },
    {
      field: "insurance_company",
      oldVal: existing.insuranceCompany,
      newVal: parsed.insuranceCompany,
    },
    {
      field: "insurance_policy_number",
      oldVal: existing.insurancePolicyNumber,
      newVal: parsed.insurancePolicyNumber,
    },
    {
      field: "jurisdiction_province",
      oldVal: existing.jurisdictionProvince,
      newVal: parsed.jurisdictionProvince,
    },
    {
      field: "jurisdiction_locality",
      oldVal: existing.jurisdictionLocality,
      newVal: parsed.jurisdictionLocality,
    },
    {
      field: "acquisition_method",
      oldVal: existing.acquisitionMethod,
      newVal: parsed.acquisitionMethod,
    },
  ];

  return fields
    .filter((f) => JSON.stringify(f.oldVal) !== JSON.stringify(f.newVal))
    .map((f) => ({ field: f.field, old: f.oldVal, new: f.newVal }));
}
