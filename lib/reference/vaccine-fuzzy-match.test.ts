import { describe, expect, it } from "vitest";

import {
  VACCINE_AUTOSELECT_CONFIDENCE,
  matchVaccineFreeText,
} from "@/lib/reference/vaccine-fuzzy-match";

describe("VACCINE_AUTOSELECT_CONFIDENCE", () => {
  it("is pinned at 0.85 — a change here changes what silently commits to the registry", () => {
    expect(VACCINE_AUTOSELECT_CONFIDENCE).toBe(0.85);
  });
});

describe("matchVaccineFreeText — empty / out-of-catalog", () => {
  it("returns [] for empty input", () => {
    expect(matchVaccineFreeText("", "dog")).toEqual([]);
    expect(matchVaccineFreeText("   ", "dog")).toEqual([]);
  });

  it("returns [] for free text with no vaccine mention", () => {
    expect(matchVaccineFreeText("le compre un juguete nuevo", "dog")).toEqual([]);
  });
});

describe("matchVaccineFreeText — exact / substring-exact-root match (high, auto-selectable)", () => {
  it('exact match: "Antirrábica" alone', () => {
    const results = matchVaccineFreeText("Antirrábica", "dog");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vaccine.name).toBe("Antirrábica");
    expect(results[0].confidence).toBeGreaterThanOrEqual(VACCINE_AUTOSELECT_CONFIDENCE);
  });

  it('whole-word substring: "le di la antirrábica hoy"', () => {
    const results = matchVaccineFreeText("le di la antirrábica hoy", "dog");
    expect(results[0].vaccine.name).toBe("Antirrábica");
    expect(results[0].confidence).toBeGreaterThanOrEqual(VACCINE_AUTOSELECT_CONFIDENCE);
  });

  it("only one candidate reaches the cutoff — safe for the caller to auto-select", () => {
    const results = matchVaccineFreeText("Antirrábica", "dog");
    const atCutoff = results.filter((r) => r.confidence >= VACCINE_AUTOSELECT_CONFIDENCE);
    expect(atCutoff).toHaveLength(1);
  });
});

describe("matchVaccineFreeText — bounded Levenshtein (typo tolerance, high)", () => {
  it('"antirravica" (1-edit typo of "antirrabica") auto-selects Antirrábica', () => {
    const results = matchVaccineFreeText("antirravica", "dog");
    expect(results[0].vaccine.name).toBe("Antirrábica");
    expect(results[0].confidence).toBeGreaterThanOrEqual(VACCINE_AUTOSELECT_CONFIDENCE);
  });

  it("a 2-edit typo does NOT reach auto-select (conservative — no candidate at all for a single-word root)", () => {
    // "antirravika": b→v AND c→k, two substitutions away from "antirrabica".
    const results = matchVaccineFreeText("antirravika", "dog");
    const antirrabica = results.find((r) => r.vaccine.name === "Antirrábica");
    expect(
      antirrabica === undefined || antirrabica.confidence < VACCINE_AUTOSELECT_CONFIDENCE,
    ).toBe(true);
  });
});

describe("matchVaccineFreeText — ambiguous pair must NOT auto-select", () => {
  it('"Quíntuple" vs "Séxtuple" — both full names present in the same input, neither auto-selects', () => {
    const results = matchVaccineFreeText("no se si le dieron la quintuple o la sextuple", "dog");

    const quintuple = results.find((r) => r.vaccine.name.startsWith("Quíntuple"));
    const sextuple = results.find((r) => r.vaccine.name.startsWith("Séxtuple"));

    // Both surface as candidates — the UI can offer "pick one".
    expect(quintuple).toBeDefined();
    expect(sextuple).toBeDefined();

    // Neither individually clears the auto-select bar.
    expect(quintuple?.confidence).toBeLessThan(VACCINE_AUTOSELECT_CONFIDENCE);
    expect(sextuple?.confidence).toBeLessThan(VACCINE_AUTOSELECT_CONFIDENCE);
  });

  it("an unambiguous single mention of Quíntuple still auto-selects on its own", () => {
    const results = matchVaccineFreeText("aplicaron la quintuple", "dog");
    expect(results[0].vaccine.name).toBe("Quíntuple (DHPPi)");
    expect(results[0].confidence).toBeGreaterThanOrEqual(VACCINE_AUTOSELECT_CONFIDENCE);
  });
});

describe("matchVaccineFreeText — species filter", () => {
  it("a dog-only vaccine (Tos de las perreras / Bordetella) is not offered for cats", () => {
    const results = matchVaccineFreeText("bordetella", "cat");
    expect(results).toEqual([]);
  });

  it("the same free text DOES match for dogs", () => {
    const results = matchVaccineFreeText("bordetella", "dog");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].vaccine.name).toContain("Bordetella");
  });
});

describe("matchVaccineFreeText — token overlap (medium, never auto-selects)", () => {
  it('partial mention of a two-word root ("triple" alone, missing "felina") stays medium', () => {
    const results = matchVaccineFreeText("le pusieron la triple la semana pasada", "cat");
    const triple = results.find((r) => r.vaccine.name.startsWith("Triple"));
    expect(triple).toBeDefined();
    expect(triple?.confidence).toBeLessThan(VACCINE_AUTOSELECT_CONFIDENCE);
    expect(triple?.confidence).toBeGreaterThan(0);
  });
});
