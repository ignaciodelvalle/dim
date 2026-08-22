// Use-case: the titular ends an ACTIVE sponsorship (rehome-by-titular, spec
// REQ-8, REQ-10, REQ-15; design WU4 — "the one-way door's escape hatch").
//
// AUTH IS THE ACTION'S JOB. `requireTitularAccess` plus the owner-role check
// run at the edge; this layer re-asserts the live `owner` row FOR UPDATE
// inside the transaction, because a foster, a caretaker and a co-owner all
// hold a Path-1 row and none of them may end an arrangement the titular made.
//
// UNCONDITIONAL ON THE ORG'S SIDE. Nothing here asks whether the org is
// verified, reachable, mid-review of an applicant, or has paused the listing.
// REQ-10: there is no elapsed time, no org inaction and no org state that
// leaves the titular unable to take the animal back off the shelf — because
// the titular never gave the title away, "taking it back" is just closing the
// org's row.
//
// ONE TRANSACTION, AND THE ORDER IS LOAD-BEARING (the inverse of ADR-1):
//   1. Lock the titular's owner row; find the open sponsorship on the spine.
//   2. Close the custody row the sponsorship opened — BY ID, never by the
//      (pet, org) shape, which also describes a decomiso or an intake. If it
//      was already closed by someone who forgot the spine, the withdraw goes
//      on anyway: the titular's exit is not hostage to someone else's drift
//      (lint:spine names that orphan separately).
//   3. Clear the listing cache (adoptionListedAt, adoptionListingPausedAt)
//      through the adoption writer — the catalog stops resolving the pet in
//      this same transaction, not eventually.
//   4. Emit `rehome_sponsorship_ended{withdrawn_by_titular}`, signed by the
//      titular — BEFORE step 5, because it attaches to the listing case only
//      while that case is open (attaches-when-open).
//   5. Close the `adoption_listing` case (the sponsorship itself): cancelled,
//      by the titular, with a timeline note both sides read.
//   6. Close every application the listing had (WU4 review, carry-forward 1).
//      With the custody row ended, the org's review and finalize readers and
//      the applicant's own withdraw reader all inner-join a LIVE custody and
//      find nothing; both inboxes hide the rows; nobody is told. A pending
//      application is resolved on the spine (auto-generated, reason named,
//      signed by the titular); an approved one keeps its approval and loses
//      only its open case. Every applicant gets a notification after commit.
//
// ELIGIBILITY IS NOT TOUCHED. `adoptionEligible` is the org's assessment and
// the spine recorded it; without a live custody row and a listed_at it lists
// nothing, and the next accept re-asserts it with an honest previous_state.
// Flipping it here would need an `adoption_eligibility_set(eligible=false)`
// with a reason from a closed catalog that has no "titular withdrew" member.
//
// Notifications and revalidation are OUTSIDE the transaction, per house
// convention: a dead SMTP must never roll back the titular's exit.

import { NO_ACTIVE_SPONSORSHIP_ERROR, validateWithdrawSponsorship } from "../domain/rehome-rules";
import type { PetSummary, RehomeWithdrawPort, SponsorOrg } from "./ports";
import type { NewNotification, UseCaseResult } from "./types";

type Deps = {
  repo: RehomeWithdrawPort;
  now: () => Date;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type WithdrawRehomeSponsorshipInput = {
  petPublicToken: string;
  titularUserId: string;
};

export type WithdrawRehomeSponsorshipValue = {
  petId: string;
  petPublicToken: string;
  sponsoringOrganizationId: string;
  sponsoringOrganizationPublicToken: string | null;
  /** The custody row the sponsorship opened, now closed. */
  ownershipId: string;
  /** The `adoption_listing` case this closed, or null if none was open. */
  listingCasePublicCode: string | null;
  /** False when the row had already been closed elsewhere (drift, healed here). */
  custodyRowWasLive: boolean;
};

type TxOutcome =
  | {
      ok: true;
      ownershipId: string;
      org: SponsorOrg | null;
      orgId: string;
      listing: { id: string; publicCode: string } | null;
      custodyRowWasLive: boolean;
      /** Applicants whose application step 6 closed — told after commit. */
      strandedApplicantUserIds: string[];
    }
  | { ok: false; error: string };

export async function withdrawRehomeSponsorship(
  input: WithdrawRehomeSponsorshipInput,
  deps: Deps,
): Promise<UseCaseResult<WithdrawRehomeSponsorshipValue>> {
  const { repo } = deps;

  const pet: PetSummary | null = await repo.findPetByToken(input.petPublicToken);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  const now = deps.now();

  const outcome = await deps.transaction<TxOutcome>(async (tx) => {
    // 1. The titular's row, locked; the arrangement, on the spine.
    const ownerRow = await repo.lockLiveOwnerRow(pet.id, input.titularUserId, tx);
    const open = await repo.findOpenSponsorshipForPet(pet.id, tx);
    const gate = validateWithdrawSponsorship({
      titularOwnerRowLive: ownerRow !== null,
      openSponsorship: open,
    });
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!open) return { ok: false, error: NO_ACTIVE_SPONSORSHIP_ERROR };

    const org = await repo.findOrgById(open.sponsoringOrganizationId, tx);
    const orgName = org?.displayName ?? "la organización";

    // 2. The org's custody row — by id.
    const { ended } = await repo.endCustodyRow(open.ownershipId, now, tx);

    // 3. The listing cache.
    await repo.unpublishListing({ petId: pet.id, now }, tx);

    // 4. The closing fact, while the listing case is still open.
    await repo.endSponsorshipByTitular(
      { petId: pet.id, titularUserId: input.titularUserId, now },
      tx,
    );

    // 5. The sponsorship case. A lost close (another closer got there first)
    //    writes no note — the case is closed either way, which is what the
    //    titular asked for.
    const listing = await repo.findOpenListingCase(pet.id, open.sponsoringOrganizationId, tx);
    if (listing) {
      await repo.closeListingCase(
        {
          caseId: listing.id,
          closedByUserId: input.titularUserId,
          organizationId: open.sponsoringOrganizationId,
          timelineNote: `El titular dio de baja el acompañamiento de ${orgName}. El animal sigue con su familia; la publicación se retiró de la búsqueda de hogar.`,
          now,
        },
        tx,
      );
    }

    // 6. The applications the listing had, each closed the way its state
    //    deserves — in THIS transaction, so a stranded applicant cannot exist
    //    for even one committed instant.
    const stranded = await repo.findApplicationsOnListing(pet.id, tx);
    for (const application of stranded) {
      await repo.closeApplicationByTitular(
        {
          petId: pet.id,
          petName: pet.name,
          application,
          titularUserId: input.titularUserId,
          organizationId: open.sponsoringOrganizationId,
          organizationDisplayName: orgName,
          now,
        },
        tx,
      );
    }

    return {
      ok: true,
      ownershipId: open.ownershipId,
      org,
      orgId: open.sponsoringOrganizationId,
      listing,
      custodyRowWasLive: ended,
      strandedApplicantUserIds: stranded.map((a) => a.applicantUserId),
    };
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };

  const titularName = (await repo.findDisplayName(input.titularUserId)) ?? "El titular";
  const recipients = await repo.orgAdminAndCoordinatorUserIds(outcome.orgId);
  const ctaUrl = outcome.listing
    ? `/casos/${outcome.listing.publicCode}`
    : outcome.org
      ? `/org/${outcome.org.publicToken}/casos`
      : null;
  const notifications: NewNotification[] = recipients.map((userId) => ({
    userId,
    notificationType: "rehome_sponsorship_withdrawn",
    severity: "warning",
    title: `${titularName} dio de baja el acompañamiento de ${pet.name}`,
    body: `${pet.name} sigue viviendo con su familia. La publicación se retiró de la búsqueda de hogar y tu organización ya no tiene custodia registral sobre esta mascota.`,
    dedupeKey: `rehome:withdrawn:${outcome.ownershipId}:${userId}`,
    ctaLabel: ctaUrl ? "Ver caso" : null,
    ctaUrl,
    relatedPetId: pet.id,
    relatedCaseId: outcome.listing?.id ?? null,
    category: "custody",
  }));

  // The applicants whose application step 6 closed. What happened and what
  // it means for them, with nothing asked of them — the same courtesy the
  // finalize cascade's "encontró hogar" extends, for the opposite outcome.
  for (const userId of new Set(outcome.strandedApplicantUserIds)) {
    notifications.push({
      userId,
      notificationType: "adoption_application_closed",
      severity: "info",
      title: `Tu postulación por ${pet.name} quedó cerrada`,
      body: `El titular retiró la búsqueda de hogar de ${pet.name}; tu postulación quedó cerrada. No hace falta que hagas nada. Hay otras mascotas buscando hogar.`,
      dedupeKey: `rehome:withdrawn:${outcome.ownershipId}:applicant:${userId}`,
      ctaLabel: "Ver otras en adopción",
      ctaUrl: "/adoptar",
      relatedPetId: pet.id,
      relatedCaseId: null,
      category: "adoption",
    });
  }

  return {
    ok: true,
    value: {
      petId: pet.id,
      petPublicToken: pet.publicToken,
      sponsoringOrganizationId: outcome.orgId,
      sponsoringOrganizationPublicToken: outcome.org?.publicToken ?? null,
      ownershipId: outcome.ownershipId,
      listingCasePublicCode: outcome.listing?.publicCode ?? null,
      custodyRowWasLive: outcome.custodyRowWasLive,
    },
    notifications,
  };
}
