// Zod schemas for pet_events payloads.
//
// Each schema captures the SHAPE the writer in app/actions/* produces today,
// ground-truthed from those call sites (NOT from any spec or doc). Schemas
// are STRICT by default — extra keys throw — so writer drift is caught at
// validate() time, before the row hits the immutable event log.
//
// Why payload_version: foundation for the future upcaster registry (item 3
// from the event-sourcing hardening doc). Every schema includes
// `payload_version: z.literal(1).default(1)`. New writes get version 1
// automatically (default fills in on parse). When a payload shape evolves
// in a future PR, that schema's literal moves to 2 and an upcaster maps
// v1 → v2 in the read path.
//
// Why one big record: validateEventPayload is called from every insert site,
// so a single import + a single switch on eventType is simpler than 20
// individual imports.
//
// Lost & Found notification_type values (TEXT column — no migration required):
//   "lost_pet_broadcast"                  — sent to org member when a pet is lost in their coverage area
//   "chip_match_notification_owner"       — sent to owner when a chip match is detected at intake
//   "custody_transfer_proposal_owner"     — sent to owner when actor proposes return-to-owner
//   "custody_transfer_accepted_owner_side"— sent to actor when owner accepts the return proposal
//   "custody_transfer_auto_cancelled"     — sent to actor when a stale proposal is auto-cancelled

import { z } from "zod";

import { EVENT_TYPES, type EventType } from "@/db/schema";

// Helper: every schema gets the version field baked in.
const withVersion = <T extends z.ZodRawShape>(shape: T) => ({
  payload_version: z.literal(1).default(1),
  ...shape,
});

const petStatus = z.enum(["active", "lost", "deceased"]);
const trueOrNull = z.union([z.literal(true), z.null()]);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Snake_case throughout, all required keys explicit. createPetAction was
// normalized in a follow-up PR to write this exact shape (no more
// `...parsed` spread that mixed cases and let emergencyInfoVisible — a UI
// preference — leak into the immutable log). Strict: extra keys now throw.
// Historical rows from before the rewrite still exist in the DB with the
// old mixed-case shape, but those rows are NOT validated (validation
// happens at insert time only) so old rows stay readable.
const petRegistered = z
  .object(
    withVersion({
      name: z.string(),
      species: z.string(),
      sex: z.enum(["male", "female", "unknown"]),
      breed: z.string().nullable(),
      date_of_birth: z.string().nullable(),
      birth_date_is_estimated: z.boolean(),
      color: z.string().nullable(),
      microchip_id: z.string().nullable(),
      microchip_country_code: z.string().nullable(),
      microchip_implanted_at: z.string().nullable(),
      microchip_implanted_by: z.string().nullable(),
      microchip_location: z.string().nullable(),
      estimated_weight_kg: z.string().nullable(),
      favourite_foods: z.array(z.string()),
      known_allergies: z.array(z.string()),
      training_level: z
        .enum(["none", "basic", "intermediate", "advanced", "professional"])
        .nullable(),
      insurance_company: z.string().nullable(),
      insurance_policy_number: z.string().nullable(),
      jurisdiction_province: z.string().nullable(),
      jurisdiction_locality: z.string().nullable(),
      potentially_dangerous_breed: z.boolean(),
      acquisition_method: z
        .enum(["adopted", "purchased", "found_stray", "gift", "born_in_litter", "other"])
        .nullable(),
      has_photo: z.boolean(),
      has_microchip: z.boolean(),
      // "owner" by default — implicitly "owned by the registering user" for
      // back-compat with pre-org rows. Newer values disambiguate the holder:
      //   - "shelter_custody_by_citizen" — vecino-helps-stray case
      //   - "shelter_custody_by_org"     — refugio takes intake custody
      //   - "owner_by_org"               — org keeps the animal permanently
      //                                    (sanctuary, internal adoption,
      //                                    decomiso-without-rehoming)
      // Surfaces the custody decision in the immutable log so projections can
      // filter without joining ownerships. Defaulted on parse so events written
      // before this field landed still validate.
      custody_kind: z
        .enum(["owner", "shelter_custody_by_citizen", "shelter_custody_by_org", "owner_by_org"])
        .default("owner"),
    }),
  )
  .strict();

const petProfileUpdated = z
  .object(
    withVersion({
      changes: z.array(
        z.object({
          field: z.string(),
          old: z.unknown(),
          new: z.unknown(),
        }),
      ),
      photo_replaced: z.boolean(),
    }),
  )
  .strict();

const statusChanged = z
  .object(
    withVersion({
      from_status: petStatus,
      to_status: petStatus,
      // Only setPetLost writes these; setPetFound omits them. Optional so both
      // writers validate against the same schema.
      location_description: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
      // Lost & Found Fase 1 — optional fields added when marking a pet lost.
      //
      // Snapshot of the owner's disclosure preferences at the moment of marking
      // lost. Stored in the event for historical audit ("what was exposed when
      // this pet was marked lost"). The live source of truth for the credential
      // render lives in the pets table (disclose_*_when_lost columns).
      disclosure_prefs_snapshot: z
        .object({
          first_name: z.boolean(),
          phone: z.boolean(),
          email: z.boolean(),
          last_location: z.boolean(),
          finder_form: z.boolean(),
        })
        .optional(),
      // Enriched description captured at lost-time for unchipped pets (Fase 4).
      // Snapshot fields only (incident-specific context). Fields that update the
      // pet row permanently (color, distinguishing features, photo) are NOT
      // included here — they live on the pets row directly.
      lost_description: z
        .object({
          accessories_when_lost: z.string().nullable(),
          behavior_notes: z.string().nullable(),
          last_seen_context: z.string().nullable(),
        })
        .nullable()
        .optional(),
    }),
  )
  .strict();

const deathRecorded = z
  .object(
    withVersion({
      cause: z.enum([
        "known",
        "unknown",
        "natural",
        "disease",
        "accident",
        "euthanasia",
        "sudden",
        "violent",
        "other",
      ]),
      cause_detail: z.string().nullable(),
      confirmed_by_vet: trueOrNull,
      vet_name: z.string().nullable(),
      disposition_method: z
        .enum([
          "cremation_collective",
          "cremation_individual_ashes",
          "authorized_cemetery",
          "owner_burial",
          "household_waste",
          "rendering",
          "unknown",
        ])
        .nullable(),
      facility: z.string().nullable(),
      death_at_clinic: trueOrNull,
      clinic_name: z.string().nullable(),
      vet_contacted_owner: z.enum(["yes", "no", "not_applicable"]).nullable(),
      vet_decided_alone: trueOrNull,
      owner_to_private_crematorium: trueOrNull,
      disease_code: z.string().nullable(),
      confirmed_by_lab: z.boolean().nullable(),
      is_reportable: z.boolean(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Preventive medicine
// ---------------------------------------------------------------------------

const vaccinationAdministered = z
  .object(
    withVersion({
      vaccine_name: z.string(),
      brand: z.string().nullable(),
      batch: z.string().nullable(),
      administered_by: z.string().nullable(),
      next_due_at: z.string().nullable(),
    }),
  )
  .strict();

const dewormingAdministered = z
  .object(
    withVersion({
      product: z.string(),
      type: z.enum(["internal", "external", "both"]),
      next_due_at: z.string().nullable(),
    }),
  )
  .strict();

const sterilizationPerformed = z
  .object(
    withVersion({
      procedure: z.enum(["castration", "spay"]),
      performed_by: z.string().nullable(),
      clinic: z.string().nullable(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

const medicationStarted = z
  .object(
    withVersion({
      drug_name: z.string(),
      dose: z.string(),
      frequency: z.enum([
        "once_daily",
        "twice_daily",
        "three_times_daily",
        "four_times_daily",
        "single_dose",
        "custom",
      ]),
      prescribed_by: z.string().nullable(),
      drug_code: z.string().nullable(),
      first_dose_at: z.string(),
      duration_days: z.number().nullable(),
      custom_hours: z.number().nullable(),
      schedule_count: z.number(),
    }),
  )
  .strict();

const medicationStopped = z
  .object(
    withVersion({
      medication_started_event_id: z.string().uuid(),
      reason: z.string().nullable(),
    }),
  )
  .strict();

const medicationDoseTaken = z
  .object(
    withVersion({
      medication_started_event_id: z.string().uuid().nullable(),
      scheduled_for: z.string(),
      reminder_id: z.string().uuid(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Clinical encounters & metrics
// ---------------------------------------------------------------------------

const vetVisitLogged = z
  .object(
    withVersion({
      reason: z.string(),
      diagnosis: z.string().nullable(),
      vet_name: z.string().nullable(),
      clinic: z.string().nullable(),
    }),
  )
  .strict();

const weightRecorded = z
  .object(
    withVersion({
      kg: z.string(),
    }),
  )
  .strict();

const clinicalInfoLogged = z
  .object(
    withVersion({
      sub_kind: z.enum(["lab_work", "imaging", "surgery", "allergy_detection", "other"]),
      title: z.string(),
      details: z.string().nullable(),
      performed_by: z.string().nullable(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Identification & legal
// ---------------------------------------------------------------------------

const microchipImplanted = z
  .object(
    withVersion({
      chip_number: z.string(),
      country_code: z.string().nullable(),
      implanted_by: z.string().nullable(),
      location_on_body: z.string().nullable(),
      // Only the two pets.ts writers add this; createMicrochipAction omits it.
      implant_date_known: z.boolean().optional(),
    }),
  )
  .strict();

const dangerousBreedAttested = z
  .object(
    withVersion({
      registry: z.enum(["caba_4078", "prov_14107", "other"]),
      registry_id: z.string().nullable(),
      attested_at: z.string(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Free-form & system
// ---------------------------------------------------------------------------

const noteAdded = z
  .object(
    withVersion({
      category: z
        .enum(["comportamiento", "dieta", "grooming", "estado_de_animo", "otro"])
        .nullable(),
      text: z.string(),
    }),
  )
  .strict();

const credentialScanned = z
  .object(
    withVersion({
      is_self_scan: z.boolean(),
      viewer_authenticated: z.boolean(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Welfare (Tier-2 cases) — written by createWelfareReportAction
// ---------------------------------------------------------------------------

const welfareCore = {
  welfare_report_id: z.string().uuid(),
  reporter_role: z.enum(["owner", "witness"]),
  description: z.string(),
};

const abandonmentReported = z.object(withVersion(welfareCore)).strict();

const maltreatmentReported = z
  .object(
    withVersion({
      ...welfareCore,
      severity: z.enum(["low", "medium", "high", "critical"]),
      kind: z.enum([
        "physical_abuse",
        "neglect",
        "chained",
        "no_shelter",
        "hoarding",
        "dog_fighting",
        "trafficking",
      ]),
    }),
  )
  .strict();

// Refactored in surveillance Fase 2 to decouple from welfare_report.
// Adds source discriminator, free_text, matched_symptom_codes, alerted_disease_codes.
// Old rows (shape: { welfare_report_id, reporter_role, symptoms }) remain readable
// because validation only runs at insert time — existing welfare-report events
// written before this PR are not re-validated.
const symptomObserved = z
  .object(
    withVersion({
      source: z.enum(["libreta", "welfare_report"]),
      // Required when source='welfare_report', null when source='libreta'.
      welfare_report_id: z.string().uuid().nullable(),
      reporter_role: z.enum(["owner", "witness", "vet"]),
      // Free text input by the owner (or vet/witness). The matcher reads this.
      free_text: z.string().min(1),
      // Populated by the server action via lib/symptom-matcher. Empty when no matches.
      matched_symptom_codes: z.array(z.string()).default([]),
      // Subset of matched diseases that crossed the alert threshold AND are reportable.
      // Used downstream by the outbreak_signal emission. May be empty even if symptoms matched.
      alerted_disease_codes: z.array(z.string()).default([]),
      severity_self_assessed: z.enum(["mild", "moderate", "severe"]).nullable(),
      onset_at: z.string().nullable(),
    }),
  )
  .strict()
  .refine(
    (p) =>
      p.source === "welfare_report"
        ? p.welfare_report_id !== null
        : p.welfare_report_id === null,
    { message: "welfare_report_id must be set iff source='welfare_report'" },
  );

// Surveillance signal emitted by the system when symptom_observed triggers
// a reportable disease match. NON-libreta (owner never sees this).
// See docs/superpowers/specs/2026-05-17-symptom-disease-surveillance-design.md §4.4.
const outbreakSignal = z
  .object(
    withVersion({
      source_symptom_event_id: z.string().uuid(),
      disease_code: z.string(),
      disease_label: z.string(),
      match_strength: z.object({
        high_count: z.number().int().nonnegative(),
        medium_count: z.number().int().nonnegative(),
        low_count: z.number().int().nonnegative(),
        matched_symptom_codes: z.array(z.string()),
      }),
      // Snapshot of pet's jurisdiction at signal time — for surveillance aggregation
      // even if the pet moves later.
      pet_jurisdiction_country: z.string(),
      pet_jurisdiction_province: z.string().nullable(),
      pet_jurisdiction_locality: z.string().nullable(),
      pet_species: z.string(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Custody & adoption (refugio portal)
// ---------------------------------------------------------------------------

// Intake event fired when an org takes custody of an animal. The payload
// captures intake-specific info (reason, body condition, jurisdiction) so
// pet_registered can stay universal across owner / refugio / citizen flows.
// Authority side-effects (DGSA notification on seizure, etc.) hook off this
// event via projections in later phases — keep the payload spec'd to AGENTS.md
// → Custody & adoption.
const shelterIntakeRecorded = z
  .object(
    withVersion({
      intake_reason: z.enum(["rescue", "surrender", "seizure", "stray_found", "other"]),
      intake_condition: z.string().nullable(),
      rescue_jurisdiction: z.string().nullable(),
    }),
  )
  .strict();

// Foster assignment — refugio assigns a member to physically care for an
// animal it holds in shelter_custody. The foster's `ownership(role='foster')`
// row coexists with the org's `ownership(role='shelter_custody')` row; the
// unique-active-owner constraint only fires on role='owner', so both rows
// stay active simultaneously by design.
const fosterAssigned = z
  .object(
    withVersion({
      foster_user_id: z.string().uuid(),
      expected_weeks: z.number().int().min(0).nullable(),
      notes: z.string().nullable(),
    }),
  )
  .strict();

// Foster ending — closes a foster ownership row without an adoption finalize
// (adoption_finalized handles the foster→owner transition in one composite
// event). Used when a tránsito returns the animal to the refugio, the foster
// can't continue, or the refugio reassigns. `ended_reason` is free-text;
// `ended_by` records who initiated the close.
const fosterEnded = z
  .object(
    withVersion({
      foster_user_id: z.string().uuid(),
      foster_assigned_event_id: z.string().uuid().nullable(),
      ended_by: z.enum(["shelter", "foster_returned", "other"]),
      reason: z.string().nullable(),
    }),
  )
  .strict();

// Adoption finalization — composite event. Atomically: end the prior
// shelter_custody row, end any active foster row, insert a new owner row.
// The payload references the institutional ancestor (previous_owner_org) and
// optional foster so projections can rebuild the custody chain without
// scanning ownerships history. `contract_attachment_id` is reserved; v1 leaves
// it null (upload flow ships in a follow-up). `post_adoption_followup_months`
// drives the follow-up check-in window per AGENTS.md → Custody & adoption.
const adoptionFinalized = z
  .object(
    withVersion({
      previous_owner_organization_id: z.string().uuid(),
      adopter_user_id: z.string().uuid(),
      foster_user_id: z.string().uuid().nullable(),
      contract_attachment_id: z.string().uuid().nullable(),
      post_adoption_followup_months: z.number().int().min(0).max(36).nullable(),
      notes: z.string().nullable(),
    }),
  )
  .strict();

// Shared reason enum for custody transfer events (proposed + transferred).
// Introduced in Lost & Found Fase 1 to support the return-to-owner two-phase
// handshake and citizen-to-org handoff. "org_to_org_handoff" covers the
// existing org-to-org transfer flow.
const custodyTransferReason = z.enum([
  "org_to_org_handoff",
  "return_to_original_owner",
  "citizen_to_org_handoff",
  "other",
]);

// Custody transferred — polymorphic handoff (org-to-org, org-to-user, user-to-org).
// Exactly one of (from_user_id, from_organization_id) must be set (XOR),
// and exactly one of (to_user_id, to_organization_id) must be set (XOR).
// The existing org-to-org shape is backwards-compatible: from_organization_id
// and to_organization_id remain present; from_user_id/to_user_id default null.
// `reason` is optional for backwards-compat with pre-Fase-1 rows.
// If a foster was active on the source side, that row is auto-closed and a
// sibling foster_ended event is emitted in the same tx; its id is captured
// here so the timeline reads as one coherent transfer.
const custodyTransferred = z
  .object(
    withVersion({
      // Polymorphic "from" actor — exactly one must be non-null.
      from_user_id: z.string().uuid().nullable().optional(),
      from_organization_id: z.string().uuid().nullable().optional(),
      // Polymorphic "to" actor — exactly one must be non-null.
      to_user_id: z.string().uuid().nullable().optional(),
      to_organization_id: z.string().uuid().nullable().optional(),
      from_role: z.enum(["shelter_custody", "owner"]),
      to_role: z.enum(["shelter_custody", "owner"]),
      reason: custodyTransferReason.optional(),
      // Links to the matched pet that triggered a cross-check match flow.
      matched_against_pet_id: z.string().uuid().nullable().optional(),
      foster_ended_event_id: z.string().uuid().nullable(),
      notes: z.string().nullable(),
    }),
  )
  .strict()
  .refine(
    (p) => {
      const fromSet = [p.from_user_id, p.from_organization_id].filter(
        (v) => v != null && v !== undefined,
      ).length;
      // Allow legacy shape where neither from_user_id is provided (only from_organization_id).
      // At least one from actor must be set.
      return fromSet >= 1;
    },
    { message: "at least one of from_user_id / from_organization_id must be set" },
  )
  .refine(
    (p) => {
      const toSet = [p.to_user_id, p.to_organization_id].filter(
        (v) => v != null && v !== undefined,
      ).length;
      return toSet >= 1;
    },
    { message: "at least one of to_user_id / to_organization_id must be set" },
  )
  .refine(
    (p) => {
      const fromCount = [p.from_user_id, p.from_organization_id].filter(
        (v) => v != null && v !== undefined,
      ).length;
      return fromCount <= 1;
    },
    { message: "at most one of from_user_id / from_organization_id may be set" },
  )
  .refine(
    (p) => {
      const toCount = [p.to_user_id, p.to_organization_id].filter(
        (v) => v != null && v !== undefined,
      ).length;
      return toCount <= 1;
    },
    { message: "at most one of to_user_id / to_organization_id may be set" },
  );

// Custody transfer proposed — Phase 1 of the return-to-owner two-phase
// handshake (Lost & Found Fase 5). An actor holding shelter_custody proposes
// returning the pet to the original owner (or to another org). The owner
// accepts via ownerAcceptReturnAction, which emits custody_transferred.
// Exactly one of (from_user_id, from_organization_id) must be non-null (XOR),
// and exactly one of (to_user_id, to_organization_id) must be non-null (XOR).
const custodyTransferProposed = z
  .object(
    withVersion({
      // Polymorphic "from" actor — exactly one must be non-null.
      from_user_id: z.string().uuid().nullable(),
      from_organization_id: z.string().uuid().nullable(),
      // Polymorphic "to" actor — exactly one must be non-null.
      to_user_id: z.string().uuid().nullable(),
      to_organization_id: z.string().uuid().nullable(),
      reason: custodyTransferReason,
      // Links the proposal to a chip-match flow when applicable.
      matched_against_pet_id: z.string().uuid().nullable().optional(),
      // ISO-8601 datetime when the proposal was created (server-generated).
      proposed_at: z.string().datetime(),
      notes: z.string().nullable().optional(),
    }),
  )
  .strict()
  .refine((p) => [p.from_user_id, p.from_organization_id].filter((v) => v !== null).length === 1, {
    message: "exactly one of from_user_id / from_organization_id must be set",
  })
  .refine((p) => [p.to_user_id, p.to_organization_id].filter((v) => v !== null).length === 1, {
    message: "exactly one of to_user_id / to_organization_id must be set",
  });

// Post-adoption check-in — adopter self-reports during the followup window
// (1m/3m/6m/12m after adoption_finalized, capped by post_adoption_followup_months).
// AGENTS.md → Custody & adoption: follow-up is enforced through notifications,
// not credential shaming; missing check-ins fan out a notification to the
// refugio side. `related_organization_id` is denormalized from the adoption
// chain so projections can group check-ins by org without scanning ownerships.
const postAdoptionCheckin = z
  .object(
    withVersion({
      related_organization_id: z.string().uuid(),
      photo_attachment_ids: z.array(z.string().uuid()).default([]),
      notes: z.string().nullable(),
    }),
  )
  .strict();

// Libreta Tier-2 share view — system telemetry emitted on each public view of
// a share link. Not a medical event; classified in NON_LIBRETA_EVENT_TYPES.
const libretaSharedViewed = z
  .object(
    withVersion({
      share_token_id: z.string().uuid(),
      viewer_ip_hash: z.string().nullable(),
      user_agent: z.string().nullable(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// Partial<Record<EventType, ...>> because some EVENT_TYPES entries are
// schema-defined but have NO writer today (custody/adoption family, plus
// `lab_work_performed`/`imaging_performed`/`surgery_performed`/`allergy_detected`
// which are subsumed by `clinical_info_logged`). When such a type gains a
// writer, its schema lands in the same PR and validateEventPayload will
// throw on insert until the schema is registered.

export const PayloadSchemas: Partial<Record<EventType, z.ZodTypeAny>> = {
  pet_registered: petRegistered,
  pet_profile_updated: petProfileUpdated,
  status_changed: statusChanged,
  death_recorded: deathRecorded,
  vaccination_administered: vaccinationAdministered,
  deworming_administered: dewormingAdministered,
  sterilization_performed: sterilizationPerformed,
  medication_started: medicationStarted,
  medication_stopped: medicationStopped,
  medication_dose_taken: medicationDoseTaken,
  vet_visit_logged: vetVisitLogged,
  weight_recorded: weightRecorded,
  clinical_info_logged: clinicalInfoLogged,
  microchip_implanted: microchipImplanted,
  dangerous_breed_attested: dangerousBreedAttested,
  note_added: noteAdded,
  credential_scanned: credentialScanned,
  abandonment_reported: abandonmentReported,
  maltreatment_reported: maltreatmentReported,
  symptom_observed: symptomObserved,
  outbreak_signal: outbreakSignal,
  shelter_intake_recorded: shelterIntakeRecorded,
  foster_assigned: fosterAssigned,
  foster_ended: fosterEnded,
  adoption_finalized: adoptionFinalized,
  post_adoption_checkin: postAdoptionCheckin,
  custody_transferred: custodyTransferred,
  custody_transfer_proposed: custodyTransferProposed,
  libreta_shared_viewed: libretaSharedViewed,
};

/**
 * Validate a pet_events payload against its event-type schema.
 *
 * - Throws `EventPayloadValidationError` if the payload fails the schema.
 * - Throws `EventPayloadValidationError` if no schema is registered for the
 *   event type (writer added before its schema — fix the schema, not this
 *   validator).
 * - Returns the parsed payload with `payload_version: 1` filled in when
 *   missing. Callers should use the returned value (not the original) when
 *   storing the row.
 *
 * Called from every `insert(petEvents)` site in app/actions/*.
 */
export function validateEventPayload(eventType: EventType, payload: unknown): unknown {
  const schema = PayloadSchemas[eventType];
  if (!schema) {
    throw new EventPayloadValidationError(
      `No Zod schema registered for event type "${eventType}". Add it to lib/event-schemas.ts before writing this event.`,
      eventType,
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new EventPayloadValidationError(
      `Invalid payload for ${eventType}: ${result.error.message}`,
      eventType,
      result.error,
    );
  }
  return result.data;
}

export class EventPayloadValidationError extends Error {
  readonly eventType: EventType;
  readonly zodError: z.ZodError | undefined;
  constructor(message: string, eventType: EventType, zodError?: z.ZodError) {
    super(message);
    this.name = "EventPayloadValidationError";
    this.eventType = eventType;
    this.zodError = zodError;
  }
}

/**
 * The set of event types that DO have a registered schema. Useful for tests
 * (coverage assertion) and for the rebuild script (skip unknown types).
 */
export const IMPLEMENTED_EVENT_TYPES: ReadonlyArray<EventType> = Object.keys(
  PayloadSchemas,
) as EventType[];

// Re-export for completeness checking in tests.
export { EVENT_TYPES } from "@/db/schema";
