// Read-side data accessors for the cases system UI.
//
// Each helper does a single composed query that returns the shape the
// page renders. They run against the service-role db (Drizzle bypasses
// RLS) and rely on the calling page to enforce the access policy via
// the existing role guards (requireUserOrRedirect, requireOrgAccessByToken,
// requireAdminOrGovtOrRedirect). Once Fase F lands per-kind RLS, these
// helpers stay correct — they query the same rows the policies expose.

import { HIDDEN_FROM_SUBJECT_CASE_KINDS } from "@/lib/infra/case-access";
import { jurisdictionPairClause } from "@/lib/metrics/scope";
import { type KeysetCursor, decodeCursor, keysetWhere } from "@/lib/utils/keyset-pagination";
import {
  type SQL,
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import {
  type CaseClosedReason,
  type CaseEvent,
  type CaseStatus,
  type CaseSubjectKind,
  attachments,
  caseEvents,
  cases,
  custodyDisputes,
  db,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  welfareReports,
} from "@/db";
import { type CaseKind, isCaseKind } from "@/src/modules/cases/domain/case-kinds";

// Case kinds excluded from every generic "open cases for pet" projection
// consumed by owner-facing surfaces (badges, alert strips, /cuenta/casos):
//   - HIDDEN_FROM_SUBJECT_CASE_KINDS (welfare_denuncia) — privacy fix,
//     the subject owner must never see it here (REQ-1.1).
//   - lost_pet_episode — owned exclusively by the dedicated lost-case
//     block; excluding it here is the single-rendering-path dedup guard
//     (REQ-1.4 / ADR-8), not a privacy concern.
export const GENERIC_CASE_LIST_EXCLUDED_KINDS: readonly CaseKind[] = [
  ...HIDDEN_FROM_SUBJECT_CASE_KINDS,
  "lost_pet_episode",
];

// ---------------------------------------------------------------------------
// Performance projections — perf-only, not security boundaries.
// List views and detail joins use these to avoid fetching all 27 cols of cases.
// ---------------------------------------------------------------------------

// Columns consumed by mapListRow + list pages (9 of 27 cols).
const CASE_LIST_SELECT = {
  id: cases.id,
  publicCode: cases.publicCode,
  caseKind: cases.caseKind,
  status: cases.status,
  // Casos pack (PO interview 2026-07-23, item 6): the queue must render
  // "Animal sin registrar" for an unowned-animal subject instead of a bare
  // "—" (which reads as "data missing", not "this case's subject is a
  // real, honest domain category with no registered pet record").
  primarySubjectKind: cases.primarySubjectKind,
  jurisdictionProvince: cases.jurisdictionProvince,
  jurisdictionLocality: cases.jurisdictionLocality,
  openedAt: cases.openedAt,
  closedAt: cases.closedAt,
} as const;

// Columns consumed by getCaseDetailByPublicCode (20 of 27 cols).
const CASE_DETAIL_SELECT = {
  id: cases.id,
  publicCode: cases.publicCode,
  caseKind: cases.caseKind,
  status: cases.status,
  closedReason: cases.closedReason,
  primarySubjectKind: cases.primarySubjectKind,
  // Canonical columns only (P3 Phase B). Output keys kept as primaryLocationLat/
  // primaryLocationLng — public consumer-facing DTO shape is unchanged.
  primaryLocationLat: cases.locationLat,
  primaryLocationLng: cases.locationLng,
  jurisdictionCountry: cases.jurisdictionCountry,
  jurisdictionProvince: cases.jurisdictionProvince,
  jurisdictionLocality: cases.jurisdictionLocality,
  openedAt: cases.openedAt,
  openedReason: cases.openedReason,
  openedReasonCode: cases.openedReasonCode,
  openedReasonParams: cases.openedReasonParams,
  closedAt: cases.closedAt,
  primaryPetId: cases.primaryPetId,
  welfareReportId: cases.welfareReportId,
  custodyDisputeId: cases.custodyDisputeId,
  openedByOrganizationId: cases.openedByOrganizationId,
  closedByUserId: cases.closedByUserId,
  openedByUserId: cases.openedByUserId,
} as const;

// Columns consumed by getOutbreakInvestigationDetail (13 of 27 cols).
const CASE_OUTBREAK_DETAIL_SELECT = {
  id: cases.id,
  publicCode: cases.publicCode,
  caseKind: cases.caseKind,
  status: cases.status,
  closedReason: cases.closedReason,
  jurisdictionCountry: cases.jurisdictionCountry,
  jurisdictionProvince: cases.jurisdictionProvince,
  jurisdictionLocality: cases.jurisdictionLocality,
  openedAt: cases.openedAt,
  openedReason: cases.openedReason,
  openedReasonCode: cases.openedReasonCode,
  openedReasonParams: cases.openedReasonParams,
  closedAt: cases.closedAt,
  closedByUserId: cases.closedByUserId,
  openedByUserId: cases.openedByUserId,
} as const;

// Columns consumed by listOutbreakInvestigationsForGovt (9 of 27 cols).
const CASE_OUTBREAK_LIST_SELECT = {
  id: cases.id,
  publicCode: cases.publicCode,
  status: cases.status,
  closedReason: cases.closedReason,
  jurisdictionProvince: cases.jurisdictionProvince,
  jurisdictionLocality: cases.jurisdictionLocality,
  openedAt: cases.openedAt,
  closedAt: cases.closedAt,
  openedReason: cases.openedReason,
  openedReasonCode: cases.openedReasonCode,
  openedReasonParams: cases.openedReasonParams,
} as const;

// ---------------------------------------------------------------------------
// Case detail
// ---------------------------------------------------------------------------

export interface CaseDetail {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  closedReason: CaseClosedReason | null;
  primarySubjectKind: CaseSubjectKind;
  primaryLocationLat: string | null;
  primaryLocationLng: string | null;
  jurisdictionCountry: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  openedReason: string | null;
  openedReasonCode: string | null;
  openedReasonParams: unknown;
  closedAt: Date | null;
  // Subject pet (when primaryPetId is set)
  pet: {
    id: string;
    publicToken: string;
    name: string;
    species: string;
    sex: string;
    primaryPhotoStoragePath: string | null;
    status: string;
  } | null;
  // Linked welfare_report (when welfare_denuncia kind)
  welfareReport: {
    id: string;
    referenceCode: string;
    status: string;
  } | null;
  // Linked custody_dispute (when custody_dispute kind)
  custodyDispute: {
    id: string;
    publicToken: string;
    status: string;
  } | null;
  openedByUser: { id: string; displayName: string } | null;
  openedByOrganization: { id: string; displayName: string; publicToken: string } | null;
  closedByUser: { id: string; displayName: string } | null;
  events: CaseEventRow[];
}

export interface CaseEventRow {
  id: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  notes: string | null;
  authorRole: string;
}

/**
 * Loads the full case detail for the public_code. Returns null when not
 * found. Caller is responsible for enforcing access (admin / govt scope /
 * subject owner / per-kind party).
 */
export async function getCaseDetailByPublicCode(publicCode: string): Promise<CaseDetail | null> {
  const [row] = await db
    .select({
      c: CASE_DETAIL_SELECT,
      pet: {
        id: pets.id,
        publicToken: pets.publicToken,
        name: pets.name,
        species: pets.species,
        sex: pets.sex,
        primaryPhotoStoragePath: attachments.storagePath,
        status: pets.status,
      },
      openedByUser: {
        id: profiles.id,
        displayName: profiles.displayName,
      },
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .leftJoin(profiles, eq(profiles.id, cases.openedByUserId))
    .where(eq(cases.publicCode, publicCode))
    .limit(1);
  if (!row) return null;

  // Resolve optional linkbacks in parallel.
  const [
    welfareReportRow,
    custodyDisputeRow,
    openedByOrgRow,
    closedByUserRow,
    petEventRows,
    caseEventRows,
  ] = await Promise.all([
    row.c.welfareReportId
      ? db
          .select({
            id: welfareReports.id,
            referenceCode: welfareReports.referenceCode,
            status: welfareReports.status,
          })
          .from(welfareReports)
          .where(eq(welfareReports.id, row.c.welfareReportId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    row.c.custodyDisputeId
      ? db
          .select({
            id: custodyDisputes.id,
            publicToken: custodyDisputes.publicToken,
            status: custodyDisputes.status,
          })
          .from(custodyDisputes)
          .where(eq(custodyDisputes.id, row.c.custodyDisputeId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    row.c.openedByOrganizationId
      ? db
          .select({
            id: organizations.id,
            displayName: organizations.displayName,
            publicToken: organizations.publicToken,
          })
          .from(organizations)
          .where(eq(organizations.id, row.c.openedByOrganizationId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    row.c.closedByUserId
      ? db
          .select({ id: profiles.id, displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.id, row.c.closedByUserId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        payload: petEvents.payload,
        notes: petEvents.notes,
        authorRole: petEvents.authorRole,
      })
      .from(petEvents)
      .where(eq(petEvents.caseId, row.c.id))
      .orderBy(desc(petEvents.occurredAt))
      // Cap newest 200; merged timeline sorted desc after join. PERF-5 will
      // add cursor-based pagination for deep case histories.
      .limit(200),
    // case_events covers pet-less cases (location/general/unowned) and
    // reporter_comment entries for welfare_denuncia. Merged into the shared
    // timeline so the case detail page shows a unified history.
    db
      .select({
        id: caseEvents.id,
        eventType: caseEvents.entryType,
        occurredAt: caseEvents.occurredAt,
        payload: caseEvents.payload,
        notes: caseEvents.notes,
        authorRole: sql<string>`'system'`,
      })
      .from(caseEvents)
      .where(eq(caseEvents.caseId, row.c.id))
      .orderBy(desc(caseEvents.occurredAt))
      .limit(200),
  ]);

  const caseKind = isCaseKind(row.c.caseKind) ? row.c.caseKind : ("bite_incident" as CaseKind);

  // Merge pet_events + case_events into a single timeline sorted newest-first.
  const mergedEvents: CaseEventRow[] = [...petEventRows, ...caseEventRows].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );

  return {
    id: row.c.id,
    publicCode: row.c.publicCode,
    caseKind,
    status: row.c.status,
    closedReason: row.c.closedReason ?? null,
    primarySubjectKind: row.c.primarySubjectKind,
    primaryLocationLat: row.c.primaryLocationLat ?? null,
    primaryLocationLng: row.c.primaryLocationLng ?? null,
    jurisdictionCountry: row.c.jurisdictionCountry,
    jurisdictionProvince: row.c.jurisdictionProvince,
    jurisdictionLocality: row.c.jurisdictionLocality,
    openedAt: row.c.openedAt,
    openedReason: row.c.openedReason,
    openedReasonCode: row.c.openedReasonCode,
    openedReasonParams: row.c.openedReasonParams,
    closedAt: row.c.closedAt,
    pet: row.pet?.id
      ? {
          id: row.pet.id,
          publicToken: row.pet.publicToken ?? "",
          name: row.pet.name ?? "",
          species: row.pet.species ?? "",
          sex: row.pet.sex ?? "",
          primaryPhotoStoragePath: row.pet.primaryPhotoStoragePath ?? null,
          status: row.pet.status ?? "",
        }
      : null,
    welfareReport: welfareReportRow,
    custodyDispute: custodyDisputeRow,
    openedByUser: row.openedByUser?.id ? row.openedByUser : null,
    openedByOrganization: openedByOrgRow,
    closedByUser: closedByUserRow,
    events: mergedEvents,
  };
}

// ---------------------------------------------------------------------------
// Pet-scoped: open cases for a pet (embeddable in pet profiles)
// ---------------------------------------------------------------------------

export interface PetOpenCase {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  openedAt: Date;
}

export async function findOpenCasesForPetWithCodes(
  petId: string,
  govtScope?: ReadonlyArray<{ province: string; locality: string }>,
): Promise<PetOpenCase[]> {
  // FENCE (govt inspector, task #59): when `govtScope` is provided, restrict the
  // returned open cases to the operator's jurisdiction in SQL, so no out-of-scope
  // case code/kind/open-date ever reaches the payload. `undefined` = admin /
  // universal = unfiltered (existing callers pass nothing and are unchanged).
  // jurisdictionPairClause is the SQL mirror of jurisdictionScopeContains (same
  // whole-province subsumption) used by the linking-case gate — one predicate,
  // no divergence. An empty scope fails closed (`false`), never wide-open.
  let scopeClause: SQL | undefined;
  if (govtScope !== undefined) {
    scopeClause =
      jurisdictionPairClause(
        [...govtScope],
        sql`${cases.jurisdictionProvince}`,
        sql`${cases.jurisdictionLocality}`,
      ) ?? sql`false`;
  }

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      status: cases.status,
      openedAt: cases.openedAt,
    })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, petId),
        inArray(cases.status, ["open", "escalated"]),
        notInArray(cases.caseKind, [...GENERIC_CASE_LIST_EXCLUDED_KINDS]),
        scopeClause,
      ),
    )
    .orderBy(desc(cases.openedAt));
  return rows
    .filter((r) => isCaseKind(r.caseKind))
    .map((r) => ({
      id: r.id,
      publicCode: r.publicCode,
      caseKind: r.caseKind as CaseKind,
      status: r.status,
      openedAt: r.openedAt,
    }));
}

/**
 * Batch-resolve the most-recent `lost_pet_episode` case public_code per pet.
 * Returns a Map keyed by petId → CAS-XXXX-XXXX code.
 *
 * Scope: this inherits the caller's scope. The petIds passed in come from an
 * already jurisdiction-scoped query (fetchLostPets on /gob/perdidas), so this
 * adds no new nationwide read — it only looks up cases for pets already in the
 * viewer's scope. Used to surface the CAS- code + a link to the case on each
 * lost-pet row.
 */
export async function fetchLostEpisodeCaseCodesForPets(
  petIds: string[],
): Promise<Map<string, string>> {
  const byPet = new Map<string, string>();
  if (petIds.length === 0) return byPet;
  const rows = await db
    .select({ primaryPetId: cases.primaryPetId, publicCode: cases.publicCode })
    .from(cases)
    .where(and(eq(cases.caseKind, "lost_pet_episode"), inArray(cases.primaryPetId, petIds)))
    .orderBy(desc(cases.openedAt));
  for (const r of rows) {
    // First row per pet wins — rows are ordered newest-first, so this is the
    // most recent lost episode for that pet.
    if (r.primaryPetId && !byPet.has(r.primaryPetId)) {
      byPet.set(r.primaryPetId, r.publicCode);
    }
  }
  return byPet;
}

// ---------------------------------------------------------------------------
// List pages
// ---------------------------------------------------------------------------

export interface CaseListItem {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  primarySubjectKind: CaseSubjectKind;
  primaryPetName: string | null;
  primaryPetPublicToken: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  closedAt: Date | null;
}

type CaseListRow = {
  id: string;
  publicCode: string;
  caseKind: string;
  status: CaseStatus;
  primarySubjectKind: CaseSubjectKind;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  closedAt: Date | null;
};

function mapListRow(row: {
  c: CaseListRow;
  petName: string | null;
  petPublicToken: string | null;
}): CaseListItem {
  return {
    id: row.c.id,
    publicCode: row.c.publicCode,
    caseKind: isCaseKind(row.c.caseKind) ? row.c.caseKind : ("bite_incident" as CaseKind),
    status: row.c.status,
    primarySubjectKind: row.c.primarySubjectKind,
    primaryPetName: row.petName,
    primaryPetPublicToken: row.petPublicToken,
    jurisdictionProvince: row.c.jurisdictionProvince,
    jurisdictionLocality: row.c.jurisdictionLocality,
    openedAt: row.c.openedAt,
    closedAt: row.c.closedAt,
  };
}

// ---------------------------------------------------------------------------
// Org case list filters — all applied in SQL (no in-memory filtering).
// ---------------------------------------------------------------------------

export interface ListCasesForOrgFilters {
  /** Filter by case kind. Null = all kinds. */
  kind?: CaseKind | null;
  /** Filter by open/closed status. Null = all statuses. */
  status?: "open" | "closed" | null;
}

/**
 * Maximum number of cases returned by listCasesForOrg when no cursor is
 * supplied. Exposed so tests can inject a smaller cap without patching code.
 */
export const LIST_CASES_FOR_ORG_LIMIT = 200;

/**
 * Returns up to LIST_CASES_FOR_ORG_LIMIT cases visible to the org (opener or
 * active owner), filtered entirely in SQL. When the cap is reached the caller
 * should surface a hint — check `truncated` in the returned object.
 *
 * `_limitOverride` is for tests only: pass a small number to verify that
 * results beyond the cap are found when filters are set.
 */
export async function listCasesForOrg(
  orgId: string,
  filters?: ListCasesForOrgFilters,
  _limitOverride?: number,
): Promise<{ items: CaseListItem[]; truncated: boolean }> {
  const limit = _limitOverride ?? LIST_CASES_FOR_ORG_LIMIT;

  // Ownership match via EXISTS instead of a join: a pet can carry multiple
  // active ownership rows (co-owners), and join duplicates would eat slots of
  // the limit+1 fetch — under-filling the page and skewing `truncated`.
  const orgCondition = or(
    eq(cases.openedByOrganizationId, orgId),
    exists(
      db
        .select({ one: sql`1` })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, cases.primaryPetId),
            isNull(ownerships.endedAt),
            eq(ownerships.ownerOrganizationId, orgId),
          ),
        ),
    ),
  );

  // Build filter conditions pushed entirely into SQL.
  const kindCondition = filters?.kind ? eq(cases.caseKind, filters.kind) : undefined;
  const statusCondition =
    filters?.status === "open"
      ? isNull(cases.closedAt)
      : filters?.status === "closed"
        ? isNotNull(cases.closedAt)
        : undefined;

  const rows = await db
    .select({
      c: CASE_LIST_SELECT,
      petName: pets.name,
      petPublicToken: pets.publicToken,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .where(and(orgCondition, kindCondition, statusCondition))
    .orderBy(desc(cases.openedAt))
    // Fetch one extra row so we know whether results were truncated.
    .limit(limit + 1);

  const truncated = rows.length > limit;
  const items = rows.slice(0, limit).map(mapListRow);
  return { items, truncated };
}

/**
 * Returns the distinct case kinds present for the org (opener OR active owner)
 * regardless of status or kind filters. Used to build the kind filter chips.
 *
 * No LIMIT — kind cardinality is bounded by CASE_KINDS (~12 values).
 */
export async function listCaseKindDistributionForOrg(orgId: string): Promise<CaseKind[]> {
  const rows = await db
    .selectDistinct({ caseKind: cases.caseKind })
    .from(cases)
    .leftJoin(ownerships, and(eq(ownerships.petId, cases.primaryPetId), isNull(ownerships.endedAt)))
    .where(or(eq(cases.openedByOrganizationId, orgId), eq(ownerships.ownerOrganizationId, orgId)));
  return rows.map((r) => r.caseKind).filter(isCaseKind) as CaseKind[];
}

// ---------------------------------------------------------------------------
// Kind + status filters — shared between admin and govt case lists (#26 D2).
//
// buildAdminCaseFilterClauses (admin) and listCasesForGovt/countCasesForGovt
// (govt) both filter by kind and status identically; the ONLY thing that
// differs between the two callers is the jurisdiction predicate:
//   - admin: buildAdminCaseFilterClauses' OPTIONAL province clause has no
//     scope boundary — it is the sole jurisdiction axis admin has, applied
//     with no bounding OR-of-assignments.
//   - govt: listCasesForGovt/countCasesForGovt AND this onto a MANDATORY
//     jurisdiction-membership OR-clause (jurisdictionFilter, below) that
//     bounds every query to the caller's own govt_assignments. An optional
//     `province` narrowing (only meaningful for a multi-province operator)
//     is intersected with that OR-clause, so an out-of-scope value can only
//     narrow results to zero rows — it can never widen what the caller sees.
// ---------------------------------------------------------------------------

/**
 * Build the kind + status predicate clauses shared by the admin and govt
 * case-list filters. Exported so pages/tests can inspect the exact SQL shape
 * without hitting the DB.
 */
export function buildCaseKindStatusClauses(filters: {
  kind?: CaseKind | null;
  status?: "open" | "closed" | null;
  excludeKinds?: readonly CaseKind[];
}): ReturnType<typeof and>[] {
  const clauses: ReturnType<typeof and>[] = [];
  if (filters.kind) clauses.push(eq(cases.caseKind, filters.kind) as ReturnType<typeof and>);
  // Kinds that live on their own screen (CASE_KINDS_ROUTED_ELSEWHERE). Applied
  // here — in the ONE builder both the govt and the admin queue share — so the
  // list, the count and the pagination cursor can never disagree about which
  // rows exist. An empty array is a no-op, so callers that do not route
  // anything away are unaffected.
  if (filters.excludeKinds && filters.excludeKinds.length > 0) {
    clauses.push(notInArray(cases.caseKind, [...filters.excludeKinds]) as ReturnType<typeof and>);
  }
  if (filters.status === "open") clauses.push(isNull(cases.closedAt) as ReturnType<typeof and>);
  if (filters.status === "closed")
    clauses.push(isNotNull(cases.closedAt) as ReturnType<typeof and>);
  return clauses;
}

export interface ListCasesForGovtFilters {
  /**
   * Kinds to hide because they have their own screen — pass
   * CASE_KINDS_ROUTED_ELSEWHERE. Omit to show everything.
   */
  excludeKinds?: readonly CaseKind[];
  /** Filter by case kind. Null = all kinds. */
  kind?: CaseKind | null;
  /** Filter by open/closed status. Null = all. */
  status?: "open" | "closed" | null;
  /**
   * Narrow WITHIN the caller's own jurisdiction scope to one province. Only
   * meaningful for a govt operator whose assignments span multiple
   * provinces — callers should omit this (or pass null) for single-province
   * operators. ANDed onto the mandatory jurisdiction-membership clause, so a
   * value outside `jurisdictions` can only narrow to zero rows, never widen.
   */
  province?: string | null;
}

/**
 * Build the govt case-list WHERE clause: a MANDATORY jurisdiction-membership
 * predicate (OR of exact (province, locality) pairs — `sql\`false\`` when
 * `jurisdictions` is empty, never "no restriction") ANDed with the SAME
 * kind/status clauses admin uses, an optional province narrowing, and an
 * optional cursor clause. Shared by listCasesForGovt and countCasesForGovt so
 * their filtered numerator/denominator can never diverge (#26 D2). Exported
 * so tests can inspect the exact SQL shape — incl. the jurisdiction
 * predicate — without hitting the DB.
 */
export function buildGovtCaseWhereClause(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  filters: ListCasesForGovtFilters,
  cursorClause?: SQL,
): SQL {
  // jurisdictionPairClause applies whole-province subsumption (a CABA-wide
  // assignment matches every barrio in CABA, not just the sentinel locality
  // string) — see lib/metrics/scope.ts. Raw per-assignment AND(province,
  // locality) pairs would under-scope a whole-province operator down to
  // literal sentinel-locality rows only (fail-closed but wrong; caught by
  // pre-push review 2026-07-21).
  const jurisdictionFilter: SQL =
    jurisdictionPairClause(
      [...jurisdictions],
      sql`${cases.jurisdictionProvince}`,
      sql`${cases.jurisdictionLocality}`,
    ) ?? sql`false`;
  const filterClauses = buildCaseKindStatusClauses(filters);
  if (filters.province) {
    filterClauses.push(eq(cases.jurisdictionProvince, filters.province) as ReturnType<typeof and>);
  }
  return and(jurisdictionFilter, ...filterClauses, cursorClause) as SQL;
}

// opts.cursor enables keyset pagination (PERF-5): when provided, only rows
// OLDER than the cursor are returned — (openedAt, id) < (cursorTs, cursorId).
// Callers should fetch limit+1 to detect hasMore; render limit rows only.
// opts.filters.status narrows by open (closedAt IS NULL) / closed
// (closedAt IS NOT NULL) so the shared CaseQueue status chips resolve in SQL.
export async function listCasesForGovt(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  opts?: {
    limit?: number;
    cursor?: KeysetCursor;
    filters?: ListCasesForGovtFilters;
  },
): Promise<CaseListItem[]> {
  if (jurisdictions.length === 0) return [];
  const cursorClause = keysetWhere(cases.openedAt, cases.id, decodeCursor(opts?.cursor));
  const whereClause = buildGovtCaseWhereClause(jurisdictions, opts?.filters ?? {}, cursorClause);
  const limit = opts?.limit ?? 300;
  const rows = await db
    .select({
      c: CASE_LIST_SELECT,
      petName: pets.name,
      petPublicToken: pets.publicToken,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .where(whereClause)
    .orderBy(desc(cases.openedAt), desc(cases.id))
    .limit(limit);
  return rows.map(mapListRow);
}

/**
 * Jurisdiction-scoped total count of govt cases matching `filters` — the
 * denominator behind the capped keyset list, mirroring countCasesForAdmin
 * (#26 D2). Reuses buildGovtCaseWhereClause (no cursor) — the SAME kind/
 * status clauses AND the same mandatory jurisdiction-membership predicate as
 * listCasesForGovt — so N always describes the exact filtered,
 * jurisdiction-bounded set the page shows, never a wider denominator.
 * `jurisdictions` empty (no active assignment) → 0, never an unscoped count.
 */
export async function countCasesForGovt(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  filters: ListCasesForGovtFilters = {},
): Promise<number> {
  if (jurisdictions.length === 0) return 0;
  const whereClause = buildGovtCaseWhereClause(jurisdictions, filters);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases)
    .where(whereClause);
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Admin case list filters — pushed entirely into SQL (no JS-side slicing).
// ---------------------------------------------------------------------------

export interface ListCasesForAdminFilters {
  /**
   * Kinds to hide because they have their own screen — pass
   * CASE_KINDS_ROUTED_ELSEWHERE. Omit to show everything.
   */
  excludeKinds?: readonly CaseKind[];
  /** Filter by case kind. Null = all kinds. */
  kind?: CaseKind | null;
  /** Filter by open/closed status. Null = all. */
  status?: "open" | "closed" | null;
  /** Filter by jurisdiction province (exact canonical name). Null = all. */
  province?: string | null;
  /**
   * Filter by jurisdiction locality (exact canonical name). Null = all.
   *
   * Admin has no assignment set to narrow, so a drill-down has to arrive as an
   * explicit predicate — the same way every other /gob screen applies
   * `adminSelectedLocality`. Without it the Casos surfaces were the only ones
   * in the operator shell that could not follow a locality filter: the /gob
   * home tile counted a barrio while the queue it linked to counted the
   * country (demo review 2026-08-01). Only meaningful together with
   * `province`; a locality name alone is not unique nationally.
   */
  locality?: string | null;
}

/**
 * Build a pure Drizzle WHERE predicate array from admin filter params.
 * Exported so pages can call it and unit tests can verify the output shape
 * without hitting the DB.
 */
export function buildAdminCaseFilterClauses(
  filters: ListCasesForAdminFilters,
): ReturnType<typeof and>[] {
  const clauses = buildCaseKindStatusClauses(filters);
  if (filters.province)
    clauses.push(eq(cases.jurisdictionProvince, filters.province) as ReturnType<typeof and>);
  if (filters.locality)
    clauses.push(eq(cases.jurisdictionLocality, filters.locality) as ReturnType<typeof and>);
  return clauses;
}

// opts.cursor enables keyset pagination (PERF-5): see listCasesForGovt.
export async function listCasesForAdmin(opts?: {
  limit?: number;
  cursor?: KeysetCursor;
  filters?: ListCasesForAdminFilters;
}): Promise<CaseListItem[]> {
  const cursorClause = keysetWhere(cases.openedAt, cases.id, decodeCursor(opts?.cursor));
  const limit = opts?.limit ?? 500;

  const filterClauses = opts?.filters ? buildAdminCaseFilterClauses(opts.filters) : [];
  if (cursorClause) filterClauses.push(cursorClause as ReturnType<typeof and>);
  const whereClause = filterClauses.length > 0 ? and(...filterClauses) : undefined;

  const rows = await db
    .select({
      c: CASE_LIST_SELECT,
      petName: pets.name,
      petPublicToken: pets.publicToken,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .where(whereClause)
    .orderBy(desc(cases.openedAt), desc(cases.id))
    .limit(limit);
  return rows.map(mapListRow);
}

/**
 * Total count of admin cases matching `filters` — the true denominator behind
 * the capped keyset list (M4, cowork demo 2026-07-17: the list said "50 casos"
 * when 534 were open). Reuses the SAME filter clauses as listCasesForAdmin
 * (minus the cursor), so N describes the exact filtered set the page shows —
 * never a different denominator. Single-statement count → stays on the OLTP pool.
 */
export async function countCasesForAdmin(filters: ListCasesForAdminFilters = {}): Promise<number> {
  const clauses = buildAdminCaseFilterClauses(filters);
  const whereClause = clauses.length > 0 ? and(...clauses) : undefined;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases)
    .where(whereClause);
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// REMOVED (demo review 2026-08-01): listOpenCasesForAdminPreview /
// listOpenCasesForGovtPreview.
//
// They existed for exactly one caller — the /gob home's "Casos regulatorios"
// tile — and their predicate was quietly its own: status IN (open, escalated)
// rather than the queue's "closedAt IS NULL", and NO
// CASE_KINDS_ROUTED_ELSEWHERE exclusion, so they counted the custody disputes
// /gob/casos routes to its own screen. The tile read 38 where the screen it
// linked to read "32 casos". The admin variant took no jurisdiction argument
// at all, which froze that number at the national total under any province
// filter.
//
// The tile now counts through countCasesForGovt / countCasesForAdmin — the
// SAME functions the queue itself uses, with the same filter object. Deleted
// rather than left in place: a helper named "for the dashboard preview" is an
// invitation to reintroduce a second opinion of a number that must have only
// one. If a future surface needs a capped preview WITH its total, build it on
// the shared filter types above so the two can never drift again.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Outbreak investigation queries
// ---------------------------------------------------------------------------

export type OutbreakInvestigationListItem = {
  id: string;
  publicCode: string;
  status: CaseStatus;
  closedReason: CaseClosedReason | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openedReason: string | null;
  openedReasonCode: string | null;
  openedReasonParams: unknown;
};

export type OutbreakInvestigationDetail = {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  closedReason: CaseClosedReason | null;
  jurisdictionCountry: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedAt: Date;
  openedReason: string | null;
  openedReasonCode: string | null;
  openedReasonParams: unknown;
  closedAt: Date | null;
  openedByUser: { id: string; displayName: string } | null;
  closedByUser: { id: string; displayName: string } | null;
  /** Timeline entries from case_events (pet-less cases have no pet_events). */
  notes: CaseEvent[];
};

/**
 * List open + escalated + recently closed (last 90 days) outbreak
 * investigations for the given jurisdictions. Admin passes [] to get all.
 *
 * Cross-jurisdiction guard: a govt user with no assignments gets an empty
 * list instead of a nationwide data leak (mirrors listCasesForGovt).
 *
 * `opts.adminProvince`/`adminLocality` mirror casesScopeClause
 * (lib/analytics/govt-dashboards.ts): admin-only drill-down predicate, additive-
 * only, backward-compatible (omitted → unrestricted, same as before). Govt
 * callers must never pass these — their scope is already `jurisdictions`.
 */
export async function listOutbreakInvestigationsForGovt(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  isAdmin = false,
  opts?: { adminProvince?: string; adminLocality?: string },
): Promise<OutbreakInvestigationListItem[]> {
  // Guard: non-admin with no jurisdiction assignments sees nothing.
  if (!isAdmin && jurisdictions.length === 0) return [];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const jurisdictionFilter = isAdmin
    ? opts?.adminProvince
      ? opts.adminLocality
        ? and(
            eq(cases.jurisdictionProvince, opts.adminProvince),
            eq(cases.jurisdictionLocality, opts.adminLocality),
          )
        : eq(cases.jurisdictionProvince, opts.adminProvince)
      : undefined
    : // jurisdictionPairClause applies whole-province subsumption — see
      // lib/metrics/scope.ts (found via authz-subsumption fence hardening,
      // 2026-07-22 — same bug class as commit 68501bb4).
      (jurisdictionPairClause(
        [...jurisdictions],
        sql`${cases.jurisdictionProvince}`,
        sql`${cases.jurisdictionLocality}`,
      ) ?? undefined);

  const rows = await db
    .select({ c: CASE_OUTBREAK_LIST_SELECT })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "outbreak_investigation"),
        or(
          inArray(cases.status, ["open", "escalated"]),
          and(eq(cases.status, "closed"), gte(cases.closedAt, ninetyDaysAgo)),
        ),
        jurisdictionFilter,
      ),
    )
    .orderBy(desc(cases.openedAt))
    .limit(200);

  return rows.map((r) => ({
    id: r.c.id,
    publicCode: r.c.publicCode,
    status: r.c.status,
    closedReason: r.c.closedReason ?? null,
    jurisdictionProvince: r.c.jurisdictionProvince ?? null,
    jurisdictionLocality: r.c.jurisdictionLocality ?? null,
    openedAt: r.c.openedAt,
    closedAt: r.c.closedAt ?? null,
    openedReason: r.c.openedReason ?? null,
    openedReasonCode: r.c.openedReasonCode ?? null,
    openedReasonParams: r.c.openedReasonParams ?? null,
  }));
}

export async function getOutbreakInvestigationDetail(
  publicCode: string,
  jurisdictions: ReadonlyArray<{ province: string; locality: string }> = [],
  isAdmin = false,
): Promise<OutbreakInvestigationDetail | null> {
  // Cross-tenant PII guard (review 24 HIGH #1/#2): this loads the full
  // case_events timeline (epidemiological notes). Scope it in SQL — mirroring
  // listOutbreakInvestigationsForGovt — so an out-of-jurisdiction govt reader
  // gets null (→ notFound) and the notes are NEVER fetched. Admin has universal
  // scope (jurisdictions is []); a govt with no assignments sees nothing.
  if (!isAdmin && jurisdictions.length === 0) return null;

  // jurisdictionPairClause applies whole-province subsumption — see
  // lib/metrics/scope.ts (found via authz-subsumption fence hardening,
  // 2026-07-22 — same bug class as commit 68501bb4).
  const jurisdictionFilter = !isAdmin
    ? (jurisdictionPairClause(
        [...jurisdictions],
        sql`${cases.jurisdictionProvince}`,
        sql`${cases.jurisdictionLocality}`,
      ) ?? undefined)
    : undefined;

  const [row] = await db
    .select({
      c: CASE_OUTBREAK_DETAIL_SELECT,
      openedByUser: {
        id: profiles.id,
        displayName: profiles.displayName,
      },
    })
    .from(cases)
    .leftJoin(profiles, eq(profiles.id, cases.openedByUserId))
    .where(
      and(
        eq(cases.publicCode, publicCode),
        eq(cases.caseKind, "outbreak_investigation"),
        jurisdictionFilter,
      ),
    )
    .limit(1);

  if (!row) return null;

  const [closedByUserRow, noteRows] = await Promise.all([
    row.c.closedByUserId
      ? db
          .select({ id: profiles.id, displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.id, row.c.closedByUserId))
          .limit(1)
          .then((rs) => rs[0] ?? null)
      : Promise.resolve(null),
    // Outbreak cases are general-subject (no pet_events). Timeline comes from
    // case_events only. The index on (case_id, occurred_at DESC) covers this.
    db
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, row.c.id))
      .orderBy(desc(caseEvents.occurredAt)),
  ]);

  return {
    id: row.c.id,
    publicCode: row.c.publicCode,
    caseKind: "outbreak_investigation",
    status: row.c.status,
    closedReason: row.c.closedReason ?? null,
    jurisdictionCountry: row.c.jurisdictionCountry,
    jurisdictionProvince: row.c.jurisdictionProvince ?? null,
    jurisdictionLocality: row.c.jurisdictionLocality ?? null,
    openedAt: row.c.openedAt,
    openedReason: row.c.openedReason ?? null,
    openedReasonCode: row.c.openedReasonCode ?? null,
    openedReasonParams: row.c.openedReasonParams ?? null,
    closedAt: row.c.closedAt ?? null,
    openedByUser: row.openedByUser?.id ? row.openedByUser : null,
    closedByUser: closedByUserRow,
    notes: noteRows,
  };
}
