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
