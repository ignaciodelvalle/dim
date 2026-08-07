-- =====================================================================
-- staging-rls-remediation.sql — re-enable Row Level Security on staging
-- =====================================================================
--
-- RUNBOOK (es-AR): scripts/ops/staging-rls-remediation.md — READ IT FIRST.
-- This file is the instrument; the runbook is the procedure. Do not paste
-- section 2 into a SQL editor before running section 1 and reading its output.
--
-- Written 2026-07-26. NOT EXECUTED against any database by its author.
-- Every statement below is derived from reading db/migrations/*.sql and
-- scripts/check-rls-coverage.ts. Nothing here has been run on staging.
--
-- Context: docs/reviews/results/2026-07-26-cutover-staging-readiness.md §B1.
--   27 of 53 public tables in staging have relrowsecurity = false. The anon
--   REST key returns HTTP 206 with full rows from pets, profiles, pet_events,
--   ownerships and audit_log, including a real user's email address.
--   Migration 0086 DOES enable RLS and is recorded as applied on 2026-07-07.
--   Something disabled it afterwards. Verified: the string
--   "DISABLE ROW LEVEL SECURITY" does not appear anywhere in this repository
--   except inside that review document. The cause is outside the repo.
--
--
-- =====================================================================
-- 0. THE DANGER — read this before anything else
-- =====================================================================
--
-- ENABLING RLS ON A TABLE THAT HAS NO POLICIES MAKES THAT TABLE RETURN
-- ZERO ROWS TO EVERY NON-SERVICE_ROLE CLIENT. INSTANTLY. NO ERROR, NO
-- WARNING — AN EMPTY RESULT SET THAT LOOKS EXACTLY LIKE "NO DATA".
--
-- A working page can go blank the second the ALTER commits. There is no
-- transaction to wait for and no deploy to gate it: PostgREST picks it up
-- on the next request.
--
-- This is why SECTION 1 exists and why it is not optional. Run it, read
-- the `verdict` column, and only then decide.
--
-- WHY WE BELIEVE IT IS SAFE HERE (evidence, not reassurance):
--
--   a) The application connects through DATABASE_URL as the `postgres`
--      role, which has BYPASSRLS. Every Drizzle query, every server
--      action, the public /p/[publicToken] credential page and the Tier-2
--      libreta route go through that connection and ignore RLS entirely.
--      Source: db/migrations/0086_track_rls_in_migrations.sql, header
--      "CONNECTION-ROLE INVARIANT".
--
--   b) RLS on public tables only governs PostgREST — the supabase-js
--      anon / publishable key. Grepped the whole repo for browser-side
--      table reads: the only files that instantiate the browser client are
--        components/BulkRevokeList.tsx
--        app/gob/usuarios/RevokeUserActions.tsx
--        app/gob/organizaciones/RevokeOrgActions.tsx
--        lib/ui/use-evidence-upload.ts
--      and every one of them calls `supabase.storage.from("revocations")`
--      — a STORAGE BUCKET, not a public table. Storage authorization lives
--      in storage.objects and is untouched by this script.
--      No .channel() / postgres_changes subscription exists in app code.
--      No direct fetch() to /rest/v1 exists in app code.
--      => As of this commit, NO application surface reads any public.*
--         table through PostgREST. The expected blast radius is zero.
--
--   c) That evidence is about THIS repository at THIS commit. It is not
--      about whatever an operator, a Studio session, or a Postman
--      collection may be doing against staging right now. Section 1 is
--      what turns (b) from a code claim into a database fact.
--
-- DO NOT ADD `FORCE ROW LEVEL SECURITY`. Plain ENABLE exempts the table
-- owner; FORCE does not. Since the app connects as the owner (`postgres`),
-- FORCE would apply these policies to the application itself and take the
-- whole product down. There is no FORCE anywhere in this file. Keep it
-- that way.
--
-- Privilege note: ALTER TABLE requires table ownership. Connect as
-- `postgres` (the session pooler on port 5432 — the transaction pooler on
-- 6543 does not support DDL).
--
--
-- =====================================================================
-- 1. PRE-FLIGHT — READ-ONLY. RUN THIS FIRST. CHANGES NOTHING.
-- =====================================================================
--
-- 1.A — Every public table, its RLS flag, its policy count, and a verdict
--       saying what enabling RLS would do to it.
--
-- The `deny_all_by_design` set is copied from DENY_ALL_ALLOWLIST in
-- scripts/check-rls-coverage.ts (16 tables). Those are tables the repo
-- INTENDS to have RLS with zero policies, because they are reached only
-- via service-role. For them, "returns zero rows to PostgREST" is the
-- designed outcome, not an accident.

WITH deny_all_by_design(table_name) AS (
  VALUES
    ('_dim_migrations'),
    ('alert_firings'),
    ('case_events'),
    ('eno_processing_queue'),
    ('event_notification_outbox'),
    ('govt_business_rules'),
    ('jurisdictions_census'),
    ('notification_dead_letter'),
    ('organization_invitations'),
    ('panorama_cube'),
    ('panorama_cube_meta'),
    ('panorama_kpi_cube'),
    ('panorama_kpi_cube_meta'),
    ('physical_tag_interest'),
    ('rate_limit_buckets')
    -- share_telemetry was here until migration 0167 dropped the table
    -- (TEL-1, PO 2026-08-04).
),
t AS (
  SELECT
    c.relname                                        AS table_name,
    c.relrowsecurity                                 AS rls_enabled,
    c.relforcerowsecurity                            AS rls_forced,
    (SELECT count(*)
       FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename  = c.relname)                AS policy_count,
    has_table_privilege('anon',          format('public.%I', c.relname), 'SELECT') AS anon_can_select,
    has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') AS auth_can_select
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind      = 'r'
)
SELECT
  t.table_name,
  t.rls_enabled,
  t.rls_forced,
  t.policy_count,
  t.anon_can_select,
  (d.table_name IS NOT NULL) AS deny_all_intended,
  CASE
    WHEN t.rls_enabled AND t.policy_count > 0
      THEN 'OK — already enforced, nothing to do'
    WHEN t.rls_enabled AND d.table_name IS NOT NULL
      THEN 'OK — deny-all by design, already enabled'
    WHEN t.rls_enabled AND t.policy_count = 0
      THEN 'REVIEW — enabled, zero policies, NOT in the allowlist'
    WHEN NOT t.rls_enabled AND t.policy_count > 0
      THEN 'FIX — policies exist but are not enforced. Enabling restores them. NO page goes dark.'
    WHEN NOT t.rls_enabled AND d.table_name IS NOT NULL
      THEN 'FIX — deny-all by design. Enabling gives PostgREST zero rows. That is the intent.'
    ELSE
      'FIX + DANGER — no policies and NOT in the allowlist. Enabling gives PostgREST zero rows UNEXPECTEDLY. Investigate before enabling.'
  END AS verdict
FROM t
LEFT JOIN deny_all_by_design d ON d.table_name = t.table_name
ORDER BY
  (NOT t.rls_enabled) DESC,   -- broken tables first
  t.policy_count ASC,         -- riskiest first inside each group
  t.table_name;


-- 1.B — The headline numbers. This is the line that confirms or refutes
--       the "27 of 53" in the review. Do not trust the brief; trust this.

SELECT
  count(*)                                             AS public_tables,
  count(*) FILTER (WHERE NOT relrowsecurity)           AS rls_disabled,
  count(*) FILTER (WHERE relrowsecurity)               AS rls_enabled,
  count(*) FILTER (WHERE relforcerowsecurity)          AS rls_forced_should_be_zero
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind      = 'r';


-- 1.C — THE LIST THAT MATTERS: tables that would go dark.
--
--       Every row here is a table with RLS off AND zero policies. Enabling
--       RLS turns each one into "zero rows via the anon/authenticated REST
--       key". Read this list out loud before running section 2.
--
--       Tables flagged `intended = true` are the repo's designed deny-all
--       set — going dark is the point. Tables flagged `intended = false`
--       are the ones to stop on: either their policies were dropped along
--       with RLS, or something reads them that the code review did not see.

WITH deny_all_by_design(table_name) AS (
  VALUES
    ('_dim_migrations'), ('alert_firings'), ('case_events'),
    ('eno_processing_queue'), ('event_notification_outbox'),
    ('govt_business_rules'), ('jurisdictions_census'),
    ('notification_dead_letter'), ('organization_invitations'),
    ('panorama_cube'), ('panorama_cube_meta'), ('panorama_kpi_cube'),
    ('panorama_kpi_cube_meta'), ('physical_tag_interest'),
    ('rate_limit_buckets')
    -- share_telemetry was here until migration 0167 dropped the table
    -- (TEL-1, PO 2026-08-04).
)
SELECT
  c.relname AS goes_dark_to_postgrest,
  (d.table_name IS NOT NULL) AS intended,
  CASE WHEN d.table_name IS NOT NULL
       THEN 'expected — service-role only'
       ELSE 'UNEXPECTED — stop and read section 3 of the runbook'
  END AS note
FROM pg_class c
LEFT JOIN deny_all_by_design d ON d.table_name = c.relname
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind      = 'r'
  AND NOT c.relrowsecurity
  AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname)
ORDER BY intended, c.relname;


-- 1.D — Wide-open policies. A table can have RLS enabled, a policy, and
--       still ship every row: a PERMISSIVE SELECT/ALL policy for
--       anon/public with USING (true). lint:rls counts policies and would
--       call this covered. lint:scope-authz (added today in f7ccde2a)
--       catches it. Check it by hand here too.

SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND permissive = 'PERMISSIVE'
  AND cmd IN ('SELECT', 'ALL')
  AND (roles && ARRAY['anon','public','authenticated']::name[])
  AND (qual IS NULL OR btrim(qual) = 'true')
ORDER BY tablename, policyname;


-- =====================================================================
-- 2. REMEDIATION — this is the part that writes.
-- =====================================================================
--
-- Idempotent: ENABLE ROW LEVEL SECURITY on a table that already has it is
-- a no-op. Safe to re-run. Safe to run on a table not in staging's broken
-- 27 — it simply does nothing.
--
-- FOUR SEPARATE TRANSACTIONS, ON PURPOSE. Ordered so that the highest-PII
-- exposure closes first. If you stop after any block, the worst leak is
-- already shut and the database is in a coherent state.
--
--   BLOCK 1 — the five tables the review proved are leaking (5 tables)
--   BLOCK 2 — the rest of the tables the review named as disabled (9)
--   BLOCK 3 — every remaining table that HAS policies (25)
--   BLOCK 4 — the designed deny-all set (14)
--
-- Blocks 1-3 restore existing policies; nothing goes dark except
-- case_events and organization_invitations in block 2, both of which are
-- in the repo's intentional deny-all allowlist. Block 4 is entirely
-- deny-all by design.
--
-- Section 1.C is the authority on what actually goes dark IN STAGING. If
-- 1.C listed anything with `intended = false`, do not run block 3 or 4
-- until that is explained.


-- ---------------------------------------------------------------------
-- BLOCK 1 — HIGHEST PII. Run this one first, alone, and re-probe.
--           These five are the tables the anon key returned in full,
--           including profiles.display_name carrying a real email.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;  -- 2 policies (self read / self update). Nothing goes dark.
ALTER TABLE public.pets        ENABLE ROW LEVEL SECURITY;  -- 3 policies (active-owner read/insert/update).
ALTER TABLE public.pet_events  ENABLE ROW LEVEL SECURITY;  -- 2 policies (owner read + can_read_case branch).
ALTER TABLE public.ownerships  ENABLE ROW LEVEL SECURITY;  -- 3 policies (self read/insert/update).
ALTER TABLE public.audit_log   ENABLE ROW LEVEL SECURITY;  -- 1 policy (actor or admin).

COMMIT;

-- STOP HERE. Re-run the REST probe from the runbook (§5). Those five must
-- come back empty or 401 before you continue. If they still return rows,
-- something is wrong and running more ALTERs will not fix it.


-- ---------------------------------------------------------------------
-- BLOCK 2 — the remaining tables the review named as RLS-disabled.
--           TWO OF THESE GO DARK TO PostgREST, BY DESIGN:
--             case_events, organization_invitations
--           Both are in DENY_ALL_ALLOWLIST (check-rls-coverage.ts) and are
--           reached only through Drizzle server actions.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE public.notifications             ENABLE ROW LEVEL SECURITY;  -- 2 policies (self read/update).
ALTER TABLE public.attachments               ENABLE ROW LEVEL SECURITY;  -- 3 policies (pet owner + case branch).
ALTER TABLE public.pet_identifications       ENABLE ROW LEVEL SECURITY;  -- has policies (microchip/tattoo PII).
ALTER TABLE public.pet_transfers             ENABLE ROW LEVEL SECURITY;  -- has policies (transfer offers carry recipient email).
ALTER TABLE public.libreta_share_tokens      ENABLE ROW LEVEL SECURITY;  -- 3 policies (owner read/insert/revoke).
ALTER TABLE public.govt_assignments          ENABLE ROW LEVEL SECURITY;  -- 1 policy (self or admin).
ALTER TABLE public.alert_subscriptions       ENABLE ROW LEVEL SECURITY;  -- has policies.
ALTER TABLE public.case_events               ENABLE ROW LEVEL SECURITY;  -- ZERO POLICIES — deny-all by design.
ALTER TABLE public.organization_invitations  ENABLE ROW LEVEL SECURITY;  -- ZERO POLICIES — deny-all by design.

COMMIT;


-- ---------------------------------------------------------------------
-- BLOCK 3 — every remaining public table that HAS at least one policy.
--           None of these can go dark: enabling RLS activates policies
--           that already exist. Included so the schema ends up matching
--           what db/migrations/ says it should be, whether or not staging
--           had disabled them.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE public.appointments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_localities                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_localities_import_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_runs                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_disputes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custody_dispute_parties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foster_proposals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foster_volunteers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_feed_watermarks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_contact_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_capability_grants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_coverage           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_achievement_views           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_service_dog                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_offerings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedule_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_report_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_reports                 ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ---------------------------------------------------------------------
-- BLOCK 4 — the designed deny-all set. EVERY TABLE HERE RETURNS ZERO ROWS
--           TO PostgREST ONCE ENABLED. That is the intended end state:
--           each one is reached exclusively through Drizzle / service-role.
--           Reasons are documented one-per-table in
--           scripts/check-rls-coverage.ts (DENY_ALL_ALLOWLIST) and in
--           db/migrations/0086 §PART 6 / §PART 7.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE public.alert_firings              ENABLE ROW LEVEL SECURITY;  -- admin alert triage, Drizzle only
ALTER TABLE public.eno_processing_queue       ENABLE ROW LEVEL SECURITY;  -- zoonosis work queue, cron/service-role
ALTER TABLE public.event_notification_outbox  ENABLE ROW LEVEL SECURITY;  -- outbox payload snapshots, service-role
ALTER TABLE public.notification_dead_letter   ENABLE ROW LEVEL SECURITY;  -- failed-notification payloads, service-role
ALTER TABLE public.govt_business_rules        ENABLE ROW LEVEL SECURITY;  -- authority reference data, admin writes
ALTER TABLE public.jurisdictions_census       ENABLE ROW LEVEL SECURITY;  -- public census figures, no personal data
ALTER TABLE public.panorama_cube              ENABLE ROW LEVEL SECURITY;  -- precomputed aggregate, analyticsDb only
ALTER TABLE public.panorama_cube_meta         ENABLE ROW LEVEL SECURITY;  -- cube build metadata, analyticsDb only
ALTER TABLE public.panorama_kpi_cube          ENABLE ROW LEVEL SECURITY;  -- KPI tiles, analyticsDb only
ALTER TABLE public.panorama_kpi_cube_meta     ENABLE ROW LEVEL SECURITY;  -- KPI cube metadata, analyticsDb only
ALTER TABLE public.physical_tag_interest      ENABLE ROW LEVEL SECURITY;  -- demand signal, owner server actions
ALTER TABLE public.rate_limit_buckets         ENABLE ROW LEVEL SECURITY;  -- ephemeral counters, no identity
-- share_telemetry: table DROPPED by migration 0167 (TEL-1, PO 2026-08-04).
-- The ALTER that stood here would now abort this whole transaction on any
-- database that has 0167 applied. Left as a comment, not deleted, so the
-- 2026-07-26 instrument still reads as the 53-table inventory it was.
ALTER TABLE public._dim_migrations            ENABLE ROW LEVEL SECURITY;  -- migration tracker; runner is owner, unaffected

COMMIT;


-- =====================================================================
-- 3. POST-FLIGHT — verification. Read-only.
-- =====================================================================
--
-- 3.A — The number that must be zero.

SELECT count(*) AS tables_still_unprotected
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind      = 'r'
  AND NOT relrowsecurity;
-- EXPECTED: 0


-- 3.B — Nothing was accidentally forced. Must also be zero.
--       A non-zero here means the app is about to be locked out of its
--       own database. Fix it immediately:
--         ALTER TABLE public.<name> NO FORCE ROW LEVEL SECURITY;

SELECT relname AS forced_rls_tables
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind      = 'r'
  AND relforcerowsecurity;
-- EXPECTED: no rows


-- 3.C — Nothing lost its policies on the way. Compare this list against
--       the `deny_all_by_design` VALUES block in section 1: it must be
--       the same 16 names, no more.

SELECT c.relname AS enabled_with_zero_policies
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind      = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname)
ORDER BY 1;
-- EXPECTED: exactly the 16 allowlisted tables.
-- MORE THAN 16 => a policy was dropped somewhere. Investigate before
-- inviting anyone to this environment.


-- 3.D — Re-run 1.D. There must still be no wide-open PERMISSIVE policy.
--       (Same query as 1.D — a policy that ships every row makes RLS
--       cosmetic. Enabling RLS does not remove one.)


-- The REST probe (the one that proves the leak is closed to an outsider)
-- is in the runbook, §5. SQL cannot prove it: this session connects as
-- `postgres`, which bypasses RLS. Checking from inside the database will
-- always look fine. THE PROBE FROM OUTSIDE IS THE ONLY REAL VERIFICATION.


-- =====================================================================
-- 4. ROLLBACK — re-opens the exposure. Read the warning.
-- =====================================================================
--
-- ############################################################
-- #  RUNNING SECTION 4 PUTS THE LEAK BACK.                   #
-- #                                                           #
-- #  It returns staging to a state where anyone holding the   #
-- #  anon key — a key that is PUBLISHABLE BY DESIGN and is    #
-- #  meant to be shipped to browsers — can page through       #
-- #  66.732 pets, 226.335 events, 25 profiles (7 with phone   #
-- #  numbers, 2 with dni_hash / dni_last4), 7.099 welfare     #
-- #  reports and the complete audit_log.                      #
-- #                                                           #
-- #  A read cannot be un-read. There is no rollback for the   #
-- #  rollback.                                                #
-- #                                                           #
-- #  The ONLY legitimate reason to run this is: a real page   #
-- #  went blank, you identified WHICH table, and you need     #
-- #  that ONE table open while you write its policy.          #
-- #  In that case disable THAT ONE LINE, not the file.        #
-- #  Do not paste the whole block.                            #
-- ############################################################
--
-- Before rolling anything back, ask the cheaper question first: is the
-- blank page caused by a MISSING POLICY rather than by RLS itself? If so
-- the fix is a policy, not a disable — and a policy is a migration, which
-- keeps the fix in the tree instead of in someone's SQL editor history.
--
-- Left commented out ON PURPOSE. Uncomment one line at a time.

-- BEGIN;
-- ALTER TABLE public.<the_one_table_that_broke> DISABLE ROW LEVEL SECURITY;
-- COMMIT;

--
-- Full rollback — restoring the vulnerable state in its entirety — is
-- deliberately NOT written out here. If you truly need it, section 1.A's
-- output taken BEFORE the change is the record of which tables were off,
-- and that snapshot is the only correct source. Save that output. It is
-- the only pre-change evidence that will exist.
--
--
-- =====================================================================
-- 5. AFTERWARDS — make this stick
-- =====================================================================
--
-- This file is incident response, not the fix. An ops script run by hand
-- against a remote database is exactly the class of action that caused
-- this outage: something disabled RLS outside the migration tree, and
-- because it was outside the tree, no one could find it afterwards.
--
-- The durable fix is a forward-only migration (db/migrations/NNNN_*.sql,
-- recount the next free integer at write time) carrying the same ALTER
-- statements. Then:
--   - `pnpm lint:rls`        fails while any table is unprotected
--   - `pnpm lint:scope-authz` (f7ccde2a, today) additionally fails on a
--                             wide-open PERMISSIVE policy, which
--                             lint:rls cannot see
-- Both run inside `pnpm verify`, so the regression becomes a build break
-- instead of a Supabase advisor nobody reads.
--
-- Writing that migration is agent work. Applying it to a remote database
-- is the PO's decision.
