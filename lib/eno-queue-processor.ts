// ENO queue processor (handoff P4-6).
//
// Drains `eno_processing_queue` rows in status='pending' order by
// queued_at. For each row, runs the original v1 fanout logic (govt
// notifications + owner notification + audit log) and marks the row
// processed/failed.
//
// Called from /api/cron/process-eno-queue every hour. Per-row try/catch
// ensures one bad row doesn't poison the batch.

import { and, asc, eq, isNull, or } from "drizzle-orm";

import {
  auditLog,
  db,
  enoProcessingQueue,
  govtAssignments,
  notifications,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { diseaseCodeToEnoCode, getEnoDisease, isEnoCode } from "./eno-catalog";

const BATCH_SIZE = 50;

export type EnoBatchResult = {
  scannedAt: Date;
  processed: number;
  failed: number;
  skipped: number;
};

export async function processEnoQueueBatch(): Promise<EnoBatchResult> {
  const scannedAt = new Date();

  // Pick a batch of pending rows, oldest first. We don't lock; the
  // unique index on pet_event_id + the per-row status check make
  // concurrent processing safe (worst case: same row processed twice,
  // but the work is idempotent — notifications already dedupe by
  // (userId, relatedEventId) at the UX layer).
  const pending = await db
    .select({
      queueId: enoProcessingQueue.id,
      petEventId: enoProcessingQueue.petEventId,
      retryCount: enoProcessingQueue.retryCount,
    })
    .from(enoProcessingQueue)
    .where(eq(enoProcessingQueue.status, "pending"))
    .orderBy(asc(enoProcessingQueue.queuedAt))
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    try {
      const handled = await processOne(row.petEventId);
      if (handled) {
        await db
          .update(enoProcessingQueue)
          .set({ status: "processed", processedAt: new Date() })
          .where(eq(enoProcessingQueue.id, row.queueId));
        processed += 1;
      } else {
        // No-op cases (event row deleted, payload missing) — close out
        // as processed so we don't retry forever.
        await db
          .update(enoProcessingQueue)
          .set({
            status: "processed",
            processedAt: new Date(),
            lastError: "skipped: event row not found or not eligible",
          })
          .where(eq(enoProcessingQueue.id, row.queueId));
        skipped += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      await db
        .update(enoProcessingQueue)
        .set({
          // Three strikes: mark failed so the cron stops picking it up.
          status: row.retryCount >= 2 ? "failed" : "pending",
          retryCount: row.retryCount + 1,
          lastError: message,
        })
        .where(eq(enoProcessingQueue.id, row.queueId));
      failed += 1;
    }
  }

  return { scannedAt, processed, failed, skipped };
}

/**
 * Returns true when the fanout was performed, false when the event
 * row is missing or no longer eligible (e.g. payload changed shape —
 * shouldn't happen for an immutable log, defensive belt-and-suspenders).
 */
async function processOne(petEventId: string): Promise<boolean> {
  const [eventRow] = await db
    .select({
      id: petEvents.id,
      petId: petEvents.petId,
      authorRole: petEvents.authorRole,
      recordedByUserId: petEvents.recordedByUserId,
      authorOrganizationId: petEvents.authorOrganizationId,
      payload: petEvents.payload,
    })
    .from(petEvents)
    .where(eq(petEvents.id, petEventId))
    .limit(1);
  if (!eventRow) return false;

  const payload = eventRow.payload as Record<string, unknown>;
  if (payload.sub_kind !== "disease_diagnosis") return false;

  const rawDiseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
  if (!rawDiseaseCode) return false;

  const diseaseCode = diseaseCodeToEnoCode(rawDiseaseCode);
  if (!isEnoCode(diseaseCode)) return false;
  const disease = getEnoDisease(diseaseCode);
  if (!disease) return false;

  const diagnosisDate =
    typeof payload.diagnosis_date === "string" ? payload.diagnosis_date : new Date().toISOString();

  const [petRow] = await db.select().from(pets).where(eq(pets.id, eventRow.petId)).limit(1);
  if (!petRow) return false;

  // Owner lookup
  const [ownershipRow] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, eventRow.petId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  const ownerUserId = ownershipRow?.ownerUserId ?? null;

  let ownerDisplayName: string | null = null;
  let ownerPhone: string | null = null;
  if (ownerUserId) {
    const [ownerProfile] = await db
      .select({ displayName: profiles.displayName, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, ownerUserId))
      .limit(1);
    ownerDisplayName = ownerProfile?.displayName ?? null;
    ownerPhone = ownerProfile?.phone ?? null;
  }

  const vetUserId = eventRow.recordedByUserId;
  const vetOrgId = eventRow.authorOrganizationId;

  const province = petRow.jurisdictionProvince ?? "";
  const locality = petRow.jurisdictionLocality ?? "";

  const targets = await db
    .select({ userId: govtAssignments.userId })
    .from(govtAssignments)
    .where(
      and(
        eq(govtAssignments.jurisdictionProvince, province),
        isNull(govtAssignments.revokedAt),
        or(
          eq(govtAssignments.jurisdictionLocality, locality),
          eq(govtAssignments.jurisdictionLocality, ""),
        ),
      ),
    );

  const targetsCount = targets.length;

  if (targetsCount > 0) {
    await db.insert(notifications).values(
      targets.map((t) => ({
        userId: t.userId,
        notificationType: "eno_disease_diagnosis",
        title: `ENO: ${disease.label} — ${petRow.name}`,
        body: `Diagnóstico de ${disease.label} reportado en ${
          petRow.jurisdictionLocality ??
          petRow.jurisdictionProvince ??
          "jurisdicción no especificada"
        }. SLA: ${disease.notifyHours}h.`,
        severity: disease.severity === "critical" ? ("urgent" as const) : ("warning" as const),
        relatedPetId: petRow.id,
        relatedEventId: eventRow.id,
        category: "health",
      })),
    );
  }

  const ownerWasNotified = !disease.stigmaSensitive && ownerUserId !== null;
  if (ownerWasNotified && ownerUserId) {
    await db.insert(notifications).values({
      userId: ownerUserId,
      notificationType: "eno_pet_disease_diagnosis",
      title: `Tu mascota ${petRow.name}: ${disease.label}`,
      body: `El veterinario registró un diagnóstico de ${disease.label} para ${petRow.name}. Consultá con tu veterinario para los próximos pasos.`,
      severity: disease.severity === "critical" ? ("urgent" as const) : ("warning" as const),
      relatedPetId: petRow.id,
      relatedEventId: eventRow.id,
      category: "health",
    });
  }

  if (vetUserId) {
    await db.insert(auditLog).values({
      actorUserId: vetUserId,
      action: "eno_notification_emitted",
      payload: {
        disease_code: diseaseCode,
        disease_severity: disease.severity,
        pet_id: petRow.id,
        targets_count: targetsCount,
        owner_was_notified: ownerWasNotified,
        legal_anchor: disease.legalAnchor,
        diagnosis_date: diagnosisDate,
        vet_org_id: vetOrgId,
      },
    });
  }

  return true;
}
