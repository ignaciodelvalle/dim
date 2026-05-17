// Search helpers for the admin pages (/admin/usuarios, /admin/organizaciones).
//
// Govt scope-limits hit only the organizations search because users have
// no declared jurisdiction field today — spec §8 mentions filtering users
// by "jurisdicción declarada" but that lives in the future. For Fase 3
// govt sees the same user-search result set as admin; the action-buttons
// per row are what enforce who-can-propose-what.

import { and, eq, ilike, isNull, or } from "drizzle-orm";

import { db, organizations, profiles } from "@/db";
import type { AdminOrGovtJurisdiction } from "@/lib/auth-guards";

export type UserSearchResult = {
  id: string;
  displayName: string;
  role: "owner" | "vet" | "govt" | "admin";
};

export type OrgSearchResult = {
  id: string;
  displayName: string;
  legalName: string;
  orgType: string;
  cuit: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  verified: boolean;
};

const SEARCH_LIMIT = 25;

// Look up users by display_name OR dni_number prefix. Empty query returns
// a small recent list so the page renders something useful on landing.
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName, role: profiles.role })
      .from(profiles)
      .limit(SEARCH_LIMIT);
    return rows;
  }
  const pattern = `%${trimmed}%`;
  const rows = await db
    .select({ id: profiles.id, displayName: profiles.displayName, role: profiles.role })
    .from(profiles)
    .where(or(ilike(profiles.displayName, pattern), ilike(profiles.dniNumber, pattern)))
    .limit(SEARCH_LIMIT);
  return rows;
}

// Search organizations. Admin sees all; govt sees only orgs whose
// (jurisdiction_province, jurisdiction_locality) matches one of their
// active assignments.
export async function searchOrganizations(
  query: string,
  scope: { role: "admin" | "govt"; jurisdictions: readonly AdminOrGovtJurisdiction[] },
): Promise<OrgSearchResult[]> {
  // Govt with zero assignments sees nothing; skip the query entirely.
  if (scope.role === "govt" && scope.jurisdictions.length === 0) return [];

  const trimmed = query.trim();
  const textPredicate = trimmed
    ? or(
        ilike(organizations.displayName, `%${trimmed}%`),
        ilike(organizations.legalName, `%${trimmed}%`),
        ilike(organizations.cuit, `%${trimmed}%`),
      )
    : undefined;

  const scopePredicate =
    scope.role === "admin"
      ? undefined
      : or(
          ...scope.jurisdictions.map((j) =>
            and(
              eq(organizations.jurisdictionProvince, j.province),
              eq(organizations.jurisdictionLocality, j.locality),
            ),
          ),
        );

  const where =
    textPredicate && scopePredicate
      ? and(textPredicate, scopePredicate)
      : (textPredicate ?? scopePredicate);

  return db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      legalName: organizations.legalName,
      orgType: organizations.orgType,
      cuit: organizations.cuit,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
      verified: organizations.verified,
    })
    .from(organizations)
    .where(where)
    .limit(SEARCH_LIMIT);
}

// Re-export for keep-it-tree-shakeable test imports.
void isNull;
