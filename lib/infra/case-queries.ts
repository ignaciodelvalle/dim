// Read-side data accessors for the cases system UI.
//
// Each helper does a single composed query that returns the shape the
// page renders. They run against the service-role db (Drizzle bypasses
// RLS) and rely on the calling page to enforce the access policy via
// the existing role guards (requireUserOrRedirect, requireOrgAccessByToken,
// requireAdminOrGovtOrRedirect). Once Fase F lands per-kind RLS, these
// helpers stay correct — they query the same rows the policies expose.

import { HIDDEN_FROM_SUBJECT_CASE_KINDS } from "@/lib/infra/case-access";
import { type KeysetCursor, decodeCursor, keysetWhere } from "@/lib/utils/keyset-pagination";
import {
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

// Columns consumed by mapListRow + list pages (8 of 27 cols).
const CASE_LIST_SELECT = {
  id: cases.id,
  publicCode: cases.publicCode,
  caseKind: cases.caseKind,
  status: cases.status,
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

export async function findOpenCasesForPetWithCodes(petId: string): Promise<PetOpenCase[]> {
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

// ---------------------------------------------------------------------------
// List pages
// ---------------------------------------------------------------------------

export interface CaseListItem {
  id: string;
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
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

// opts.cursor enables keyset pagination (PERF-5): when provided, only rows
// OLDER than the cursor are returned — (openedAt, id) < (cursorTs, cursorId).
// Callers should fetch limit+1 to detect hasMore; render limit rows only.
export async function listCasesForGovt(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  opts?: { limit?: number; cursor?: KeysetCursor },
): Promise<CaseListItem[]> {
  if (jurisdictions.length === 0) return [];
  const jurisdictionFilter = or(
    ...jurisdictions.map((j) =>
      and(eq(cases.jurisdictionProvince, j.province), eq(cases.jurisdictionLocality, j.locality)),
    ),
  );
  const cursorClause = keysetWhere(cases.openedAt, cases.id, decodeCursor(opts?.cursor));
  const whereClause = cursorClause ? and(jurisdictionFilter, cursorClause) : jurisdictionFilter;
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

// ---------------------------------------------------------------------------
// Admin case list filters — pushed entirely into SQL (no JS-side slicing).
// ---------------------------------------------------------------------------

export interface ListCasesForAdminFilters {
  /** Filter by case kind. Null = all kinds. */
  kind?: CaseKind | null;
  /** Filter by open/closed status. Null = all. */
  status?: "open" | "closed" | null;
  /** Filter by jurisdiction province (exact match). Null = all. */
  province?: string | null;
}

/**
 * Build a pure Drizzle WHERE predicate array from admin filter params.
 * Exported so pages can call it and unit tests can verify the output shape
 * without hitting the DB.
 */
export function buildAdminCaseFilterClauses(
  filters: ListCasesForAdminFilters,
): ReturnType<typeof and>[] {
  const clauses: ReturnType<typeof and>[] = [];
  if (filters.kind) clauses.push(eq(cases.caseKind, filters.kind) as ReturnType<typeof and>);
  if (filters.status === "open") clauses.push(isNull(cases.closedAt) as ReturnType<typeof and>);
  if (filters.status === "closed")
    clauses.push(isNotNull(cases.closedAt) as ReturnType<typeof and>);
  if (filters.province)
    clauses.push(eq(cases.jurisdictionProvince, filters.province) as ReturnType<typeof and>);
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

// ---------------------------------------------------------------------------
// Dashboard preview: open/escalated cases, limited in SQL
// ---------------------------------------------------------------------------

export interface OpenCasesPreview {
  /** Up to `limit` open/escalated cases, newest first. */
  items: CaseListItem[];
  /** Total count of open/escalated cases (independent of `limit`). */
  total: number;
}

const OPEN_CASE_STATUSES = ["open", "escalated"] as const;

/**
 * Admin dashboard preview of open/escalated cases. Pushes both the status
 * filter and the row cap into SQL — the old /gob page loaded up to 500 rows
 * via listCasesForAdmin() and sliced 5 in JS, scanning the whole cases table
 * on every dashboard render. The count is a separate lightweight aggregate so
 * the "Ver todos (N)" link stays accurate without fetching all rows.
 */
export async function listOpenCasesForAdminPreview(limit = 5): Promise<OpenCasesPreview> {
  const [items, totalRow] = await Promise.all([
    db
      .select({
        c: CASE_LIST_SELECT,
        petName: pets.name,
        petPublicToken: pets.publicToken,
      })
      .from(cases)
      .leftJoin(pets, eq(pets.id, cases.primaryPetId))
      .where(inArray(cases.status, [...OPEN_CASE_STATUSES]))
      .orderBy(desc(cases.openedAt))
      .limit(limit)
      .then((rows) => rows.map(mapListRow)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cases)
      .where(inArray(cases.status, [...OPEN_CASE_STATUSES]))
      .then((rows) => rows[0]?.count ?? 0),
  ]);

  return { items, total: totalRow };
}

/**
 * Govt dashboard preview of open/escalated cases within the given
 * jurisdictions. Mirrors listOpenCasesForAdminPreview but scoped — the /gob
 * page previously called listCasesForGovt() (up to 300 rows) and sliced 5.
 */
export async function listOpenCasesForGovtPreview(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  limit = 5,
): Promise<OpenCasesPreview> {
  if (jurisdictions.length === 0) return { items: [], total: 0 };

  const jurisdictionFilter = or(
    ...jurisdictions.map((j) =>
      and(eq(cases.jurisdictionProvince, j.province), eq(cases.jurisdictionLocality, j.locality)),
    ),
  );
  const whereClause = and(inArray(cases.status, [...OPEN_CASE_STATUSES]), jurisdictionFilter);

  const [items, total] = await Promise.all([
    db
      .select({
        c: CASE_LIST_SELECT,
        petName: pets.name,
        petPublicToken: pets.publicToken,
      })
      .from(cases)
      .leftJoin(pets, eq(pets.id, cases.primaryPetId))
      .where(whereClause)
      .orderBy(desc(cases.openedAt))
      .limit(limit)
      .then((rows) => rows.map(mapListRow)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cases)
      .where(whereClause)
      .then((rows) => rows[0]?.count ?? 0),
  ]);

  return { items, total };
}

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
 */
export async function listOutbreakInvestigationsForGovt(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  isAdmin = false,
): Promise<OutbreakInvestigationListItem[]> {
  // Guard: non-admin with no jurisdiction assignments sees nothing.
  if (!isAdmin && jurisdictions.length === 0) return [];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const jurisdictionFilter =
    !isAdmin && jurisdictions.length > 0
      ? or(
          ...jurisdictions.map((j) =>
            and(
              eq(cases.jurisdictionProvince, j.province),
              eq(cases.jurisdictionLocality, j.locality),
            ),
          ),
        )
      : undefined;

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
  }));
}

export async function getOutbreakInvestigationDetail(
  publicCode: string,
): Promise<OutbreakInvestigationDetail | null> {
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
    .where(and(eq(cases.publicCode, publicCode), eq(cases.caseKind, "outbreak_investigation")))
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
    closedAt: row.c.closedAt ?? null,
    openedByUser: row.openedByUser?.id ? row.openedByUser : null,
    closedByUser: closedByUserRow,
    notes: noteRows,
  };
}
