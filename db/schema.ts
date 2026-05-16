// DIM data model — see AGENTS.md for the design rationale behind every table here.
//
// Naming convention: tables are plural snake_case (`pet_events`), columns are
// snake_case in the DB but exposed as camelCase in TypeScript via the second
// argument to each column definition.
//
// Append-only discipline: `pet_events` rows are NEVER updated or deleted.
// Corrections are new events. This is enforced by convention here; the database
// will eventually enforce it via Row Level Security policies and triggers.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

// User's primary role at the application level. See AGENTS.md → "User roles".
// `owner` is the default for self-serve signup. `vet` and `govt` are
// admin-assigned (no public signup path in v1).
export const userRoleEnum = pgEnum("user_role", ["owner", "vet", "govt"]);

export const petSexEnum = pgEnum("pet_sex", ["male", "female", "unknown"]);

export const trainingLevelEnum = pgEnum("training_level", [
  "none",
  "basic",
  "intermediate",
  "advanced",
  "professional",
]);

// Notification severity drives the visual badge / color on the notifications
// list and any future bell-icon indicator. See AGENTS.md → "Notifications".
export const notificationSeverityEnum = pgEnum("notification_severity", [
  "info",
  "success",
  "warning",
  "urgent",
]);

export const petStatusEnum = pgEnum("pet_status", ["active", "lost", "deceased"]);

// Custody role. See AGENTS.md → Ownership for semantics.
// `owner`: permanent legal owner (person or org).
// `co_owner`: schema-ready, UI deferred.
// `shelter_custody`: temporary custody pending placement — used by refugios AND by
//   individual citizens who pick up strays (the vecino-helps-stray case).
// `foster`: temporary physical caregiver under an org's umbrella. Business rule
//   (not enforced at DB level): requires owner_user_id + active
//   organization_membership on the same org that holds the parallel shelter_custody row.
// `caretaker`: lower-stakes helper (petsitter, daycare). Schema-ready, UI deferred.
export const ownershipRoleEnum = pgEnum("ownership_role", [
  "owner",
  "co_owner",
  "shelter_custody",
  "foster",
  "caretaker",
]);

// Who authored an event.
// `owner` in v1 self-serve flows.
// `scanner` is for credential_scanned events when an anonymous or non-owner user
// loads the public credential page.
// `shelter` activates when refugios author events on pets they hold in custody.
// `vet`, `govt`, `system` activate in later phases.
export const authorRoleEnum = pgEnum("author_role", [
  "owner",
  "scanner",
  "vet",
  "shelter",
  "govt",
  "system",
]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "vaccine",
  "deworming",
  "medication",
  "appointment",
  "custom",
]);

// Welfare report enums — animal-cruelty / welfare denuncia system.
// Legal frame: Ley Nacional 14.346 (1954).

export const petAcquisitionMethodEnum = pgEnum("pet_acquisition_method", [
  "adopted",
  "purchased",
  "found_stray",
  "gift",
  "born_in_litter",
  "other",
]);

// Organization classification. Kept open like `event_type` so adding a new type
// is a one-line edit. See AGENTS.md → Organizations.
export const orgTypeEnum = pgEnum("org_type", [
  "clinic",
  "shelter",
  "rescue_network",
  "sanitary_authority",
  "other",
]);

export const orgStatusEnum = pgEnum("org_status", ["active", "suspended", "dissolved"]);

// Role within an organization. See AGENTS.md → OrganizationMembership.
// `can_write_pet_events` on the membership row gates author privileges
// independently from role — transportistas may have role=member with false,
// coordinators and vets typically true.
export const organizationMembershipRoleEnum = pgEnum("organization_membership_role", [
  "admin",
  "coordinator",
  "member",
  "volunteer",
  "foster",
  "vet_individual",
]);

export const welfareReportSubjectKindEnum = pgEnum("welfare_report_subject_kind", [
  "registered_pet",
  "unowned_animal",
  "location",
  "general",
]);

export const welfareReportKindEnum = pgEnum("welfare_report_kind", [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
]);

export const welfareReportSeverityEnum = pgEnum("welfare_report_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const welfareReportStatusEnum = pgEnum("welfare_report_status", [
  "open",
  "triaged",
  "in_progress",
  "closed",
  "duplicate",
  "invalid",
]);

// Event types are kept as TEXT (not an enum) so adding a new event type does
// not require a database migration. Validation happens in application code
// using the `EVENT_TYPES` const below.
export const EVENT_TYPES = [
  // Lifecycle
  "pet_registered",
  "pet_profile_updated",
  "status_changed",
  "death_recorded",
  // Preventive medicine
  "vaccination_administered",
  "deworming_administered",
  "sterilization_performed",
  // Medication
  "medication_started",
  "medication_stopped",
  // Clinical encounters and findings
  "vet_visit_logged",
  "lab_work_performed",
  "imaging_performed",
  "surgery_performed",
  "allergy_detected",
  // Body metrics
  "weight_recorded",
  // Identification & legal
  "microchip_implanted",
  "dangerous_breed_attested",
  // Free-form
  "note_added",
  // System / observed
  "credential_scanned",
  "incident_reported",
  // Medication adherence — dual-write with reminder.completedAt.
  "medication_dose_taken",
  // Schema-ready, UI deferred — these require a non-owner reporting flow:
  "symptom_observed",
  "abandonment_reported",
  "maltreatment_reported",
  // Unified clinical information event (collapses lab/imaging/surgery/allergy for v1 owner flow).
  "clinical_info_logged",
  // Custody & adoption — schema-ready, UI deferred. See AGENTS.md → Custody & adoption.
  "shelter_intake_recorded",
  "foster_assigned",
  "foster_ended",
  "adoption_application_submitted",
  "adoption_application_reviewed",
  "adoption_application_approved",
  "adoption_application_rejected",
  "adoption_finalized",
  "post_adoption_checkin",
  "adoption_revoked",
  "custody_transferred",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ============================================================================
// Profiles — application-level user record
// ============================================================================
// Supabase Auth manages `auth.users` (email, password, sessions). Our
// `profiles` table mirrors it: `profiles.id` equals `auth.users.id`. Anything
// app-specific (display name, phone, DNI for future Mi Argentina integration)
// lives here.

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    // Primary user role at the application level. Always `owner` for self-serve
    // signups; vet/govt accounts are admin-assigned. See AGENTS.md → User roles.
    role: userRoleEnum("role").notNull().default("owner"),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    // Mi Argentina-ready columns. Never required in v1.
    dniNumber: text("dni_number"),
    dniVerified: boolean("dni_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dniUnique: uniqueIndex("profiles_dni_unique_when_present")
      .on(table.dniNumber)
      .where(sql`${table.dniNumber} IS NOT NULL`),
  }),
);

// ============================================================================
// Pets — the credential itself
// ============================================================================

export const pets = pgTable(
  "pets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Short, URL-safe token rendered into the QR code and printed tags.
    // Format: e.g. "DIM-3K4F-9P2X". Generated in application code.
    publicToken: text("public_token").notNull().unique(),
    species: text("species").notNull(), // dog, cat, ...
    breed: text("breed"),
    name: text("name").notNull(),
    sex: petSexEnum("sex").notNull().default("unknown"),
    dateOfBirth: date("date_of_birth"),
    birthDateIsEstimated: boolean("birth_date_is_estimated").notNull().default(false),
    color: text("color"),
    distinguishingFeatures: text("distinguishing_features"),
    // Microchip — full implant record. The number lives on the pet for fast
    // lookup; the implant event is also recorded as a microchip_implanted
    // PetEvent for the timeline. Country code defaults to '858' (Argentina,
    // ISO 3166 numeric) — chip numbers in AR follow ISO 11784/11785 (15 digits).
    microchipId: text("microchip_id"),
    microchipCountryCode: text("microchip_country_code"),
    microchipImplantedAt: date("microchip_implanted_at"),
    microchipImplantedBy: text("microchip_implanted_by"),
    microchipLocation: text("microchip_location"), // e.g. "interscapular_left"
    // FK to attachments.id. NOT a hard FK at the DB level — circular reference
    // with attachments.pet_id. Application code keeps these in sync.
    primaryPhotoId: uuid("primary_photo_id"),
    status: petStatusEnum("status").notNull().default("active"),
    deceasedAt: timestamp("deceased_at", { withTimezone: true }),
    // Most recent reported weight. Updated on each weight_recorded event so we
    // don't need to scan the timeline to render the current weight on the
    // pet card. Source of truth is the events; this is a denormalized cache.
    estimatedWeightKg: numeric("estimated_weight_kg", { precision: 5, scale: 2 }),
    // Free-text arrays for owner-known facts about the pet. Predefined options
    // come from lib/lookups.ts but the columns accept anything the user types
    // into the "otros" field.
    favouriteFoods: text("favourite_foods").array(),
    knownAllergies: text("known_allergies").array(),
    // Training level — owner self-reported.
    trainingLevel: trainingLevelEnum("training_level"),
    // Computed at registration based on breed + species via lib/breeds.ts.
    // Captures "what the law said about this breed at the time of registration."
    // Driver of the dangerous_breed_attested flow (Ley CABA 4078, Ley Prov 14.107).
    potentiallyDangerousBreed: boolean("potentially_dangerous_breed").notNull().default(false),
    // Pet-insurance info — entirely optional, owner-provided.
    insuranceCompany: text("insurance_company"),
    insurancePolicyNumber: text("insurance_policy_number"),
    // Coarse administrative tagging for aggregation. Never precise coordinates.
    jurisdictionCountry: text("jurisdiction_country").notNull().default("AR"),
    jurisdictionProvince: text("jurisdiction_province"),
    jurisdictionLocality: text("jurisdiction_locality"),
    // How the owner came to have this pet. Nullable so existing rows survive db:push
    // without a default. Collected at registration and included in pet_registered payload.
    acquisitionMethod: petAcquisitionMethodEnum("acquisition_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    microchipUnique: uniqueIndex("pets_microchip_unique_when_present")
      .on(table.microchipId)
      .where(sql`${table.microchipId} IS NOT NULL`),
    jurisdictionIdx: index("pets_jurisdiction_idx").on(
      table.jurisdictionProvince,
      table.jurisdictionLocality,
    ),
    statusIdx: index("pets_status_idx").on(table.status),
  }),
);

// ============================================================================
// Organizations — peer to users (clinics, refugios, rescue networks, authorities)
// ============================================================================
// See AGENTS.md → Organizations. Verification is admin-stamped after document
// review (personería jurídica for refugios, matrícula for clinics, CUIT
// cross-check). Unverified orgs can use the system but their events write with
// author_verified=false, branding does not appear on public credentials, and
// they are excluded from broadcast-target queries.

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicToken: text("public_token").notNull().unique(),
    legalName: text("legal_name").notNull(),
    displayName: text("display_name").notNull(),
    orgType: orgTypeEnum("org_type").notNull(),
    cuit: text("cuit").unique(),
    personeriaJuridicaNumber: text("personeria_juridica_number"),
    email: text("email").notNull(),
    phone: text("phone"),
    website: text("website"),
    avatarUrl: text("avatar_url"),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByUserId: uuid("verified_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    tier0ShowBranding: boolean("tier_0_show_branding").notNull().default(false),
    jurisdictionCountry: text("jurisdiction_country").notNull().default("AR"),
    jurisdictionProvince: text("jurisdiction_province"),
    jurisdictionLocality: text("jurisdiction_locality"),
    status: orgStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    orgTypeIdx: index("organizations_org_type_idx").on(table.orgType),
    verifiedIdx: index("organizations_verified_idx").on(table.verified),
  }),
);

// Coverage zones for each org — used to target lost-pet broadcasts and to
// filter adoption listings by region. Multiple rows per org allowed.
export const organizationCoverage = pgTable(
  "organization_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jurisdictionCountry: text("jurisdiction_country").notNull().default("AR"),
    jurisdictionProvince: text("jurisdiction_province"),
    jurisdictionLocality: text("jurisdiction_locality"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index("organization_coverage_org_id_idx").on(table.organizationId),
    jurisdictionIdx: index("organization_coverage_jurisdiction_idx").on(
      table.jurisdictionProvince,
      table.jurisdictionLocality,
    ),
  }),
);

// People ↔ orgs link. One user can hold memberships across many orgs.
// `can_write_pet_events` gates author privileges independently of role.
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: organizationMembershipRoleEnum("role").notNull(),
    title: text("title"),
    canWritePetEvents: boolean("can_write_pet_events").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    invitedByUserId: uuid("invited_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    orgIdx: index("organization_memberships_org_id_idx").on(table.organizationId),
    userIdx: index("organization_memberships_user_id_idx").on(table.userId),
    activeIdx: index("organization_memberships_active_idx")
      .on(table.organizationId, table.userId)
      .where(sql`${table.leftAt} IS NULL`),
  }),
);

// ============================================================================
// Ownership — who holds custody of each pet, with history (polymorphic)
// ============================================================================
// Polymorphic holder: exactly one of (owner_user_id, owner_organization_id) is
// set per row, enforced via CHECK constraint. Ownership is the projection; the
// source of truth for transfers is always a custody_transferred or
// adoption_finalized event.
//
// Active-owner constraint: at most one active row per pet WHERE role='owner'.
// Multiple shelter_custody, foster, caretaker, or co_owner rows can coexist
// with an active owner, or with each other when there is no permanent owner yet.

export const ownerships = pgTable(
  "ownerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => profiles.id, { onDelete: "cascade" }),
    ownerOrganizationId: uuid("owner_organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    role: ownershipRoleEnum("role").notNull().default("owner"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Self-reference; not a hard FK to avoid migration ordering issues.
    transferredFromId: uuid("transferred_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    polymorphicHolder: check(
      "ownerships_polymorphic_holder",
      sql`((${table.ownerUserId} IS NOT NULL)::int + (${table.ownerOrganizationId} IS NOT NULL)::int) = 1`,
    ),
    oneActiveOwnerPerPet: uniqueIndex("ownerships_one_active_owner_per_pet")
      .on(table.petId)
      .where(sql`${table.role} = 'owner' AND ${table.endedAt} IS NULL`),
    ownerUserIdx: index("ownerships_owner_user_id_idx").on(table.ownerUserId),
    ownerOrgIdx: index("ownerships_owner_organization_id_idx").on(table.ownerOrganizationId),
  }),
);

// ============================================================================
// PetEvents — the append-only timeline (the spine)
// ============================================================================
// Every fact about a pet's life is a row here. Never edited, never deleted.
// Corrections are new rows that reference the original event in `payload`.

export const petEvents = pgTable(
  "pet_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // validated in app code against EVENT_TYPES
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    authorRole: authorRoleEnum("author_role").notNull().default("owner"),
    // Institutional actor when the author acted on behalf of an org (clinic vet,
    // refugio coordinator, sanitary-authority employee). Distinct from
    // recorded_by_user_id, which always names the individual person.
    authorOrganizationId: uuid("author_organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    authorVerified: boolean("author_verified").notNull().default(false),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    notes: text("notes"),
    // Location as (lat, lng) for v1. Migrate to PostGIS `geography(Point, 4326)`
    // when we add radius search / polygon-based projections. Drizzle has
    // customType support for it; lift-and-shift will be straightforward.
    locationLat: numeric("location_lat", { precision: 10, scale: 7 }),
    locationLng: numeric("location_lng", { precision: 10, scale: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    petTimelineIdx: index("pet_events_pet_id_occurred_at_idx").on(table.petId, table.occurredAt),
    eventTypeIdx: index("pet_events_event_type_idx").on(table.eventType),
    authorRoleIdx: index("pet_events_author_role_idx").on(table.authorRole),
    locationIdx: index("pet_events_location_idx").on(table.locationLat, table.locationLng),
  }),
);

// ============================================================================
// Reminders
// ============================================================================
// Most reminders are auto-generated from events (e.g. a vaccination event with
// `next_due_at` creates a reminder pointing back via `source_event_id`).
// Users can also create custom ones.

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    reminderType: reminderTypeEnum("reminder_type").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sourceEventId: uuid("source_event_id").references(() => petEvents.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userDueIdx: index("reminders_user_due_at_idx").on(table.userId, table.dueAt),
    petDueIdx: index("reminders_pet_due_at_idx").on(table.petId, table.dueAt),
  }),
);

// ============================================================================
// Attachments — uploaded files (photos of the pet, scans of paper booklets...)
// ============================================================================

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id").references(() => pets.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => petEvents.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(), // path inside the Supabase Storage bucket
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size"),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    petIdx: index("attachments_pet_id_idx").on(table.petId),
    eventIdx: index("attachments_event_id_idx").on(table.eventId),
  }),
);

// ============================================================================
// Inferred TypeScript types — use these in app code
// ============================================================================

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Pet = typeof pets.$inferSelect;
export type NewPet = typeof pets.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type OrganizationCoverage = typeof organizationCoverage.$inferSelect;
export type NewOrganizationCoverage = typeof organizationCoverage.$inferInsert;

export type OrganizationMembership = typeof organizationMemberships.$inferSelect;
export type NewOrganizationMembership = typeof organizationMemberships.$inferInsert;

export type Ownership = typeof ownerships.$inferSelect;
export type NewOwnership = typeof ownerships.$inferInsert;

export type PetEvent = typeof petEvents.$inferSelect;
export type NewPetEvent = typeof petEvents.$inferInsert;

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

// ============================================================================
// Notifications — per-user message history with read/archived state
// ============================================================================
// Distinct from PetEvents:
//   - Events are immutable facts about the world (the pet's life).
//   - Notifications are messages TO a user, with mutable state (read, archived).
// Notifications often *project from* events — e.g. registering a pet with a
// dangerous breed produces a `ppp_registration_reminder`. Some are pure
// system messages (welcome, app updates) with no source event.

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Free text (not enum) so adding a new notification type doesn't need a
    // migration. Validated in app code.
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    // Optional call-to-action button.
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    // Optional links back to the domain entities that triggered this.
    relatedPetId: uuid("related_pet_id").references(() => pets.id, { onDelete: "set null" }),
    relatedEventId: uuid("related_event_id").references(() => petEvents.id, {
      onDelete: "set null",
    }),
    // State.
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userUnreadIdx: index("notifications_user_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} IS NULL AND ${table.archivedAt} IS NULL`),
    userCreatedIdx: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ============================================================================
// WelfareReports — animal-cruelty / welfare denuncia (Ley 14.346)
// ============================================================================
// Separate domain from the pet-event catalog. Reporters can be logged-in or
// anonymous (reporter_user_id is null for anonymous submissions). The subject
// can be a registered DIM pet, an unowned animal (free text), or a
// location/situation. Workflow transitions (triage, close) are done via
// service role by welfare officers — admin UI deferred to a later slice.

export const welfareReports = pgTable(
  "welfare_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Short reference code for tracking — lets anonymous reporters retrieve
    // their own denuncia later without logging in. Format: DEN-XXXX-XXXX.
    // Generated at insert time with retry-on-collision (see lib/welfare-codes.ts).
    referenceCode: text("reference_code").notNull().unique(),

    // Reporter (null when anonymous)
    reporterUserId: uuid("reporter_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    reporterContactEmail: text("reporter_contact_email"),
    reporterContactPhone: text("reporter_contact_phone"),

    // What
    kind: welfareReportKindEnum("kind").notNull(),
    severity: welfareReportSeverityEnum("severity").notNull(),
    description: text("description").notNull(),

    // Subject
    subjectKind: welfareReportSubjectKindEnum("subject_kind").notNull(),
    subjectPetId: uuid("subject_pet_id").references(() => pets.id, {
      onDelete: "set null",
    }),
    subjectDescription: text("subject_description"),

    // Where
    locationAddress: text("location_address"),
    jurisdictionProvince: text("jurisdiction_province"),
    jurisdictionLocality: text("jurisdiction_locality"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),

    // When
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    // Workflow (admin/welfare-officer side comes later; default open)
    status: welfareReportStatusEnum("status").notNull().default("open"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    triagedByUserId: uuid("triaged_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
  },
  (table) => ({
    referenceCodeIdx: uniqueIndex("welfare_reports_reference_code_unique").on(table.referenceCode),
    reporterIdx: index("welfare_reports_reporter_idx").on(table.reporterUserId),
    statusIdx: index("welfare_reports_status_idx").on(table.status),
    subjectPetIdx: index("welfare_reports_subject_pet_idx").on(table.subjectPetId),
    jurisdictionIdx: index("welfare_reports_jurisdiction_idx").on(
      table.jurisdictionProvince,
      table.jurisdictionLocality,
    ),
    locationIdx: index("welfare_reports_location_idx").on(table.locationLat, table.locationLng),
  }),
);

export type WelfareReport = typeof welfareReports.$inferSelect;
export type NewWelfareReport = typeof welfareReports.$inferInsert;

// ============================================================================
// WelfareReportAttachments — evidence files for welfare denuncia submissions
// ============================================================================
// Separate from the generic `attachments` table: different RLS, different
// bucket (welfare-evidence), and a different lifecycle (anonymous-capable,
// report-scoped, no delete in v1).

export const welfareReportAttachments = pgTable(
  "welfare_report_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    welfareReportId: uuid("welfare_report_id")
      .notNull()
      .references(() => welfareReports.id, { onDelete: "cascade" }),
    // Uploaded-by is nullable for anonymous denuncia uploads.
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    originalFilename: text("original_filename"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index("welfare_report_attachments_report_idx").on(table.welfareReportId),
  }),
);

export type WelfareReportAttachment = typeof welfareReportAttachments.$inferSelect;
export type NewWelfareReportAttachment = typeof welfareReportAttachments.$inferInsert;
