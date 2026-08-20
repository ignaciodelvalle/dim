// `@dim/contract/input` — what a CLIENT is allowed to send.
//
// The rest of the package describes the domain (event vocabulary) and how to
// draw it (visualization scales). This entry point describes the other
// direction: the shape of a write request, before any domain resolution runs.
// It is the reason the package takes its one dependency, zod — see the note in
// scripts/check-contract-purity.ts.
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
