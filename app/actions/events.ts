// ---------------------------------------------------------------------------
// Re-export barrel — NOT a "use server" file. The 17 re-exported actions keep
// their own "use server" directive in src/modules/events/actions.ts.
// A "use server" file may only export locally-declared async functions, so this
// barrel (which re-exports bindings + constants) must not carry the directive.
//
// Strangler shim — WU-7 (hexagonal-lite-events)
//
// All server actions are re-exported directly from @/src/modules/events/actions.
// Domain constants are re-exported from their real source module so this barrel
// stays free of server-only imports and Client Components can import them safely.
//
// Integration-test writer wrappers (recordDiseaseDiagnosisWriter,
// createSymptomObservedWriter, setPetLostWriter) have moved to:
//   src/modules/events/application/writers.ts
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
} from "@/src/modules/events/actions";

// Domain constants — re-exported from their real source so this barrel stays
// free of server-only imports and Client Components can import them safely.
export {
  DEATH_CAUSES,
  DISPOSITION_METHODS,
  VET_CONTACT_VALUES,
} from "@/src/modules/events/domain/death-rules";
