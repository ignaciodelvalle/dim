import { describe, expect, it } from "vitest";

import { GOVT_BUSINESS_RULE_TYPES } from "@/db";
import { BUSINESS_RULES_DEFAULTS } from "@/lib/domain/business-rules-defaults";
import { RULE_TYPE_REGISTRY, getRuleTypeDef } from "@/lib/domain/rule-types-registry";
import { BUSINESS_RULE_VALIDATORS } from "@/lib/infra/business-rules-validators";

describe("RULE_TYPE_REGISTRY (shape parity — zero behavior diff)", () => {
  it("has exactly one entry per currently-live GOVT_BUSINESS_RULE_TYPES value", () => {
    for (const ruleType of GOVT_BUSINESS_RULE_TYPES) {
      expect(RULE_TYPE_REGISTRY[ruleType]).toBeDefined();
      expect(RULE_TYPE_REGISTRY[ruleType].id).toBe(ruleType);
    }
  });

  it("every registry schema is the SAME instance as BUSINESS_RULE_VALIDATORS (single source of truth)", () => {
    for (const ruleType of GOVT_BUSINESS_RULE_TYPES) {
      expect(RULE_TYPE_REGISTRY[ruleType].schema).toBe(BUSINESS_RULE_VALIDATORS[ruleType]);
    }
  });

  it("every registry default matches BUSINESS_RULES_DEFAULTS exactly", () => {
    for (const ruleType of GOVT_BUSINESS_RULE_TYPES) {
      expect(RULE_TYPE_REGISTRY[ruleType].default).toEqual(BUSINESS_RULES_DEFAULTS[ruleType]);
    }
  });

  it("getRuleTypeDef returns the same object as a direct lookup", () => {
    for (const ruleType of GOVT_BUSINESS_RULE_TYPES) {
      expect(getRuleTypeDef(ruleType)).toBe(RULE_TYPE_REGISTRY[ruleType]);
    }
  });
});

describe("parseFromForm (zero behavior diff vs pre-registry parseRulePayloadFromForm)", () => {
  it("ppp_breed_list: trims + drops empties, preserves order", () => {
    const fd = new FormData();
    fd.append("breeds", " Pit Bull Terrier ");
    fd.append("breeds", "");
    fd.append("breeds", "Rottweiler");
    expect(getRuleTypeDef("ppp_breed_list").parseFromForm(fd)).toEqual({
      breeds: ["Pit Bull Terrier", "Rottweiler"],
    });
  });

  it("ppp_weight_threshold: empty kg -> null, checkbox 'on' -> true", () => {
    const fd = new FormData();
    fd.append("kg", "");
    expect(getRuleTypeDef("ppp_weight_threshold").parseFromForm(fd)).toEqual({
      kg: null,
      appliesIfBreedNotPPP: false,
    });

    const fd2 = new FormData();
    fd2.append("kg", "25.5");
    fd2.append("appliesIfBreedNotPPP", "on");
    expect(getRuleTypeDef("ppp_weight_threshold").parseFromForm(fd2)).toEqual({
      kg: 25.5,
      appliesIfBreedNotPPP: true,
    });
  });

  it("ppp_attestation_required_registries: parses registriesJson, drops malformed entries", () => {
    const fd = new FormData();
    fd.append(
      "registriesJson",
      JSON.stringify([
        { id: "renapa", label: "RENAPA", required: true },
        { id: "", label: "dropped (no id)", required: false },
      ]),
    );
    expect(getRuleTypeDef("ppp_attestation_required_registries").parseFromForm(fd)).toEqual({
      registries: [{ id: "renapa", label: "RENAPA", required: true }],
    });
  });

  it("physical_credential_channels: parses printable_qr + per-channel provider fields", () => {
    const fd = new FormData();
    fd.append("printable_qr", "on");
    fd.append("enabled_engraved_plate", "on");
    fd.append("provider_name_engraved_plate", "Grabados SA");
    fd.append("provider_url_engraved_plate", "https://grabados.example");
    expect(getRuleTypeDef("physical_credential_channels").parseFromForm(fd)).toEqual({
      printable_qr: true,
      engraved_plate: {
        enabled: true,
        providerName: "Grabados SA",
        providerUrl: "https://grabados.example",
      },
      nfc_tag: { enabled: false },
    });
  });
});
