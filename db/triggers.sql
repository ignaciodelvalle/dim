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

  insert into public.notifications (user_id, notification_type, title, body, severity)
  values (
    new.id,
    'welcome',
    '¡Bienvenido a DIM, ' || resolved_display_name || '!',
    'La libreta digital de tu mascota empieza acá. Empezá agregando tu primera mascota — vamos a generar su credencial digital y armar el historial juntos.',
    'info'::public.notification_severity
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
-- Escape hatch: set the session-local flag `app.allow_event_mutation = 'true'`
-- in the same transaction as the mutation. Used only by deliberate,
-- audit-logged corrections (none today). Default is to raise.

create or replace function public.enforce_pet_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_event_mutation', true) = 'true' then
    return coalesce(new, old);
  end if;
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
