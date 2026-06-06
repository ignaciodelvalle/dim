// Unit tests for domain/bite.ts
// Spec source: task 1.3 — victimKind/severity enums, orgTypeToReporterRole, isInScope.
// Parity: orgTypeToReporterRole mirrors app/actions/bite.ts; isInScope mirrors
//         professionalCloseRabiesObservationAction and outbreak use-cases.

import { describe, expect, it } from "vitest";

import {
  BITE_SEVERITIES,
  VICTIM_KINDS,
  isInScope,
  orgTypeToReporterRole,
} from "./bite";

// ---------------------------------------------------------------------------
// VICTIM_KINDS constant
// ---------------------------------------------------------------------------

describe("VICTIM_KINDS", () => {
  it("contains human, animal, unknown", () => {
    expect(VICTIM_KINDS).toContain("human");
    expect(VICTIM_KINDS).toContain("animal");
    expect(VICTIM_KINDS).toContain("unknown");
  });

  it("has exactly 3 kinds", () => {
    expect(VICTIM_KINDS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// BITE_SEVERITIES constant
// ---------------------------------------------------------------------------

describe("BITE_SEVERITIES", () => {
  it("contains minor, moderate, severe", () => {
    expect(BITE_SEVERITIES).toContain("minor");
    expect(BITE_SEVERITIES).toContain("moderate");
    expect(BITE_SEVERITIES).toContain("severe");
  });

  it("has exactly 3 levels", () => {
    expect(BITE_SEVERITIES).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// orgTypeToReporterRole
// ---------------------------------------------------------------------------

describe("orgTypeToReporterRole", () => {
  it("maps 'clinic' → 'vet'", () => {
    expect(orgTypeToReporterRole("clinic")).toBe("vet");
  });

  it("maps 'shelter' → 'shelter'", () => {
    expect(orgTypeToReporterRole("shelter")).toBe("shelter");
  });

  it("maps 'rescue_network' → 'shelter'", () => {
    expect(orgTypeToReporterRole("rescue_network")).toBe("shelter");
  });

  it("maps 'sanitary_authority' → 'govt'", () => {
    expect(orgTypeToReporterRole("sanitary_authority")).toBe("govt");
  });

  it("maps unknown org type → 'witness' (default)", () => {
    expect(orgTypeToReporterRole("other")).toBe("witness");
  });

  it("maps empty string → 'witness'", () => {
    expect(orgTypeToReporterRole("")).toBe("witness");
  });

  it("maps 'vet_practice' (unknown) → 'witness'", () => {
    expect(orgTypeToReporterRole("vet_practice")).toBe("witness");
  });
});

// ---------------------------------------------------------------------------
// isInScope — govt jurisdiction predicate (spec scenarios H,I)
//
// Spec: national case (no province) → any govt actor;
//       province match AND (no locality OR locality match) → in scope;
//       admin = universal (always in scope);
//       govt with different province → out of scope.
// ---------------------------------------------------------------------------

type JurisdictionCase = {
  province: string | null;
  locality: string | null;
};

type GovtJurisdiction = {
  province: string;
  locality: string;
};

describe("isInScope", () => {
  // ---- Admin is always in scope ----

  it("returns true for admin regardless of case province", () => {
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "Tigre" };
    expect(isInScope("admin", [], investCase)).toBe(true);
  });

  it("returns true for admin on national case (no province)", () => {
    const investCase: JurisdictionCase = { province: null, locality: null };
    expect(isInScope("admin", [], investCase)).toBe(true);
  });

  // ---- National case (no province): any govt is in scope ----

  it("returns true for govt when case has no province (national)", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Córdoba", locality: "Córdoba Capital" },
    ];
    const investCase: JurisdictionCase = { province: null, locality: null };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(true);
  });

  it("returns false for govt with empty jurisdictions on national case (no assignments)", () => {
    const investCase: JurisdictionCase = { province: null, locality: null };
    expect(isInScope("govt", [], investCase)).toBe(false);
  });

  // ---- Province match + any locality ----

  it("returns true when province matches and case has no locality", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Buenos Aires", locality: "Tigre" },
    ];
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: null };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(true);
  });

  it("returns true when province matches and locality matches", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Buenos Aires", locality: "Tigre" },
    ];
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "Tigre" };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(true);
  });

  it("returns false when province matches but locality does not match", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Buenos Aires", locality: "Tigre" },
    ];
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "San Isidro" };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(false);
  });

  it("returns false when province does not match", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Córdoba", locality: "Córdoba Capital" },
    ];
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "Tigre" };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(false);
  });

  it("returns true when one of multiple jurisdictions matches", () => {
    const govtJurisdictions: GovtJurisdiction[] = [
      { province: "Córdoba", locality: "Río Cuarto" },
      { province: "Buenos Aires", locality: "Tigre" },
    ];
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "Tigre" };
    expect(isInScope("govt", govtJurisdictions, investCase)).toBe(true);
  });

  it("returns false for govt with zero jurisdictions on a located case", () => {
    const investCase: JurisdictionCase = { province: "Buenos Aires", locality: "Tigre" };
    expect(isInScope("govt", [], investCase)).toBe(false);
  });
});
