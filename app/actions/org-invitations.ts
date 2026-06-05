"use server";

// Organization member invitations — link-based invite/accept/revoke flow.
//
// Design constraints (spec org-invitations v1):
//   - Role fixed at invite time, bounded by inviter's role rank.
//   - Invitable roles: admin, coordinator, member, volunteer, vet_individual.
//     foster is excluded (comes via the foster-proposal flow).
//   - Invite delivery: shareable link. No email/Resend in this slice.
//   - Invite is email-tied: acceptance requires the logged-in user's email
//     to match the invitation email exactly (case-insensitive).
//   - Expiry: 14 days. No duplicate ACTIVE invite per (org, email).
//   - Re-invite allowed after expiry / revoke / accept.
//   - Coordinator gets member.invite implicitly (lib/capabilities.ts).

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  db,
  notifications,
  organizationInvitations,
  organizationMemberships,
  organizations,
  profiles,
} from "@/db";
import { INVITABLE_ROLES, type InvitableRole, ROLE_RANK } from "./org-invitations.constants";
import { requireCapability } from "@/lib/capabilities";
import { generateInvitationToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueToken, isUniqueViolation } from "@/lib/unique-token";

// ============================================================================
// Role-rank model (see org-invitations.constants.ts — "use server" can only
// export async functions; ROLE_RANK and InvitableRole live in constants)
// ============================================================================

function isInvitableRole(role: string): role is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(role);
}

// ============================================================================
// inviteMemberAction
// ============================================================================

export type InviteMemberInput = {
  organizationId: string;
  email: string;
  invitedRole: string;
  canWritePetEvents?: boolean;
};

export type InviteMemberResult = { inviteUrl: string } | { error: string };

export async function inviteMemberAction(input: InviteMemberInput): Promise<InviteMemberResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership, organization } = auth;

  // Validate invitable role.
  if (!isInvitableRole(input.invitedRole)) {
    return {
      error: `Rol inválido. Los roles invitables son: ${INVITABLE_ROLES.join(", ")}.`,
    };
  }

  // Role-rank bound: inviter can grant any role ≤ their own rank.
  const inviterRank = ROLE_RANK[membership.role];
  const targetRank = ROLE_RANK[input.invitedRole];
  if (targetRank > inviterRank) {
    return { error: "No podés invitar a alguien con un rol mayor al tuyo." };
  }

  // Normalize email.
  const normalizedEmail = input.email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { error: "Email inválido." };
  }

  // Check: email is not already an active member of this org.
  // We need to join profiles → auth.users for the email. The email comes from
  // auth; we can check via a subquery on profiles + supabase admin, but the
  // cleanest approach here is to rely on the acceptance guard doing the strict
  // check. For a user-friendly pre-check at invite time, we read active
  // memberships and check profile display names (email not stored in profiles).
  // The iron-clad block at accept time handles the race.
  // NOTE: We check via Supabase admin API only at accept time; here we do a
  // best-effort pre-check by looking if a profile with a matching user has an
  // active membership AND the auth email matches — too expensive without email
  // in profiles. The partial-unique DB index is the real guard against duplicate
  // active invites.

  // Pre-check: look for an existing non-accepted, non-revoked invite for (org, email).
  // If one exists but is expired, auto-revoke it and allow re-invite (W4).
  // Only block when a genuinely ACTIVE (not expired) invite exists.
  const now = new Date();
  const [existingInvite] = await db
    .select({
      id: organizationInvitations.id,
      expiresAt: organizationInvitations.expiresAt,
    })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.organizationId, organization.id),
        eq(organizationInvitations.email, normalizedEmail),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
      ),
    )
    .limit(1);

  if (existingInvite) {
    if (existingInvite.expiresAt <= now) {
      // Expired but not yet revoked — auto-revoke so the partial unique index
      // allows the fresh invite to be inserted.
      await db
        .update(organizationInvitations)
        .set({ revokedAt: now })
        .where(eq(organizationInvitations.id, existingInvite.id));
    } else {
      // Genuinely active invite — block.
      return {
        error:
          "Ya existe una invitación activa para ese email en esta organización. Revocarla primero para re-invitar.",
      };
    }
  }

  // Generate unique token.
  let token: string;
  try {
    token = await generateUniqueToken(
      organizationInvitations,
      organizationInvitations.invitationToken,
      generateInvitationToken,
    );
  } catch {
    return { error: "No se pudo generar el token de invitación. Intentá de nuevo." };
  }

  // Insert invitation row.
  try {
    await db.insert(organizationInvitations).values({
      organizationId: organization.id,
      email: normalizedEmail,
      invitedRole: input.invitedRole as InvitableRole,
      canWritePetEvents: input.canWritePetEvents ?? false,
      invitedByUserId: user.id,
      invitationToken: token,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        error: "Ya existe una invitación activa para ese email en esta organización.",
      };
    }
    return {
      error: `No se pudo crear la invitación: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // Notify org admins (best-effort, non-blocking).
  try {
    const admins = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organization.id),
          isNull(organizationMemberships.leftAt),
          eq(organizationMemberships.role, "admin"),
        ),
      );

    // Include the inviter in notifications only if they are not already an admin
    // (admins are covered by the loop above).
    const notifyIds = new Set<string>(admins.map((r) => r.userId));
    // Inviter may be coordinator (not admin) — always notify admins regardless.

    if (notifyIds.size > 0) {
      await db.insert(notifications).values(
        Array.from(notifyIds).map((uid) => ({
          userId: uid,
          notificationType: "org_invitation_created",
          severity: "info" as const,
          title: `Nueva invitación enviada en ${organization.displayName}`,
          body: `Se invitó a ${normalizedEmail} con el rol ${input.invitedRole}.`,
        })),
      );
    }
  } catch (e) {
    console.error("notifications insert failed (inviteMemberAction did succeed)", e);
  }

  // TODO: wire transactional email (Resend) for invitations

  // NEXT_PUBLIC_SITE_URL is the canonical absolute-URL base used across the app
  // (matches pet-transfer.ts and other absolute-link builders).
  const appBase = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.gob.ar";
  const inviteUrl = `${appBase}/r/invite/${token}`;

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { inviteUrl };
}

// ============================================================================
// revokeInvitationAction
// ============================================================================

export type RevokeInvitationInput = {
  organizationId: string;
  invitationToken: string;
};

export type RevokeInvitationResult = { ok: true } | { error: string };

export async function revokeInvitationAction(
  input: RevokeInvitationInput,
): Promise<RevokeInvitationResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { organization } = auth;

  const [invite] = await db
    .select()
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.invitationToken, input.invitationToken),
        eq(organizationInvitations.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!invite) return { error: "Invitación no encontrada." };
  if (invite.acceptedAt) {
    // Idempotent: already accepted — nothing to revoke.
    return { ok: true };
  }
  if (invite.revokedAt) {
    // Idempotent: already revoked.
    return { ok: true };
  }

  await db
    .update(organizationInvitations)
    .set({ revokedAt: new Date() })
    .where(eq(organizationInvitations.id, invite.id));

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ============================================================================
// acceptInvitationAction
// ============================================================================

export type AcceptInvitationInput = {
  invitationToken: string;
};

export type AcceptInvitationResult = { orgToken: string } | { error: string };

// Auth note: this action DOES require a logged-in user. It reads the Supabase
// session and matches the session email against the invitation email.
// The auth.getUser() call below is the auth guard.
export async function acceptInvitationAction(
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Iniciá sesión para aceptar la invitación." };

  const userEmail = user.email?.toLowerCase().trim();
  if (!userEmail) {
    return { error: "Tu cuenta no tiene un email verificado. Contactá al soporte." };
  }

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  let orgToken: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // Lock the invitation row for update first to prevent concurrent accepts
      // (TOCTOU: two simultaneous double-clicks both passing the checks and both
      // inserting a membership). The second concurrent request will block here
      // until the first commits, then re-read the now-accepted invite and return
      // the friendly "already accepted" error instead of inserting a duplicate.
      const [invite] = await tx
        .select()
        .from(organizationInvitations)
        .where(eq(organizationInvitations.invitationToken, input.invitationToken))
        .for("update")
        .limit(1);

      // Re-validate AFTER acquiring the lock so concurrent accepts see the
      // committed state of the first winner.
      if (!invite) throw new Error("Invitación no encontrada.");
      if (invite.acceptedAt) throw new Error("Esta invitación ya fue aceptada.");
      if (invite.revokedAt) throw new Error("Esta invitación fue revocada.");
      if (invite.expiresAt < new Date()) throw new Error("Esta invitación ya expiró.");

      // Email-match guard.
      if (invite.email.toLowerCase() !== userEmail) {
        throw new Error(
          "Esta invitación no es para tu cuenta. Iniciá sesión con el email al que fue enviada.",
        );
      }

      // Fetch org for public token (redirect) and display name.
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, invite.organizationId))
        .limit(1);
      if (!org) throw new Error("Organización no encontrada.");

      // Guard: already an active member — re-checked INSIDE the locked tx so a
      // duplicate membership can't slip in between the invite lock and the insert.
      const [existingMembership] = await tx
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, invite.organizationId),
            eq(organizationMemberships.userId, user.id),
            isNull(organizationMemberships.leftAt),
          ),
        )
        .limit(1);
      if (existingMembership) {
        // User is already an active member — treat as idempotent success.
        orgToken = org.publicToken;
        // Mark invitation as accepted so the link doesn't stay active.
        await tx
          .update(organizationInvitations)
          .set({ acceptedAt: new Date(), acceptedByUserId: user.id })
          .where(eq(organizationInvitations.id, invite.id));
        return;
      }

      const now = new Date();

      // Insert membership. The partial unique index on organization_memberships
      // (organization_id, user_id) WHERE left_at IS NULL is the final DB-level
      // guard; isUniqueViolation is caught below the transaction.
      await tx.insert(organizationMemberships).values({
        organizationId: invite.organizationId,
        userId: user.id,
        role: invite.invitedRole,
        canWritePetEvents: invite.canWritePetEvents,
        invitedByUserId: invite.invitedByUserId,
        joinedAt: now,
      });

      // Mark invitation accepted.
      await tx
        .update(organizationInvitations)
        .set({ acceptedAt: now, acceptedByUserId: user.id })
        .where(eq(organizationInvitations.id, invite.id));

      orgToken = org.publicToken;

      // Notify inviter (best-effort, post-tx).
      // invitedByUserId can be null if the inviter's profile was deleted (FK
      // set-null). Skip the notification gracefully in that case.
      if (invite.invitedByUserId) {
        // Query the ACCEPTER's profile (user.id) so the notification correctly
        // reads "X accepted your invitation" from the accepter's display name.
        const [accepterProfile] = await tx
          .select({ displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.id, user.id))
          .limit(1);

        pendingNotifications.push({
          // Recipient is the INVITER — the person who sent the invitation.
          userId: invite.invitedByUserId,
          notificationType: "org_invitation_accepted",
          severity: "success",
          title: `${accepterProfile?.displayName ?? "Un usuario"} aceptó tu invitación`,
          body: `Ahora es miembro de ${org.displayName} con el rol ${invite.invitedRole}.`,
        });
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // The partial unique index on organization_memberships fired despite the
      // FOR UPDATE lock + in-tx recheck — this means the user already has an
      // active membership via a concurrent non-invite path (e.g. a direct insert
      // from an admin). Treat as idempotent: they are already a member.
      return { error: "Ya sos miembro activo de esta organización." };
    }
    return {
      error: err instanceof Error ? err.message : "No se pudo aceptar la invitación.",
    };
  }

  if (!orgToken) return { error: "Error inesperado al aceptar la invitación." };

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (acceptInvitationAction did succeed)", e);
    }
  }

  revalidatePath(`/org/${orgToken}/miembros`);
  return { orgToken };
}
