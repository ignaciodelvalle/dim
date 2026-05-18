// Constants and helpers for the 10-day rabies observation lifecycle.
//
// Hardcoded per:
//   - Decreto 4669/1973 (Provincia de Buenos Aires) — 10-day in-situ or
//     official-site observation for biting animals.
//   - Ordenanza CABA 41.831/1987 — analogous in CABA.
//   - Resolución MS 1144/2018 — national rabies prevention guidance, defines
//     post-exposure protocol (APR).
//
// If any jurisdiction ever changes the period, update the constant here and
// the schema/UI labels follow.

export const RABIES_OBSERVATION_DAYS = 10;

export type RabiesObservationStatus =
  | "in_progress"
  | "completed_negative"
  | "completed_positive_rabies"
  | "completed_dead"
  | "completed_lost_to_followup";

export const RABIES_OBSERVATION_STATUSES = [
  "in_progress",
  "completed_negative",
  "completed_positive_rabies",
  "completed_dead",
  "completed_lost_to_followup",
] as const satisfies readonly RabiesObservationStatus[];

export type RabiesObservationOutcome = "negative" | "positive_rabies" | "dead" | "lost_to_followup";

// Maps the terminal observation outcome to the denormalized pets column state.
export function outcomeToStatus(outcome: RabiesObservationOutcome): RabiesObservationStatus {
  switch (outcome) {
    case "negative":
      return "completed_negative";
    case "positive_rabies":
      return "completed_positive_rabies";
    case "dead":
      return "completed_dead";
    case "lost_to_followup":
      return "completed_lost_to_followup";
  }
}

// Add RABIES_OBSERVATION_DAYS calendar days to the bite date. Day arithmetic
// (setDate) is correct here — we want "10 calendar days later", not "240 hours
// later" — so DST transitions don't shift the closure date.
export function computeObservationUntil(biteOccurredAt: Date): Date {
  const due = new Date(biteOccurredAt);
  due.setDate(due.getDate() + RABIES_OBSERVATION_DAYS);
  return due;
}
