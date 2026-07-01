// Visibility + capability rules for approval_requests in the admin UI.
//
// Spec §5 (capability matrix): govt sees + decides vet + org_verification
// in their own (province, locality); admin decides everything plus the
// fallback when no govt covers a locality.
//
// Spec §6 (scope matching): the queue page filters approval_requests by
// this rule. The decision actions re-check via canDecideRequest as the
// authoritative server-side guard.

import { and, desc, eq, exists, inArray, isNull, notExists, or, sql } from "drizzle-orm";

import {
  type ApprovalRequest,
  type ApprovalRequestType,
  approvalRequests,
  db,
  govtAssignments,
} from "@/db";
import type { AdminOrGovtJurisdiction } from "@/lib/auth-guards";
import { type KeysetCursor, decodeCursor, keysetWhere } from "@/lib/utils/keyset-pagination";

// Types that ONLY admin can decide. Spec §5.
// Note: role_upgrade_govt, role_upgrade_admin, govt_assignment_grant were
// removed in migration 0015 — institutional accounts are created directly.
const ADMIN_ONLY_TYPES: ApprovalRequestType[] = [];

// Types that a scope-matching govt CAN decide (admin also can).
const GOVT_DECIDABLE_TYPES: ApprovalRequestType[] = [
  "role_upgrade_vet",
  "organization_verification",
];

// Authoritative server-side guard. Mirrors the queue visibility on the
// decision side: an authority can decide a request only if it would
// appear in their queue under spec §6.
export function canDecideRequest(
  profile: { role: "admin" | "govt" },
  request: Pick<ApprovalRequest, "type" | "jurisdictionProvince" | "jurisdictionLocality">,
  jurisdictions: readonly AdminOrGovtJurisdiction[],
): boolean {
  if (profile.role === "admin") return true;
  if (ADMIN_ONLY_TYPES.includes(request.type)) return false;
  return jurisdictions.some(
    (j) =>
      j.province === request.jurisdictionProvince && j.locality === request.jurisdictionLocality,
  );
}

// Returns the WHERE predicate that filters approval_requests to the rows
// visible to `profile` (per spec §6). Use inside an `and()` clause to
// combine with other filters (e.g. type filters, date sorts).
//
// - admin: ADMIN_ONLY types always, plus any govt-decidable type whose
//   locality has NO active govt covering it (fallback).
// - govt: govt-decidable types whose (province, locality) matches one of
//   their active assignments.
export function visibleRequestsClause(
  profile: { id: string; role: "admin" | "govt" },
  jurisdictions: readonly AdminOrGovtJurisdiction[],
) {
  if (profile.role === "admin") {
    const noGovtCovers = notExists(
      db
        .select({ id: govtAssignments.id })
        .from(govtAssignments)
        .where(
          and(
            isNull(govtAssignments.revokedAt),
            eq(govtAssignments.jurisdictionProvince, approvalRequests.jurisdictionProvince),
            eq(govtAssignments.jurisdictionLocality, approvalRequests.jurisdictionLocality),
          ),
        ),
    );
    return or(
      inArray(approvalRequests.type, ADMIN_ONLY_TYPES),
      and(inArray(approvalRequests.type, GOVT_DECIDABLE_TYPES), noGovtCovers),
    );
  }

  // govt: empty jurisdictions → see nothing.
  if (jurisdictions.length === 0) return sql`false`;

  // Match (province, locality) tuples via an OR of equality pairs.
  const tupleMatches = or(
    ...jurisdictions.map((j) =>
      and(
        eq(approvalRequests.jurisdictionProvince, j.province),
        eq(approvalRequests.jurisdictionLocality, j.locality),
      ),
    ),
  );
  return and(inArray(approvalRequests.type, GOVT_DECIDABLE_TYPES), tupleMatches);
}

// Convenience: pending requests visible to this authority, newest-first.
// `typeFilter` pushes the type predicate into SQL so the query returns only
// matching rows regardless of total queue size — avoids JS-side silently
// missing rows beyond the former LIMIT 200 ceiling (P1-10).
//
// `opts.limit` caps the result set. List-rendering callers (cola page, gob
// dashboard preview) pass 200 so the query stays bounded. Omit for the rare
// COUNT-style caller — but prefer a dedicated COUNT query for those instead.
//
// `opts.cursor` enables keyset pagination (PERF-5): when provided the query
// returns only rows OLDER than the cursor row — (createdAt, id) < (cursorTs, cursorId).
// Fetch limit+1 to detect hasMore; the page renders limit rows and uses row N+1
// solely to decide whether to show the "older" link.
export async function fetchVisiblePendingRequests(
  profile: { id: string; role: "admin" | "govt" },
  jurisdictions: readonly AdminOrGovtJurisdiction[],
  typeFilter?: ApprovalRequestType,
  opts?: { limit?: number; cursor?: KeysetCursor },
): Promise<ApprovalRequest[]> {
  const scopeClause = visibleRequestsClause(profile, jurisdictions);
  const typeClause = typeFilter ? eq(approvalRequests.type, typeFilter) : undefined;
  const cursorClause = keysetWhere(
    approvalRequests.createdAt,
    approvalRequests.id,
    decodeCursor(opts?.cursor),
  );
  const clauses = [
    eq(approvalRequests.status, "pending"),
    scopeClause,
    typeClause,
    cursorClause,
  ].filter(Boolean);
  const whereClause = and(...(clauses as Parameters<typeof and>));
  const q = db
    .select()
    .from(approvalRequests)
    .where(whereClause)
    .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.id));
  return opts?.limit !== undefined ? q.limit(opts.limit) : q;
}

// Unused import guard for `exists` — kept for symmetry with notExists when
// future types need the inverted form. Stripped at build time.
void exists;
