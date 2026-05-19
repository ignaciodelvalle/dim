// Verifies that the dog/cat-centric catalogs degrade gracefully for the
// additional companion species (rabbit, guinea_pig, ferret) per spec
// 2026-05-17 additional-species-design.

import { describe, expect, it } from "vitest";

import { breedsForSpecies, isPotentiallyDangerousBreed } from "@/lib/breeds";
import { diseasesForSpecies } from "@/lib/diseases";
import { drugsForSpecies } from "@/lib/drugs";
import { speciesLabel } from "@/lib/format";

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
  it("rabbit/guinea_pig/ferret return only SPECIAL options (no breed catalog)", () => {
    const rabbit = breedsForSpecies("rabbit");
    const guinea = breedsForSpecies("guinea_pig");
    const ferret = breedsForSpecies("ferret");
    // SPECIAL_BREED_OPTIONS prefix is the same across species; we only
    // assert that no dog/cat-specific entries leaked.
    expect(rabbit).not.toContain("Pit Bull Terrier");
    expect(guinea).not.toContain("Persa");
    expect(ferret.length).toBe(rabbit.length);
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
    expect(rabbit.length).toBe(full.length);
  });
});
