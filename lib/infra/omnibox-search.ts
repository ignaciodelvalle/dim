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

import { and, eq, ilike, or, sql } from "drizzle-orm";

import { cases, db, ownerships, petIdentifications, pets, welfareReports } from "@/db";
import { searchUsers } from "@/lib/infra/admin-search";
import type { AdminOrGovtJurisdiction } from "@/lib/infra/auth-guards";
import { jurisdictionPairClause } from "@/lib/metrics/scope";
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
  // Subsumption-aware (2026-07-08): a whole-province assignment (whole-CABA /
  // "Ciudad Autónoma de Buenos Aires") governs every barrio in it, so it must
  // match a barrio-tagged (Palermo) case on PROVINCE alone — the same predicate
  // canReadCase re-gates with. Fail-closed: govt with no assignments (should be
  // short-circuited upstream) yields `false`, never an unscoped leak.
  return (
    jurisdictionPairClause(
      [...scope.jurisdictions],
      sql`${cases.jurisdictionProvince}`,
      sql`${cases.jurisdictionLocality}`,
    ) ?? sql`false`
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
    // An operator must land on the case detail INSIDE their own shell, not on
    // the public citizen route (app/(public)/casos/[publicCode]) which renders
    // under the citizen layout and strips the operator rail/topbar — the
    // shell-loss class fixed for the /gob CaseQueue in task #47. Both
    // /gob/casos/[publicCode] and /admin/casos/[publicCode] render the
    // identical CaseDetailView and re-gate via canReadCase, so nothing is
    // widened.
    //
    // Admin used to keep "the canonical /casos/[publicCode]" here. That was the
    // unfixed admin half of the same bug: QA ronda 5 (2026-07-16) opened a
    // denuncia as a national operator and landed in the citizen chrome. The
    // admin in-shell route now exists, so both roles route to their own shell.
    href: scope.role === "govt" ? `/gob/casos/${r.publicCode}` : `/admin/casos/${r.publicCode}`,
  }));
}

/**
 * Resolve welfare denuncias by their public reference code (DEN-XXXX-XXXX).
 *
 * WHY (QA 2026-07-08): denuncia tracking codes live in
 * `welfare_reports.reference_code`, NOT `cases.public_code`. An operator (even a
 * universal superadmin) pasting a DEN- code into the omnibox got "Sin
 * coincidencias" because searchCases only matched CAS- codes. This surfaces the
 * denuncia so the DEN- code an operator sees actually resolves.
 *
 * A denuncia's operator detail lives at /gob/maltrato/[id] for BOTH roles (the
 * page re-gates: admin is universal, govt via jurisdictionScopeContains). Result
 * is shaped as a case-group row (caseKind 'welfare_denuncia') so it renders in
 * the existing "Casos" group; publicCode carries the DEN- code the user typed.
 *
 * Scope: admin → unscoped (universal). govt → subsumption-aware jurisdiction
 * match (whole-CABA sees a Palermo-tagged denuncia), fail-closed to `false`.
 */
async function searchWelfareReports(
  query: string,
  scope: Extract<OmniboxScope, { role: "admin" } | { role: "govt" }>,
): Promise<OmniboxCaseResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scopePredicate =
    scope.role === "admin"
      ? undefined
      : (jurisdictionPairClause(
          [...scope.jurisdictions],
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        ) ?? sql`false`);
  // Reference codes are opaque non-PII identifiers (same class as cases.publicCode).
  const codePredicate = ilike(welfareReports.referenceCode, likeContains(trimmed));
  const where = scopePredicate ? and(scopePredicate, codePredicate) : codePredicate;

  const rows = await db
    .select({
      id: welfareReports.id,
      referenceCode: welfareReports.referenceCode,
      status: welfareReports.status,
    })
    .from(welfareReports)
    .where(where)
    .limit(PER_TYPE_LIMIT);

  return rows.map((r) => ({
    type: "case" as const,
    id: r.id,
    publicCode: r.referenceCode,
    caseKind: "welfare_denuncia",
    status: r.status,
    // Operator denuncia detail — same route for admin and govt; the page owns
    // the scope re-gate (admin universal; govt via jurisdictionScopeContains).
    href: `/gob/maltrato/${r.id}`,
  }));
}

/**
 * Runs the scoped omnibox search.
 *
 * - org scope  → pets only (pets the org currently holds via shelter_custody).
 * - admin/govt → persons + cases (incl. welfare denuncias by DEN- code); no pets.
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

  const [personResults, caseResults, welfareResults] = await Promise.all([
    searchPersons(trimmed, scope),
    searchCases(trimmed, scope),
    searchWelfareReports(trimmed, scope),
  ]);

  // Welfare denuncias (matched by DEN- reference code) join the "Casos" group so
  // a DEN- paste resolves alongside CAS- cases in one list.
  const allCases = [...caseResults, ...welfareResults];

  return {
    pets: [],
    persons: personResults,
    cases: allCases,
    total: personResults.length + allCases.length,
  };
}
