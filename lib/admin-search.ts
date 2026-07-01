// Search helpers for the admin pages (/admin/usuarios, /admin/organizaciones).
//
// Govt scope for users (P1-2):
//   A govt user should only see users who are meaningfully linked to their
//   assigned jurisdiction(s). The most defensible link in the current schema
//   is: the user owns at least one pet whose (jurisdictionProvince, jurisdictionLocality)
//   matches one of the viewer's assignments. We JOIN profiles → ownerships →
//   pets and apply the scope predicate. The alternative (profiles' own province
//   field) was rejected because profiles have no jurisdiction columns — only
//   personal accounts carry dniNumber/matricula data that is unrelated to
//   geographic jurisdiction.
//
//   Consequence: users with zero pets (or pets with null jurisdiction) do NOT
//   appear in a govt viewer's search. This is intentional — prefer showing LESS
//   over showing cross-jurisdiction PII (security decision, see docs/qa/ui-flow-review-2026-06.md P1-2).
//
// Admin: universal scope (no predicate — same as before).

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db, organizations, ownerships, pets, profiles } from "@/db";
import type { AdminOrGovtJurisdiction } from "@/lib/auth-guards";
import { likeContains } from "@/lib/utils/like-helpers";

export type UserSearchResult = {
  id: string;
  displayName: string;
  role: "owner" | "vet" | "govt" | "admin";
  // Jurisdiction that issued the vet's professional license. Used by
  // RevokeUserActions (Fase 4+) for client-side canRevoke scope check.
  // Null for non-vet users.
  matriculaJurisdiccion: string | null;
};

export type UserSearchScope =
  | { role: "admin" }
  | { role: "govt"; jurisdictions: readonly AdminOrGovtJurisdiction[] };

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
// Larger limit for the default (no-query) paginated listing.
const DEFAULT_LIST_LIMIT = 50;

// Look up users by display_name.
// Wave 5 Item 25a: DNI is no longer stored in plaintext — prefix search on
// dni_number is removed. Searching by exact DNI now requires the full number
// to compute its hash (hashDni(input)) and match against profiles.dni_hash.
// That capability (exact-hash lookup) can be wired in a future item when the
// admin search UX explicitly requests it.
//
// Empty query returns a default list ordered by role priority then display
// name, limited to DEFAULT_LIST_LIMIT rows so the page is always useful on
// landing without PII search intent.
//
// `scope` controls jurisdiction filtering:
//   - admin: no scope predicate — returns all users.
//   - govt: scoped to users who own at least one pet in the viewer's jurisdiction
//     (see module-level comment for the rationale). Govt with zero assignments
//     returns an empty list immediately.
export async function searchUsers(
  query: string,
  scope: UserSearchScope = { role: "admin" },
): Promise<UserSearchResult[]> {
  // Govt with no assignments must see nothing (prefer showing LESS).
  if (scope.role === "govt" && scope.jurisdictions.length === 0) return [];

  const trimmed = query.trim();

  // Build the jurisdiction scope predicate for govt viewers.
  // We join profiles → ownerships → pets and filter on the pet's jurisdiction
  // columns. This is a semi-join: DISTINCT ensures each user appears once even
  // if they have multiple pets in the matching jurisdiction.
  const scopeConditions: ReturnType<typeof and>[] = [];
  if (scope.role === "govt") {
    // At least one active ownership linking the user to a scoped pet.
    // ownerships.role = 'owner' ensures we only count real owners (not caretakers).
    // ownerships.endedAt IS NULL restricts to current owners.
    const jurisdictionPairs = scope.jurisdictions.map((j) =>
      and(eq(pets.jurisdictionProvince, j.province), eq(pets.jurisdictionLocality, j.locality)),
    );
    scopeConditions.push(
      // profiles.id ∈ SELECT DISTINCT ownerUserId FROM ownerships JOIN pets ON ...
      sql`${profiles.id} IN (
        SELECT DISTINCT ${ownerships.ownerUserId}
        FROM ${ownerships}
        INNER JOIN ${pets} ON ${pets.id} = ${ownerships.petId}
        WHERE ${ownerships.endedAt} IS NULL
          AND ${ownerships.role} = 'owner'
          AND (${or(...jurisdictionPairs)})
      )`,
    );
  }

  // Role sort priority: admin → govt → vet → owner (others sort last).
  const rolePriority = sql`CASE ${profiles.role}
    WHEN 'admin' THEN 1
    WHEN 'govt'  THEN 2
    WHEN 'vet'   THEN 3
    WHEN 'owner' THEN 4
    ELSE 5
  END`;

  if (!trimmed) {
    const whereClause = scopeConditions.length > 0 ? and(...scopeConditions) : undefined;
    const rows = await db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        role: profiles.role,
        matriculaJurisdiccion: profiles.matriculaJurisdiccion,
      })
      .from(profiles)
      .where(whereClause)
      .orderBy(rolePriority, profiles.displayName)
      .limit(DEFAULT_LIST_LIMIT);
    return rows;
  }

  const pattern = likeContains(trimmed);
  // Use unaccent() so "gonzalez" finds "González" (Postgres ILIKE folds case
  // but NOT diacritics). Wildcard-safe via likeContains().
  // Wave 5 Item 25a: dni_number is gone — search by display_name only.
  // Exact DNI lookup (future): hashDni(input) → WHERE dni_hash = <hash>.
  const textPredicate = sql`unaccent(${profiles.displayName}) ILIKE unaccent(${pattern}) ESCAPE '\'`;
  const whereClause =
    scopeConditions.length > 0 ? and(textPredicate, ...scopeConditions) : textPredicate;

  const rows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      role: profiles.role,
      matriculaJurisdiccion: profiles.matriculaJurisdiccion,
    })
    .from(profiles)
    .where(whereClause)
    .limit(SEARCH_LIMIT);
  return rows;
}

export type OrgVerifiedFilter = "pending" | "verified" | "all";

// Search organizations. Admin sees all; govt sees only orgs whose
// (jurisdiction_province, jurisdiction_locality) matches one of their
// active assignments.
//
// `verifiedFilter` pushes the verified/unverified predicate into SQL so the
// LIMIT is applied AFTER the filter — preventing the "Pendientes" tab from
// silently truncating the queue when more than SEARCH_LIMIT orgs exist.
export async function searchOrganizations(
  query: string,
  scope: { role: "admin" | "govt"; jurisdictions: readonly AdminOrGovtJurisdiction[] },
  verifiedFilter: OrgVerifiedFilter = "all",
): Promise<{ items: OrgSearchResult[]; truncated: boolean }> {
  // Govt with zero assignments sees nothing; skip the query entirely.
  if (scope.role === "govt" && scope.jurisdictions.length === 0)
    return { items: [], truncated: false };

  const trimmed = query.trim();
  const orgPattern = likeContains(trimmed);
  // Use unaccent() on both sides for accent-insensitive matching; likeContains
  // escapes % and _ so user input cannot inject wildcards. CUIT is digits-only
  // so unaccent is a no-op there, but the escaping still matters.
  const textPredicate = trimmed
    ? or(
        sql`unaccent(${organizations.displayName}) ILIKE unaccent(${orgPattern}) ESCAPE '\'`,
        sql`unaccent(${organizations.legalName}) ILIKE unaccent(${orgPattern}) ESCAPE '\'`,
        sql`unaccent(${organizations.cuit}) ILIKE unaccent(${orgPattern}) ESCAPE '\'`,
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

  const verifiedPredicate =
    verifiedFilter === "pending"
      ? eq(organizations.verified, false)
      : verifiedFilter === "verified"
        ? eq(organizations.verified, true)
        : undefined;

  // Combine all predicates. and() with every defined clause produces a single
  // SQL<unknown> that drizzle's .where() accepts cleanly.
  const activeClauses = [textPredicate, scopePredicate, verifiedPredicate].filter(
    (c): c is NonNullable<typeof c> => c !== undefined,
  );
  const where =
    activeClauses.length === 0
      ? undefined
      : activeClauses.length === 1
        ? activeClauses[0]
        : and(...activeClauses);

  // Fetch one extra row to detect truncation without a separate COUNT query.
  const limit = SEARCH_LIMIT;
  const rows = await db
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
    .limit(limit + 1);

  const truncated = rows.length > limit;
  return { items: truncated ? rows.slice(0, limit) : rows, truncated };
}

// Re-export for keep-it-tree-shakeable test imports.
void isNull;
