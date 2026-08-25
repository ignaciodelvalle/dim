// `@dim/contract/api` — the wire shapes of the `/api/v1` surface.
//
// A native client imports the payload types and the error vocabulary from
// HERE, and the route handlers that produce them import the same names, so the
// two cannot drift into disagreement without a compile error in this repo.
//
// This entry point is TYPE-ONLY plus a handful of frozen literal arrays. It
// carries no zod schemas and therefore no runtime dependency: a consumer that
// only reads credentials never loads the validator that `@dim/contract/input`
// needs. `PetSex` is imported type-only from `../input/intake` so the sex
// vocabulary has exactly one definition in the package.
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
