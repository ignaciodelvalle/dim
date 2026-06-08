// AuthzResolver — Supabase session + Drizzle DB queries for capability checks.
//
// This is the I/O layer for authorization. Pure baseline logic (resolveGrantedCaps,
// isValidCapability, CAPABILITY_CATALOG, baselines) lives in domain/capabilities.ts.
//
// Resolution order for requireCapability (preserve EXACTLY per spec):
//   1. Supabase session → no user → "Sesión expirada."
//   2. getActiveMemberships(userId) → ordered by joinedAt ASC
//   3. orgId provided: find matching membership; omitted: take memberships[length-1]
//   4. No matching/active membership → "No pertenecés a ninguna organización activa."
//   5. getGrantedCapabilities(membership) → delegates domain resolveGrantedCaps + DB
//   6. granted lacks capability → "No tenés permiso para esta acción. Pedile el alta a un administrador."
//   7. Success → { user, membership, organization, granted, error: null }

import { and, eq, isNull } from "drizzle-orm";

import {
  ORGANIZATION_CAPABILITIES,
  type Organization,
  type OrganizationCapability,
  type OrganizationMembership,
  db,
  organizationCapabilityGrants,
  organizationMemberships,
  organizations,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
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
): Promise<RequireCapabilityResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      membership: null,
      organization: null,
      granted: null,
      error: "Sesión expirada.",
    };
  }

  const memberships = await getActiveMemberships(user.id);
  const active = organizationId
    ? memberships.find((m) => m.organization.id === organizationId)
    : memberships[memberships.length - 1];

  if (!active) {
    return {
      user: { id: user.id },
      membership: null,
      organization: null,
      granted: null,
      error: "No pertenecés a ninguna organización activa.",
    };
  }

  const granted = await getGrantedCapabilities(active.membership);
  if (!granted.has(capability)) {
    return {
      user: { id: user.id },
      membership: null,
      organization: null,
      granted: null,
      error: "No tenés permiso para esta acción. Pedile el alta a un administrador.",
    };
  }

  return {
    user: { id: user.id },
    membership: active.membership,
    organization: active.organization,
    granted,
    error: null,
  };
}
