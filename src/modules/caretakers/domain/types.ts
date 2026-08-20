// Plain DTOs and value-shapes for the caretakers domain layer.
//
// ZERO external imports. This file must not pull in Drizzle, Next.js or @/db —
// the biome fence bans `next/*` and `server-only` under application/**, and the
// dependency-direction linter bans importing another module. The shapes that
// look like they belong to `pets` (NewNotification, UseCaseResult) are MIRRORED
// here on purpose; see application/types.ts and the module README.

// ---------------------------------------------------------------------------
// Grant lifecycle
// ---------------------------------------------------------------------------

/**
 * The workflow states of a `pet_caretaker_grants` row.
 *
 * `pending` is workflow state, not a fact about the animal — there is no
 * `caretaker_proposed` event. Only `accepted` has a spine representation
 * (`caretaker_designated`), and only `ended` emits `caretaker_ended`.
 */
export const GRANT_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "expired",
  "ended",
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/**
 * Why an ACCEPTED grant stopped being active. Rides the `caretaker_ended`
 * payload as `outcome` — deliberately NOT `reason`, because erase_subject_data
 * sentinel-redacts the key `reason` across every event type (see
 * lib/events/caretaker-event-schemas.ts).
 */
export const GRANT_END_OUTCOMES = [
  "returned",
  "expired",
  "revoked_by_owner",
  "withdrawn_by_caretaker",
] as const;
export type GrantEndOutcome = (typeof GRANT_END_OUTCOMES)[number];

/**
 * Maximum length of a caretaker arrangement, in days. PO decision, settled.
 *
 * Enforced in the DOMAIN ONLY (design decision E3): a
 * `CHECK ((ends_at - starts_at) <= interval '180 days')` would be a
 * forward-only, immutable commitment to a product number in a migration that
 * can never be edited. `pet_caretaker_grants` keeps only `ends_at > starts_at`.
 * That makes this constant the single fence — hence the test that pins it.
 */
export const MAX_GRANT_DURATION_DAYS = 180;

/** How long an unanswered invitation stays open before the cron expires it. */
export const GRANT_INVITATION_EXPIRY_DAYS = 7;

/** How many days before `ends_at` both parties get the "renew or let it end" nudge. */
export const GRANT_REMINDER_LEAD_DAYS = 3;

// ---------------------------------------------------------------------------
// Shared domain result
// ---------------------------------------------------------------------------

/**
 * A rejection carries BOTH a machine-readable `reason` and the es-AR `error`
 * the user reads. The reason is what tests assert on (copy changes should not
 * break a rule test); the error is what the action returns.
 */
export type DomainRejection<R extends string> = { ok: false; reason: R; error: string };

export type DomainResult<R extends string> = { ok: true } | DomainRejection<R>;
