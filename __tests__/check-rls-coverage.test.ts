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
  MIN_ADMIN_PREDICATES_IN_SOURCE,
  PUBLIC_ROLE_ALLOWLIST,
  type PolicyRoleRow,
  evaluateCoverage,
  evaluatePlatformAdminPredicates,
  evaluatePolicyRoles,
  findPlatformAdminPredicates,
  scanSourceSqlForAdminPredicates,
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

// ---------------------------------------------------------------------------
// Check 5 — platform-admin predicates must exclude erased + deactivated
// profiles (migration 0215). These fixtures are the permanent proof the scan
// is not vacuous: each shape below was a real predicate in the repo on
// 2026-09-09, and the negative ones are what the catalog looked like BEFORE
// 0215.
// ---------------------------------------------------------------------------

function violationsOf(sql: string, source = "fixture") {
  return evaluatePlatformAdminPredicates(findPlatformAdminPredicates(sql, source)).violations;
}

describe("findPlatformAdminPredicates / evaluatePlatformAdminPredicates", () => {
  it("flags the pre-0215 db/cases_rls.sql shape — deactivated_at without deleted_at, unaliased", () => {
    const sql = `
      if exists (
        select 1 from public.profiles
        where id = p_user_id and role = 'admin' and deactivated_at is null
      ) then return true; end if;`;
    const found = findPlatformAdminPredicates(sql, "cases");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ alias: null, hasDeactivatedAt: true, hasDeletedAt: false });
    expect(violationsOf(sql)).toHaveLength(1);
  });

  it("flags the pre-0215 db/rls.sql shape — neither marker, aliased", () => {
    const sql = `
      create policy "audit log visible to actor or admin" on public.audit_log for select to authenticated
      using (
        actor_user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );`;
    const [v] = violationsOf(sql);
    expect(v).toMatchObject({ alias: "p", hasDeletedAt: false, hasDeactivatedAt: false });
  });

  it("accepts the 0215 shape — both markers in the same AND-group", () => {
    const sql = `
      using (
        actor_user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
            and p.deactivated_at is null
            and p.deleted_at is null
        )
      );`;
    expect(findPlatformAdminPredicates(sql, "x")).toHaveLength(1);
    expect(violationsOf(sql)).toEqual([]);
  });

  it("reads the catalog's deparsed rendering (every comparison parenthesised, ::user_role casts)", () => {
    const clean = `((actor_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
      FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role) AND (p.deactivated_at IS NULL) AND (p.deleted_at IS NULL)))))`;
    expect(violationsOf(clean)).toEqual([]);

    const pre0215 = `((actor_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
      FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role) AND (p.deactivated_at IS NULL)))))`;
    expect(violationsOf(pre0215)).toHaveLength(1);
  });

  it("does NOT let a sibling govt branch lend its deleted_at to the admin branch", () => {
    // custody_disputes shape: admin OR govt, both on the same profiles alias.
    // The govt branch carries deleted_at here; the admin branch does not.
    const sql = `(EXISTS ( SELECT 1
      FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (((p.role = 'admin'::user_role) AND (p.account_type = 'institutional'::text) AND (p.deactivated_at IS NULL))
        OR ((p.role = 'govt'::user_role) AND (p.deactivated_at IS NULL) AND (p.deleted_at IS NULL))))))`;
    const [v] = violationsOf(sql);
    expect(v, "the govt branch's deleted_at was credited to the admin branch").toBeDefined();
    expect(v.hasDeletedAt).toBe(false);
  });

  it("credits a marker applied OUTSIDE the OR, at the query's own AND level", () => {
    const sql = `exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.deactivated_at is null
        and ((p.role = 'admin' and p.account_type = 'institutional') or (p.role = 'govt'))
    )`;
    expect(violationsOf(sql)).toEqual([]);
  });

  it("reads profiles through a JOIN (custody_dispute_parties / pet_service_dog shape)", () => {
    const pre0215 = `(EXISTS ( SELECT 1
      FROM (custody_disputes cd JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
      WHERE ((cd.id = custody_dispute_parties.dispute_id) AND (((p.role = 'admin'::user_role) AND (p.account_type = 'institutional'::text) AND (p.deactivated_at IS NULL)) OR ((p.role = 'govt'::user_role) AND (EXISTS ( SELECT 1 FROM govt_assignments g WHERE (g.user_id = p.id))))))))`;
    expect(violationsOf(pre0215)).toHaveLength(1);
  });

  it("accepts role IN (...) and role = ANY(ARRAY[...]) (revocations bucket shapes)", () => {
    const source = `with check (
      bucket_id = 'revocations'
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.account_type = 'institutional'
          and p.role in ('admin', 'govt')
          and p.deactivated_at is null
          and p.deleted_at is null
      )
    );`;
    expect(findPlatformAdminPredicates(source, "x")).toHaveLength(1);
    expect(violationsOf(source)).toEqual([]);

    const catalog = `((bucket_id = 'revocations'::text) AND (EXISTS ( SELECT 1
      FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.account_type = 'institutional'::text) AND (p.role = ANY (ARRAY['admin'::user_role, 'govt'::user_role])) AND (p.deactivated_at IS NULL)))))`;
    expect(
      violationsOf(catalog),
      "ANY(ARRAY[...]) without deleted_at slipped through",
    ).toHaveLength(1);
  });

  it("ignores an ORGANIZATION admin role — organization_memberships has no erasure marker", () => {
    const sql = `using (
      exists (
        select 1 from public.organization_memberships om
        where om.user_id = auth.uid() and om.left_at is null and om.role = 'admin'
      )
    );`;
    expect(findPlatformAdminPredicates(sql, "x")).toEqual([]);
  });

  it("ignores a role test on ANOTHER alias even when profiles is in the same query", () => {
    const sql = `exists (
      select 1 from public.organization_memberships om
      join public.profiles p on p.id = om.user_id
      where om.role = 'admin' and p.deleted_at is null
    )`;
    expect(findPlatformAdminPredicates(sql, "x")).toEqual([]);
  });

  it("does not count a comment mentioning the marker as the marker", () => {
    const sql = `
      -- an erased profile (deleted_at is null is what we want here) is not an admin
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'admin' and p.deactivated_at is null
      )`;
    expect(violationsOf(sql)).toHaveLength(1);
  });

  it("is quiet on SQL with no admin test at all", () => {
    expect(
      findPlatformAdminPredicates(
        "insert into public.notifications (category) values ('admin');",
        "x",
      ),
    ).toEqual([]);
  });
});

describe("db/*.sql — every platform-admin predicate excludes erased + deactivated profiles", () => {
  const predicates = scanSourceSqlForAdminPredicates();

  it(`finds at least ${MIN_ADMIN_PREDICATES_IN_SOURCE} platform-admin tests (non-vacuity)`, () => {
    expect(
      predicates.length,
      `only ${predicates.length} found — the glob or the scanner is broken, not the SQL`,
    ).toBeGreaterThanOrEqual(MIN_ADMIN_PREDICATES_IN_SOURCE);
  });

  it("has no predicate missing deleted_at or deactivated_at", () => {
    const { violations } = evaluatePlatformAdminPredicates(predicates);
    expect(
      violations.map((v) => `${v.source}: ${v.conjunct.slice(0, 120)}`),
      "a bootstrap file grants platform admin to an erased or deactivated profile — see migration 0215",
    ).toEqual([]);
  });
});
