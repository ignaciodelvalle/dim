// Breed matching — the PPP regime must not be escapable by typing.
//
// Regression origin: staging clickthrough, 2026-08-13. An owner typed "Pitbull"
// on a 21,4 kg dog in CABA; the catalog says "Pit Bull Terrier"; the match was
// exact string equality, so the PPP requirement vanished from the pet's
// compliance list (denominator 4 → 3) with no warning to anyone. A legal regime
// that a spelling can opt you out of is not a regime.

import { describe, expect, it } from "vitest";

import {
  POTENTIALLY_DANGEROUS_DOG_BREEDS,
  breedListIncludes,
  isPotentiallyDangerousBreed,
  normalizeBreedKey,
  resolveBreedLabel,
} from "@/lib/reference/breeds";

describe("normalizeBreedKey", () => {
  it("folds case, accents and separators", () => {
    expect(normalizeBreedKey("Mastín Napolitano")).toBe(normalizeBreedKey("mastin  napolitano"));
    expect(normalizeBreedKey("Dogo-Argentino")).toBe(normalizeBreedKey("DOGO ARGENTINO"));
  });

  it("does not collapse two different breeds into one key", () => {
    expect(normalizeBreedKey("Bull Terrier")).not.toBe(normalizeBreedKey("Pit Bull Terrier"));
  });
});

describe("isPotentiallyDangerousBreed", () => {
  it("classifies the exact case that shipped: 'Pitbull'", () => {
    expect(isPotentiallyDangerousBreed("dog", "Pitbull")).toBe(true);
  });

  it("classifies orthographic variants of a catalog name", () => {
    expect(isPotentiallyDangerousBreed("dog", "mastin napolitano")).toBe(true);
    expect(isPotentiallyDangerousBreed("dog", "DOGO ARGENTINO")).toBe(true);
    expect(isPotentiallyDangerousBreed("dog", "  Rottweiler  ")).toBe(true);
  });

  it("still classifies every catalog label verbatim", () => {
    for (const breed of POTENTIALLY_DANGEROUS_DOG_BREEDS) {
      expect(isPotentiallyDangerousBreed("dog", breed)).toBe(true);
    }
  });

  it("does NOT sweep in breeds that merely share words", () => {
    // The reason aliases are curated instead of substring-matched.
    expect(isPotentiallyDangerousBreed("dog", "Beagle")).toBe(false);
    expect(isPotentiallyDangerousBreed("dog", "Border Collie")).toBe(false);
    expect(isPotentiallyDangerousBreed("dog", "Bulldog Francés")).toBe(false);
  });

  it("stays species-gated: a cat named after a dog breed is not PPP", () => {
    expect(isPotentiallyDangerousBreed("cat", "Pitbull")).toBe(false);
  });

  it("ignores empty and punctuation-only input", () => {
    expect(isPotentiallyDangerousBreed("dog", "   ")).toBe(false);
    expect(isPotentiallyDangerousBreed("dog", "---")).toBe(false);
  });
});

describe("resolveBreedLabel", () => {
  it("resolves a colloquial name to a label that exists in the catalog", () => {
    expect(resolveBreedLabel("amstaff")).toBe("American Staffordshire Terrier");
    expect(resolveBreedLabel("presa canario")).toBe("Dogo Canario (Presa Canario)");
  });

  it("returns null for something that is not a breed at all", () => {
    expect(resolveBreedLabel("cualquier cosa")).toBeNull();
  });
});

describe("breedListIncludes", () => {
  it("never widens the regime: an alias off the effective list stays off", () => {
    // A province that enacted a SHORT list must not get extra breeds because
    // the owner typed a colloquial name for one that is not on it.
    const provinceList = ["Rottweiler"];
    expect(breedListIncludes(provinceList, resolveBreedLabel("Pitbull") ?? "")).toBe(false);
    expect(breedListIncludes(provinceList, resolveBreedLabel("rotweiler") ?? "")).toBe(true);
  });
});
