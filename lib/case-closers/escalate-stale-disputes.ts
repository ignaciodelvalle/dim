// Cron escalator for custody_dispute cases open for >365 days
// (lifecycles spec §10.10).
//
// Scan: custody_dispute cases with status='open', opened_at < now-365d.
// Process: UPDATE cases.status='escalated' + notify admin + govt
// authorities. The cron does NOT close the case — legal disputes can
// run for years.
//
// Idempotent: rows already in `escalated` status are excluded.

import { and, eq, lt } from "drizzle-orm";

import { cases, db, notifications, profiles } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";

export interface EscalateStaleDisputesOptions {
  now?: Date;
  /** Days a dispute must be open before escalating. Default 365. */
  staleAfterDays?: number;
}

export interface StaleDisputeCandidate {
  id: string;
  publicCode: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
}

export async function findStaleDisputes(
  options?: EscalateStaleDisputesOptions,
): Promise<StaleDisputeCandidate[]> {
  const now = options?.now ?? new Date();
  const staleAfterMs = (options?.staleAfterDays ?? 365) * 24 * 60 * 60 * 1000;
  const openedBefore = new Date(now.getTime() - staleAfterMs);

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      jurisdictionProvince: cases.jurisdictionProvince,
      jurisdictionLocality: cases.jurisdictionLocality,
    })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "custody_dispute"),
        eq(cases.status, "open"),
        lt(cases.openedAt, openedBefore),
      ),
    );

  return rows;
}

export async function escalateStaleDispute(
  candidate: StaleDisputeCandidate,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();

  const govtAuthorities =
    candidate.jurisdictionProvince && candidate.jurisdictionLocality
      ? await findAuthoritiesForJurisdiction({
          province: candidate.jurisdictionProvince,
          locality: candidate.jurisdictionLocality,
        })
      : [];

  const admins = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.role, "admin"), eq(profiles.accountType, "institutional")));

  const recipientSet = new Set<string>([...govtAuthorities, ...admins.map((a) => a.id)]);
  const recipients = Array.from(recipientSet);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(cases)
      .set({ status: "escalated", updatedAt: now })
      .where(and(eq(cases.id, candidate.id), eq(cases.status, "open")))
      .returning({ id: cases.id });
    if (updated.length === 0) return;

    if (recipients.length === 0) return;

    await tx.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        notificationType: "custody_dispute_stale" as const,
        severity: "warning" as const,
        title: "Disputa de custodia >1 año",
        body: `La disputa ${candidate.publicCode} lleva más de 365 días abierta. Considerar follow-up con la autoridad legal interviniente.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${candidate.publicCode}`,
        relatedCaseId: candidate.id,
      })),
    );
  });
}
