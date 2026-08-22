// The death of a SPONSORED pet ends its rehome sponsorship (rehome-by-titular,
// design ADR-2 "the death cascade closes the arrangement"; tasks 7.4).
//
// WHAT A DEATH USED TO LEAVE BEHIND. The attachment rule pinned
// `death_recorded` to the open `rehome_request` / `adoption_listing` cases and
// stopped there. The org's `shelter_custody` row stayed live (its census
// counted a dead animal as held), `adoption_listed_at` stayed set (only the
// catalog's `status <> 'deceased'` guard hid the pet), the spine kept saying
// the arrangement was running, and nobody — not the org, not the applicants
// waiting on it — was told. This runs as CASCADE D of the death use-case, in
// the SAME transaction as the death event.
//
// NOT THE TITULAR'S WITHDRAW, ON PURPOSE. `withdrawRehomeSponsorship` is the
// titular's act: it locks the titular's own owner row by user id and signs
// `withdrawn_by_titular`. A death is recorded by whoever is present — the
// titular, the org, a vet — and the closing fact carries THAT authorship with
// `outcome: 'pet_deceased'`, the enum member reserved for exactly this. What
// IS shared with the withdraw: the custody row is closed BY ID from the spine,
// the listing cache is cleared through the adoption writer, the closing event
// goes through the single writer, and the stranded applications are found
// through adoption's own predicates.
//
// WHY lib/infra. The death use-case lives in `events`; the writers it needs
// live in `adoption`. `events -> adoption` would be a new module edge for one
// cascade; lib/infra sits below both (the same placement `closeCase` and
// `end-pet-ownerships.ts` already use), and nothing in `adoption` imports
// this file, so the graph stays acyclic.
//
// The owner row is NOT touched: a death does not change who the animal
// belonged to.

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  caseEvents,
  organizationMemberships,
  organizations,
  ownerships,
  type petEvents,
} from "@/db";
import type { db } from "@/db";
import {
  closeCaseOwned,
  findOpenAdoptionApplicationCase,
  findOpenAdoptionListingCase,
  findOpenCaseForPetAndKind,
} from "@/lib/infra/case-helpers";
import { AdoptionRepository } from "@/src/modules/adoption/infrastructure/adoption-repository";
import {
  endRehomeSponsorship,
  findOpenSponsorship,
} from "@/src/modules/adoption/infrastructure/rehome-sponsorship-writer";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Derived from the column, so a widened `author_role` enum cannot drift from this. */
type AuthorRole = NonNullable<(typeof petEvents.$inferInsert)["authorRole"]>;

/** The `reason` the auto-resolution of a still-pending application carries. */
export const PET_DECEASED_REASON = "pet_deceased";

export type DeathSponsorshipCascadeArgs = {
  petId: string;
  petName: string;
  /** Whoever recorded the death — the closing fact and the case closes are theirs. */
  recordedByUserId: string;
  /** The death event's own authorship: who the recorder IS (owner / shelter / vet). */
  authorRole: string;
  authorOrganizationId: string | null;
  authorVerified: boolean;
  now: Date;
};

/**
 * What the cascade closed, handed back so the use-case can tell the people
 * involved AFTER commit. `ownershipId` is null when only a still-pending
 * `rehome_request` was open (a death between ask and answer): there was no
 * sponsorship to end, but the org was waiting on a request that is now moot.
 */
export type DeathSponsorshipCascadeResult = {
  sponsoringOrganizationId: string;
  /** For the org's notification CTA when no case is left to point at. */
  sponsoringOrganizationPublicToken: string | null;
  ownershipId: string | null;
  listingCaseId: string | null;
  /** `/casos/{code}` — readable by the org's members after the custody row closed. */
  listingCasePublicCode: string | null;
  requestCaseId: string | null;
  requestCasePublicCode: string | null;
  /** The org's admins and coordinators. */
  orgRecipientUserIds: string[];
  /** Applicants whose application case this closed. */
  strandedApplicantUserIds: string[];
};

async function closeWithNote(
  args: {
    caseId: string;
    reason: "resolved" | "cancelled";
    closedByUserId: string;
    note: string;
    now: Date;
  },
  tx: Tx,
): Promise<boolean> {
  const { won } = await closeCaseOwned(
    { caseId: args.caseId, reason: args.reason, closedByUserId: args.closedByUserId },
    tx,
  );
  if (!won) return false;
  await tx.insert(caseEvents).values({
    caseId: args.caseId,
    entryType: "case_closed",
    notes: args.note,
    recordedByUserId: args.closedByUserId,
    occurredAt: args.now,
    payload: { cause: "pet_deceased" },
  });
  return true;
}

async function orgPublicToken(orgId: string, tx: Tx): Promise<string | null> {
  const [row] = await tx
    .select({ publicToken: organizations.publicToken })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.publicToken ?? null;
}

async function orgAdminAndCoordinatorUserIds(orgId: string, tx: Tx): Promise<string[]> {
  const rows = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * CASCADE D. Returns null when the pet had neither an open sponsorship nor a
 * pending request — the overwhelmingly common case, at no cost beyond one
 * spine read and one case read.
 */
export async function endSponsorshipForDeceasedPet(
  args: DeathSponsorshipCascadeArgs,
  tx: Tx,
): Promise<DeathSponsorshipCascadeResult | null> {
  const authorRole = args.authorRole as AuthorRole;

  // A. A request the org never answered. Nothing on the spine (the request
  //    was workflow state, not a fact about the animal); the case closes so
  //    the org's inbox stops offering an answer to a question that is moot.
  const request = await findOpenCaseForPetAndKind(args.petId, "rehome_request", tx);
  let requestCaseId: string | null = null;
  if (request) {
    await closeWithNote(
      {
        caseId: request.id,
        reason: "cancelled",
        closedByUserId: args.recordedByUserId,
        note: `${args.petName} falleció. La solicitud de nuevo hogar queda sin efecto.`,
        now: args.now,
      },
      tx,
    );
    requestCaseId = request.id;
  }

  // B. The sponsorship itself, keyed on the spine.
  const open = await findOpenSponsorship(args.petId, tx);
  if (!open) {
    if (!request?.receiverOrganizationId) return null;
    return {
      sponsoringOrganizationId: request.receiverOrganizationId,
      sponsoringOrganizationPublicToken: await orgPublicToken(request.receiverOrganizationId, tx),
      ownershipId: null,
      listingCaseId: null,
      listingCasePublicCode: null,
      requestCaseId,
      requestCasePublicCode: request.publicCode,
      orgRecipientUserIds: await orgAdminAndCoordinatorUserIds(request.receiverOrganizationId, tx),
      strandedApplicantUserIds: [],
    };
  }

  // 1. The org's custody row — BY ID, never by the (pet, org) shape.
  await tx
    .update(ownerships)
    .set({ endedAt: args.now })
    .where(and(eq(ownerships.id, open.ownershipId), isNull(ownerships.endedAt)));

  // 2. The listing cache, through the adoption writer.
  await AdoptionRepository.setListingStatus(
    { petId: args.petId, action: "unpublish", currentListedAt: null, now: args.now },
    tx,
  );

  // 3. The closing fact — BEFORE the listing case closes, because it attaches
  //    to that case only while the case is open (attaches-when-open).
  await endRehomeSponsorship(
    {
      petId: args.petId,
      outcome: "pet_deceased",
      recordedByUserId: args.recordedByUserId,
      authorRole,
      authorOrganizationId: args.authorOrganizationId,
      authorVerified: args.authorVerified,
      now: args.now,
    },
    tx,
  );

  // 4. The sponsorship case.
  const listing = await findOpenAdoptionListingCase(args.petId, open.sponsoringOrganizationId, tx);
  if (listing) {
    await closeWithNote(
      {
        caseId: listing.id,
        reason: "resolved",
        closedByUserId: args.recordedByUserId,
        note: `${args.petName} falleció. El acompañamiento de adopción terminó y la publicación se retiró de la búsqueda de hogar.`,
        now: args.now,
      },
      tx,
    );
  }

  // 5. The applications the listing had. A PENDING one is resolved on the
  //    spine — auto-generated, the reason named, signed with the death's own
  //    authorship; an APPROVED one keeps its approval as the single
  //    resolution (a second, contradictory event would be a lie on an
  //    append-only ledger). Both lose their open case, with a note.
  const pending = await AdoptionRepository.findPendingApplicationsExcluding(args.petId, null, tx);
  const approved = await AdoptionRepository.findApprovedUnfinalizedApplications(args.petId, tx);
  for (const application of pending) {
    await AdoptionRepository.resolveApplication(
      {
        petId: args.petId,
        applicationEventId: application.applicationId,
        outcome: "rejected",
        reviewerUserId: args.recordedByUserId,
        orgId: open.sponsoringOrganizationId,
        orgVerified: args.authorVerified,
        reason: PET_DECEASED_REASON,
        autoGenerated: true,
        notes: null,
        now: args.now,
        author: {
          role: authorRole,
          organizationId: args.authorOrganizationId,
          verified: args.authorVerified,
        },
      },
      tx,
    );
  }
  const stranded = new Set<string>();
  for (const application of [...pending, ...approved]) {
    const appCase = await findOpenAdoptionApplicationCase(
      args.petId,
      application.applicantUserId,
      tx,
    );
    if (appCase) {
      await closeWithNote(
        {
          caseId: appCase.id,
          reason: "resolved",
          closedByUserId: args.recordedByUserId,
          note: `${args.petName} falleció. Esta postulación quedó cerrada; no hace falta hacer nada.`,
          now: args.now,
        },
        tx,
      );
    }
    stranded.add(application.applicantUserId);
  }

  return {
    sponsoringOrganizationId: open.sponsoringOrganizationId,
    sponsoringOrganizationPublicToken: await orgPublicToken(open.sponsoringOrganizationId, tx),
    ownershipId: open.ownershipId,
    listingCaseId: listing?.id ?? null,
    listingCasePublicCode: listing?.publicCode ?? null,
    requestCaseId,
    requestCasePublicCode: request?.publicCode ?? null,
    orgRecipientUserIds: await orgAdminAndCoordinatorUserIds(open.sponsoringOrganizationId, tx),
    strandedApplicantUserIds: [...stranded],
  };
}
