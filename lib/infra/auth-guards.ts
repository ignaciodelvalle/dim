// Server-component auth guards that fail by redirecting, never by rendering
// a blank page. Replaces the `if (!user) return null` defensive pattern that
// produced silent blank screens when a session expired between layout and
// page render — see audit reported 2026-05-17.
//
// Use these helpers in any server component / page / layout that needs an
// authenticated user. The return type is non-nullable: if you got here, the
// guard passed.

import { notFound, redirect } from "next/navigation";

import type { Organization, OrganizationMembership } from "@/db";
import type { ActorProfile } from "@/lib/domain/institutional-scope";
import {
  getJurisdictionsCached,
  getOrgMembershipCached,
  getProfileCached,
} from "@/lib/infra/request-cache";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedSession = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  // Runtime value is the full Supabase User; the type stays narrow on purpose.
  // email is exposed for display fallbacks (nav avatar) only — never for authz.
  user: { id: string; email?: string };
};

// Require an authenticated session. Redirects to /login if absent.
//
// Right-to-erasure lockout (Ley 25.326 art. 16, Wave D2): a valid Supabase
// session is necessary but NOT sufficient. erase_subject_data() soft-deletes the
// profile (deleted_at) and hashes every PII column, but does not by itself
// invalidate an already-issued session token. Without this check a self-erased
// account keeps full access to every guarded surface until the token naturally
// expires. We resolve the profile (request-cached — every layout/guard downstream
// reuses the same round-trip) and bounce erased accounts to /login, which renders
// the "cuenta eliminada" notice + a logout surface instead of looping back in.
export async function requireUserOrRedirect(): Promise<AuthenticatedSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfileCached(user.id);
  if (profile?.deletedAt != null) redirect("/login");

  return { supabase, user };
}

export type OrgAccessSession = AuthenticatedSession & {
  organization: Organization;
  membership: OrganizationMembership;
};

// Require a logged-in user with an active membership in the org identified by
// `orgToken` (organizations.publicToken). Returns notFound() — not a redirect —
// if the org does not exist or the user has no active membership, so callers
// can't distinguish "org exists but you're not a member" from "no such org"
// (no information leakage per decision D4).
//
// Replaces the old requireActiveOrgOrRedirect() which inferred the "active org"
// from session state. The explicit orgToken in the URL segment is now the only
// source of truth.
export async function requireOrgAccessByToken(orgToken: string): Promise<OrgAccessSession> {
  const { supabase, user } = await requireUserOrRedirect();

  const row = await getOrgMembershipCached(orgToken, user.id);

  if (!row) notFound();

  return { supabase, user, organization: row.organization, membership: row.membership };
}

export type AdminOrGovtJurisdiction = {
  province: string;
  locality: string;
};

export type AdminOrGovtSession = AuthenticatedSession & {
  profile: { id: string; role: "admin" | "govt" };
  // Empty for admin (universal scope). Populated for govt with every
  // active (non-revoked) govt_assignments tuple.
  jurisdictions: AdminOrGovtJurisdiction[];
};

// Gate the /gob/* segment (also used for the admin+govt server actions in
// app/actions/admin-proposals.ts). Redirects unauthenticated to /login and
// authenticated non-authorities to /mis-mascotas (no point sending them
// somewhere they can't act). The returned `jurisdictions` is the govt's
// active scope — empty for admin, who has universal scope.
//
// Rejects deactivated institutional accounts (deactivated_at IS NOT NULL) by
// redirecting to / — mirrors requireAdminOrRedirect. Without this check a
// deactivated govt/admin would retain read+write access to every /gob/* surface
// (PII search, role-change proposals, decomisos) because those server actions
// gate on this same guard.
// Shared loader for every institutional guard. Loads the profile and enforces
// the three invariants that an admin/govt surface always requires:
//   1. role ∈ `allow`   (else redirect to `roleRejectRedirect`)
//   2. accountType === 'institutional'   (else redirect to /)
//   3. deactivatedAt === null            (else redirect to /)
//
// Centralizing (2) and (3) here makes it structurally impossible for a guard to
// forget either check — the divergence that caused AC1 (requireAdminOrGovt-
// OrRedirect lacked the deactivation gate that requireAdminOrRedirect had).
// The account-type and deactivation rejects always land on / regardless of the
// guard; only the wrong-role destination is caller-specific.
async function loadActiveInstitutionalProfile(
  userId: string,
  opts: { allow: ReadonlyArray<"admin" | "govt">; roleRejectRedirect: string },
): Promise<NonNullable<Awaited<ReturnType<typeof getProfileCached>>>> {
  const profile = await getProfileCached(userId);
  if (!profile || !opts.allow.includes(profile.role as "admin" | "govt")) {
    redirect(opts.roleRejectRedirect);
  }
  if (profile.accountType !== "institutional") redirect("/");
  if (profile.deactivatedAt !== null) redirect("/");
  return profile;
}

export async function requireAdminOrGovtOrRedirect(): Promise<AdminOrGovtSession> {
  const session = await requireUserOrRedirect();
  const profile = await loadActiveInstitutionalProfile(session.user.id, {
    allow: ["admin", "govt"],
    roleRejectRedirect: "/mis-mascotas",
  });

  const jurisdictions: AdminOrGovtJurisdiction[] =
    profile.role === "govt" ? await getJurisdictionsCached(profile.id) : [];

  return {
    ...session,
    profile: { id: profile.id, role: profile.role as "admin" | "govt" },
    jurisdictions,
  };
}

// ============================================================================
// Fase 5: Admin-only guard (institutional accounts)
// ============================================================================
//
// Stricter than requireAdminOrGovtOrRedirect — only active institutional admins
// pass. Rejects:
//   - unauthenticated users (→ /login via requireUserOrRedirect)
//   - personal accounts (owner / vet)
//   - govt role
//   - deactivated admins (deactivated_at IS NOT NULL)
//
// Used by every Fase 5 page and action that is admin-only.
// Redirect target: /  (govts navigating to /admin/govts etc. land on root)

export type AdminSession = AuthenticatedSession & {
  profile: ActorProfile;
};

export async function requireAdminOrRedirect(): Promise<AdminSession> {
  const session = await requireUserOrRedirect();

  const profile = await loadActiveInstitutionalProfile(session.user.id, {
    allow: ["admin"],
    roleRejectRedirect: "/",
  });

  return {
    ...session,
    profile: {
      id: profile.id,
      role: profile.role as ActorProfile["role"],
      accountType: profile.accountType as ActorProfile["accountType"],
      deactivatedAt: profile.deactivatedAt,
    },
  };
}

// ============================================================================
// Decomiso (Ley 14.346) guard — welfare.decomiso.execute capability
// ============================================================================
//
// Spec: 2026-05-19-decomiso-welfare-authority-design.md §4.4 + DC1.
//
// Capability string: 'welfare.decomiso.execute'
// Granted automatically to:
//   - role='govt'  (all govt accounts, any active jurisdiction)
//   - role='admin' (universal scope)
// NOT granted to: owner, vet, org members without a govt/admin profile role.
//
// Auth model: this is a PROFILE-LEVEL role check (not an org-capability grant).
// The decomiso is an act of the State (Ley 14.346); an org-capability grant
// would allow a refugio to issue one, which is legally wrong (DC1: "refugio que
// decomisa por su cuenta = robo de animal"). We mirror the EXACT same pattern
// as requireAdminOrGovtOrRedirect (role + govt_assignments). A separate
// org-capability ('welfare.decomiso.execute' in ORGANIZATION_CAPABILITIES)
// is NOT created for this reason.
//
// Usage in server actions:
//   const session = await requireDecomisoPrincipal();
//   // session.profile.role is 'admin' | 'govt'
//   // session.jurisdictions is [] for admin, non-empty tuples for govt
//   // Jurisdiction-scope enforcement is the caller's responsibility:
//   //   admin → universal scope (no jurisdiction check needed)
//   //   govt  → animal's jurisdiction must appear in session.jurisdictions
export type DecomisoPrincipalSession = AdminOrGovtSession;

export async function requireDecomisoPrincipal(): Promise<DecomisoPrincipalSession> {
  // Reuses requireAdminOrGovtOrRedirect verbatim — same role set, same
  // jurisdictions query. Named separately so call sites are self-documenting
  // ("this action requires decomiso authority") rather than generic.
  return requireAdminOrGovtOrRedirect();
}
