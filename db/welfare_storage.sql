-- DIM welfare reports — storage bucket + RLS
-- --------------------------------------------
-- Apply once per environment via Supabase Studio → SQL Editor. Idempotent.
--
-- Bucket: welfare-evidence
--   - INSERT (upload) allowed for anon AND authenticated. A witness who
--     happens to film an abuse incident must be able to submit it without
--     creating an account.
--   - SELECT restricted: a logged-in user can only read evidence on their
--     own welfare_reports rows (matched via the storage path prefix
--     {welfare_report_id}/...). Anonymous evidence is unreadable through
--     PostgREST until the future govt portal queries via service role.
--   - UPDATE / DELETE: none (admin only via service role).
--
-- Path convention: {welfare_report_id}/{attachment_id}.{ext}

insert into storage.buckets (id, name, public)
values ('welfare-evidence', 'welfare-evidence', false)
on conflict (id) do nothing;

drop policy if exists "Anyone can upload welfare evidence" on storage.objects;
create policy "Anyone can upload welfare evidence"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'welfare-evidence');

drop policy if exists "Reporter can read own welfare evidence" on storage.objects;
create policy "Reporter can read own welfare evidence"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'welfare-evidence'
    and exists (
      select 1
      from public.welfare_reports wr
      where wr.reporter_user_id = auth.uid()
        and split_part(storage.objects.name, '/', 1) = wr.id::text
    )
  );
