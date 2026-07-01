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
import { headers } from "next/headers";

import { db, notifications } from "@/db";
import { organizationInvitations } from "@/db";
import { listLocalitiesByProvince } from "@/lib/ar-localidades";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { generateInvitationToken } from "@/lib/publicToken";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/rate-limit";
import { PROVINCES, type ProvinceCode, provinceByName } from "@/lib/reference/ar-provincias";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueToken, isUniqueViolation } from "@/lib/unique-token";
import { isManagerRole } from "@/src/modules/organizations/domain/role-rules";
import {
  getActiveMemberships,
  getGrantedCapabilities,
  requireCapability,
} from "@/src/modules/organizations/infrastructure/authz-resolver";

import { acceptInvitation } from "./application/accept-invitation";
import { addCoverageZone } from "./application/add-coverage-zone";
import { changeOrganizationMemberRole } from "./application/change-member-role";
import { decideCapability } from "./application/decide-capability";
import { grantCapability } from "./application/grant-capability";
import { inviteMember } from "./application/invite-member";
import { leaveOrganization } from "./application/leave-organization";
import { removeCoverageZone } from "./application/remove-coverage-zone";
import { removeMember } from "./application/remove-member";
import { requestCapability } from "./application/request-capability";
import { revokeInvitation } from "./application/revoke-invitation";
import { setMemberEventWrite } from "./application/set-member-event-write";
import { setPrimaryCoverageZone } from "./application/set-primary-coverage-zone";
import { submitOrgContact } from "./application/submit-org-contact";
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
export type { AddCoverageZoneInput } from "./application/add-coverage-zone";
export type { RemoveCoverageZoneInput } from "./application/remove-coverage-zone";
export type { SetPrimaryCoverageZoneInput } from "./application/set-primary-coverage-zone";
export type { SubmitOrgContactInput } from "./application/submit-org-contact";
export type { RequestCapabilityInput } from "./application/request-capability";
export type { DecideCapabilityInput } from "./application/decide-capability";
export type { GrantCapabilityInput } from "./application/grant-capability";

// Re-export original types for shim compatibility.
export type UpdateOrgFormState = { error: string | null; ok?: boolean };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const repo = new OrgRepository();

// Canonical province names as a fast lookup set (widened to string for has() compatibility).
const VALID_PROVINCE_NAMES: ReadonlySet<string> = new Set<string>(PROVINCES.map((p) => p.name));

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

  // Helper: parse an optional nullable integer from FormData.
  // Empty string → null (clear the value). Not submitted → undefined (keep existing).
  function parseCapacity(key: string): number | null | undefined {
    if (!formData.has(key)) return undefined;
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

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
        // Shelter capacity (Item 16 D1). Only shelter orgs show the section,
        // but the action accepts them from any org (the form gates by orgType).
        capacityDogs: parseCapacity("capacityDogs"),
        capacityCats: parseCapacity("capacityCats"),
        capacityOther: parseCapacity("capacityOther"),
        capacityTotal: parseCapacity("capacityTotal"),
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
    { repo, transaction: db.transaction.bind(db) },
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
    revalidatePath("/cuenta/memberships");
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

// ---------------------------------------------------------------------------
// addCoverageZoneAction
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true } | { error: string };

export async function addCoverageZoneAction(input: {
  orgToken: string;
  province: string;
  locality: string | null;
}): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  // Resolve province code for locality validation.
  const provinceObj = provinceByName(input.province);
  const provinceCode = (provinceObj?.code ?? "") as ProvinceCode;

  const result = await addCoverageZone(
    {
      organizationId: organization.id,
      province: input.province,
      locality: input.locality,
      provinceCode,
    },
    {
      repo,
      listLocalitiesByProvince: (code: string) => listLocalitiesByProvince(code as ProvinceCode),
      validProvinces: VALID_PROVINCE_NAMES,
    },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// removeCoverageZoneAction
// ---------------------------------------------------------------------------

export async function removeCoverageZoneAction(input: {
  orgToken: string;
  coverageId: string;
}): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  const result = await removeCoverageZone(
    { organizationId: organization.id, coverageId: input.coverageId },
    { repo },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// setPrimaryCoverageZoneAction
// ---------------------------------------------------------------------------

export async function setPrimaryCoverageZoneAction(input: {
  orgToken: string;
  coverageId: string;
}): Promise<ActionResult> {
  const { organization, membership } = await requireOrgAccessByToken(input.orgToken);

  if (!isManagerRole(membership.role)) {
    return { error: "Solo administradores y coordinadores pueden gestionar zonas de cobertura." };
  }

  const result = await setPrimaryCoverageZone(
    { organizationId: organization.id, coverageId: input.coverageId },
    { repo, transaction: db.transaction.bind(db) },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath(`/org/${input.orgToken}/cobertura`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// submitOrgContactAction
// ---------------------------------------------------------------------------

export type SubmitOrgContactState = { ok: boolean; error: string | null };

async function callerIpAddress(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

// @no-auth-required: public contact/volunteer form served from the (public) route group to unauthenticated visitors; abuse-controlled by an IP rate limit (enforceRateLimit), not a session.
export async function submitOrgContactAction(
  orgToken: string,
  kind: "contact" | "volunteer",
  _previous: SubmitOrgContactState,
  formData: FormData,
): Promise<SubmitOrgContactState> {
  const ip = await callerIpAddress();

  const result = await submitOrgContact(
    {
      orgToken,
      kind,
      name: String(formData.get("inquirerName") ?? ""),
      email: String(formData.get("inquirerEmail") ?? ""),
      message: String(formData.get("message") ?? ""),
      ip,
    },
    {
      repo,
      enforceRateLimit,
      isRateLimitError: (e) => e instanceof RateLimitError,
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, error: null };
}

// ---------------------------------------------------------------------------
// requestCapabilityAction
// ---------------------------------------------------------------------------

export type CapabilityActionState = { error: string | null; ok?: boolean };

export async function requestCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const capabilityRaw = String(formData.get("capability") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;

  if (!capabilityRaw) return { error: "Falta indicar el permiso solicitado." };

  // isValidCapability check deferred to use-case (not applicable here since
  // the use-case doesn't re-check format — action does a pre-check for UX).
  const { isValidCapability } = await import("./domain/capabilities");
  if (!isValidCapability(capabilityRaw)) return { error: "Permiso no reconocido." };

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return { error: "No pertenecés a ninguna organización activa." };

  const result = await requestCapability(
    {
      userId: user.id,
      capability: capabilityRaw,
      reason,
      active: {
        organization: {
          id: active.organization.id,
          displayName: active.organization.displayName,
          publicToken: active.organization.publicToken,
        },
        membership: {
          id: active.membership.id,
          role: active.membership.role,
          organizationId: active.membership.organizationId,
        },
      },
    },
    {
      repo,
      transaction: db.transaction.bind(db),
      isUniqueViolation,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${active.organization.publicToken}`);
  revalidatePath(`/org/${active.organization.publicToken}/admin/permisos`);
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// decideCapabilityAction
// ---------------------------------------------------------------------------

export async function decideCapabilityAction(
  _previous: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const grantId = String(formData.get("grantId") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 500) : null;

  if (!grantId) return { error: "Falta el identificador de la solicitud." };
  if (decisionRaw !== "approved" && decisionRaw !== "denied" && decisionRaw !== "revoked") {
    return { error: "Decisión no reconocida." };
  }
  const decision = decisionRaw as "approved" | "denied" | "revoked";

  const memberships = await getActiveMemberships(user.id);
  const active = memberships[memberships.length - 1];
  if (!active) return { error: "No pertenecés a ninguna organización activa." };

  const granted = await getGrantedCapabilities(active.membership);

  const result = await decideCapability(
    {
      deciderId: user.id,
      grantId,
      decision,
      reason,
      active: {
        organization: {
          id: active.organization.id,
          displayName: active.organization.displayName,
          publicToken: active.organization.publicToken,
        },
        membership: {
          id: active.membership.id,
          role: active.membership.role,
          organizationId: active.membership.organizationId,
        },
      },
      granted,
    },
    {
      repo,
      transaction: db.transaction.bind(db),
      isUniqueViolation,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${active.organization.publicToken}`);
  revalidatePath(`/org/${active.organization.publicToken}/admin/permisos`);
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// grantCapabilityAction
// ---------------------------------------------------------------------------

export async function grantCapabilityAction(input: {
  organizationId: string;
  membershipId: string;
  capability: string;
}): Promise<CapabilityActionState> {
  const auth = await requireCapability("capability.grant", input.organizationId);
  if (auth.error !== null) return { error: auth.error };
  const { user, membership: actorMembership, organization, granted } = auth;

  const result = await grantCapability(
    {
      granterId: user.id,
      membershipId: input.membershipId,
      capability: input.capability,
      active: {
        organization: {
          id: organization.id,
          displayName: organization.displayName,
          publicToken: organization.publicToken,
        },
        membership: {
          id: actorMembership.id,
          role: actorMembership.role,
          organizationId: actorMembership.organizationId,
        },
      },
      granted,
    },
    {
      repo,
      transaction: db.transaction.bind(db),
      isUniqueViolation,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${organization.publicToken}/admin/permisos`);
  return { error: null, ok: true };
}
