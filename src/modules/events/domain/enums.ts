// Pure domain enums for the events module.
//
// Extracted from app/actions/events.ts inline constants.
// Zero runtime imports — pure constants.

// ---------------------------------------------------------------------------
// Note categories (owner-facing — excludes the reserved "system" category)
// ---------------------------------------------------------------------------

export const NOTE_CATEGORIES = [
  "comportamiento",
  "dieta",
  "grooming",
  "estado_de_animo",
  "otro",
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Clinical sub-kinds (owner-facing — excludes disease_diagnosis used by vets)
// ---------------------------------------------------------------------------

export const CLINICAL_SUB_KINDS = [
  "lab_work",
  "imaging",
  "surgery",
  "allergy_detection",
  "other",
] as const;

export type ClinicalSubKind = (typeof CLINICAL_SUB_KINDS)[number];

// ---------------------------------------------------------------------------
// Dangerous-breed registries
// ---------------------------------------------------------------------------

export const DANGEROUS_BREED_REGISTRIES = ["caba_4078", "prov_14107", "other"] as const;

export type DangerousBreedRegistry = (typeof DANGEROUS_BREED_REGISTRIES)[number];
