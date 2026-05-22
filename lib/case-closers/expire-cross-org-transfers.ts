// Cron closer for cross-org transfer handshakes that hit the 30-day
// no-response timeout (spec 2026-05-19-cross-org-transfer-ux §12.5).
//
// Scan: custody_transfer_handshake cases with status='open' opened
// more than 30 days ago.
// Process: append a system note explaining the expiry, close the case
// with closed_reason='auto_expired', notify both sides.
//
// Idempotent: rows already closed are excluded by the scan filter.

import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { cases, db, notifications, organizationMemberships, petEvents } from "@/db";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";

export interface ExpireCrossOrgTransfersOptions {
  now?: Date;
  /** Days an open handshake may sit before auto-expiring. Default 30. */
  staleAfterDays?: number;
}

export interface ExpireCrossOrgCandidate {
  id: string;
  publicCode: string;
  primaryPetId: string | null;
  openedByOrganizationId: string | null;
  receiverOrganizationId: string | null;
}

export async function findExpiredCrossOrgTransfers(
  options?: ExpireCrossOrgTransfersOptions,
): Promise<ExpireCrossOrgCandidate[]> {
  const now = options?.now ?? new Date();
  const staleAfterMs = (options?.staleAfterDays ?? 30) * 24 * 60 * 60 * 1000;
  const openedBefore = new Date(now.getTime() - staleAfterMs);

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      primaryPetId: cases.primaryPetId,
      openedByOrganizationId: cases.openedByOrganizationId,
      receiverOrganizationId: cases.receiverOrganizationId,
    })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "custody_transfer_handshake"),
        eq(cases.status, "open"),
        lt(cases.openedAt, openedBefore),
      ),
    );

  return rows;
}

export async function expireCrossOrgTransfer(
  candidate: ExpireCrossOrgCandidate,
  options?: { now?: Date },
): Promise<void> {
  const now = options?.now ?? new Date();

  await db.transaction(async (tx) => {
    // Re-check status inside the tx so a concurrent accept/reject wins.
    const [current] = await tx
      .select({ status: cases.status })
      .from(cases)
      .where(eq(cases.id, candidate.id))
      .limit(1);
    if (!current || current.status !== "open") return;

    // Resolve the receiver: canonical column first (migration 0043),
    // payload fallback for legacy rows pre-backfill.
    let receiverOrgId: string | null = candidate.receiverOrganizationId;
    if (!receiverOrgId) {
      const [proposalEvent] = await tx
        .select({ payload: petEvents.payload })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.caseId, candidate.id),
            eq(petEvents.eventType, "custody_transfer_proposed"),
          ),
        )
        .limit(1);
      if (proposalEvent) {
        const p = proposalEvent.payload as { to_organization_id?: string };
        receiverOrgId = p.to_organization_id ?? null;
      }
    }

    if (candidate.primaryPetId) {
      const notePayload = validateEventPayload("note_added", {
        category: "system",
        text: "Auto-expirada: el destinatario no respondió la propuesta en el plazo de 30 días.",
      });
      await tx.insert(petEvents).values({
        petId: candidate.primaryPetId,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: null,
        authorRole: "system",
        payload: notePayload,
        caseId: candidate.id,
      });
    }

    await closeCase({ caseId: candidate.id, reason: "auto_expired" }, tx);

    // Notify coordinators on both sides.
    const orgIds = [candidate.openedByOrganizationId, receiverOrgId].filter(
      (id): id is string => typeof id === "string",
    );
    if (orgIds.length > 0) {
      const recipients = await tx
        .select({
          userId: organizationMemberships.userId,
          orgId: organizationMemberships.organizationId,
        })
        .from(organizationMemberships)
        .where(
          and(
            inArray(organizationMemberships.organizationId, orgIds),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      if (recipients.length > 0) {
        await tx.insert(notifications).values(
          recipients.map((r) => ({
            userId: r.userId,
            notificationType:
              r.orgId === candidate.openedByOrganizationId
                ? ("cross_org_transfer_expired_sender" as const)
                : ("cross_org_transfer_expired_receiver" as const),
            severity: "warning" as const,
            title: "Propuesta de transferencia expirada",
            body: "Pasaron 30 días sin respuesta. La propuesta se cerró automáticamente.",
            ctaLabel: "Ver caso",
            ctaUrl: `/casos/${candidate.publicCode}`,
            relatedCaseId: candidate.id,
            relatedPetId: candidate.primaryPetId,
          })),
        );
      }
    }

    // No audit_log entry — actor_user_id is notNull and the cron has no
    // human actor. The note_added system event above + the closed case
    // row provide the audit trail.
  });
}
