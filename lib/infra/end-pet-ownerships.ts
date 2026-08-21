// Closing every live ownership row on a pet, without leaving a caretaker
// arrangement half-open.
//
// WHY THIS IS NOT JUST AN UPDATE
// ---------------------------------------------------------------------------
// Most roles are a single row: ending them is `SET ended_at`. `caretaker` is
// three writes that must land together — close the ownership row, emit
// `caretaker_ended`, flip `pet_caretaker_grants.status` to 'ended'. Doing only
// the first leaves a grant that says 'accepted' pointing at a closed row, and
// the consequences are not theoretical:
//
//   - `detect-pet-cache-drift` reports `pet_caretaker_ownership_drift`. Under
//     invariant 3 a cache row the spine cannot explain is the thing the drift
//     harness exists to catch.
//   - The daily expiry cron eventually calls the end path anyway and writes
//     `caretaker_ended` onto whoever owns the pet BY THEN — months later, for
//     an arrangement that person never made.
//   - `caretaker-public-contact.ts` decides the public lost-mode disclosure
//     from the grant ALONE (status='accepted', ends_at in the future, two
//     consent flags) and never joins `ownerships`. The zombie grant keeps
//     publishing a stranger's first name and phone on the new owner's public
//     credential until ends_at.
//
// `insertAdoptionFinalized` closed every live row with one blanket UPDATE and
// hit exactly that. `execute-decomiso` has the same shape. Both now call this.
//
// WHY IT LIVES IN lib/infra AND NOT IN THE CARETAKERS MODULE
// ---------------------------------------------------------------------------
// Two modules need the three-step end, and `caretakers` was built with ZERO
// cross-module edges on purpose (`check-dependency-direction.ts` says so in as
// many words). Importing it from `adoption` would invert that premise;
// duplicating the three steps in lib would leave two copies of an atomic
// invariant, which is the drift this repo keeps paying for. So the primitive
// sits below both, module→lib is always allowed, and
// `CaretakersRepository.insertEndGrant` delegates here rather than holding a
// second copy. One definition, no new edge.

import { and, eq, isNull } from "drizzle-orm";

import { ownerships, petCaretakerGrants, petEvents } from "@/db";
import type { db } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import type { GrantEndOutcome } from "@/src/modules/caretakers/domain/types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EndCaretakerGrantArgs = {
  grantId: string;
  ownershipId: string;
  petId: string;
  outcome: GrantEndOutcome;
  endsAt: Date;
  now: Date;
  actorUserId: string | null;
};

/**
 * THE ATOMIC END, verbatim from where it used to live in the caretakers
 * repository. Close the ownership row, emit `caretaker_ended`, flip the grant —
 * inside the caller's transaction, so a failure takes all three with it.
 *
 * `caretaker_ended` is deliberately NOT a titular-only event type: the cron
 * writes it with no acting user, and a caretaker withdrawing from their own
 * arrangement is legitimate. Only the DESIGNATION is titular-only.
 */
export async function endCaretakerGrantAtomically(
  args: EndCaretakerGrantArgs,
  tx: Tx,
): Promise<{ ended: boolean }> {
  await tx
    .update(ownerships)
    .set({ endedAt: args.now })
    .where(and(eq(ownerships.id, args.ownershipId), isNull(ownerships.endedAt)));

  const payload = validateEventPayload("caretaker_ended", {
    payload_version: 1,
    grant_id: args.grantId,
    outcome: args.outcome,
    ends_at: args.endsAt.toISOString(),
  });

  await tx.insert(petEvents).values({
    petId: args.petId,
    eventType: "caretaker_ended",
    occurredAt: args.now,
    recordedAt: args.now,
    recordedByUserId: args.actorUserId,
    authorRole: "owner",
    authorVerified: false,
    payload,
  });

  const flipped = await tx
    .update(petCaretakerGrants)
    .set({
      status: "ended",
      endedAt: args.now,
      endedReason: args.outcome,
      // ownershipId is deliberately NOT cleared: the biconditional accept CHECK
      // only constrains `status='accepted'`, and the pointer is what lets the
      // drift harness compare the grant against the row it produced long after
      // the arrangement is over.
      updatedAt: args.now,
      updatedBy: args.actorUserId,
    })
    .where(and(eq(petCaretakerGrants.id, args.grantId), eq(petCaretakerGrants.status, "accepted")))
    .returning({ id: petCaretakerGrants.id });

  if (flipped.length === 0) {
    throw new Error("El cuidado ya fue finalizado por otra acción.");
  }

  return { ended: true };
}

/**
 * Close EVERY live ownership row on a pet, routing caretakers through the
 * atomic end above and everything else through a plain close.
 *
 * Callers are custody hand-offs that end the previous arrangement wholesale:
 * adoption finalize, decomiso. They must not enumerate roles one by one — that
 * is what collided with the titular's `owner` row on
 * `ownerships_one_active_owner_per_pet` when rehome-by-titular let that row stay
 * open through a sponsorship, and it would collide with a co-owner too.
 *
 * `outcome` is what the caretaker's own timeline will say about why their
 * arrangement ended. It is a required argument and not a default, because
 * "adoption finalized" and "seized by the authority" are not the same story to
 * tell the person who was looking after the animal.
 */
export async function endAllLiveOwnerships(
  args: { petId: string; outcome: GrantEndOutcome; actorUserId: string | null; now: Date },
  tx: Tx,
): Promise<{ caretakerGrantsEnded: number }> {
  // Caretakers first, one at a time: each needs its grant and its event, and
  // the blanket close below would otherwise swallow the row and leave the grant
  // pointing at it.
  const liveCaretakerGrants = await tx
    .select({
      grantId: petCaretakerGrants.id,
      ownershipId: ownerships.id,
      endsAt: petCaretakerGrants.endsAt,
    })
    .from(ownerships)
    .innerJoin(petCaretakerGrants, eq(petCaretakerGrants.ownershipId, ownerships.id))
    .where(
      and(
        eq(ownerships.petId, args.petId),
        eq(ownerships.role, "caretaker"),
        isNull(ownerships.endedAt),
        eq(petCaretakerGrants.status, "accepted"),
      ),
    );

  for (const grant of liveCaretakerGrants) {
    await endCaretakerGrantAtomically(
      {
        grantId: grant.grantId,
        ownershipId: grant.ownershipId,
        petId: args.petId,
        outcome: args.outcome,
        endsAt: grant.endsAt,
        now: args.now,
        actorUserId: args.actorUserId,
      },
      tx,
    );
  }

  // Everything still open: owner, co_owner, foster, shelter_custody, and any
  // caretaker row whose grant was already resolved (so it has no grant to flip).
  await tx
    .update(ownerships)
    .set({ endedAt: args.now })
    .where(and(eq(ownerships.petId, args.petId), isNull(ownerships.endedAt)));

  return { caretakerGrantsEnded: liveCaretakerGrants.length };
}
