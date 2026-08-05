// RLS coverage fitness test (V0-4 — P0 data security).
// ====================================================
//
// STRUCTURAL GUARANTEE: every table the project designates as PII or
// tenant-scoped MUST have Row Level Security ENABLED at the catalog level
// (pg_class.relrowsecurity = true). This test introspects the LIVE local
// Postgres catalog (the same stack the other db tests run against) and FAILS
// if any required table ships without RLS.
//
// WHY THIS MATTERS: the app connects as `postgres` (BYPASSRLS), so RLS never
// governs the app itself — it is pure defense-in-depth against the PostgREST
// surface reached via the supabase-js anon / publishable key. A new PII table
// shipped with RLS *disabled* is silently exposed to anon reads. This test is
// the tripwire that makes that omission a red CI run instead of a breach.
//
// HOW TO SATISFY A FAILURE: if you add a PII / tenant table, enable RLS on it
// in a migration (see db/migrations/0086_track_rls_in_migrations.sql) and add
// the table to `RLS_REQUIRED` below. If a new table is genuinely NOT PII and
// not tenant-scoped, add it to `RLS_INTENTIONALLY_EXCLUDED` with a reason —
// do NOT just delete it from the required set.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";

// ---------------------------------------------------------------------------
// Designated PII / tenant-scoped tables — RLS MUST be enabled on each.
// Keep this list explicit (not derived) so adding a table is a deliberate act
// and the reviewer sees the security classification in the diff.
// ---------------------------------------------------------------------------
const RLS_REQUIRED: ReadonlyArray<string> = [
  // Owner-facing core (db/rls.sql → migration 0086)
  "profiles",
  "pets",
  "ownerships",
  "pet_events",
  "reminders",
  "attachments",
  "notifications",
  "libreta_share_tokens",
  // Admin governance (migration 0086)
  "govt_assignments",
  "approval_requests",
  "audit_log",
  // Organizations (migration 0086)
  "organizations",
  "organization_coverage",
  "organization_memberships",
  "organization_capability_grants", // migration 0004
  "organization_invitations", // deny-all, migration 0086
  // Welfare (migration 0086)
  "welfare_reports",
  "welfare_report_attachments",
  // Foster (migration 0086)
  "foster_volunteers",
  "foster_proposals",
  // Scheduling (migration 0086)
  "service_offerings",
  "service_schedule_rules",
  "time_slots",
  "appointments",
  // Cases + per-kind PII (migrations 0025 / 0026 / 0034 / 0046 / 0051)
  "cases",
  "case_events", // deny-all, migration 0086
  "custody_disputes",
  "custody_dispute_parties",
  "pet_service_dog",
  "pet_achievement_views",
  "org_contact_messages",
  // Newer PII / tenant tables — deny-all in migration 0086
  "pet_transfers",
  "pet_identifications",
  "physical_tag_interest",
  "eno_processing_queue",
  "event_notification_outbox",
  "notification_dead_letter", // deny-all, migration 0125 (PII payload recovery surface)
  // share_telemetry lived here until migration 0167 dropped the table (TEL-1,
  // PO 2026-08-04): collected per-view viewer data that nothing ever read.
  // Alert inbox + triage — deny-all backstop in migration 0111 (Paquete K).
  // Carries jurisdiction + actor FKs (acknowledged_by / contacted / resolved);
  // admin-only reads/writes go through Drizzle BYPASSRLS server actions.
  "alert_firings",
  // Threshold alert subscriptions (migration 0108): owner-scoped via
  // actor_user_id, RLS enabled with read/write-by-owner(+admin) policies.
  "alert_subscriptions",
  // Novedades feed watermark (migration 0143): per-user UI state, RLS enabled
  // with owner-only SELECT/INSERT/UPDATE policies (user_id = auth.uid()); no
  // admin branch, no DELETE (rows go via profiles CASCADE only).
  "operator_feed_watermarks",
  // Advisor remediation (migration 0113): deny-all on four tables the Supabase
  // security advisor flagged rls_disabled_in_public. The app reaches all four
  // only via Drizzle / service-role (BYPASSRLS); deny-all just closes the
  // anonymous PostgREST surface. This SUPERSEDES their 0086 PART 7 exclusion.
  "rate_limit_buckets",
  "_dim_migrations",
  "govt_business_rules",
  "jurisdictions_census",
  // Precomputed panorama aggregate cube (migration 0139): deny-all, read only
  // via analyticsDb service-role (BYPASSRLS). Values are already k-anon'd at
  // build (no sub-k value stored), but the tables still carry RLS-enabled
  // deny-all so PostgREST can never read them. Same posture as rate_limit_buckets.
  "panorama_cube",
  "panorama_cube_meta",
  // Precomputed KPI-strip cube (migration 0151): same posture as panorama_cube —
  // deny-all, tiles k-anon'd at build, read only via analyticsDb service-role.
  "panorama_kpi_cube",
  "panorama_kpi_cube_meta",
  // Web Push subscriptions (migration 0152): owner-only SELECT/INSERT/UPDATE
  // policies (user_id = auth.uid()); no DELETE (revocation is a soft
  // revoked_at update; rows go via profiles CASCADE only).
  "push_subscriptions",
];

// ---------------------------------------------------------------------------
// DENY-ALL tables — RLS enabled with ZERO policies (the app reaches them only
// via Drizzle / service-role BYPASSRLS; the PostgREST surface must be fully
// closed). RLS-enabled + no policy = default-deny for every operation and role.
//
// R3 (Tier-2 authz critique): the coverage test asserted RLS-*enabled* but not
// that these deny-all tables carry NO policies — a table shipped RLS-on with an
// accidental `USING (true)` SELECT policy would still pass the enabled check
// while being wide open. This set makes the zero-policy contract explicit.
// Every entry is documented as deny-all in RLS_REQUIRED above.
// ---------------------------------------------------------------------------
const RLS_DENY_ALL: ReadonlyArray<string> = [
  "rate_limit_buckets",
  "_dim_migrations",
  "govt_business_rules",
  "jurisdictions_census",
  "notification_dead_letter",
  "panorama_cube",
  "panorama_cube_meta",
  "panorama_kpi_cube",
  "panorama_kpi_cube_meta",
  "case_events",
  "organization_invitations",
  "alert_firings",
  "eno_processing_queue",
  "event_notification_outbox",
  "physical_tag_interest",
];

// ---------------------------------------------------------------------------
// Deliberately NOT under RLS — non-PII reference / system data. Each entry
// carries the justification. A reviewer must consciously move a table here.
// ---------------------------------------------------------------------------
const RLS_INTENTIONALLY_EXCLUDED: Readonly<Record<string, string>> = {
  // NOTE: govt_business_rules, jurisdictions_census, rate_limit_buckets and
  // _dim_migrations were excluded here (0086 PART 7) until migration 0113 moved
  // them to deny-all RLS — they now live in RLS_REQUIRED. See 0113.
  ar_localities:
    "Public INDEC locality reference data (already RLS-enabled by an earlier migration; not PII).",
  ar_localities_import_runs:
    "Import bookkeeping for the public locality reference dataset; no PII.",
  cron_runs: "System cron execution bookkeeping; no PII or tenant data.",
};

// ---------------------------------------------------------------------------

async function relrowsecurityMap(): Promise<Map<string, boolean>> {
  const rows = (await db.execute(sql`
    select c.relname as relname, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  `)) as unknown as Array<{ relname: string; rls: boolean }>;
  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(row.relname, row.rls === true);
  }
  return map;
}

/** Count of RLS policies per public table, from the live catalog. */
async function policyCountMap(): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    select tablename, count(*)::int as n
    from pg_policies
    where schemaname = 'public'
    group by tablename
  `)) as unknown as Array<{ tablename: string; n: number }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.tablename, Number(row.n));
  }
  return map;
}

/** Every policy in the public schema with its role set, from the live catalog. */
async function policyRoleRows(): Promise<Array<{ tablename: string; policyname: string }>> {
  return (await db.execute(sql`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles::text[] = array['public']
    order by tablename, policyname
  `)) as unknown as Array<{ tablename: string; policyname: string }>;
}

/** The USING/WITH CHECK predicates of one named policy, from the live catalog. */
async function policyPredicate(table: string, policyName: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    select coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = ${table}
      and policyname = ${policyName}
  `)) as unknown as Array<{ qual: string; with_check: string }>;
  if (rows.length === 0) return null;
  return `${rows[0].qual} ${rows[0].with_check}`;
}

describe("RLS coverage (V0-4 structural guarantee)", () => {
  it("every designated PII / tenant table has RLS enabled (relrowsecurity = true)", async () => {
    const map = await relrowsecurityMap();

    const missingTable = RLS_REQUIRED.filter((t) => !map.has(t));
    expect(
      missingTable,
      `Tables listed in RLS_REQUIRED but absent from the public schema. Either the migration did not run or the name is wrong: ${missingTable.join(", ")}`,
    ).toEqual([]);

    const rlsDisabled = RLS_REQUIRED.filter((t) => map.has(t) && map.get(t) !== true);
    expect(
      rlsDisabled,
      `PII / tenant tables WITHOUT RLS enabled (P0 data-security gap). Enable RLS in a migration (see 0086_track_rls_in_migrations.sql): ${rlsDisabled.join(", ")}`,
    ).toEqual([]);
  });

  it("every public table is classified — no PII table escapes the contract", async () => {
    const map = await relrowsecurityMap();
    const classified = new Set<string>([
      ...RLS_REQUIRED,
      ...Object.keys(RLS_INTENTIONALLY_EXCLUDED),
    ]);

    // Any public base table not in either list is unclassified. Forcing a
    // classification on every table is what makes a NEW PII table impossible
    // to ship unnoticed: it must be triaged into RLS_REQUIRED (and a migration)
    // or RLS_INTENTIONALLY_EXCLUDED (with a documented reason).
    const unclassified = [...map.keys()].filter((t) => !classified.has(t)).sort();
    expect(
      unclassified,
      `New public table(s) not classified for RLS. Add each to RLS_REQUIRED (and enable RLS in a migration) if it holds PII / tenant data, or to RLS_INTENTIONALLY_EXCLUDED with a reason if it does not: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("intentionally-excluded tables carry a non-empty justification", () => {
    const undocumented = Object.entries(RLS_INTENTIONALLY_EXCLUDED)
      .filter(([, reason]) => !reason || reason.trim().length === 0)
      .map(([table]) => table);
    expect(undocumented, `Excluded tables missing a reason: ${undocumented.join(", ")}`).toEqual(
      [],
    );
  });

  // R3 (Tier-2 authz critique): a deny-all table is only truly closed if it
  // carries ZERO policies. RLS-enabled + an accidental `USING (true)` SELECT
  // policy would pass the enabled check while being wide open to PostgREST. Assert
  // the zero-policy contract for every table documented as deny-all.
  it("every deny-all table carries ZERO RLS policies (default-deny, not USING(true))", async () => {
    const map = await relrowsecurityMap();
    const counts = await policyCountMap();

    // Guard: the deny-all tables must exist and have RLS enabled (else the
    // zero-policy assertion below would pass vacuously on a dropped/renamed table).
    const missingOrDisabled = RLS_DENY_ALL.filter((t) => map.get(t) !== true);
    expect(
      missingOrDisabled,
      `Deny-all tables absent or without RLS enabled: ${missingOrDisabled.join(", ")}`,
    ).toEqual([]);

    const withPolicies = RLS_DENY_ALL.filter((t) => (counts.get(t) ?? 0) > 0).map(
      (t) => `${t} (${counts.get(t)} policies)`,
    );
    expect(
      withPolicies,
      `Deny-all tables MUST have zero policies but some carry policies — a policy on a deny-all table can silently widen the PostgREST surface (P0). Investigate each: ${withPolicies.join(", ")}`,
    ).toEqual([]);
  });

  // 2026-08-05: a policy with no TO clause applies to PUBLIC — every role,
  // including `anon`, whose key ships in the client bundle. Ten policies were in
  // that state (custody_disputes, custody_dispute_parties, cases,
  // pet_service_dog, pet_achievement_views ×3, cron_runs, ar_localities,
  // ar_localities_import_runs) and every existence-based check called them
  // covered. They were safe only because each predicate resolves through
  // auth.uid(), which is NULL for anon — one relaxed predicate away from an
  // anonymous read. Migration 0168 narrowed all ten to `TO authenticated`.
  it("every RLS policy names its roles explicitly (no policy falls through to PUBLIC)", async () => {
    const publicRolePolicies = (await policyRoleRows()).map(
      (r) => `${r.tablename}.${r.policyname}`,
    );
    expect(
      publicRolePolicies,
      `Policies with no TO clause, so they apply to PUBLIC (anon included). Name the roles in a forward-only migration — ALTER POLICY "<name>" ON public.<table> TO authenticated; — see 0168_rls_policies_explicit_roles.sql: ${publicRolePolicies.join(", ")}`,
    ).toEqual([]);
  });

  // R1 + R2 (Tier-2 authz critique): the govt READ policies on the two PII
  // surfaces must be jurisdiction-scoped. This is a catalog-level predicate
  // assertion (independent of any seeded session) proving migration 0140 landed:
  //   - pet_identifications govt read references jurisdiction_locality (R1), and
  //   - pet_service_dog references govt_assignments in its govt branch (R2).
  it("pet_identifications govt read policy is scoped by jurisdiction_locality (R1)", async () => {
    const predicate = await policyPredicate(
      "pet_identifications",
      "pet_identifications read by govt in jurisdiction",
    );
    expect(predicate, "govt read policy on pet_identifications is missing").not.toBeNull();
    expect(
      predicate,
      "govt read must scope by jurisdiction_locality (province-only match leaks PII province-wide — R1)",
    ).toContain("jurisdiction_locality");
    expect(predicate).toContain("govt_assignments");
    // Sibling guards: role='govt' + deactivation, matching custody_disputes.
    expect(predicate).toContain("'govt'::user_role");
    expect(predicate).toContain("deactivated_at IS NULL");
  });

  it("pet_service_dog authority policy joins govt_assignments for the govt branch (R2)", async () => {
    const predicate = await policyPredicate(
      "pet_service_dog",
      "service_dog select by owner or authority",
    );
    expect(predicate, "service_dog authority policy is missing").not.toBeNull();
    expect(
      predicate,
      "govt branch must join govt_assignments (no join = any institutional govt reads assistance-dog status nationwide — R2)",
    ).toContain("govt_assignments");
    expect(predicate).toContain("jurisdiction_locality");
  });
});
