-- DIM storage buckets and policies
-- ---------------------------------
-- Apply by pasting into Supabase Studio → SQL Editor. Idempotent.
--
-- The pet-photos bucket holds primary photos and any attached images for pets.
-- v1 policies are deliberately loose: anyone can read (photos appear on the
-- public credential page) and any authenticated user can upload (the only
-- upload path in v1 is our own server action, which already verifies the user
-- owns the pet). Update / delete are scoped to the uploader.

-- Create the bucket if it doesn't already exist.
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do nothing;

-- Public can read every object in pet-photos.
drop policy if exists "pet_photos_public_read" on storage.objects;
create policy "pet_photos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'pet-photos');

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

-- Authenticated users can SELECT (needed to request signed URLs); discovery
-- is gated by what the SSR layer shows, not by storage RLS.
drop policy if exists "event_attachments_authenticated_read" on storage.objects;
create policy "event_attachments_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'event-attachments');

-- Any authenticated user can upload (the server action verifies pet ownership
-- before calling storage).
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
