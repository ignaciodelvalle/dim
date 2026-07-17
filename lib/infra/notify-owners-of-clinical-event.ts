// Owner-facing alert for third-party clinical signatures.
//
// WHY (PO decision + QA, 2026-07-16): when a vet or an org member signs a
// clinical event (vaccination, deworming, clinical info, medication start,
// clinical note) on a pet whose owner is someone else — the QA-proven case is
// the Atender walk-in path — the owner previously got NOTHING. Lost/found
// alerts arrive instantly; a vaccination signed via Atender arrived silently.
//
// This helper closes that gap by mirroring the owner-alert path (see
// lib/infra/owner-disease-alerts.ts: resolve current human owners/co-owners,
// then enqueue one notification each) but routing through the canonical
// notification SERVICE (createNotification — idempotent + dead-lettered) as
// scripts/check-notifications-service.ts requires of all NEW code.
//
// Rules:
//   - THIRD-PARTY ONLY: an owner who signs on their own pet (authorUserId is
//     among the owners) is never notified about their own signature.
//   - Org-held pets with no human owner (ownerUserId=null) have no recipient.
//   - Best-effort: this runs POST-transaction; a failure here never rolls back
//     or blocks the clinical write that already committed.

import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { type EventType, db, ownerships } from "@/db";
import { createNotification } from "@/lib/infra/notification-service";
import { eventTypeLabel } from "@/lib/utils/format";

export type ClinicalEventNotifyInput = {
  petId: string;
  petName: string;
  /** Public DIM token — used to build the owner's "Ver libreta" deep link. */
  petPublicToken: string;
  eventId: string;
  eventType: EventType;
  /** The signer's user id — never notified about their own signature. */
  authorUserId: string;
  /** How the signer is named to the owner (e.g. the clinic / refugio name). */
  authorLabel: string;
};

export type ClinicalEventNotifyDeps = {
  /** Resolve current human owner/co-owner user ids for a pet. */
  findOwnerUserIds: (petId: string) => Promise<string[]>;
  createNotification: typeof createNotification;
};

/** Default deps: real ownerships query + the canonical notification service. */
const defaultDeps: ClinicalEventNotifyDeps = {
  findOwnerUserIds: async (petId: string) => {
    const rows = await db
      .select({ userId: ownerships.ownerUserId })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          inArray(ownerships.role, ["owner", "co_owner"]),
          isNull(ownerships.endedAt),
        ),
      );
    return rows
      .map((r) => r.userId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  },
  createNotification,
};

export type ClinicalEventNotifyResult = { delivered: number };

/**
 * Enqueue an owner notification for a clinical event authored by a third
 * party. Idempotent (dedupeKey per owner+event) and best-effort — it swallows
 * its own errors so the already-committed clinical write is never affected.
 */
export async function notifyOwnersOfClinicalEvent(
  input: ClinicalEventNotifyInput,
  deps: ClinicalEventNotifyDeps = defaultDeps,
): Promise<ClinicalEventNotifyResult> {
  try {
    const ownerIds = await deps.findOwnerUserIds(input.petId);
    // Third-party rule: drop the author (and dedupe co-owner rows).
    const recipients = [...new Set(ownerIds)].filter((id) => id !== input.authorUserId);
    if (recipients.length === 0) return { delivered: 0 };

    // Reuse the shared event vocabulary rather than inventing labels. Lower the
    // first letter so it reads naturally mid-sentence ("registró vacuna…").
    const label = eventTypeLabel(input.eventType);
    const eventLabelInline = label.charAt(0).toLowerCase() + label.slice(1);

    let delivered = 0;
    for (const userId of recipients) {
      const res = await deps.createNotification({
        userId,
        notificationType: "clinical_event_recorded",
        category: "health",
        severity: "info",
        title: `Nuevo registro en la libreta de ${input.petName}`,
        body: `${input.authorLabel} registró ${eventLabelInline} en la libreta de ${input.petName}.`,
        ctaLabel: "Ver libreta",
        ctaUrl: `/mis-mascotas/${input.petPublicToken}`,
        relatedPetId: input.petId,
        relatedEventId: input.eventId,
        dedupeKey: `event:${input.eventId}:${userId}:clinical_recorded`,
      });
      if (res.status === "inserted") delivered += 1;
    }
    return { delivered };
  } catch (err) {
    console.error("[notifyOwnersOfClinicalEvent] failed (clinical event did persist):", err);
    return { delivered: 0 };
  }
}
