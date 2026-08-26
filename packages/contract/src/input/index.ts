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
  DISCLOSURE_KEYS,
  LOST_COMMAND_INPUT_CODES,
  LOST_DISCLOSURE_KEYS,
  TITULAR_ONLY_DISCLOSURE_KEYS,
  type DisclosureKey,
  type LostCommand,
  type LostCommandInput,
  type LostCommandInputCode,
  type LostDisclosureKey,
  type TitularOnlyDisclosureKey,
  firstLostCommandInputCode,
  lostCommandInputSchema,
} from "./lost-mode.ts";
export {
  LIBRETA_SHARE_EXPIRY_DAYS,
  LIBRETA_SHARE_LABEL_MAX,
  MAX_ACTIVE_LIBRETA_SHARES,
  SHARE_COMMAND_INPUT_CODES,
  TIER2_WINDOWS,
  type LibretaShareExpiryDays,
  type ShareCommand,
  type ShareCommandInput,
  type ShareCommandInputCode,
  type Tier2Window,
  firstShareCommandInputCode,
  shareCommandInputSchema,
} from "./share.ts";
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
  SYMPTOM_SEVERITIES,
  type ClinicalSubKind,
  type DewormingType,
  type MedicationFrequency,
  type NoteCategory,
  type RecordEventInput,
  type RecordEventInputCode,
  type RecordEventKind,
  type SterilizationProcedure,
  type SymptomSeverity,
  firstRecordEventInputCode,
  recordEventInputSchema,
} from "./record-event.ts";
export {
  OWNER_TRANSFER_REASONS,
  TRANSFER_COMMAND_INPUT_CODES,
  TRANSFER_EXPIRY_DAYS,
  TRANSFER_NOTE_MAX,
  type OwnerTransferReason,
  type TransferCommand,
  type TransferCommandInput,
  type TransferCommandInputCode,
  firstTransferCommandInputCode,
  transferCommandInputSchema,
} from "./transfer.ts";
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
