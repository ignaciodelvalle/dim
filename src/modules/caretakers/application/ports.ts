// The repository PORT the caretaker use-cases talk to.
//
// Declared in the application layer, implemented by
// infrastructure/caretakers-repository.ts (`satisfies CaretakersRepositoryPort`).
// The dependency points inward: application knows the port, infrastructure
// knows the port, application does NOT know infrastructure. That is what lets
// every use-case test run in the fast `unit` vitest project with a plain object
// literal for a repository — no Drizzle, no database, no serial execution.
//
// No Drizzle row types leak through here on purpose: each method returns the
// narrow shape the use-cases actually read. A `typeof pets.$inferSelect` in a
// port signature would drag @/db into the application layer's import graph and
// move every test in this module into the `db` project.

import type { GrantEndOutcome, GrantStatus } from "../domain/types";

/** The subset of a `pet_caretaker_grants` row the use-cases read. */
export type GrantRow = {
  id: string;
  publicToken: string;
  petId: string;
  grantedByUserId: string;
  caretakerUserId: string | null;
  caretakerEmail: string;
  status: GrantStatus;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  ownershipId: string | null;
  reminderSentAt: Date | null;
  publicContactConsentAt: Date | null;
};

/** Minimal pet identity for copy and CTA links. Never the whole row. */
export type PetSummary = {
  id: string;
  publicToken: string;
  name: string;
  /**
   * Storage path of the primary photo, or null. Deliberately the PATH and not a
   * URL: signing/prefixing is a storage concern (lib/infra/storage.ts), and a
   * port that returned a URL would drag that decision — and its base-URL
   * environment variable — into the application layer's tests.
   *
   * Read by the `/cuidado/{token}` invitation page, which the spec requires to
   * show the pet's photo: an invitation to care for an animal you cannot see is
   * a form, not a decision.
   */
  primaryPhotoStoragePath: string | null;
};

export type InsertGrantArgs = {
  petId: string;
  grantedByUserId: string;
  caretakerUserId: string | null;
  caretakerEmail: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  now: Date;
};

export type AcceptGrantArgs = {
  grantId: string;
  petId: string;
  caretakerUserId: string;
  grantPublicToken: string;
  endsAt: Date;
  note: string | null;
  /**
   * KEY 2 of the two-key public-contact model (PO 2026-08-19). `true` writes
   * `public_contact_consent_at`; `false` leaves it NULL. Captured HERE and
   * nowhere else, in the same UPDATE as the status flip — the CHECK constraint
   * forbids a consent timestamp on a `pending` row, so a second UPDATE would
   * have to violate it on the way through.
   */
  publicContactConsent: boolean;
  now: Date;
};

export type EndGrantArgs = {
  grantId: string;
  petId: string;
  ownershipId: string;
  outcome: GrantEndOutcome;
  endsAt: Date;
  /** Who is recorded as the author of `caretaker_ended`. Null for the cron. */
  actorUserId: string | null;
  now: Date;
};

export type UpdateGrantStatusArgs = {
  grantId: string;
  status: GrantStatus;
  /**
   * Concurrency guard, the `expirePetTransfers` shape: the UPDATE only fires
   * while the row is STILL in this status. Zero rows back means another writer
   * (a concurrent accept, or the cron) resolved it first.
   */
  expectedStatus: GrantStatus;
  respondedAt: Date | null;
  now: Date;
};

/** One accepted grant that has passed its `ends_at`, as the cron sees it. */
export type ExpirableGrant = GrantRow & { ownershipId: string };

/**
 * The last arrangement on a pet that actually ENDED, narrowed to what the
 * titular's cockpit needs to explain the absence.
 *
 * Separate from `GrantRow` because `ended_at` / `ended_reason` are only ever
 * set on a terminal row: widening `GrantRow` with two fields that are NULL for
 * every live grant would make every use-case read them defensively.
 */
export type EndedGrant = {
  id: string;
  publicToken: string;
  caretakerUserId: string | null;
  /** When the arrangement was DUE to end — what the copy shows. */
  endsAt: Date;
  /** When it actually closed. Drives the "is this still news?" window. */
  endedAt: Date;
  endedReason: GrantEndOutcome | null;
};

export interface CaretakersRepositoryPort {
  // --- reads ---------------------------------------------------------------
  findGrantByToken(publicToken: string): Promise<GrantRow | null>;
  findGrantByIdForUpdate(grantId: string, tx: unknown): Promise<GrantRow | null>;
  /** The `pending` OR `accepted` grant for a pet, if any. At most one of each. */
  findOpenGrantsForPet(petId: string): Promise<GrantRow[]>;
  /**
   * The most recently ENDED arrangement on this pet, or null.
   *
   * `ended` only — not `rejected`/`cancelled`/`expired`. Those three never
   * became an arrangement, so there is no access to have lapsed and nothing for
   * the cockpit to explain.
   */
  findLastEndedGrantForPet(petId: string): Promise<EndedGrant | null>;
  findPetSummaryById(petId: string): Promise<PetSummary | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  findDisplayName(userId: string): Promise<string | null>;
  findEmailByUserId(userId: string): Promise<string | null>;

  // --- cron scans ----------------------------------------------------------
  findExpirableInvitations(before: Date, limit?: number): Promise<GrantRow[]>;
  findExpirableGrants(now: Date, limit?: number): Promise<ExpirableGrant[]>;
  findGrantsNeedingReminder(now: Date, windowEnd: Date, limit?: number): Promise<GrantRow[]>;
  markReminderSent(grantId: string, now: Date): Promise<number>;

  // --- writes --------------------------------------------------------------
  insertGrant(args: InsertGrantArgs): Promise<{ id: string; publicToken: string }>;
  updateGrantStatus(args: UpdateGrantStatusArgs, tx?: unknown): Promise<number>;
  /**
   * ATOMIC. Writes the `ownerships(role='caretaker')` row, the
   * `caretaker_designated` event and the grant UPDATE inside ONE transaction.
   * A caretaker with access and no event is a hole in the spine; an event with
   * no access is a lie in it. Neither may exist alone.
   */
  insertAcceptGrant(args: AcceptGrantArgs, tx: unknown): Promise<{ ownershipId: string }>;
  /** ATOMIC. Closes the ownership row, emits `caretaker_ended`, ends the grant. */
  insertEndGrant(args: EndGrantArgs, tx: unknown): Promise<{ ended: boolean }>;
}
