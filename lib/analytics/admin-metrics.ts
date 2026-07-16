// Read-only aggregations for the /admin/sistema dashboard (Admin Fase 12).
// All metrics are computed live from the existing tables — no projections,
// no caching. The dashboard is admin-only so the query volume is bounded.

import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  approvalRequests,
  auditLog,
  cases,
  cronRuns,
  db,
  govtAssignments,
  pets,
  profiles,
  welfareReports,
} from "@/db";
import { countOutboxBreaches } from "@/lib/infra/outbox-queries";
import { countOpenAlertFirings } from "@/lib/metrics/alert-firing-inbox";
import { jurisdictionPairClause } from "@/lib/metrics/scope";

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
  // The "Nuevos" counts are scoped to accountType='personal' so they share the
  // same population as `totalPersonal` (the headline number on the same card).
  // Counting ALL account types here produced the honesty bug flagged in PO QA
  // §7: institutional (admin-created) profiles inflated the windows so that
  // new7d/new30d could exceed totalPersonal ("new > total"), which is
  // impossible for a single population. Scoping guarantees
  // new24h ≤ new7d ≤ new30d ≤ totalPersonal. (A 7d == 30d equality is NOT a
  // window bug — it just means no personal signups landed between 7 and 30 days
  // ago; with demo seed data that clusters all created_at at seed time, that
  // equality is expected and is a seed-data artifact, not a counting error.)
  const [row] = await db
    .select({
      totalPersonal: sql<number>`count(*) filter (where ${profiles.accountType} = 'personal')`,
      totalInstitutionalActive: sql<number>`count(*) filter (where ${profiles.accountType} = 'institutional' and ${profiles.deactivatedAt} is null)`,
      new24h: sql<number>`count(*) filter (where ${profiles.accountType} = 'personal' and ${profiles.createdAt} >= ${new Date(now - DAY_MS).toISOString()})`,
      new7d: sql<number>`count(*) filter (where ${profiles.accountType} = 'personal' and ${profiles.createdAt} >= ${new Date(now - 7 * DAY_MS).toISOString()})`,
      new30d: sql<number>`count(*) filter (where ${profiles.accountType} = 'personal' and ${profiles.createdAt} >= ${new Date(now - 30 * DAY_MS).toISOString()})`,
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
  //
  // Subsumption-aware (2026-07-08): a whole-province assignment (whole-CABA /
  // "Ciudad Autónoma de Buenos Aires") governs every barrio in it, so it must
  // match a barrio-tagged (Palermo) request on PROVINCE alone. Reuses
  // jurisdictionPairClause — the SAME predicate the /gob/cola queue
  // (visibleRequestsClause) uses — so this aging COUNTER and that queue can
  // never diverge (a whole-CABA operator's "cola pendiente" tile and their
  // queue show the same population). Exact pairs are kept for barrio operators.
  const jurisClause =
    jurisdictionPairClause(
      jurisdictions,
      sql`${approvalRequests.jurisdictionProvince}`,
      sql`${approvalRequests.jurisdictionLocality}`,
    ) ?? undefined;

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

// ---------------------------------------------------------------------------
// Queue-health cockpit (Epic D)
// ---------------------------------------------------------------------------
//
// The /admin home used to surface a SINGLE lumped "Cola pendiente" number
// (fetchQueueHealth → count of pending approval_requests), which implied "one
// queue" while the Novedades feed pointed at a different source (pet_events) and
// several genuinely-distinct operational queues stayed invisible. This cockpit
// breaks the approval queue out per type AND counts every other operational
// queue so the home reflects reality. All counts are read-only, bounded, and
// reuse the SAME single-source-of-truth helpers the nav badges / detail pages
// use (countOpenAlertFirings, countOutboxBreaches) so the home can never drift
// from those surfaces.

/** Per-type pending breakdown of the approval queue (approval_requests). */
export type ApprovalQueueByType = {
  /** Total pending approval requests (all three types). */
  pendingTotal: number;
  /** Age in days of the oldest pending request (null when none pending). */
  oldestPendingDaysAgo: number | null;
  /** Pending vet-matrícula upgrades. */
  roleUpgradeVet: number;
  /** Pending organization-verification requests. */
  organizationVerification: number;
  /** Pending RUPGA service-dog credential verifications. */
  serviceDogCredentialVerification: number;
};

/** Every operational queue an admin owns, counted for the home cockpit. */
export type QueueCockpit = {
  /** Approval queue, broken out per type. */
  approvals: ApprovalQueueByType;
  /** welfare_reports flagged for moderation and not yet resolved (/admin/moderacion). */
  moderationPending: number;
  /** Open (non-terminal) alert firings (/admin/alertas). */
  alertsOpen: number;
  /** Outbox rows in SLA breach: pending AND past their SLA deadline (/admin/outbox). */
  outboxBreaches: number;
  /** Cases not yet closed — closedAt IS NULL (/admin/casos). */
  casesOpen: number;
  /** Pets under an in-progress 10-day rabies observation (/admin/observaciones). */
  rabiesInProgress: number;
};

/**
 * Per-type pending breakdown of the approval queue in a single aggregate query.
 * Mirrors the total/oldest math of `fetchQueueHealth` (same partial index on
 * status='pending') but also splits the three request types out via filtered
 * counts so the home can show one tile per queue instead of one lumped number.
 */
export async function fetchApprovalQueueByType(): Promise<ApprovalQueueByType> {
  const [row] = await db
    .select({
      pendingTotal: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending')`,
      oldestPendingMs: sql<
        number | null
      >`extract(epoch from (now() - min(${approvalRequests.createdAt}) filter (where ${approvalRequests.status} = 'pending'))) * 1000`,
      roleUpgradeVet: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.type} = 'role_upgrade_vet')`,
      organizationVerification: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.type} = 'organization_verification')`,
      serviceDogCredentialVerification: sql<number>`count(*) filter (where ${approvalRequests.status} = 'pending' and ${approvalRequests.type} = 'service_dog_credential_verification')`,
    })
    .from(approvalRequests);
  return {
    pendingTotal: Number(row.pendingTotal),
    oldestPendingDaysAgo:
      row.oldestPendingMs != null ? Math.floor(Number(row.oldestPendingMs) / DAY_MS) : null,
    roleUpgradeVet: Number(row.roleUpgradeVet),
    organizationVerification: Number(row.organizationVerification),
    serviceDogCredentialVerification: Number(row.serviceDogCredentialVerification),
  };
}

/**
 * welfare_reports awaiting moderation. Predicate is identical to the
 * /admin/moderacion "Pendientes" filter (flagged by the heuristics AND not yet
 * resolved) so the home tile and that page can never disagree.
 */
async function countModerationPending(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(welfareReports)
    .where(and(isNotNull(welfareReports.flaggedAt), isNull(welfareReports.moderationResolvedAt)));
  return Number(row?.n ?? 0);
}

/**
 * Cases not yet closed. Same predicate as /admin/casos's default "Abiertos"
 * view (buildAdminCaseFilterClauses: closedAt IS NULL) so the home tile and
 * the page agree by construction, not by coincidence — a status-list mirror
 * would silently drift if a new non-terminal status (e.g. "merged") is wired.
 */
async function countOpenCases(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cases)
    .where(isNull(cases.closedAt));
  return Number(row?.n ?? 0);
}

/** Pets currently under an in-progress rabies observation (/admin/observaciones). */
async function countRabiesInProgress(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pets)
    .where(eq(pets.rabiesObservationStatus, "in_progress"));
  return Number(row?.n ?? 0);
}

/**
 * Fan out every operational-queue count in parallel for the /admin home
 * cockpit. Reuses the shared alert / outbox helpers rather than duplicating
 * their predicates, so all three surfaces (nav badge, detail page, home tile)
 * stay in lockstep.
 */
export async function fetchQueueCockpit(): Promise<QueueCockpit> {
  const [approvals, moderationPending, alertsOpen, outboxBreaches, casesOpen, rabiesInProgress] =
    await Promise.all([
      fetchApprovalQueueByType(),
      countModerationPending(),
      countOpenAlertFirings(),
      countOutboxBreaches(),
      countOpenCases(),
      countRabiesInProgress(),
    ]);
  return {
    approvals,
    moderationPending,
    alertsOpen,
    outboxBreaches,
    casesOpen,
    rabiesInProgress,
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
      // NOT sql<Date>: raw-sql aggregates bypass drizzle's column mapping and
      // arrive as STRINGS at runtime — the type param is a compile-time claim
      // only. Trusting it crashed /admin/sistema (digest 1282362471) as soon
      // as a govt had audit rows: sortGovtActivityByActivity called .getTime()
      // on a string. Coerce at this boundary so the declared GovtActivityRow
      // shape (Date | null) is actually true.
      lastAt: sql<string | null>`max(${auditLog.performedAt})`,
    })
    .from(auditLog)
    .where(inArray(auditLog.actorUserId, govtIds))
    .groupBy(auditLog.actorUserId);
  for (const r of lastRows) {
    if (r.actorUserId && r.lastAt != null) {
      // new Date() accepts both the string postgres-js actually returns and a
      // Date if a future driver maps it.
      const d = new Date(r.lastAt);
      if (!Number.isNaN(d.getTime())) lastActionByGovt.set(r.actorUserId, d);
    }
  }

  return govts.map((g) => ({
    userId: g.id,
    displayName: g.displayName,
    localitiesCount: localitiesByGovt.get(g.id) ?? 0,
    decisions30d: decisionsByGovt.get(g.id) ?? 0,
    lastActionAt: lastActionByGovt.get(g.id) ?? null,
  }));
}

// Order the "actividad por govt" table so the operators an admin actually needs
// to see surface first: most recent action, then most decisions (30d), then
// name. Govts with no recorded action sink to the bottom. Pure — no DB. The
// /admin/sistema page sorts then truncates with a "hay más" hint so a roster of
// duplicate seed govts can't push live operators below the fold.
export function sortGovtActivityByActivity(rows: readonly GovtActivityRow[]): GovtActivityRow[] {
  return [...rows].sort((a, b) => {
    const at = a.lastActionAt ? a.lastActionAt.getTime() : Number.NEGATIVE_INFINITY;
    const bt = b.lastActionAt ? b.lastActionAt.getTime() : Number.NEGATIVE_INFINITY;
    if (at !== bt) return bt - at;
    if (a.decisions30d !== b.decisions30d) return b.decisions30d - a.decisions30d;
    return a.displayName.localeCompare(b.displayName, "es-AR");
  });
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

// Cron names whose MOST RECENT run failed — the signal behind the crons-down
// banner (operator-trust T3) on /admin and /admin/sistema. One DISTINCT ON
// query (cheaper than fetchCronRuns' per-name loop) so the dashboard can afford
// it. Honest in both envs: locally the "failure" is usually vitest polluting
// the shared cron_runs table (cron route tests write real rows), while in prod
// cron_runs only ever gets rows from real Vercel executions, so a failed latest
// status there is a genuine incident. Do NOT suppress by env — the banner just
// mirrors telemetry.
export async function fetchFailedCronNames(): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT cron_name
    FROM (
      SELECT DISTINCT ON (cron_name) cron_name, status
      FROM cron_runs
      ORDER BY cron_name, started_at DESC
    ) latest
    WHERE latest.status = 'failed'
    ORDER BY cron_name
  `)) as { cron_name: string }[];
  return rows.map((r) => r.cron_name);
}

// ---------------------------------------------------------------------------
// Pet-status cache drift (projection-cron audit 2026-07-03 B3)
// ---------------------------------------------------------------------------
//
// reconcile-pet-status detects pets.status ↔ event-log divergence and records
// it in cronRuns.details, and cron-health (the meta-cron) flags divergent > 0
// as an unhealthy 'drift' state — but neither signal was visible in the admin
// UI. This loader surfaces both for the /admin/sistema drift card. Detect-only:
// repair stays human-gated (scripts/rebuild-projections.ts --apply).

export type PetStatusDriftSample = {
  publicToken: string;
  /** pets.status stored at scan time. */
  cached: string | null;
  /** Status derived from the event log at scan time. */
  derived: string | null;
  /**
   * The cache columns that ACTUALLY diverged for this pet. A pet is flagged
   * divergent when ANY checked column drifts (status, estimatedWeightKg,
   * microchip*, tattoo*, pregnancyStatus, …) — not only status. The card must
   * show these so a divergent row whose `status` happens to match doesn't read
   * as a mislabelled "cache active → log active" pair. Empty for legacy runs
   * recorded before the cron persisted this field.
   */
  driftedColumns: string[];
};

export type PetStatusDrift = {
  /** Latest reconcile_pet_status run, or null when that cron never ran. */
  reconcile: {
    lastRunAt: Date;
    status: "running" | "ok" | "failed";
    scanned: number;
    divergent: number;
    /** True when the scan stopped early (MAX_PETS_PER_RUN / time budget). */
    earlyStop: boolean;
    sample: PetStatusDriftSample[];
  } | null;
  /**
   * Latest cron_health verdict about reconcile_pet_status — the meta-cron
   * semantic check that verifies drift detection is running AND clean.
   * null when cron_health never ran or has no entry for the reconcile cron.
   */
  metaCheck: {
    checkedAt: Date;
    healthy: boolean;
    /** 'ok' | 'drift' | 'stale' | 'never_ran' | 'last_failed' (cron-health reasons). */
    reason: string;
  } | null;
};

export async function fetchPetStatusDrift(): Promise<PetStatusDrift> {
  const [[reconcileRun], [healthRun]] = await Promise.all([
    db
      .select({
        startedAt: cronRuns.startedAt,
        status: cronRuns.status,
        details: cronRuns.details,
      })
      .from(cronRuns)
      .where(eq(cronRuns.cronName, "reconcile_pet_status"))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1),
    db
      .select({
        startedAt: cronRuns.startedAt,
        details: cronRuns.details,
      })
      .from(cronRuns)
      .where(eq(cronRuns.cronName, "cron_health"))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1),
  ]);

  let reconcile: PetStatusDrift["reconcile"] = null;
  if (reconcileRun) {
    const d = (reconcileRun.details ?? {}) as Record<string, unknown>;
    const rawSample = Array.isArray(d.sample) ? (d.sample as Record<string, unknown>[]) : [];
    reconcile = {
      lastRunAt: reconcileRun.startedAt,
      status: reconcileRun.status,
      scanned: Number(d.scanned ?? 0),
      divergent: Number(d.divergent ?? 0),
      earlyStop: d.earlyStop === true,
      sample: rawSample.map((s) => ({
        publicToken: typeof s.publicToken === "string" ? s.publicToken : "—",
        cached: typeof s.cached === "string" ? s.cached : null,
        derived: typeof s.derived === "string" ? s.derived : null,
        driftedColumns: Array.isArray(s.driftedColumns)
          ? (s.driftedColumns as unknown[]).filter((c): c is string => typeof c === "string")
          : [],
      })),
    };
  }

  let metaCheck: PetStatusDrift["metaCheck"] = null;
  if (healthRun) {
    const d = (healthRun.details ?? {}) as Record<string, unknown>;
    const all = Array.isArray(d.all) ? (d.all as Record<string, unknown>[]) : [];
    const entry = all.find((r) => r.cronName === "reconcile_pet_status");
    if (entry) {
      metaCheck = {
        checkedAt: healthRun.startedAt,
        healthy: entry.healthy === true,
        reason: typeof entry.reason === "string" ? entry.reason : "unknown",
      };
    }
  }

  return { reconcile, metaCheck };
}

// ---------------------------------------------------------------------------
// Cron health detail — used by /admin/sistema/crons.
//
// Returns one row per cron in the registry (including ones that never ran).
// The staleness thresholds here mirror the CRON_REGISTRY in
// app/api/cron/cron-health/route.ts — keep them in sync.
// ---------------------------------------------------------------------------

const DAILY_STALENESS_MS = 26 * 60 * 60 * 1000; // 26 hours

export type CronHealthRow = {
  cronName: string;
  schedule: string;
  healthy: boolean;
  reason: "ok" | "never_ran" | "stale" | "last_failed";
  lastRunAt: Date | null;
  lastStatus: "ok" | "failed" | "running" | null;
  lastItemsProcessed: number | null;
  ageMs: number | null;
};

const CRON_SCHEDULE_MAP: Record<string, string> = {
  vaccine_due: "0 12 * * *",
  post_adoption_checkin: "0 13 * * *",
  expire_foster_proposals: "0 3 * * *",
  auto_expire_approvals: "0 4 * * *",
  close_rabies_observations: "0 0 * * *",
  close_stale_lost_episodes: "0 4 * * *",
  close_followup_expired_adoptions: "0 4 * * *",
  escalate_stale_welfare_cases: "0 4 * * *",
  escalate_stale_disputes: "0 4 * * *",
  expire_cross_org_transfers: "0 4 * * *",
  drain_outbox: "0 6 * * *",
  process_eno_queue: "0 7 * * *",
  expire_pet_transfers: "0 4 * * *",
  expire_decomiso_handoffs: "0 0 * * *",
  materialize_slots: "0 2 * * *",
  business_rules_reeval: "0 5 * * *",
  data_lifecycle: "30 3 * * *",
  purge_scan_events: "0 1 * * *",
  evaluate_alerts: "0 8 * * *",
  reconcile_pet_status: "0 9 * * *",
  cron_health: "0 10 * * *",
};

const CRON_REGISTRY_NAMES = Object.keys(CRON_SCHEDULE_MAP);

export async function fetchCronHealth(): Promise<CronHealthRow[]> {
  const now = Date.now();

  // Fetch the latest run for every known cron name in one pass.
  const knownNames = await db
    .selectDistinct({ cronName: cronRuns.cronName })
    .from(cronRuns)
    .orderBy(cronRuns.cronName);

  const latestByName = new Map<
    string,
    { startedAt: Date; status: string; itemsProcessed: number }
  >();

  for (const n of knownNames) {
    const [latest] = await db
      .select({
        startedAt: cronRuns.startedAt,
        status: cronRuns.status,
        itemsProcessed: cronRuns.itemsProcessed,
      })
      .from(cronRuns)
      .where(eq(cronRuns.cronName, n.cronName))
      .orderBy(desc(cronRuns.startedAt))
      .limit(1);
    if (latest) latestByName.set(n.cronName, latest);
  }

  const rows: CronHealthRow[] = [];
  for (const cronName of CRON_REGISTRY_NAMES) {
    const schedule = CRON_SCHEDULE_MAP[cronName] ?? "?";
    const latest = latestByName.get(cronName) ?? null;

    if (!latest) {
      rows.push({
        cronName,
        schedule,
        healthy: false,
        reason: "never_ran",
        lastRunAt: null,
        lastStatus: null,
        lastItemsProcessed: null,
        ageMs: null,
      });
      continue;
    }

    const ageMs = now - latest.startedAt.getTime();
    const status = latest.status as "ok" | "failed" | "running";

    if (status === "failed") {
      rows.push({
        cronName,
        schedule,
        healthy: false,
        reason: "last_failed",
        lastRunAt: latest.startedAt,
        lastStatus: status,
        lastItemsProcessed: latest.itemsProcessed,
        ageMs,
      });
      continue;
    }

    if (ageMs > DAILY_STALENESS_MS) {
      rows.push({
        cronName,
        schedule,
        healthy: false,
        reason: "stale",
        lastRunAt: latest.startedAt,
        lastStatus: status,
        lastItemsProcessed: latest.itemsProcessed,
        ageMs,
      });
      continue;
    }

    rows.push({
      cronName,
      schedule,
      healthy: true,
      reason: "ok",
      lastRunAt: latest.startedAt,
      lastStatus: status,
      lastItemsProcessed: latest.itemsProcessed,
      ageMs,
    });
  }

  return rows;
}
