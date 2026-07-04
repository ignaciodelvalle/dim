-- DIM export buckets — private, service-role only
-- ------------------------------------------------
-- Apply once per environment (Supabase Studio → SQL Editor, or the MCP).
-- Idempotent. Version-controlled so prod parity is reproducible (closes the
-- W2 "org-logos/export buckets have no SQL coverage" deploy-readiness gap).
--
-- These hold generated PDF exports (welfare case bundles, PPP registries,
-- cross-border travel document bundles). They are PRIVATE: reads happen only
-- through short-lived signed URLs generated server-side with the service-role
-- key (which bypasses RLS), so no anon/authenticated SELECT policy is needed.
-- No INSERT/UPDATE/DELETE policy either — all writes are service-role.
--
-- Path convention per module: {scope_id}/{export_id}.pdf
-- Retention: exports are regenerable; a TTL purge can be added per bucket later.

insert into storage.buckets (id, name, public)
values
  ('welfare-exports', 'welfare-exports', false),
  ('ppp-exports',     'ppp-exports',     false),
  ('travel-exports',  'travel-exports',  false)
on conflict (id) do nothing;
