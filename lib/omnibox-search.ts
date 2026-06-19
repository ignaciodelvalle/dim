// Operator omnibox (global search) — jurisdiction-scoped, read-only lookups
// across the three operator entities: pets, persons and cases.
//
// Wave 2 Item 10.1 (docs/superpowers/specs/2026-06-18-wave2-ux-hardening-handoff.md).
//
// Security model (mirrors lib/admin-search.ts + app/actions/decomiso-pet-lookup.ts):
//   - admin: universal scope. session.jurisdictions is empty by contract; the
//     queries apply NO jurisdiction predicate.
//   - govt: scoped to their active assignments. A govt viewer with zero
//     assignments receives ZERO results without hitting the database (prefer
//     showing LESS over leaking cross-jurisdiction PII).
//
// Scope predicates per entity:
//   - pet: pets.jurisdiction_province ∈ assigned provinces. A pet with a null
//     province is treated as out-of-scope for govt (cannot prove it belongs to
//     the viewer) — admin still sees it.
//   - person: reuses searchUsers() which scopes via the ownerships→pets
//     jurisdiction semi-join already audited for /gob/usuarios (P1-2).
//   - case: cases.(province, locality) matches one of the viewer's assignments
//     (same pair predicate listCasesForGovt uses).
//
// This module never writes. PII-query logging is the caller's responsibility
// (the server action logs a single pii_queried audit row per search), exactly
// like /gob/usuarios does.

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { cases, db, petIdentifications, pets } from "@/db";
import { searchUsers } from "@/lib/admin-search";
import type { AdminOrGovtJurisdiction } from "@/lib/auth-guards";
import { likeContains } from "@/lib/like-helpers";

// Per-type cap. The dropdown only ever shows a handful of rows per group; a low
// cap keeps the query cheap and the PII surface small.
const PER_TYPE_LIMIT = 5;

// DIM token shape: DIM-XXXX-XXXX (case-insensitive). Used to detect when the
// query is an exact-token lookup vs a free-text name search.
const DIM_TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export type OmniboxScope =
  | { role: "admin" }
  | { role: "govt"; jurisdictions: readonly AdminOrGovtJurisdiction[] };

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

// Build the govt jurisdiction predicate for a (province[, locality]) table.
// Returns undefined for admin (no predicate). Caller must short-circuit to an
// empty result BEFORE calling this when a govt viewer has zero assignments.
function petProvinceScope(scope: OmniboxScope) {
  if (scope.role === "admin") return undefined;
  const provinces = Array.from(new Set(scope.jurisdictions.map((j) => j.province)));
  return inArray(pets.jurisdictionProvince, provinces);
}

function caseJurisdictionScope(scope: OmniboxScope) {
  if (scope.role === "admin") return undefined;
  return or(
    ...scope.jurisdictions.map((j) =>
      and(eq(cases.jurisdictionProvince, j.province), eq(cases.jurisdictionLocality, j.locality)),
    ),
  );
}

async function searchPets(query: string, scope: OmniboxScope): Promise<OmniboxPetResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scopePredicate = petProvinceScope(scope);
  const isToken = DIM_TOKEN_PATTERN.test(trimmed);

  // Match strategy:
  //   - exact DIM token (case-insensitive) OR
  //   - name contains (accent-insensitive via unaccent) OR
  //   - an ACTIVE microchip code contains the query (pet_identifications).
  // The microchip predicate is an EXISTS semi-join so a pet with multiple
  // identifiers is not duplicated.
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

  // Soft-deleted pets must never surface in operator search.
  const notDeleted = sql`${pets.deletedAt} IS NULL`;
  const textPredicate = or(tokenPredicate, namePredicate, chipPredicate);
  const where = scopePredicate
    ? and(notDeleted, scopePredicate, textPredicate)
    : and(notDeleted, textPredicate);

  const rows = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
    })
    .from(pets)
    .where(where)
    .limit(PER_TYPE_LIMIT);

  return rows.map((r) => ({
    type: "pet" as const,
    id: r.id,
    publicToken: r.publicToken,
    name: r.name,
    species: r.species,
    href: `/mis-mascotas/${r.publicToken}`,
  }));
}

async function searchPersons(query: string, scope: OmniboxScope): Promise<OmniboxPersonResult[]> {
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

async function searchCases(query: string, scope: OmniboxScope): Promise<OmniboxCaseResult[]> {
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
    href: "/gob/casos",
  }));
}

/**
 * Runs the scoped omnibox search across pets, persons and cases in parallel.
 *
 * Security guarantees:
 *   - govt with zero jurisdiction assignments → empty result, NO db hit.
 *   - govt results are restricted to their assigned jurisdiction(s).
 *   - admin → universal scope.
 *
 * Does NOT log the PII query — the caller (server action) owns that, so the
 * audit row records the authenticated actor and exact result count.
 */
export async function searchOmnibox(query: string, scope: OmniboxScope): Promise<OmniboxResults> {
  const trimmed = query.trim();
  if (!trimmed) return EMPTY_RESULTS;

  // govt-with-no-assignments must see nothing without touching the DB.
  if (scope.role === "govt" && scope.jurisdictions.length === 0) return EMPTY_RESULTS;

  const [petResults, personResults, caseResults] = await Promise.all([
    searchPets(trimmed, scope),
    searchPersons(trimmed, scope),
    searchCases(trimmed, scope),
  ]);

  return {
    pets: petResults,
    persons: personResults,
    cases: caseResults,
    total: petResults.length + personResults.length + caseResults.length,
  };
}
