/**
 * Unit tests for the pure evaluators in scripts/check-rls-coverage.ts.
 *
 * Pure fixture tests — no database. The catalog-level assertions live in
 * __tests__/rls/coverage.test.ts, which runs against the real local Postgres;
 * these pin the DECISION RULES so a fence that once counted policies without
 * reading them cannot regress to that quietly.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_ROLE_ALLOWLIST,
  type PolicyRoleRow,
  evaluateCoverage,
  evaluatePolicyRoles,
} from "@/scripts/check-rls-coverage";

function policy(overrides: Partial<PolicyRoleRow> = {}): PolicyRoleRow {
  return {
    table_name: "pets",
    policy_name: "pets select by owner",
    roles: ["authenticated"],
    cmd: "SELECT",
    ...overrides,
  };
}

describe("evaluatePolicyRoles", () => {
  it("flags a policy whose role set is the PUBLIC default", () => {
    // pg_policies renders a missing TO clause as exactly {public}.
    const { violations } = evaluatePolicyRoles([policy({ roles: ["public"] })]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ table_name: "pets", cmd: "SELECT" });
  });

  it("accepts an explicit authenticated-only policy", () => {
    expect(evaluatePolicyRoles([policy()]).violations).toEqual([]);
  });

  it("accepts an explicit anon policy — naming anon is a decision, defaulting to it is not", () => {
    const rows = [policy({ roles: ["anon", "authenticated"] }), policy({ roles: ["anon"] })];
    expect(evaluatePolicyRoles(rows).violations).toEqual([]);
  });

  it("does NOT treat a role set that merely CONTAINS public as the default", () => {
    // `TO public, authenticated` is redundant but written down; only the bare
    // single-element {public} is the "nobody said anything" shape.
    expect(
      evaluatePolicyRoles([policy({ roles: ["public", "authenticated"] })]).violations,
    ).toEqual([]);
  });

  it("respects the allowlist and reports it separately", () => {
    const key = "ar_localities:ar_localities select authenticated";
    try {
      PUBLIC_ROLE_ALLOWLIST[key] = "test fixture";
      const result = evaluatePolicyRoles([
        policy({
          table_name: "ar_localities",
          policy_name: "ar_localities select authenticated",
          roles: ["public"],
        }),
      ]);
      expect(result.violations).toEqual([]);
      expect(result.allowlisted).toEqual([key]);
    } finally {
      delete PUBLIC_ROLE_ALLOWLIST[key];
    }
  });

  it("ships with an EMPTY allowlist — every policy names its roles today", () => {
    expect(Object.keys(PUBLIC_ROLE_ALLOWLIST)).toEqual([]);
  });
});

describe("evaluateCoverage (unchanged contract — db:doctor shares it)", () => {
  it("flags a table with RLS disabled", () => {
    const { violations } = evaluateCoverage([
      { table_name: "pets", rls_enabled: false, policy_count: "3" },
    ]);
    expect(violations).toEqual([{ table_name: "pets", kind: "rls_disabled" }]);
  });

  it("flags an RLS-enabled table with zero policies and no allowlist entry", () => {
    const { violations } = evaluateCoverage([
      { table_name: "brand_new_table", rls_enabled: true, policy_count: "0" },
    ]);
    expect(violations).toEqual([{ table_name: "brand_new_table", kind: "no_policies" }]);
  });

  it("treats a documented deny-all table as allowlisted, not a violation", () => {
    const { violations, allowlisted } = evaluateCoverage([
      { table_name: "rate_limit_buckets", rls_enabled: true, policy_count: "0" },
    ]);
    expect(violations).toEqual([]);
    expect(allowlisted).toEqual(["rate_limit_buckets"]);
  });
});
