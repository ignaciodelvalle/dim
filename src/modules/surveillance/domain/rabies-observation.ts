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
  | "window_expired_unclosed"
  | "completed_negative"
  | "completed_positive_rabies"
  | "completed_dead"
  | "completed_lost_to_followup";

export const RABIES_OBSERVATION_STATUSES = [
  "in_progress",
  "window_expired_unclosed",
  "completed_negative",
  "completed_positive_rabies",
  "completed_dead",
  "completed_lost_to_followup",
] as const satisfies readonly RabiesObservationStatus[];

/**
 * `window_expired_unclosed` — the statutory window elapsed and NOBODY with a
 * clinical mandate asserted an outcome (PO decision 2026-08-17, engram
 * roadmap/decisiones-legales-flujos-2026-08-17 item 1).
 *
 * WHY THE STATE EXISTS. Until 2026-08-17 the daily sweep closed the observation
 * as `completed_negative` with `recordedByUserId: null`, `authorRole: "system"`,
 * `authorVerified: false`, and the owner of the biting animal could close it the
 * same way. Both wrote the State's own document asserting a bitten person's
 * exposure was clear — an assertion neither actor is competent to make. Removing
 * those two paths without a landing state would have left the observation open
 * forever: the credential's public banner never clears, and the owner has no
 * remedy. That is a different harm, not an acceptable side effect.
 *
 * WHAT IT ASSERTS. Nothing clinical, in either direction. It is a fact about the
 * PROCESS: the window closed, no matriculated closure arrived. It is a
 * NON-TERMINAL state — a professional close still transitions it into one of the
 * `completed_*` values, and the bite case stays OPEN so the sanitary authority
 * keeps seeing it as work.
 *
 * WHY NO NEW EVENT TYPE. `pet_events` records ACTS and OBSERVATIONS by an
 * author. Nothing happened here: the state is the passage of time over facts the
 * spine already holds (`rabies_observation_started.observation_until`, and the
 * absence of a `rabies_observation_ended`). Minting an event would require
 * inventing an author for a non-act — the exact lie this change deletes. See
 * lib/projections/pet-rabies-observation.ts for how the cache and the spine
 * stay reconciled.
 */
export const OBSERVATION_WINDOW_EXPIRED_UNCLOSED = "window_expired_unclosed" as const;

/**
 * Statuses in which an observation is still OPEN — no clinical outcome has been
 * asserted by anyone. Both block a second concurrent observation, both keep the
 * pet in the authority's queue, and both admit a professional close.
 */
export const OPEN_OBSERVATION_STATUSES = [
  "in_progress",
  "window_expired_unclosed",
] as const satisfies readonly RabiesObservationStatus[];

/** True when the pet has an observation that nobody has clinically closed yet. */
export function isObservationOpen(status: string | null | undefined): boolean {
  return status === "in_progress" || status === "window_expired_unclosed";
}

export type RabiesObservationOutcome = "negative" | "positive_rabies" | "dead" | "lost_to_followup";

// Outcomes available to professional closure (admin/govt sanitary authority).
// Since 2026-08-17 this is the ONLY way an outcome enters the record: neither
// the cron nor the owner may assert one.
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
/**
 * The window that was ACTUALLY applied to this observation, in days, as recorded
 * by the writer in `rabies_observation_started.observation_days` (field added
 * 2026-08-17).
 *
 * Returns null for observations written before that field existed. Callers MUST
 * NOT substitute RABIES_OBSERVATION_DAYS there: quoting "10 días" at an owner
 * whose jurisdiction runs a 14-day rule is precisely the defect this field was
 * added to end. When it is null, phrase the copy around the DEADLINE DATE
 * (resolveObservationDeadline), which is always computable and always true.
 */
export function resolveObservationWindowDays(rawObservationDays: unknown): number | null {
  const n =
    typeof rawObservationDays === "number"
      ? rawObservationDays
      : typeof rawObservationDays === "string"
        ? Number.parseInt(rawObservationDays, 10)
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
