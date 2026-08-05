-- Staging repair — 2026-08-05
--
-- WHAT: recreate the two SELECT policies on ar_localities /
-- ar_localities_import_runs that migration 0019 created and 0137 rewrote,
-- but which do NOT exist on staging (verified 2026-08-05: rls_enabled=true,
-- 0 policies, 4077 rows — deny-all for API clients, invisible to the app
-- because server reads bypass RLS).
--
-- WHY IT DRIFTED: staging's ledger marks 0019/0137 applied, but their policy
-- effects are absent — same ledger-dishonesty class as the 0165 incident
-- (drizzle-kit push / --baseline marking SQL as applied without running it).
--
-- WHY THIS FILE: migration 0168 does `ALTER POLICY ... TO authenticated` by
-- name and fails on staging because the policies are missing. Migrations are
-- immutable (sha256 ledger), so the precondition is repaired OUT of band —
-- precedent: scripts/ops/staging-rls-remediation.sql.
--
-- SHAPE: exact current canonical form (0137's initplan subselect predicates).
-- Roles are left at the default; 0168 narrows them to `authenticated`
-- immediately after this runs. Idempotent (drop if exists + create).
--
-- RUN (Ignacio-gated):
--   node --env-file=.env.staging.local --import tsx scripts/ops/apply-ops-sql.ts \
--     scripts/ops/staging-ar-localities-policies-2026-08-05.sql

begin;

drop policy if exists "ar_localities select authenticated" on public.ar_localities;
create policy "ar_localities select authenticated"
  on public.ar_localities for select
  using ((select auth.uid()) is not null);

drop policy if exists "ar_localities_import_runs select admin" on public.ar_localities_import_runs;
create policy "ar_localities_import_runs select admin"
  on public.ar_localities_import_runs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.account_type = 'institutional'
        and p.deactivated_at is null
    )
  );

commit;
