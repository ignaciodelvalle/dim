-- DIM revocation/deactivation evidence — private, authenticated-scoped
-- --------------------------------------------------------------------
-- Apply once per environment (Supabase Studio → SQL Editor, or the DIM
-- provisioner). Idempotent. Version-controlled so prod parity is reproducible
-- (closes the "revocations bucket has no SQL coverage" deploy gap — the org /
-- user revocation evidence upload 500'd with "Bucket not found" on a fresh
-- deploy because no db/*storage.sql declared it; had to be hot-patched by hand
-- on the first staging deploy).
--
-- Bucket: revocations
--   Holds evidence files attached to admin/govt revocation + deactivation
--   actions (deactivate admin, deactivate govt, revoke locality assignment,
--   revoke org verification / vet role). PRIVATE bucket: reads are served
--   through short-lived signed URLs generated server-side.
--
--   Uploaded client-side by the acting admin/govt operator on SUBMIT
--   (lib/ui/use-evidence-upload.ts → supabase.storage.from("revocations")),
--   namespaced by the TARGET being acted on.
--
-- Path convention: {targetId}/{timestamp}-{rand}.{ext}
--   (lib/domain/revocation-evidence-path.ts — targetId is the admin/govt user
--    id or the locality assignment id.)

insert into storage.buckets (id, name, public)
values ('revocations', 'revocations', false)
on conflict (id) do nothing;

-- INSERT (upload) — authenticated may write to the revocations bucket. The
-- server action that registers the evidence (uploadRevocationEvidence) verifies
-- the caller is an institutional admin/govt before the row is trusted; the
-- bucket_id guard scopes the policy to this bucket only.
drop policy if exists "revocations_authenticated_upload" on storage.objects;
create policy "revocations_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'revocations');

-- SELECT — authenticated may read (needed to mint signed URLs for the evidence
-- viewer). Discovery is gated by the SSR/admin layer that renders the URLs, not
-- by storage RLS; the private bucket means a raw object GET without a signed URL
-- is still refused.
drop policy if exists "revocations_authenticated_read" on storage.objects;
create policy "revocations_authenticated_read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'revocations');
