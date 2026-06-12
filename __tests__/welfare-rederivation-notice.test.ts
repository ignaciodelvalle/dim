// UI-7 B8 — re-derivation de-notify. When a welfare report is re-derived to a
// DIFFERENT org, the previous org's active members must receive a corrective
// notice ("welfare_report_rederived_away") so they know they're no longer
// responsible (true notification retraction isn't possible).
//
// deriveWelfareToOrgAction is a server action with direct DB access, so we
// assert the de-notify branch structurally in source (consistent with the other
// welfare fitness source-scans).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ACTIONS_FILE = join(process.cwd(), "src", "modules", "welfare", "actions.ts");

describe("re-derivation de-notify (UI-7 B8)", () => {
  const src = readFileSync(ACTIONS_FILE, "utf8");

  it("captures the previous derivation target before overwriting", () => {
    expect(src).toMatch(/previousOrgId\s*=\s*report\.derivedToOrganizationId/);
  });

  it("only notifies the previous org when it differs from the new target", () => {
    expect(src).toMatch(/previousOrgId\s*&&\s*previousOrgId\s*!==\s*targetOrg\.id/);
  });

  it("emits a welfare_report_rederived_away corrective notice", () => {
    expect(src).toContain("welfare_report_rederived_away");
  });

  it("resets org intervention state on re-derivation", () => {
    expect(src).toMatch(/orgInterventionStatus:\s*null/);
    expect(src).toMatch(/orgInterventionAt:\s*null/);
  });
});
