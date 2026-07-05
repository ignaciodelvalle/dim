// Per-request memoized reads using React.cache().
//
// React.cache() de-duplicates identical calls within a single server-render
// pass. It is safe ONLY for reads — never cache mutations or functions whose
// result must change within the same request after a revalidation. The cache
// is automatically discarded at the end of each request; there is no cross-
// request leakage.
//
// Column contract (getProfileCached):
//   The selected columns are the UNION of every column shape used by auth
//   guards, layouts, and per-request page gate checks:
//     id            — required by requireAdminOrGovtOrRedirect, requireAdminOrRedirect
//     role          — required by every layout + guard
//     displayName   — required by every layout nav bar
//     accountType   — required by requireAdminOrRedirect (institutional check)
//     deactivatedAt — required by requireAdminOrRedirect (active check)
//
//   Pages that need additional columns (phone, avatarUrl, dniVerified, etc.)
//   for display purposes — e.g. /cuenta, /cuenta/editar — keep their own
//   targeted selects. Those pages fetch ONCE and are not part of the 220-
//   call per-sweep churn documented in PERF-2.

// NOTE: deliberately NO `import "server-only"` here. The seed and bootstrap
// scripts (tsx, outside the Next.js bundler) import action writers that reach
// this module through lib/auth-guards — "server-only" throws unconditionally
// in that context (see scripts/seed-test-users.ts header for the same
// constraint). Outside a React render pass, cache() simply doesn't memoize;
// the queries still run correctly. Never import this module from client code.

import { cache } from "react";

import { and, count, eq, isNull } from "drizzle-orm";

import {
  db,
  govtAssignments,
  notifications,
  organizationMemberships,
  organizations,
  profiles,
} from "@/db";
import type { Organization, OrganizationMembership } from "@/db";

// ---------------------------------------------------------------------------
// Profile — canonical per-request read
// ---------------------------------------------------------------------------

export type CachedProfile = {
  id: string;
  role: "owner" | "vet" | "govt" | "admin";
  displayName: string;
  accountType: "personal" | "institutional";
  deactivatedAt: Date | null;
  // Soft-delete marker set by erase_subject_data (Ley 25.326 art. 16). A
  // non-null value means the account was erased at the subject's request: its
  // PII is hashed/nulled and it must NOT be able to authenticate any longer
  // (requireUserOrRedirect bounces it to /login). Distinct from deactivatedAt,
  // which is the institutional-account admin deactivation flag.
  deletedAt: Date | null;
};

/**
 * Cached profile read: union of all per-request column shapes.
 * One DB round-trip per user per render pass — layout, guard, and page all
 * share the same memoized result.
 */
export const getProfileCached = cache(async (userId: string): Promise<CachedProfile | null> => {
  const [row] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      displayName: profiles.displayName,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row ?? null;
});

// ---------------------------------------------------------------------------
// Jurisdictions — active govt_assignments for a user
// ---------------------------------------------------------------------------

export type CachedJurisdiction = { province: string; locality: string };

/**
 * Cached active-jurisdictions read. Empty array for non-govt / no assignments.
 */
export const getJurisdictionsCached = cache(
  async (userId: string): Promise<CachedJurisdiction[]> => {
    const rows = await db
      .select({
        province: govtAssignments.jurisdictionProvince,
        locality: govtAssignments.jurisdictionLocality,
      })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, userId), isNull(govtAssignments.revokedAt)));
    return rows;
  },
);

// ---------------------------------------------------------------------------
// Org membership by token — org layout + every org page guard share this
// ---------------------------------------------------------------------------

export type CachedOrgMembership = {
  organization: Organization;
  membership: OrganizationMembership;
};

/**
 * Cached org-membership lookup by (orgToken, userId). Returns null when the
 * org does not exist or the user has no active membership. Callers decide
 * the 404 / redirect policy; this helper just caches the read.
 */
export const getOrgMembershipCached = cache(
  async (orgToken: string, userId: string): Promise<CachedOrgMembership | null> => {
    const [row] = await db
      .select({ organization: organizations, membership: organizationMemberships })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizations.publicToken, orgToken),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(1);
    return row ?? null;
  },
);

// ---------------------------------------------------------------------------
// Org memberships — citizen context-switcher enumeration (D6, Item 7)
// ---------------------------------------------------------------------------

export type CachedOrgMembershipSummary = { token: string; name: string };

/**
 * Cached enumeration of the orgs a user is an active member of, for the citizen
 * context-switcher (D6). Returns the org public token + display name only —
 * enough for the switcher to render "hop to org" destinations. Capability
 * checks stay in the org layout; this is purely the membership list.
 *
 * One indexed read on organization_memberships (joined to organizations),
 * filtered to active memberships (leftAt IS NULL). Memoized per request so the
 * citizen masthead and any sibling consumer share a single round-trip.
 */
export const getOrgMembershipsCached = cache(
  async (userId: string): Promise<CachedOrgMembershipSummary[]> => {
    const rows = await db
      .select({
        token: organizations.publicToken,
        name: organizations.displayName,
      })
      .from(organizationMemberships)
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(
        and(eq(organizationMemberships.userId, userId), isNull(organizationMemberships.leftAt)),
      );
    return rows;
  },
);

// ---------------------------------------------------------------------------
// Unread notifications count — (app)/layout + /inicio share this
// ---------------------------------------------------------------------------

/**
 * Cached unread-notifications count. Layout and /inicio page both render in
 * the same pass; without caching they issue identical COUNT queries.
 */
export const getUnreadCountCached = cache(async (userId: string): Promise<number> => {
  const [{ unreadCount }] = await db
    .select({ unreadCount: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );
  return unreadCount;
});
