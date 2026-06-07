"use server";

// ---------------------------------------------------------------------------
// Strangler shim — WU-7 (hexagonal-lite-events)
//
// All server actions are re-exported directly from @/src/modules/events/actions.
// The three inner writers that integration tests import with a 1-argument API
// are wrapped here so callers don't need to supply deps.
//
// DO NOT add new logic here. Any new event action belongs in:
//   src/modules/events/actions.ts  (action)
//   src/modules/events/application/<domain>/<use-case>.ts  (writer / use-case)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Re-export: all action functions + types
// ---------------------------------------------------------------------------

export type {
  EventFormState,
  SymptomFormState,
  // writer params / result types that consumers import from here
  DisclosurePrefsInput,
  EnrichedLostDescriptionInput,
} from "@/src/modules/events/actions";

export type {
  RecordDiseaseDiagnosisWriterInput as RecordDiseaseDiagnosisWriterParams,
  RecordDiseaseDiagnosisWriterResult,
} from "@/src/modules/events/application/clinical/record-disease-diagnosis-use-case";

export type { CreateSymptomObservedWriterParams as SymptomObservedWriterParams } from "@/src/modules/events/application/surveillance/symptom-observed-use-case";

export {
  createVaccinationAction,
  createWeightAction,
  createDewormingAction,
  createSterilizationAction,
  createMedicationStartAction,
  createMedicationEndAction,
  markMedicationDoseTakenAction,
  createMicrochipAction,
  createDangerousBreedAttestationAction,
  createNoteAction,
  createVetVisitAction,
  createClinicalInfoAction,
  recordDiseaseDiagnosisAction,
  createSymptomObservedAction,
  setPetLostAction,
  setPetFoundAction,
  createDeathRecordAction,
  // domain constants (also re-exported by the module)
  DEATH_CAUSES,
  DISPOSITION_METHODS,
  VET_CONTACT_VALUES,
} from "@/src/modules/events/actions";

// ---------------------------------------------------------------------------
// Backwards-compatible 1-arg writer wrappers
//
// The module use-cases take (params, deps). Integration tests and any caller
// that imports the writers directly use the original 1-arg API where deps were
// hard-coded to use `db` + `EventsRepository` directly. These wrappers fill in
// deps automatically so existing callers remain unmodified.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { notifications } from "@/db";
import { recordDiseaseDiagnosisWriter as _recordDiseaseDiagnosisWriter } from "@/src/modules/events/application/clinical/record-disease-diagnosis-use-case";
import type { RecordDiseaseDiagnosisWriterInput as RecordDiseaseDiagnosisWriterParams } from "@/src/modules/events/application/clinical/record-disease-diagnosis-use-case";
import { setPetLostWriter as _setPetLostWriter } from "@/src/modules/events/application/lifecycle/set-pet-lost-use-case";
import type { SetPetLostWriterParams } from "@/src/modules/events/application/lifecycle/set-pet-lost-use-case";
import { createSymptomObservedWriter as _createSymptomObservedWriter } from "@/src/modules/events/application/surveillance/symptom-observed-use-case";
import type { CreateSymptomObservedWriterParams } from "@/src/modules/events/application/surveillance/symptom-observed-use-case";
import { EventsRepository } from "@/src/modules/events/infrastructure/events-repository";

function makeTransaction(): <T>(cb: (tx: unknown) => Promise<T>) => Promise<T> {
  return <T>(cb: (tx: unknown) => Promise<T>) =>
    db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>;
}

async function flushNotifications(
  pending: import("@/src/modules/events/application/types").NewNotification[],
): Promise<void> {
  if (pending.length === 0) return;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: NewNotification is structurally compatible with notifications.$inferInsert
    await db.insert(notifications).values(pending as any[]);
  } catch (e) {
    console.error("notifications insert failed (writer succeeded)", e);
  }
}

/**
 * Backwards-compatible 1-arg wrapper for recordDiseaseDiagnosisWriter.
 * Integration tests call this with one argument; deps are filled automatically.
 */
export async function recordDiseaseDiagnosisWriter(params: RecordDiseaseDiagnosisWriterParams) {
  const repo = new EventsRepository();
  return _recordDiseaseDiagnosisWriter(params, {
    repo,
    transaction: makeTransaction(),
    flushNotifications,
  });
}

/**
 * Backwards-compatible 1-arg wrapper for createSymptomObservedWriter.
 * Integration tests call this with one argument; deps are filled automatically.
 * Note: rabiesObservationStatus defaults to null when not supplied.
 */
export async function createSymptomObservedWriter(
  params: Omit<CreateSymptomObservedWriterParams, "rabiesObservationStatus"> & {
    rabiesObservationStatus?: string | null;
  },
) {
  const repo = new EventsRepository();
  return _createSymptomObservedWriter(
    { ...params, rabiesObservationStatus: params.rabiesObservationStatus ?? null },
    {
      repo,
      transaction: makeTransaction(),
      flushNotifications,
    },
  );
}

/**
 * Backwards-compatible 1-arg wrapper for setPetLostWriter.
 * Integration tests call this with one argument; deps are filled automatically.
 */
export async function setPetLostWriter(params: SetPetLostWriterParams) {
  const repo = new EventsRepository();
  const { broadcastLostPet } = await import("@/lib/lost-pet-broadcast");
  return _setPetLostWriter(params, {
    repo,
    transaction: makeTransaction(),
    broadcastLostPet: broadcastLostPet as Parameters<
      typeof _setPetLostWriter
    >[1]["broadcastLostPet"],
  });
}
