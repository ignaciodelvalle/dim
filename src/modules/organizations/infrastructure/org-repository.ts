// OrgRepository — Drizzle wrapper for all organization write/read operations.
//
// Follows the same pattern as src/modules/cases/infrastructure/cases-repository.ts:
//   - Returns Drizzle rows (no per-table DTOs).
//   - Methods accept an optional tx executor for atomicity.
//   - No auth logic — auth lives at the action edge (authz-resolver.ts).
//
// tx-threaded methods: insertMembership, lockActiveAdmins, insertInvite,
// lockInviteByToken, markInviteAccepted, insertGrant, updateGrant, adminRecipients,
// clearPrimaryScoped, setPrimaryScoped.

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  type Organization,
  type OrganizationCapabilityGrant,
  type OrganizationCoverage,
  type OrganizationInvitation,
  type OrganizationMembership,
  db,
  organizationCapabilityGrants,
  organizationCoverage,
  organizationInvitations,
  organizationMemberships,
  organizations,
  profiles,
} from "@/db";

// ---------------------------------------------------------------------------
// Executor type — mirrors CasesRepository idiom (foster/transfers pattern)
// ---------------------------------------------------------------------------

export type Exec = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface InsertMembershipInput {
  userId: string;
  organizationId: string;
  role: OrganizationMembership["role"];
  joinedAt?: Date;
  invitedByUserId?: string | null;
  canWritePetEvents?: boolean;
}

export interface InsertCoverageInput {
  organizationId: string;
  province: string;
  locality: string | null;
  isPrimary?: boolean;
}

export interface InsertGrantInput {
  membershipId: string;
  organizationId: string;
  capability: string;
  status?: OrganizationCapabilityGrant["status"];
  requestedReason?: string | null;
}

// ---------------------------------------------------------------------------
// OrgRepository
// ---------------------------------------------------------------------------

export class OrgRepository {
  // ---------------------------------------------------------------------------
  // Organization profile
  // ---------------------------------------------------------------------------

  /**
   * Update whitelisted organization profile fields.
   * Fields not in the whitelist (orgType, verified, status, publicToken,
   * jurisdiction) are silently excluded by only accepting the intersection.
   */
  async updateOrgProfile(
    orgId: string,
    fields: Partial<
      Pick<
        Organization,
        | "displayName"
        | "legalName"
        | "email"
        | "phone"
        | "website"
        | "description"
        | "personeriaJuridicaNumber"
        | "tier0ShowOriginOrg"
      >
    > & { updatedAt?: Date },
    e: Exec = db,
  ): Promise<void> {
    await e
      .update(organizations)
      .set({ ...fields, updatedAt: fields.updatedAt ?? new Date() })
      .where(eq(organizations.id, orgId));
  }

  /**
   * Find an organization by its public token + return the membership for userId.
   * Used by requireOrgAccessByToken (inner writer re-check pattern).
   */
  async findMembershipByUserAndOrgToken(
    userId: string,
    orgToken: string,
  ): Promise<{ org: Organization; membership: OrganizationMembership } | null> {
    const [row] = await db
      .select({ org: organizations, membership: organizationMemberships })
      .from(organizations)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, organizations.id),
          eq(organizationMemberships.userId, userId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .where(eq(organizations.publicToken, orgToken))
      .limit(1);
    return row ?? null;
  }

  // ---------------------------------------------------------------------------
  // Membership
  // ---------------------------------------------------------------------------

  /**
   * Returns the active membership row (leftAt IS NULL) for (orgId, membershipId),
   * or null if not found / already left.
   */
  async findActiveMembership(
    orgId: string,
    membershipId: string,
    e: Exec = db,
  ): Promise<OrganizationMembership | null> {
    const [row] = await e
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(organizationMemberships.organizationId, orgId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Soft-delete a membership by setting leftAt = now().
   */
  async softLeave(membershipId: string, e: Exec = db): Promise<void> {
    await e
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(eq(organizationMemberships.id, membershipId));
  }

  /**
   * Update the role of a membership.
   */
  async setRole(
    membershipId: string,
    role: OrganizationMembership["role"],
    e: Exec = db,
  ): Promise<void> {
    await e
      .update(organizationMemberships)
      .set({ role })
      .where(eq(organizationMemberships.id, membershipId));
  }

  /**
   * Update canWritePetEvents on a membership.
   */
  async setEventWrite(
    membershipId: string,
    canWritePetEvents: boolean,
    e: Exec = db,
  ): Promise<void> {
    await e
      .update(organizationMemberships)
      .set({ canWritePetEvents })
      .where(eq(organizationMemberships.id, membershipId));
  }

  /**
   * SELECT ... FOR UPDATE on all active admin memberships of an org.
   * Must be called inside a transaction. Returns { id }[] for lock + count check.
   * Called BEFORE self/rank checks per spec parity.
   */
  async lockActiveAdmins(orgId: string, tx: Exec): Promise<{ id: string }[]> {
    return tx
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.role, "admin"),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .for("update");
  }

  /**
   * Insert a new membership. Returns the new membership ID.
   * Accepts optional tx for atomicity with invite acceptance.
   */
  async insertMembership(values: InsertMembershipInput, tx: Exec = db): Promise<string> {
    const [row] = await tx
      .insert(organizationMemberships)
      .values({
        userId: values.userId,
        organizationId: values.organizationId,
        role: values.role,
        joinedAt: values.joinedAt ?? new Date(),
        invitedByUserId: values.invitedByUserId ?? null,
        canWritePetEvents: values.canWritePetEvents ?? false,
      })
      .returning({ id: organizationMemberships.id });
    if (!row) throw new Error("insertMembership: no row returned");
    return row.id;
  }

  // ---------------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------------

  /**
   * Find an active (not accepted, not revoked) invitation for (orgId, email).
   * Case-insensitive email match (lower() on both sides).
   * Returns null if not found.
   */
  async findActiveInvite(orgId: string, email: string): Promise<OrganizationInvitation | null> {
    const [row] = await db
      .select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, orgId),
          sql`lower(${organizationInvitations.email}) = lower(${email})`,
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * SELECT ... FOR UPDATE on an invitation by token.
   * Must be called inside a transaction (invite-accept lock pattern).
   */
  async lockInviteByToken(token: string, tx: Exec): Promise<OrganizationInvitation | null> {
    const [row] = await tx
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.invitationToken, token))
      .for("update")
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert a new invitation row. Returns the new invitation.
   */
  async insertInvite(
    values: {
      organizationId: string;
      invitedByUserId: string;
      email: string;
      invitedRole: OrganizationMembership["role"];
      invitationToken: string;
      canWritePetEvents?: boolean;
      expiresAt?: Date;
    },
    e: Exec = db,
  ): Promise<OrganizationInvitation> {
    const [row] = await e
      .insert(organizationInvitations)
      .values({
        organizationId: values.organizationId,
        invitedByUserId: values.invitedByUserId,
        email: values.email,
        invitedRole: values.invitedRole,
        invitationToken: values.invitationToken,
        canWritePetEvents: values.canWritePetEvents ?? false,
        expiresAt: values.expiresAt,
      })
      .returning();
    if (!row) throw new Error("insertInvite: no row returned");
    return row;
  }

  /**
   * Mark an invitation as accepted (sets acceptedAt + acceptedByUserId).
   */
  async markInviteAccepted(invitationId: string, userId: string, tx: Exec): Promise<void> {
    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date(), acceptedByUserId: userId })
      .where(eq(organizationInvitations.id, invitationId));
  }

  /**
   * Revoke an invitation (sets revokedAt).
   */
  async setInviteRevoked(invitationId: string, e: Exec = db): Promise<void> {
    await e
      .update(organizationInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(organizationInvitations.id, invitationId));
  }

  // ---------------------------------------------------------------------------
  // Coverage zones
  // ---------------------------------------------------------------------------

  /**
   * Find a duplicate coverage zone for (orgId, province, locality).
   * Returns null if no duplicate exists.
   */
  async findDupCoverage(
    orgId: string,
    province: string,
    locality: string | null,
  ): Promise<OrganizationCoverage | null> {
    const conditions = [
      eq(organizationCoverage.organizationId, orgId),
      eq(organizationCoverage.jurisdictionProvince, province),
      locality === null
        ? isNull(organizationCoverage.jurisdictionLocality)
        : eq(organizationCoverage.jurisdictionLocality, locality),
    ];

    const [row] = await db
      .select()
      .from(organizationCoverage)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  /**
   * Insert a coverage zone. Returns the new row.
   */
  async insertCoverage(values: InsertCoverageInput, e: Exec = db): Promise<OrganizationCoverage> {
    const [row] = await e
      .insert(organizationCoverage)
      .values({
        organizationId: values.organizationId,
        jurisdictionProvince: values.province,
        jurisdictionLocality: values.locality ?? null,
        isPrimary: values.isPrimary ?? false,
      })
      .returning();
    if (!row) throw new Error("insertCoverage: no row returned");
    return row;
  }

  /**
   * Delete a coverage zone owned by orgId (ownership folded into WHERE — no TOCTOU).
   * Returns the deleted rows (empty if id not found or wrong org).
   */
  async deleteCoverageScoped(
    coverageId: string,
    orgId: string,
    e: Exec = db,
  ): Promise<OrganizationCoverage[]> {
    return e
      .delete(organizationCoverage)
      .where(
        and(
          eq(organizationCoverage.id, coverageId),
          eq(organizationCoverage.organizationId, orgId),
        ),
      )
      .returning();
  }

  /**
   * Clear isPrimary on all coverage zones for an org (inside tx for setPrimary).
   */
  async clearPrimaryScoped(orgId: string, tx: Exec): Promise<void> {
    await tx
      .update(organizationCoverage)
      .set({ isPrimary: false })
      .where(eq(organizationCoverage.organizationId, orgId));
  }

  /**
   * Set isPrimary on a specific coverage zone (org-scoped WHERE — no TOCTOU).
   * Returns the updated rows (empty if id not found or wrong org).
   */
  async setPrimaryScoped(
    coverageId: string,
    orgId: string,
    tx: Exec,
  ): Promise<OrganizationCoverage[]> {
    return tx
      .update(organizationCoverage)
      .set({ isPrimary: true })
      .where(
        and(
          eq(organizationCoverage.id, coverageId),
          eq(organizationCoverage.organizationId, orgId),
        ),
      )
      .returning();
  }

  // ---------------------------------------------------------------------------
  // Capability grants
  // ---------------------------------------------------------------------------

  /**
   * Insert a new capability grant row.
   */
  async insertGrant(values: InsertGrantInput, tx: Exec = db): Promise<OrganizationCapabilityGrant> {
    const [row] = await tx
      .insert(organizationCapabilityGrants)
      .values({
        membershipId: values.membershipId,
        organizationId: values.organizationId,
        capability: values.capability,
        status: values.status ?? "pending",
        requestedReason: values.requestedReason ?? null,
      })
      .returning();
    if (!row) throw new Error("insertGrant: no row returned");
    return row;
  }

  /**
   * Update a capability grant (status, decidedAt, decidedByUserId, decisionReason).
   */
  async updateGrant(
    grantId: string,
    fields: {
      status: OrganizationCapabilityGrant["status"];
      decidedAt: Date;
      decidedByUserId: string;
      decisionReason?: string | null;
    },
    tx: Exec = db,
  ): Promise<void> {
    await tx
      .update(organizationCapabilityGrants)
      .set({
        status: fields.status,
        decidedAt: fields.decidedAt,
        decidedByUserId: fields.decidedByUserId,
        decisionReason: fields.decisionReason ?? null,
      })
      .where(eq(organizationCapabilityGrants.id, grantId));
  }

  /**
   * Find a single grant by ID. Returns null if not found.
   */
  async findGrant(grantId: string): Promise<OrganizationCapabilityGrant | null> {
    const [row] = await db
      .select()
      .from(organizationCapabilityGrants)
      .where(eq(organizationCapabilityGrants.id, grantId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Returns userId of all active admin members of orgId.
   * Used to fan out capability_request notifications.
   */
  async adminRecipients(orgId: string, tx: Exec = db): Promise<{ userId: string }[]> {
    return tx
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.role, "admin"),
          isNull(organizationMemberships.leftAt),
        ),
      );
  }

  // ---------------------------------------------------------------------------
  // Methods added for WU-3 use-cases
  // ---------------------------------------------------------------------------

  /**
   * Find an invitation by token (NOT locked). Used for revoke (non-tx check).
   */
  async findInviteByToken(token: string, e: Exec = db): Promise<OrganizationInvitation | null> {
    const [row] = await e
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.invitationToken, token))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find the caller's own active membership in an org (for self-leave).
   */
  async findOwnActiveMembership(
    userId: string,
    organizationId: string,
    e: Exec = db,
  ): Promise<OrganizationMembership | null> {
    const [row] = await e
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.organizationId, organizationId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Find an organization by ID. Used inside accept-invitation tx.
   */
  async findOrgById(orgId: string, e: Exec = db): Promise<Organization | null> {
    const [row] = await e.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return row ?? null;
  }

  /**
   * Find an existing active membership for (orgId, userId). Used for idempotency in accept-invitation.
   */
  async findExistingActiveMembership(
    orgId: string,
    userId: string,
    e: Exec = db,
  ): Promise<{ id: string } | null> {
    const [row] = await e
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.userId, userId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Find the display name of the accepter user. Used for accept-invitation notification.
   * Returns null if profile not found.
   */
  async findAccepterDisplayName(userId: string, e: Exec = db): Promise<string | null> {
    const [row] = await e
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row?.displayName ?? null;
  }

  /**
   * Find the publicToken of an organization by ID.
   * Used for post-action revalidate when publicToken is not already in scope.
   */
  async findOrgPublicToken(orgId: string, e: Exec = db): Promise<string | null> {
    const [row] = await e
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return row?.publicToken ?? null;
  }
}
