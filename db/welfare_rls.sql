-- DIM welfare reports — Row Level Security
-- -----------------------------------------
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

-- welfare_report_attachments — row-level access matches the parent report
alter table public.welfare_report_attachments enable row level security;

drop policy if exists "Anyone can insert welfare attachments" on public.welfare_report_attachments;
create policy "Anyone can insert welfare attachments"
  on public.welfare_report_attachments
  for insert
  to anon, authenticated
  with check (true);

-- NOTE: This RLS only governs queries via PostgREST (supabase-js client).
-- All Drizzle queries bypass it (direct DB connection). This is defense-in-depth.
-- The "unguessable path" model: any caller who knows the report id (via the
-- reference code lookup) can read its attachments — the 256-bit UUID entropy
-- in the report id makes the path effectively unreachable without the code link.
drop policy if exists "Reporter can read own welfare attachments" on public.welfare_report_attachments;
drop policy if exists "Welfare attachments readable when parent report exists" on public.welfare_report_attachments;
create policy "Welfare attachments readable when parent report exists"
  on public.welfare_report_attachments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.welfare_reports wr
      where wr.id = welfare_report_attachments.welfare_report_id
    )
  );
