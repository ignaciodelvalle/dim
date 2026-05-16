// Centralized notification helpers. Today this hosts the vaccine_due
// scheduled-scan logic (AGENTS.md → Notifications, third creation source).
// The plan is to migrate the existing notification factories (welcome via
// handle_new_user trigger; ppp_registration_reminder from updatePetAction /
// createPetAction) through this module too, so every notification has one
// authoritative shape. v1 ships only the vaccine_due path.

import {
  db as defaultDb,
  notifications,
  organizationMemberships,
  petEvents,
  pets,
  reminders,
} from "@/db";
import { and, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

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

// ---------------------------------------------------------------------------
// Post-adoption check-in scan
// ---------------------------------------------------------------------------

// Grace period after dueAt before phase 2 (missed-window fanout to refugio)
// fires. Gives the adopter a window to act between the proactive reminder
// (phase 1) and the refugio being told they ghosted. AGENTS.md
// → Custody & adoption requires both notifications; the grace keeps them
// from racing each other on the same calendar day the reminder is due.
const POST_ADOPTION_MISSED_GRACE_DAYS = 14;

export type PostAdoptionCheckinScanResult = {
  scannedAt: Date;
  proactiveInsertedIds: string[];
  missedInsertedIds: string[];
};

/**
 * Two-phase scan for post-adoption check-in reminders. Inverse of the vaccine
 * pattern: instead of firing when an event IS due, this fires when the
 * adopter's self-reported `post_adoption_checkin` event is MISSING by the
 * reminder's dueAt + grace.
 *
 * Phase 1 (proactive): reminders coming due in the next 7d (with 1d backward
 * grace) → notify the adopter. Dedupe per-reminder via
 * `notifications.relatedReminderId`.
 *
 * Phase 2 (missed-window fanout): reminders past dueAt + grace, still open,
 * with no `post_adoption_checkin` event recorded on the pet since the
 * adoption_finalized event → fan out to refugio admins of the originating
 * org. Dedupe per-reminder via `notifications.relatedReminderId`.
 */
export async function runPostAdoptionCheckinScan(
  dbInstance: DB = defaultDb,
  options?: { now?: Date },
): Promise<PostAdoptionCheckinScanResult> {
  const now = options?.now ?? new Date();
  const proactiveWindowEnd = new Date(now.getTime() + DAYS_AHEAD * MILLIS_PER_DAY);
  const proactiveWindowStart = new Date(now.getTime() - MILLIS_PER_DAY);
  const missedThreshold = new Date(
    now.getTime() - POST_ADOPTION_MISSED_GRACE_DAYS * MILLIS_PER_DAY,
  );

  // --- Phase 1: proactive reminders to adopters ---
  const proactiveCandidates = await dbInstance
    .select({
      reminderId: reminders.id,
      userId: reminders.userId,
      petId: reminders.petId,
      dueAt: reminders.dueAt,
      title: reminders.title,
      petName: pets.name,
      publicToken: pets.publicToken,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .where(
      and(
        eq(reminders.reminderType, "post_adoption_checkin"),
        isNull(reminders.completedAt),
        gte(reminders.dueAt, proactiveWindowStart),
        lte(reminders.dueAt, proactiveWindowEnd),
        sql`NOT EXISTS (
          SELECT 1 FROM ${notifications} n
          WHERE n.related_reminder_id = ${reminders.id}
            AND n.notification_type = 'post_adoption_checkin_due'
        )`,
      ),
    );

  const proactiveInsertedIds: string[] = [];
  for (const row of proactiveCandidates) {
    const dueMs = new Date(row.dueAt).getTime() - now.getTime();
    const daysAhead = Math.round(dueMs / MILLIS_PER_DAY);
    const body =
      daysAhead <= 0
        ? `Toca registrar el check-in post-adopción de ${row.petName}.`
        : daysAhead === 1
          ? `Mañana toca el check-in post-adopción de ${row.petName}.`
          : `En ${daysAhead} días toca el check-in post-adopción de ${row.petName}.`;
    const [inserted] = await dbInstance
      .insert(notifications)
      .values({
        userId: row.userId,
        notificationType: "post_adoption_checkin_due",
        title: row.title,
        body,
        severity: "info",
        relatedPetId: row.petId,
        relatedReminderId: row.reminderId,
        ctaLabel: "Hacer check-in",
        ctaUrl: `/mis-mascotas/${row.publicToken}/eventos/nuevo/checkin`,
      })
      .returning({ id: notifications.id });
    proactiveInsertedIds.push(inserted.id);
  }

  // --- Phase 2: missed-window fanout to refugio admins ---
  // A reminder is "missed" when:
  //   (a) dueAt < now - grace, AND
  //   (b) it is not completed (adopter never marked it done), AND
  //   (c) no post_adoption_checkin event has been recorded on the pet AFTER
  //       the reminder was created (the absence is the signal).
  //
  // The condition on petEvents looks across ALL post_adoption_checkin events
  // for the pet, not just by adopter — extending later to second-adopter
  // edge cases (re-adoption) would be a separate slice. (c) uses
  // reminders.created_at as the "since" anchor, not dueAt, so a check-in
  // that arrived a few days before the dueAt still counts as fulfilling
  // the obligation.
  const missedCandidates = await dbInstance
    .select({
      reminderId: reminders.id,
      petId: reminders.petId,
      sourceEventId: reminders.sourceEventId,
      title: reminders.title,
      petName: pets.name,
      publicToken: pets.publicToken,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .where(
      and(
        eq(reminders.reminderType, "post_adoption_checkin"),
        isNull(reminders.completedAt),
        isNotNull(reminders.sourceEventId),
        lt(reminders.dueAt, missedThreshold),
        sql`NOT EXISTS (
          SELECT 1 FROM ${petEvents} e
          WHERE e.pet_id = ${reminders.petId}
            AND e.event_type = 'post_adoption_checkin'
            AND e.recorded_at > ${reminders.createdAt}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${notifications} n
          WHERE n.related_reminder_id = ${reminders.id}
            AND n.notification_type = 'post_adoption_checkin_missed'
        )`,
      ),
    );

  const missedInsertedIds: string[] = [];
  for (const row of missedCandidates) {
    if (!row.sourceEventId) continue;
    // Resolve the originating org from the adoption_finalized event payload.
    // Stored as JSON; cast safely.
    const [adoption] = await dbInstance
      .select({ payload: petEvents.payload })
      .from(petEvents)
      .where(eq(petEvents.id, row.sourceEventId))
      .limit(1);
    const orgId = (adoption?.payload as { previous_owner_organization_id?: string } | undefined)
      ?.previous_owner_organization_id;
    if (!orgId) continue;

    const admins = await dbInstance
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          eq(organizationMemberships.role, "admin"),
          isNull(organizationMemberships.leftAt),
        ),
      );
    if (admins.length === 0) continue;

    const inserted = await dbInstance
      .insert(notifications)
      .values(
        admins.map((a) => ({
          userId: a.userId,
          notificationType: "post_adoption_checkin_missed",
          title: `Check-in pendiente: ${row.petName}`,
          body: `El adoptante de ${row.petName} no envió el seguimiento esperado. Considerá ponerte en contacto.`,
          severity: "warning" as const,
          relatedPetId: row.petId,
          relatedReminderId: row.reminderId,
          ctaLabel: "Ver mascota",
          ctaUrl: "/refugio/mascotas",
        })),
      )
      .returning({ id: notifications.id });
    for (const n of inserted) missedInsertedIds.push(n.id);
  }

  return {
    scannedAt: now,
    proactiveInsertedIds,
    missedInsertedIds,
  };
}
