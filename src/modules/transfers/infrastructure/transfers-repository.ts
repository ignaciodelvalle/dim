// TransfersRepository — thin Drizzle wrapper for all three transfer sub-flows.
// All write methods accept an optional `tx` parameter for use inside
// db.transaction(), mirroring the openCase(input, tx) pattern from foster.
// No auth logic — auth lives at the action / use-case edge.

import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";

import {
  cases,
  custodyDisputes,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  petTransfers,
  pets,
  profiles,
} from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { closeCase, findOpenCaseForPetAndKind, openCase } from "@/lib/infra/case-helpers";
import { findLiveOrgShelterCustody } from "@/lib/infra/org-custody";
import {
  type OpenSponsorship,
  findOpenSponsorship,
} from "@/src/modules/adoption/infrastructure/rehome-sponsorship-writer";
import type { OpenedReason } from "@/src/modules/cases/domain/opened-reason";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

type PetRow = typeof pets.$inferSelect;
type OwnershipRow = typeof ownerships.$inferSelect;
type PetTransferRow = typeof petTransfers.$inferSelect;
type CaseRow = typeof cases.$inferSelect;

// ---------------------------------------------------------------------------
// Owner-flow types
// ---------------------------------------------------------------------------

type InsertPetTransferArgs = {
  publicToken: string;
  petId: string;
  fromOwnerId: string;
  toOwnerId: string | null;
  toOwnerEmail: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  reason: "sale" | "gift" | "inheritance" | "other" | null;
  note: string | null;
  expiresAt: Date;
};

type UpdateTransferStatusArgs = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  respondedAt?: Date;
  toOwnerId?: string | null;
  rejectionReason?: string | null;
  /**
   * When set, the UPDATE only fires for rows whose current status matches.
   * Returns the number of rows actually updated so callers can detect a
   * lost race (zero rows = another writer already moved the transfer).
   */
  expectedStatus?: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
};

type InsertOwnerOwnershipArgs = {
  petId: string;
  ownerUserId: string;
  startedAt?: Date;
};

// ---------------------------------------------------------------------------
// Cross-org flow types
// ---------------------------------------------------------------------------

type OpenHandshakeCaseArgs = {
  petId: string;
  jurisdictionProvince?: string | null;
  jurisdictionLocality?: string | null;
  openedByUserId: string;
  openedByOrganizationId: string;
  receiverOrganizationId: string;
  openedReason: OpenedReason;
};

// ---------------------------------------------------------------------------
// Shared event type
// ---------------------------------------------------------------------------

type AuthorRole = "owner" | "vet" | "govt" | "scanner" | "finder" | "shelter" | "system";

type InsertPetEventArgs = {
  id?: string;
  petId: string;
  eventType: string;
  occurredAt: Date;
  recordedAt: Date;
  recordedByUserId: string | null;
  authorRole: AuthorRole;
  authorOrganizationId?: string | null;
  authorVerified?: boolean | null;
  payload: Record<string, unknown>;
  caseId?: string | null;
};

// ---------------------------------------------------------------------------
// Direct-transfer types
// ---------------------------------------------------------------------------

type InsertShelterCustodyArgs = {
  petId: string;
  ownerOrganizationId: string;
  role?: "shelter_custody" | "owner";
  startedAt?: Date;
  transferredFromId?: string | null;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const TransfersRepository = {
  // -------------------------------------------------------------------------
  // Shared reads
  // -------------------------------------------------------------------------

  /**
   * Finds a pet by its public token. Returns the full pet row or null.
   */
  async findPetByToken(publicToken: string, tx?: Tx): Promise<PetRow | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select()
      .from(pets)
      .where(eq(pets.publicToken, publicToken))
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns a pet's publicToken given its UUID id. Used for cache revalidation
   * after transfers where only petId is available. Returns null if not found.
   */
  async findPetPublicTokenById(petId: string, tx?: Tx): Promise<string | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ publicToken: pets.publicToken })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    return row?.publicToken ?? null;
  },

  /**
   * Returns a pet's transferability snapshot (status + inCustodyDispute) given
   * its UUID id. Used to RE-RUN the initiate-time pet guards under the accept
   * lock (TR-C1) — the initiate-time state is stale by the time the recipient
   * accepts. Returns null if the pet is gone.
   */
  async findPetStatusById(
    petId: string,
    tx?: Tx,
  ): Promise<{ status: PetRow["status"]; inCustodyDispute: boolean } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ status: pets.status, inCustodyDispute: pets.inCustodyDispute })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Finds the active (endedAt IS NULL) owner ownership row for a pet.
   */
  async findActiveOwnerOwnership(
    petId: string,
    tx?: Tx,
  ): Promise<Pick<OwnershipRow, "id" | "ownerUserId"> | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .where(
        and(eq(ownerships.petId, petId), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Looks up a user id by email via the Supabase Auth admin SDK (listUsers).
   * Returns the user id if found, null otherwise. Best-effort — errors are
   * swallowed and return null so the transfer can proceed as an open invite.
   */
  async findUserIdByEmail(email: string): Promise<string | null> {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = list?.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      return match?.id ?? null;
    } catch {
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // Owner-flow: pet transfer table
  // -------------------------------------------------------------------------

  /**
   * Inserts a new pet_transfers row.
   */
  async insertPetTransfer(args: InsertPetTransferArgs, tx?: Tx): Promise<void> {
    const client: DbOrTx = tx ?? db;
    await (client as typeof db).insert(petTransfers).values(args);
  },

  /**
   * Finds a transfer by its public token.
   */
  async findTransferByToken(publicToken: string, tx?: Tx): Promise<PetTransferRow | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select()
      .from(petTransfers)
      .where(eq(petTransfers.publicToken, publicToken))
      .limit(1);
    return row ?? null;
  },

  /**
   * Locks and reads a transfer row by id (SELECT ... FOR UPDATE) inside a tx.
   * The row lock serializes concurrent accept/expire writers so the in-tx
   * status re-check is authoritative (mirrors the FOR UPDATE pattern from
   * app/actions/pet-claim.ts::submitFreeClaimAction). MUST be called with a
   * transaction client.
   */
  async findTransferByIdForUpdate(id: string, tx: Tx): Promise<PetTransferRow | null> {
    const [row] = await tx
      .select()
      .from(petTransfers)
      .where(eq(petTransfers.id, id))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  /**
   * Finds a transfer with joined pet and sender profile data for the viewer page.
   * Auth is handled by the caller (use-case + action edge).
   */
  async findTransferViewByToken(publicToken: string): Promise<{
    transfer: PetTransferRow;
    petName: string;
    petToken: string;
    fromDisplayName: string | null;
  } | null> {
    const [row] = await db
      .select({
        transfer: petTransfers,
        petName: pets.name,
        petToken: pets.publicToken,
        fromDisplayName: profiles.displayName,
      })
      .from(petTransfers)
      .innerJoin(pets, eq(pets.id, petTransfers.petId))
      .leftJoin(profiles, eq(profiles.id, petTransfers.fromOwnerId))
      .where(eq(petTransfers.publicToken, publicToken))
      .limit(1);
    return row ?? null;
  },

  /**
   * Updates the status (and optional fields) of a pet transfer.
   *
   * When `expectedStatus` is provided, the UPDATE is guarded by a
   * `status = expectedStatus` predicate so a row whose status was already
   * flipped by a concurrent writer is left untouched. Returns the number of
   * rows affected (0 = lost race) so the caller can abort instead of trusting
   * a stale pre-tx read.
   */
  async updateTransferStatus(args: UpdateTransferStatusArgs, tx?: Tx): Promise<number> {
    const client: DbOrTx = tx ?? db;
    const now = new Date();
    const updated = await (client as typeof db)
      .update(petTransfers)
      .set({
        status: args.status,
        respondedAt: args.respondedAt ?? now,
        ...(args.toOwnerId !== undefined ? { toOwnerId: args.toOwnerId } : {}),
        ...(args.rejectionReason !== undefined ? { rejectionReason: args.rejectionReason } : {}),
        updatedAt: now,
      })
      .where(
        args.expectedStatus !== undefined
          ? and(eq(petTransfers.id, args.id), eq(petTransfers.status, args.expectedStatus))
          : eq(petTransfers.id, args.id),
      )
      .returning({ id: petTransfers.id });
    return updated.length;
  },

  /**
   * Returns pending transfers whose expiresAt is before `now`.
   * Per-row (not single tx) — callers iterate and expire one at a time.
   *
   * `limit` bounds the result (review 23 item 12): the scan used to load ALL
   * expired pending transfers, unbounded at scale. Expired rows flip out of the
   * 'pending' scope, so the caller drains the backlog across bounded passes.
   */
  async expirablePetTransfers(
    now: Date,
    limit?: number,
  ): Promise<
    Array<{
      id: string;
      petId: string;
      fromOwnerId: string;
      publicToken: string;
    }>
  > {
    const base = db
      .select({
        id: petTransfers.id,
        petId: petTransfers.petId,
        fromOwnerId: petTransfers.fromOwnerId,
        publicToken: petTransfers.publicToken,
      })
      .from(petTransfers)
      .where(
        and(
          eq(petTransfers.status, "pending"),
          sql`${petTransfers.expiresAt} < ${now.toISOString()}`,
        ),
      )
      .orderBy(asc(petTransfers.id));

    return limit ? base.limit(limit) : base;
  },

  // -------------------------------------------------------------------------
  // Owner-flow: ownership writes
  // -------------------------------------------------------------------------

  /**
   * Closes all active owner ownerships for a pet (endedAt = now).
   * PARITY QUIRK: must be called BEFORE insertOwnerOwnership to satisfy the
   * unique-active-owner partial index (validates at tx commit).
   */
  async closeOwnerOwnerships(petId: string, tx: Tx): Promise<void> {
    const now = new Date();
    await tx
      .update(ownerships)
      .set({ endedAt: now })
      .where(
        and(eq(ownerships.petId, petId), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
      );
  },

  /**
   * Inserts a new owner ownership row for a user.
   */
  async insertOwnerOwnership(args: InsertOwnerOwnershipArgs, tx: Tx): Promise<{ id: string }> {
    const [row] = await tx
      .insert(ownerships)
      .values({
        petId: args.petId,
        ownerUserId: args.ownerUserId,
        role: "owner",
        startedAt: args.startedAt ?? new Date(),
      })
      .returning({ id: ownerships.id });
    return row;
  },

  // -------------------------------------------------------------------------
  // Shared event write
  // -------------------------------------------------------------------------

  /**
   * Inserts a pet_event row. Accepts an optional `id` for the upfront-UUID
   * pattern required by the foster-cascade ordering in transferCustody.
   */
  async insertPetEvent(args: InsertPetEventArgs, tx?: Tx): Promise<{ id: string }> {
    const client: DbOrTx = tx ?? db;
    const payload = validateEventPayload(
      args.eventType as Parameters<typeof validateEventPayload>[0],
      args.payload,
    );
    const [row] = await (client as typeof db)
      .insert(petEvents)
      .values({
        ...(args.id ? { id: args.id } : {}),
        petId: args.petId,
        eventType: args.eventType,
        occurredAt: args.occurredAt,
        recordedAt: args.recordedAt,
        recordedByUserId: args.recordedByUserId,
        authorRole: args.authorRole,
        authorOrganizationId: args.authorOrganizationId ?? null,
        authorVerified: args.authorVerified ?? false,
        payload,
        caseId: args.caseId ?? null,
      })
      .returning({ id: petEvents.id });
    return row;
  },

  // -------------------------------------------------------------------------
  // Cross-org: reads
  // -------------------------------------------------------------------------

  /**
   * Returns the active shelter_custody ownership row for (petId, orgId), or null.
   */
  async findActiveShelterCustody(
    petId: string,
    orgId: string,
    tx?: Tx,
  ): Promise<{ id: string } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns the active `owner`-role ownership row an org holds on a pet, or
   * null. The owner-side mirror of findActiveShelterCustody — used to re-verify
   * the source still holds custody under the accept lock (TR-H1) when the
   * proposal's from_role is `owner` (santuario/decomiso handoff).
   */
  /**
   * The pet's live shelter_custody row held by ANY org (0195: at most one).
   * The accept path's owner-source branch needs it: that branch closes the
   * sender's `owner` row and opens the receiver's custody, and nothing in it
   * closes a third org's live custody — the insert would hit the index.
   */
  async findLiveOrgShelterCustody(
    petId: string,
    tx?: Tx,
  ): Promise<{ id: string; ownerOrganizationId: string } | null> {
    return findLiveOrgShelterCustody(petId, tx ?? db);
  },

  /**
   * The pet's open rehome sponsorship (rehome-by-titular), keyed on the spine:
   * an unmatched `rehome_sponsorship_started` naming the custody row it
   * opened. The predicate is adoption's, read from there rather than copied
   * (`transfers:adoption` in check-dependency-direction.ts). A cross-org
   * transfer must refuse to hand off that row — spec REQ-15.
   */
  async findOpenSponsorship(petId: string, tx?: Tx): Promise<OpenSponsorship | null> {
    return findOpenSponsorship(petId, (tx ?? db) as Tx);
  },

  async findActiveOwnerOwnershipForOrg(
    petId: string,
    orgId: string,
    tx?: Tx,
  ): Promise<{ id: string } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "owner"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns the receiver org row (id, displayName, verified, status) or null.
   */
  async findReceiverOrg(
    orgId: string,
    tx?: Tx,
  ): Promise<{ id: string; displayName: string; verified: boolean; status: string } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        verified: organizations.verified,
        status: organizations.status,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns the open handshake case for a pet, or null.
   */
  async findOpenHandshakeCase(petId: string, tx?: Tx): Promise<{ id: string } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ id: cases.id })
      .from(cases)
      .where(
        and(
          eq(cases.primaryPetId, petId),
          eq(cases.caseKind, "custody_transfer_handshake"),
          inArray(cases.status, ["open", "escalated"]),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Opens a custody_transfer_handshake case and returns the new case row.
   * Delegates to lib/case-helpers.openCase.
   */
  async openHandshakeCase(args: OpenHandshakeCaseArgs, tx: Tx): Promise<CaseRow> {
    return openCase(
      {
        kind: "custody_transfer_handshake",
        primarySubjectKind: "registered_pet",
        primaryPetId: args.petId,
        jurisdictionProvince: args.jurisdictionProvince,
        jurisdictionLocality: args.jurisdictionLocality,
        openedByUserId: args.openedByUserId,
        openedByOrganizationId: args.openedByOrganizationId,
        receiverOrganizationId: args.receiverOrganizationId,
        openedReason: args.openedReason,
      },
      tx,
    );
  },

  /**
   * Fetches proposal events for a case (LIMIT 2 — for duplicate-proposal guard).
   * Returns the two most recent `custody_transfer_proposed` events for the case.
   */
  async proposalEventsForCase(
    caseId: string,
    tx?: Tx,
  ): Promise<Array<typeof petEvents.$inferSelect>> {
    const client: DbOrTx = tx ?? db;
    return (client as typeof db)
      .select()
      .from(petEvents)
      .where(
        and(eq(petEvents.caseId, caseId), eq(petEvents.eventType, "custody_transfer_proposed")),
      )
      .orderBy(desc(petEvents.recordedAt))
      .limit(2);
  },

  /**
   * Ends the active shelter_custody row for (petId, orgId).
   */
  async endShelterCustody(petId: string, orgId: string, tx: Tx): Promise<void> {
    const now = new Date();
    await tx
      .update(ownerships)
      .set({ endedAt: now })
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );
  },

  /**
   * Ends the active `owner`-role ownership held by an org on a pet (endedAt=now).
   * Mirrors endShelterCustody but for the permanent-owner source side — a
   * santuario/decomiso org handing off a pet it held as `owner`. Used by
   * acceptCrossOrgTransfer when the proposal's from_role is `owner`.
   */
  async endOwnerOwnershipForOrg(petId: string, orgId: string, tx: Tx): Promise<void> {
    const now = new Date();
    await tx
      .update(ownerships)
      .set({ endedAt: now })
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.ownerOrganizationId, orgId),
          eq(ownerships.role, "owner"),
          isNull(ownerships.endedAt),
        ),
      );
  },

  /**
   * Inserts a new shelter_custody row for an org.
   */
  async insertShelterCustody(args: InsertShelterCustodyArgs, tx: Tx): Promise<{ id: string }> {
    const [row] = await tx
      .insert(ownerships)
      .values({
        petId: args.petId,
        ownerOrganizationId: args.ownerOrganizationId,
        role: args.role ?? "shelter_custody",
        startedAt: args.startedAt ?? new Date(),
        transferredFromId: args.transferredFromId ?? null,
      })
      .returning({ id: ownerships.id });
    return row;
  },

  /**
   * Resolve an org's publicToken by id — for notification ctaUrls targeting the
   * org portal (org members cannot read custody_transfer_handshake cases via
   * /casos, so their CTAs must point inside /org/{token}/...). Null when missing.
   */
  async orgPublicTokenById(orgId: string, tx?: Tx): Promise<string | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row?.publicToken ?? null;
  },

  /**
   * Returns (userId, orgId) for active admin+coordinator members of an org.
   */
  async orgCoordinatorAdminUserIds(orgId: string, tx?: Tx): Promise<Array<{ userId: string }>> {
    const client: DbOrTx = tx ?? db;
    return (client as typeof db)
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          inArray(organizationMemberships.role, ["admin", "coordinator"]),
          isNull(organizationMemberships.leftAt),
        ),
      );
  },

  // -------------------------------------------------------------------------
  // Cross-org: case helpers (delegates to lib)
  // -------------------------------------------------------------------------

  /**
   * Closes a case with the given reason. Delegates to lib/case-helpers.closeCase.
   */
  async closeCase(
    args: { caseId: string; reason: string; closedByUserId?: string | null },
    tx: Tx,
  ): Promise<void> {
    await closeCase(
      {
        caseId: args.caseId,
        reason: args.reason as Parameters<typeof closeCase>[0]["reason"],
        closedByUserId: args.closedByUserId,
      },
      tx,
    );
  },

  /**
   * Finds the open custody_episode case for a pet, or null.
   * Delegates to lib/case-helpers.findOpenCaseForPetAndKind.
   */
  async findOpenCustodyEpisode(petId: string): Promise<{ id: string } | null> {
    return findOpenCaseForPetAndKind(petId, "custody_episode");
  },

  // -------------------------------------------------------------------------
  // Direct org-to-org: reads
  // -------------------------------------------------------------------------

  /**
   * Finds a pet currently under active ownership by the given org, returning
   * both the pet row and the ownership id + role.
   * Scoped to organization.id — this is the implicit-org security boundary
   * for the direct handoff flow.
   */
  async findPetUnderOrg(
    petPublicToken: string,
    orgId: string,
    tx?: Tx,
  ): Promise<{ pet: PetRow; ownershipId: string; ownershipRole: string } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({
        pet: pets,
        ownershipId: ownerships.id,
        ownershipRole: ownerships.role,
      })
      .from(pets)
      .innerJoin(ownerships, eq(ownerships.petId, pets.id))
      .where(
        and(
          eq(pets.publicToken, petPublicToken),
          eq(ownerships.ownerOrganizationId, orgId),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns the active foster row for a pet (null if none).
   */
  async findActiveFosterRow(
    petId: string,
    tx?: Tx,
  ): Promise<{ id: string; ownerUserId: string | null } | null> {
    const client: DbOrTx = tx ?? db;
    const [row] = await (client as typeof db)
      .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .where(
        and(eq(ownerships.petId, petId), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Returns admin user ids for an org (admins only, not coordinators —
   * direct handoff follows admin-only fanout per spec R11).
   */
  async orgAdminUserIds(orgId: string, tx?: Tx): Promise<Array<{ userId: string }>> {
    const client: DbOrTx = tx ?? db;
    return (client as typeof db)
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.role, "admin"),
          isNull(organizationMemberships.leftAt),
        ),
      );
  },

  /**
   * Closes a single ownership row by id (used to close the source row in
   * direct handoffs).
   */
  async closeOwnershipById(ownershipId: string, endedAt: Date, tx: Tx): Promise<void> {
    await tx.update(ownerships).set({ endedAt }).where(eq(ownerships.id, ownershipId));
  },

  /**
   * Closes the active foster row for a pet.
   */
  async closeFosterOwnership(ownershipId: string, endedAt: Date, tx: Tx): Promise<void> {
    await tx.update(ownerships).set({ endedAt }).where(eq(ownerships.id, ownershipId));
  },

  /**
   * Inserts notifications in batch (used post-tx for best-effort fanout).
   */
  async insertNotifications(values: Array<typeof notifications.$inferInsert>): Promise<void> {
    if (values.length === 0) return;
    await db.insert(notifications).values(values);
  },

  // -------------------------------------------------------------------------
  // Cross-org: additional reads (needed by use-cases)
  // -------------------------------------------------------------------------

  /**
   * Finds an open custody dispute for a pet, or null.
   */
  async findOpenDispute(petId: string): Promise<{ id: string } | null> {
    const [row] = await db
      .select({ id: custodyDisputes.id })
      .from(custodyDisputes)
      .where(and(eq(custodyDisputes.petId, petId), eq(custodyDisputes.status, "open")))
      .limit(1);
    return row ?? null;
  },

  /**
   * Finds a case by its public code. Used by cross-org accept/reject/cancel.
   */
  async findCaseByPublicCode(publicCode: string): Promise<typeof cases.$inferSelect | null> {
    const [row] = await db.select().from(cases).where(eq(cases.publicCode, publicCode)).limit(1);
    return row ?? null;
  },

  /**
   * Acquires a transaction-scoped advisory lock keyed on the pet id. Serializes
   * concurrent custody writers (cross-org accept vs reject/cancel/expire) on the
   * same pet so an in-tx status re-check is authoritative. Auto-released at tx
   * commit/rollback. Mirrors the pg_advisory_xact_lock(hashtext(petId)) pattern
   * used by the return-to-owner writers.
   */
  async acquirePetAdvisoryLock(petId: string, tx: Tx): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${petId}))`);
  },

  /**
   * Re-reads a case's status inside a transaction. Used under the advisory lock
   * to re-check the case is still open BEFORE any destructive custody write —
   * the pre-tx status read is stale and a concurrent reject/cancel/expire may
   * have closed the case after it.
   */
  async caseStatusById(caseId: string, tx: Tx): Promise<string | null> {
    const [row] = await tx
      .select({ status: cases.status })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);
    return row?.status ?? null;
  },

  // -------------------------------------------------------------------------
  // Cross-org expiry helpers (moved from lib/case-closers)
  // -------------------------------------------------------------------------

  /**
   * Returns open custody_transfer_handshake cases opened more than
   * `staleAfterDays` days ago (default 30). Used by the expire cron.
   */
  async findExpirableCrossOrgCases(options?: {
    now?: Date;
    staleAfterDays?: number;
    /** Keyset cursor: only return cases whose id sorts after this value. */
    afterId?: string | null;
    /** Max rows to return (keyset page size). Omit for no limit. */
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      publicCode: string;
      primaryPetId: string | null;
      openedByOrganizationId: string | null;
      receiverOrganizationId: string | null;
    }>
  > {
    const now = options?.now ?? new Date();
    const staleAfterMs = (options?.staleAfterDays ?? 30) * 24 * 60 * 60 * 1000;
    const openedBefore = new Date(now.getTime() - staleAfterMs);

    const base = db
      .select({
        id: cases.id,
        publicCode: cases.publicCode,
        primaryPetId: cases.primaryPetId,
        openedByOrganizationId: cases.openedByOrganizationId,
        receiverOrganizationId: cases.receiverOrganizationId,
      })
      .from(cases)
      .where(
        and(
          eq(cases.caseKind, "custody_transfer_handshake"),
          eq(cases.status, "open"),
          lt(cases.openedAt, openedBefore),
          ...(options?.afterId ? [gt(cases.id, options.afterId)] : []),
        ),
      )
      .orderBy(asc(cases.id));

    return options?.limit ? base.limit(options.limit) : base;
  },

  /**
   * Expires a single cross-org transfer case in its own tx.
   * Mirrors the logic from lib/case-closers/expire-cross-org-transfers.ts
   * (expireCrossOrgTransfer). The lib shim remains until callers repointed.
   */
  async expireOneCrossOrgCase(
    candidate: {
      id: string;
      publicCode: string;
      primaryPetId: string | null;
      openedByOrganizationId: string | null;
      receiverOrganizationId: string | null;
    },
    options?: { now?: Date },
  ): Promise<void> {
    const now = options?.now ?? new Date();

    await db.transaction(async (tx) => {
      // Re-check status inside tx so a concurrent accept/reject wins.
      const [current] = await tx
        .select({ status: cases.status })
        .from(cases)
        .where(eq(cases.id, candidate.id))
        .limit(1);
      if (!current || current.status !== "open") return;

      // Resolve receiver: canonical column first, payload fallback for legacy rows.
      let receiverOrgId: string | null = candidate.receiverOrganizationId;
      if (!receiverOrgId) {
        const [proposalEvent] = await tx
          .select({ payload: petEvents.payload })
          .from(petEvents)
          .where(
            and(
              eq(petEvents.caseId, candidate.id),
              eq(petEvents.eventType, "custody_transfer_proposed"),
            ),
          )
          .limit(1);
        if (proposalEvent) {
          const p = proposalEvent.payload as { to_organization_id?: string };
          receiverOrgId = p.to_organization_id ?? null;
        }
      }

      if (candidate.primaryPetId) {
        const notePayload = validateEventPayload("note_added", {
          category: "system",
          text: "Auto-expirada: el destinatario no respondió la propuesta en el plazo de 30 días.",
        });
        await tx.insert(petEvents).values({
          petId: candidate.primaryPetId,
          eventType: "note_added",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: null,
          authorRole: "system",
          payload: notePayload,
          caseId: candidate.id,
        });
      }

      await closeCase({ caseId: candidate.id, reason: "auto_expired" }, tx);

      // Notify coordinators on both sides (inside tx — cron has no post-tx flush).
      const orgIds = [candidate.openedByOrganizationId, receiverOrgId].filter(
        (id): id is string => typeof id === "string",
      );
      if (orgIds.length > 0) {
        const recipients = await tx
          .select({
            userId: organizationMemberships.userId,
            orgId: organizationMemberships.organizationId,
          })
          .from(organizationMemberships)
          .where(
            and(
              inArray(organizationMemberships.organizationId, orgIds),
              inArray(organizationMemberships.role, ["admin", "coordinator"]),
              isNull(organizationMemberships.leftAt),
            ),
          );
        if (recipients.length > 0) {
          await tx.insert(notifications).values(
            recipients.map((r) => ({
              userId: r.userId,
              notificationType:
                r.orgId === candidate.openedByOrganizationId
                  ? ("cross_org_transfer_expired_sender" as const)
                  : ("cross_org_transfer_expired_receiver" as const),
              severity: "warning" as const,
              title: "Propuesta de transferencia expirada",
              body: "Pasaron 30 días sin respuesta. La propuesta se cerró automáticamente.",
              ctaLabel: "Ver caso",
              ctaUrl: `/casos/${candidate.publicCode}`,
              relatedCaseId: candidate.id,
              relatedPetId: candidate.primaryPetId,
            })),
          );
        }
      }
      // No audit_log entry — actor is system; note_added + closed case row is the trail.
    });
  },
};
