// The citizen-registration input contract.
//
// WHAT THIS FILE IS FOR
// ---------------------------------------------------------------------------
// A schema in the contract package is a PROMISE to a client that cannot be
// re-deployed on demand: a native app validates against it locally, shows
// per-field copy from its codes, and then sends a body the server re-validates
// with this exact object. Every property below is something a phone in the field
// depends on.
//
// The one that already earned its keep: `acquisitionMethod` is OPTIONAL, and the
// first version of it — `.nullish().catch(null)` — refused every body that
// simply omitted the field. It read as obviously correct. It shipped a 400 for
// the most ordinary request there is.

import { describe, expect, it } from "vitest";

import {
  REGISTER_PET_INPUT_CODES,
  firstRegisterPetInputCode,
  registerPetInputSchema,
} from "../register-pet";

/** The smallest body the schema accepts: the four things a credential needs. */
const MINIMAL = {
  name: "Pampa",
  species: "dog",
  provinceCode: "AR-C",
  localityName: "Villa Crespo",
};

describe("registerPetInputSchema — the minimum", () => {
  it("accepts a body with only the four required fields", () => {
    const parsed = registerPetInputSchema.safeParse(MINIMAL);
    expect(parsed.success).toBe(true);
  });

  it("fills every optional field with its absent value rather than leaving it undefined", () => {
    // A consumer builds a domain object out of this, and `undefined` and `null`
    // are not the same thing to a column that is `NOT NULL DEFAULT`. The schema
    // normalises so the consumer never has to.
    const parsed = registerPetInputSchema.parse(MINIMAL);
    expect(parsed).toMatchObject({
      sex: "unknown",
      breed: null,
      color: null,
      estimatedWeightKg: null,
      ageYears: null,
      ageMonths: null,
      acquisitionMethod: null,
      duplicateOverride: false,
    });
  });

  it.each(["name", "species", "provinceCode", "localityName"] as const)(
    "refuses a body with no %s",
    (field) => {
      const parsed = registerPetInputSchema.safeParse({ ...MINIMAL, [field]: "" });
      expect(parsed.success).toBe(false);
    },
  );

  it("reports ONE code, chosen by contract order and not by zod's issue order", () => {
    // The consumer shows one message. Which one must not depend on the order zod
    // happened to collect issues in — that is a UI that changes its mind between
    // library versions.
    const parsed = registerPetInputSchema.safeParse({
      name: "",
      species: "",
      provinceCode: "",
      localityName: "",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(firstRegisterPetInputCode(parsed.error)).toBe("NAME_REQUIRED");
    expect(REGISTER_PET_INPUT_CODES[0]).toBe("NAME_REQUIRED");
  });

  it("reports SPECIES_REQUIRED for a species that is PRESENT but not in the vocabulary", () => {
    // The code reads "required" and covers "unusable" too, matching intake.ts's
    // INTAKE_REASON_REQUIRED. Deliberate: the consumer's answer to both is the
    // same screen — put the picker back in front of the user.
    const parsed = registerPetInputSchema.safeParse({ ...MINIMAL, species: "dinosaurio" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(firstRegisterPetInputCode(parsed.error)).toBe("SPECIES_REQUIRED");
  });

  it("returns null for an error carrying no code this contract defines", () => {
    // The consumer's cue to fall back to a generic message rather than render a
    // raw zod string at an owner. `duplicateOverride` has no code because no
    // human ever types it — a client that gets it wrong is out of step with the
    // contract, not asking which field to highlight.
    const parsed = registerPetInputSchema.safeParse({ ...MINIMAL, duplicateOverride: "true" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(firstRegisterPetInputCode(parsed.error)).toBeNull();
  });
});

describe("registerPetInputSchema — the enums that fall back instead of failing", () => {
  it("defaults an absent sex to unknown", () => {
    expect(registerPetInputSchema.parse(MINIMAL).sex).toBe("unknown");
  });

  it("defaults an UNRECOGNISED sex to unknown rather than refusing the registration", () => {
    // Sex is not a claim a wrong guess could corrupt, and refusing an alta over
    // it would trade a whole credential for a field.
    expect(registerPetInputSchema.parse({ ...MINIMAL, sex: "macho" }).sex).toBe("unknown");
  });

  it("trims a padded enum — two clients sending the same intent must agree", () => {
    expect(registerPetInputSchema.parse({ ...MINIMAL, sex: " male " }).sex).toBe("male");
    expect(
      registerPetInputSchema.parse({ ...MINIMAL, acquisitionMethod: " adopted " })
        .acquisitionMethod,
    ).toBe("adopted");
  });

  it("accepts a body that OMITS acquisitionMethod entirely", () => {
    // THE REGRESSION. `.nullish().catch(null)` let an absent value reach the
    // inner enum, so omitting an optional field produced `invalid_request` on
    // every ordinary registration.
    const parsed = registerPetInputSchema.safeParse(MINIMAL);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.acquisitionMethod).toBeNull();
  });

  it("maps an unrecognised acquisitionMethod to null", () => {
    expect(
      registerPetInputSchema.parse({ ...MINIMAL, acquisitionMethod: "heredada" }).acquisitionMethod,
    ).toBeNull();
  });

  it("refuses a species outside the accepted vocabulary", () => {
    // Unlike intake's free-text species: `breedsForSpecies` keys off these
    // strings, so an unknown species silently yields an empty catalog — the same
    // class of defect the free-text breed closed.
    expect(registerPetInputSchema.safeParse({ ...MINIMAL, species: "dinosaurio" }).success).toBe(
      false,
    );
  });
});

describe("registerPetInputSchema — the estimated age", () => {
  it("accepts a NUMBER, which the FormData path could not", () => {
    // A JSON client has no reason to quote an integer.
    const parsed = registerPetInputSchema.parse({ ...MINIMAL, ageYears: 3, ageMonths: 6 });
    expect(parsed.ageYears).toBe(3);
    expect(parsed.ageMonths).toBe(6);
  });

  it("accepts a STRING, matching the web wizard byte for byte", () => {
    const parsed = registerPetInputSchema.parse({ ...MINIMAL, ageYears: "3" });
    expect(parsed.ageYears).toBe(3);
  });

  it("clamps a negative to zero and an unparseable to zero, never refusing", () => {
    // An age field is an ESTIMATE typed at a kennel door. Rejecting "aprox 2"
    // outright would block a registration over a guess.
    expect(registerPetInputSchema.parse({ ...MINIMAL, ageYears: "-4" }).ageYears).toBe(0);
    expect(registerPetInputSchema.parse({ ...MINIMAL, ageYears: "aprox 2" }).ageYears).toBe(0);
  });

  it("treats a blank string as absent, not as zero", () => {
    // Zero years is a claim ("this animal was born this year"); blank is not.
    expect(registerPetInputSchema.parse({ ...MINIMAL, ageYears: "  " }).ageYears).toBeNull();
  });
});

describe("registerPetInputSchema — duplicateOverride", () => {
  it("defaults to false, so the SAFE value is what an unaware client sends", () => {
    expect(registerPetInputSchema.parse(MINIMAL).duplicateOverride).toBe(false);
  });

  it('refuses the STRING "true" — overriding a data-quality gate is a deliberate act', () => {
    // No string coercion on purpose. A client that stringifies its booleans
    // should find out here, not by silently creating a second animal.
    expect(
      registerPetInputSchema.safeParse({ ...MINIMAL, duplicateOverride: "true" }).success,
    ).toBe(false);
  });
});

describe("registerPetInputSchema — what it deliberately does NOT accept", () => {
  it.each(["microchipId", "clientIdempotencyKey", "custodyKind", "photo"])(
    "ignores %s rather than honouring it",
    (field) => {
      // Each is absent for a stated reason (see the schema's header): the chip is
      // a protocol with no native counterpart yet, the idempotency key is an HTTP
      // header on this transport, custody is its own flow, and the photo needs
      // multipart. An extra key must be DROPPED, never silently carried into a
      // domain object as if the endpoint supported it.
      const parsed = registerPetInputSchema.parse({ ...MINIMAL, [field]: "something" });
      expect(parsed).not.toHaveProperty(field);
    },
  );
});
