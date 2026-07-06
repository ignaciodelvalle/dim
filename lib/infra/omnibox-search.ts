// Operator omnibox (global search) — jurisdiction-scoped, read-only lookups
// across the three operator entities: pets, persons and cases.
//
// Wave 2 Item 10.1 (docs/superpowers/specs/2026-06-18-wave2-ux-hardening-handoff.md).
// UX 1.1: org variant (pet-only, held by the org); admin/govt variant drops pets.
//
// Security model (mirrors lib/admin-search.ts + app/actions/decomiso-pet-lookup.ts):
//   - admin: universal scope. session.jurisdictions is empty by contract; the
//     queries apply NO jurisdiction predicate.
//   - govt: scoped to their active assignments. A govt viewer with zero
//     assignments receives ZERO results without hitting the database (prefer
//     showing LESS over leaking cross-jurisdiction PII).
//   - org: scoped to pets the org currently holds (active shelter_custody).
//     Returns pets only — operators cannot search persons or cases via org portal.
//
// Scope predicates per entity:
//   - person: reuses searchUsers() which scopes via the ownerships→pets
//     jurisdiction semi-join already audited for /gob/usuarios (P1-2).
//   - case: cases.(province, locality) matches one of the viewer's assignments
//     (same pair predicate listCasesForGovt uses).
//
// This module never writes. PII-query logging is the caller's responsibility
// (the server action logs a single pii_queried audit row per search), exactly
// like /gob/usuarios does.

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { cases, db, ownerships, petIdentifications, pets } from "@/db";
import { searchUsers } from "@/lib/infra/admin-search";
import type { AdminOrGovtJurisdiction } from "@/lib/infra/auth-guards";
import { likeContains } from "@/lib/utils/like-helpers";

// Per-type cap. The dropdown only ever shows a handful of rows per group; a low
// cap keeps the query cheap and the PII surface small.
const PER_TYPE_LIMIT = 5;

// DIM token shape: DIM-XXXX-XXXX (case-insensitive). Used to detect when the
// query is an exact-token lookup vs a free-text name search.
const DIM_TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export type OmniboxScope =
  | { role: "admin" }
  | { role: "govt"; jurisdictions: readonly AdminOrGovtJurisdiction[] }
  | { role: "org"; organizationId: string; orgToken: string };

export type OmniboxPetResult = {
  type: "pet";
  id: string;
  publicToken: string;
  name: string;
  species: string;
  /** Canonical deep link into the operator-visible pet profile. */
  href: string;
};

export type OmniboxPersonResult = {
  type: "person";
  id: string;
  displayName: string;
  role: string;
  href: string;
};

export type OmniboxCaseResult = {
  type: "case";
  id: string;
  publicCode: string;
  caseKind: string;
  status: string;
  href: string;
};

export type OmniboxResult = OmniboxPetResult | OmniboxPersonResult | OmniboxCaseResult;

export type OmniboxResults = {
  pets: OmniboxPetResult[];
  persons: OmniboxPersonResult[];
  cases: OmniboxCaseResult[];
  /** Total across all groups — convenience for the empty/no-results state. */
  total: number;
};

const EMPTY_RESULTS: OmniboxResults = { pets: [], persons: [], cases: [], total: 0 };

function caseJurisdictionScope(scope: Extract<OmniboxScope, { role: "admin" } | { role: "govt" }>) {
  if (scope.role === "admin") return undefined;
  return or(
    ...scope.jurisdictions.map((j) =>
      and(eq(cases.jurisdictionProvince, j.province), eq(cases.jurisdictionLocality, j.locality)),
    ),
  );
}

/**
 * Search pets currently held by an org (active shelter_custody ownership).
 * Uses the same text match strategy as the former admin/govt pet search, but
 * scoped to the org's active ownerships. A pet appearing in multiple custody
 * rows for the same org is returned only once (DISTINCT on pets.id via Map).
 */
async function searchOrgPets(
  query: string,
  scope: Extract<OmniboxScope, { role: "org" }>,
): Promise<OmniboxPetResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isToken = DIM_TOKEN_PATTERN.test(trimmed);

  const namePredicate = sql`unaccent(${pets.name}) ILIKE unaccent(${likeContains(trimmed)}) ESCAPE '\'`;
  const tokenPredicate = isToken
    ? ilike(pets.publicToken, trimmed)
    : ilike(pets.publicToken, likeContains(trimmed));
  const chipPredicate = sql`EXISTS (
    SELECT 1 FROM ${petIdentifications}
    WHERE ${petIdentifications.petId} = ${pets.id}
      AND ${petIdentifications.status} = 'active'
      AND ${petIdentifications.code} ILIKE ${likeContains(trimmed)} ESCAPE '\'
  )`;

  const textPredicate = or(tokenPredicate, namePredicate, chipPredicate);

  // INNER JOIN ownerships so only org-held pets are visible.
  // role = 'shelter_custody' + endedAt IS NULL → active custody only.
  // DISTINCT ON pets.id prevents duplicates if somehow multiple custody rows
  // match (defensive; the unique constraint makes this unlikely in practice).
  const rows = await db
    .selectDistinct({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        sql`${pets.deletedAt} IS NULL`,
        eq(ownerships.ownerOrganizationId, scope.organizationId),
        eq(ownerships.role, "shelter_custody"),
        sql`${ownerships.endedAt} IS NULL`,
        textPredicate,
      ),
    )
    .limit(PER_TYPE_LIMIT);

  return rows.map((r) => ({
    type: "pet" as const,
    id: r.id,
    publicToken: r.publicToken,
    name: r.name,
    species: r.species,
    href: `/org/${scope.orgToken}/mascotas/${r.publicToken}`,
  }));
}

async function searchPersons(
  query: string,
  scope: Extract<OmniboxScope, { role: "admin" } | { role: "govt" }>,
): Promise<OmniboxPersonResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Reuse the audited /gob/usuarios scope logic verbatim. searchUsers already
  // short-circuits govt-with-zero-assignments to [] and applies the
  // ownerships→pets jurisdiction semi-join for govt viewers.
  const users = await searchUsers(
    trimmed,
    scope.role === "admin"
      ? { role: "admin" }
      : { role: "govt", jurisdictions: scope.jurisdictions },
  );

  return users.slice(0, PER_TYPE_LIMIT).map((u) => ({
    type: "person" as const,
    id: u.id,
    displayName: u.displayName,
    role: u.role,
    href: `/gob/usuarios?q=${encodeURIComponent(u.displayName)}`,
  }));
}

async function searchCases(
  query: string,
  scope: Extract<OmniboxScope, { role: "admin" } | { role: "govt" }>,
): Promise<OmniboxCaseResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scopePredicate = caseJurisdictionScope(scope);
  // Case lookup is by public code (e.g. an exact or prefix code paste). Codes
  // are non-PII identifiers, but the row is still jurisdiction-scoped so a govt
  // viewer cannot enumerate cases outside their assignments.
  const codePredicate = ilike(cases.publicCode, likeContains(trimmed));
  const where = scopePredicate ? and(scopePredicate, codePredicate) : codePredicate;

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      status: cases.status,
    })
    .from(cases)
    .where(where)
    .limit(PER_TYPE_LIMIT);

  return rows.map((r) => ({
    type: "case" as const,
    id: r.id,
    publicCode: r.publicCode,
    caseKind: r.caseKind,
    status: r.status,
    // A govt operator must land on the case detail INSIDE the /gob shell, not
    // the public citizen route (app/(public)/casos/[publicCode]) which renders
    // under the citizen layout and strips the operator rail/topbar — the same
    // shell-loss class fixed for the /gob CaseQueue in task #47. /gob/casos/
    // [publicCode] renders the identical CaseDetailView and re-gates via
    // canReadCase, so nothing is widened. Admin keeps the canonical
    // /casos/[publicCode] (mirrors the admin CaseQueue detailHref).
    href: scope.role === "govt" ? `/gob/casos/${r.publicCode}` : `/casos/${r.publicCode}`,
  }));
}

/**
 * Runs the scoped omnibox search.
 *
 * - org scope  → pets only (pets the org currently holds via shelter_custody).
 * - admin/govt → persons + cases only (no pet results for operators).
 *
 * Security guarantees:
 *   - govt with zero jurisdiction assignments → empty result, NO db hit.
 *   - govt results are restricted to their assigned jurisdiction(s).
 *   - admin → universal scope.
 *   - org → pets scoped to active ownerships for that org.
 *
 * Does NOT log the PII query — the caller (server action) owns that, so the
 * audit row records the authenticated actor and exact result count.
 */
export async function searchOmnibox(query: string, scope: OmniboxScope): Promise<OmniboxResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;

  if (scope.role === "org") {
    const petResults = await searchOrgPets(trimmed, scope);
    return { pets: petResults, persons: [], cases: [], total: petResults.length };
  }

  // admin / govt branch — no pet results for operators (UX 1.1).
  // govt-with-no-assignments must see nothing without touching the DB.
  if (scope.role === "govt" && scope.jurisdictions.length === 0) return EMPTY_RESULTS;

  const [personResults, caseResults] = await Promise.all([
    searchPersons(trimmed, scope),
    searchCases(trimmed, scope),
  ]);

  return {
    pets: [],
    persons: personResults,
    cases: caseResults,
    total: personResults.length + caseResults.length,
  };
}
