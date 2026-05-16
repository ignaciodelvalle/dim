-- DIM welfare reports — storage bucket + RLS
-- --------------------------------------------
-- Apply once per environment via Supabase Studio → SQL Editor. Idempotent.
--
-- Bucket: welfare-evidence
--   - INSERT (upload) allowed for anon AND authenticated. A witness who
--     happens to film an abuse incident must be able to submit it without
--     creating an account.
--   - SELECT uses the "unguessable path" model: the path embeds 256 bits of
--     UUID entropy ({welfare_report_id}/{attachment_id}.{ext}), so SELECT is
--     gated by existence of the parent report row, not by reporter identity.
--     This allows the by-code lookup flow (/denuncias/codigo/[code]) to
--     generate signed URLs for anon-uploaded evidence without service-role
--     plumbing. The path is effectively unreachable without the report-id link.
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
drop policy if exists "Welfare evidence readable when parent report exists" on storage.objects;
create policy "Welfare evidence readable when parent report exists"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'welfare-evidence'
    and exists (
      select 1 from public.welfare_reports wr
      where split_part(storage.objects.name, '/', 1) = wr.id::text
    )
  );
