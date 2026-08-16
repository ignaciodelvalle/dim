// deriveCredentialRegistryClaim — ADR-7 credential claim tiering (spec CT1/CT2).
//
// CT1: the public credential must not imply state registration in a province
// with no registry rule backing the claim. CT2: mandatory + registry-backed
// preserves the existing full "Identidad registrada" language.

import { describe, expect, it } from "vitest";

import {
  IDENTITY_HEADING_NEUTRAL,
  IDENTITY_HEADING_REGISTRY_BACKED,
  deriveCredentialRegistryClaim,
} from "@/lib/domain/credential-claims";

const MATCHED = { id: "rule-1", country: "AR", province: "CABA", locality: null };

describe("deriveCredentialRegistryClaim — CT scenario table", () => {
  it("no rule resolved (default path) → neutral, no state-registration claim (CT1)", () => {
    // Even a payload claiming required:true must never back the full claim
    // without a matched row — a default is not a law of the pet's province.
    // (Since RG2's ratification the real default payload is {required: false};
    // the harder shape is pinned here on purpose.)
    const claim = deriveCredentialRegistryClaim({ payload: { required: true }, matchedRow: null });
    expect(claim.registryBacked).toBe(false);
    expect(claim.identityHeading).toBe(IDENTITY_HEADING_NEUTRAL);
  });

  it("null rule (degraded caller) → neutral", () => {
    const claim = deriveCredentialRegistryClaim(null);
    expect(claim.registryBacked).toBe(false);
    expect(claim.identityHeading).toBe(IDENTITY_HEADING_NEUTRAL);
  });

  it("mandatory + registry-backed → full existing claim preserved (CT2)", () => {
    const claim = deriveCredentialRegistryClaim({
      requirementLevel: "mandatory",
      payload: { required: true },
      matchedRow: MATCHED,
    });
    expect(claim.registryBacked).toBe(true);
    expect(claim.identityHeading).toBe(IDENTITY_HEADING_REGISTRY_BACKED);
    expect(claim.identityHeading).toBe("Identidad registrada");
  });

  it("matched row with not_regulated tier → neutral", () => {
    const claim = deriveCredentialRegistryClaim({
      requirementLevel: "not_regulated",
      payload: { required: true },
      matchedRow: MATCHED,
    });
    expect(claim.registryBacked).toBe(false);
    expect(claim.identityHeading).toBe(IDENTITY_HEADING_NEUTRAL);
  });

  it("matched row with recommended tier → neutral (only mandatory backs the claim)", () => {
    const claim = deriveCredentialRegistryClaim({
      requirementLevel: "recommended",
      payload: { required: true },
      matchedRow: MATCHED,
    });
    expect(claim.registryBacked).toBe(false);
  });

  it("matched pre-tier row (NULL tier) follows the OR5 boolean gate", () => {
    expect(
      deriveCredentialRegistryClaim({
        requirementLevel: null,
        payload: { required: true },
        matchedRow: MATCHED,
      }).registryBacked,
    ).toBe(true);
    expect(
      deriveCredentialRegistryClaim({
        requirementLevel: null,
        payload: { required: false },
        matchedRow: MATCHED,
      }).registryBacked,
    ).toBe(false);
  });

  it("the neutral heading scopes the claim to miMAR and never mentions the state", () => {
    expect(IDENTITY_HEADING_NEUTRAL).toBe("Identidad registrada en miMAR");
    expect(IDENTITY_HEADING_NEUTRAL).not.toMatch(/estado|oficial|nacional/i);
    expect(IDENTITY_HEADING_NEUTRAL).not.toBe(IDENTITY_HEADING_REGISTRY_BACKED);
  });
});
