// UI-4 fix 1 — sex-aware lost-mode copy helpers.
//
// Pure-function tests for the gendered wording used in the public credential,
// the cockpit, and the recovery notifications. Verifies male/female/unknown
// all map to natural es-AR forms and that nullish/garbage sex falls back to the
// neutral phrasing instead of assuming a gender.

import { describe, expect, it } from "vitest";

import {
  foundParticiple,
  foundPossessivePhrase,
  lostBannerHeadline,
  lostFirstPersonLine,
  lostThirdPersonPhrase,
  registeredAdjective,
  sightingPhrase,
  situationLabelForSex,
} from "@/lib/utils/format";

describe("lostBannerHeadline", () => {
  it("genders by sex", () => {
    expect(lostBannerHeadline("male")).toBe("ESTÁ PERDIDO");
    expect(lostBannerHeadline("female")).toBe("ESTÁ PERDIDA");
  });
  it("uses a neutral phrasing for unknown/null/garbage", () => {
    expect(lostBannerHeadline("unknown")).toBe("SE PERDIÓ");
    expect(lostBannerHeadline(null)).toBe("SE PERDIÓ");
    expect(lostBannerHeadline(undefined)).toBe("SE PERDIÓ");
    expect(lostBannerHeadline("nonsense")).toBe("SE PERDIÓ");
  });
});

describe("lostFirstPersonLine", () => {
  it("genders by sex", () => {
    expect(lostFirstPersonLine("male")).toBe("Estoy perdido");
    expect(lostFirstPersonLine("female")).toBe("Estoy perdida");
  });
  it("neutral for unknown", () => {
    expect(lostFirstPersonLine("unknown")).toBe("Me perdí");
    expect(lostFirstPersonLine(null)).toBe("Me perdí");
  });
});

describe("lostThirdPersonPhrase", () => {
  it("genders by sex", () => {
    expect(lostThirdPersonPhrase("male")).toBe("está perdido");
    expect(lostThirdPersonPhrase("female")).toBe("está perdida");
  });
  it("neutral for unknown", () => {
    expect(lostThirdPersonPhrase("unknown")).toBe("se perdió");
    expect(lostThirdPersonPhrase(null)).toBe("se perdió");
  });
});

describe("foundParticiple", () => {
  it("genders by sex", () => {
    expect(foundParticiple("male")).toBe("encontrado");
    expect(foundParticiple("female")).toBe("encontrada");
  });
  it("inclusive form for unknown", () => {
    expect(foundParticiple("unknown")).toBe("encontrada/o");
    expect(foundParticiple(null)).toBe("encontrada/o");
  });
});

describe("foundPossessivePhrase", () => {
  it("genders by sex", () => {
    expect(foundPossessivePhrase("male")).toBe("Lo tengo conmigo");
    expect(foundPossessivePhrase("female")).toBe("La tengo conmigo");
  });
  it("neutral for unknown", () => {
    expect(foundPossessivePhrase("unknown")).toBe("Está conmigo");
    expect(foundPossessivePhrase(null)).toBe("Está conmigo");
    expect(foundPossessivePhrase(undefined)).toBe("Está conmigo");
  });
});

// QA histórico 2026-07-08 item 2: "La vi cerca de acá" was hardcoded feminine
// on the sighting-form page headline and the lost public credential's CTA
// button, disagreeing with the pet's recorded sex (e.g. showing feminine for
// a male pet). Both surfaces now route through this helper.
describe("sightingPhrase", () => {
  it("genders by sex", () => {
    expect(sightingPhrase("male")).toBe("Lo vi cerca de acá");
    expect(sightingPhrase("female")).toBe("La vi cerca de acá");
  });
  it("neutral for unknown/null/garbage", () => {
    expect(sightingPhrase("unknown")).toBe("Vi a la mascota cerca de acá");
    expect(sightingPhrase(null)).toBe("Vi a la mascota cerca de acá");
    expect(sightingPhrase(undefined)).toBe("Vi a la mascota cerca de acá");
    expect(sightingPhrase("nonsense")).toBe("Vi a la mascota cerca de acá");
  });
});

// QA histórico 2026-07-08 item 2 (round 2): the pet credential's registration
// badge showed "Rocco Inscripta" — feminine on a male pet, because
// CredentialFace hardcoded "Inscripta" instead of routing through a
// sex-aware helper.
describe("registeredAdjective", () => {
  it("genders by sex", () => {
    expect(registeredAdjective("male")).toBe("Inscripto");
    expect(registeredAdjective("female")).toBe("Inscripta");
  });
  it("neutral for unknown/null/garbage", () => {
    expect(registeredAdjective("unknown")).toBe("Inscripto/a");
    expect(registeredAdjective(null)).toBe("Inscripto/a");
    expect(registeredAdjective(undefined)).toBe("Inscripto/a");
    expect(registeredAdjective("nonsense")).toBe("Inscripto/a");
  });
});

// Same QA finding: the credential's situation skin (lib/ui/pet-situation.ts)
// carries feminine-default adjective labels ("Perdida", "Fallecida") that
// must also agree with a male pet's sex on the credential surface.
describe("situationLabelForSex", () => {
  it("genders the adjective labels for a male pet", () => {
    expect(situationLabelForSex("Perdida", "male")).toBe("Perdido");
    expect(situationLabelForSex("Fallecida", "male")).toBe("Fallecido");
  });
  it("keeps the feminine default for female/unknown/null", () => {
    expect(situationLabelForSex("Perdida", "female")).toBe("Perdida");
    expect(situationLabelForSex("Perdida", "unknown")).toBe("Perdida");
    expect(situationLabelForSex("Perdida", null)).toBe("Perdida");
    expect(situationLabelForSex("Fallecida", "female")).toBe("Fallecida");
  });
  it("passes through non-adjective (invariant) situation labels unchanged", () => {
    expect(situationLabelForSex("En tratamiento", "male")).toBe("En tratamiento");
    expect(situationLabelForSex("En adopción", "male")).toBe("En adopción");
    expect(situationLabelForSex("En tránsito", "male")).toBe("En tránsito");
    expect(situationLabelForSex("En observación antirrábica", "male")).toBe(
      "En observación antirrábica",
    );
  });
  it("never regenders Preñada — pregnancy is exclusively a female state", () => {
    expect(situationLabelForSex("Preñada", "male")).toBe("Preñada");
  });
});
