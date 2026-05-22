// Pure unit tests for the ENO catalog helpers.
//
// Covers `diseaseCodeToEnoCode` — the bridge between codes emitted by the
// diagnosis form (`lib/diseases.ts` codes like `rabies_confirmed`) and the
// codes that live in the ENO catalog (`rabies`). The catalog comment says
// "DO NOT add diseases here without updating the spec — the list is locked
// per ENO-D1." That makes the bridge the canonical normalization point;
// every caller that wants to ask "is this an ENO disease?" must run the
// disease code through `diseaseCodeToEnoCode` first.
//
// Before this bridge existed, `isEnoCode("rabies_confirmed")` returned false
// and the ENO trigger silently no-op'd on rabies diagnoses. This file pins
// that bug closed.

import { describe, expect, it } from "vitest";

import { diseaseCodeToEnoCode, getEnoDisease, isEnoCode } from "./eno-catalog";

describe("diseaseCodeToEnoCode", () => {
  it("maps rabies_confirmed → rabies", () => {
    expect(diseaseCodeToEnoCode("rabies_confirmed")).toBe("rabies");
  });

  it("maps rabies_suspected → rabies", () => {
    expect(diseaseCodeToEnoCode("rabies_suspected")).toBe("rabies");
  });

  it("maps canine_brucellosis → brucelosis_canina (Spanish word order)", () => {
    expect(diseaseCodeToEnoCode("canine_brucellosis")).toBe("brucelosis_canina");
  });

  it("maps visceral_leishmaniasis → leishmaniasis (drops the visceral_ prefix)", () => {
    expect(diseaseCodeToEnoCode("visceral_leishmaniasis")).toBe("leishmaniasis");
  });

  it("maps hydatidosis → hidatidosis (Spanish spelling without the y)", () => {
    expect(diseaseCodeToEnoCode("hydatidosis")).toBe("hidatidosis");
  });

  it("passes leptospirosis through unchanged (catalog spellings already match)", () => {
    expect(diseaseCodeToEnoCode("leptospirosis")).toBe("leptospirosis");
  });

  it("returns the raw input for codes not in the bridge", () => {
    expect(diseaseCodeToEnoCode("parvovirus")).toBe("parvovirus");
    expect(diseaseCodeToEnoCode("unknown_disease_xyz")).toBe("unknown_disease_xyz");
  });
});

describe("isEnoCode + diseaseCodeToEnoCode integration", () => {
  it("rabies_confirmed → bridge → isEnoCode = true (the bug that motivated this fix)", () => {
    expect(isEnoCode("rabies_confirmed")).toBe(false); // raw form is NOT in the catalog
    expect(isEnoCode(diseaseCodeToEnoCode("rabies_confirmed"))).toBe(true); // bridged form IS
  });

  it("all 5 ENO diseases-table codes resolve to catalog entries via the bridge", () => {
    const formCodes = [
      "rabies_confirmed",
      "leptospirosis",
      "hydatidosis",
      "canine_brucellosis",
      "visceral_leishmaniasis",
    ];
    for (const code of formCodes) {
      const enoCode = diseaseCodeToEnoCode(code);
      expect(isEnoCode(enoCode)).toBe(true);
      expect(getEnoDisease(enoCode)).not.toBeNull();
    }
  });

  it("a non-reportable disease (parvovirus) stays out of ENO even after bridging", () => {
    expect(isEnoCode(diseaseCodeToEnoCode("parvovirus"))).toBe(false);
  });
});
