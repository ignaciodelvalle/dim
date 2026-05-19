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
      // Set true by the death action when the pet was in an active rabies
      // observation at time of death (the same tx also emits
      // rabies_observation_ended with outcome='dead'). Optional for
      // back-compat with rows written before the bite-rabies hook landed.
      during_rabies_observation: z.boolean().optional(),
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
      // performed_by autocomplete (spec 2026-05-19-performed-by-autocomplete):
      // optional FK pair. When either is set, `administered_by` must be
      // the display-name snapshot at insert time (immutable, append-only).
      administered_by_organization_id: z.string().uuid().nullable().optional(),
      administered_by_user_id: z.string().uuid().nullable().optional(),
      next_due_at: z.string().nullable(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if ((p.administered_by_organization_id || p.administered_by_user_id) && !p.administered_by) {
      ctx.addIssue({
        code: "custom",
        message: "administered_by text snapshot required when FK populated",
        path: ["administered_by"],
      });
    }
  });

const dewormingAdministered = z
  .object(
    withVersion({
      product: z.string(),
      type: z.enum(["internal", "external", "both"]),
      // performed_by autocomplete (spec 2026-05-19): the existing deworming
      // schema didn't track who administered the product. The text + FK
      // pair lands as optional fields — owner-self entries that omit them
      // keep validating.
      administered_by: z.string().nullable().optional(),
      administered_by_organization_id: z.string().uuid().nullable().optional(),
      administered_by_user_id: z.string().uuid().nullable().optional(),
      next_due_at: z.string().nullable(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if ((p.administered_by_organization_id || p.administered_by_user_id) && !p.administered_by) {
      ctx.addIssue({
        code: "custom",
        message: "administered_by text snapshot required when FK populated",
        path: ["administered_by"],
      });
    }
  });

const sterilizationPerformed = z
  .object(
    withVersion({
      procedure: z.enum(["castration", "spay"]),
      performed_by: z.string().nullable(),
      clinic: z.string().nullable(),
      // performed_by autocomplete (spec 2026-05-19): FK pair covers both
      // the vet (user) and clinic (organization) cases. The snapshot text
      // stays in performed_by + clinic respectively.
      performed_by_organization_id: z.string().uuid().nullable().optional(),
      performed_by_user_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if (
      (p.performed_by_organization_id || p.performed_by_user_id) &&
      !p.performed_by &&
      !p.clinic
    ) {
      ctx.addIssue({
        code: "custom",
        message: "performed_by or clinic text snapshot required when FK populated",
        path: ["performed_by"],
      });
    }
  });

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
      // performed_by autocomplete (spec 2026-05-19): FK pair links the
      // visit to a real vet (user) or clinic (organization).
      attended_by_organization_id: z.string().uuid().nullable().optional(),
      attended_by_user_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if ((p.attended_by_organization_id || p.attended_by_user_id) && !p.vet_name && !p.clinic) {
      ctx.addIssue({
        code: "custom",
        message: "vet_name or clinic text snapshot required when FK populated",
        path: ["vet_name"],
      });
    }
  });

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
      // performed_by autocomplete (spec 2026-05-19): FK pair.
      performed_by_organization_id: z.string().uuid().nullable().optional(),
      performed_by_user_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if ((p.performed_by_organization_id || p.performed_by_user_id) && !p.performed_by) {
      ctx.addIssue({
        code: "custom",
        message: "performed_by text snapshot required when FK populated",
        path: ["performed_by"],
      });
    }
  });

// ---------------------------------------------------------------------------
// Identification & legal
// ---------------------------------------------------------------------------

const microchipImplanted = z
  .object(
    withVersion({
      chip_number: z.string(),
      country_code: z.string().nullable(),
      implanted_by: z.string().nullable(),
      // performed_by autocomplete (spec 2026-05-19): FK pair.
      implanted_by_organization_id: z.string().uuid().nullable().optional(),
      implanted_by_user_id: z.string().uuid().nullable().optional(),
      location_on_body: z.string().nullable(),
      // Only the two pets.ts writers add this; createMicrochipAction omits it.
      implant_date_known: z.boolean().optional(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    if ((p.implanted_by_organization_id || p.implanted_by_user_id) && !p.implanted_by) {
      ctx.addIssue({
        code: "custom",
        message: "implanted_by text snapshot required when FK populated",
        path: ["implanted_by"],
      });
    }
  });

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
// Microchip lifecycle (beyond the initial implant)
// ---------------------------------------------------------------------------

// Microchip replacement / revocation — umbrella event (catalog cleanup
// 2026-05-19). new_chip_number === null distinguishes a pure revocation
// (chip retired, no replacement) from a normal replacement. The reason
// enum is the union of legacy {replaced, revoked} reasons.
//
// actor_role + actor_user_id are populated when the operation was driven
// by an institutional actor (vet/admin/govt — for fraud or device-failure
// revocations). Owner-initiated revocations and owner-managed
// replacements omit those (default actor_role = "owner").
const microchipReplaced = z
  .object(
    withVersion({
      previous_chip_number: z.string(),
      new_chip_number: z.string().nullable(),
      reason: z.enum([
        // Replacement reasons.
        "damaged",
        "unreadable",
        "duplicate_detected",
        // Revocation reasons (carry-over from microchip_revoked).
        "fraud_detected",
        "owner_request",
        "device_failure",
        "other",
      ]),
      replaced_by: z.string().nullable(),
      // ISO date when the operation was performed.
      replaced_at: z.string(),
      actor_role: z.enum(["owner", "vet", "admin", "govt"]).default("owner"),
      actor_user_id: z.string().uuid().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Free-form & system
// ---------------------------------------------------------------------------

const noteAdded = z
  .object(
    withVersion({
      // `system` is reserved for cron-emitted notes (close-stale-lost-episodes,
      // close-followup-expired-adoptions). Owner-facing forms restrict to the
      // first five via `NOTE_CATEGORIES` in app/actions/events.ts.
      category: z
        .enum(["comportamiento", "dieta", "grooming", "estado_de_animo", "otro", "system"])
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

// Rabies observation lifecycle — emitted atomically with the originating
// incident_reported (bite_inflicted) event and closed either by the daily
// cron (negative happy path), by the owner manually after 10 days, by a vet
// or govt professionally with a specific outcome, or auto-closed when a
// death_recorded event fires during the period.
//
// The bite_event_id references a `pet_events.id` row whose `event_type` is
// `incident_reported` and whose `payload.incident_type` is `'bite_inflicted'`.
const rabiesObservationStarted = z
  .object(
    withVersion({
      bite_event_id: z.string().uuid(),
      // ISO date — bite occurred_at + 10 calendar days.
      observation_until: z.string(),
      // in_situ (domicilio del dueño) vs official_site (Instituto Pasteur,
      // dispensario antirrábico). v1 defaults to in_situ; a professional flow
      // can promote to official_site when implemented.
      location: z.enum(["in_situ", "official_site"]),
      official_site_organization_id: z.string().uuid().nullable(),
    }),
  )
  .strict();

const rabiesObservationEnded = z
  .object(
    withVersion({
      bite_event_id: z.string().uuid(),
      observation_started_event_id: z.string().uuid(),
      outcome: z.enum(["negative", "positive_rabies", "dead", "lost_to_followup"]),
      closed_by_role: z.enum(["owner", "vet", "govt", "admin", "system"]),
      closure_notes: z.string().nullable(),
      // Set when outcome='dead' — the death_recorded event id that triggered
      // the close. null for all other outcomes.
      death_event_id: z.string().uuid().nullable(),
    }),
  )
  .strict();

// Umbrella event for non-human-cruelty incidents. The `incident_type`
// discriminator narrows the variant; bite_inflicted and bite_suffered live
// here (no separate event_type) so the bite-rabies-observation flow reads
// them via `payload->>'incident_type'`. The `dog_attack` value is deprecated
// (kept for back-compat with historical rows); new writers should use
// `bite_suffered` for the unambiguous semantics.
const incidentReported = z
  .object(
    withVersion({
      incident_type: z.enum([
        "bite_inflicted",
        "bite_suffered",
        "dog_attack",
        "fight",
        "traffic_accident",
        "fall",
        "poisoning",
        "escape",
        "other",
      ]),
      severity: z.enum(["minor", "moderate", "severe"]).nullable(),
      injuries_summary: z.string().nullable(),
      vet_involved: z.boolean().nullable(),
      location_description: z.string().nullable().optional(),
      // Bite-specific fields. Present (or expected) only when incident_type is
      // bite_inflicted or bite_suffered. Validated as optional at the schema
      // level; the form layer is responsible for requiring them on bite flows.
      victim_kind: z.enum(["human", "animal", "unknown"]).nullable().optional(),
      victim_contact_name: z.string().nullable().optional(),
      victim_contact_phone: z.string().nullable().optional(),
      victim_pet_id: z.string().uuid().nullable().optional(),
      victim_age_estimate: z.string().nullable().optional(),
      context: z.string().nullable().optional(),
      rabies_vaccine_valid_at_incident: z.boolean().nullable().optional(),
      reporter_role: z.enum(["owner", "vet", "shelter", "govt", "witness"]).nullable().optional(),
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
      p.source === "welfare_report" ? p.welfare_report_id !== null : p.welfare_report_id === null,
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
      // True when this signal was emitted while the pet was in active rabies
      // observation (pet.rabies_observation_status='in_progress'). Used by
      // govt dashboards to highlight rabies-suspected signals that overlap
      // with an open observation. Optional for back-compat with historical
      // rows written before the bite-rabies-observation feature landed.
      bite_observation_active: z.boolean().optional(),
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
// Foster end — reason catalog (spec foster-volunteers-pool v1.4 §6.9):
//   - returned                  — UI-selectable: devolución normal
//   - early_return_by_foster    — UI-selectable: foster pide cortar antes
//   - pet_died                  — programmatic ONLY: auto-emitted by recordDeathAction
//   - lost_unrecovered          — UI-selectable: perdido sin recuperación >30d
//   - adoption                  — programmatic ONLY: emitted inside finalizeAdoptionAction
//   - other                     — UI-selectable catch-all
// `death_event_id` is populated only when reason='pet_died' (FK to the
// death_recorded event that triggered the auto-close).
const fosterEnded = z
  .object(
    withVersion({
      foster_user_id: z.string().uuid(),
      reason: z.enum([
        "returned",
        "early_return_by_foster",
        "pet_died",
        "lost_unrecovered",
        "adoption",
        "other",
      ]),
      notes: z.string().nullable().optional(),
      death_event_id: z.string().uuid().nullable().optional(),
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
  // Cross-org transfer specific reasons (spec
  // 2026-05-19-cross-org-transfer-ux-design CT4). Used by the
  // refugio→refugio handshake flow.
  "space_constraint",
  "specialization_needed",
  "network_redistribution",
  "shelter_closing",
  "post_adoption_failed_return",
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

// Adoption reversed — umbrella event collapsing the previous
// adoption_revoked (shelter/court-initiated) and adoption_withdrawn
// (adopter-initiated) into one (catalog cleanup 2026-05-19). The actor
// discriminator picks the perspective; reason is free text. When the
// reversed finalization event id is known (post event-sourcing era)
// it's referenced; older data leaves it null.
const adoptionReversed = z
  .object(
    withVersion({
      actor: z.enum(["shelter", "adopter", "court"]),
      reason: z.string().nullable(),
      reverted_finalization_event_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict();

// Adoption application submitted — emitted by the public adoption flow
// (spec adoption-listing-public §8.4) when a visitor completes
// /adoptar/{petToken}/postular. The four free-text payload fields are the
// raw user input from the form; the related_organization_id is denormalized
// from the current shelter_custody ownership so the reader can audit which
// refugio received the application without re-joining ownerships at read
// time. housing_type is the only structured field.
const adoptionApplicationSubmitted = z
  .object(
    withVersion({
      applicant_user_id: z.string().uuid(),
      related_organization_id: z.string().uuid(),
      housing_type: z.enum(["casa_con_patio", "casa_sin_patio", "departamento", "otro"]),
      other_pets: z.string().nullable(),
      daily_routine: z.string().nullable(),
      notes: z.string().nullable(),
    }),
  )
  .strict();

// Adoption application resolved — umbrella for approved + rejected
// decisions (catalog cleanup 2026-05-19). The shelter's admin/coordinator
// emits this from the org portal when reviewing a postulation, and the
// finalize-cascade in adoption.ts emits the `rejected + auto_generated`
// variant for sibling applications when one application is finalized
// (spec adoption-listing-public §12 Fase 5.5).
//
// outcome === "rejected" → reason should be set (required by app-layer
// for manual rejections; the cascade uses literal "another_application_finalized").
// outcome === "approved" → reason is optional. Zod stays permissive on
// the correlation; the server actions enforce it.
const adoptionApplicationResolved = z
  .object(
    withVersion({
      application_event_id: z.string().uuid(),
      reviewer_user_id: z.string().uuid(),
      outcome: z.enum(["approved", "rejected"]),
      reason: z.string().nullable().optional(),
      auto_generated: z.boolean().default(false).optional(),
      notes: z.string().nullable().optional(),
    }),
  )
  .strict();

// Custody dispute raised — admin or govt flags the pet as subject to external
// legal proceedings (parental divorce, succession, criminal seizure pending
// return). Sets `pets.in_custody_dispute = true` via dual-write from the
// future server action. Downstream features (transfers, finalize, scheduling)
// will optionally honor the flag when their flows are designed.
const custodyDisputeRaised = z
  .object(
    withVersion({
      raised_by_role: z.enum(["admin", "govt"]),
      raised_by_user_id: z.string().uuid(),
      external_proceeding_reference: z.string().nullable(),
      reason: z.string(),
    }),
  )
  .strict();

// Custody dispute resolved — closes a prior `custody_dispute_raised`. Sets
// `pets.in_custody_dispute = false`. The outcome enum captures the legal
// result without prescribing post-resolution actions (those are per-feature).
const custodyDisputeResolved = z
  .object(
    withVersion({
      raised_event_id: z.string().uuid(),
      resolved_by_role: z.enum(["admin", "govt"]),
      resolved_by_user_id: z.string().uuid(),
      outcome: z.enum(["ownership_confirmed", "ownership_transferred", "case_dismissed", "other"]),
      notes: z.string().nullable(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Foster volunteers pool — proposal lifecycle (spec v1.4 §4.5)
// ---------------------------------------------------------------------------
//
// All 6 events follow the `*_proposed` / `*_executed` cross-cutting pattern:
// the org proposes a foster, the volunteer accepts/rejects, the cron expires
// stale pending rows. Co-foster opt-in is a peer event on the foster
// ownership row created at acceptance. Classified NON-libreta (system flow
// telemetry, not pet medical history).

const fosterProposed = z
  .object(
    withVersion({
      proposal_public_token: z.string(),
      volunteer_user_id: z.string().uuid(),
      proposed_duration_weeks: z.number().int().positive().nullable().optional(),
      match_warnings: z.array(z.string()).default([]),
    }),
  )
  .strict();

// Umbrella resolution event for a foster proposal's terminal state (catalog
// cleanup 2026-05-19). The `outcome` discriminator picks which optional
// fields apply:
//   - accepted: response_notes
//   - rejected: rejection_reason (enum) + response_notes
//   - cancelled: cancellation_reason + auto_cancelled (true when the D18
//     cascade closed it — volunteer's last slot consumed by accepting
//     another proposal)
//   - expired: only proposal_public_token
// The Zod schema is permissive on the optional fields; the server action
// that writes each row enforces the outcome ↔ fields correlation.
const fosterProposalResolved = z
  .object(
    withVersion({
      proposal_public_token: z.string(),
      outcome: z.enum(["accepted", "rejected", "cancelled", "expired"]),
      response_notes: z.string().nullable().optional(),
      rejection_reason: z
        .enum(["capacity", "health_mismatch", "timing", "distance", "household", "other"])
        .nullable()
        .optional(),
      cancellation_reason: z.string().nullable().optional(),
      auto_cancelled: z.boolean().default(false).optional(),
    }),
  )
  .strict();

// Peer event on the foster ownership row recording the D17 co-foster
// opt-in flag set (or later toggled) by the first foster.
const fosterCoFosterAllowed = z
  .object(
    withVersion({
      allow_co_foster: z.boolean(),
      foster_ownership_id: z.string().uuid(),
    }),
  )
  .strict();

// Adoption eligibility — emitted whenever pets.adoption_eligible* columns
// change (intake initial eval, later re-classification, set to null reset).
// The previous_state snapshot is the (eligible, reason) pair right before
// this change, so the timeline reconstructs without a separate journal.
const adoptionEligibilitySet = z
  .object(
    withVersion({
      eligible: z.boolean(),
      ineligible_reason: z
        .enum([
          "medical_treatment",
          "behavioral_evaluation",
          "recovery",
          "quarantine",
          "legal_hold",
          "age",
          "pending_intake_eval",
          "other",
        ])
        .nullable()
        .optional(),
      ineligible_reason_notes: z.string().nullable().optional(),
      ineligible_until: z.string().datetime().nullable().optional(),
      previous_state: z
        .object({
          eligible: z.boolean().nullable(),
          reason: z.string().nullable(),
        })
        .nullable()
        .optional(),
    }),
  )
  .strict()
  .refine(
    (data) => data.eligible === true || data.ineligible_reason != null,
    "ineligible_reason required when eligible=false",
  )
  .refine(
    (data) =>
      data.ineligible_reason !== "other" ||
      (data.ineligible_reason_notes != null && data.ineligible_reason_notes.trim().length > 0),
    "ineligible_reason_notes required when reason='other'",
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

// Libreta Tier-2 share view telemetry used to live here as
// `libreta_shared_viewed`. The 2026-05-19 catalog cleanup moved that
// signal out of pet_events into the dedicated `share_telemetry` table
// (see db/schema.ts → shareTelemetry). No Zod schema needed anymore;
// the only writer is app/actions/libreta-share.ts.

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// `Partial<Record<EventType, ...>>` is intentional: a small allowlist of
// `EVENT_TYPES` entries exists in the const ahead of their schema landing
// (currently the adoption-pipeline family except `adoption_finalized` and
// `post_adoption_checkin` — see `__tests__/event-schemas.test.ts` →
// `UNIMPLEMENTED`). When a type gains a real writer, its schema MUST land in
// the same PR; validateEventPayload throws on insert until that happens.

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
  microchip_replaced: microchipReplaced,
  dangerous_breed_attested: dangerousBreedAttested,
  note_added: noteAdded,
  credential_scanned: credentialScanned,
  incident_reported: incidentReported,
  rabies_observation_started: rabiesObservationStarted,
  rabies_observation_ended: rabiesObservationEnded,
  abandonment_reported: abandonmentReported,
  maltreatment_reported: maltreatmentReported,
  symptom_observed: symptomObserved,
  outbreak_signal: outbreakSignal,
  shelter_intake_recorded: shelterIntakeRecorded,
  foster_assigned: fosterAssigned,
  foster_ended: fosterEnded,
  adoption_finalized: adoptionFinalized,
  adoption_reversed: adoptionReversed,
  adoption_application_submitted: adoptionApplicationSubmitted,
  adoption_application_resolved: adoptionApplicationResolved,
  post_adoption_checkin: postAdoptionCheckin,
  custody_transferred: custodyTransferred,
  custody_transfer_proposed: custodyTransferProposed,
  custody_dispute_raised: custodyDisputeRaised,
  custody_dispute_resolved: custodyDisputeResolved,
  foster_proposed: fosterProposed,
  foster_proposal_resolved: fosterProposalResolved,
  foster_co_foster_allowed: fosterCoFosterAllowed,
  adoption_eligibility_set: adoptionEligibilitySet,
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
