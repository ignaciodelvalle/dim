-- DIM welfare reports — Row Level Security
-- -----------------------------------------
-- NOTE (V0-4): REFERENCE ONLY. Source of truth is
-- db/migrations/0086_track_rls_in_migrations.sql. No longer applied by bootstrap.
-- Animal-cruelty / welfare denuncia system. Legal frame: Ley Nacional 14.346 (1954).
-- Apply once per environment by pasting into Supabase Studio → SQL Editor.
-- Idempotent — safe to re-run.

alter table public.welfare_reports enable row level security;

-- Anyone (including anon) can submit a denuncia.
drop policy if exists "Anyone can insert welfare report" on public.welfare_reports;
create policy "Anyone can insert welfare report"
  on public.welfare_reports
  for insert
  to anon, authenticated
  with check (true);

-- Reporter can read their own submissions when logged in.
-- Anonymous reports (reporter_user_id is null) are NOT readable by any user
-- through PostgREST — only via service role (admin / govt portal later).
drop policy if exists "Reporter can read own welfare reports" on public.welfare_reports;
create policy "Reporter can read own welfare reports"
  on public.welfare_reports
  for select
  to authenticated
  using (reporter_user_id = auth.uid());

-- No update / delete for now. Future govt portal will handle workflow
-- transitions via service role with audit logging.

-- welfare_report_attachments — scoped to reporter identity of the parent report
-- (migration 0099_welfare_attachments_rls_scope.sql)
alter table public.welfare_report_attachments enable row level security;

-- INSERT: reporters attach to their own report; admins for back-office tooling.
-- Anon PostgREST INSERT is intentionally absent — the app inserts rows via
-- Drizzle (BYPASSRLS), so this policy is defense-in-depth only.
drop policy if exists "Anyone can insert welfare attachments" on public.welfare_report_attachments;
drop policy if exists "Reporter can insert own welfare attachments" on public.welfare_report_attachments;
create policy "Reporter can insert own welfare attachments"
  on public.welfare_report_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.welfare_reports wr
      where wr.id = welfare_report_attachments.welfare_report_id
        and wr.reporter_user_id = auth.uid()
    )
  );

drop policy if exists "Admin can insert welfare attachments" on public.welfare_report_attachments;
create policy "Admin can insert welfare attachments"
  on public.welfare_report_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

-- SELECT: reporter sees own attachments; admin sees all.
drop policy if exists "Reporter can read own welfare attachments" on public.welfare_report_attachments;
drop policy if exists "Welfare attachments readable when parent report exists" on public.welfare_report_attachments;
drop policy if exists "Admin can read any welfare attachments" on public.welfare_report_attachments;
create policy "Reporter can read own welfare attachments"
  on public.welfare_report_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.welfare_reports wr
      where wr.id = welfare_report_attachments.welfare_report_id
        and wr.reporter_user_id = auth.uid()
    )
  );

create policy "Admin can read any welfare attachments"
  on public.welfare_report_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
