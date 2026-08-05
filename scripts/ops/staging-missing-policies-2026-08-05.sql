-- Staging repair #2 — 2026-08-05
--
-- WHAT: recreate the 25 policies across the 11 tables that db:doctor found on
-- staging with RLS enabled and ZERO policies (alert_subscriptions,
-- approval_requests, audit_log, govt_assignments, libreta_share_tokens,
-- notifications, ownerships, pet_transfers, pets, profiles, reminders) —
-- including ownerships' SELECT policy whose absence failed the 0163 probe.
--
-- WHY IT DRIFTED: same class as ar_localities (see the sibling instrument
-- staging-ar-localities-policies-2026-08-05.sql and migration 0165's header):
-- staging's ledger marks the creating migrations applied, but their SQL never
-- ran there. The 31/07 remediation ENABLED RLS everywhere without recreating
-- the missing policies, leaving these tables deny-all for API clients —
-- fail-safe, but not the designed state.
--
-- SOURCE OF TRUTH: generated mechanically from the LOCAL database's
-- pg_policies on 2026-08-05, where ledger and real state agree (db:doctor
-- clean). Predicates, roles and command scopes are byte-exact from local.
-- Idempotent (drop if exists + create).
--
-- RUN (Ignacio-gated), then re-run the doctor:
--   node --env-file=.env.staging.local --import tsx scripts/ops/apply-ops-sql.ts \
--     scripts/ops/staging-missing-policies-2026-08-05.sql
--   node --env-file=.env.staging.local --import tsx scripts/check-ledger-honesty.ts --allow-remote

begin;

drop policy if exists "alert_subscriptions delete by owner" on public.alert_subscriptions;
create policy "alert_subscriptions delete by owner"
  on public.alert_subscriptions for delete
  to authenticated
  using ((actor_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "alert_subscriptions insert by owner" on public.alert_subscriptions;
create policy "alert_subscriptions insert by owner"
  on public.alert_subscriptions for insert
  to authenticated
  with check ((actor_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "alert_subscriptions read by owner or admin" on public.alert_subscriptions;
create policy "alert_subscriptions read by owner or admin"
  on public.alert_subscriptions for select
  to authenticated
  using (((actor_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role) AND (p.deactivated_at IS NULL))))));

drop policy if exists "alert_subscriptions update by owner" on public.alert_subscriptions;
create policy "alert_subscriptions update by owner"
  on public.alert_subscriptions for update
  to authenticated
  using ((actor_user_id = ( SELECT auth.uid() AS uid)))
  with check ((actor_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "approval requests visible to applicant or authority" on public.approval_requests;
create policy "approval requests visible to applicant or authority"
  on public.approval_requests for select
  to authenticated
  using (((applicant_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))) OR (EXISTS ( SELECT 1
   FROM govt_assignments g
  WHERE ((g.user_id = ( SELECT auth.uid() AS uid)) AND (g.revoked_at IS NULL) AND (g.jurisdiction_province = approval_requests.jurisdiction_province) AND (g.jurisdiction_locality = approval_requests.jurisdiction_locality))))));

drop policy if exists "audit log visible to actor or admin" on public.audit_log;
create policy "audit log visible to actor or admin"
  on public.audit_log for select
  to authenticated
  using (((actor_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role))))));

drop policy if exists "govt sees own assignments" on public.govt_assignments;
create policy "govt sees own assignments"
  on public.govt_assignments for select
  to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role))))));

drop policy if exists "owner can insert libreta shares for their pets" on public.libreta_share_tokens;
create policy "owner can insert libreta shares for their pets"
  on public.libreta_share_tokens for insert
  to authenticated
  with check (((created_by_user_id = ( SELECT auth.uid() AS uid)) AND (pet_id IN ( SELECT ownerships.pet_id
   FROM ownerships
  WHERE ((ownerships.owner_user_id = ( SELECT auth.uid() AS uid)) AND (ownerships.ended_at IS NULL))))));

drop policy if exists "owner can read own libreta shares" on public.libreta_share_tokens;
create policy "owner can read own libreta shares"
  on public.libreta_share_tokens for select
  to authenticated
  using (((created_by_user_id = ( SELECT auth.uid() AS uid)) OR (pet_id IN ( SELECT ownerships.pet_id
   FROM ownerships
  WHERE ((ownerships.owner_user_id = ( SELECT auth.uid() AS uid)) AND (ownerships.ended_at IS NULL))))));

drop policy if exists "owner can update (revoke) own libreta shares" on public.libreta_share_tokens;
create policy "owner can update (revoke) own libreta shares"
  on public.libreta_share_tokens for update
  to authenticated
  using ((created_by_user_id = ( SELECT auth.uid() AS uid)))
  with check ((created_by_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Notifications readable by self" on public.notifications;
create policy "Notifications readable by self"
  on public.notifications for select
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Notifications updatable by self" on public.notifications;
create policy "Notifications updatable by self"
  on public.notifications for update
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Ownerships readable by self" on public.ownerships;
create policy "Ownerships readable by self"
  on public.ownerships for select
  to authenticated
  using ((owner_user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "pet_transfers read by admin" on public.pet_transfers;
create policy "pet_transfers read by admin"
  on public.pet_transfers for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role) AND (p.deactivated_at IS NULL)))));

drop policy if exists "pet_transfers read by receiver" on public.pet_transfers;
create policy "pet_transfers read by receiver"
  on public.pet_transfers for select
  to authenticated
  using ((to_owner_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "pet_transfers read by sender" on public.pet_transfers;
create policy "pet_transfers read by sender"
  on public.pet_transfers for select
  to authenticated
  using ((from_owner_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Pets insertable by any authenticated user" on public.pets;
create policy "Pets insertable by any authenticated user"
  on public.pets for insert
  to authenticated
  with check (true);

drop policy if exists "Pets readable by active owner" on public.pets;
create policy "Pets readable by active owner"
  on public.pets for select
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM ownerships o
  WHERE ((o.pet_id = pets.id) AND (o.owner_user_id = ( SELECT auth.uid() AS uid)) AND (o.ended_at IS NULL)))));

drop policy if exists "Pets updatable by active owner" on public.pets;
create policy "Pets updatable by active owner"
  on public.pets for update
  to authenticated
  using ((EXISTS ( SELECT 1
   FROM ownerships o
  WHERE ((o.pet_id = pets.id) AND (o.owner_user_id = ( SELECT auth.uid() AS uid)) AND (o.ended_at IS NULL)))))
  with check ((EXISTS ( SELECT 1
   FROM ownerships o
  WHERE ((o.pet_id = pets.id) AND (o.owner_user_id = ( SELECT auth.uid() AS uid)) AND (o.ended_at IS NULL)))));

drop policy if exists "Profiles readable by self" on public.profiles;
create policy "Profiles readable by self"
  on public.profiles for select
  to authenticated
  using ((id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Profiles updatable by self" on public.profiles;
create policy "Profiles updatable by self"
  on public.profiles for update
  to authenticated
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Reminders deletable by self" on public.reminders;
create policy "Reminders deletable by self"
  on public.reminders for delete
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Reminders insertable by self" on public.reminders;
create policy "Reminders insertable by self"
  on public.reminders for insert
  to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Reminders readable by self" on public.reminders;
create policy "Reminders readable by self"
  on public.reminders for select
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

drop policy if exists "Reminders updatable by self" on public.reminders;
create policy "Reminders updatable by self"
  on public.reminders for update
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

commit;
