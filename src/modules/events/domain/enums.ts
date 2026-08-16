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

/**
 * Lote A4 — the registries the attestation SERVER accepts for a pet's
 * jurisdiction: the per-jurisdiction `ppp_attestation_required_registries`
 * rule when a jurisdiction overrode it, the national fallback list otherwise,
 * plus "other" always. Pure mirror of the client's buildRegistryOptions
 * (DangerousBreedAttestationForm) so the form and the action can never offer
 * and accept different sets.
 */
export function allowedAttestationRegistries(resolved: {
  registries: ReadonlyArray<{ id: string }>;
}): Set<string> {
  return new Set<string>([
    ...(resolved.registries.length > 0
      ? resolved.registries.map((r) => r.id)
      : (DANGEROUS_BREED_REGISTRIES as readonly string[]).filter((id) => id !== "other")),
    "other",
  ]);
}
