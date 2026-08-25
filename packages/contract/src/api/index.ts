// `@dim/contract/api` — the wire shapes of the `/api/v1` surface.
//
// A native client imports the payload types and the error vocabulary from
// HERE, and the route handlers that produce them import the same names, so the
// two cannot drift into disagreement without a compile error in this repo.
//
// This entry point is TYPE-ONLY plus a handful of frozen literals and one
// three-line predicate over a regex (`isValidIdempotencyKey` — the format the
// write endpoint's header must have, which a client should be able to check
// before the round trip). It carries no zod schemas and therefore no runtime
// dependency: a consumer that
// only reads credentials never loads the validator that `@dim/contract/input`
// needs. `PetSex` is imported type-only from `../input/intake` so the sex
// vocabulary has exactly one definition in the package.
//
// AND IT IS RE-EXPORTED HERE (WU-C papercut, fixed in WU-B). `CredentialIdentitySection.sex`
// is typed `PetSex`, so every consumer that switches on a credential's sex needs
// the type — and until now the only place to get it was `@dim/contract/input`,
// which pulls in zod. A client that renders a credential and never validates a
// form was made to install a validator to name a type it already had in its
// hands. Re-exporting the TYPE costs nothing at runtime (types erase) and closes
// the gap: `@dim/contract/api` is now self-sufficient for reading a credential.
export type { PetSex } from "../input/intake";
export {
  ME_PAYLOAD_VERSION,
  ME_STALE_AFTER_MS,
  type AuthSessionV1,
  type LoginV1,
  type MeV1,
  type MeV1User,
  type SignupV1,
} from "./auth";
export { API_V1_ERROR_CODES, type ApiV1Error, type ApiV1ErrorCode } from "./errors";
export {
  LOCALITIES_PAYLOAD_VERSION,
  LOCALITIES_STALE_AFTER_MS,
  type LocalitiesV1,
  type LocalityV1,
} from "./localities";
export {
  IDEMPOTENCY_KEY_PATTERN,
  MY_PETS_PAYLOAD_VERSION,
  MY_PETS_STALE_AFTER_MS,
  isValidIdempotencyKey,
  type MyPetsV1,
  type MyPetsV1Item,
  type PetRegisteredV1,
} from "./pets";
export {
  PUBLIC_CREDENTIAL_PAYLOAD_VERSION,
  PUBLIC_CREDENTIAL_SITUATIONS,
  PUBLIC_CREDENTIAL_STALE_AFTER_MS,
  PUBLIC_PET_STATUSES,
  type CredentialIdentitySection,
  type CredentialLostLastSeen,
  type CredentialLostSection,
  type CredentialNoticesSection,
  type CredentialSection,
  type CredentialStatusSection,
  type CredentialTier2Section,
  type CredentialVaccinationSection,
  type PublicCredentialSituation,
  type PublicCredentialV1,
  type PublicCredentialV1Degraded,
  type PublicPetStatus,
  type RabiesProvenance,
  type RabiesVigencia,
  type VaccinationConfidenceTier,
} from "./public-credential";
