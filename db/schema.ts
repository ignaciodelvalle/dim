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
  date,
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

export const ownershipRoleEnum = pgEnum("ownership_role", ["owner", "co_owner", "caretaker"]);

// Who authored an event. Always `owner` in v1 (only owners write events).
// `scanner` is for the credential_scanned event when an anonymous or
// non-owner user loads the public credential page.
// `vet`, `govt`, `system` activate in later phases.
export const authorRoleEnum = pgEnum("author_role", ["owner", "scanner", "vet", "govt", "system"]);

export const reminderTypeEnum = pgEnum("reminder_type", [
  "vaccine",
  "deworming",
  "medication",
  "appointment",
  "custom",
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
  // Schema-ready, UI deferred — these require a non-owner reporting flow:
  "symptom_observed",
  "abandonment_reported",
  "maltreatment_reported",
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
// Ownership — who owns or owned each pet, with history
// ============================================================================
// At most one row per pet has `ended_at IS NULL` (= the current owner).
// Enforced by the partial unique index below. Multiple rows in history are
// fine — transfers add a new row and set the previous row's `ended_at`.

export const ownerships = pgTable(
  "ownerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: ownershipRoleEnum("role").notNull().default("owner"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Self-reference; not a hard FK to avoid migration ordering issues.
    transferredFromId: uuid("transferred_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    oneActivePerPet: uniqueIndex("ownerships_one_active_per_pet")
      .on(table.petId)
      .where(sql`${table.endedAt} IS NULL`),
    userIdIdx: index("ownerships_user_id_idx").on(table.userId),
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
