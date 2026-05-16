// Centralized notification helpers. Today this hosts the vaccine_due
// scheduled-scan logic (AGENTS.md → Notifications, third creation source).
// The plan is to migrate the existing notification factories (welcome via
// handle_new_user trigger; ppp_registration_reminder from updatePetAction /
// createPetAction) through this module too, so every notification has one
// authoritative shape. v1 ships only the vaccine_due path.

import { db as defaultDb, notifications, pets, reminders } from "@/db";
import { and, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";

type DB = typeof defaultDb;

export type VaccineDueScanResult = {
  scannedAt: Date;
  insertedCount: number;
  insertedNotificationIds: string[];
};

const DAYS_AHEAD = 7;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Scan for vaccine reminders coming due in the next {@link DAYS_AHEAD} days
 * and emit one `vaccine_due` notification per reminder that does not already
 * have an unarchived notification linked to the same source event.
 *
 * Dedupe key: `notifications.relatedEventId = reminders.sourceEventId` AND
 * `notifications.notificationType = 'vaccine_due'` AND
 * `notifications.archivedAt IS NULL`. Reminders without a `sourceEventId`
 * are skipped — they cannot be deduplicated reliably (NULL = NULL is NULL
 * in SQL, so each tick would create a fresh notification). In practice
 * vaccine reminders always carry a `source_event_id` because they are
 * created by `createVaccinationAction` from the originating `vaccination_administered`
 * event.
 *
 * Completed reminders (`completedAt IS NOT NULL`) are excluded — once the
 * owner records the actual application the loop stops.
 */
export async function runVaccineDueScan(
  dbInstance: DB = defaultDb,
  options?: { now?: Date },
): Promise<VaccineDueScanResult> {
  const now = options?.now ?? new Date();
  const windowEnd = new Date(now.getTime() + DAYS_AHEAD * MILLIS_PER_DAY);
  // Include a 1-day backward grace so a single missed cron tick does not
  // permanently silence a reminder that came due yesterday. Anything older
  // than 1 day overdue is treated as the owner's responsibility to resolve
  // manually (e.g. they vaccinated and forgot to mark `completed_at`).
  const windowStart = new Date(now.getTime() - MILLIS_PER_DAY);

  const candidates = await dbInstance
    .select({
      reminderId: reminders.id,
      userId: reminders.userId,
      petId: reminders.petId,
      sourceEventId: reminders.sourceEventId,
      dueAt: reminders.dueAt,
      title: reminders.title,
      description: reminders.description,
      petName: pets.name,
      publicToken: pets.publicToken,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .where(
      and(
        eq(reminders.reminderType, "vaccine"),
        isNull(reminders.completedAt),
        isNotNull(reminders.sourceEventId),
        gte(reminders.dueAt, windowStart),
        lte(reminders.dueAt, windowEnd),
        sql`NOT EXISTS (
          SELECT 1 FROM ${notifications} n
          WHERE n.related_event_id = ${reminders.sourceEventId}
            AND n.notification_type = 'vaccine_due'
            AND n.archived_at IS NULL
        )`,
      ),
    );

  const insertedNotificationIds: string[] = [];
  for (const row of candidates) {
    const dueMs = new Date(row.dueAt).getTime() - now.getTime();
    const daysAhead = Math.round(dueMs / MILLIS_PER_DAY);
    // Build a time-aware body. This is the actionable message the owner sees
    // in the notifications list — it must reflect the moment of the scan, not
    // the moment the reminder was created. The reminder's stored description
    // (e.g. "Próxima dosis programada para Lila.") is the generic fallback
    // for when we can't compute the day delta.
    const body =
      daysAhead <= 0
        ? `${row.petName} tiene una vacuna programada para hoy.`
        : daysAhead === 1
          ? `${row.petName} tiene una vacuna programada para mañana.`
          : `${row.petName} tiene una vacuna programada en ${daysAhead} días.`;

    const [inserted] = await dbInstance
      .insert(notifications)
      .values({
        userId: row.userId,
        notificationType: "vaccine_due",
        title: row.title,
        body: body || row.description || null,
        severity: "warning",
        relatedPetId: row.petId,
        relatedEventId: row.sourceEventId,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${row.publicToken}`,
      })
      .returning({ id: notifications.id });
    insertedNotificationIds.push(inserted.id);
  }

  return {
    scannedAt: now,
    insertedCount: insertedNotificationIds.length,
    insertedNotificationIds,
  };
}
