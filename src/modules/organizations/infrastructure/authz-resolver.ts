// AuthzResolver — Supabase session + Drizzle DB queries for capability checks.
//
// This is the I/O layer for authorization. Pure baseline logic (resolveGrantedCaps,
// isValidCapability, CAPABILITY_CATALOG, baselines) lives in domain/capabilities.ts.
//
// Resolution order for requireCapability (preserve EXACTLY per spec):
//   1. Liveness (requireLiveUser, lib/infra/live-user.ts), in ITS precedence:
//        MAINTENANCE    → the platform-wide kill-switch; an env read, before
//                         any client or query, because the database may be
//                         the thing under repair.
//        NO_SESSION     → "Sesión expirada."
//        ACCOUNT_ERASED → "Tu cuenta fue eliminada." (Ley 25.326 art. 16)
//        DEACTIVATED    → refused for a WRITE (the default), tolerated for a
//                         READ (`access: "read"`). See RequireCapabilityOptions.
//   2. getActiveMemberships(userId) → ordered by joinedAt ASC
//   3. orgId provided: find matching membership; omitted: take memberships[length-1]
//   4. No matching/active membership → "No pertenecés a ninguna organización activa."
//   5. getGrantedCapabilities(membership) → delegates domain resolveGrantedCaps + DB
//   6. granted lacks capability → "No tenés permiso para esta acción. Pedile el alta a un administrador."
//   7. Success → { user, membership, organization, granted, error: null }
//
// WHY STEP 1 IS requireLiveUser AND NOT A BARE getUser (RN re-run HIGH, 2026-08-22)
// ---------------------------------------------------------------------------
// Until this change both capability guards resolved the caller with
// `auth.getUser()` plus the erasure check, and NOTHING else — while ~18 org
// entry points (cross-org transfers ×5, foster ×2, member management ×5,
// surveillance, rehome, atender) are gated by these two functions alone. So a
// maintenance window never stopped an org from transferring custody or
// accepting a rehome, and a DEACTIVATED institutional account kept mutating
// through every one of them. lib/infra/live-user.ts already answers all four
// liveness questions in one place and in one order; a guard that re-derives
// three of them is a guard that drifts. The refusal shape stays this module's
// own (RequireCapabilityFailure) — no redirects here, the use-cases return.

import { and, eq, isNull } from "drizzle-orm";

import {
  type Organization,
  type OrganizationCapability,
  type OrganizationMembership,
  db,
  organizationCapabilityGrants,
  organizationMemberships,
  organizations,
} from "@/db";
import { requireLiveUser } from "@/lib/infra/live-user";
import { resolveGrantedCaps } from "@/src/modules/organizations/domain/capabilities";

// ---------------------------------------------------------------------------
// Public types exported from this module
// ---------------------------------------------------------------------------

export type ActiveMembership = {
  membership: OrganizationMembership;
  organization: Organization;
};

export type RequireCapabilitySuccess = {
  user: { id: string };
  membership: OrganizationMembership;
  organization: Organization;
  granted: Set<OrganizationCapability>;
  error: null;
};

export type RequireCapabilityFailure = {
  user: { id: string } | null;
  membership: null;
  organization: null;
  granted: null;
  error: string;
};

export type RequireCapabilityResult = RequireCapabilitySuccess | RequireCapabilityFailure;

export type RequireCapabilityOptions = {
  /**
   * What the caller is about to do with the capability. Defaults to "write".
   *
   * The policy is lib/infra/auth-guards.ts:60-70: a DEACTIVATED institutional
   * account keeps its READS (so it can see why, and log out) and loses its
   * WRITES. These guards gate writes by construction — every org server action
   * and every org mutation authorizes through them — so the default refuses.
   * The seven org pages and three export/template handlers that gate a READ
   * on a capability pass `access: "read"` and tolerate the refusal exactly as
   * requireUserOrRedirect does. MAINTENANCE, NO_SESSION and ACCOUNT_ERASED
   * refuse either way.
   */
  access?: "read" | "write";
};

/**
 * Step 1 of both guards: the caller must be LIVE, in requireLiveUser's own
 * precedence, and the refusal comes back in this module's result shape.
 *
 * Returns the user id on success so the membership resolution never re-reads
 * the session. DEACTIVATED is the one refusal a READ may tolerate; the guard
 * fails CLOSED if that branch ever arrives without a user rather than
 * asserting the shape with a cast (same stance as auth-guards.ts).
 */
async function resolveLiveActor(
  options: RequireCapabilityOptions | undefined,
): Promise<{ ok: true; userId: string } | { ok: false; failure: RequireCapabilityFailure }> {
  const live = await requireLiveUser();
  if (live.ok) return { ok: true, userId: live.user.id };

  const tolerated = live.reason === "DEACTIVATED" && options?.access === "read";
  if (tolerated && live.user) return { ok: true, userId: live.user.id };

  return {
    ok: false,
    failure: {
      user: live.user ? { id: live.user.id } : null,
      membership: null,
      organization: null,
      granted: null,
      error: live.error,
    },
  };
}

// ---------------------------------------------------------------------------
// getActiveMemberships
//
// Returns all active memberships (leftAt IS NULL) for a user joined with their
// organization. Ordered by joinedAt ASC so that memberships[length-1] is the
// most-recently-joined (matches v1 "first/last membership wins" default).
// ---------------------------------------------------------------------------

export async function getActiveMemberships(userId: string): Promise<ActiveMembership[]> {
  const rows = await db
    .select({ membership: organizationMemberships, organization: organizations })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)))
    .orderBy(organizationMemberships.joinedAt);
  return rows;
}

// ---------------------------------------------------------------------------
// getGrantedCapabilities
//
// Capabilities currently granted on a membership:
//   - role=admin: implicit grant of ALL capabilities (universal).
//   - role=vet_individual: VET_INDIVIDUAL_IMPLICIT_CAPS + explicit approved grants.
//   - role=coordinator: COORDINATOR_IMPLICIT_CAPS + explicit approved grants.
//   - other roles: only status='approved' grant rows (isValidCapability filtered).
//
// Delegates baseline resolution to domain/capabilities.resolveGrantedCaps (pure).
// DB layer: reads approved organization_capability_grants rows.
// ---------------------------------------------------------------------------

export async function getGrantedCapabilities(
  membership: Pick<OrganizationMembership, "id" | "role">,
): Promise<Set<OrganizationCapability>> {
  // Admin shortcut: no DB read needed (domain handles it)
  if (membership.role === "admin") {
    return resolveGrantedCaps("admin", []);
  }

  // Read approved grants from DB
  const rows = await db
    .select({ capability: organizationCapabilityGrants.capability })
    .from(organizationCapabilityGrants)
    .where(
      and(
        eq(organizationCapabilityGrants.membershipId, membership.id),
        eq(organizationCapabilityGrants.status, "approved"),
      ),
    );

  const approvedCapStrings = rows.map((r) => r.capability);

  // Delegate baseline + validation to pure domain function
  return resolveGrantedCaps(membership.role, approvedCapStrings);
}

// ---------------------------------------------------------------------------
// requireCapability
//
// Server-action helper. Returns the active membership + organization for the
// authenticated user that holds `capability`. Mirrors requireOwnedPet in
// app/actions/events.ts. When organizationId is provided, only that org is
// considered; otherwise the most-recently-joined active membership is used
// (matches the v1 "last membership wins" UI default — memberships[length-1]
// because getActiveMemberships orders by joinedAt ASC).
// ---------------------------------------------------------------------------

export async function requireCapability(
  capability: OrganizationCapability,
  organizationId?: string,
  options?: RequireCapabilityOptions,
): Promise<RequireCapabilityResult> {
  // Right-to-erasure lockout (Ley 25.326 art. 16, Wave E2) lives inside
  // requireLiveUser now, together with the kill-switch and deactivation: the
  // JWT stays valid after erase_subject_data() soft-deletes the profile, so a
  // session alone never authorizes an org mutation. One request-memoized
  // profile read is the price of the boundary, unchanged.
  const live = await resolveLiveActor(options);
  if (!live.ok) return live.failure;

  return resolveCapabilityForUser(live.userId, capability, organizationId);
}

/** Steps 2-7: membership + grant resolution for an already-LIVE user. */
async function resolveCapabilityForUser(
  userId: string,
  capability: OrganizationCapability,
  organizationId?: string,
): Promise<RequireCapabilityResult> {
  const memberships = await getActiveMemberships(userId);
  const active = organizationId
    ? memberships.find((m) => m.organization.id === organizationId)
    : memberships[memberships.length - 1];

  if (!active) {
    return {
      user: { id: userId },
      membership: null,
      organization: null,
      granted: null,
      error: "No pertenecés a ninguna organización activa.",
    };
  }

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has(capability)) {
    return {
      user: { id: userId },
      membership: null,
      organization: null,
      granted: null,
      error: "No tenés permiso para esta acción. Pedile el alta a un administrador.",
    };
  }

  return {
    user: { id: userId },
    membership: active.membership,
    organization: active.organization,
    granted,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// requireCapabilityForOrgToken
//
// Confused-deputy guard for org-scoped server actions reached through an
// /org/{orgToken}/… URL. Resolves the acting organization from the URL
// publicToken FIRST, then pins the capability check to THAT org.id — never the
// session-default (most-recently-joined) membership that bare requireCapability
// falls back to. A member of several orgs acting under /org/{A} is authorized
// against org A, not whichever org they happened to join last.
//
// Returns the same RequireCapabilityResult shape as requireCapability. When the
// token matches no organization the standard "no access" failure is returned —
// indistinguishable from "not a member", so org existence is never leaked.
//
// LIVENESS RUNS FIRST, before the org lookup (2026-08-22). The lookup is a DB
// read, and the maintenance kill-switch has to work when the database is what
// is being maintained. It also closes a small oracle the old order had: an
// ANONYMOUS caller used to get "No tenés acceso" for an unknown token and
// "Sesión expirada." for a real one — two different answers to "does this org
// exist?" for someone with no session at all. Now every non-live caller gets
// the same liveness refusal whatever the token says.
// ---------------------------------------------------------------------------

export async function requireCapabilityForOrgToken(
  capability: OrganizationCapability,
  orgToken: string,
  options?: RequireCapabilityOptions,
): Promise<RequireCapabilityResult> {
  const live = await resolveLiveActor(options);
  if (!live.ok) return live.failure;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .limit(1);

  if (!org) {
    return {
      user: { id: live.userId },
      membership: null,
      organization: null,
      granted: null,
      error: "No tenés acceso a esta organización.",
    };
  }

  return resolveCapabilityForUser(live.userId, capability, org.id);
}
