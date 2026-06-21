// Read-only aggregations for the /admin/sistema dashboard (Admin Fase 12).
// All metrics are computed live from the existing tables — no projections,
// no caching. The dashboard is admin-only so the query volume is bounded.

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { approvalRequests, auditLog, cronRuns, db, govtAssignments, profiles } from "@/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export type UserMetrics = {
  totalPersonal: number;
  totalInstitutionalActive: number;
  new24h: number;
  new7d: number;
  new30d: number;
};

export type QueueHealth = {
  pendingTotal: number;
  oldestPendingDaysAgo: number | null;
  pending14dPlus: number;
  pending30dPlus: number;
  pending60dPlus: number;
};

export type DecisionsMetrics = {
  approved7d: number;
  rejected7d: number;
  approved30d: number;
  rejected30d: number;
  revocations30d: number;
};

export type GovtActivityRow = {
  userId: string;
  displayName: string;
  localitiesCount: number;
  decisions30d: number;
  lastActionAt: Date | null;
};

export type CronRunRow = {
  cronName: string;
  lastRunAt: Date | null;
  lastStatus: "ok" | "failed" | "running" | null;
  itemsProcessed: number | null;
  /** Raw details JSONB from the most recent cron_run row. Populated on failure
   *  by the cron route handler (field: { errors: [{id, reason}] }). */
  lastDetails: Record<string, unknown> | null;
};

export async function fetchUserMetrics(): Promise<UserMetrics> {
  const now = Date.now();
  const [row] = await db
    .select({
      totalPersonal: sql<number>`count(*) filter (where ${profiles.accountType} = 'personal')`,
      totalInstitutionalActive: sql<number>`count(*) filter (where ${profiles.accountType} = 'institutional' and ${profiles.deactivatedAt} is null)`,
      new24h: sql<number>`count(*) filter (where ${profiles.createdAt} >= ${new Date(now - DAY_MS).toISOString()})`,
      new7d: sql<number>`count(*) filter (where ${profiles.createdAt} >= ${new Date(now - 7 * DAY_MS).toISOString()})`,
      new30d: sql<number>`count(*) filter (where ${profiles.createdAt} >= ${new Date(now - 30 * DAY_MS).toISOString()})`,
    })
    .from(profiles);
  return {
    totalPersonal: Number(row.totalPersonal),
    totalInstitutionalActive: Number(row.totalInstitutionalActive),
    new24h: Number(row.new24h),
    new7d: Number(row.new7d),
    new30d: Number(row.new30d),
  };
}

export async function fetchQueueHealth(): Promise<QueueHealth> {
  const now = Date.now();
  const [row] = await db
    .select({
      pendingTotal: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending')`,
      oldestPendingMs: sql<
        number | null
      >`extract(epoch from (now() - min(${approvalRequests.createdAt}) filter (where ${approvalRequests.status} = 'pending'))) * 1000`,
      pending14dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 14 * DAY_MS).toISOString()})`,
      pending30dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 30 * DAY_MS).toISOString()})`,
      pending60dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 60 * DAY_MS).toISOString()})`,
    })
    .from(approvalRequests);
  return {
    pendingTotal: Number(row.pendingTotal),
    oldestPendingDaysAgo:
      row.oldestPendingMs != null ? Math.floor(Number(row.oldestPendingMs) / DAY_MS) : null,
    pending14dPlus: Number(row.pending14dPlus),
    pending30dPlus: Number(row.pending30dPlus),
    pending60dPlus: Number(row.pending60dPlus),
  };
}

/**
 * Scoped variant of `fetchQueueHealth` for govt dashboards.
 *
 * Mirrors the global `fetchQueueHealth` (same buckets: pendingTotal,
 * oldestPending, 14d/30d/60d) but restricts to `approval_requests` rows
 * matching any of the caller's jurisdiction assignments via
 * `(jurisdictionProvince, jurisdictionLocality)` pairs.
 *
 * Empty `jurisdictions` (admin universal scope) → behaves identically to
 * `fetchQueueHealth()` with no jurisdiction filter.
 */
export async function fetchQueueHealthScoped(
  jurisdictions: import("@/lib/metrics").DashboardJurisdiction[],
): Promise<QueueHealth> {
  const now = Date.now();

  // Build a jurisdiction WHERE clause when jurisdictions are provided.
  // The approval_requests table has indexed columns jurisdictionProvince /
  // jurisdictionLocality (see jurisIdx in schema.ts) so the OR fan-out is
  // covered by the existing partial index on status='pending'.
  const jurisClause =
    jurisdictions.length > 0
      ? sql`(${sql.join(
          jurisdictions.map(
            (j) =>
              sql`(${approvalRequests.jurisdictionProvince} = ${j.province} AND ${approvalRequests.jurisdictionLocality} = ${j.locality})`,
          ),
          sql` OR `,
        )})`
      : undefined;

  const [row] = await db
    .select({
      pendingTotal: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending')`,
      oldestPendingMs: sql<
        number | null
      >`extract(epoch from (now() - min(${approvalRequests.createdAt}) filter (where ${approvalRequests.status} = 'pending'))) * 1000`,
      pending14dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 14 * DAY_MS).toISOString()})`,
      pending30dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 30 * DAY_MS).toISOString()})`,
      pending60dPlus: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.createdAt} < ${new Date(now - 60 * DAY_MS).toISOString()})`,
    })
    .from(approvalRequests)
    .where(jurisClause);

  return {
    pendingTotal: Number(row.pendingTotal),
    oldestPendingDaysAgo:
      row.oldestPendingMs != null ? Math.floor(Number(row.oldestPendingMs) / DAY_MS) : null,
    pending14dPlus: Number(row.pending14dPlus),
    pending30dPlus: Number(row.pending30dPlus),
    pending60dPlus: Number(row.pending60dPlus),
  };
}

// Decisions are sourced from audit_log because approvalRequests doesn't keep a
// timestamp for the decision itself — only the current status. Revocations
// (revoke_vet, revoke_org, revoke_govt) are all prefixed `revocation_` in
// audit_log.action; we count the whole family.
export async function fetchDecisionsMetrics(): Promise<DecisionsMetrics> {
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY_MS);
  const since30 = new Date(now - 30 * DAY_MS);
  const [row] = await db
    .select({
      approved7d: sql<number>`count(*) filter (where ${auditLog.action} = 'request_approved' and ${auditLog.performedAt} >= ${since7.toISOString()})`,
      rejected7d: sql<number>`count(*) filter (where ${auditLog.action} = 'request_rejected' and ${auditLog.performedAt} >= ${since7.toISOString()})`,
      approved30d: sql<number>`count(*) filter (where ${auditLog.action} = 'request_approved' and ${auditLog.performedAt} >= ${since30.toISOString()})`,
      rejected30d: sql<number>`count(*) filter (where ${auditLog.action} = 'request_rejected' and ${auditLog.performedAt} >= ${since30.toISOString()})`,
      revocations30d: sql<number>`count(*) filter (where ${auditLog.action} like 'revocation_%' and ${auditLog.performedAt} >= ${since30.toISOString()})`,
    })
    .from(auditLog);
  return {
    approved7d: Number(row.approved7d),
    rejected7d: Number(row.rejected7d),
    approved30d: Number(row.approved30d),
    rejected30d: Number(row.rejected30d),
    revocations30d: Number(row.revocations30d),
  };
}

// Per-govt activity: localities under their scope, decisions made, last action
// (any). Three small queries are cheaper than one CTE here because Drizzle
// doesn't compose lateral joins well and the govt count is small.
export async function fetchGovtActivity(): Promise<GovtActivityRow[]> {
  const govts = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "govt"),
        eq(profiles.accountType, "institutional"),
        sql`${profiles.deactivatedAt} is null`,
      ),
    );

  if (govts.length === 0) return [];

  const govtIds = govts.map((g) => g.id);
  const localitiesByGovt = new Map<string, number>();
  const decisionsByGovt = new Map<string, number>();
  const lastActionByGovt = new Map<string, Date>();

  const locRows = await db
    .select({
      userId: govtAssignments.userId,
      cnt: sql<number>`count(distinct (${govtAssignments.jurisdictionProvince}, ${govtAssignments.jurisdictionLocality}))`,
    })
    .from(govtAssignments)
    .where(and(inArray(govtAssignments.userId, govtIds), sql`${govtAssignments.revokedAt} is null`))
    .groupBy(govtAssignments.userId);
  for (const r of locRows) localitiesByGovt.set(r.userId, Number(r.cnt));

  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const decRows = await db
    .select({
      actorUserId: auditLog.actorUserId,
      cnt: sql<number>`count(*)`,
    })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.actorUserId, govtIds),
        sql`${auditLog.action} in ('request_approved','request_rejected')`,
        gte(auditLog.performedAt, since30),
      ),
    )
    .groupBy(auditLog.actorUserId);
  // actorUserId is nullable (ARCH-H), but the WHERE clause above filters to
  // govtIds so NULL rows are excluded at the DB level.
  for (const r of decRows) {
    if (r.actorUserId) decisionsByGovt.set(r.actorUserId, Number(r.cnt));
  }

  const lastRows = await db
    .select({
      actorUserId: auditLog.actorUserId,
      lastAt: sql<Date>`max(${auditLog.performedAt})`,
    })
    .from(auditLog)
    .where(inArray(auditLog.actorUserId, govtIds))
    .groupBy(auditLog.actorUserId);
  for (const r of lastRows) {
    if (r.actorUserId) lastActionByGovt.set(r.actorUserId, r.lastAt);
  }

  return govts.map((g) => ({
    userId: g.id,
    displayName: g.displayName,
    localitiesCount: localitiesByGovt.get(g.id) ?? 0,
    decisions30d: decisionsByGovt.get(g.id) ?? 0,
    lastActionAt: lastActionByGovt.get(g.id) ?? null,
  }));
}

// Latest run per cron_name. Two queries because Drizzle doesn't compose
// DISTINCT ON cleanly; the cron_name cardinality is tiny so this is fine.
export async function fetchCronRuns(): Promise<CronRunRow[]> {
  const names = await db
    .selectDistinct({ cronName: cronRuns.cronName })
    .from(cronRuns)
    .orderBy(cronRuns.cronName);

  const results: CronRunRow[] = [];
  for (const n of names) {
    const [latest] = await db
      .select({
        startedAt: cronRuns.startedAt,
        status: cronRuns.status,
        itemsProcessed: cronRuns.itemsProcessed,
        details: cronRuns.details,
      })
      .from(cronRuns)
      .where(eq(cronRuns.cronName, n.cronName))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);
    results.push({
      cronName: n.cronName,
      lastRunAt: latest?.startedAt ?? null,
      lastStatus: latest?.status ?? null,
      itemsProcessed: latest?.itemsProcessed ?? null,
      lastDetails: latest?.details ? (latest.details as Record<string, unknown>) : null,
    });
  }
  return results;
}
