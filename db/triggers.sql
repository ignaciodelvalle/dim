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
-- Reads from auth.users.raw_user_meta_data:
--   - display_name (optional)  → falls back to local-part of email
--   - user_role    (optional)  → falls back to 'owner' (the default for
--                                self-serve signups; vet/govt accounts are
--                                created via admin-driven flows that set this
--                                metadata explicitly).

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

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'user_role', '')::public.user_role,
      'owner'::public.user_role
    ),
    resolved_display_name
  );

  insert into public.notifications (user_id, notification_type, title, body, severity, cta_label, cta_url)
  values (
    new.id,
    'welcome',
    '¡Bienvenido a DIM, ' || resolved_display_name || '!',
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
