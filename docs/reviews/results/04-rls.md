1. `db/migrations/0086_track_rls_in_migrations.sql:427-429` · `welfare_reports` INSERT is `WITH CHECK (true)` for `anon,authenticated` with no bind on `reporter_user_id` — anon/auth can set `reporter_user_id` to a victim UUID and pollute `/denuncias/mias` · **HIGH** · `WITH CHECK (reporter_user_id IS NOT DISTINCT FROM auth.uid())` plus freeze workflow columns (`status='open'`, null triage/assignment/case FKs).

2. `db/migrations/0086_track_rls_in_migrations.sql:427-429` · same policy lets callers set `reporter_organization_id`, `assigned_to_user_id`, `case_id`, `triaged_by_user_id`, `status`, etc. on INSERT — PostgREST workflow escalation · **HIGH** · extend `WITH CHECK` to force defaults only (`status='open'`, workflow/admin FKs IS NULL).

3. `db/rls.sql:85-90` · `pets` INSERT `WITH CHECK (true)` for any `authenticated` user — two-step PostgREST insert (pet then ownership) is racy; a second account can grab the orphan `pet_id` before the creator inserts ownership · **HIGH** · drop the PostgREST INSERT policy; create pets only via Drizzle/server action in one transaction.

4. `db/migrations/0086_track_rls_in_migrations.sql:116-119` · `ownerships` INSERT only checks `owner_user_id = auth.uid()` — any signed-in user can attach `role IN ('foster','shelter_custody','caretaker','co_owner')` to any known `pet_id`, including pets with an active legal owner · **HIGH** · deny PostgREST INSERT entirely, or `WITH CHECK (role = 'owner' AND NOT EXISTS (active owner row for pet_id))`.

5. `db/migrations/0086_track_rls_in_migrations.sql:149-160` · `pet_events` INSERT is open to active owners via PostgREST — bypasses `validateEventPayload`, append-only triggers/GUCs, `author_verified`, SENASA columns, and server-side authz · **HIGH** · remove the INSERT policy; keep append-only writes on the Drizzle/BYPASSRLS path only.

6. `db/schema.ts:1095` · comment says `event_type` is “validated in app code” while RLS still permits direct PostgREST inserts — defense-in-depth gap matches finding #5 · **MED** · align schema comment with deny-all PostgREST writes once INSERT policy is dropped.

7. `db/rls.sql:169-186` · reference file still ships pre-0115 `pet_events` SELECT (no `is_hidden_from_subject_case` guard) — manual Studio paste re-exposes welfare-bridge events to subject owners · **HIGH** · sync from `db/migrations/0115_pet_events_hide_welfare_from_subject.sql`.

8. `db/welfare_rls.sql:12-17` · reference still documents unconditional `welfare_reports` INSERT — same reporter/workflow spoof as #1 if pasted over tracked migrations · **MED** · sync `WITH CHECK` hardening from a new migration into this reference file.

9. `db/migrations/0124_notifications_dedupe_key_and_dead_letter.sql:72-89` · creates `notification_dead_letter` (jsonb PII payloads) with no RLS until 0125 — one-migration exposure window on partial applies · **LOW** · fold `ENABLE ROW LEVEL SECURITY` into 0124 or merge 0124+0125 for atomic deploy.

10. `__tests__/rls/matrix.test.ts:45` · `OPERATIONS_UNDER_TEST = ["select"]` — INSERT/UPDATE/DELETE matrix cells are documentation-only; write regressions (#3–#5) would not fail CI · **MED** · extend harness to probe write paths (at least `pets`, `ownerships`, `pet_events`, `welfare_reports`).

11. `__tests__/rls/function-hardening.test.ts:42` · `NO_ANON_EXECUTE` omits `can_read_case` / `is_hidden_from_subject_case` — 0123 fix has no CI tripwire if EXECUTE grants regress · **MED** · add both functions to `NO_ANON_EXECUTE` like `export_subject_data`.

**clean** — PII/tenant table catalog + `relrowsecurity` gate (`__tests__/rls/coverage.test.ts` + migrations 0086/0094/0108/0111/0113/0125); deny-all write posture on outbox/dead-letter/advisor tables; `welfare_report_attachments` after `0099` (no longer `WITH CHECK (true)`); unconditional-write allowlist only matches live `welfare_reports.INSERT` + `pets.INSERT` (`write-path-matrix.test.ts`); `0123` anon `/rpc` oracle revoke; `time_slots` `USING (true)` is SELECT-only on non-PII scheduling data.
