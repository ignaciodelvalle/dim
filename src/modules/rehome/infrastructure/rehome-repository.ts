// RehomeRepository — the Drizzle side of the rehome-by-titular module.
//
// Thin. No auth (that lives at the action edge), no business rules (those live
// in domain/rehome-rules.ts), no notification bodies (those live in the
// use-cases). Every write that participates in the accept transaction takes an
// explicit `tx` so the use-case — not this file — owns the ordering that
// design ADR-1 makes load-bearing.
//
// Lives under src/modules/**/infrastructure/** on purpose: the accept path is a
// writer of `rehome_sponsorship_started`, a titular-only event type, and
// scripts/check-titular-gate.ts only sees writers inside its scan globs.
//
// Cross-module edges (scripts/check-dependency-direction.ts, `rehome:adoption`):
// the eligibility + listing writers and the open-sponsorship predicate are
// REUSED from adoption, never re-implemented — four copies of the catalog
// predicate already drift (design R5); a fifth would be the wrong direction.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  caseEvents,
  cases,
  db,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import {
  closeCase,
  findOpenAdoptionListingCase,
  findOpenCaseForPetAndKind,
  openCase,
} from "@/lib/infra/case-helpers";
import { AdoptionRepository } from "@/src/modules/adoption/infrastructure/adoption-repository";
import {
  endRehomeSponsorship,
  findOpenSponsorship,
} from "@/src/modules/adoption/infrastructure/rehome-sponsorship-writer";

import type {
  CloseListingCaseArgs,
  CloseRequestCaseArgs,
  EndSponsorshipByTitularArgs,
  InsertShelterCustodyArgs,
  InsertSponsorshipStartedArgs,
  MarkEligibleArgs,
  OpenRequestCaseArgs,
  OpenSponsorshipRef,
  PetSummary,
  RehomeRepositoryPort,
  RequestCase,
  SponsorOrg,
} from "../application/ports";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PET_SUMMARY_COLUMNS = {
  id: pets.id,
  publicToken: pets.publicToken,
  name: pets.name,
  status: pets.status,
  jurisdictionProvince: pets.jurisdictionProvince,
  jurisdictionLocality: pets.jurisdictionLocality,
  localityId: pets.localityId,
  inCustodyDispute: pets.inCustodyDispute,
  rabiesObservationStatus: pets.rabiesObservationStatus,
  adoptionIneligibleUntil: pets.adoptionIneligibleUntil,
} as const;

/**
 * Close a case and leave the prose the people involved read. The case row
 * carries the category (`resolved` / `cancelled`) and the actor; the timeline
 * entry carries who did what, naming the org — spec REQ-5's "distinguishable
 * from every other `cancelled`". Shared by the org's answer, the titular's
 * cancel and the titular's withdraw.
 */
async function closeCaseWithNote(
  args: {
    caseId: string;
    reason: "resolved" | "cancelled";
    closedByUserId: string;
    decision: "accepted" | "declined" | "withdrawn";
    organizationId: string;
    timelineNote: string;
    now: Date;
  },
  client: Tx,
): Promise<void> {
  await closeCase(
    { caseId: args.caseId, reason: args.reason, closedByUserId: args.closedByUserId },
    client,
  );
  await client.insert(caseEvents).values({
    caseId: args.caseId,
    entryType: "case_closed",
    notes: args.timelineNote,
    recordedByUserId: args.closedByUserId,
    occurredAt: args.now,
    payload: { rehome_decision: args.decision, organization_id: args.organizationId },
  });
}

function toRequestCase(row: {
  id: string;
  publicCode: string;
  caseKind: string;
  status: string;
  primaryPetId: string | null;
  receiverOrganizationId: string | null;
  openedByUserId: string | null;
}): RequestCase {
  return {
    id: row.id,
    publicCode: row.publicCode,
    caseKind: row.caseKind,
    status: row.status,
    primaryPetId: row.primaryPetId,
    receiverOrganizationId: row.receiverOrganizationId,
    openedByUserId: row.openedByUserId,
  };
}

export const RehomeRepository = {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async findPetByToken(publicToken: string): Promise<PetSummary | null> {
    const [row] = await db
      .select(PET_SUMMARY_COLUMNS)
      .from(pets)
      .where(eq(pets.publicToken, publicToken))
      .limit(1);
    return row ?? null;
  },

  async findPetById(petId: string, tx?: unknown): Promise<PetSummary | null> {
    const client = (tx as Tx | undefined) ?? db;
    const [row] = await client
      .select(PET_SUMMARY_COLUMNS)
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    return row ?? null;
  },

  /**
   * The user's live `role='owner'` row on the pet. Deliberately NOT the
   * role-agnostic Path-1 lookup of requirePetAccess: a foster, a caretaker and
   * a co-owner all hold a live row on the pet and none of them is the titular
   * this flow needs (spec REQ-1, REQ-14).
   */
  async findLiveOwnerRow(
    petId: string,
    userId: string,
    tx?: unknown,
  ): Promise<{ id: string } | null> {
    const client = (tx as Tx | undefined) ?? db;
    const [row] = await client
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerUserId, userId),
          eq(ownerships.role, "owner"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Lock-then-read variant of findLiveOwnerRow for the accept transaction
   * (ADR-1 step 2). Plain `SELECT ... FOR UPDATE`; no explicit lock of the
   * pet, so the row lock is as narrow as the assertion it protects.
   */
  async lockLiveOwnerRow(
    petId: string,
    userId: string,
    tx: unknown,
  ): Promise<{ id: string } | null> {
    const client = tx as Tx;
    const [row] = await client
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerUserId, userId),
          eq(ownerships.role, "owner"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async findOrgById(orgId: string, tx?: unknown): Promise<SponsorOrg | null> {
    const client = (tx as Tx | undefined) ?? db;
    const [row] = await client
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        publicToken: organizations.publicToken,
        orgType: organizations.orgType,
        verified: organizations.verified,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Lock-then-read variant of findOrgById for the accept transaction (ADR-1
   * step 1b; WU3 review M-1 residual). `FOR SHARE`, not `FOR UPDATE`: the
   * accept only needs the verification it read to still hold when it commits
   * — a de-verifying UPDATE must wait behind this transaction — while two
   * accepts of two different requests addressed to the same org must not
   * serialise on the org row.
   */
  async lockOrgForShare(orgId: string, tx: unknown): Promise<SponsorOrg | null> {
    const client = tx as Tx;
    const [row] = await client
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        publicToken: organizations.publicToken,
        orgType: organizations.orgType,
        verified: organizations.verified,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
      .for("share");
    return row ?? null;
  },

  async findOpenRequestForPet(petId: string): Promise<RequestCase | null> {
    const row = await findOpenCaseForPetAndKind(petId, "rehome_request");
    return row ? toRequestCase(row) : null;
  },

  async findRequestCaseByPublicCode(publicCode: string): Promise<RequestCase | null> {
    const [row] = await db.select().from(cases).where(eq(cases.publicCode, publicCode)).limit(1);
    return row ? toRequestCase(row) : null;
  },

  /**
   * Re-read under `SELECT ... FOR UPDATE`. The pre-transaction read every
   * use-case does is stale by construction — two org members answering the
   * same request race for this row. The lock serialises them; the loser sees
   * the flipped status and aborts before writing (design ADR-1, mitigation 1).
   */
  async lockRequestCase(caseId: string, tx: unknown): Promise<RequestCase | null> {
    const client = tx as Tx;
    const [row] = await client
      .select()
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1)
      .for("update");
    return row ? toRequestCase(row) : null;
  },

  /**
   * Keyed on the spine — an unmatched `rehome_sponsorship_started` — never on
   * the owner+shelter_custody shape, which also describes a decomiso or an
   * intake. The predicate is adoption's (`findOpenSponsorship`); one copy.
   */
  async hasOpenSponsorship(petId: string, tx?: unknown): Promise<boolean> {
    const client = ((tx as Tx | undefined) ?? db) as Tx;
    const open = await findOpenSponsorship(petId, client);
    return open !== null;
  },

  async countLiveShelterCustody(petId: string, tx: unknown): Promise<number> {
    const client = tx as Tx;
    const [row] = await client
      .select({ n: sql<number>`count(*)::int` })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );
    return row?.n ?? 0;
  },

  async orgAdminAndCoordinatorUserIds(orgId: string): Promise<string[]> {
    const rows = await db
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
  },

  async findDisplayName(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row?.displayName ?? null;
  },

  // -------------------------------------------------------------------------
  // Writes — request
  // -------------------------------------------------------------------------

  /**
   * The titular opens the case; the org is its RECEIVER. `openedByOrganization`
   * stays null by construction, and the org's inbox predicate (WU5) keys on
   * `receiver_organization_id` — the same column the cross-org transfer accept
   * path authorizes against.
   */
  async openRequestCase(args: OpenRequestCaseArgs): Promise<{ id: string; publicCode: string }> {
    const row = await openCase({
      kind: "rehome_request",
      primarySubjectKind: "registered_pet",
      primaryPetId: args.petId,
      jurisdictionProvince: args.jurisdictionProvince,
      jurisdictionLocality: args.jurisdictionLocality,
      localityId: args.localityId,
      openedByUserId: args.titularUserId,
      openedByOrganizationId: null,
      receiverOrganizationId: args.orgId,
      openedReason: { code: "rehome_requested", orgDisplayName: args.orgDisplayName },
    });
    return { id: row.id, publicCode: row.publicCode };
  },

  // -------------------------------------------------------------------------
  // Writes — answer (inside the caller's transaction)
  // -------------------------------------------------------------------------

  /** ADR-1 step 5: the org's row beside the titular's. Nothing is closed here. */
  async insertShelterCustody(args: InsertShelterCustodyArgs, tx: unknown): Promise<{ id: string }> {
    const client = tx as Tx;
    const [row] = await client
      .insert(ownerships)
      .values({
        petId: args.petId,
        ownerOrganizationId: args.orgId,
        role: "shelter_custody",
        startedAt: args.now,
      })
      .returning({ id: ownerships.id });
    return row;
  },

  /**
   * ADR-1 step 6 — the adoption writer, reused: updates the eligibility
   * columns, opens (or attaches to) the org's adoption_listing case and emits
   * adoption_eligibility_set with that case id. The previous state is read
   * here so the event's `previous_state` is honest, as the adoption use-case's
   * own pre-load makes it.
   */
  async markEligibleAndOpenListing(
    args: MarkEligibleArgs,
    tx: unknown,
  ): Promise<{ listingCaseId: string | null }> {
    const client = tx as Tx;
    const [before] = await client
      .select({ eligible: pets.adoptionEligible, reason: pets.adoptionIneligibleReason })
      .from(pets)
      .where(eq(pets.id, args.petId))
      .limit(1);

    await AdoptionRepository.setEligibility(
      {
        petId: args.petId,
        eligible: true,
        ineligibleReason: null,
        ineligibleReasonNotes: null,
        ineligibleUntil: null,
        now: args.now,
        userId: args.userId,
        orgId: args.orgId,
        orgVerified: args.orgVerified,
        previousState: before ? { eligible: before.eligible, reason: before.reason } : null,
      },
      client,
    );

    const listing = await findOpenAdoptionListingCase(args.petId, args.orgId, client);
    return { listingCaseId: listing?.id ?? null };
  },

  /** ADR-1 step 7 — the repository writer, not the use-case (see the use-case header). */
  async publishListing(args: { petId: string; now: Date }, tx: unknown): Promise<void> {
    await AdoptionRepository.setListingStatus(
      { petId: args.petId, action: "publish", currentListedAt: null, now: args.now },
      tx as Tx,
    );
  },

  /**
   * ADR-1 step 8 — the consent fact. Authored by the ORG (this is the org
   * path; `holderRole` is null there), naming the titular who consented in the
   * payload and the custody row it opened. Attached to the REQUEST case, which
   * the caller closes one step later.
   */
  async insertSponsorshipStarted(args: InsertSponsorshipStartedArgs, tx: unknown): Promise<void> {
    const client = tx as Tx;
    await client.insert(petEvents).values({
      petId: args.petId,
      eventType: "rehome_sponsorship_started",
      occurredAt: args.now,
      recordedAt: args.now,
      recordedByUserId: args.recordedByUserId,
      authorRole: "shelter",
      authorOrganizationId: args.orgId,
      authorVerified: args.orgVerified,
      payload: validateEventPayload("rehome_sponsorship_started", {
        ownership_id: args.ownershipId,
        sponsoring_organization_id: args.orgId,
        consented_by_user_id: args.consentedByUserId,
        request_case_public_code: args.requestCasePublicCode,
        listing_case_id: args.listingCaseId,
        note: null,
      }),
      caseId: args.requestCaseId,
    });
  },

  /**
   * ADR-1 step 9 (and the whole of a decline). The case row carries the
   * category (`resolved` / `cancelled`) and the actor; the timeline entry
   * carries the prose the titular reads, naming the org — spec REQ-5's
   * "distinguishable from every other `cancelled`".
   */
  async closeRequestCase(args: CloseRequestCaseArgs, tx: unknown): Promise<void> {
    await closeCaseWithNote(args, tx as Tx);
  },

  // -------------------------------------------------------------------------
  // Writes — withdraw (inside the caller's transaction)
  // -------------------------------------------------------------------------

  async findOpenSponsorshipForPet(petId: string, tx: unknown): Promise<OpenSponsorshipRef | null> {
    return findOpenSponsorship(petId, tx as Tx);
  },

  /**
   * Closes the custody row the sponsorship opened — by id, never by the
   * (pet, org) shape. `ended: false` means someone already closed it without
   * writing the closing event; the withdraw goes on regardless (REQ-10 — the
   * titular's route back is unconditional) and lint:spine would have named
   * the orphan.
   */
  async endCustodyRow(ownershipId: string, now: Date, tx: unknown): Promise<{ ended: boolean }> {
    const client = tx as Tx;
    const rows = await client
      .update(ownerships)
      .set({ endedAt: now })
      .where(and(eq(ownerships.id, ownershipId), isNull(ownerships.endedAt)))
      .returning({ id: ownerships.id });
    return { ended: rows.length > 0 };
  },

  /** The adoption writer, reused: clears `adoptionListedAt` and the pause. */
  async unpublishListing(args: { petId: string; now: Date }, tx: unknown): Promise<void> {
    await AdoptionRepository.setListingStatus(
      { petId: args.petId, action: "unpublish", currentListedAt: null, now: args.now },
      tx as Tx,
    );
  },

  /**
   * The closing fact, signed by the TITULAR: `owner`, no org, not verified —
   * the person-path authorship every owner-written event carries. Attaches
   * to the open `adoption_listing` case (attaches-when-open), so the caller
   * writes it BEFORE closing that case.
   */
  async endSponsorshipByTitular(args: EndSponsorshipByTitularArgs, tx: unknown): Promise<void> {
    await endRehomeSponsorship(
      {
        petId: args.petId,
        outcome: "withdrawn_by_titular",
        recordedByUserId: args.titularUserId,
        authorRole: "owner",
        authorOrganizationId: null,
        authorVerified: false,
        now: args.now,
      },
      tx as Tx,
    );
  },

  async findOpenListingCase(
    petId: string,
    orgId: string,
    tx: unknown,
  ): Promise<{ id: string; publicCode: string } | null> {
    const row = await findOpenAdoptionListingCase(petId, orgId, tx as Tx);
    return row ? { id: row.id, publicCode: row.publicCode } : null;
  },

  /** The sponsorship itself, closed `cancelled` by the titular, with the prose both sides read. */
  async closeListingCase(args: CloseListingCaseArgs, tx: unknown): Promise<void> {
    await closeCaseWithNote({ ...args, reason: "cancelled", decision: "withdrawn" }, tx as Tx);
  },
} satisfies RehomeRepositoryPort;
