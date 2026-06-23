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
  "share_telemetry",
  // Alert inbox + triage — deny-all backstop in migration 0111 (Paquete K).
  // Carries jurisdiction + actor FKs (acknowledged_by / contacted / resolved);
  // admin-only reads/writes go through Drizzle BYPASSRLS server actions.
  "alert_firings",
  // Threshold alert subscriptions (migration 0108): owner-scoped via
  // actor_user_id, RLS enabled with read/write-by-owner(+admin) policies.
  "alert_subscriptions",
];

// ---------------------------------------------------------------------------
// Deliberately NOT under RLS — non-PII reference / system data. Each entry
// carries the justification. A reviewer must consciously move a table here.
// ---------------------------------------------------------------------------
const RLS_INTENTIONALLY_EXCLUDED: Readonly<Record<string, string>> = {
  govt_business_rules:
    "Authority-published jurisdiction policy reference (PPP breed lists, weight thresholds). No personal data; admin-only writes via server actions.",
  jurisdictions_census:
    "Public provincial census figures (population by province/year). Public reference data.",
  rate_limit_buckets:
    "Ephemeral counters keyed by an opaque/hashed bucket key. No user identity; TTL-expired rows.",
  ar_localities:
    "Public INDEC locality reference data (already RLS-enabled by an earlier migration; not PII).",
  ar_localities_import_runs:
    "Import bookkeeping for the public locality reference dataset; no PII.",
  cron_runs: "System cron execution bookkeeping; no PII or tenant data.",
  _dim_migrations:
    "Migration runner tracking table (V0-6): applied migration filenames + checksums. Ops metadata, no PII; written only by scripts/migrate.ts via the BYPASSRLS connection.",
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
});
