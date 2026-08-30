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
export type { PetSex } from "../input/intake.ts";
export {
  ME_PAYLOAD_VERSION,
  ME_STALE_AFTER_MS,
  type AuthSessionV1,
  type LoginV1,
  type MeV1,
  type MeV1User,
  type PasswordResetRequestedV1,
  type SignupV1,
} from "./auth.ts";
export { API_V1_ERROR_CODES, type ApiV1Error, type ApiV1ErrorCode } from "./errors.ts";
export {
  OWNER_PET_ALERT_IDS,
  OWNER_PET_DETAIL_PAYLOAD_VERSION,
  OWNER_PET_DETAIL_STALE_AFTER_MS,
  OWNER_PET_DETAIL_VIEWER_ROLES,
  type OwnerPetAlertId,
  type OwnerPetAlertTone,
  type OwnerPetAlertV1,
  type OwnerPetAlertsSection,
  type OwnerPetBannersSection,
  type OwnerPetCarouselItemV1,
  type OwnerPetCarouselSection,
  type OwnerPetCaretakerBannerV1,
  type OwnerPetCasesSection,
  type OwnerPetComplianceSection,
  type OwnerPetComplianceTone,
  type OwnerPetDetailV1,
  type OwnerPetDetailViewer,
  type OwnerPetDetailViewerRole,
  type OwnerPetIdentitySection,
  type OwnerPetMemorialV1,
  type OwnerPetObligationCardV1,
  type OwnerPetPregnancySection,
  type OwnerPetPregnancyV1,
  type OwnerPetRehomeBannerV1,
  type OwnerPetReminderV1,
  type OwnerPetRemindersSection,
  type OwnerPetSituationV1,
  type OwnerPetStatusSection,
  type OwnerPetTagV1,
  type OwnerPetTransitBannerV1,
} from "./owner-pet-detail.ts";
export {
  EVENT_ATTACHMENT_LINK_TTL_SECONDS,
  PET_EVENT_DETAIL_PAYLOAD_VERSION,
  PET_EVENT_DETAIL_STALE_AFTER_MS,
  type EventAmendAffordanceV1,
  type EventAmendedV1,
  type EventAmendmentV1,
  type EventAttachmentV1,
  type EventAuthorV1,
  type EventFactV1,
  type EventLocationV1,
  type EventRecordedV1,
  type PetEventDetailV1,
} from "./pet-event-detail.ts";
export {
  PET_LIBRETA_PAYLOAD_VERSION,
  PET_LIBRETA_STALE_AFTER_MS,
  PET_LIBRETA_TIMELINE_WINDOW,
  type LibretaEntryV1,
  type LibretaFactV1,
  type LibretaIdentitySection,
  type LibretaProvenanceV1,
  type LibretaTimelineSection,
  type LibretaUpcomingItemV1,
  type LibretaUpcomingSection,
  type LibretaVaccinationSection,
  type LibretaVaccineV1,
  type LibretaViewer,
  type PetLibretaV1,
} from "./pet-libreta.ts";
export {
  PET_LOST_PAYLOAD_VERSION,
  PET_LOST_STALE_AFTER_MS,
  type LostCapabilitiesV1,
  type LostCommandAckV1,
  type LostDisclosureV1,
  type LostEpisodeV1,
  type LostFeedItemV1,
  type LostFeedSectionV1,
  type LostPetStatus,
  type PetLostV1,
} from "./pet-lost.ts";
export type { PetPhotoTicketV1, PetPhotoUpdatedV1 } from "./pet-photo.ts";
export {
  PET_SHARES_PAYLOAD_VERSION,
  PET_SHARES_STALE_AFTER_MS,
  type LibretaShareV1,
  type PetSharesV1,
  type ShareCapabilitiesV1,
  type ShareCommandAckV1,
  type Tier2StateV1,
} from "./pet-shares.ts";
export {
  MY_TRANSFERS_PAYLOAD_VERSION,
  MY_TRANSFERS_STALE_AFTER_MS,
  PET_TRANSFER_STATUSES_V1,
  type MyTransferV1,
  type MyTransfersV1,
  type PetTransferStatusV1,
  type TransferCapabilitiesV1,
  type TransferCommandAckV1,
  type TransferPetV1,
} from "./my-transfers.ts";
export {
  MY_NOTIFICATIONS_PAGE_LIMIT,
  MY_NOTIFICATIONS_PAYLOAD_VERSION,
  MY_NOTIFICATIONS_STALE_AFTER_MS,
  NOTIFICATION_CATEGORIES_V1,
  NOTIFICATION_COMMANDS_V1,
  type MyNotificationV1,
  type MyNotificationsV1,
  type NotificationCategoryCountV1,
  type NotificationCategoryV1,
  type NotificationCommandAckV1,
  type NotificationCommandV1,
  type NotificationCtaV1,
  type NotificationPetV1,
} from "./my-notifications.ts";
export {
  MY_PRIVACY_PAYLOAD_VERSION,
  MY_PRIVACY_STALE_AFTER_MS,
  type MySubjectDataExportV1,
  type SubjectDataErasedV1,
} from "./my-privacy.ts";
export {
  MY_PROFILE_PAYLOAD_VERSION,
  MY_PROFILE_STALE_AFTER_MS,
  type MyProfileUpdatedV1,
  type MyProfileV1,
} from "./my-profile.ts";
export {
  APPOINTMENT_SECTIONS_V1,
  APPOINTMENT_STATUSES_V1,
  MY_APPOINTMENTS_PAYLOAD_VERSION,
  MY_APPOINTMENTS_STALE_AFTER_MS,
  type AppointmentCapabilitiesV1,
  type AppointmentCommandAckV1,
  type AppointmentPetV1,
  type AppointmentProviderV1,
  type AppointmentSectionV1,
  type AppointmentStatusV1,
  type MyAppointmentV1,
  type MyAppointmentsV1,
} from "./my-appointments.ts";
export {
  CARETAKER_GRANT_STATUSES_V1,
  MY_CARETAKER_GRANTS_PAYLOAD_VERSION,
  MY_CARETAKER_GRANTS_STALE_AFTER_MS,
  type CaretakerCommandAckV1,
  type CaretakerGrantCapabilitiesV1,
  type CaretakerGrantPetV1,
  type CaretakerGrantStatusV1,
  type MyCaretakerGrantV1,
  type MyCaretakerGrantsV1,
} from "./my-caretaker-grants.ts";
export {
  LOCALITIES_PAYLOAD_VERSION,
  LOCALITIES_STALE_AFTER_MS,
  type LocalitiesV1,
  type LocalityV1,
} from "./localities.ts";
export {
  IDEMPOTENCY_KEY_PATTERN,
  MY_PETS_PAYLOAD_VERSION,
  MY_PETS_STALE_AFTER_MS,
  isValidIdempotencyKey,
  type MyPetsV1,
  type MyPetsV1Item,
  type PetRegisteredV1,
} from "./pets.ts";
export {
  PET_PROFILE_EDIT_PAYLOAD_VERSION,
  PET_PROFILE_EDIT_STALE_AFTER_MS,
  type PetEmergencyAccountDefaultV1,
  type PetEmergencyDraftV1,
  type PetIdentityDraftV1,
  type PetProfileEditAckV1,
  type PetProfileEditCapabilitiesV1,
  type PetProfileEditV1,
} from "./pet-profile-edit.ts";
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
} from "./public-credential.ts";
