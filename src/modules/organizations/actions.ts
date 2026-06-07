"use server";

// Thin action controllers for the organizations domain — WU-3.
//
// Each action:
//   1. AUTH GUARD at the edge (EXACT scope per action — see spec §AUTH SCOPE).
//   2. Parse raw input.
//   3. Build deps and call the use-case.
//   4. Handle UseCaseResult — on error, return the error string.
//   5. Flush pendingNotifications post-tx best-effort.
//   6. revalidatePath or redirect.
//
// AUTH SCOPE CONTRACT (CRITICAL — foster cross-org bypass lesson):
//   updateOrganization: requireOrgAccessByToken (outer login guard) + inner admin re-check in use-case
//   removeMember / changeMemberRole / setMemberEventWrite: requireCapability("member.invite", organizationId)
//   leaveOrganization: Supabase session (createClient)
//   inviteMember / revokeInvitation: requireCapability("member.invite", organizationId)
//   acceptInvitation: Supabase session (createClient) — email guard inside use-case
//
// NO audit_log written (parity gap — do NOT add).
// NO business logic. NO direct Drizzle imports beyond db for notifications.

import { revalidatePath } from "next/cache";

import { db, notifications } from "@/db";
import { organizationInvitations } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { generateInvitationToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueToken, isUniqueViolation } from "@/lib/unique-token";

import { acceptInvitation } from "./application/accept-invitation";
import { changeOrganizationMemberRole } from "./application/change-member-role";
import { inviteMember } from "./application/invite-member";
import { leaveOrganization } from "./application/leave-organization";
import { removeMember } from "./application/remove-member";
import { revokeInvitation } from "./application/revoke-invitation";
import { setMemberEventWrite } from "./application/set-member-event-write";
import { updateOrganization } from "./application/update-organization";
import { OrgRepository } from "./infrastructure/org-repository";

// ---------------------------------------------------------------------------
// Re-export types so consumers import from this module directly.
// ---------------------------------------------------------------------------

export type {
  UpdateOrganizationFields,
  UpdateOrganizationInput,
} from "./application/update-organization";
export type { RemoveMemberInput } from "./application/remove-member";
export type { ChangeOrganizationMemberRoleInput } from "./application/change-member-role";
export type { SetMemberEventWriteInput } from "./application/set-member-event-write";
export type { LeaveOrganizationInput } from "./application/leave-organization";
export type { InviteMemberInput } from "./application/invite-member";
export type { RevokeInvitationInput } from "./application/revoke-invitation";
export type { AcceptInvitationInput } from "./application/accept-invitation";

// Re-export original types for shim compatibility.
export type UpdateOrgFormState = { error: string | null; ok?: boolean };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const repo = new OrgRepository();

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(
  pending: Array<{
    userId: string;
    notificationType: string;
    title: string;
    body: string;
    severity: "info" | "success" | "warning" | "urgent";
    ctaLabel?: string | null;
    ctaUrl?: string | null;
  }>,
): Promise<void> {
  if (pending.length === 0) return;
  try {
    await db.insert(notifications).values(pending as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[organizations/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// updateOrganizationAction — form-shaped wrapper (server action via useActionState)
// ---------------------------------------------------------------------------

export async function updateOrganizationAction(
  _prev: UpdateOrgFormState,
  formData: FormData,
): Promise<UpdateOrgFormState> {
  const orgToken = String(formData.get("orgToken") ?? "").trim();
  if (!orgToken) return { error: "Token de organización requerido." };

  // Outer guard: redirect to /login if unauth; notFound() if no active membership.
  const { user } = await requireOrgAccessByToken(orgToken);

  const result = await updateOrganization(
    {
      userId: user.id,
      orgToken,
      fields: {
        displayName: String(formData.get("displayName") ?? "").trim(),
        legalName: formData.has("legalName") ? String(formData.get("legalName")).trim() : undefined,
        email: formData.has("email") ? String(formData.get("email")).trim() : undefined,
        phone: String(formData.get("phone") ?? "").trim() || null,
        website: String(formData.get("website") ?? "").trim() || null,
        description: String(formData.get("description") ?? "").trim() || null,
        personeriaJuridicaNumber:
          String(formData.get("personeriaJuridicaNumber") ?? "").trim() || null,
        tier0ShowOriginOrg: formData.get("tier0ShowOriginOrg") === "true",
      },
    },
    { repo },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${orgToken}/configuracion`);
  revalidatePath(`/org/${orgToken}`);

  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// updateOrganizationForUser — testable inner writer (preserved for shim compat)
// ---------------------------------------------------------------------------

export type UpdateOrgInput = {
  orgToken: string;
  displayName: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  personeriaJuridicaNumber?: string | null;
  tier0ShowOriginOrg?: boolean;
};

export async function updateOrganizationForUser(
  userId: string,
  orgToken: string,
  input: UpdateOrgInput,
): Promise<UpdateOrgFormState> {
  const result = await updateOrganization(
    {
      userId,
      orgToken,
      fields: {
        displayName: input.displayName,
        legalName: input.legalName,
        email: input.email,
        phone: input.phone,
        website: input.website,
        description: input.description,
        personeriaJuridicaNumber: input.personeriaJuridicaNumber,
        tier0ShowOriginOrg: input.tier0ShowOriginOrg,
      },
    },
    { repo },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${orgToken}/configuracion`);
  revalidatePath(`/org/${orgToken}`);

  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// removeMemberAction
// ---------------------------------------------------------------------------

export type RemoveMemberResult = { ok: true } | { error: string };

export async function removeMemberAction(input: {
  organizationId: string;
  membershipId: string;
}): Promise<RemoveMemberResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  const result = await removeMember(
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      actor: {
        userId: user.id,
        role: actorMembership.role,
        membershipId: actorMembership.id,
      },
      organization: {
        publicToken: organization.publicToken,
        displayName: organization.displayName,
      },
    },
    {
      repo,
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// changeMemberRoleAction
// ---------------------------------------------------------------------------

export type ChangeMemberRoleResult = { ok: true } | { error: string };

export async function changeMemberRoleAction(input: {
  organizationId: string;
  membershipId: string;
  newRole: string;
}): Promise<ChangeMemberRoleResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  const result = await changeOrganizationMemberRole(
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      newRole: input.newRole,
      actor: {
        userId: user.id,
        role: actorMembership.role,
        membershipId: actorMembership.id,
      },
      organization: { publicToken: organization.publicToken },
    },
    {
      repo,
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// setMemberEventWriteAction
// ---------------------------------------------------------------------------

export type SetMemberEventWriteResult = { ok: true } | { error: string };

export async function setMemberEventWriteAction(input: {
  organizationId: string;
  membershipId: string;
  canWrite: boolean;
}): Promise<SetMemberEventWriteResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization } = auth;

  const result = await setMemberEventWrite(
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      canWrite: input.canWrite,
      actor: {
        userId: user.id,
        role: actorMembership.role,
        membershipId: actorMembership.id,
      },
      organization: { publicToken: organization.publicToken },
    },
    { repo },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// leaveOrganizationAction
// ---------------------------------------------------------------------------

export type LeaveOrganizationResult = { ok: true } | { error: string };

export async function leaveOrganizationAction(input: {
  organizationId: string;
}): Promise<LeaveOrganizationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  // Fetch org publicToken for revalidation (needed after leave).
  const orgPublicToken = await repo.findOrgPublicToken(input.organizationId);

  const result = await leaveOrganization(
    {
      userId: user.id,
      organizationId: input.organizationId,
      organization: { publicToken: orgPublicToken ?? "" },
    },
    {
      repo,
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  // Revalidate (best-effort).
  try {
    if (orgPublicToken) revalidatePath(`/org/${orgPublicToken}/miembros`);
  } catch {
    // Non-critical.
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// inviteMemberAction
// ---------------------------------------------------------------------------

export type InviteMemberResult = { inviteUrl: string } | { error: string };

export async function inviteMemberAction(input: {
  organizationId: string;
  email: string;
  invitedRole: string;
  canWritePetEvents?: boolean;
}): Promise<InviteMemberResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership, organization } = auth;

  const result = await inviteMember(
    {
      organizationId: input.organizationId,
      email: input.email,
      invitedRole: input.invitedRole,
      canWritePetEvents: input.canWritePetEvents,
      actor: {
        userId: user.id,
        role: membership.role,
        membershipId: membership.id,
      },
      organization: {
        id: organization.id,
        publicToken: organization.publicToken,
        displayName: organization.displayName,
      },
      generateToken: () =>
        generateUniqueToken(
          organizationInvitations,
          organizationInvitations.invitationToken,
          generateInvitationToken,
        ),
    },
    {
      repo,
      isUniqueViolation,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { inviteUrl: result.value.inviteUrl };
}

// ---------------------------------------------------------------------------
// revokeInvitationAction
// ---------------------------------------------------------------------------

export type RevokeInvitationResult = { ok: true } | { error: string };

export async function revokeInvitationAction(input: {
  organizationId: string;
  invitationToken: string;
}): Promise<RevokeInvitationResult> {
  const auth = await requireCapability("member.invite", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { organization } = auth;

  const result = await revokeInvitation(
    {
      organizationId: input.organizationId,
      invitationToken: input.invitationToken,
      organization: { publicToken: organization.publicToken },
    },
    { repo },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${organization.publicToken}/miembros`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// acceptInvitationAction
// ---------------------------------------------------------------------------

export type AcceptInvitationResult = { orgToken: string } | { error: string };

export async function acceptInvitationAction(input: {
  invitationToken: string;
}): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Iniciá sesión para aceptar la invitación." };

  const userEmail = user.email?.toLowerCase().trim();
  if (!userEmail) {
    return { error: "Tu cuenta no tiene un email verificado. Contactá al soporte." };
  }

  const result = await acceptInvitation(
    {
      invitationToken: input.invitationToken,
      userId: user.id,
      userEmail,
    },
    {
      repo,
      transaction: db.transaction.bind(db),
      isUniqueViolation,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${result.value.orgToken}/miembros`);
  return { orgToken: result.value.orgToken };
}
