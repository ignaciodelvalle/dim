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
