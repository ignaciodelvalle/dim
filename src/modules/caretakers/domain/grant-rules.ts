// Designation rules for a temporary caretaker grant — pure functions.
//
// No DB, no Next.js, no clock: `now` is a parameter. The cron and the
// designation action both call this, and a rule that reads `new Date()`
// internally is a rule whose boundaries cannot be tested.
//
// WHY THE MAXIMUM LIVES HERE AND NOT IN SQL: design decision E3. A CHECK
// constraint on a forward-only migration is an immutable commitment to a
// product number. `pet_caretaker_grants` enforces only `ends_at > starts_at`;
// the 180-day cap is this file's job, and __tests__/grant-rules.test.ts pins
// the number so it cannot drift in silence.

import { type DomainResult, MAX_GRANT_DURATION_DAYS } from "./types";

export type DesignationRejectionReason =
  /** The titular named themselves. The DB has a backstop CHECK; this is the message. */
  | "self-designation"
  /** Neither an invitee user id nor a usable email. */
  | "missing-invitee"
  /** `endsAt <= startsAt` — an arrangement with no duration. */
  | "invalid-period"
  /** Longer than MAX_GRANT_DURATION_DAYS. */
  | "over-max-duration"
  /** The arrangement would already be over before it started. */
  | "end-in-past";

export type ValidateDesignationInput = {
  titularUserId: string;
  /** Resolved account id of the invitee, or null when we only have an email. */
  inviteeUserId: string | null;
  /** Raw email as typed by the titular. Trimmed here, not by the caller. */
  inviteeEmail: string | null;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  maxDurationDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validates a designation before any row is written.
 *
 * Rule ORDER is deliberate and asserted by a test: identity problems are
 * reported before period problems, because "you cannot name yourself" points
 * the titular at the field they must actually change, while "the period is
 * invalid" would send them to fix the wrong one.
 */
export function validateDesignation(
  input: ValidateDesignationInput,
): DomainResult<DesignationRejectionReason> {
  const email = input.inviteeEmail?.trim() ?? "";
  const hasInvitee = Boolean(input.inviteeUserId) || email.length > 0;

  if (input.inviteeUserId && input.inviteeUserId === input.titularUserId) {
    return {
      ok: false,
      reason: "self-designation",
      error: "No podés designarte a vos mismo/a como cuidador/a.",
    };
  }

  if (!hasInvitee) {
    return {
      ok: false,
      reason: "missing-invitee",
      error: "Indicá a quién querés designar como cuidador/a.",
    };
  }

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    return {
      ok: false,
      reason: "invalid-period",
      error: "La fecha de fin tiene que ser posterior a la de inicio.",
    };
  }

  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  if (durationMs > input.maxDurationDays * MS_PER_DAY) {
    return {
      ok: false,
      reason: "over-max-duration",
      error: `El período máximo de cuidado es de ${input.maxDurationDays} días.`,
    };
  }

  if (input.endsAt.getTime() <= input.now.getTime()) {
    return {
      ok: false,
      reason: "end-in-past",
      error: "La fecha de fin ya pasó. Elegí una fecha futura.",
    };
  }

  return { ok: true };
}

export { MAX_GRANT_DURATION_DAYS };
