// Use-case: escalate custody_episode handoffs pending receiver acceptance >7d.
//
// Migrated from lib/case-closers/escalate-stale-decomiso-handoffs.ts.
// The lib file becomes a thin re-export shim (strangler pattern).
//
// Scan:
//   - caseKind = 'custody_episode'
//   - status = 'open'
//   - opened by an org with org_type = 'sanitary_authority' ← canonical discriminator
//   - receiverOrganizationId IS NOT NULL                    ← a handoff is in flight
//   - MAX(occurred_at) of 'custody_transfer_proposed' events < now - 7d
//
// The 7-day clock keys on the LATEST custody_transfer_proposed event's
// occurred_at so that a reassign (govt sends a new proposal to another
// receiver) resets the window. No new DB column is needed.
//
// Action:
//   Does NOT close the case (DC8 / §13.5: humans resolve).
//   Emits decomiso_handoff_stale notifications to:
//     (a) active members of the opener govt org (roles admin/coordinator)
//     (b) all active institutional admins
//
// Idempotency:
//   Checks whether a 'decomiso_handoff_stale' notification for the same
//   relatedCaseId was already inserted within the last 7 days. If yes,
//   skips — the case is still stale but recipients were already paged in
//   this window. Mirrors the single-threshold guard used by
//   escalate-stale-welfare-cases.ts.

import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { cases, db, notifications, organizationMemberships, organizations, profiles } from "@/db";
// The 7-day window is the case DOMAIN's rule, shared with the org landing's
// queue signal — see DECOMISO_HANDOFF_STALE_DAYS' own comment for why it lives
// in the pure module rather than here.
import { DECOMISO_HANDOFF_STALE_DAYS } from "@/src/modules/cases/domain/case-sla";

export interface EscalateStaleDecomisosOptions {
  now?: Date;
  /** Days a pending handoff may sit before escalation. Default 7 per DC8. */
  staleAfterDays?: number;
  /**
   * Ceiling on the raw scan (review 23 item 13). This finder post-filters in JS
   * (latest-proposal age), so a keyset cursor over the raw rows isn't safe; a
   * plain LIMIT bounds memory instead. Decomiso volume is low and the cron runs
   * every 12h, so a per-run cap is acceptable. Default 500.
   */
  maxRawScan?: number;
}

export interface StaleDecomisoCandidateFull {
  id: string;
  publicCode: string;
  primaryPetId: string | null;
  openedByOrganizationId: string | null;
  receiverOrganizationId: string | null;
  govtOrgName: string;
  govtOrgId: string;
  /** ISO string of the latest custody_transfer_proposed event's occurred_at. */
  latestProposalAt: string | null;
}

// ---------------------------------------------------------------------------
// findStaleDecomisoCandidates
// ---------------------------------------------------------------------------
// Returns custody_episode cases whose latest proposal event is older than
// staleAfterDays. The correlated sub-select computes MAX(occurred_at) over
// custody_transfer_proposed events for each case; cases with no such event
// return NULL and are excluded in the in-process filter below.
export async function findStaleDecomisoCandidates(
  options?: EscalateStaleDecomisosOptions,
): Promise<StaleDecomisoCandidateFull[]> {
  const now = options?.now ?? new Date();
  const staleAfterMs =
    (options?.staleAfterDays ?? DECOMISO_HANDOFF_STALE_DAYS) * 24 * 60 * 60 * 1000;
  const staleBefore = new Date(now.getTime() - staleAfterMs);

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      primaryPetId: cases.primaryPetId,
      openedByOrganizationId: cases.openedByOrganizationId,
      receiverOrganizationId: cases.receiverOrganizationId,
      govtOrgName: organizations.displayName,
      govtOrgId: organizations.id,
      latestProposalAt: sql<string | null>`(
        SELECT MAX(pe.occurred_at)::text
        FROM pet_events pe
        WHERE pe.case_id = ${cases.id}
          AND pe.event_type = 'custody_transfer_proposed'
      )`.as("latest_proposal_at"),
    })
    .from(cases)
    .innerJoin(
      organizations,
      and(
        eq(organizations.id, cases.openedByOrganizationId),
        eq(organizations.orgType, "sanitary_authority"),
      ),
    )
    .where(
      and(
        eq(cases.caseKind, "custody_episode"),
        eq(cases.status, "open"),
        isNotNull(cases.receiverOrganizationId),
      ),
    )
    .orderBy(asc(cases.id))
    .limit(options?.maxRawScan ?? 500);

  // Filter: keep only rows where the latest proposal predates the stale threshold.
  // Done in JS to avoid a complex HAVING/WHERE on a correlated sub-select column.
  return rows.filter((r): r is StaleDecomisoCandidateFull => {
    if (!r.latestProposalAt) return false;
    return new Date(r.latestProposalAt) < staleBefore;
  });
}

// ---------------------------------------------------------------------------
// escalateStaleDecomiso
// ---------------------------------------------------------------------------
// Emits decomiso_handoff_stale notifications. Idempotent: skips cases that
// were already notified within the last 7 days.
export async function escalateStaleDecomiso(
  candidate: StaleDecomisoCandidateFull,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Idempotency check: a stale notification for this case in the last 7 days.
  const [existingNotif] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.notificationType, "decomiso_handoff_stale"),
        eq(notifications.relatedCaseId, candidate.id),
        gt(notifications.createdAt, sevenDaysAgo),
      ),
    )
    .limit(1);

  if (existingNotif) return; // already notified this window

  // Govt org members (admin + coordinator role, not departed).
  const govtMembers = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, candidate.govtOrgId),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    );

  // Active institutional admins (same query as escalate-stale-disputes.ts).
  const adminProfiles = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "admin"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
      ),
    );

  const recipientSet = new Set<string>([
    ...govtMembers.map((m) => m.userId),
    ...adminProfiles.map((a) => a.id),
  ]);
  const recipients = Array.from(recipientSet);

  if (recipients.length === 0) return;

  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      notificationType: "decomiso_handoff_stale" as const,
      severity: "warning" as const,
      title: "Decomiso sin refugio receptor por >7 días",
      body: `La propuesta de handoff del caso ${candidate.publicCode} (${candidate.govtOrgName}) lleva más de 7 días sin respuesta. Reasignar a otro refugio o mantener en custodia oficial.`,
      ctaLabel: "Ver caso",
      ctaUrl: `/casos/${candidate.publicCode}`,
      relatedCaseId: candidate.id,
      relatedPetId: candidate.primaryPetId,
      category: "custody",
    })),
  );
}
