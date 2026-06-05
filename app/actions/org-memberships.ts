"use server";

// Organization membership management actions — remove, change-role, event-write toggle, self-leave.
//
// Design constraints:
//   - Auth gate: requireCapability("member.invite", organizationId) for all admin actions.
//   - Rank rule: actor cannot manage a target whose rank > actor's rank.
//     This lets admins (rank=5) manage other admins (5≤5) but blocks coordinators
//     (rank=4) from touching admins (rank=5).
//   - No self-management via admin path (use leaveOrganizationAction for self-removal).
//   - Last-admin protection: org must retain ≥1 active admin at all times.
//     Applies to removeMemberAction (any role) and changeMemberRoleAction when
//     demoting an admin. Guard is enforced inside a DB transaction with
//     SELECT ... FOR UPDATE to prevent TOCTOU races.
//     Last-admin is checked before self/rank so the invariant message is always
//     surfaced first (even when the actor is the last admin trying to act on themselves).
//   - Settable roles: admin, coordinator, member, volunteer, vet_individual.
//     foster is NOT settable through this path (foster-proposal flow only).

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, notifications, organizationMemberships, organizations } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { createClient } from "@/lib/supabase/server";
import { INVITABLE_ROLES, type InvitableRole, ROLE_RANK } from "./org-invitations.constants";

// ============================================================================
// removeMemberAction
// ============================================================================

export type RemoveMemberInput = {
  organizationId: string;
  membershipId: string;
};

export type RemoveMemberResult = { ok: true } | { error: string };

export async function removeMemberAction(input: RemoveMemberInput): Promise<RemoveMemberResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  // Load target membership (outside tx — fast pre-check).
  const [target] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, input.membershipId),
        eq(organizationMemberships.organizationId, input.organizationId),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!target) return { error: "Membresía no encontrada o ya inactiva." };

  // For admin targets: last-admin protection is checked BEFORE self/rank so the
  // invariant message is always surfaced first (even when the actor is the last admin
  // trying to remove themselves). Guard + mutation wrapped in a tx with SELECT FOR UPDATE
  // to prevent TOCTOU races between concurrent removes/demotions.
  if (target.role === "admin") {
    let actionError: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // Lock ALL active admin rows for this org.
        const lockResult = await tx.execute(
          sql`SELECT id FROM organization_memberships WHERE organization_id = ${input.organizationId} AND role = 'admin' AND left_at IS NULL FOR UPDATE`,
        );
        const adminRows: Array<{ id: string }> = [
          ...(lockResult as unknown as Iterable<{ id: string }>),
        ];

        // Last-admin check first (highest-priority invariant).
        if (adminRows.length <= 1) {
          actionError = "La organización debe tener al menos un administrador.";
          throw new Error("LAST_ADMIN");
        }

        // Self-check.
        if (target.userId === user.id) {
          actionError =
            "No podés quitarte a vos mismo por esta vía. Usá la opción 'Salir de la organización'.";
          throw new Error("SELF");
        }

        // Rank rule.
        const actorRankInner = ROLE_RANK[actorMembership.role];
        const targetRankInner = ROLE_RANK[target.role];
        if (targetRankInner > actorRankInner) {
          actionError = "No podés gestionar a alguien con un rol mayor al tuyo.";
          throw new Error("RANK");
        }

        await tx
          .update(organizationMemberships)
          .set({ leftAt: new Date() })
          .where(
            and(
              eq(organizationMemberships.id, input.membershipId),
              eq(organizationMemberships.organizationId, input.organizationId),
            ),
          );
      });
    } catch (e) {
      if (actionError) return { error: actionError };
      throw e;
    }
  } else {
    // Non-admin target: no last-admin concern — validate then soft-delete directly.

    // No self-management via admin path.
    if (target.userId === user.id) {
      return {
        error:
          "No podés quitarte a vos mismo por esta vía. Usá la opción 'Salir de la organización'.",
      };
    }

    // Rank rule.
    const actorRank = ROLE_RANK[actorMembership.role];
    const targetRank = ROLE_RANK[target.role];
    if (targetRank > actorRank) {
      return { error: "No podés gestionar a alguien con un rol mayor al tuyo." };
    }

    await db
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(organizationMemberships.id, input.membershipId),
          eq(organizationMemberships.organizationId, input.organizationId),
        ),
      );
  }

  // Notify removed user (best-effort).
  try {
    await db.insert(notifications).values({
      userId: target.userId,
      notificationType: "org_membership_removed",
      severity: "info",
      title: `Fuiste quitado de ${organization.displayName}`,
      body: `Tu membresía en ${organization.displayName} fue finalizada por un administrador.`,
    });
  } catch (e) {
    console.error("notifications insert failed (removeMemberAction did succeed)", e);
  }

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ============================================================================
// changeMemberRoleAction
// ============================================================================

export type ChangeMemberRoleInput = {
  organizationId: string;
  membershipId: string;
  newRole: string;
};

export type ChangeMemberRoleResult = { ok: true } | { error: string };

export async function changeMemberRoleAction(
  input: ChangeMemberRoleInput,
): Promise<ChangeMemberRoleResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  // Validate new role is in the settable set.
  if (!(INVITABLE_ROLES as readonly string[]).includes(input.newRole)) {
    return {
      error: `Rol inválido. Los roles configurables son: ${INVITABLE_ROLES.join(", ")}.`,
    };
  }

  const newRole = input.newRole as InvitableRole;
  const actorRank = ROLE_RANK[actorMembership.role];
  const newRoleRank = ROLE_RANK[newRole];

  // Can't promote above own rank.
  if (newRoleRank > actorRank) {
    return {
      error: "No podés asignar un rol mayor al tuyo.",
    };
  }

  // Load target membership (outside tx — fast pre-check).
  const [target] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, input.membershipId),
        eq(organizationMemberships.organizationId, input.organizationId),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!target) return { error: "Membresía no encontrada o ya inactiva." };

  // For admin demotion: last-admin check BEFORE self/rank (same priority rule as remove).
  // Guard + mutation inside a tx with SELECT FOR UPDATE to prevent TOCTOU races.
  if (target.role === "admin" && newRole !== "admin") {
    let actionError: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // Lock ALL active admin rows for this org.
        const lockResult = await tx.execute(
          sql`SELECT id FROM organization_memberships WHERE organization_id = ${input.organizationId} AND role = 'admin' AND left_at IS NULL FOR UPDATE`,
        );
        const adminRows: Array<{ id: string }> = [
          ...(lockResult as unknown as Iterable<{ id: string }>),
        ];

        // Last-admin check first.
        if (adminRows.length <= 1) {
          actionError = "La organización debe tener al menos un administrador.";
          throw new Error("LAST_ADMIN");
        }

        // Self-check.
        if (target.userId === user.id) {
          actionError = "No podés cambiar tu propio rol.";
          throw new Error("SELF");
        }

        // Rank rule on target's current role.
        const actorRankInner = ROLE_RANK[actorMembership.role];
        const targetRankInner = ROLE_RANK[target.role];
        if (targetRankInner > actorRankInner) {
          actionError = "No podés gestionar a alguien con un rol mayor al tuyo.";
          throw new Error("RANK");
        }

        await tx
          .update(organizationMemberships)
          .set({ role: newRole })
          .where(
            and(
              eq(organizationMemberships.id, input.membershipId),
              eq(organizationMemberships.organizationId, input.organizationId),
            ),
          );
      });
    } catch (e) {
      if (actionError) return { error: actionError };
      throw e;
    }
  } else {
    // No last-admin concern — validate then update directly.

    // No self role-change.
    if (target.userId === user.id) {
      return { error: "No podés cambiar tu propio rol." };
    }

    // Rank rule on target's current role.
    const targetRank = ROLE_RANK[target.role];
    if (targetRank > actorRank) {
      return { error: "No podés gestionar a alguien con un rol mayor al tuyo." };
    }

    await db
      .update(organizationMemberships)
      .set({ role: newRole })
      .where(
        and(
          eq(organizationMemberships.id, input.membershipId),
          eq(organizationMemberships.organizationId, input.organizationId),
        ),
      );
  }

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ============================================================================
// setMemberEventWriteAction
// ============================================================================

export type SetMemberEventWriteInput = {
  organizationId: string;
  membershipId: string;
  canWrite: boolean;
};

export type SetMemberEventWriteResult = { ok: true } | { error: string };

export async function setMemberEventWriteAction(
  input: SetMemberEventWriteInput,
): Promise<SetMemberEventWriteResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  // Load target membership.
  const [target] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, input.membershipId),
        eq(organizationMemberships.organizationId, input.organizationId),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!target) return { error: "Membresía no encontrada o ya inactiva." };

  // No self-management via admin path.
  if (target.userId === user.id) {
    return { error: "No podés modificar tu propio permiso de escritura por esta vía." };
  }

  // Rank rule.
  const actorRank = ROLE_RANK[actorMembership.role];
  const targetRank = ROLE_RANK[target.role];
  if (targetRank > actorRank) {
    return { error: "No podés gestionar a alguien con un rol mayor al tuyo." };
  }

  await db
    .update(organizationMemberships)
    .set({ canWritePetEvents: input.canWrite })
    .where(
      and(
        eq(organizationMemberships.id, input.membershipId),
        eq(organizationMemberships.organizationId, input.organizationId),
      ),
    );

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ============================================================================
// leaveOrganizationAction — self-leave path
// ============================================================================

export type LeaveOrganizationInput = {
  organizationId: string;
};

export type LeaveOrganizationResult = { ok: true } | { error: string };

export async function leaveOrganizationAction(
  input: LeaveOrganizationInput,
): Promise<LeaveOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Find the caller's own active membership.
  const [membership] = await db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!membership) {
    return { error: "No sos miembro activo de esta organización." };
  }

  // For admins: enforce last-admin protection atomically inside a tx.
  if (membership.role === "admin") {
    let lastAdminError: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // Lock ALL active admin rows for this org.
        const lockResult = await tx.execute(
          sql`SELECT id FROM organization_memberships WHERE organization_id = ${input.organizationId} AND role = 'admin' AND left_at IS NULL FOR UPDATE`,
        );
        const adminRows: Array<{ id: string }> = [
          ...(lockResult as unknown as Iterable<{ id: string }>),
        ];

        if (adminRows.length <= 1) {
          lastAdminError =
            "No podés salir porque sos el único administrador. Asigná otro administrador primero.";
          throw new Error("LAST_ADMIN");
        }

        await tx
          .update(organizationMemberships)
          .set({ leftAt: new Date() })
          .where(
            and(
              eq(organizationMemberships.id, membership.id),
              eq(organizationMemberships.organizationId, input.organizationId),
            ),
          );
      });
    } catch (e) {
      if (lastAdminError) return { error: lastAdminError };
      throw e;
    }
  } else {
    await db
      .update(organizationMemberships)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(organizationMemberships.id, membership.id),
          eq(organizationMemberships.organizationId, input.organizationId),
        ),
      );
  }

  // Revalidate the members page (best-effort — load the org publicToken).
  try {
    const [org] = await db
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
    if (org) revalidatePath(`/org/${org.publicToken}/miembros`);
  } catch {
    // Non-critical.
  }

  return { ok: true };
}
