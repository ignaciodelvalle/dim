-- DIM database triggers
-- ----------------------
-- These statements aren't managed by Drizzle (Drizzle handles tables, columns,
-- indexes, and enums; triggers live here). Apply them ONCE per environment by
-- pasting the contents below into Supabase Studio → SQL Editor and clicking
-- Run. Idempotent — safe to re-run.

-- Auto-create a public.profiles row whenever auth.users gains a new entry.
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
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'user_role', '')::public.user_role,
      'owner'::public.user_role
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
