1. `db/triggers.sql:173-181` · `pet_events_no_update`/`pet_events_no_delete` triggers are never `CREATE TRIGGER`'d in the migration chain (0104 only replaces the function body) · **HIGH** · Add a migration (mirror `0121_case_events_append_only.sql`) that creates both triggers so `drizzle migrate` alone enforces append-only.

2. `db/migrations/0033_cases.sql:185-200` · With (1) missing, only `pet_events_case_id_immutable` runs — `payload`/`occurred_at`/`notes` UPDATE and all DELETE succeed · **HIGH** · Same fix as (1); do not treat 0033 as row-level append-only.

3. `scripts/db-bootstrap.ts:385-397` · Append-only enforcement for `pet_events` depends on orthogonal step 3 after migrations; migrate-only/prod paths that skip it leave (2) · **HIGH** · Ship triggers in migrations and gate deploy on trigger-existence check.

4. `db/schema.ts:1098-1099` + `db/triggers.sql:101-170` · `recorded_by_user_id`/`author_organization_id` `ON DELETE SET NULL` fires UPDATE with no FK-nullification exception (unlike `audit_log` in `0085`) · **MED** · Add cascade-nullification path to `enforce_pet_events_append_only` or block profile/org hard-delete without override.

5. `db/triggers.sql:124-135` · `pet_events_mutation_override` audit logs only ids/types/timestamps — not `payload`, `notes`, or column diffs · **MED** · Include `old`/`new` snapshots (at least `payload`, `occurred_at`) in the audit `payload`.

6. `db/migrations/0085_audit_log_target_user_set_null.sql:46-48` · `app.allow_audit_mutation='true'` permits UPDATE/DELETE with zero audit row · **MED** · Emit an audit row on every audit_log bypass mutation (mirror pet_events override).

7. `db/triggers.sql:150-153` · `scan_event_purged` rows use `actor_user_id=null` · **LOW** · Attribute purges to a fixed system-cron profile uuid.

8. `lib/events/event-idempotency.ts:92-104` · `insertEventIdempotent` inserts without `validatedEventValues` · **MED** · Validate inside `insertEventIdempotent` before every INSERT.

9. `src/modules/surveillance/infrastructure/surveillance-repository.ts:262-282` · `insertIncidentEvent`/`insertObservation*` write `pet_events` without repository-level schema validation · **MED** · Route through `validatedEventValues` or `EventsRepository.insertEvent`.

10. `src/modules/surveillance/infrastructure/surveillance-repository.ts:307-316` · `autoExpireBiteCase` mutates `cases.status` with no matching `case_events`/`pet_events` fact · **MED** · Emit terminal case event in the same transaction as the status UPDATE.

11. `db/schema.ts:1926-2136` · `AUDIT_LOG_ACTIONS` omits trigger-written actions (`pet_events_mutation_override`, `case_events_mutation_override`, `scan_event_purged`) · **LOW** · Add them to the catalog const.

12. **Production UPDATE/DELETE on `pet_events` outside GUC paths:** clean — only `lib/infra/scan-retention.ts:77-94` (scoped `app.allow_scan_purge` in-tx).

13. **Production `app.allow_event_mutation` / `app.allow_audit_mutation` setters:** clean — GUCs appear only in tests/scripts (`__tests__/_helpers/db-overrides.ts`, `scripts/seed-*.ts`).

14. **GUC transaction scoping (`set local` / `set_config(..., true)` inside `db.transaction`):** clean in `lib/infra/scan-retention.ts:76-77` and `__tests__/_helpers/db-overrides.ts:77-79`.

15. **Corrections-as-new-events (no in-place target edit in app code):** clean — `src/modules/events/application/amendment/amend-event.ts:113-127` inserts `event_amended`; production has zero `update(petEvents)` (grep limited to `__tests__`).

16. **Post-insert `occurred_at`/`payload` mutation without accountable override:** clean when triggers are present — blocked by `enforce_pet_events_append_only`; legally mutable only via GUC path (5) or missing triggers (1–3).
