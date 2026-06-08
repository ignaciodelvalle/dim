// Use-case: enqueue-eno-trigger (spec §F).
//
// Migrated from lib/eno-trigger.ts::processEnoEventTrigger.
// Enqueues a pet event into eno_processing_queue for async fanout.
//
// Called by events.ts (via lib/eno-trigger.ts shim — events.ts is NOT in scope).
// Auth: none (system, called post-event-insert from events.ts).
//
// Contract (spec §F):
//   - sub_kind must be 'disease_diagnosis'
//   - disease_code must resolve to an ENO catalog code (diseaseCodeToEnoCode → isEnoCode)
//   - onConflictDoNothing idempotency — unique index on pet_event_id
//   - NEVER throws — log + swallow so events.ts insertion is never blocked

import { diseaseCodeToEnoCode, isEnoCode } from "../domain/eno-catalog";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnoTriggerPetEvent = {
  id: string;
  petId: string;
  authorRole: string;
  recordedByUserId: string | null;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
};

type Deps = {
  repo: Pick<SurveillanceRepository, "insertEnoQueueRow">;
};

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

/**
 * Enqueues an ENO fanout for a clinical_info_logged disease_diagnosis event.
 *
 * Returns silently when:
 *   - payload is not a disease_diagnosis
 *   - disease_code is not in the ENO catalog
 *   - unique-constraint conflict (event already enqueued — no-op)
 *
 * Never throws — caller's try/catch in events.ts wraps for safety, but this
 * function itself swallows all errors to avoid blocking the event insert.
 */
export async function enqueueEnoTrigger(petEvent: EnoTriggerPetEvent, deps: Deps): Promise<void> {
  const payload = petEvent.payload;

  // Guard 1: must be a disease diagnosis event.
  if (payload.sub_kind !== "disease_diagnosis") return;

  // Guard 2: must have a string disease_code.
  const rawDiseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
  if (!rawDiseaseCode) return;

  // Guard 3: disease_code must resolve to an ENO catalog entry.
  const diseaseCode = diseaseCodeToEnoCode(rawDiseaseCode);
  if (!isEnoCode(diseaseCode)) return;

  // Idempotent insert — repo uses onConflictDoNothing(pet_event_id).
  try {
    await deps.repo.insertEnoQueueRow(petEvent.id);
  } catch (err) {
    // Enqueue must not block the event insert. Log + swallow.
    console.error("[enqueue-eno-trigger] enqueue failed (non-fatal):", err);
  }
}
