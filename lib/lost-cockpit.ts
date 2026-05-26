// Data helpers for the lost-mode cockpit on the owner pet profile.
//
// Renders only when pet.status === 'lost'. Each helper isolates one query
// so the page can request them in parallel.

import { db, notifications, petEvents } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { and, eq, gte } from "drizzle-orm";

export type LostScanRow = {
  id: string;
  occurredAt: Date;
};

export type LostFinderNotification = {
  id: string;
  createdAt: Date;
  /** Notification title — e.g. "Alguien encontró a Pampa". */
  title: string;
  /** Notification body — finder name + contact + optional message. May be
   *  null in older rows; callers should default to an empty string. */
  body: string | null;
};

/**
 * QR scan events for this pet since the case opened.
 *
 * Filters self-scans (owner viewing their own credential) via the shared
 * `excludeSelfScansClause`. Returns newest-first.
 */
export async function fetchScanEventsSince(petId: string, since: Date): Promise<LostScanRow[]> {
  const rows = await db
    .select({
      id: petEvents.id,
      occurredAt: petEvents.occurredAt,
    })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "credential_scanned"),
        gte(petEvents.occurredAt, since),
        excludeSelfScansClause(),
      ),
    )
    .orderBy(petEvents.occurredAt);
  return rows;
}

/**
 * Finder-form submissions for this pet since the case opened.
 *
 * Persisted as `notifications` of type `pet_found_report` by
 * `notifyOwnerOfFoundPetAction`. Owner-side projection only — the finder
 * sees a thank-you screen, not the notification.
 */
export async function fetchFinderNotificationsSince(
  petId: string,
  since: Date,
): Promise<LostFinderNotification[]> {
  const rows = await db
    .select({
      id: notifications.id,
      createdAt: notifications.createdAt,
      title: notifications.title,
      body: notifications.body,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.relatedPetId, petId),
        eq(notifications.notificationType, "pet_found_report"),
        gte(notifications.createdAt, since),
      ),
    )
    .orderBy(notifications.createdAt);
  return rows;
}
