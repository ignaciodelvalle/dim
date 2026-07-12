// #48 — sanitary_authority is a valid welfare-derivation recipient (PO-approved).
// A regulator is the natural fiscalización recipient alongside custody orgs.
// Both the derivation-target gate (deriveWelfareToOrgAction) and the
// intervention-access mirror (requireOrgInterventionAccess) read this rule, so
// this pins the eligibility set once for both.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WELFARE_DERIVATION_ORG_TYPES, canReceiveDerivedWelfare } from "./derivation-eligibility";

describe("canReceiveDerivedWelfare — derivation-target eligibility (#48)", () => {
  it("accepts sanitary_authority (a regulator is the natural fiscalización recipient)", () => {
    expect(canReceiveDerivedWelfare("sanitary_authority")).toBe(true);
  });

  it("still accepts the custody orgs (shelter / rescue_network)", () => {
    expect(canReceiveDerivedWelfare("shelter")).toBe(true);
    expect(canReceiveDerivedWelfare("rescue_network")).toBe(true);
  });

  it("still REJECTS non-eligible org types (clinic / other / unknown)", () => {
    expect(canReceiveDerivedWelfare("clinic")).toBe(false);
    expect(canReceiveDerivedWelfare("other")).toBe(false);
    expect(canReceiveDerivedWelfare("")).toBe(false);
    expect(canReceiveDerivedWelfare("admin")).toBe(false);
  });

  it("the eligible set is exactly the three expected types (no accidental widening)", () => {
    expect([...WELFARE_DERIVATION_ORG_TYPES].sort()).toEqual(
      ["rescue_network", "sanitary_authority", "shelter"].sort(),
    );
  });
});

// Both coupled gates in the action layer must route through the shared rule —
// the derivation-target check AND its intervention-access mirror — so widening
// the recipient set (#48) can never leave the two out of sync.
describe("welfare actions route both gates through canReceiveDerivedWelfare", () => {
  const src = readFileSync(join(process.cwd(), "src", "modules", "welfare", "actions.ts"), "utf8");

  it("uses the shared rule and no longer hardcodes the two-type check", () => {
    const gateHits = src.match(/canReceiveDerivedWelfare\(/g) ?? [];
    // One in deriveWelfareToOrgAction (target) + one in requireOrgInterventionAccess (mirror).
    expect(gateHits.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('orgType !== "shelter" && targetOrg.orgType !== "rescue_network"');
  });
});
