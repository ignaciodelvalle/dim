// Cron escalator for welfare_denuncia cases that have been inactive for
// >90 days (lifecycles spec §7.10).
//
// Scan: welfare_denuncia cases with status='open', linked to a
// welfare_reports row whose status is 'triaged' or 'in_progress', with
// NO pet_events activity attached in the last 90 days.
// Process: UPDATE cases.status='escalated' (one-way; manual triage can
// re-open via UPDATE) + notify the jurisdiction's govt authorities so
// the staleness surfaces in /gob/maltrato with a `stale` badge.
//
// The cron does NOT modify welfare_reports.status — welfare denuncias
// are sensitive and only manual triage may close them.
//
// Idempotent: rows already in `escalated` status are excluded.

import { and, eq, inArray, sql } from "drizzle-orm";

import { cases, db, notifications, petEvents, welfareReports } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";

export interface EscalateStaleWelfareOptions {
  now?: Date;
  /** Days of inactivity before escalation. Default 90. */
  inactivityDays?: number;
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
  const rows = await db
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
        sql`NOT EXISTS (
          SELECT 1 FROM ${petEvents}
          WHERE ${petEvents.caseId} = ${cases.id}
            AND ${petEvents.occurredAt} >= ${inactiveSinceIso}::timestamptz
        )`,
      ),
    );

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
