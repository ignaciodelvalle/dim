// Coverage + sanity tests for case normatives.
//
// Enforces:
//  - Every CASE_KIND has at least one entry (the static load-time check
//    in lib/case-normatives.ts would already throw; we duplicate it here
//    for a clean test failure if someone wraps that throw away).
//  - getNormativesForCase returns country-wide laws for unmatched
//    province/locality.
//  - CABA bite_incident surfaces Ord. 41.831.
//  - welfare_denuncia surfaces Ley 14.346 nationwide.

import { describe, expect, it } from "vitest";

import { CASE_KINDS } from "@/lib/case-kinds";
import { CASE_NORMATIVES, getNormativesForCase } from "@/lib/case-normatives";

describe("CASE_NORMATIVES — coverage", () => {
  for (const kind of CASE_KINDS) {
    it(`has at least one entry for ${kind}`, () => {
      const entries = CASE_NORMATIVES.filter((n) => n.kind === kind);
      expect(entries.length).toBeGreaterThan(0);
    });
  }
});

describe("getNormativesForCase — hierarchy", () => {
  it("returns country-wide laws when province/locality don't have specific entries", () => {
    const result = getNormativesForCase("bite_incident", {
      country: "AR",
      province: "Mendoza",
      locality: "Godoy Cruz",
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((law) => law.id === "ley_15465_60_decreto_3640_64")).toBe(true);
  });

  it("CABA bite_incident surfaces Ordenanza 41.831", () => {
    const result = getNormativesForCase("bite_incident", {
      country: "AR",
      province: "CABA",
      locality: "CABA",
    });
    const hasOrd = result.some(
      (law) => /41[.\s-]?831/.test(law.label) || /41[.\s-]?831/.test(law.id),
    );
    expect(hasOrd).toBe(true);
  });

  it("Buenos Aires bite_incident surfaces Decreto 4669/1973 PBA", () => {
    const result = getNormativesForCase("bite_incident", {
      country: "AR",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    expect(result.some((law) => law.id === "decreto_4669_1973_pba")).toBe(true);
  });

  it("welfare_denuncia surfaces Ley 14.346 nationwide", () => {
    const result = getNormativesForCase("welfare_denuncia", {
      country: "AR",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    expect(result.some((law) => law.id === "ley_nacional_14346_1954")).toBe(true);
  });

  it("dedupes laws when same id appears at multiple jurisdiction levels", () => {
    const result = getNormativesForCase("welfare_denuncia", {
      country: "AR",
    });
    const ids = result.map((l) => l.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });
});
