-- Cases RLS — Fase A (minimal). Full per-kind policies land in Fase F.
--
-- Fase A intent: enable RLS on the table + two basic SELECT policies
-- (subject_owner of the primary pet, and admin) + the `can_read_case`
-- function shell that returns admin-only (true definition lands in Fase F
-- with the scope-bound rules per kind).
--
-- Drizzle (server-side) bypasses RLS via the service role. The policies
-- guard PostgREST and any future RLS-aware reader.
--
-- Idempotent — safe to re-run.

-- ===========================================================================
-- Enable RLS on cases
-- ===========================================================================

alter table public.cases enable row level security;

-- ===========================================================================
-- Policies (drop + create idempotent)
-- ===========================================================================

drop policy if exists cases_select_subject_owner on public.cases;
create policy cases_select_subject_owner on public.cases for select
  using (
    primary_pet_id is not null and exists (
      select 1
      from public.ownerships o
      where o.pet_id = public.cases.primary_pet_id
        and o.ended_at is null
        and o.role = 'owner'
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists cases_select_admin on public.cases;
create policy cases_select_admin on public.cases for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ===========================================================================
-- can_read_case(case_id, user_id) — shell. Full per-kind expansion in Fase F.
-- ===========================================================================
--
-- This function is referenced by future RLS policies (pet_events,
-- welfare_reports, attachments) so callers can compose with case
-- visibility. In Fase A it returns admin-only as a safe default — once
-- per-kind rules land in Fase F, this is the single hook that flips on.

create or replace function public.can_read_case(p_case_id uuid, p_user_id uuid)
  returns boolean
  language plpgsql
  stable
  security definer
as $$
begin
  if p_case_id is null or p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin'
  );
end;
$$;

-- No INSERT / UPDATE / DELETE policies at this stage — every writer goes
-- through Drizzle on the server which bypasses RLS via service role.
