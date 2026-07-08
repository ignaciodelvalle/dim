// P4 plausibility layer — shared IMPOSSIBLE-date guard for event writers.
//
// PO-approved semantics (2026-07-08):
//   IMPOSSIBLE → reject (this helper):
//     - occurred_at in the future, beyond a small clock-skew tolerance.
//     - occurred_at before the pet's known date_of_birth.
//   SUSPICIOUS → warn-but-allow (NOT this helper — see the same-day duplicate
//     check in src/modules/events/actions.ts for vaccination/deworming).
//
// Pure function — no DB access. Callers (the events action edge) map the
// returned error code to es-AR copy consistent with their own action's
// existing error strings, and are responsible for fetching pet.dateOfBirth.

/** Tolerance for client/server clock skew — a device a few minutes fast must
 * not bounce a legitimate "just now" submission. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type PlausibilityErrorCode = "FUTURE_DATE" | "BEFORE_BIRTH";

export type AssertOccurredAtPlausibleInput = {
  occurredAt: Date;
  /** pets.date_of_birth — "YYYY-MM-DD" (Drizzle `date` column, string mode) or null/undefined when unknown. */
  petDateOfBirth?: string | null;
  /** Injectable for tests; defaults to the real wall clock. */
  now?: Date;
};

export type AssertOccurredAtPlausibleResult =
  | { ok: true }
  | { ok: false; error: PlausibilityErrorCode };

export function assertOccurredAtPlausible(
  input: AssertOccurredAtPlausibleInput,
): AssertOccurredAtPlausibleResult {
  const { occurredAt, petDateOfBirth, now = new Date() } = input;

  if (occurredAt.getTime() - now.getTime() > CLOCK_SKEW_TOLERANCE_MS) {
    return { ok: false, error: "FUTURE_DATE" };
  }

  if (petDateOfBirth) {
    // Parsed the same way parseDateInput (lib/utils/format.ts) treats a plain
    // "YYYY-MM-DD" input: noon UTC, so a same-day event never trips this on a
    // TZ boundary technicality.
    const dob = new Date(`${petDateOfBirth}T12:00:00Z`);
    if (!Number.isNaN(dob.getTime()) && occurredAt.getTime() < dob.getTime()) {
      return { ok: false, error: "BEFORE_BIRTH" };
    }
  }

  return { ok: true };
}
