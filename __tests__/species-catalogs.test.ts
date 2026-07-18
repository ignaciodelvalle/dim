// Verifies that the dog/cat-centric catalogs degrade gracefully for the
// additional companion species (rabbit, guinea_pig, ferret) per spec
// 2026-05-17 additional-species-design.

import { describe, expect, it } from "vitest";

import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/reference/breeds";
import { diseasesForSpecies } from "@/lib/reference/diseases";
import { drugsForSpecies } from "@/lib/reference/drugs";
import { speciesLabel } from "@/lib/utils/format";

describe("speciesLabel — companion species", () => {
  it("labels every supported species in es-AR", () => {
    expect(speciesLabel("dog")).toBe("Perro");
    expect(speciesLabel("cat")).toBe("Gato");
    expect(speciesLabel("rabbit")).toBe("Conejo");
    expect(speciesLabel("guinea_pig")).toBe("Cobayo");
    expect(speciesLabel("ferret")).toBe("Hurón");
    expect(speciesLabel("other")).toBe("Otra");
  });
});

describe("breedsForSpecies — companion species", () => {
  it("dog/cat keep their full lists", () => {
    expect(breedsForSpecies("dog").length).toBeGreaterThan(10);
    expect(breedsForSpecies("cat").length).toBeGreaterThan(5);
  });
  it("rabbit/guinea_pig/ferret return only the SPECIAL options, as a literal list", () => {
    // Literal array (audit 2026-07): the former length-equality assertion
    // could not tell "both correct" apart from "both equally wrong".
    const SPECIAL_ONLY = ["Mixto / Cruza", "Pura raza no listada"];
    expect(breedsForSpecies("rabbit")).toEqual(SPECIAL_ONLY);
    expect(breedsForSpecies("guinea_pig")).toEqual(SPECIAL_ONLY);
    expect(breedsForSpecies("ferret")).toEqual(SPECIAL_ONLY);
  });
});

describe("isPotentiallyDangerousBreed — companion species", () => {
  it("only fires for dogs", () => {
    expect(isPotentiallyDangerousBreed("rabbit", "Pit Bull Terrier")).toBe(false);
    expect(isPotentiallyDangerousBreed("guinea_pig", "Tosa Inu")).toBe(false);
    expect(isPotentiallyDangerousBreed("ferret", "Rottweiler")).toBe(false);
  });
});

describe("diseasesForSpecies — companion species", () => {
  it("returns the cross-species zoonoses subset for rabbit/guinea_pig/ferret", () => {
    const rabbit = diseasesForSpecies("rabbit");
    // Every returned entry must have 'any' in its species tags.
    for (const d of rabbit) {
      expect(d.species).toContain("any");
    }
    // And the size must be non-zero (we have several `any` zoonoses).
    expect(rabbit.length).toBeGreaterThan(0);
    // ...but smaller than the full dog/cat catalog.
    expect(rabbit.length).toBeLessThan(diseasesForSpecies("dog").length);
  });
});

describe("drugsForSpecies — companion species", () => {
  it("falls back to the full catalog for non-dog/cat species", () => {
    const rabbit = drugsForSpecies("rabbit");
    const full = drugsForSpecies(null);
    // Full deep equality (audit 2026-07): length-only equality would pass for
    // two catalogs that are equally truncated or reordered differently.
    expect(rabbit).toEqual(full);
    // And the fallback really is the WHOLE catalog, not an empty-equals-empty
    // degenerate case: pin a couple of known entries as literals.
    const codes = rabbit.map((d) => d.code);
    expect(codes).toContain("amoxicillin");
    expect(codes).toContain("enrofloxacin");
    expect(rabbit.length).toBeGreaterThan(20);
  });
});
