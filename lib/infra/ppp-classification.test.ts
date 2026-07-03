import { describe, expect, it } from "vitest";

import { classifyPpp } from "@/lib/infra/ppp-classification";

const NO_RULES = { breeds: new Set<string>(), kg: null, appliesIfBreedNotPPP: false };

describe("classifyPpp — weight-threshold enforcement seam (design ADR-3)", () => {
  it("non-dog species is never PPP regardless of rules", () => {
    expect(
      classifyPpp("cat", "Persa", 20, {
        breeds: new Set(["Persa"]),
        kg: 5,
        appliesIfBreedNotPPP: true,
      }),
    ).toBe(false);
  });

  it("default payload (kg: null) behaves EXACTLY like breed-only — dark rollout guarantee", () => {
    // Breed on the list -> PPP regardless of weight rule.
    expect(
      classifyPpp("dog", "Pit Bull Terrier", 30, {
        ...NO_RULES,
        breeds: new Set(["Pit Bull Terrier"]),
      }),
    ).toBe(true);
    // Breed NOT on the list, no weight rule (kg: null) -> not PPP, no matter the weight.
    expect(classifyPpp("dog", "Labrador", 45, NO_RULES)).toBe(false);
    // No breed data at all, no weight rule -> not PPP.
    expect(classifyPpp("dog", null, null, NO_RULES)).toBe(false);
  });

  it("appliesIfBreedNotPPP=false: weight only re-adds a condition to ALREADY-PPP breeds (no-op for non-PPP breeds)", () => {
    const rules = { breeds: new Set(["Pit Bull Terrier"]), kg: 20, appliesIfBreedNotPPP: false };
    // Non-PPP breed, over the weight threshold, but appliesIfBreedNotPPP=false -> still NOT PPP.
    expect(classifyPpp("dog", "Labrador", 30, rules)).toBe(false);
    // PPP breed -> already true via breedInList, weight condition doesn't matter.
    expect(classifyPpp("dog", "Pit Bull Terrier", 5, rules)).toBe(true);
  });

  it("appliesIfBreedNotPPP=true: weight can newly flip a non-PPP breed (the ONLY activation path)", () => {
    const rules = { breeds: new Set(["Pit Bull Terrier"]), kg: 20, appliesIfBreedNotPPP: true };
    expect(classifyPpp("dog", "Labrador", 25, rules)).toBe(true); // over threshold -> flips
    expect(classifyPpp("dog", "Labrador", 15, rules)).toBe(false); // under threshold -> stays false
    expect(classifyPpp("dog", "Labrador", null, rules)).toBe(false); // no weight data -> stays false
  });

  it("weight exactly AT the threshold counts as hitting it (>=)", () => {
    const rules = { breeds: new Set<string>(), kg: 20, appliesIfBreedNotPPP: true };
    expect(classifyPpp("dog", "Labrador", 20, rules)).toBe(true);
    expect(classifyPpp("dog", "Labrador", 19.9, rules)).toBe(false);
  });

  it("breed with no weight data and no breed match is never PPP even with appliesIfBreedNotPPP=true", () => {
    const rules = { breeds: new Set<string>(), kg: 20, appliesIfBreedNotPPP: true };
    expect(classifyPpp("dog", null, null, rules)).toBe(false);
  });
});
