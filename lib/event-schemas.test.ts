// Tests for the refactored symptomObserved schema and the new outbreakSignal schema.
// Added in surveillance Fase 2.

import { describe, expect, it } from "vitest";

import { validateEventPayload } from "@/lib/event-schemas";

describe("symptomObserved payload schema (refactored)", () => {
  it("accepts libreta-source payload with null welfare_report_id", () => {
    expect(() =>
      validateEventPayload("symptom_observed", {
        source: "libreta",
        welfare_report_id: null,
        reporter_role: "owner",
        free_text: "vomita y tiene fiebre",
        matched_symptom_codes: ["vomiting", "high_fever"],
        alerted_disease_codes: [],
        severity_self_assessed: "moderate",
        onset_at: null,
      }),
    ).not.toThrow();
  });

  it("rejects libreta-source payload with welfare_report_id set", () => {
    expect(() =>
      validateEventPayload("symptom_observed", {
        source: "libreta",
        welfare_report_id: "550e8400-e29b-41d4-a716-446655440000",
        reporter_role: "owner",
        free_text: "vomita",
        matched_symptom_codes: [],
        alerted_disease_codes: [],
        severity_self_assessed: null,
        onset_at: null,
      }),
    ).toThrow();
  });

  it("accepts welfare_report-source payload with welfare_report_id", () => {
    expect(() =>
      validateEventPayload("symptom_observed", {
        source: "welfare_report",
        welfare_report_id: "550e8400-e29b-41d4-a716-446655440000",
        reporter_role: "witness",
        free_text: "el perro está flaco",
        matched_symptom_codes: [],
        alerted_disease_codes: [],
        severity_self_assessed: null,
        onset_at: null,
      }),
    ).not.toThrow();
  });

  it("rejects welfare_report-source payload without welfare_report_id", () => {
    expect(() =>
      validateEventPayload("symptom_observed", {
        source: "welfare_report",
        welfare_report_id: null,
        reporter_role: "witness",
        free_text: "...",
        matched_symptom_codes: [],
        alerted_disease_codes: [],
        severity_self_assessed: null,
        onset_at: null,
      }),
    ).toThrow();
  });
});

describe("outbreakSignal payload schema", () => {
  it("accepts a complete payload", () => {
    expect(() =>
      validateEventPayload("outbreak_signal", {
        source_symptom_event_id: "550e8400-e29b-41d4-a716-446655440000",
        disease_code: "rabies_suspected",
        disease_label: "Sospecha de rabia",
        match_strength: {
          high_count: 2,
          medium_count: 0,
          low_count: 1,
          matched_symptom_codes: ["hypersalivation", "aggression_unusual", "lethargy"],
        },
        pet_jurisdiction_country: "AR",
        pet_jurisdiction_province: "AR-C",
        pet_jurisdiction_locality: "Belgrano",
        pet_species: "dog",
      }),
    ).not.toThrow();
  });

  it("rejects extra keys (strict mode)", () => {
    expect(() =>
      validateEventPayload("outbreak_signal", {
        source_symptom_event_id: "550e8400-e29b-41d4-a716-446655440000",
        disease_code: "rabies_suspected",
        disease_label: "Sospecha de rabia",
        match_strength: {
          high_count: 1,
          medium_count: 0,
          low_count: 0,
          matched_symptom_codes: ["hypersalivation"],
        },
        pet_jurisdiction_country: "AR",
        pet_jurisdiction_province: null,
        pet_jurisdiction_locality: null,
        pet_species: "dog",
        unknown_field: "this should fail",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase-2 catalog cleanup (2026-05-19) — coverage for the new umbrella events.
// ---------------------------------------------------------------------------

describe("foster_proposal_resolved payload schema", () => {
  it("accepts outcome=accepted with response_notes", () => {
    expect(
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "accepted",
        response_notes: "Encantada, lo busco el domingo.",
      }),
    ).toBeTruthy();
  });

  it("accepts outcome=rejected with rejection_reason + notes", () => {
    expect(
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "rejected",
        rejection_reason: "capacity",
        response_notes: "No tengo lugar para uno más este mes.",
      }),
    ).toBeTruthy();
  });

  it("accepts outcome=cancelled with cancellation_reason and auto_cancelled", () => {
    expect(
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "cancelled",
        cancellation_reason: "volunteer_accepted_another",
        auto_cancelled: true,
      }),
    ).toBeTruthy();
  });

  it("accepts outcome=expired with only proposal_public_token", () => {
    expect(
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "expired",
      }),
    ).toBeTruthy();
  });

  it("rejects unknown outcome value", () => {
    expect(() =>
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "what",
      }),
    ).toThrow();
  });

  it("rejects extra keys (strict)", () => {
    expect(() =>
      validateEventPayload("foster_proposal_resolved", {
        proposal_public_token: "FP-AAAA-BBBB",
        outcome: "accepted",
        bogus_field: 1,
      }),
    ).toThrow();
  });
});

describe("adoption_application_resolved payload schema", () => {
  const APP_ID = "550e8400-e29b-41d4-a716-446655440000";
  const REVIEWER_ID = "550e8400-e29b-41d4-a716-446655440001";

  it("accepts outcome=approved with notes only", () => {
    expect(
      validateEventPayload("adoption_application_resolved", {
        application_event_id: APP_ID,
        reviewer_user_id: REVIEWER_ID,
        outcome: "approved",
        notes: "Buen match, avanzamos.",
      }),
    ).toBeTruthy();
  });

  it("accepts outcome=rejected with reason + auto_generated=true (F5.5 cascade shape)", () => {
    expect(
      validateEventPayload("adoption_application_resolved", {
        application_event_id: APP_ID,
        reviewer_user_id: REVIEWER_ID,
        outcome: "rejected",
        reason: "another_application_finalized",
        auto_generated: true,
        notes: null,
      }),
    ).toBeTruthy();
  });

  it("rejects unknown outcome value", () => {
    expect(() =>
      validateEventPayload("adoption_application_resolved", {
        application_event_id: APP_ID,
        reviewer_user_id: REVIEWER_ID,
        outcome: "maybe",
      }),
    ).toThrow();
  });
});

describe("adoption_reversed payload schema", () => {
  it.each(["shelter", "adopter", "court"] as const)("accepts actor=%s", (actor) => {
    expect(
      validateEventPayload("adoption_reversed", {
        actor,
        reason: "test",
      }),
    ).toBeTruthy();
  });

  it("allows reverted_finalization_event_id null (pre-event-sourcing data)", () => {
    expect(
      validateEventPayload("adoption_reversed", {
        actor: "shelter",
        reason: null,
        reverted_finalization_event_id: null,
      }),
    ).toBeTruthy();
  });

  it("rejects unknown actor", () => {
    expect(() =>
      validateEventPayload("adoption_reversed", {
        actor: "stranger",
        reason: null,
      }),
    ).toThrow();
  });
});

describe("microchip_replaced payload schema (merged with revoked)", () => {
  it("accepts new_chip_number string (replacement branch)", () => {
    expect(
      validateEventPayload("microchip_replaced", {
        previous_chip_number: "111111111111111",
        new_chip_number: "222222222222222",
        reason: "damaged",
        replaced_by: "Vet Petlovers",
        replaced_at: "2026-05-19",
      }),
    ).toBeTruthy();
  });

  it("accepts new_chip_number null (revocation branch) with institutional actor", () => {
    expect(
      validateEventPayload("microchip_replaced", {
        previous_chip_number: "111111111111111",
        new_chip_number: null,
        reason: "fraud_detected",
        replaced_by: null,
        replaced_at: "2026-05-19",
        actor_role: "admin",
        actor_user_id: "550e8400-e29b-41d4-a716-446655440099",
        notes: "Two pets claiming the same chip.",
      }),
    ).toBeTruthy();
  });

  it("accepts reason values from both legacy enums", () => {
    for (const reason of [
      "damaged",
      "unreadable",
      "duplicate_detected",
      "fraud_detected",
      "owner_request",
      "device_failure",
      "other",
    ]) {
      expect(
        validateEventPayload("microchip_replaced", {
          previous_chip_number: "111111111111111",
          new_chip_number: null,
          reason,
          replaced_by: null,
          replaced_at: "2026-05-19",
        }),
      ).toBeTruthy();
    }
  });

  it("rejects unknown reason", () => {
    expect(() =>
      validateEventPayload("microchip_replaced", {
        previous_chip_number: "111111111111111",
        new_chip_number: "222222222222222",
        reason: "vibes",
        replaced_by: null,
        replaced_at: "2026-05-19",
      }),
    ).toThrow();
  });
});
