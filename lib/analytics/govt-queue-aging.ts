// govt-queue-aging — the two SLA-bearing /gob home queues, aged.
//
// D-4 (Lote D, 2026-08-16). The home's "Cola operativa" tiles showed a bare
// count. /gob/acciones already ranks the SAME rows by deadline, but it does so
// by FETCHING them (up to 700 across three domains, 6s budget each) — far too
// heavy for a landing page that already fans out twenty aggregates. So this
// module answers the same two questions with ONE cheap grouped aggregate per
// domain: how many rows are past their own SLA, and how old is the oldest one.
//
// REUSE, NOT RE-DERIVATION — every predicate here comes from the module that
// already owns it:
//   - scope:      welfare → buildMaltratoListConditions (the maltrato queue's
//                 own condition builder, incl. the C3 ONE-VIEWSCOPE clause);
//                 casos → buildGovtCaseWhereClause / buildAdminCaseFilterClauses
//                 (the same builders countCasesForGovt / countCasesForAdmin use,
//                 so the tile's count and its aging describe ONE row set).
//   - SLA tiers:  WELFARE_SLA_DAYS / slaDaysForSeverity, CASE_SLA_WARNING_DAYS.
//                 A cutoff is computed per severity in TS and pushed into the
//                 filtered COUNT — the numbers are never retyped here.
//   - day math:   ageInDays (lib/domain/queue-aging) → calendarDaysAgoInAr, the
//                 same AR calendar the worklist badges speak.
//
// The overdue predicate is a millisecond compare against a TS-computed cutoff,
// matching computeDueInfo's "overdue is a millisecond fact" posture exactly —
// a row is overdue here iff /gob/acciones would badge it "Venció".

import { and, eq, inArray, isNull, lt, not, or, sql } from "drizzle-orm";

import { WELFARE_SLA_DAYS } from "@/app/gob/maltrato/_lib/welfare-sla";
import { cases, analyticsDb as db, welfareReports } from "@/db";
import { buildMaltratoListConditions } from "@/lib/analytics/dashboards/welfare";
import { type QueueAging, ageInDays } from "@/lib/domain/queue-aging";
import { buildAdminCaseFilterClauses, buildGovtCaseWhereClause } from "@/lib/infra/case-queries";
import type { DashboardJurisdiction } from "@/lib/metrics";
import type { CaseKind } from "@/src/modules/cases/domain/case-kinds";
import { CASE_SLA_WARNING_DAYS } from "@/src/modules/cases/domain/case-sla";
import { WELFARE_REPORT_SEVERITIES } from "@/src/modules/welfare/domain/types";
import { TERMINAL_STATUSES } from "@/src/modules/welfare/domain/welfare-status-rules";

const MS_PER_DAY = 86_400_000;

/** Row shape both aggregates return. `oldest` is null on an empty queue. */
type AgingRow = { oldest: Date | null; overdue: number };

function toAging(row: AgingRow | undefined, now: Date): QueueAging {
  const oldest = row?.oldest ?? null;
  return {
    oldestAgeDays: oldest === null ? null : ageInDays(oldest, now),
    overdueCount: Number(row?.overdue ?? 0),
  };
}

/** Actor shape the welfare condition builder needs — mirrors the page's. */
export type GovtQueueActor = { role: "admin" | "govt" };

/**
 * Aging of the OPEN welfare (maltrato) queue in the caller's scope.
 *
 * Each severity carries its own SLA tier, so "overdue" is a per-severity cutoff,
 * not one global age threshold — a `low` denuncia at 20 days may be perfectly in
 * time while a `critical` one at 3 days is already breached. The cutoffs are
 * computed here and pushed into a single filtered COUNT, so the whole answer is
 * one aggregate over an already-indexed predicate.
 */
export async function fetchWelfareQueueAging(
  actor: GovtQueueActor,
  filteredJurisdictions: readonly DashboardJurisdiction[],
  currentUserId: string,
  opts: { selectedProvince?: string | null; selectedLocality?: string | null } = {},
  now: Date = new Date(),
): Promise<QueueAging> {
  // The SAME condition builder the maltrato queue uses, with queue "all" (no
  // workflow lens) — identical to how worklist-io.ts calls it.
  const scope = buildMaltratoListConditions({
    actor: { role: actor.role },
    filteredJurisdictions: actor.role === "govt" ? [...filteredJurisdictions] : [],
    queue: "all",
    selectedProvince: actor.role === "admin" ? (opts.selectedProvince ?? null) : null,
    selectedLocality: actor.role === "admin" ? (opts.selectedLocality ?? null) : null,
    currentUserId,
  });

  // A closed/duplicate/invalid denuncia has no deadline left to miss — the same
  // non-terminal predicate worklist-io.ts applies.
  const stillOpen = not(inArray(welfareReports.status, [...TERMINAL_STATUSES]));

  // Per-severity cutoff: created before it ⇒ already past this severity's tier.
  const overdueClause = or(
    ...WELFARE_REPORT_SEVERITIES.map((severity) =>
      and(
        eq(welfareReports.severity, severity),
        lt(
          welfareReports.createdAt,
          new Date(now.getTime() - WELFARE_SLA_DAYS[severity] * MS_PER_DAY),
        ),
      ),
    ),
  );

  const [row] = await db
    .select({
      oldest: sql<Date | null>`min(${welfareReports.createdAt})`,
      overdue: sql<number>`count(*) filter (where ${overdueClause})::int`,
    })
    .from(welfareReports)
    .where(and(scope, stillOpen));

  return toAging(row, now);
}

/**
 * Aging of the OPEN regulatory-cases queue in the caller's scope.
 *
 * One global cutoff here (CASE_SLA_WARNING_DAYS), because cases carry a single
 * SLA window rather than per-severity tiers — caseSlaDueAt's rule, expressed as
 * the cutoff its inverse implies.
 */
export async function fetchCasesQueueAging(
  scope:
    | { role: "govt"; jurisdictions: readonly DashboardJurisdiction[] }
    | { role: "admin"; province: string | null; locality: string | null },
  filters: { excludeKinds?: readonly CaseKind[] },
  now: Date = new Date(),
): Promise<QueueAging> {
  // A govt operator with zero assignments sees zero rows — fail closed WITHOUT
  // a query, the same short-circuit countCasesForGovt applies.
  if (scope.role === "govt" && scope.jurisdictions.length === 0) {
    return { oldestAgeDays: null, overdueCount: 0 };
  }

  const cutoff = new Date(now.getTime() - CASE_SLA_WARNING_DAYS * MS_PER_DAY);
  const overdueClause = lt(cases.openedAt, cutoff);

  const where =
    scope.role === "govt"
      ? buildGovtCaseWhereClause([...scope.jurisdictions], {
          status: "open",
          excludeKinds: filters.excludeKinds,
        })
      : and(
          ...buildAdminCaseFilterClauses({
            status: "open",
            excludeKinds: filters.excludeKinds,
            province: scope.province,
            locality: scope.locality,
          }),
        );

  const [row] = await db
    .select({
      oldest: sql<Date | null>`min(${cases.openedAt})`,
      overdue: sql<number>`count(*) filter (where ${overdueClause})::int`,
    })
    .from(cases)
    // `status: "open"` already lands as closedAt IS NULL inside the shared
    // builders; the explicit clause is belt-and-braces against a builder whose
    // status vocabulary later grows a third value.
    .where(and(where, isNull(cases.closedAt)));

  return toAging(row, now);
}
