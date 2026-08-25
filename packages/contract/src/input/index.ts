// `@dim/contract/input` — what a CLIENT is allowed to send.
//
// The rest of the package describes the domain (event vocabulary) and how to
// draw it (visualization scales). This entry point describes the other
// direction: the shape of a write request, before any domain resolution runs.
// It is the reason the package takes its one dependency, zod — see the note in
// scripts/check-contract-purity.ts.
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
} from "./auth";
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
} from "./intake";
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
} from "./register-pet";
