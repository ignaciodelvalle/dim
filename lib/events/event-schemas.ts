// Zod schemas for pet_events payloads.
//
// Each schema captures the SHAPE the writer in app/actions/* produces today,
// ground-truthed from those call sites (NOT from any spec or doc). Schemas
// are STRICT by default — extra keys throw — so writer drift is caught at
// validate() time, before the row hits the immutable event log.
//
// Why payload_version: foundation for the upcaster registry. Every schema
// includes `payload_version: z.literal(1).default(1)`. New writes get version
// 1 automatically (default fills in on parse). When a payload shape evolves
// in a future PR, that schema's literal moves to 2 and an upcaster in
// `lib/event-upcasters.ts` maps v1 → v2 in the read path. See
// `docs/superpowers/event-versioning.md` for the full step-by-step contract.
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

import type { EventType } from "@/db/schema";
import { findDisease } from "@/lib/reference/diseases";

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
      // L1 jurisdiction (optional). Sprint 4 PR-034 / doc 09 §3.A: events
      // that happen at a known location capture province + locality so the
      // gob surveillance projections can attribute them. Falls back to the
      // pet's jurisdiction when omitted (no behavior change for legacy rows).
      jurisdiction_province: z.string().nullable().optional(),
      jurisdiction_locality: z.string().nullable().optional(),
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

// `sub_kind='disease_diagnosis'` is a structured shape that powers the ENO
// vet direct-report flow (spec 2026-05-19-eno-vet-direct-report-and-owner-alerts §6.1).
// When set, the disease_* fields below carry the diagnosis; otherwise they
// stay null and the row is a plain clinical note.
const clinicalInfoLogged = z
  .object(
    withVersion({
      sub_kind: z.enum([
        "lab_work",
        "imaging",
        "surgery",
        "allergy_detection",
        "disease_diagnosis",
        "pregnancy",
        "other",
      ]),
      title: z.string(),
      details: z.string().nullable(),
      performed_by: z.string().nullable(),
      // performed_by autocomplete (spec 2026-05-19): FK pair.
      performed_by_organization_id: z.string().uuid().nullable().optional(),
      performed_by_user_id: z.string().uuid().nullable().optional(),
      // disease_diagnosis sub_kind fields (spec ENO §6.1).
      disease_code: z.string().nullable().optional(),
      confirmed_by_lab: z.boolean().optional(),
      lab_name: z.string().nullable().optional(),
      lab_report_reference: z.string().nullable().optional(),
      diagnosis_date: z.string().nullable().optional(),
      // pregnancy sub_kind fields (spec pregnancy-tracking PR3 + PR5 + PR6).
      pregnancy_phase: z.enum(["started", "ended"]).optional(),
      weeks_at_diagnosis: z.number().int().min(0).max(12).nullable().optional(),
      outcome: z
        .enum(["live_birth", "stillbirth", "miscarriage", "termination", "unknown"])
        .nullable()
        .optional(),
      live_births_count: z.number().int().min(0).max(20).nullable().optional(),
      vet_consulted: z.string().nullable().optional(),
      // L1 jurisdiction (optional). Sprint 4 PR-034 / doc 09 §3.A.
      jurisdiction_province: z.string().nullable().optional(),
      jurisdiction_locality: z.string().nullable().optional(),
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
    if (p.sub_kind === "disease_diagnosis") {
      if (!p.disease_code) {
        ctx.addIssue({
          code: "custom",
          message: "disease_code is required when sub_kind='disease_diagnosis'",
          path: ["disease_code"],
        });
      } else if (!findDisease(p.disease_code)) {
        ctx.addIssue({
          code: "custom",
          message: `disease_code '${p.disease_code}' is not in the catalog`,
          path: ["disease_code"],
        });
      }
    }
    if (p.sub_kind === "pregnancy") {
      if (!p.pregnancy_phase) {
        ctx.addIssue({
          code: "custom",
          message: "pregnancy_phase required when sub_kind='pregnancy'",
          path: ["pregnancy_phase"],
        });
      }
      if (p.pregnancy_phase === "ended" && !p.outcome) {
        ctx.addIssue({
          code: "custom",
          message: "outcome required when pregnancy_phase='ended'",
          path: ["outcome"],
        });
      }
      if (p.pregnancy_phase === "started" && p.outcome) {
        ctx.addIssue({
          code: "custom",
          message: "outcome not allowed when pregnancy_phase='started'",
          path: ["outcome"],
        });
      }
      if (
        p.live_births_count !== null &&
        p.live_births_count !== undefined &&
        p.outcome !== "live_birth"
      ) {
        ctx.addIssue({
          code: "custom",
          message: "live_births_count only valid when outcome='live_birth'",
          path: ["live_births_count"],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// Jurisdictional mobility (movilidad-jurisdiccional Fase 1)
// ---------------------------------------------------------------------------
//
// DELIBERATE PRECEDENT DIVERGENCE (design D1): movementRecorded uses
// z.discriminatedUnion("sub_kind", ...) instead of the flat-object +
// superRefine pattern that clinicalInfoLogged uses above. The clinical
// sub_kinds SHARE most fields (title/details/performed_by), so a flat object
// with conditional refinement is natural there. The three movement sub_kinds
// share NO fields — a union gives each face its own strict shape and typed
// narrowing for projections (invariant #3), while a flat object would force
// ~15 optional fields with a large superRefine matrix.
//
// Cross-sub_kind refinements (the S2 no-op-move check and the S1 wrong-face
// field checks) come for free: each union member is .strict(), so a
// cvi_issued payload carrying jurisdiction_changed keys is rejected by
// strictness, not by hand-written refinement.

// Fase 1 corridor ids (spec R3.2). Kept as a literal enum here — NOT imported
// from lib/reference/cross-border-corridors — so the immutable event schema
// never changes meaning if the corridor registry evolves; the registry's
// coverage test pins both to the same 5 ids.
const corridorIdEnum = z.enum(["chile", "uruguay", "brasil", "ue_espana", "usa"]);

const movementJurisdictionChanged = z
  .object(
    withVersion({
      sub_kind: z.literal("jurisdiction_changed"),
      from_country: z.string().min(1),
      from_province: z.string().nullable(),
      from_locality: z.string().nullable(),
      to_country: z.string().min(1),
      to_province: z.string().nullable(),
      to_locality: z.string().nullable(),
      // ISO date the move takes effect (may differ from occurred_at).
      effective_date: z.string(),
      reason: z.string().nullable(),
    }),
  )
  .strict()
  // S2: a no-op move is rejected at the schema level — write nothing rather
  // than record a non-event (spec R1.2).
  .superRefine((p, ctx) => {
    if (
      p.from_country === p.to_country &&
      p.from_province === p.to_province &&
      p.from_locality === p.to_locality
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "jurisdiction_changed requires to_* to differ from from_* — a no-op move is not an event",
        path: ["to_country"],
      });
    }
  });

const movementCviIssued = z
  .object(
    withVersion({
      sub_kind: z.literal("cvi_issued"),
      // ISO 3166-1 alpha-2 of the CVI's issuing country.
      origin_country: z.string().length(2),
      // Both-or-nothing (spec R1.2): a CVI fact without its issuing reference
      // is not recordable — min(1) rejects empty strings, .strict() rejects
      // omission via required keys.
      cvi_number: z.string().min(1),
      issuing_authority: z.string().min(1),
      issued_date: z.string(),
      // Cross-references petIdentifications.isoCountryCode when known.
      chip_iso_country_code: z.string().nullable(),
    }),
  )
  .strict();

const movementTransportRecorded = z
  .object(
    withVersion({
      sub_kind: z.literal("transport_recorded"),
      // S3: a 6th corridor is rejected at schema validation, before ever
      // reaching the aggregation (spec R1.2).
      corridor_id: corridorIdEnum,
      // Fixed literal in Fase 1 — inbound-to-AR computation is out of scope
      // (spec R3.4).
      direction: z.literal("outbound_from_ar"),
      travel_date: z.string(),
      mode: z.enum(["air", "land", "sea"]).nullable(),
      purpose: z.string().nullable(),
    }),
  )
  .strict();

const movementRecorded = z.discriminatedUnion("sub_kind", [
  movementJurisdictionChanged,
  movementCviIssued,
  movementTransportRecorded,
]);

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

// Tattoo as secondary identifier. Spec §4.3 + decisions D1-D4 closed 2026-05-22.
// No `registry` enum (D1 — origin lives in free-form `description`).
// `tattoo_code` is normalized (uppercase + strip whitespace) in createTattooForUser
// and lookupByTattoo, NOT in the schema — the schema accepts whatever the writer
// emits so legacy/test payloads with un-normalized codes still validate.
const tattooRecorded = z
  .object(
    withVersion({
      tattoo_code: z.string().min(1),
      location_on_body: z
        .enum(["inner_ear_left", "inner_ear_right", "inner_thigh", "belly", "other"])
        .nullable(),
      description: z.string().nullable(),
      recorded_by: z.string().nullable(),
      recorded_by_organization_id: z.string().uuid().nullable().optional(),
      recorded_by_user_id: z.string().uuid().nullable().optional(),
      // ISO date of the tattoo itself (not the registration in DIM).
      recorded_at: z.string().nullable(),
      // Whether the date is the actual tattoo date (true) or just the
      // registration moment in DIM (false). Defaults to false to be honest
      // about uncertainty for retroactive captures.
      tattoo_date_known: z.boolean().optional(),
    }),
  )
  .strict();

const tattooUpdated = z
  .object(
    withVersion({
      previous_tattoo_code: z.string().nullable(),
      new_tattoo_code: z.string(),
      reason: z.string().nullable(),
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
      // Discriminator for structured note kinds (P0c+). All optional so that
      // existing {category, text} notes continue to validate without changes.
      // P0d will populate finderName/finderContact; P0e will populate photoStoragePath.
      // `adoption_info_requested` (UI-6) marks that a shelter probed an adoption
      // application for more info — a lightweight lifecycle marker that reuses
      // note_added rather than minting a new event type (the catalog was
      // deliberately consolidated). It carries `application_event_id` linking
      // back to the adoption_application_submitted event it concerns.
      kind: z.enum(["sighting", "finder_in_possession", "adoption_info_requested"]).optional(),
      // Set only for kind=adoption_info_requested: the application event the
      // shelter requested more information about. Optional so plain/sighting
      // notes continue to validate.
      application_event_id: z.string().uuid().optional(),
      finderName: z.string().max(80).nullable().optional(),
      finderContact: z.string().max(120).nullable().optional(),
      photoStoragePath: z.string().nullable().optional(),
      // panorama-event-points Slice 1 (PO-approved): how the sighting coordinate
      // was captured, so the map dot can show a subtle precision hint —
      //   gps           — device geolocation (navigator.geolocation)
      //   pin_manual    — the finder dropped/dragged a point on the map
      //   geocodificada — derived from a typed address (forward geocode)
      // OPTIONAL/nullable so every pre-existing note (and non-sighting note)
      // validates unchanged; forward-only, no backfill of old events.
      location_source: z.enum(["gps", "pin_manual", "geocodificada"]).nullable().optional(),
      // Owner "actualizar última ubicación" updates (kind=sighting authored by
      // the owner): the pretty address line, kept separate from `text` (which
      // composes address + note for the feed) so fetchLostEpisodeForPet can
      // overlay it as the episode's current placeName. OPTIONAL/nullable so
      // every pre-existing note validates unchanged; forward-only, no backfill.
      location_description: z.string().nullable().optional(),
      // P0e finder-in-possession extended fields. Optional so that plain notes
      // and sighting notes continue to validate without changes. kind=finder_in_possession
      // rows MUST include these; enforcement is at the action layer (server-side checks).
      location: z
        .object({
          localityName: z.string(),
          provinceCode: z.string().nullable(),
          provinceName: z.string().nullable(),
        })
        .optional(),
      petCondition: z.enum(["bien", "herida", "asustada", "necesita_vet_urgente"]).optional(),
      canKeepUntil: z.string().nullable().optional(),
      canKeepIndefinite: z.boolean().optional(),
      message: z.string().max(500).nullable().optional(),
    }),
  )
  .strict();

// credential_scanned — scan-location contract (Task #45, PO decision obs #733):
//   - scan_ip_area: coarse IP-derived area (city precision MAX) attached to
//     every scanner-role scan; explicit null when the platform geo headers are
//     absent. NEVER contains the raw IP. Self-scans (author_role='owner') do
//     NOT carry it: those rows are identity-linked and exempt from the 90-day
//     purge, so no location may accumulate on them.
//   - scan_coords / scan_accuracy_m: precise GPS, present ONLY when the pet is
//     lost AND the scanner explicitly granted browser geolocation (server
//     re-checks pet.status — the client cannot force coords onto a non-lost pet).
//   - Scanner identity: scanner-role rows are written with
//     recorded_by_user_id = NULL (src/modules/pets/application/scans/log-scan.ts);
//     no payload field may ever identify the scanner.
//   - Retention: all location fields live only on author_role='scanner' rows,
//     purged wholesale at 90 days (lib/infra/scan-retention.ts).
const credentialScanned = z
  .object(
    withVersion({
      is_self_scan: z.boolean(),
      viewer_authenticated: z.boolean(),
      scan_ip_area: z
        .object({
          city: z.string().max(120).nullable(),
          region: z.string().max(120).nullable(),
          country: z.string().max(120).nullable(),
        })
        .strict()
        .nullable()
        .optional(),
      scan_coords: z
        .object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        })
        .strict()
        .optional(),
      scan_accuracy_m: z.number().int().nonnegative().max(1_000_000).optional(),
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
      // Nullable: an observation can legitimately end without a linked bite
      // event (older/seed observations, or an observation opened without a
      // recorded incident). The close MUST NOT fail just because the started
      // event carried no bite_event_id. See professional-close-observation and
      // close-eligible-observations (both coalesce a missing id to null).
      bite_event_id: z.string().uuid().nullable(),
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
// Generic reportable-disease event (handoff P4-3). One row per
// laboratory-confirmed or clinically-suspected zoonosis case. The
// `disease` discriminator carries the specific pathogen so /gob KPI
// tiles can count without introducing a new event_type per disease.
//
// confirmed_by_lab=true means lab corroboration; false means clinical
// suspicion only. date_of_onset is ISO-date (YYYY-MM-DD) of the first
// observed clinical signs.
const diseaseReported = z
  .object(
    withVersion({
      disease: z.enum(["lepto", "hidatidosis", "other"]),
      confirmed_by_lab: z.boolean(),
      date_of_onset: z.string(),
      // Free-form clinical note. Limit kept generous; the column is text.
      clinical_notes: z.string().max(2000).nullable().optional(),
    }),
  )
  .strict();

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
      // L1 jurisdiction (optional). Sprint 4 PR-034 / doc 09 §3.A.
      jurisdiction_province: z.string().nullable().optional(),
      jurisdiction_locality: z.string().nullable().optional(),
      // panorama-event-points Slice 2 (PO-approved 2026-07-08): how the incident
      // coordinate was captured, so the mordeduras map dot can show a subtle
      // precision hint — gps | pin_manual | geocodificada. Same enum as the
      // note_added sighting field. The exact coordinate itself lives on the
      // columnar location_lat/lng (not here). OPTIONAL/nullable so every
      // pre-existing incident validates unchanged (forward-only, no backfill).
      location_source: z.enum(["gps", "pin_manual", "geocodificada"]).nullable().optional(),
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

// Surveillance signal emitted by the system in two flavors:
//   - 'matcher'         — symptom_observed crossed the disease-match
//                         threshold (legacy path, pre-ENO).
//   - 'direct_diagnosis' — vet recorded clinical_info_logged with
//                          sub_kind='disease_diagnosis' (ENO direct
//                          report path, spec 2026-05-19 §6.2).
// NON-libreta (owner never sees this row directly; the public-alert
// notification, when applicable, is a separate write).
// See docs/superpowers/specs/2026-05-17-symptom-disease-surveillance-design.md §4.4
// and docs/superpowers/specs/2026-05-19-eno-vet-direct-report-and-owner-alerts-design.md §6.2.
const outbreakSignal = z
  .object(
    withVersion({
      // Required when triggered_by='matcher'; null when 'direct_diagnosis'.
      source_symptom_event_id: z.string().uuid().nullable().optional(),
      // Required when triggered_by='direct_diagnosis'; null when 'matcher'.
      source_disease_diagnosis_event_id: z.string().uuid().nullable().optional(),
      // Path discriminator. Optional for back-compat: rows written before
      // ENO are implicitly 'matcher' (read path defaults).
      triggered_by: z.enum(["matcher", "direct_diagnosis"]).optional(),
      // True when the vet attested a confirmatory lab result (ENO §6.1).
      // Lifts the signal severity in govt dashboards.
      confirmed_by_lab: z.boolean().optional(),
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
  .strict()
  .superRefine((p, ctx) => {
    // When triggered_by is set, enforce the source-event invariant. When
    // undefined (historical rows / matcher path), require source_symptom_event_id
    // to preserve the original contract.
    const path = p.triggered_by ?? "matcher";
    if (path === "matcher" && !p.source_symptom_event_id) {
      ctx.addIssue({
        code: "custom",
        message: "source_symptom_event_id is required when triggered_by='matcher'",
        path: ["source_symptom_event_id"],
      });
    }
    if (path === "direct_diagnosis" && !p.source_disease_diagnosis_event_id) {
      ctx.addIssue({
        code: "custom",
        message:
          "source_disease_diagnosis_event_id is required when triggered_by='direct_diagnosis'",
        path: ["source_disease_diagnosis_event_id"],
      });
    }
  });

// ---------------------------------------------------------------------------
// Custody & adoption (refugio portal)
// ---------------------------------------------------------------------------

// Intake event fired when an org takes custody of an animal. The payload
// captures intake-specific info (reason, body condition, jurisdiction) so
// pet_registered can stay universal across owner / refugio / citizen flows.
// Authority side-effects (DGSA notification on seizure, etc.) hook off this
// event via projections in later phases — keep the payload spec'd to AGENTS.md
// → Custody & adoption.
// Seizure-motive enum per spec §4.3 (2026-05-19-decomiso-welfare-authority-design.md DC4).
// Same set as welfareReportKindEnum, generalised slightly for decomiso context.
const seizureMotiveEnum = z.enum([
  "maltrato_fisico",
  "abandono_extremo",
  "acumulacion",
  "trafico",
  "sin_refugio_critico",
  "pelea_de_perros",
  "otro",
]);

const shelterIntakeRecorded = z
  .object(
    withVersion({
      intake_reason: z.enum(["rescue", "surrender", "seizure", "stray_found", "other"]),
      intake_condition: z.string().nullable(),
      rescue_jurisdiction: z.string().nullable(),

      // Decomiso (seizure) extension — spec §4.3.
      // All fields are optional/nullable so non-seizure intakes are unaffected.
      // The superRefine below enforces conditional requirements on seizure intakes.
      seizure_motive: seizureMotiveEnum.nullable().optional(),
      seizure_motive_other_detail: z.string().nullable().optional(),
      judicial_proceeding_reference: z.string().nullable().optional(),
      originating_welfare_report_id: z.string().uuid().nullable().optional(),
      intended_receiver_organization_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict()
  .superRefine((p, ctx) => {
    // Spec §4.3: when intake_reason === 'seizure', seizure_motive AND
    // intended_receiver_organization_id are required. Additionally,
    // seizure_motive_other_detail is required when seizure_motive === 'otro'.
    // Non-seizure intakes are unaffected — all new fields remain optional.
    if (p.intake_reason === "seizure") {
      if (!p.seizure_motive) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "seizure_motive required when intake_reason is seizure",
          path: ["seizure_motive"],
        });
      }
      if (p.seizure_motive === "otro" && !p.seizure_motive_other_detail) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "seizure_motive_other_detail required when seizure_motive is otro",
          path: ["seizure_motive_other_detail"],
        });
      }
      if (!p.intended_receiver_organization_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "intended_receiver_organization_id required when intake_reason is seizure",
          path: ["intended_receiver_organization_id"],
        });
      }
    }
  });

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
      // When the adoption was finalized FROM an approved online application,
      // this links back to that `adoption_application_submitted` event so the
      // custody chain records that ownership landed on the applicant's real
      // account (not a typed-DNI stub). Null / omitted for offline adoptions.
      adopted_from_application_id: z.string().uuid().nullable().optional(),
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

// P2P owner→owner transfer reasons. Mirrors OWNER_TRANSFER_REASONS in the
// transfers domain (src/modules/transfers/domain/types.ts) — kept inline so
// lib/events stays free of src/modules imports (dependency direction).
const p2pTransferReason = z.enum(["sale", "gift", "inheritance", "other"]);

// Custody transferred — owner→owner peer-to-peer variant. A miMAR citizen
// gifts / sells / bequeaths a pet to another citizen through the PTR
// proposal→accept handshake (src/modules/transfers/application/accept-pet-transfer).
// BOTH actors hold the `owner` role, the `reason` comes from the P2P reason set
// (sale/gift/inheritance/other), and the payload carries the PTR `transfer_token`
// linking back to the pet_transfers proposal row. This is a genuinely distinct
// shape from the org/custody variant above (which carries org ids, the org
// handoff reason set, and the foster-cascade fields foster_ended_event_id/notes),
// so custody_transferred validates as a UNION of the two.
//
// Why z.union and not z.discriminatedUnion: the two variants share no single
// literal discriminator key — what distinguishes them is the presence of
// `transfer_token` / the owner→owner shape. A real discriminated union would
// force adding a discriminator field to every org emitter (accept-cross-org,
// return-to-owner, decomiso, disputes, foster, intake), which is both invasive
// and cross-lane. Keeping the org variant byte-for-byte unchanged means no org
// emitter changes; the strict() on each variant makes the two mutually
// exclusive (an org payload fails the P2P strict shape and vice versa).
const custodyTransferredP2P = z
  .object(
    withVersion({
      from_user_id: z.string().uuid(),
      to_user_id: z.string().uuid(),
      from_role: z.literal("owner"),
      to_role: z.literal("owner"),
      reason: p2pTransferReason,
      transfer_token: z.string(),
    }),
  )
  .strict();

// custody_transferred is polymorphic across two legitimate channels:
// org/custody handoffs (custodyTransferred) OR owner→owner P2P
// (custodyTransferredP2P). Org variant is listed first so org payloads validate
// against the unchanged shape.
const custodyTransferredEvent = z.union([custodyTransferred, custodyTransferredP2P]);

// Ownership claimed — direct claim of a free pet (claim wizard variant
// "free"). The pet is chip/tattoo-registered but has NO active custody of any
// role, so there is no "from" actor and custody_transferred does not apply
// (its schema requires one). The claimant opens a fresh owner ownership in
// the same tx that emits this event.
const ownershipClaimed = z
  .object(
    withVersion({
      claimed_by_user_id: z.string().uuid(),
      // How the claimant identified the pet in the wizard.
      identifier_kind: z.enum(["microchip", "tattoo"]),
    }),
  )
  .strict();

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
// profile_sharing_consent_at captures when the applicant ticked the consent
// checkbox (spec §12.5 addendum v1.4). Stored in the event payload rather
// than a separate table — the table was never created; event-sourced log is
// the single source of truth.
// v2 (PR-14 adoption UX): adds motivation + prior_pets as required nullable
// keys. The v1→v2 upcaster in lib/event-upcasters.ts fills both with null
// for historical rows, per docs/superpowers/event-versioning.md.
const adoptionApplicationSubmitted = z
  .object({
    payload_version: z.literal(2).default(2),
    applicant_user_id: z.string().uuid(),
    related_organization_id: z.string().uuid(),
    housing_type: z.enum(["casa_con_patio", "casa_sin_patio", "departamento", "otro"]),
    other_pets: z.string().nullable(),
    daily_routine: z.string().nullable(),
    notes: z.string().nullable(),
    profile_sharing_consent_at: z.string().datetime(),
    motivation: z.string().nullable(),
    prior_pets: z.enum(["yes_currently", "yes_before", "no"]).nullable(),
  })
  .strict();

// Adoption application resolved — umbrella for approved + rejected +
// withdrawn decisions (catalog cleanup 2026-05-19; "withdrawn" added UI-6
// 2026-06-12). The shelter's admin/coordinator emits the approved/rejected
// variants from the org portal when reviewing a postulation, and the
// finalize-cascade in adoption.ts emits the `rejected + auto_generated`
// variant for sibling applications when one application is finalized
// (spec adoption-listing-public §12 Fase 5.5).
//
// outcome === "rejected" → reason should be set (required by app-layer
// for manual rejections; the cascade uses literal "another_application_finalized").
// outcome === "approved" → reason is optional.
// outcome === "withdrawn" → the APPLICANT retracted their own pending
// application. reviewer_user_id carries the applicant's own user id (the
// actor who resolved it); no shelter reviewer is involved.
// Zod stays permissive on the correlation; the server actions enforce it.
const adoptionApplicationResolved = z
  .object(
    withVersion({
      application_event_id: z.string().uuid(),
      reviewer_user_id: z.string().uuid(),
      outcome: z.enum(["approved", "rejected", "withdrawn"]),
      reason: z.string().nullable().optional(),
      auto_generated: z.boolean().default(false).optional(),
      notes: z.string().nullable().optional(),
    }),
  )
  .strict();

// Custody dispute raised — flags the pet as subject to an ownership dispute.
// Sets `pets.in_custody_dispute = true` via dual-write from the server action.
//
// Raised by:
//   - admin/govt: external legal proceedings (divorce, succession, seizure)
//   - owner:      self-raised claim via /mis-mascotas/reclamar (P3-1, 2026-05-28).
//                 Triggered when a user submits the claim wizard's variant B
//                 (chip/tatuaje match → existing active owner). Govt/admin
//                 still adjudicates resolution via custody_dispute_resolved.
const custodyDisputeRaised = z
  .object(
    withVersion({
      raised_by_role: z.enum(["admin", "govt", "owner"]),
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

// Custody transfer cancelled — structured termination of a
// custody_transfer_proposed (ARCH-B). Replaces the fragile marker-text
// note_added that was previously used to signal cancellation.
// cancelled_by discriminates who terminated the proposal:
//   owner_reject   — the owner actively rejected it
//   actor_cancel   — the proposing actor withdrew it
//   org_reject     — the receiving org rejected an owner-initiated proposal
//   auto_cancel    — system auto-cancelled during the owner-accept precondition check
const custodyTransferCancelled = z
  .object(
    withVersion({
      // The custody_transfer_proposed event being cancelled.
      proposal_event_id: z.string().uuid(),
      cancelled_by: z.enum(["owner_reject", "actor_cancel", "org_reject", "auto_cancel"]),
      reason: z.string().nullable(),
    }),
  )
  .strict();

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
      // Roles carried through the handshake so ACCEPT can honor the requested
      // outcome. `from_role` is the source ownership role being handed off;
      // `to_role` is the role the destination will hold once accepted
      // (shelter_custody = temporary custody, owner = permanent owner). Both
      // optional for backwards-compat: pre-extension proposals (and the
      // return-to-owner / owner→owner handshakes) omit them and ACCEPT defaults
      // to shelter_custody.
      from_role: z.enum(["shelter_custody", "owner"]).optional(),
      to_role: z.enum(["shelter_custody", "owner"]).optional(),
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
      // L1 jurisdiction (optional). Sprint 4 PR-034 / doc 09 §3.A.
      jurisdiction_province: z.string().nullable().optional(),
      jurisdiction_locality: z.string().nullable().optional(),
    }),
  )
  .strict();

// Libreta Tier-2 share view telemetry used to live here as
// `libreta_shared_viewed`. The 2026-05-19 catalog cleanup moved that signal out
// of pet_events into a dedicated `share_telemetry` table, and migration 0167
// (TEL-1, PO 2026-08-04) dropped that table too — it had no reader. Share views
// are now only a counter on libreta_share_tokens. No Zod schema either way.

// ---------------------------------------------------------------------------
// Correction by amendment (D1 — Wave 2 Item 15, 2026-06-19)
// ---------------------------------------------------------------------------
//
// event_amended is the canonical correction mechanism (AGENTS.md core
// principle #2). It references an original event; never mutates it.
//
// `changes` calcs `pet_profile_updated` shape — array of {field, old, new}.
// `actor_role` + `actor_user_id` + `reason` calc `microchip_replaced`.
//
// Allowlist enforcement lives in lib/amendment.ts (AMENDABLE_EVENT_TYPES).
// D5: admin/govt → reason mandatory (min 5 chars), audit logged, owner notified.
// Amendment-of-amendment: allowed; always references the ORIGINAL target_event_id
// so the chain is always one hop from the root event (auditable, not nested).
const eventAmended = z
  .object(
    withVersion({
      // UUID of the event being corrected. Immutable pointer; must be a valid
      // pet_event row for the same pet. Validated server-side in the action.
      target_event_id: z.string().uuid(),
      // Human-readable reason for the correction. Required for admin/govt (D5);
      // optional for owner/vet. Min 5 chars when provided.
      reason: z.string().min(5).nullable(),
      // Structured changelog — same shape as pet_profile_updated.changes.
      // Each entry records ONE field change: field key, old value, new value.
      changes: z
        .array(
          z.object({
            field: z.string(),
            old: z.unknown(),
            new: z.unknown(),
          }),
        )
        .min(1),
      // Who performed the amendment — determines audit + notification path (D5).
      actor_role: z.enum(["owner", "vet", "admin", "govt"]).default("owner"),
      // UUID of the user performing the amendment. Optional: owner-path writes
      // it automatically from the session; nullable for back-compat.
      actor_user_id: z.string().uuid().nullable().optional(),
    }),
  )
  .strict();

// ---------------------------------------------------------------------------
// Physical tag (chapa) lifecycle — migration 0169
// ---------------------------------------------------------------------------
//
// SECURITY INVARIANT: neither payload may EVER carry the activation code —
// plaintext or hashed, under any field name. `.strict()` enforces it: an
// accidental `code` / `activation_code` key throws at validate() time before
// the row reaches the immutable spine.

// Owner self-activation of a manufactured tag. `source` is fixed to "self" in
// v1 (admin-assisted activation would be a new source value, not a new type).
const tagActivated = z
  .object(
    withVersion({
      serial: z.string().min(1),
      lote_id: z.string().nullable(),
      source: z.literal("self"),
    }),
  )
  .strict();

// Owner revocation of an ACTIVE tag (design D4: blank tags cannot be revoked —
// there is no pet to hang the event on). Payload key is `revoke_reason`, NOT
// `reason`: erase_subject_data (0159→0166) sentinel-redacts the key `reason`
// across ALL event types on subject erasure, which would destroy this enum
// fact (design D5). `replacement_serial` links to the new tag when the owner
// revokes to replace (e.g. after a custody transfer).
const tagRevoked = z
  .object(
    withVersion({
      serial: z.string().min(1),
      revoke_reason: z.enum(["lost", "damaged", "transfer", "fraud", "owner_request", "other"]),
      replacement_serial: z.string().nullable(),
    }),
  )
  .strict();

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
  tattoo_recorded: tattooRecorded,
  tattoo_updated: tattooUpdated,
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
  disease_reported: diseaseReported,
  shelter_intake_recorded: shelterIntakeRecorded,
  foster_assigned: fosterAssigned,
  foster_ended: fosterEnded,
  adoption_finalized: adoptionFinalized,
  adoption_reversed: adoptionReversed,
  adoption_application_submitted: adoptionApplicationSubmitted,
  adoption_application_resolved: adoptionApplicationResolved,
  post_adoption_checkin: postAdoptionCheckin,
  custody_transferred: custodyTransferredEvent,
  ownership_claimed: ownershipClaimed,
  custody_transfer_proposed: custodyTransferProposed,
  custody_transfer_cancelled: custodyTransferCancelled,
  custody_dispute_raised: custodyDisputeRaised,
  custody_dispute_resolved: custodyDisputeResolved,
  foster_proposed: fosterProposed,
  foster_proposal_resolved: fosterProposalResolved,
  foster_co_foster_allowed: fosterCoFosterAllowed,
  adoption_eligibility_set: adoptionEligibilitySet,
  movement_recorded: movementRecorded,
  event_amended: eventAmended,
  tag_activated: tagActivated,
  tag_revoked: tagRevoked,
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
 * Called at the use-case edge by writers in app/actions/* and src/modules/*,
 * AND enforced at the repository insert boundary via
 * lib/events/validated-event-values.ts (EventsRepository / WelfareRepository) —
 * so a writer that skips the edge call still cannot append an invalid payload.
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
