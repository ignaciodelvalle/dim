// Plain DTOs and value-shapes for the pets domain layer.
// Zero external imports — this file must not pull in Drizzle, Next.js, or @/db.

import type { PermanentCondition } from "@/lib/reference/permanent-conditions";

// ---------------------------------------------------------------------------
// Acquisition method (also used in form parsing)
// ---------------------------------------------------------------------------

export type AcquisitionMethod =
  | "adopted"
  | "purchased"
  | "found_stray"
  | "gift"
  | "born_in_litter"
  | "other";

// ---------------------------------------------------------------------------
// Parsed form DTO (output of parsePetForm — pure)
// ---------------------------------------------------------------------------

export type ParsedPet = {
  name: string;
  species: string;
  sex: "male" | "female" | "unknown";
  breed: string | null;
  dateOfBirth: string | null;
  birthDateIsEstimated: boolean;
  color: string | null;
  microchipId: string | null;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
  estimatedWeightKg: string | null;
  favouriteFoods: string[];
  knownAllergies: string[];
  trainingLevel: "none" | "basic" | "intermediate" | "advanced" | "professional" | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  acquisitionMethod: AcquisitionMethod | null;
  emergencyInfoVisible: boolean;
  permanentConditions: PermanentCondition[];
  permanentConditionsOther: string | null;
  discloseConditionsPublicly: boolean;
  custodyKind: "owner" | "foster_in_transit";
};

// ---------------------------------------------------------------------------
// Action form state (re-homed from app/actions/pets.ts)
// ---------------------------------------------------------------------------

/**
 * The return type for create/update pet server actions.
 * Re-homed here so consumers can import from domain instead of app/actions.
 * Kept as-is for backward compatibility — WU-4 will update consumers.
 */
export type NewPetFormState = {
  error: string | null;
  /** N3 post-action navigation — client performs full-page nav (see useActionRedirect). */
  redirectTo?: string | null;
  // Present when a chip cross-check found an active match (WARN state).
  // Only relevant for acquisitionMethod='found_stray'. The UI should show the
  // conflict and offer "continue anyway" backed by forceToken.
  warning?: "CHIP_MATCH_ACTIVE";
  matchedPetToken?: string;
  forceToken?: string;
  // Soft same-owner dedupe (data-quality gate P2). Non-blocking: set when the
  // caller already has an ACTIVE owned pet with the same normalized name +
  // species + sex. The form renders an inline "¿es la misma?" confirmation and
  // lets the owner either open the existing pet or resubmit with
  // duplicateOverride=1 to create anyway.
  duplicatePrompt?: {
    name: string;
    species: string;
    sex: "male" | "female" | "unknown";
    publicToken: string;
  };
};

// ---------------------------------------------------------------------------
// Repository input types (pre-resolved at action layer)
// ---------------------------------------------------------------------------

/**
 * Input to the RegisterPet use-case.
 * Contains already-resolved values (canonical jurisdiction, normalized chip,
 * ppp flag, upload result) so the use-case stays DB-focused.
 */
export type RegisterPetInput = {
  parsed: ParsedPet;
  potentiallyDangerousBreed: boolean;
  uploadedPath: string | null;
  uploadMimeType: string | null;
  uploadSize: number | null;
  /**
   * Double-submit idempotency guard (projection-writes audit §6). Stable UUID
   * per form session, posted as a hidden field by the alta wizard. When set,
   * a re-submit that finds an existing pet_registered event with this key does
   * NOT create a second pet — it resolves to the already-created one.
   */
  clientIdempotencyKey: string | null;
};

/**
 * Input to the UpdatePet use-case.
 */
export type UpdatePetInput = {
  petId: string;
  parsed: ParsedPet;
  potentiallyDangerousBreed: boolean;
  uploadedPath: string | null;
  uploadMimeType: string | null;
  uploadSize: number | null;
};
