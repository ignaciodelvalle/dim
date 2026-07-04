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
  organizations,
  petEvents,
  pets,
  reminders,
} from "@/db";
import { getReminderVariant, isVaccineReportable } from "@/lib/domain/vaccine-reminder-state";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { createNotification } from "@/lib/infra/notification-service";
import { buildReminderVaccineUrl } from "@/lib/ui/reminder-urls";
import { and, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

type DB = typeof defaultDb;

export type VaccineDueScanResult = {
  scannedAt: Date;
  insertedCount: number;
  insertedNotificationIds: string[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Days ahead window: include all reminders due within N days (upcoming
// variant, default 14). There is no backward limit — indefinitely overdue
// reminders are included (overdue / overdue_critical variants). Default
// tier of the `reminder_windows` business rule (admin-rules-console, design
// ADR-4 item 3) — this cron sweep scans ALL reminders globally with no
// per-pet jurisdiction context, so it resolves the window ONCE at sweep
// start, country-level only (resolveBusinessRule below), instead of once
// per reminder row (would be N DB round-trips in a hot cron — rejected on
// cost, per ADR-4). Kept as a fallback constant for callers/tests that
// don't go through the resolver path.
const WINDOW_AHEAD_DAYS = 14;

/**
 * Scan for vaccine reminders and emit per-variant throttled `vaccine_due`
 * notifications. Replaces the old single-dedup approach with per-variant
 * cadence rules (Chunk C C2).
 *
 * Throttle rules per variant:
 *   upcoming        — once every 7 days.
 *   due_soon        — daily for the first 3 days since first notif, then every 3 days.
 *   overdue         — daily for the first 14 days since first notif, then weekly.
 *   overdue_critical — daily indefinitely.
 *
 * Dedupe key: `notifications.relatedReminderId = reminders.id` AND
 * `notifications.notificationType LIKE 'vaccine_%'` — archived rows COUNT
 * (archiving dismisses from the inbox; it doesn't reset the cadence).
 *
 * relatedEventId is NEVER set on these inserts: migration 0088's unique
 * index exempts cron notifications via related_event_id IS NULL so the
 * escalating cadence can emit repeatedly for the same source event
 * (projection-cron audit 2026-07-03 C1).
 *
 * Backward compat: pre-C2 notifications only have relatedEventId, so the new
 * throttle query (by relatedReminderId) sees notif_count=0 for existing
 * reminders on the first post-C2 run. This produces one extra notification
 * per active reminder — a one-time acceptable cost.
 *
 * Snoozed reminders (snoozedUntil > now) are excluded for the whole run.
 * Completed reminders (completedAt IS NOT NULL) are excluded.
 */
export async function runVaccineDueScan(
  dbInstance: DB = defaultDb,
  options?: { now?: Date },
): Promise<VaccineDueScanResult> {
  const now = options?.now ?? new Date();
  // Country-level only — see the WINDOW_AHEAD_DAYS comment above (ADR-4 item 3).
  // Resolved against the caller's dbInstance so tests that inject a
  // transaction-scoped db see their own fixture rows, not the shared pool.
  const reminderWindowRule = await resolveBusinessRule(
    "reminder_windows",
    { country: "AR" },
    dbInstance,
  );
  const windowAheadDays = reminderWindowRule.payload.aheadDays;
  const windowEnd = new Date(now.getTime() + windowAheadDays * MS_PER_DAY);

  // Fetch all active, non-snoozed vaccine reminders within the window.
  // No backward limit — overdue reminders are included indefinitely.
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
      petSpecies: pets.species,
      petJurisdictionLocality: pets.jurisdictionLocality,
      publicToken: pets.publicToken,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .where(
      and(
        eq(reminders.reminderType, "vaccine"),
        isNull(reminders.completedAt),
        // snoozed_until IS NULL OR snoozed_until <= now
        sql`(${reminders.snoozedUntil} IS NULL OR ${reminders.snoozedUntil} <= ${sql.param(now.toISOString())}::timestamptz)`,
        lte(reminders.dueAt, windowEnd),
      ),
    );

  const insertedNotificationIds: string[] = [];

  for (const row of candidates) {
    const dueMs = new Date(row.dueAt).getTime() - now.getTime();
    // daysUntilDue: positive = future, negative = past
    const daysUntilDue = Math.round(dueMs / MS_PER_DAY);

    const isReportable = isVaccineReportable(
      row.title,
      row.petSpecies ?? "",
      row.petJurisdictionLocality ?? "",
    );
    const variant = getReminderVariant(daysUntilDue, isReportable);

    // Query the notification history for this reminder to determine throttle.
    const historyRows = await dbInstance.execute<{
      first_at: Date | null;
      last_at: Date | null;
      notif_count: string;
    }>(sql`
      SELECT
        MIN(created_at) AS first_at,
        MAX(created_at) AS last_at,
        COUNT(*)::text  AS notif_count
      FROM ${notifications}
      WHERE related_reminder_id = ${row.reminderId}
        AND notification_type LIKE 'vaccine_%'
    `);
    // Archived rows COUNT toward the throttle: archiving dismisses the
    // notification from the inbox, it does not consent to being re-notified
    // at full frequency — the old `archived_at IS NULL` filter let archiving
    // reset the cadence (projection-cron audit 2026-07-03 C2).

    const history = historyRows[0] ?? { first_at: null, last_at: null, notif_count: "0" };
    const notifCount = Number.parseInt(history.notif_count ?? "0", 10);
    const firstAt = history.first_at ? new Date(history.first_at) : null;
    const lastAt = history.last_at ? new Date(history.last_at) : null;

    // Evaluate per-variant throttle gate.
    const shouldEmit = checkThrottle({ variant, notifCount, firstAt, lastAt, now });
    if (!shouldEmit) continue;

    // Build notification body per variant.
    const body = buildBody(variant, row.petName, Math.abs(daysUntilDue), daysUntilDue);

    // Severity per variant.
    const severity =
      variant === "upcoming"
        ? ("info" as const)
        : variant === "due_soon"
          ? ("warning" as const)
          : ("urgent" as const); // overdue + overdue_critical

    // Route through the canonical write path. The dedupe key is scoped to the
    // reminder + the scan's day bucket: it does NOT suppress the legitimate
    // escalating cadence (a scan on a LATER day gets a new bucket → new key →
    // emits), but it DOES collapse two concurrent runs on the same day for the
    // same reminder into one row — closing the check-then-act throttle race
    // (review B.2) that the per-reminder history read + separate INSERT left
    // open. relatedEventId stays NULL (migration 0088 exemption still applies).
    const dayBucket = now.toISOString().slice(0, 10);
    const result = await createNotification(
      {
        userId: row.userId,
        notificationType: "vaccine_due",
        category: "health",
        title: row.title,
        body,
        severity,
        relatedPetId: row.petId,
        // relatedReminderId drives the throttle read above.
        relatedReminderId: row.reminderId,
        // 14.2 notice→action contract: deep-link directly to the vaccination
        // form so the owner can act in one tap. Canonical reminder-linked
        // target (flow audit 2026-07-03): the FULL form with reminderId, so
        // the vaccine name pre-fills and the reminder closes on submit.
        ctaLabel: "Registrar vacuna",
        ctaUrl: buildReminderVaccineUrl(row.publicToken, row.reminderId),
        dedupeKey: `vaccine:${row.reminderId}:${dayBucket}`,
      },
      dbInstance,
    );
    if (result.status === "inserted" && result.id) insertedNotificationIds.push(result.id);
  }

  return {
    scannedAt: now,
    insertedCount: insertedNotificationIds.length,
    insertedNotificationIds,
  };
}

// ---------------------------------------------------------------------------
// Throttle helpers
// ---------------------------------------------------------------------------

type ThrottleInput = {
  variant: ReturnType<typeof getReminderVariant>;
  notifCount: number;
  firstAt: Date | null;
  lastAt: Date | null;
  now: Date;
};

/**
 * Returns true when the throttle gate allows a new notification.
 *
 * Per-variant rules:
 *   upcoming        — emit if notifCount=0 OR lastAt < now - 7d.
 *   due_soon        — emit if notifCount=0.
 *                     Else if first notif < 3d ago  → require lastAt < now - 1d.
 *                     Else                          → require lastAt < now - 3d.
 *   overdue         — emit if notifCount=0.
 *                     Else if first notif < 14d ago → require lastAt < now - 1d.
 *                     Else                          → require lastAt < now - 7d.
 *   overdue_critical — emit if notifCount=0 OR lastAt < now - 1d.
 */
function checkThrottle({ variant, notifCount, firstAt, lastAt, now }: ThrottleInput): boolean {
  if (notifCount === 0) return true; // always emit on first notification

  // lastAt must be non-null when notifCount > 0, but guard defensively.
  if (!lastAt) return true;

  const msSinceLast = now.getTime() - lastAt.getTime();

  if (variant === "upcoming") {
    return msSinceLast >= 7 * MS_PER_DAY;
  }

  if (variant === "overdue_critical") {
    return msSinceLast >= MS_PER_DAY;
  }

  if (variant === "due_soon") {
    const msSinceFirst = firstAt ? now.getTime() - firstAt.getTime() : Number.POSITIVE_INFINITY;
    const minInterval = msSinceFirst < 3 * MS_PER_DAY ? MS_PER_DAY : 3 * MS_PER_DAY;
    return msSinceLast >= minInterval;
  }

  if (variant === "overdue") {
    const msSinceFirst = firstAt ? now.getTime() - firstAt.getTime() : Number.POSITIVE_INFINITY;
    const minInterval = msSinceFirst < 14 * MS_PER_DAY ? MS_PER_DAY : 7 * MS_PER_DAY;
    return msSinceLast >= minInterval;
  }

  // success variant — should never reach here (completedAt filters them out)
  return false;
}

// ---------------------------------------------------------------------------
// Body copy per variant
// ---------------------------------------------------------------------------

function buildBody(
  variant: ReturnType<typeof getReminderVariant>,
  petName: string,
  absDays: number,
  daysUntilDue: number,
): string {
  if (variant === "upcoming" || variant === "due_soon") {
    if (daysUntilDue <= 0) return `${petName} tiene una vacuna programada para hoy.`;
    if (daysUntilDue === 1) return `${petName} tiene una vacuna programada para mañana.`;
    return `${petName} tiene una vacuna programada en ${daysUntilDue} días.`;
  }
  if (variant === "overdue_critical") {
    if (absDays === 0) return `${petName} tiene una vacuna obligatoria programada para hoy.`;
    return `${petName} tiene una vacuna obligatoria vencida hace ${absDays} días.`;
  }
  // overdue
  if (absDays === 0) return `${petName} tiene una vacuna programada para hoy.`;
  return `${petName} tiene una vacuna vencida hace ${absDays} días.`;
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
  const proactiveWindowEnd = new Date(now.getTime() + 7 * MS_PER_DAY);
  const proactiveWindowStart = new Date(now.getTime() - MS_PER_DAY);
  const missedThreshold = new Date(now.getTime() - POST_ADOPTION_MISSED_GRACE_DAYS * MS_PER_DAY);

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
    const daysAhead = Math.round(dueMs / MS_PER_DAY);
    const body =
      daysAhead <= 0
        ? `Toca registrar el check-in post-adopción de ${row.petName}.`
        : daysAhead === 1
          ? `Mañana toca el check-in post-adopción de ${row.petName}.`
          : `En ${daysAhead} días toca el check-in post-adopción de ${row.petName}.`;
    // Canonical write path. dedupeKey is per-reminder (one proactive due
    // notification per reminder, ever) — matches the NOT EXISTS guard above and
    // adds dead-letter durability.
    const result = await createNotification(
      {
        userId: row.userId,
        notificationType: "post_adoption_checkin_due",
        title: row.title,
        body,
        severity: "info",
        relatedPetId: row.petId,
        relatedReminderId: row.reminderId,
        ctaLabel: "Hacer check-in",
        ctaUrl: `/mis-mascotas/${row.publicToken}/eventos/nuevo/checkin`,
        dedupeKey: `post-adoption-due:${row.reminderId}`,
      },
      dbInstance,
    );
    if (result.status === "inserted" && result.id) proactiveInsertedIds.push(result.id);
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

    const [orgRow] = await dbInstance
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // Canonical write path, one row per refugio admin. dedupeKey is
    // per-(reminder, admin) — matches the NOT EXISTS guard above and makes a
    // re-run idempotent. Low fan-out (org admins), so per-row is fine here.
    for (const a of admins) {
      const result = await createNotification(
        {
          userId: a.userId,
          notificationType: "post_adoption_checkin_missed",
          title: `Check-in pendiente: ${row.petName}`,
          body: `El adoptante de ${row.petName} no envió el seguimiento esperado. Considerá ponerte en contacto.`,
          severity: "warning",
          relatedPetId: row.petId,
          relatedReminderId: row.reminderId,
          ctaLabel: "Ver mascota",
          ctaUrl: orgRow ? `/org/${orgRow.publicToken}/mascotas` : "/org",
          dedupeKey: `post-adoption-missed:${row.reminderId}:${a.userId}`,
        },
        dbInstance,
      );
      if (result.status === "inserted" && result.id) missedInsertedIds.push(result.id);
    }
  }

  return {
    scannedAt: now,
    proactiveInsertedIds,
    missedInsertedIds,
  };
}
