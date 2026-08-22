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
// Three parts: the REQUEST part (the titular asks), the ANSWER part (the org
// accepts or declines) and the WITHDRAW part (the titular cancels a pending
// request or ends a running sponsorship). Each use-case depends on its own
// part only.

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
  /** A time-boxed ineligibility left by an earlier custodian (accept step 4, L-3). */
  adoptionIneligibleUntil: Date | null;
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
  /** `withdrawn` is the titular's own cancel before an answer (REQ-3). */
  decision: "accepted" | "declined" | "withdrawn";
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
  /**
   * The ACCEPTING org, re-read inside the transaction under `SELECT ... FOR
   * SHARE` (ADR-1 step 1b). A de-verification committing between a plain read
   * and the custody insert would otherwise be signed `verified: true`.
   */
  lockOrgForShare(orgId: string, tx: unknown): Promise<SponsorOrg | null>;
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

/** The unmatched `rehome_sponsorship_started`, keyed on the spine. */
export type OpenSponsorshipRef = { ownershipId: string; sponsoringOrganizationId: string };

export type EndSponsorshipByTitularArgs = { petId: string; titularUserId: string; now: Date };

export type CloseListingCaseArgs = {
  caseId: string;
  closedByUserId: string;
  organizationId: string;
  /** The `case_closed` timeline note both the titular and the org read. */
  timelineNote: string;
  now: Date;
};

/**
 * An application the titular's withdraw leaves with nothing to wait for:
 * PENDING (never reviewed) or APPROVED but not finalized. The two are closed
 * differently — see `closeApplicationByTitular`.
 */
export type StrandedApplication = {
  applicationId: string;
  applicantUserId: string;
  approved: boolean;
};

export type CloseApplicationByTitularArgs = {
  petId: string;
  petName: string;
  application: StrandedApplication;
  titularUserId: string;
  organizationId: string;
  organizationDisplayName: string;
  now: Date;
};

export interface RehomeWithdrawPort {
  findPetByToken(publicToken: string): Promise<PetSummary | null>;
  findLiveOwnerRow(petId: string, userId: string, tx?: unknown): Promise<{ id: string } | null>;
  /** The titular's live `owner` row, FOR UPDATE: the withdraw is the titular's act and no one else's. */
  lockLiveOwnerRow(petId: string, userId: string, tx: unknown): Promise<{ id: string } | null>;
  findOrgById(orgId: string, tx?: unknown): Promise<SponsorOrg | null>;
  orgAdminAndCoordinatorUserIds(orgId: string): Promise<string[]>;
  findDisplayName(userId: string): Promise<string | null>;
  // --- withdraw an active sponsorship ---
  findOpenSponsorshipForPet(petId: string, tx: unknown): Promise<OpenSponsorshipRef | null>;
  /** Closes the custody row the sponsorship opened. `ended: false` when it was already closed. */
  endCustodyRow(ownershipId: string, now: Date, tx: unknown): Promise<{ ended: boolean }>;
  /** Clears `adoptionListedAt` and `adoptionListingPausedAt` — the adoption writer, reused. */
  unpublishListing(args: { petId: string; now: Date }, tx: unknown): Promise<void>;
  /** `rehome_sponsorship_ended{withdrawn_by_titular}`, signed by the titular. */
  endSponsorshipByTitular(args: EndSponsorshipByTitularArgs, tx: unknown): Promise<void>;
  findOpenListingCase(
    petId: string,
    orgId: string,
    tx: unknown,
  ): Promise<{ id: string; publicCode: string } | null>;
  /** `won: false` when another closer got there first — the note is then NOT written. */
  closeListingCase(args: CloseListingCaseArgs, tx: unknown): Promise<{ won: boolean }>;
  /** Every application on the listing the withdraw is about to close. */
  findApplicationsOnListing(petId: string, tx: unknown): Promise<StrandedApplication[]>;
  /**
   * Closes one stranded application: a PENDING one gets an auto-generated
   * `adoption_application_resolved{rejected, reason: listing_withdrawn_by_titular}`
   * signed by the titular; an APPROVED one keeps its approval as the single
   * resolution on the spine. Both get their `adoption_application` case closed.
   */
  closeApplicationByTitular(args: CloseApplicationByTitularArgs, tx: unknown): Promise<void>;
  // --- cancel a pending request ---
  findOpenRequestForPet(petId: string): Promise<RequestCase | null>;
  lockRequestCase(caseId: string, tx: unknown): Promise<RequestCase | null>;
  closeRequestCase(args: CloseRequestCaseArgs, tx: unknown): Promise<void>;
}

export type RehomeRepositoryPort = RehomeRequestPort & RehomeAnswerPort & RehomeWithdrawPort;
