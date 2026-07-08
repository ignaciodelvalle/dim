-- DIM export buckets — private, authenticated-scoped
-- ---------------------------------------------------
-- Apply once per environment (Supabase Studio → SQL Editor, or the MCP).
-- Idempotent. Version-controlled so prod parity is reproducible (closes the
-- W2 "org-logos/export buckets have no SQL coverage" deploy-readiness gap).
--
-- These hold generated PDF exports (welfare case bundles, PPP registries,
-- cross-border travel document bundles). They are PRIVATE buckets: reads are
-- served through short-lived signed URLs generated server-side.
--
-- Path convention per module: {scope_id}/{export_id}.pdf
-- Retention: exports are regenerable; a TTL purge can be added per bucket later.
--
-- TODO(deploy): the durable long-term fix is service-role uploads for these
-- server-generated legal exports (the export writer runs server-side and can use
-- the service-role client, which bypasses RLS entirely — then NO storage.objects
-- INSERT/SELECT policy for `authenticated` is needed at all, tightening the
-- surface). Until the export writers are moved to the service-role client, the
-- INSERT + SELECT policies below are required so the current authenticated-client
-- upload/download path does not 500 with "permission denied" (the exact gap that
-- had to be hot-patched by hand on the first staging deploy).

insert into storage.buckets (id, name, public)
values
  ('welfare-exports', 'welfare-exports', false),
  ('ppp-exports',     'ppp-exports',     false),
  ('travel-exports',  'travel-exports',  false)
on conflict (id) do nothing;

-- INSERT (upload) — authenticated may write to each export bucket. The server
-- action that generates the export verifies the caller's authorization before
-- calling storage; the bucket_id guard scopes the policy to these buckets only.
drop policy if exists "export_buckets_authenticated_upload" on storage.objects;
create policy "export_buckets_authenticated_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id in ('welfare-exports', 'ppp-exports', 'travel-exports'));

-- SELECT — authenticated may read (needed to mint signed URLs). Discovery is
-- gated by the SSR layer that renders the URLs, not by storage RLS; the private
-- bucket means a raw object GET without a signed URL is still refused.
drop policy if exists "export_buckets_authenticated_read" on storage.objects;
create policy "export_buckets_authenticated_read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id in ('welfare-exports', 'ppp-exports', 'travel-exports'));
