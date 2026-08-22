// The single writer of `rehome_sponsorship_ended` (rehome-by-titular).
//
// WHY IT LIVES IN THE ADOPTION MODULE AND NOT IN src/modules/rehome/
// ---------------------------------------------------------------------------
// The sponsorship lifecycle belongs to the rehome module conceptually, but the
// module graph is acyclic on purpose (scripts/check-dependency-direction.ts).
// rehome already has to depend on adoption — its accept transaction calls
// `AdoptionRepository.setListingStatus` inside the same tx — so housing this
// writer in rehome would add the return edge adoption -> rehome and close a
// cycle. Its callers all reach it from this direction: every custody hand-off
// through `lib/infra/end-pet-ownerships.ts` (adoption finalize, decomiso,
// dispute resolution, foster conversion), the titular's withdraw in
// src/modules/rehome, and the rollback script (design ADR-7, planned for WU7).
//
// It also has to sit under `src/modules/**/infrastructure/**` so that
// scripts/check-titular-gate.ts sees it: `rehome_sponsorship_ended` is a
// titular-only event type, and a writer parked outside the fence's scan globs
// (lib/infra/, say) would be invisible to the exact guard that exists to catch
// the writer nobody remembered to gate.

import { sql } from "drizzle-orm";

import { type db, petEvents } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { findOpenAdoptionListingCase } from "@/lib/infra/case-helpers";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Derived from the column, so a widened `author_role` enum cannot drift from this. */
type AuthorRole = NonNullable<(typeof petEvents.$inferInsert)["authorRole"]>;

/**
 * Mirrors the `outcome` enum in lib/events/rehome-event-schemas.ts.
 *
 * `withdrawn_by_platform` is the outcome for an end no party to the
 * arrangement chose: the rollback script (ADR-7, planned for WU7) and, since
 * the WU3 review (M-2), a custody hand-off decided above both parties — a
 * decomiso, a custody dispute resolved by the authority. See
 * lib/infra/end-pet-ownerships.ts.
 */
export type SponsorshipEndOutcome =
  | "adopted"
  | "withdrawn_by_titular"
  | "ended_by_org"
  | "pet_deceased"
  | "withdrawn_by_platform";

export type OpenSponsorship = {
  /** The `ownerships(role='shelter_custody')` row the sponsorship opened. */
  ownershipId: string;
  sponsoringOrganizationId: string;
};

/**
 * The pet's still-open rehome sponsorship, or null when it never had one.
 *
 * Keyed on an UNMATCHED `rehome_sponsorship_started` event, never on the live
 * owner+shelter_custody pair. That pair also describes a decomiso and an org
 * intake, so a shape-based predicate would fabricate sponsorship facts over
 * animals this feature never touched. `payload.ownership_id` is in the spine
 * for exactly this reason (design ADR-2); the rollback script keys on the same
 * predicate.
 */
export async function findOpenSponsorship(petId: string, tx: Tx): Promise<OpenSponsorship | null> {
  const rows = await tx.execute<{ ownership_id: string; organization_id: string }>(sql`
    SELECT started.payload->>'ownership_id' AS ownership_id,
           started.payload->>'sponsoring_organization_id' AS organization_id
    FROM pet_events started
    WHERE started.pet_id = ${petId}
      AND started.event_type = 'rehome_sponsorship_started'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events ended
        WHERE ended.pet_id = started.pet_id
          AND ended.event_type = 'rehome_sponsorship_ended'
          AND ended.payload->>'ownership_id' = started.payload->>'ownership_id'
      )
    ORDER BY started.occurred_at DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return { ownershipId: row.ownership_id, sponsoringOrganizationId: row.organization_id };
}

export type EndSponsorshipArgs = {
  petId: string;
  outcome: SponsorshipEndOutcome;
  /**
   * The person the closing fact is attributed to (org member, the titular, or
   * the authority's operator). Null only for a caller with no acting user.
   */
  recordedByUserId: string | null;
  /**
   * WHO IS SIGNING. `owner` for the titular's withdraw, `shelter` for the
   * org's paths, `govt` when an authority's hand-off ends the arrangement —
   * db/schema.ts: "the test is who the author IS, not which event type they
   * reached for".
   */
  authorRole: AuthorRole;
  /** Null on the titular's own withdraw, where no org is acting. */
  authorOrganizationId: string | null;
  authorVerified: boolean;
  now: Date;
};

/**
 * Closes the pet's open sponsorship on the spine. Returns the custody row the
 * sponsorship owned, or null when there was nothing open (a pet that reached
 * the adoption shelf through the ordinary surrender path, for instance).
 *
 * Must run inside the transaction that also closes the ownership row, so the
 * ledger can never say an arrangement is still running over an animal that
 * already changed hands.
 */
export async function endRehomeSponsorship(
  args: EndSponsorshipArgs,
  tx: Tx,
): Promise<OpenSponsorship | null> {
  const open = await findOpenSponsorship(args.petId, tx);
  if (!open) return null;

  const listingCase = await findOpenAdoptionListingCase(
    args.petId,
    open.sponsoringOrganizationId,
    tx,
  );

  await tx.insert(petEvents).values({
    petId: args.petId,
    eventType: "rehome_sponsorship_ended",
    occurredAt: args.now,
    recordedAt: args.now,
    recordedByUserId: args.recordedByUserId,
    authorRole: args.authorRole,
    authorOrganizationId: args.authorOrganizationId,
    authorVerified: args.authorVerified,
    payload: validateEventPayload("rehome_sponsorship_ended", {
      ownership_id: open.ownershipId,
      outcome: args.outcome,
      ended_at: args.now.toISOString(),
    }),
    caseId: listingCase?.id ?? null,
  });

  return open;
}
