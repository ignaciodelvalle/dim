// Pure domain rules for death-record cross-field validation.
//
// Extracted from app/actions/events.ts — createDeathRecordAction validation
// block. Zero runtime imports (pure domain logic). @/db/schema type-only is
// allowed but not needed here.

import { findDisease } from "@/lib/reference/diseases";
import { isReportable } from "@/lib/reference/diseases";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEATH_CAUSES = [
  "known",
  "unknown",
  "natural",
  "disease",
  "accident",
  "euthanasia",
  "sudden",
  "violent",
  "other",
] as const;

export type DeathCause = (typeof DEATH_CAUSES)[number];

export const DISPOSITION_METHODS = [
  "cremation_collective",
  "cremation_individual_ashes",
  "authorized_cemetery",
  "owner_burial",
  "household_waste",
  "rendering",
  "unknown",
] as const;

export type DispositionMethod = (typeof DISPOSITION_METHODS)[number];

export const VET_CONTACT_VALUES = ["yes", "no", "not_applicable"] as const;

export type VetContactValue = (typeof VET_CONTACT_VALUES)[number];

// ---------------------------------------------------------------------------
// Cross-field validation
// ---------------------------------------------------------------------------

export type DeathCrossFieldInput = {
  cause: string;
  dispositionMethod: string | null;
  vetContactedOwner: string | null;
  deathAtClinic: boolean;
  clinicName: string | null;
  vetDecidedAlone: boolean;
  diseaseCode: string | null;
  confirmedByLab: boolean;
};

/**
 * Validate the cross-field constraints for a death record.
 * Returns an error string (Spanish) on failure, or null on success.
 *
 * Pure function — no side effects, no DB calls.
 */
export function validateDeathCrossFields(input: DeathCrossFieldInput): string | null {
  const { cause, vetContactedOwner, deathAtClinic, clinicName, vetDecidedAlone, diseaseCode } =
    input;

  // clinicName requires deathAtClinic
  if (clinicName && !deathAtClinic) {
    return "Indicaste un nombre de clínica pero no marcaste que falleció en una veterinaria.";
  }

  // vetContactedOwner requires deathAtClinic
  if (vetContactedOwner && !deathAtClinic) {
    return "El contacto del veterinario solo aplica si falleció en una veterinaria.";
  }

  // vetDecidedAlone requires vetContactedOwner='no'
  if (vetDecidedAlone && vetContactedOwner !== "no") {
    return "Solo se puede marcar 'vet decidió sin contacto' cuando el veterinario no logró contactar al propietario.";
  }

  // Disease-specific rules (only when cause === "disease")
  if (cause === "disease") {
    if (!diseaseCode) {
      return "Falta el código de enfermedad.";
    }
    if (!findDisease(diseaseCode)) {
      return "Enfermedad no reconocida.";
    }
  }

  return null;
}

/**
 * Resolve whether a death is reportable to health authorities.
 * Only diseases with cause="disease" and a known reportable code qualify.
 */
export function resolveDeathReportable(cause: string, diseaseCode: string | null): boolean {
  if (cause !== "disease") return false;
  return isReportable(diseaseCode);
}
