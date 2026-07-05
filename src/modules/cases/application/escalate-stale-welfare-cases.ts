// Use-case: escalate stale welfare_denuncia cases (inactive >90 days).
//
// Migrated from lib/case-closers/escalate-stale-welfare-cases.ts.
// The lib file becomes a thin re-export shim (strangler pattern).
//
// Scan: welfare_denuncia cases with status='open', linked welfareReport.status
// IN ('triaged', 'in_progress'), NO pet_events in last 90 days.
// Process: resolve authorities = findAuthoritiesForJurisdiction(prov, loc)
// (govt ONLY — no institutional admins, unlike disputes);
// in ONE tx — UPDATE status='escalated' (guarded AND status='open');
// if 0 rows → return (anti-race); if authorities > 0 → insert notifications.
//
// Does NOT modify welfare_reports.status — sensitive, manual-triage only.
// Auth: none (system-initiated cron). No user authz inside.

import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";

import { cases, db, notifications, petEvents, welfareReports } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/infra/approval-routing";

export interface EscalateStaleWelfareOptions {
  now?: Date;
  /** Days of inactivity before escalation. Default 90. */
  inactivityDays?: number;
  /** Keyset cursor: only return cases whose id sorts after this value. */
  afterId?: string | null;
  /** Max rows to return (keyset page size). Omit for no limit. */
  limit?: number;
}

export interface StaleWelfareCandidate {
  id: string;
  publicCode: string;
  welfareReportId: string | null;
  referenceCode: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
}

export async function findStaleWelfareCases(
  options?: EscalateStaleWelfareOptions,
): Promise<StaleWelfareCandidate[]> {
  const now = options?.now ?? new Date();
  const inactivityMs = (options?.inactivityDays ?? 90) * 24 * 60 * 60 * 1000;
  const inactiveSince = new Date(now.getTime() - inactivityMs);

  const inactiveSinceIso = inactiveSince.toISOString();
  const base = db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      welfareReportId: cases.welfareReportId,
      referenceCode: welfareReports.referenceCode,
      jurisdictionProvince: cases.jurisdictionProvince,
      jurisdictionLocality: cases.jurisdictionLocality,
    })
    .from(cases)
    .leftJoin(welfareReports, eq(welfareReports.id, cases.welfareReportId))
    .where(
      and(
        eq(cases.caseKind, "welfare_denuncia"),
        eq(cases.status, "open"),
        inArray(welfareReports.status, ["triaged", "in_progress"]),
        ...(options?.afterId ? [gt(cases.id, options.afterId)] : []),
        sql`NOT EXISTS (
          SELECT 1 FROM ${petEvents}
          WHERE ${petEvents.caseId} = ${cases.id}
            AND ${petEvents.occurredAt} >= ${inactiveSinceIso}::timestamptz
        )`,
      ),
    )
    .orderBy(asc(cases.id));

  const rows = options?.limit ? await base.limit(options.limit) : await base;

  return rows;
}

export async function escalateStaleWelfareCase(
  candidate: StaleWelfareCandidate,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();

  const authorities =
    candidate.jurisdictionProvince && candidate.jurisdictionLocality
      ? await findAuthoritiesForJurisdiction({
          province: candidate.jurisdictionProvince,
          locality: candidate.jurisdictionLocality,
        })
      : [];

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(cases)
      .set({ status: "escalated", updatedAt: now })
      .where(and(eq(cases.id, candidate.id), eq(cases.status, "open")))
      .returning({ id: cases.id });
    if (updated.length === 0) return;

    if (authorities.length === 0) return;

    await tx.insert(notifications).values(
      authorities.map((authorityId) => ({
        userId: authorityId,
        notificationType: "welfare_denuncia_stale_govt" as const,
        severity: "warning" as const,
        title: "Denuncia inactiva >90 días",
        body: `La denuncia ${candidate.referenceCode ?? candidate.publicCode} no tiene actualizaciones desde hace 90+ días.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${candidate.publicCode}`,
        relatedCaseId: candidate.id,
      })),
    );
  });
}
