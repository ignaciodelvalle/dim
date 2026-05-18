// Foster matching — pure scoring helper for the volunteer pool (spec
// foster-volunteers-pool v1.4 §11). Given a pet and a volunteer's
// preferences, computes (1) a 0..100 match score and (2) a list of human-
// readable warnings the org member sees in the proposal UI and that get
// snapshotted into the `foster_proposals.match_warnings` jsonb column.
//
// Pure function: no DB access. Caller (proposeFosterAction / searchFosterVolunteers)
// supplies the pet shape it derived from the pets row.
//
// `hasChronic` is opaque: v1 callers pass false unconditionally. A future
// surface that computes "is this pet under chronic treatment?" from the
// libreta can flip it without touching this file.
//
// `ageMonths` likewise opaque: caller derives it from pet.date_of_birth.
// When unknown, the age check is skipped (warnings stay silent).

import type { FosterVolunteer } from "@/db/schema";

export type MatchWarning = {
  kind:
    | "species_mismatch"
    | "size_mismatch"
    | "age_mismatch"
    | "health_mismatch"
    | "ppp_mismatch"
    | "duration_mismatch";
  message: string;
};

export type MatchScoreResult = {
  score: number;
  warnings: MatchWarning[];
};

export type MatchPet = {
  species: string; // "dog" | "cat" | other free-form species
  estimatedWeightKg?: number | null;
  ageMonths?: number | null;
  isPpp: boolean;
  hasChronic?: boolean;
};

export function computeMatch(
  pet: MatchPet,
  volunteer: Pick<
    FosterVolunteer,
    | "acceptsDogs"
    | "acceptsCats"
    | "acceptsOtherSpecies"
    | "acceptsSizeSmall"
    | "acceptsSizeMedium"
    | "acceptsSizeLarge"
    | "acceptsPuppies"
    | "acceptsSeniors"
    | "acceptsChronicConditions"
    | "acceptsDangerousBreeds"
    | "maxDurationWeeks"
  >,
  proposedDurationWeeks?: number | null,
): MatchScoreResult {
  const warnings: MatchWarning[] = [];
  let score = 100;

  // Species — three buckets: dog / cat / "other" anything else.
  const speciesLower = pet.species.toLowerCase();
  if (speciesLower === "dog") {
    if (!volunteer.acceptsDogs) {
      warnings.push({
        kind: "species_mismatch",
        message: "El voluntario no acepta perros.",
      });
      score -= 30;
    }
  } else if (speciesLower === "cat") {
    if (!volunteer.acceptsCats) {
      warnings.push({
        kind: "species_mismatch",
        message: "El voluntario no acepta gatos.",
      });
      score -= 30;
    }
  } else {
    if (!volunteer.acceptsOtherSpecies) {
      warnings.push({
        kind: "species_mismatch",
        message: "El voluntario no acepta otras especies.",
      });
      score -= 30;
    }
  }

  // Size — only meaningful for dogs (cats and "other" don't have a size axis).
  if (speciesLower === "dog" && pet.estimatedWeightKg != null) {
    const w = pet.estimatedWeightKg;
    if (w > 25 && !volunteer.acceptsSizeLarge) {
      warnings.push({
        kind: "size_mismatch",
        message: `El voluntario no acepta tamaño grande (${w}kg).`,
      });
      score -= 15;
    } else if (w >= 10 && w <= 25 && !volunteer.acceptsSizeMedium) {
      warnings.push({
        kind: "size_mismatch",
        message: `El voluntario no acepta tamaño medio (${w}kg).`,
      });
      score -= 15;
    } else if (w < 10 && !volunteer.acceptsSizeSmall) {
      warnings.push({
        kind: "size_mismatch",
        message: `El voluntario no acepta tamaño chico (${w}kg).`,
      });
      score -= 15;
    }
  }

  // Age. <4mo → puppy. >84mo (7y) → senior.
  if (pet.ageMonths != null) {
    if (pet.ageMonths < 4 && !volunteer.acceptsPuppies) {
      warnings.push({
        kind: "age_mismatch",
        message: "El voluntario no acepta cachorros (menos de 4 meses).",
      });
      score -= 15;
    } else if (pet.ageMonths > 84 && !volunteer.acceptsSeniors) {
      warnings.push({
        kind: "age_mismatch",
        message: "El voluntario no acepta seniors (más de 7 años).",
      });
      score -= 10;
    }
  }

  // Health.
  if (pet.hasChronic === true && !volunteer.acceptsChronicConditions) {
    warnings.push({
      kind: "health_mismatch",
      message: "El voluntario no acepta animales con condiciones crónicas.",
    });
    score -= 15;
  }

  // PPP (perro potencialmente peligroso).
  if (pet.isPpp && !volunteer.acceptsDangerousBreeds) {
    warnings.push({
      kind: "ppp_mismatch",
      message: "El voluntario no marcó aceptar razas PPP.",
    });
    score -= 20;
  }

  // Duration — only applies when both the caller's proposed duration AND the
  // volunteer's maxDurationWeeks are set.
  if (
    proposedDurationWeeks != null &&
    volunteer.maxDurationWeeks != null &&
    proposedDurationWeeks > volunteer.maxDurationWeeks
  ) {
    warnings.push({
      kind: "duration_mismatch",
      message: `Duración propuesta (${proposedDurationWeeks} semanas) excede el máximo del voluntario (${volunteer.maxDurationWeeks} semanas).`,
    });
    score -= 10;
  }

  return { score: Math.max(0, score), warnings };
}

// Helper for callers that need the date-of-birth → age conversion.
// Returns null when dateOfBirth is null or unparseable.
export function ageMonthsFromDob(
  dob: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (dob == null) return null;
  const date = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return null;
  const days = diffMs / (1000 * 60 * 60 * 24);
  return Math.floor(days / 30.4375);
}
