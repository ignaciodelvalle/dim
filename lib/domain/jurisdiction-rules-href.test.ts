// Unit tests for buildJurisdictionRulesHref — pure segment-encoding helper
// for the /reglas jurisdiction drill-down (design ADR-1). Covers the `base`
// param added for portal-follows-viewer (2026-07-02): the rules surface
// renders under both /admin and /gob, so drill-down links must stay inside
// whichever portal the viewer is browsing.

import { describe, expect, it } from "vitest";

import { buildJurisdictionRulesHref } from "./jurisdiction-rules-href";

describe("buildJurisdictionRulesHref", () => {
  it('defaults to "/gob" when base is omitted (backward-compatible)', () => {
    expect(buildJurisdictionRulesHref({ country: "AR" })).toBe("/gob/reglas/AR/_/_");
  });

  it('builds an "/admin" href when base is "/admin"', () => {
    expect(buildJurisdictionRulesHref({ country: "AR", base: "/admin" })).toBe(
      "/admin/reglas/AR/_/_",
    );
  });

  it('builds a "/gob" href when base is explicitly "/gob"', () => {
    expect(buildJurisdictionRulesHref({ country: "AR", base: "/gob" })).toBe("/gob/reglas/AR/_/_");
  });

  it("encodes province and locality segments under /admin, using _ for null", () => {
    expect(
      buildJurisdictionRulesHref({
        country: "AR",
        province: "Buenos Aires",
        base: "/admin",
      }),
    ).toBe("/admin/reglas/AR/Buenos%20Aires/_");

    expect(
      buildJurisdictionRulesHref({
        country: "AR",
        province: "Buenos Aires",
        locality: "La Plata",
        base: "/admin",
      }),
    ).toBe("/admin/reglas/AR/Buenos%20Aires/La%20Plata");
  });

  it("treats null and undefined province/locality identically (both -> _ sentinel)", () => {
    const withNull = buildJurisdictionRulesHref({
      country: "AR",
      province: null,
      locality: null,
      base: "/admin",
    });
    const withUndefined = buildJurisdictionRulesHref({ country: "AR", base: "/admin" });
    expect(withNull).toBe(withUndefined);
  });
});
