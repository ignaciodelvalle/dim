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

const symptomObserved = z
  .object(
    withVersion({
      welfare_report_id: z.string().uuid(),
      reporter_role: z.enum(["owner", "witness"]),
      symptoms: z.string(),
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
  shelter_intake_recorded: shelterIntakeRecorded,
  foster_assigned: fosterAssigned,
  foster_ended: fosterEnded,
  adoption_finalized: adoptionFinalized,
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
