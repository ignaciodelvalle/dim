// Unit tests for lib/revocation-scope.ts — pure canRevoke() function.
// Strict TDD: all test cases written before implementation exists.

import { describe, expect, it } from "vitest";

import { canRevoke } from "@/lib/domain/revocation-scope";
import type { RevocationTarget } from "@/lib/domain/revocation-scope";

const adminProfile = { id: "admin-1", role: "admin" as const };
const govtProfile = { id: "govt-1", role: "govt" as const };

const bsasJurisdictions = [{ province: "Buenos Aires", locality: "La Plata" }];
const cbaJurisdictions = [{ province: "Córdoba", locality: "Córdoba" }];
const multiJurisdictions = [
  { province: "Buenos Aires", locality: "La Plata" },
  { province: "CABA", locality: "Palermo" },
];

// ---------------------------------------------------------------------------
// Admin — unconditional YES for all three types
// ---------------------------------------------------------------------------

describe("canRevoke — admin", () => {
  it("returns true for vet_role regardless of jurisdiction", () => {
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Santa Fe",
    };
    expect(canRevoke(adminProfile, target, [])).toBe(true);
  });

  it("returns true for org_verification regardless of jurisdiction", () => {
    const target: RevocationTarget = {
      type: "org_verification",
      province: "Santa Fe",
      locality: "Rosario",
    };
    expect(canRevoke(adminProfile, target, [])).toBe(true);
  });

  it("returns true for govt_locality regardless of jurisdiction", () => {
    const target: RevocationTarget = {
      type: "govt_locality",
      province: "Santa Fe",
      locality: "Rosario",
    };
    expect(canRevoke(adminProfile, target, [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Govt — org_verification: province + locality must match
// ---------------------------------------------------------------------------

describe("canRevoke — govt, org_verification", () => {
  it("returns true when jurisdiction matches exactly", () => {
    const target: RevocationTarget = {
      type: "org_verification",
      province: "Buenos Aires",
      locality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns false when province matches but locality differs", () => {
    const target: RevocationTarget = {
      type: "org_verification",
      province: "Buenos Aires",
      locality: "Mar del Plata",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(false);
  });

  it("returns false when no jurisdictions match", () => {
    const target: RevocationTarget = {
      type: "org_verification",
      province: "Buenos Aires",
      locality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, cbaJurisdictions)).toBe(false);
  });

  it("returns true when one of multiple jurisdictions matches", () => {
    const target: RevocationTarget = {
      type: "org_verification",
      province: "CABA",
      locality: "Palermo",
    };
    expect(canRevoke(govtProfile, target, multiJurisdictions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Govt — govt_locality: province + locality must match
// ---------------------------------------------------------------------------

describe("canRevoke — govt, govt_locality", () => {
  it("returns true when jurisdiction matches", () => {
    const target: RevocationTarget = {
      type: "govt_locality",
      province: "Buenos Aires",
      locality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns false when jurisdiction does not match", () => {
    const target: RevocationTarget = {
      type: "govt_locality",
      province: "Buenos Aires",
      locality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, cbaJurisdictions)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Govt — vet_role: matches matricula_jurisdiccion (province-only string)
//         OR operational (province, locality) — OR semantics
// ---------------------------------------------------------------------------

describe("canRevoke — govt, vet_role", () => {
  it("returns true when matricula_jurisdiccion matches govt province", () => {
    // govt has Buenos Aires / La Plata; vet's matricula_jurisdiccion = "Buenos Aires"
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Buenos Aires",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns true when operational province+locality matches exactly", () => {
    // vet has no matching matricula_jurisdiccion but operational locality matches
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Santa Fe",
      operationalProvince: "Buenos Aires",
      operationalLocality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns false when neither matricula nor operational locality matches", () => {
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Santa Fe",
      operationalProvince: "Mendoza",
      operationalLocality: "Mendoza",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(false);
  });

  it("returns true via OR semantics: matricula matches even if operational does not", () => {
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Buenos Aires",
      operationalProvince: "Santa Fe",
      operationalLocality: "Rosario",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns true via OR semantics: operational matches even if matricula does not", () => {
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Santa Fe",
      operationalProvince: "Buenos Aires",
      operationalLocality: "La Plata",
    };
    expect(canRevoke(govtProfile, target, bsasJurisdictions)).toBe(true);
  });

  it("returns false when govt has no jurisdictions", () => {
    const target: RevocationTarget = {
      type: "vet_role",
      matriculaJurisdiccion: "Buenos Aires",
    };
    expect(canRevoke(govtProfile, target, [])).toBe(false);
  });
});
