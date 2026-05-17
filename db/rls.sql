-- DIM owner-facing tables — Row Level Security
-- ---------------------------------------------
-- Enforces per-user isolation on the seven core tables an authenticated owner
-- touches: profiles, pets, ownerships, pet_events, reminders, attachments,
-- notifications.
--
-- See AGENTS.md → Privacy tiers + AGENTS.md:421 ("The data layer enforces tier
-- visibility, not just the app code"). This file closes the v1 gap where these
-- tables had RLS disabled.
--
-- Apply once per environment by pasting into Supabase Studio → SQL Editor.
-- Idempotent — safe to re-run.
--
-- NOTE: This RLS only governs queries via PostgREST (the supabase-js client).
-- Drizzle uses a direct Postgres connection that bypasses RLS by design. All
-- server actions read/write via Drizzle and are unaffected. Public credential
-- page at /p/[publicToken] also goes through Drizzle, so Tier 0 / Tier 1 reveals
-- continue to work even though pets / profiles are locked to authenticated
-- owners at the PostgREST layer.
--
-- AGENTS.md:39, 231, 465 are absolute: pet_events are append-only — never edit
-- or delete. We enforce that here by writing INSERT/SELECT policies only and
-- providing no UPDATE/DELETE policy, which results in PostgREST denying both
-- for `authenticated` and `anon` roles. The `service_role` bypasses RLS by
-- Supabase design; we never use service_role for event mutations.

-- ============================================================================
-- profiles
-- ============================================================================
alter table public.profiles enable row level security;

-- Each user can only read their own profile row.
-- (Tier-1 lost-pet reveals of owner display_name + phone happen via Drizzle in
-- the server-rendered /p/[publicToken] page and bypass this policy.)
drop policy if exists "Profiles readable by self" on public.profiles;
create policy "Profiles readable by self"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- UPDATE for self (display_name, phone, avatar). No public form yet, but the
-- policy is needed so future settings UI can update via supabase-js.
drop policy if exists "Profiles updatable by self" on public.profiles;
create policy "Profiles updatable by self"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy: rows are created by the handle_new_user trigger
-- (security definer, runs as postgres, bypasses RLS). See db/triggers.sql.
-- No DELETE policy: profiles are never owner-deleted.

-- ============================================================================
-- pets
-- ============================================================================
alter table public.pets enable row level security;

-- Readable when the caller has an active ownership row on this pet.
drop policy if exists "Pets readable by active owner" on public.pets;
create policy "Pets readable by active owner"
  on public.pets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ownerships o
      where o.pet_id = pets.id
        and o.owner_user_id = auth.uid()
        and o.ended_at is null
    )
  );

-- Any authenticated user can INSERT a pet. The accompanying createPetAction
-- (app/actions/pets.ts) atomically inserts an ownerships row in the same
-- transaction; the ownership policy enforces that the user can only create
-- ownerships for themselves.
drop policy if exists "Pets insertable by any authenticated user" on public.pets;
create policy "Pets insertable by any authenticated user"
  on public.pets
  for insert
  to authenticated
  with check (true);

-- UPDATE gated by the same ownership check as SELECT.
-- USING and with_check are intentionally symmetric — pets.id is the PK and never
-- mutates, so OLD-row and NEW-row evaluation key off the same stable identifier.
-- No privilege-escalation surface from the symmetry.
drop policy if exists "Pets updatable by active owner" on public.pets;
create policy "Pets updatable by active owner"
  on public.pets
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.ownerships o
      where o.pet_id = pets.id
        and o.owner_user_id = auth.uid()
        and o.ended_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.ownerships o
      where o.pet_id = pets.id
        and o.owner_user_id = auth.uid()
        and o.ended_at is null
    )
  );

-- No DELETE policy: pets are never deleted; "lost" / "deceased" status changes
-- cover the lifecycle. See AGENTS.md → Pet status.

-- ============================================================================
-- ownerships
-- ============================================================================
alter table public.ownerships enable row level security;

-- A user can see their own ownership rows (current and historical).
-- Org-held rows (owner_user_id NULL, owner_organization_id set) are invisible
-- to user-side queries — correct for v1 since no org portal exists yet.
drop policy if exists "Ownerships readable by self" on public.ownerships;
create policy "Ownerships readable by self"
  on public.ownerships
  for select
  to authenticated
  using (owner_user_id = auth.uid());

-- A user can only create ownership rows for themselves. Org-side inserts
-- (refugio portal) will get their own policy in a later pass.
drop policy if exists "Ownerships insertable by self" on public.ownerships;
create policy "Ownerships insertable by self"
  on public.ownerships
  for insert
  to authenticated
  with check (owner_user_id = auth.uid());

-- UPDATE for marking ended_at on transfers. Owner can only update their own rows.
drop policy if exists "Ownerships updatable by self" on public.ownerships;
create policy "Ownerships updatable by self"
  on public.ownerships
  for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- No DELETE policy: ownership history is preserved by setting ended_at, not by
-- deleting rows.

-- ============================================================================
-- pet_events — APPEND-ONLY (AGENTS.md:39, 231, 465)
-- ============================================================================
alter table public.pet_events enable row level security;

-- Readable when the caller has an active ownership on the event's pet.
drop policy if exists "Pet events readable by active owner" on public.pet_events;
create policy "Pet events readable by active owner"
  on public.pet_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ownerships o
      where o.pet_id = pet_events.pet_id
        and o.owner_user_id = auth.uid()
        and o.ended_at is null
    )
  );

-- INSERT only by the active owner, AND only when author_organization_id is NULL
-- (owner-self writes). Org-attributed writes (author_organization_id IS NOT NULL)
-- are the activated form of the stub previously sketched in
-- db/organizations_rls.sql; that branch lands when the refugio portal does and
-- adds a parallel policy checking active organization_memberships with
-- can_write_pet_events = true.
--
-- INVARIANT: the `author_organization_id is null` predicate assumes the column
-- default is NULL (it is, per db/schema.ts). If anyone ever sets a non-null
-- default on that column, owner-facing PostgREST INSERTs will silently start
-- failing here — change this policy alongside any such schema change.
drop policy if exists "Pet events insertable by active owner (owner-self only)" on public.pet_events;
create policy "Pet events insertable by active owner (owner-self only)"
  on public.pet_events
  for insert
  to authenticated
  with check (
    author_organization_id is null
    and exists (
      select 1
      from public.ownerships o
      where o.pet_id = pet_events.pet_id
        and o.owner_user_id = auth.uid()
        and o.ended_at is null
    )
  );

-- No UPDATE policy. No DELETE policy. Append-only.
-- credential_scanned events are inserted server-side in the public page handler
-- via Drizzle (bypasses RLS) — no anon INSERT policy needed.

-- ============================================================================
-- reminders
-- ============================================================================
alter table public.reminders enable row level security;

-- Reminders are per-user (the user_id column is the owner, not derived from pet).
drop policy if exists "Reminders readable by self" on public.reminders;
create policy "Reminders readable by self"
  on public.reminders
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Reminders insertable by self" on public.reminders;
create policy "Reminders insertable by self"
  on public.reminders
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Reminders updatable by self" on public.reminders;
create policy "Reminders updatable by self"
  on public.reminders
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE is allowed: users can manually delete custom reminders they created.
drop policy if exists "Reminders deletable by self" on public.reminders;
create policy "Reminders deletable by self"
  on public.reminders
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- attachments
-- ============================================================================
alter table public.attachments enable row level security;

-- Readable when the attachment's pet has an active ownership for the caller.
-- attachments.pet_id can be NULL when the attachment is tied only to an event;
-- in that case resolve the pet via the event's pet_id.
--
-- Three-valued-logic note: when event_id is also NULL, the subquery returns
-- zero rows and `o.pet_id = (empty subquery)` evaluates to NULL (falsy). The
-- OR collapses cleanly to the first branch. Do NOT "simplify" this by removing
-- the COALESCE-free form unless you have re-verified the NULL semantics.
drop policy if exists "Attachments readable by pet owner" on public.attachments;
create policy "Attachments readable by pet owner"
  on public.attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ownerships o
      where o.owner_user_id = auth.uid()
        and o.ended_at is null
        and (
          o.pet_id = attachments.pet_id
          or o.pet_id = (
            select pe.pet_id from public.pet_events pe where pe.id = attachments.event_id
          )
        )
    )
  );

drop policy if exists "Attachments insertable by pet owner" on public.attachments;
create policy "Attachments insertable by pet owner"
  on public.attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.ownerships o
      where o.owner_user_id = auth.uid()
        and o.ended_at is null
        and (
          o.pet_id = attachments.pet_id
          or o.pet_id = (
            select pe.pet_id from public.pet_events pe where pe.id = attachments.event_id
          )
        )
    )
  );

-- UPDATE rarely needed (caption edits). Same predicate.
drop policy if exists "Attachments updatable by pet owner" on public.attachments;
create policy "Attachments updatable by pet owner"
  on public.attachments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.ownerships o
      where o.owner_user_id = auth.uid()
        and o.ended_at is null
        and (
          o.pet_id = attachments.pet_id
          or o.pet_id = (
            select pe.pet_id from public.pet_events pe where pe.id = attachments.event_id
          )
        )
    )
  );

-- No DELETE policy. Attachments tied to events live as long as the event does
-- (append-only). Photo replacement is via a new attachment + pets.primary_photo_id update.

-- ============================================================================
-- notifications
-- ============================================================================
alter table public.notifications enable row level security;

-- Per-user. read_at / archived_at toggles need UPDATE.
drop policy if exists "Notifications readable by self" on public.notifications;
create policy "Notifications readable by self"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Notifications updatable by self" on public.notifications;
create policy "Notifications updatable by self"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT policy. Sources are: handle_new_user trigger (security definer),
-- server actions via Drizzle, future cron jobs via service_role.
-- No DELETE policy. Notifications are archived (archived_at set), never deleted.

-- ============================================================================
-- libreta_share_tokens — owner reads and writes their own shares
-- ============================================================================
-- D7 from the plan: the public Tier-2 route resolves share tokens via Drizzle
-- (bypasses RLS by design). These policies govern PostgREST access only
-- (defense-in-depth for owner self-service via supabase-js).
-- No DELETE policy: revocation is soft (revoked_at flag), never hard delete.
alter table public.libreta_share_tokens enable row level security;

drop policy if exists "owner can read own libreta shares" on public.libreta_share_tokens;
create policy "owner can read own libreta shares"
  on public.libreta_share_tokens
  for select
  to authenticated
  using (
    created_by_user_id = auth.uid()
    or pet_id in (
      select pet_id from public.ownerships
      where owner_user_id = auth.uid() and ended_at is null
    )
  );

drop policy if exists "owner can insert libreta shares for their pets" on public.libreta_share_tokens;
create policy "owner can insert libreta shares for their pets"
  on public.libreta_share_tokens
  for insert
  to authenticated
  with check (
    created_by_user_id = auth.uid()
    and pet_id in (
      select pet_id from public.ownerships
      where owner_user_id = auth.uid() and ended_at is null
    )
  );

drop policy if exists "owner can update (revoke) own libreta shares" on public.libreta_share_tokens;
create policy "owner can update (revoke) own libreta shares"
  on public.libreta_share_tokens
  for update
  to authenticated
  using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());
