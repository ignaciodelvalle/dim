-- DIM storage buckets and policies
-- ---------------------------------
-- Apply by pasting into Supabase Studio → SQL Editor. Idempotent.
--
-- The pet-photos bucket holds primary photos and any attached images for pets.
-- The bucket is PUBLIC, so a known object is served by the public object
-- endpoint (/storage/v1/object/public/pet-photos/<path>, what petPhotoUrl()
-- builds) WITHOUT consulting RLS. Uploads go through our own server action,
-- which verifies the user owns the pet. Update / delete are scoped to the
-- uploader.

-- Create the bucket if it doesn't already exist.
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do nothing;

-- NO public SELECT policy on pet-photos (deploy-readiness residual, 2026-07-04;
-- tracked in migration 0123). Because the bucket is public, GET of a known
-- object never consults RLS, so a `to public` SELECT policy would add nothing
-- to the read path — its ONLY effect is to let anon ENUMERATE the bucket via
-- the storage list API (POST /storage/v1/object/list/pet-photos), leaking every
-- pet's photo object path. Dropping it lets anon GET a known object but NOT
-- LIST the bucket. Kept as an explicit drop so an existing DB is tightened on
-- the next bootstrap replay.
drop policy if exists "pet_photos_public_read" on storage.objects;

-- Any authenticated user can upload to pet-photos.
drop policy if exists "pet_photos_authenticated_upload" on storage.objects;
create policy "pet_photos_authenticated_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'pet-photos');

-- Only the uploader can update their object.
drop policy if exists "pet_photos_uploader_update" on storage.objects;
create policy "pet_photos_uploader_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'pet-photos' and auth.uid() = owner);

-- Only the uploader can delete their object.
drop policy if exists "pet_photos_uploader_delete" on storage.objects;
create policy "pet_photos_uploader_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'pet-photos' and auth.uid() = owner);

-- ---------------------------------------------------------------------------
-- event-attachments bucket
-- ---------------------------------------------------------------------------
-- Holds optional images attached to pet events (vaccine cards, vet receipts,
-- weight-scale photos, free-form note photos). Private bucket: discovery is
-- gated by the SSR layer (only the pet's owner reaches the page that renders
-- the URLs) and the URLs themselves are short-lived signed URLs generated
-- server-side. Tier-3 data per AGENTS.md — owner only.

insert into storage.buckets (id, name, public)
values ('event-attachments', 'event-attachments', false)
on conflict (id) do nothing;

-- NO SELECT POLICY — AND NONE MAY BE ADDED (migration 0172).
-- This bucket used to carry `event_attachments_authenticated_read`:
--   for select to authenticated using (bucket_id = 'event-attachments')
-- The predicate is the bucket name and nothing else, so it was TRUE for every
-- object. POST /storage/v1/object/list/event-attachments is filtered by that
-- policy — not, as the old comment claimed, "by what the SSR layer shows" — so
-- any signed-up account could enumerate and download every pet's vaccine cards,
-- vet receipts and note photos in the country. Tier-3 owner-only data.
-- (The 2026-07-04 scope review logged this as LOW on the "discovery gated by
-- app" reasoning; that reasoning was wrong for the same reason it was wrong for
-- welfare-evidence in 0164 and the export buckets in 0172.)
-- Reads now sign as service role via lib/infra/storage.ts, whose callers have
-- already run requirePetAccess. Signed URLs are redeemed by token, not by RLS.

-- Any authenticated user can upload (the server action verifies pet ownership
-- before calling storage). INSERT is kept as the caller's own grant: an
-- insert-only policy cannot enumerate, and ~30 upload sites legitimately run as
-- the signed-in user.
drop policy if exists "event_attachments_authenticated_upload" on storage.objects;
create policy "event_attachments_authenticated_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-attachments');

-- Only the uploader can update or delete their object.
drop policy if exists "event_attachments_uploader_update" on storage.objects;
create policy "event_attachments_uploader_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-attachments' and auth.uid() = owner);

drop policy if exists "event_attachments_uploader_delete" on storage.objects;
create policy "event_attachments_uploader_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-attachments' and auth.uid() = owner);
