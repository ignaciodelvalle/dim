// Unit tests for lib/event-outbox-rules.ts
//
// Strict TDD mode: tests written before implementation.
// Test runner: pnpm vitest

import { describe, expect, it } from "vitest";

import { OUTBOX_RULES } from "./event-outbox-rules";

// ---------------------------------------------------------------------------
// clinical_info_logged — disease_diagnosis sub_kind
// ---------------------------------------------------------------------------

describe("OUTBOX_RULES[clinical_info_logged]", () => {
  const rules = OUTBOX_RULES.clinical_info_logged ?? [];

  it("has exactly one rule (govt_webhook)", () => {
    expect(rules).toHaveLength(1);
    expect(rules[0].target_kind).toBe("govt_webhook");
  });

  it("rabies_confirmed diagnosis → returns notifyHours (24) via ENO catalog bridge", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      sub_kind: "disease_diagnosis",
      disease_code: "rabies_confirmed", // diseases.ts code → ENO 'rabies' (24h)
    });
    expect(slaHours).toBe(24);
  });

  it("leptospirosis diagnosis → returns notifyHours (48) from ENO catalog (direct match)", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      sub_kind: "disease_diagnosis",
      disease_code: "leptospirosis",
    });
    expect(slaHours).toBe(48);
  });

  it("unknown_disease diagnosis → returns null (no rule fires)", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      sub_kind: "disease_diagnosis",
      disease_code: "unknown_disease_xyz",
    });
    expect(slaHours).toBeNull();
  });

  it("non-disease sub_kind → returns null", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      sub_kind: "lab_work",
      disease_code: "rabies",
    });
    expect(slaHours).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// outbreak_signal
// ---------------------------------------------------------------------------

describe("OUTBOX_RULES[outbreak_signal]", () => {
  const rules = OUTBOX_RULES.outbreak_signal ?? [];

  it("has exactly one rule (govt_webhook)", () => {
    expect(rules).toHaveLength(1);
    expect(rules[0].target_kind).toBe("govt_webhook");
  });

  it("outbreak_signal with rabies_suspected (maps to ENO 'rabies', critical) → 24 hours", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      disease_code: "rabies_suspected", // diseases.ts code → ENO 'rabies'
    });
    expect(slaHours).toBe(24);
  });

  it("outbreak_signal with leptospirosis (direct ENO match, high severity) → 24 hours", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      disease_code: "leptospirosis",
    });
    expect(slaHours).toBe(24);
  });

  it("outbreak_signal with unknown disease_code → null (no outbox row)", () => {
    const rule = rules[0];
    const slaHours = rule.slaHours({
      disease_code: "not_in_catalog",
    });
    expect(slaHours).toBeNull();
  });
});
