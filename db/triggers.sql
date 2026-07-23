-- DIM database triggers
-- ----------------------
-- These statements aren't managed by Drizzle (Drizzle handles tables, columns,
-- indexes, and enums; triggers live here). Apply them ONCE per environment by
-- pasting the contents below into Supabase Studio → SQL Editor and clicking
-- Run. Idempotent — safe to re-run.

-- Auto-create a public.profiles row whenever auth.users gains a new entry,
-- and ALSO seed a welcome notification so the user has something in their
-- notifications inbox on first login.
--
-- Reads:
--   - display_name (optional) from raw_user_meta_data → falls back to the
--                             local-part of email. user_metadata is fine for
--                             a display name (non-privileged).
--
-- ROLE (SECURITY, CRITICAL-1): the role is NOT derived from any request
-- metadata. Every trigger-created profile is an 'owner'. Privileged roles
-- (vet/govt/admin) are granted EXCLUSIVELY by an explicit service-role UPDATE
-- after the auth user exists.
--   0133 first closed the self-mint hole by reading the role from
--   raw_app_meta_data instead of the client-writable raw_user_meta_data. But
--   that read is a DEAD path: GoTrue's admin.createUser({ app_metadata }) does
--   INSERT-then-UPDATE — the trigger fires on an INSERT whose raw_app_meta_data
--   holds only {provider, providers}; the caller's custom app_metadata is merged
--   in a SEPARATE UPDATE that lands AFTER the trigger. So app_metadata.user_role
--   was always NULL at trigger time and every account resolved to 'owner'
--   anyway. 0134 makes that behaviour explicit and unconditional: NO request
--   input (user_metadata OR app_metadata) can set a privileged role at signup.
--   See migration 0134.
--
-- CATEGORY + BRAND CASING (migration 0157): the welcome notification carries
-- category = 'admin' (the "Sistema" tab on /notificaciones) and the canonical
-- "miMAR" brand casing. Kept in sync with db/migrations/0157_welcome_
-- notification_category_and_casing.sql.
--
-- TODO(25b): when Mi Argentina OIDC lands, wire additional metadata keys:
--   - miarg_sub     → profiles.miarg_sub
--   - dni_hash      → profiles.dni_hash  (pre-hashed by the OIDC callback)
--   - dni_last4     → profiles.dni_last4
--   - dni_verified  → profiles.dni_verified
--   - identity_source → profiles.identity_source = 'miarg'
-- The callback route (app/auth/miarg/callback/route.ts) will call
-- upsertProfileFromMiArgClaims() which handles this directly — no trigger
-- change required for the normal OIDC path. The trigger-path is for the
-- rare case where Supabase Auth creates the row before the callback fires.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_display_name text;
begin
  resolved_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  -- Role is NEVER derived from request metadata. Every trigger-created profile
  -- is an 'owner'. Privileged roles (vet/govt/admin) are granted only by an
  -- explicit service-role UPDATE after the user exists — see migration 0134.
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'owner'::public.user_role,
    resolved_display_name
  );

  insert into public.notifications (user_id, notification_type, category, title, body, severity, cta_label, cta_url)
  values (
    new.id,
    'welcome',
    'admin',
    '¡Te damos la bienvenida a miMAR, ' || resolved_display_name || '!',
    'La libreta digital de tu mascota empieza acá. Empezá agregando tu primera mascota — vamos a generar su credencial digital y armar el historial juntos.',
    'info'::public.notification_severity,
    'Registrá tu primera mascota',
    '/mis-mascotas/nueva'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforce append-only on pet_events at the database layer.
--
-- db/rls.sql already denies UPDATE/DELETE for `authenticated` and `anon`
-- via the absence of corresponding policies. But Drizzle uses a direct
-- Postgres connection that BYPASSES RLS by design (that's how server
-- actions write owner events at all). This trigger extends the append-only
-- rule to service_role and direct Drizzle connections — closing the gap
-- named in AGENTS.md → Event sourcing → Known gaps.
--
-- Escape hatch 1 (general): set BOTH session-local flags in the same transaction:
--   set local app.allow_event_mutation = 'true';
--   set local app.allow_event_mutation_actor = '<actor-uuid>';
-- When this hatch is active the trigger writes an `audit_log` row
-- (action='pet_events_mutation_override') with the operation, the affected
-- pet_event_id, pet_id, event_type and occurred_at, attributed to the actor
-- uuid. If the actor GUC is missing the mutation is refused — the escape
-- hatch is unusable without accountability.
--
-- Escape hatch 2 (narrow — Wave 5 Item 28, scan retention):
--   set local app.allow_scan_purge = 'true';
-- Permits DELETE of credential_scanned events with author_role='scanner' that
-- are older than 90 days (SCAN_RETENTION_DAYS). Writes an audit_log row per
-- deleted row (action='scan_event_purged'). UPDATE is still blocked under
-- this hatch. Any event that does not satisfy all three predicates (event_type,
-- author_role, age) is refused. See migration 0104 for context.

create or replace function public.enforce_pet_events_append_only()
returns trigger
language plpgsql
-- search_path pinned (advisor function_search_path_mutable, migration 0114).
-- Bootstrap re-runs this file in step 3 AFTER migrations, so the SET clause
-- must live here too or the fresh-bootstrap function loses 0114's hardening.
-- All object refs below are schema-qualified (public.audit_log), so '' is safe.
set search_path = ''
as $$
declare
  override_actor uuid;
  retention_days int := 90;
begin
  -- -------------------------------------------------------------------------
  -- Path 1: general mutation escape hatch (pre-existing; unchanged).
  -- -------------------------------------------------------------------------
  if current_setting('app.allow_event_mutation', true) = 'true' then
    override_actor := nullif(current_setting('app.allow_event_mutation_actor', true), '')::uuid;
    if override_actor is null then
      raise exception 'pet_events mutation override requires app.allow_event_mutation_actor (uuid) to be set in the same session'
        using errcode = 'restrict_violation';
    end if;

    insert into public.audit_log (actor_user_id, action, payload)
    values (
      override_actor,
      'pet_events_mutation_override',
      jsonb_build_object(
        'operation',    tg_op,
        'pet_event_id', coalesce(new.id,          old.id),
        'pet_id',       coalesce(new.pet_id,      old.pet_id),
        'event_type',   coalesce(new.event_type,  old.event_type),
        'occurred_at',  coalesce(new.occurred_at, old.occurred_at)
      )
    );

    return coalesce(new, old);
  end if;

  -- -------------------------------------------------------------------------
  -- Path 2: narrow scan-purge exception (Wave 5 Item 28).
  -- DELETE only; scanner events only; older than retention window only.
  -- -------------------------------------------------------------------------
  if tg_op = 'DELETE'
     and current_setting('app.allow_scan_purge', true) = 'true'
     and old.author_role::text = 'scanner'
     and old.event_type = 'credential_scanned'
     and old.occurred_at < (now() - (retention_days || ' days')::interval)
  then
    insert into public.audit_log (actor_user_id, action, payload)
    values (
      null,
      'scan_event_purged',
      jsonb_build_object(
        'pet_event_id', old.id,
        'pet_id',       old.pet_id,
        'occurred_at',  old.occurred_at,
        'retention_days', retention_days
      )
    );

    return old;
  end if;

  -- -------------------------------------------------------------------------
  -- Default: block all other mutations.
  -- -------------------------------------------------------------------------
  raise exception 'pet_events is append-only (AGENTS.md). % blocked.', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists pet_events_no_update on public.pet_events;
create trigger pet_events_no_update
  before update on public.pet_events
  for each row execute function public.enforce_pet_events_append_only();

drop trigger if exists pet_events_no_delete on public.pet_events;
create trigger pet_events_no_delete
  before delete on public.pet_events
  for each row execute function public.enforce_pet_events_append_only();

-- Enforce append-only case_events (migration 0121 — event-sourcing integrity
-- review 2026-07-04 item 3). Mirrors enforce_pet_events_append_only and
-- REUSES the same override GUCs (app.allow_event_mutation +
-- app.allow_event_mutation_actor) so one accountable override session covers
-- both append-only event tables. Every override writes an audit_log row
-- (action='case_events_mutation_override'). No scan-purge path — case_events
-- has no retention-purged entry kind.

create or replace function public.enforce_case_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  override_actor uuid;
begin
  if current_setting('app.allow_event_mutation', true) = 'true' then
    override_actor := nullif(current_setting('app.allow_event_mutation_actor', true), '')::uuid;
    if override_actor is null then
      raise exception 'case_events mutation override requires app.allow_event_mutation_actor (uuid) to be set in the same session'
        using errcode = 'restrict_violation';
    end if;

    insert into public.audit_log (actor_user_id, action, payload)
    values (
      override_actor,
      'case_events_mutation_override',
      jsonb_build_object(
        'operation',     tg_op,
        'case_event_id', coalesce(new.id,          old.id),
        'case_id',       coalesce(new.case_id,     old.case_id),
        'entry_type',    coalesce(new.entry_type,  old.entry_type),
        'occurred_at',   coalesce(new.occurred_at, old.occurred_at)
      )
    );

    return coalesce(new, old);
  end if;

  raise exception 'case_events is append-only (AGENTS.md). % blocked.', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists case_events_no_update on public.case_events;
create trigger case_events_no_update
  before update on public.case_events
  for each row execute function public.enforce_case_events_append_only();

drop trigger if exists case_events_no_delete on public.case_events;
create trigger case_events_no_delete
  before delete on public.case_events
  for each row execute function public.enforce_case_events_append_only();
