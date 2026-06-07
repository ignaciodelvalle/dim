// EventsRepository — thin Drizzle wrapper for events domain writes + reads.
//
// Design decisions (from design artifact):
//   - All write methods accept an optional `executor` param (DbOrTx) to support
//     both top-level calls and participation in a db.transaction().
//   - Exposes BOTH insertEventIdempotent AND insertEvent (plain) — the asymmetry
//     is load-bearing. dangerousBreed + doseTaken + symptom-writer + outbreak_signal
//     + cascade events are intentionally PLAIN inserts.
//   - Projection write-through: updateWeightProjection, updateMicrochipBackfill
//     (only if null), updateStatusProjection, updateDeceased.
//   - Outbox enqueue delegates to lib/event-outbox-enqueue (reuse, not duplicate).
//   - Case ops via injected casesRepo — never import CasesRepository directly here.
//   - No auth logic — auth lives at the action / use-case edge.

import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { attachments, db, notifications, ownerships, petEvents, pets, reminders } from "@/db";
import type { NewPetEvent, PetEvent } from "@/db/schema";
import { insertEventIdempotent } from "@/lib/event-idempotency";
import { enqueueOutboxForEvent } from "@/lib/event-outbox-enqueue";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

export type EventsRepositoryPet = typeof pets.$inferSelect;

export type MicrochipBackfillInput = {
  microchipId: string;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
};

export type AttachmentInput = {
  petId: string;
  eventId: string;
  uploadedByUserId: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
};

export type ReminderInput = typeof reminders.$inferInsert;

// ---------------------------------------------------------------------------
// EventsRepository
// ---------------------------------------------------------------------------

export class EventsRepository {
  // ===========================================================================
  // Event writes
  // ===========================================================================

  /**
   * Insert an event with idempotency-key deduplication.
   * Returns { event, wasNoop } — callers check wasNoop to skip side-effects.
   */
  async insertEventIdempotent(
    values: NewPetEvent,
    executor: DbOrTx = db,
  ): Promise<{ event: PetEvent; wasNoop: boolean }> {
    return insertEventIdempotent(values, executor as Parameters<typeof insertEventIdempotent>[1]);
  }

  /**
   * Insert an event without idempotency (plain insert).
   * Used for non-idempotent events: dangerousBreed, doseTaken, cascade events,
   * outbreak_signal, symptom-writer path.
   */
  async insertEvent(values: NewPetEvent, executor: DbOrTx = db): Promise<PetEvent> {
    const [row] = await executor.insert(petEvents).values(values).returning();
    if (!row) throw new Error("EventsRepository.insertEvent: insert returned no rows");
    return row;
  }

  // ===========================================================================
  // Attachment + reminders
  // ===========================================================================

  /**
   * Insert an event attachment row.
   */
  async insertAttachment(input: AttachmentInput, executor: DbOrTx = db): Promise<void> {
    await executor.insert(attachments).values(input);
  }

  /**
   * Mark a reminder as completed (source reminder after event recorded).
   */
  async completeReminder(
    reminderId: string,
    petId: string,
    now: Date,
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(reminders)
      .set({ completedAt: now })
      .where(and(eq(reminders.id, reminderId), eq(reminders.petId, petId)));
  }

  /**
   * Insert one or more reminder rows (dose schedule, vaccine next-due, etc.).
   */
  async insertReminders(rows: ReminderInput[], executor: DbOrTx = db): Promise<void> {
    if (rows.length === 0) return;
    await executor.insert(reminders).values(rows);
  }

  /**
   * Cancel future incomplete reminders for a source medication event.
   * Past-due reminders are left as-is (they record missed doses).
   */
  async cancelFutureReminders(
    sourceEventId: string,
    now: Date,
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(reminders)
      .set({ completedAt: now })
      .where(
        and(
          eq(reminders.sourceEventId, sourceEventId),
          isNull(reminders.completedAt),
          gt(reminders.dueAt, now),
        ),
      );
  }

  /**
   * Find a specific reminder by ID, verifying it belongs to the given user.
   * Returns null when not found or not owned by the user.
   */
  async findReminderForUser(
    reminderId: string,
    userId: string,
  ): Promise<typeof reminders.$inferSelect | null> {
    const [row] = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  // ===========================================================================
  // Projection writes
  // ===========================================================================

  /**
   * Update pets.estimatedWeightKg (weight_recorded projection).
   */
  async updateWeightProjection(
    petId: string,
    kgStr: string,
    now: Date = new Date(),
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(pets)
      .set({ estimatedWeightKg: kgStr, updatedAt: now })
      .where(eq(pets.id, petId));
  }

  /**
   * Back-fill microchip columns — only when pets.microchipId is currently null.
   * Never overwrites existing chip data (spec invariant).
   */
  async updateMicrochipBackfill(
    petId: string,
    data: MicrochipBackfillInput,
    now: Date = new Date(),
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(pets)
      .set({
        microchipId: data.microchipId,
        microchipCountryCode: data.microchipCountryCode,
        microchipImplantedAt: data.microchipImplantedAt,
        microchipImplantedBy: data.microchipImplantedBy,
        microchipLocation: data.microchipLocation,
        updatedAt: now,
      })
      .where(and(eq(pets.id, petId), isNull(pets.microchipId)));
  }

  /**
   * Update pets.status (lost / active projection writes).
   * For deceased use updateDeceased which also sets deceasedAt.
   */
  async updateStatusProjection(
    petId: string,
    status: "lost" | "active" | "deceased",
    now: Date = new Date(),
    executor: DbOrTx = db,
  ): Promise<void> {
    if (status === "deceased") {
      await executor
        .update(pets)
        .set({ status: "deceased", deceasedAt: now, updatedAt: now })
        .where(eq(pets.id, petId));
    } else {
      await executor.update(pets).set({ status, updatedAt: now }).where(eq(pets.id, petId));
    }
  }

  /**
   * Update pets for the full lost-flip: status + 5 disclosure columns + optional identity.
   */
  async updatePetLostProjection(
    petId: string,
    update: {
      status: "lost";
      discloseFirstNameWhenLost: boolean;
      disclosePhoneWhenLost: boolean;
      discloseEmailWhenLost: boolean;
      discloseLastLocationWhenLost: boolean;
      allowFinderFormWhenLost: boolean;
      color?: string | null;
      distinguishingFeatures?: string | null;
    },
    now: Date = new Date(),
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(pets)
      .set({
        status: "lost",
        discloseFirstNameWhenLost: update.discloseFirstNameWhenLost,
        disclosePhoneWhenLost: update.disclosePhoneWhenLost,
        discloseEmailWhenLost: update.discloseEmailWhenLost,
        discloseLastLocationWhenLost: update.discloseLastLocationWhenLost,
        allowFinderFormWhenLost: update.allowFinderFormWhenLost,
        ...(update.color !== undefined ? { color: update.color ?? null } : {}),
        ...(update.distinguishingFeatures !== undefined
          ? { distinguishingFeatures: update.distinguishingFeatures ?? null }
          : {}),
        updatedAt: now,
      })
      .where(eq(pets.id, petId));
  }

  // ===========================================================================
  // Notification writes
  // ===========================================================================

  /**
   * Mark a ppp_registration_reminder notification as read for the given user+pet.
   */
  async markPppReminderRead(
    userId: string,
    petId: string,
    now: Date = new Date(),
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.relatedPetId, petId),
          eq(notifications.notificationType, "ppp_registration_reminder"),
          isNull(notifications.readAt),
        ),
      );
  }

  // ===========================================================================
  // Outbox enqueue
  // ===========================================================================

  /**
   * Enqueue zero or more outbox rows for the given event inside the same tx.
   * Delegates to lib/event-outbox-enqueue — no duplication.
   */
  async enqueueOutbox(
    executor: DbOrTx,
    event: { id: string; eventType: string; payload: Record<string, unknown> },
    pet: { jurisdictionProvince?: string | null; jurisdictionLocality?: string | null },
    now?: Date,
  ): Promise<void> {
    await enqueueOutboxForEvent(
      executor as Parameters<typeof enqueueOutboxForEvent>[0],
      event,
      pet,
      now,
    );
  }

  // ===========================================================================
  // Pet reads
  // ===========================================================================

  /**
   * Return the minimal alive-state snapshot for a pet.
   * Returns null when the pet does not exist.
   */
  async findPetAliveState(
    petId: string,
    executor: DbOrTx = db,
  ): Promise<{ id: string; status: string; rabiesObservationStatus: string | null } | null> {
    const [row] = await executor
      .select({
        id: pets.id,
        status: pets.status,
        rabiesObservationStatus: pets.rabiesObservationStatus,
      })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find the medication_started event for a given pet + eventId.
   * Used by createMedicationEnd to verify the FK guard.
   */
  async findSourceMedicationEvent(
    petId: string,
    eventId: string,
    executor: DbOrTx = db,
  ): Promise<{ id: string; eventType: string } | null> {
    const [row] = await executor
      .select({ id: petEvents.id, eventType: petEvents.eventType })
      .from(petEvents)
      .where(and(eq(petEvents.id, eventId), eq(petEvents.petId, petId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find the most recent rabies_observation_started event for a pet.
   * Used by death-record cascade C.
   */
  async findLatestRabiesObservationStarted(
    petId: string,
    executor: DbOrTx = db,
  ): Promise<PetEvent | null> {
    const [row] = await executor
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "rabies_observation_started")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find active foster ownerships for a pet.
   * Used by death-record cascade A.
   */
  async findActiveFosters(
    petId: string,
    executor: DbOrTx = db,
  ): Promise<Array<{ id: string; ownerUserId: string | null }>> {
    return executor
      .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .where(
        and(eq(ownerships.petId, petId), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
      );
  }

  /**
   * End a foster ownership row (set endedAt).
   */
  async endFoster(ownershipId: string, now: Date, executor: DbOrTx = db): Promise<void> {
    await executor.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, ownershipId));
  }
}
