// Pure domain rules for the 10-day rabies observation lifecycle.
//
// Legal framework:
//   - Decreto 4669/1973 (Provincia de Buenos Aires) — 10-day in-situ or
//     official-site observation for biting animals.
//   - Ordenanza CABA 41.831/1987 — analogous in CABA.
//   - Resolución MS 1144/2018 — national rabies prevention guidance, APR protocol.
//
// Zero runtime imports — this file is pure domain logic.
// @/db/schema type-only imports are allowed for Drizzle row shapes used by
// the repository layer; none are needed here.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RABIES_OBSERVATION_DAYS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Outcomes available to professional closure (vet/govt/admin).
// NOT available to owner closure (which is hardcoded to 'negative').
export const PROFESSIONAL_OUTCOMES: readonly RabiesObservationOutcome[] = [
  "negative",
  "positive_rabies",
  "dead",
  "lost_to_followup",
];

// ---------------------------------------------------------------------------
// State machine helpers
// ---------------------------------------------------------------------------

/**
 * Maps a terminal observation outcome to the denormalized pets column state.
 * Keeps the state machine transition table in one place.
 */
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

// ---------------------------------------------------------------------------
// Date arithmetic
// ---------------------------------------------------------------------------

/**
 * Add the observation window (calendar days) to the bite date.
 * Uses setDate (calendar day arithmetic) — NOT +240h — so DST transitions
 * do not shift the closure date.
 *
 * A1 (2026-08-16): `days` defaults to the statutory national baseline, but the
 * bite writers now pass the per-jurisdiction `rabies_observation_window` rule
 * resolved at report time — the dashboard was already measuring against that
 * rule while this arithmetic hardcoded 10, the exact split-brain Lote A closes.
 *
 * Returns a new Date; does NOT mutate the input.
 */
export function computeObservationUntil(
  biteOccurredAt: Date,
  days: number = RABIES_OBSERVATION_DAYS,
): Date {
  const due = new Date(biteOccurredAt);
  due.setDate(due.getDate() + days);
  return due;
}

/**
 * T4.13 (2026-08-01): the closure deadline is ALWAYS computable — never
 * genuinely absent — but the `rabies_observation_started` payload's
 * `observation_until` field is missing (or malformed) on older/seed
 * observations. Falling back to null there used to read as "no deadline",
 * hiding the exact date the law obligates. This is the ONE fallback rule,
 * extracted so it cannot drift between the two places it applies:
 *   - the auto-close sweep (close-eligible-observations.ts), where a missing
 *     deadline would stall a pet in EN CURSO forever, and
 *   - the /admin/observaciones list, where it fed a bare "no Cierre estimado
 *     shown" instead of the computable date.
 *
 * @param rawObservationUntil - The payload's `observation_until` value, as
 *   read off the event (`unknown` because payload fields are untyped JSON).
 * @param startedAt - The observation's `occurredAt` — the fallback anchor.
 */
export function resolveObservationDeadline(rawObservationUntil: unknown, startedAt: Date): Date {
  const parsed =
    typeof rawObservationUntil === "string" || rawObservationUntil instanceof Date
      ? new Date(rawObservationUntil)
      : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : computeObservationUntil(startedAt);
}

// ---------------------------------------------------------------------------
// Vaccine validity predicate
// ---------------------------------------------------------------------------

/**
 * Shape of the latest vaccination event row supplied by the repository.
 * The repository queries vaccination_administered events for this pet
 * whose vaccine_name matches the rabies regex, ordered desc by occurredAt,
 * limit 1. Returns null when no such row exists.
 */
export type LatestVaccineEvent = {
  occurredAt: Date;
  payload: Record<string, unknown>;
};

/**
 * Pure predicate: was the most recent rabies vaccine still valid at the
 * moment of the bite?
 *
 * Mirrors the SQL + JS logic in app/actions/bite.ts exactly:
 *   1. null → false (no vaccine on record).
 *   2. vaccine_name must match ~* '(antirr[áa]bica|rabies)' regex — if
 *      not, the caller passed the wrong event (callers must pre-filter),
 *      but we guard here for purity.
 *   3. next_due_at present & valid → return next_due_at > biteDate.
 *   4. Fallback: administered + 1yr (setFullYear) > biteDate.
 *   5. Invalid occurredAt → false.
 *
 * The regex is case-insensitive (i flag) matching the Postgres ~* operator.
 */
const RABIES_VACCINE_NAME_REGEX = /antirr[áa]bica|rabies/i;

export function isRabiesVaccineValid(
  latestEvent: LatestVaccineEvent | null,
  biteDate: Date,
): boolean {
  if (!latestEvent) return false;

  // Guard: vaccine_name must match the rabies regex.
  const vaccineName = latestEvent.payload.vaccine_name;
  if (typeof vaccineName !== "string" || !RABIES_VACCINE_NAME_REGEX.test(vaccineName)) {
    return false;
  }

  // next_due_at branch — use if present and parseable.
  const nextDueAt = latestEvent.payload.next_due_at;
  if (typeof nextDueAt === "string") {
    const due = new Date(nextDueAt);
    if (Number.isFinite(due.getTime())) {
      return due > biteDate;
    }
  }

  // Fallback: assume valid for 1 year from administered date (setFullYear).
  const administered = new Date(latestEvent.occurredAt);
  if (!Number.isFinite(administered.getTime())) return false;
  const oneYearLater = new Date(administered);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return oneYearLater > biteDate;
}
