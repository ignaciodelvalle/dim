// microchipObligationApplies — the OR5 consumer gate (jurisdiction-compliance
// WU1, migration 0183). Two contracts pinned here:
//
// 1. PARITY: while no tier is set (every pre-0183 row, and the hardcoded
//    default), the gate MUST behave exactly like the boolean expression it
//    replaced (`payload.required !== false`) at both call sites (pet-profile
//    resolution, owner-dashboard batch gate) — zero behavior diff at rollout.
// 2. SUPERSESSION: once a tier IS set, it wins over the boolean — only
//    `mandatory` gates the obligation on.

import { describe, expect, it } from "vitest";

import {
  BUSINESS_RULES_DEFAULTS,
  microchipObligationApplies,
} from "@/lib/domain/business-rules-defaults";

describe("microchipObligationApplies — parity with the pre-tier boolean gate", () => {
  it.each([
    [{ required: true }, true],
    [{ required: false }, false],
    [{} as { required?: boolean }, true], // absent boolean = legacy "applies"
  ])(
    "no tier set: payload %j gates exactly like `required !== false` (%s)",
    (payload, expected) => {
      const legacyGate = payload.required !== false;
      expect(legacyGate).toBe(expected);
      // undefined tier (default path — resolver matched no row)
      expect(microchipObligationApplies({ payload })).toBe(expected);
      // explicit null tier (a matched row that predates the backfill)
      expect(microchipObligationApplies({ requirementLevel: null, payload })).toBe(expected);
    },
  );

  it("the hardcoded default ({required: true}) keeps gating ON when nothing resolves — RG2 preserved until ratified", () => {
    expect(
      microchipObligationApplies({ payload: BUSINESS_RULES_DEFAULTS.microchip_required }),
    ).toBe(true);
  });
});

describe("microchipObligationApplies — a resolved tier supersedes the boolean", () => {
  it("mandatory gates ON even when the boolean says false (tier wins)", () => {
    expect(
      microchipObligationApplies({ requirementLevel: "mandatory", payload: { required: false } }),
    ).toBe(true);
  });

  it.each(["recommended", "not_regulated", "optional"] as const)(
    "%s gates OFF even when the boolean says true (only mandatory is an obligation)",
    (level) => {
      expect(
        microchipObligationApplies({ requirementLevel: level, payload: { required: true } }),
      ).toBe(false);
    },
  );
});
