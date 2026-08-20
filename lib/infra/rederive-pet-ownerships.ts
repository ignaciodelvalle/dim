// Re-derivation harness for the CARETAKER half of the `ownerships` cache.
//
// A SIBLING TO rederive-pet-cache.ts, not an extension of it (design F).
// That module answers "does this `pets` column agree with the spine?" and
// returns `Record<column, {stored, derived}>`; both of its consumers are
// written against that shape. A caretaker arrangement is not a column — it is a
// SET OF ROWS WITH A LIFECYCLE — so it gets its own shape here rather than
// distorting a working abstraction and the two things that read it.
//
// THE GAP THIS CLOSES, and the one it does NOT
// ---------------------------------------------------------------------------
// Before this file, `ownerships` had NO drift detection at all — not for
// caretaker, and not for owner / foster / shelter_custody either. That is worth
// stating plainly because it means the change proposal's success criterion
// ("drift detection is clean") would have passed VACUOUSLY: the harness had
// nothing to say about ownership rows, so it could only ever say clean.
//
// What is covered here: `role='caretaker'` rows, against
// `caretaker_designated` / `caretaker_ended`.
//
// What is NOT, and is logged as a finding for the integrity plan rather than
// half-fixed: every other ownership role. Replaying `owner` alone means
// modelling custody_transferred, adoption_finalized, decomiso, free-claim and
// chip-match — a much larger change that this one must not absorb silently. A
// pet's `owner` row today has no derivation behind it, so a harness that
// reported on it would mark the entire corpus as drifted.
//
// THE TWO FAILURES IT LOOKS FOR ARE NOT SYMMETRIC:
//   - a row with no event → somebody has real write access to an animal and
//     nothing in the append-only log explains why. A security fact.
//   - an event with no row → the spine says an arrangement started and the
//     caretaker cannot act. A broken promise, visible to a user.
// Neither is repairable by a later event, because corrections are new events,
// not edits — which is exactly why they have to be detected.

import { and, asc, eq, inArray } from "drizzle-orm";

import { db, ownerships, petEvents } from "@/db";
import { type CaretakerInterval, replayPetCaretakers } from "@/lib/projections/pet-caretaker";
import type { ProjectionEvent } from "@/lib/projections/types";

/** One `ownerships` row as the harness compares it. */
export type StoredCaretakerRow = {
  id: string;
  role: string;
  caretakerUserId: string | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type RederivePetOwnershipsReport = {
  petId: string;
  /** Intervals replayed from the spine, in start order. */
  derived: CaretakerInterval[];
  /** Active + historical `role='caretaker'` rows, in start order. */
  stored: StoredCaretakerRow[];
  /** Human-readable mismatches. Empty means clean. */
  mismatches: string[];
};

const CARETAKER_EVENT_TYPES = ["caretaker_designated", "caretaker_ended"] as const;

/** Tolerance for comparing a row timestamp with its event timestamp. */
const TIMESTAMP_TOLERANCE_MS = 1000;

type DbOrTx = typeof db;

export async function rederivePetCaretakerOwnerships(
  petId: string,
  client: DbOrTx = db,
): Promise<RederivePetOwnershipsReport> {
  const eventRows = await client
    .select({
      id: petEvents.id,
      eventType: petEvents.eventType,
      occurredAt: petEvents.occurredAt,
      recordedAt: petEvents.recordedAt,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(
      and(eq(petEvents.petId, petId), inArray(petEvents.eventType, [...CARETAKER_EVENT_TYPES])),
    )
    .orderBy(asc(petEvents.occurredAt), asc(petEvents.recordedAt), asc(petEvents.id));

  const derived = orderIntervals(replayPetCaretakers(eventRows as ProjectionEvent[]));

  const storedRows = await client
    .select({
      id: ownerships.id,
      role: ownerships.role,
      caretakerUserId: ownerships.ownerUserId,
      startedAt: ownerships.startedAt,
      endedAt: ownerships.endedAt,
    })
    .from(ownerships)
    .where(and(eq(ownerships.petId, petId), eq(ownerships.role, "caretaker")))
    .orderBy(asc(ownerships.startedAt), asc(ownerships.id));

  const stored = orderRows(storedRows);

  return { petId, derived, stored, mismatches: compare(derived, stored) };
}

export function hasOwnershipDrift(report: RederivePetOwnershipsReport): boolean {
  return report.mismatches.length > 0;
}

/**
 * Both sides are ordered by (startedAt, then endedAt with OPEN last).
 *
 * The `endedAt` tie-break is not decoration: two arrangements that begin in the
 * same second — a designation immediately corrected, say — would otherwise pair
 * up arbitrarily, because the two sides have no shared key to sort by (see
 * `compare`). With the tie-break, the closed one sorts first on BOTH sides.
 * Measured: without it, a fixture that accepted twice at the same instant
 * reported a false mismatch.
 */
function orderIntervals(intervals: CaretakerInterval[]): CaretakerInterval[] {
  return [...intervals].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      endedRank(a.endedAt) - endedRank(b.endedAt) ||
      a.grantId.localeCompare(b.grantId),
  );
}

function orderRows(rows: StoredCaretakerRow[]): StoredCaretakerRow[] {
  return [...rows].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      endedRank(a.endedAt) - endedRank(b.endedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** OPEN sorts last: an arrangement still running began no earlier than a closed one. */
function endedRank(endedAt: Date | null): number {
  return endedAt === null ? Number.POSITIVE_INFINITY : endedAt.getTime();
}

/**
 * Positional comparison, in the order above.
 *
 * NOT keyed on the grant id, because the `ownerships` row does not carry one —
 * the pointer runs the other way (`pet_caretaker_grants.ownership_id`), and
 * reading the grants table here would make this harness depend on the workflow
 * table it is supposed to be able to contradict. At most one caretaker can be
 * active per pet at a time (partial unique index), so position is a sound key.
 *
 * HONEST RESIDUAL: if overlapping caretakers are ever allowed, position stops
 * being sound and this is the first function that has to change.
 */
function compare(derived: CaretakerInterval[], stored: StoredCaretakerRow[]): string[] {
  const mismatches: string[] = [];
  const max = Math.max(derived.length, stored.length);

  for (let i = 0; i < max; i++) {
    const d = derived[i];
    const s = stored[i];

    if (d && !s) {
      mismatches.push(
        `grant ${d.grantId}: caretaker_designated is in the spine but there is no ownership row — the caretaker cannot act on a pet the log says they were given`,
      );
      continue;
    }
    if (s && !d) {
      mismatches.push(
        `ownership ${s.id}: an active-or-historical caretaker row with no caretaker_designated behind it — somebody holds write access the spine does not explain`,
      );
      continue;
    }
    if (!d || !s) continue;

    if (s.caretakerUserId !== d.caretakerUserId) {
      mismatches.push(
        `ownership ${s.id}: row names ${s.caretakerUserId} but grant ${d.grantId} designated ${d.caretakerUserId}`,
      );
    }
    if (!sameInstant(s.startedAt, d.startedAt)) {
      mismatches.push(
        `ownership ${s.id}: started_at ${iso(s.startedAt)} does not match the designation at ${iso(d.startedAt)}`,
      );
    }
    if ((s.endedAt === null) !== (d.endedAt === null)) {
      mismatches.push(
        `ownership ${s.id}: ended_at ${s.endedAt === null ? "is open" : `is ${iso(s.endedAt)}`} but the spine says ${
          d.endedAt === null ? "the arrangement is still open" : `it ended at ${iso(d.endedAt)}`
        }`,
      );
    } else if (s.endedAt && d.endedAt && !sameInstant(s.endedAt, d.endedAt)) {
      mismatches.push(
        `ownership ${s.id}: ended_at ${iso(s.endedAt)} does not match caretaker_ended at ${iso(d.endedAt)}`,
      );
    }
  }

  return mismatches;
}

/**
 * Timestamps are written in the same transaction from the same `now`, so they
 * should be identical — but a tolerance keeps the harness from reporting drift
 * on a sub-second clock difference, which would be noise rather than a finding.
 */
function sameInstant(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= TIMESTAMP_TOLERANCE_MS;
}

function iso(value: Date | null): string {
  return value ? value.toISOString() : "null";
}
