// ENO trigger — processEnoEventTrigger (v2 — handoff P4-6).
//
// Invoked from app/actions/events.ts after a `clinical_info_logged`
// event with sub_kind='disease_diagnosis' is inserted by a vet.
//
// v1 did the full fanout synchronously: govt notification inserts +
// owner notification + audit log. The event-insert action paid that
// latency on the request path, and a failure mid-fanout left partial
// state.
//
// v2 enqueues into `eno_processing_queue` and returns immediately.
// The hourly cron worker at /api/cron/process-eno-queue drains the
// queue, runs the fanout from lib/eno-queue-processor, and marks rows
// processed/failed. Failure cases retry on the next cron tick.
//
// Spec: docs/superpowers/specs/2026-05-21-eno-pipeline-design.md
// Decisions ENO-D2..D5 unchanged — they live in the queue processor.

import { db, enoProcessingQueue } from "@/db";
import { diseaseCodeToEnoCode, isEnoCode } from "./eno-catalog";

type PetEventRow = {
  id: string;
  petId: string;
  authorRole: string;
  recordedByUserId: string | null;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
};

/**
 * Enqueues an ENO fanout for a clinical_info_logged disease_diagnosis
 * event. Returns silently on:
 *   - payload not a disease diagnosis
 *   - disease_code not in the ENO catalog
 *   - unique-constraint conflict (event already enqueued)
 *
 * Never throws — caller's try/catch in events.ts still wraps for safety.
 */
export async function processEnoEventTrigger(petEvent: PetEventRow): Promise<void> {
  const payload = petEvent.payload;
  if (payload.sub_kind !== "disease_diagnosis") return;

  const rawDiseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
  if (!rawDiseaseCode) return;

  const diseaseCode = diseaseCodeToEnoCode(rawDiseaseCode);
  if (!isEnoCode(diseaseCode)) return;

  // Idempotent insert — the unique index on pet_event_id silently
  // ignores the second enqueue if the event triggers twice.
  try {
    await db
      .insert(enoProcessingQueue)
      .values({ petEventId: petEvent.id, status: "pending" })
      .onConflictDoNothing({ target: enoProcessingQueue.petEventId });
  } catch (err) {
    // Enqueue must not block the event insert. Log + swallow.
    console.error("[eno-trigger] enqueue failed (non-fatal):", err);
  }
}
