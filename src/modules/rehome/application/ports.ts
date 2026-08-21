// The repository PORT the rehome use-cases talk to.
//
// Declared in the application layer, implemented by
// infrastructure/rehome-repository.ts (`satisfies RehomeRepositoryPort`). No
// Drizzle row types leak through: each method returns the narrow shape the
// use-cases read, so the application layer never imports @/db.
//
// Transaction handles are `unknown` here and cast in infrastructure — the
// use-case owns the ORDER of the accept transaction (design ADR-1), the
// repository owns the SQL of each step.
//
// Two halves: the REQUEST half (the titular asks) and the ANSWER half (the org
// accepts or declines). Each use-case depends on its own half only.

export type PetSummary = {
  id: string;
  publicToken: string;
  name: string;
  status: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  localityId: string | null;
  inCustodyDispute: boolean | null;
  rabiesObservationStatus: string | null;
};

export type SponsorOrg = {
  id: string;
  displayName: string;
  publicToken: string;
  orgType: string;
  verified: boolean;
};

/** The subset of a `cases` row the rehome flow reads. */
export type RequestCase = {
  id: string;
  publicCode: string;
  caseKind: string;
  status: string;
  primaryPetId: string | null;
  receiverOrganizationId: string | null;
  openedByUserId: string | null;
};

export type OpenRequestCaseArgs = {
  petId: string;
  titularUserId: string;
  orgId: string;
  orgDisplayName: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  localityId: string | null;
};

export interface RehomeRequestPort {
  findPetByToken(publicToken: string): Promise<PetSummary | null>;
  /** The user's live `role='owner'` row on the pet — never foster, never caretaker. */
  findLiveOwnerRow(petId: string, userId: string, tx?: unknown): Promise<{ id: string } | null>;
  findOrgById(orgId: string, tx?: unknown): Promise<SponsorOrg | null>;
  findOpenRequestForPet(petId: string): Promise<RequestCase | null>;
  /** An accepted sponsorship with no matching end event, keyed on the spine. */
  hasOpenSponsorship(petId: string, tx?: unknown): Promise<boolean>;
  orgAdminAndCoordinatorUserIds(orgId: string): Promise<string[]>;
  findDisplayName(userId: string): Promise<string | null>;
  openRequestCase(args: OpenRequestCaseArgs): Promise<{ id: string; publicCode: string }>;
}

export type InsertShelterCustodyArgs = { petId: string; orgId: string; now: Date };

export type MarkEligibleArgs = {
  petId: string;
  /** The accepting org member — the eligibility and listing are the org's act. */
  userId: string;
  orgId: string;
  orgVerified: boolean;
  now: Date;
};

export type InsertSponsorshipStartedArgs = {
  petId: string;
  /** The consent case, still open at this instant (attachment: requires-open). */
  requestCaseId: string;
  requestCasePublicCode: string;
  /** The `shelter_custody` row this sponsorship opened — payload.ownership_id. */
  ownershipId: string;
  listingCaseId: string | null;
  consentedByUserId: string;
  recordedByUserId: string;
  orgId: string;
  orgVerified: boolean;
  now: Date;
};

export type CloseRequestCaseArgs = {
  caseId: string;
  reason: "resolved" | "cancelled";
  closedByUserId: string;
  decision: "accepted" | "declined";
  organizationId: string;
  /** The `case_closed` timeline note the titular reads (spec REQ-5). */
  timelineNote: string;
  now: Date;
};

export interface RehomeAnswerPort {
  findRequestCaseByPublicCode(publicCode: string): Promise<RequestCase | null>;
  /** Re-read under `SELECT ... FOR UPDATE`: the pre-transaction read is stale. */
  lockRequestCase(caseId: string, tx: unknown): Promise<RequestCase | null>;
  findPetById(petId: string, tx?: unknown): Promise<PetSummary | null>;
  /** The ACCEPTING org, re-read inside the transaction (ADR-1 step 1b). */
  findOrgById(orgId: string, tx?: unknown): Promise<SponsorOrg | null>;
  /**
   * The titular's live `owner` row, under `SELECT ... FOR UPDATE` (ADR-1 step
   * 2). A transfer committing between this read and the custody insert would
   * otherwise grant custody on an ex-owner's consent; the lock makes the
   * transfer's own close of the row wait behind this transaction.
   */
  lockLiveOwnerRow(petId: string, userId: string, tx: unknown): Promise<{ id: string } | null>;
  countLiveShelterCustody(petId: string, tx: unknown): Promise<number>;
  findDisplayName(userId: string): Promise<string | null>;
  insertShelterCustody(args: InsertShelterCustodyArgs, tx: unknown): Promise<{ id: string }>;
  /** Reuses the adoption writer: sets eligibility, emits its event, opens the listing case. */
  markEligibleAndOpenListing(
    args: MarkEligibleArgs,
    tx: unknown,
  ): Promise<{ listingCaseId: string | null }>;
  publishListing(args: { petId: string; now: Date }, tx: unknown): Promise<void>;
  insertSponsorshipStarted(args: InsertSponsorshipStartedArgs, tx: unknown): Promise<void>;
  closeRequestCase(args: CloseRequestCaseArgs, tx: unknown): Promise<void>;
}

export type RehomeRepositoryPort = RehomeRequestPort & RehomeAnswerPort;
