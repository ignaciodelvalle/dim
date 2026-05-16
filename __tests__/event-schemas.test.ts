// Coverage + roundtrip tests for lib/event-schemas.ts.
//
// These are pure unit tests — no DB, no Supabase, no network. The point is:
// (a) every implemented event type has a registered schema (catches the
//     case where a new writer ships without a schema), and
// (b) each schema accepts the canonical payload shape its real writer
//     produces today (regression catch for accidental shape edits).

import { describe, expect, it } from "vitest";

import { EVENT_TYPES, type EventType } from "@/db/schema";
import {
  EventPayloadValidationError,
  IMPLEMENTED_EVENT_TYPES,
  PayloadSchemas,
  validateEventPayload,
} from "@/lib/event-schemas";

// Event types from EVENT_TYPES that have NO writer today. Keeping this list
// explicit (rather than computing it) means a new writer added without a
// schema will fail the coverage test — which is exactly the regression
// guard we want.
const UNIMPLEMENTED: ReadonlyArray<EventType> = [
  "lab_work_performed",
  "imaging_performed",
  "surgery_performed",
  "allergy_detected",
  "incident_reported",
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
];

describe("PayloadSchemas — coverage", () => {
  it("every event type with a real writer has a registered schema", () => {
    const expected = EVENT_TYPES.filter((t) => !UNIMPLEMENTED.includes(t));
    expect(IMPLEMENTED_EVENT_TYPES.slice().sort()).toEqual(expected.slice().sort());
  });

  it("validateEventPayload throws for an event type with no schema", () => {
    expect(() => validateEventPayload("shelter_intake_recorded", {})).toThrow(
      EventPayloadValidationError,
    );
  });

  it("validateEventPayload fills in payload_version when missing", () => {
    const result = validateEventPayload("weight_recorded", { kg: "12.50" }) as Record<
      string,
      unknown
    >;
    expect(result.payload_version).toBe(1);
  });

  it("validateEventPayload accepts payload_version=1 when provided explicitly", () => {
    const result = validateEventPayload("weight_recorded", {
      kg: "12.50",
      payload_version: 1,
    }) as Record<string, unknown>;
    expect(result.payload_version).toBe(1);
  });

  it("validateEventPayload rejects payload_version=2 (no upcaster registered yet)", () => {
    expect(() =>
      validateEventPayload("weight_recorded", { kg: "12.50", payload_version: 2 }),
    ).toThrow(EventPayloadValidationError);
  });
});

describe("PayloadSchemas — canonical writer payloads", () => {
  // For each event type, one example payload that mirrors what the real
  // writer in app/actions/* produces. If a writer changes shape, the
  // corresponding case here should fail.

  it("pet_registered accepts the full snake_case payload", () => {
    expect(() =>
      validateEventPayload("pet_registered", {
        name: "Lila",
        species: "dog",
        sex: "female",
        breed: null,
        date_of_birth: "2022-03-14",
        birth_date_is_estimated: true,
        color: null,
        microchip_id: null,
        microchip_country_code: null,
        microchip_implanted_at: null,
        microchip_implanted_by: null,
        microchip_location: null,
        estimated_weight_kg: null,
        favourite_foods: [],
        known_allergies: [],
        training_level: null,
        insurance_company: null,
        insurance_policy_number: null,
        jurisdiction_province: null,
        jurisdiction_locality: null,
        potentially_dangerous_breed: false,
        acquisition_method: "adopted",
        has_photo: true,
        has_microchip: false,
      }),
    ).not.toThrow();
  });

  it("pet_registered now rejects legacy camelCase keys (no more passthrough)", () => {
    expect(() =>
      validateEventPayload("pet_registered", {
        name: "Lila",
        species: "dog",
        sex: "female",
        breed: null,
        date_of_birth: null,
        birth_date_is_estimated: false,
        color: null,
        microchip_id: null,
        microchip_country_code: null,
        microchip_implanted_at: null,
        microchip_implanted_by: null,
        microchip_location: null,
        estimated_weight_kg: null,
        favourite_foods: [],
        known_allergies: [],
        training_level: null,
        insurance_company: null,
        insurance_policy_number: null,
        jurisdiction_province: null,
        jurisdiction_locality: null,
        potentially_dangerous_breed: false,
        acquisition_method: null,
        has_photo: false,
        has_microchip: false,
        // Drift: a leaked UI preference (the original bug this cleanup closes).
        emergencyInfoVisible: false,
      }),
    ).toThrow(EventPayloadValidationError);
  });

  it("pet_profile_updated accepts changes + photo_replaced", () => {
    expect(() =>
      validateEventPayload("pet_profile_updated", {
        changes: [{ field: "name", old: "Lila", new: "Lilita" }],
        photo_replaced: false,
      }),
    ).not.toThrow();
  });

  it("status_changed accepts both lost (full keys) and found (minimal keys)", () => {
    expect(() =>
      validateEventPayload("status_changed", {
        from_status: "active",
        to_status: "lost",
        location_description: "Plaza Irlanda",
        reason: "Se escapó por la puerta",
      }),
    ).not.toThrow();
    expect(() =>
      validateEventPayload("status_changed", {
        from_status: "lost",
        to_status: "active",
      }),
    ).not.toThrow();
  });

  it("death_recorded accepts a full payload", () => {
    expect(() =>
      validateEventPayload("death_recorded", {
        cause: "disease",
        cause_detail: null,
        confirmed_by_vet: true,
        vet_name: "Dr. García",
        disposition_method: "cremation_individual_ashes",
        facility: null,
        death_at_clinic: true,
        clinic_name: "Clínica Veterinaria del Sur",
        vet_contacted_owner: "yes",
        vet_decided_alone: null,
        owner_to_private_crematorium: null,
        disease_code: "A82",
        confirmed_by_lab: true,
        is_reportable: true,
      }),
    ).not.toThrow();
  });

  it("vaccination_administered", () => {
    expect(() =>
      validateEventPayload("vaccination_administered", {
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: "2027-05-16T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("deworming_administered", () => {
    expect(() =>
      validateEventPayload("deworming_administered", {
        product: "Drontal Plus",
        type: "internal",
        next_due_at: null,
      }),
    ).not.toThrow();
  });

  it("sterilization_performed", () => {
    expect(() =>
      validateEventPayload("sterilization_performed", {
        procedure: "spay",
        performed_by: null,
        clinic: null,
      }),
    ).not.toThrow();
  });

  it("medication_started", () => {
    expect(() =>
      validateEventPayload("medication_started", {
        drug_name: "Apoquel",
        dose: "5.4 mg",
        frequency: "twice_daily",
        prescribed_by: null,
        drug_code: "apoquel",
        first_dose_at: "2026-05-16T18:00:00.000Z",
        duration_days: 14,
        custom_hours: null,
        schedule_count: 28,
      }),
    ).not.toThrow();
  });

  it("medication_stopped", () => {
    expect(() =>
      validateEventPayload("medication_stopped", {
        medication_started_event_id: "00000000-0000-4000-8000-000000000001",
        reason: null,
      }),
    ).not.toThrow();
  });

  it("medication_dose_taken accepts null source event id", () => {
    expect(() =>
      validateEventPayload("medication_dose_taken", {
        medication_started_event_id: null,
        scheduled_for: "2026-05-16T18:00:00.000Z",
        reminder_id: "00000000-0000-4000-8000-000000000002",
      }),
    ).not.toThrow();
  });

  it("vet_visit_logged", () => {
    expect(() =>
      validateEventPayload("vet_visit_logged", {
        reason: "Control anual",
        diagnosis: null,
        vet_name: null,
        clinic: null,
      }),
    ).not.toThrow();
  });

  it("weight_recorded", () => {
    expect(() => validateEventPayload("weight_recorded", { kg: "8.50" })).not.toThrow();
  });

  it("microchip_implanted accepts shape from both writer variants", () => {
    // createMicrochipAction — no implant_date_known
    expect(() =>
      validateEventPayload("microchip_implanted", {
        chip_number: "900215000123456",
        country_code: "032",
        implanted_by: "Dra. Pérez",
        location_on_body: "cuello",
      }),
    ).not.toThrow();
    // pets.ts writers — include implant_date_known
    expect(() =>
      validateEventPayload("microchip_implanted", {
        chip_number: "900215000123456",
        country_code: null,
        implanted_by: null,
        location_on_body: null,
        implant_date_known: false,
      }),
    ).not.toThrow();
  });

  it("dangerous_breed_attested", () => {
    expect(() =>
      validateEventPayload("dangerous_breed_attested", {
        registry: "caba_4078",
        registry_id: "CABA-12345",
        attested_at: "2026-05-16",
      }),
    ).not.toThrow();
  });

  it("note_added", () => {
    expect(() =>
      validateEventPayload("note_added", {
        category: "comportamiento",
        text: "Empezó a ladrar cuando suena el timbre.",
      }),
    ).not.toThrow();
  });

  it("credential_scanned", () => {
    expect(() =>
      validateEventPayload("credential_scanned", {
        is_self_scan: true,
        viewer_authenticated: true,
      }),
    ).not.toThrow();
  });

  it("clinical_info_logged", () => {
    expect(() =>
      validateEventPayload("clinical_info_logged", {
        sub_kind: "lab_work",
        title: "Hemograma completo",
        details: null,
        performed_by: null,
      }),
    ).not.toThrow();
  });

  it("abandonment_reported", () => {
    expect(() =>
      validateEventPayload("abandonment_reported", {
        welfare_report_id: "00000000-0000-4000-8000-000000000003",
        reporter_role: "witness",
        description: "Está sola en la calle hace tres días.",
      }),
    ).not.toThrow();
  });

  it("maltreatment_reported", () => {
    expect(() =>
      validateEventPayload("maltreatment_reported", {
        welfare_report_id: "00000000-0000-4000-8000-000000000004",
        reporter_role: "witness",
        description: "Atada todo el día sin agua.",
        severity: "high",
        kind: "chained",
      }),
    ).not.toThrow();
  });

  it("symptom_observed", () => {
    expect(() =>
      validateEventPayload("symptom_observed", {
        welfare_report_id: "00000000-0000-4000-8000-000000000005",
        reporter_role: "owner",
        symptoms: "Tos seca persistente.",
      }),
    ).not.toThrow();
  });
});

describe("PayloadSchemas — drift catches", () => {
  it("rejects unknown keys on strict schemas (vaccination)", () => {
    expect(() =>
      validateEventPayload("vaccination_administered", {
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: null,
        // Drift: unexpected key
        rabies_serotype: "X",
      }),
    ).toThrow(EventPayloadValidationError);
  });

  it("rejects wrong-type values", () => {
    expect(() => validateEventPayload("weight_recorded", { kg: 8.5 })).toThrow(
      EventPayloadValidationError,
    );
  });

  it("rejects missing required keys", () => {
    expect(() =>
      validateEventPayload("medication_started", {
        // missing drug_name, dose, etc.
        frequency: "single_dose",
      }),
    ).toThrow(EventPayloadValidationError);
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      validateEventPayload("status_changed", {
        from_status: "alive", // not in enum
        to_status: "lost",
      }),
    ).toThrow(EventPayloadValidationError);
  });

  it("registry contains exactly the implemented set (no orphans)", () => {
    for (const t of IMPLEMENTED_EVENT_TYPES) {
      expect(PayloadSchemas[t]).toBeDefined();
    }
    for (const t of UNIMPLEMENTED) {
      expect(PayloadSchemas[t]).toBeUndefined();
    }
  });
});
