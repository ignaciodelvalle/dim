// `@dim/contract/input` — what a CLIENT is allowed to send.
//
// The rest of the package describes the domain (event vocabulary) and how to
// draw it (visualization scales). This entry point describes the other
// direction: the shape of a write request, before any domain resolution runs.
// It is the reason the package takes its one dependency, zod — see the note in
// scripts/check-contract-purity.ts.
export {
  AMEND_EVENT_INPUT_CODES,
  AMEND_REASON_MIN_LENGTH,
  NON_AMENDABLE_PAYLOAD_KEYS,
  type AmendEventInput,
  type AmendEventInputCode,
  amendEventInputSchema,
  firstAmendEventInputCode,
} from "./amend-event.ts";
export {
  LOGIN_INPUT_CODES,
  MIN_PASSWORD_LENGTH,
  SIGNUP_INPUT_CODES,
  type LoginInput,
  type LoginInputCode,
  type SignupInput,
  type SignupInputCode,
  firstInputCode,
  loginInputSchema,
  signupInputSchema,
} from "./auth.ts";
export {
  CREATE_INTAKE_INPUT_CODES,
  CUSTODY_ROLES,
  type CreateIntakeInput,
  type CreateIntakeInputCode,
  type CustodyRole,
  INTAKE_REASONS,
  type IntakeReason,
  PET_SEXES,
  type PetSex,
  createIntakeInputSchema,
  firstIntakeInputCode,
} from "./intake.ts";
export {
  CLINICAL_SUB_KINDS,
  DEWORMING_TYPES,
  MAX_CUSTOM_HOURS,
  MAX_DURATION_DAYS,
  MAX_WEIGHT_KG,
  MEDICATION_FREQUENCIES,
  MIN_CUSTOM_HOURS,
  MIN_DURATION_DAYS,
  NOTE_CATEGORIES,
  RECORD_EVENT_INPUT_CODES,
  STERILIZATION_PROCEDURES,
  type ClinicalSubKind,
  type DewormingType,
  type MedicationFrequency,
  type NoteCategory,
  type RecordEventInput,
  type RecordEventInputCode,
  type RecordEventKind,
  type SterilizationProcedure,
  firstRecordEventInputCode,
  recordEventInputSchema,
} from "./record-event.ts";
export {
  ACQUISITION_METHODS,
  MAX_PET_AGE_MONTHS,
  MAX_PET_AGE_YEARS,
  PET_SPECIES,
  REGISTER_PET_INPUT_CODES,
  type AcquisitionMethod,
  type PetSpecies,
  type RegisterPetInput,
  type RegisterPetInputCode,
  firstRegisterPetInputCode,
  registerPetInputSchema,
} from "./register-pet.ts";
