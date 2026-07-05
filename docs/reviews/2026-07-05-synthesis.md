# Stack/Architecture reviews — consolidated synthesis (2026-07-05)

20 Cursor reviews → `docs/reviews/results/*`. Raw tally: ~92 HIGH, ~200 MED, ~40 LOW. **But that number is inflated:** ~37 findings across 12 reviews cite `src/modules/**` paths that **do not exist** in this repo (Cursor hallucinated a modular architecture — the app is `app/ lib/ db/ components/`). Those are discounted (the underlying issue sometimes exists under a real path — folded into the clusters below when it does). Much of the rest is **already handled this session** (RLS deny-all + write-matrix, authz impersonation closed, jurisdiction PII scoped, provenance gate, notification dedupe/dead-letter core, k-anon, DNI-hash). Privacy/PII (review 05) came back **fully clean**.

Net: a focused set of **CONFIRMED, real-path** findings, deduped and ranked below. Each spot-checked against the actual code.

## CONFIRMED clusters (ranked by severity × blast-radius)

### C1 — Event-sourcing append-only not guaranteed by migrations (CRITICAL)
- `01#1-3`: the `pet_events` append-only triggers (`pet_events_no_update/no_delete` / `enforce_pet_events_append_only`) are **not `CREATE TRIGGER`'d in any migration** — only in `scripts/db-bootstrap.ts` step 3. VERIFIED: `rg "CREATE TRIGGER … pet_events"` in `db/migrations/*` = **empty**. A migrate-only/prod path that skips bootstrap ships **without append-only enforcement on pet_events** (case_events IS covered — migration 0121). 
- `09#1`: `db/schema.ts:1042` `pet_events.pet_id ON DELETE CASCADE` — VERIFIED. If the trigger is absent, deleting a pet **silently wipes its event spine**; if present, the trigger blocks the cascade (so pet-delete fails). Same root.
- **Fix:** a migration mirroring `0121` that creates the pet_events (and audit) append-only triggers; gate deploy on a trigger-existence check; consider `ON DELETE RESTRICT` on the event FKs. **Verdict: CONFIRMED HIGH.**

### C2 — Notification / cron resilience (converges across 15 + 17 + 18)
- Dead-letter table (`0124`) has **no drainer cron** — `18#1` / `15#4` (VERIFIED: I deferred this fast-follow; `notification_dead_letter` never drained). 
- ARCH-P silent-swallow on post-tx notify flush — real files: `lib/infra/lost-pet-broadcast.ts:198` (outer catch returns empty, no dead-letter), `lib/infra/business-rules-reeval.ts:157` (raw `db.insert(notifications)`, no dedupe_key, notify-throw skips forever). (The `src/modules/events/actions.ts` variants are hallucinated paths but the pattern is real in `lib/infra`.)
- Crons report success on failure: `app/api/cron/drain-outbox/route.ts:143` returns `{ok:true}` HTTP 200 even when `cronStatus="failed"`; `lib/infra/case-cron.ts` leaves `status:"ok"` with errors; `app/api/cron/auto-expire-approvals` direct-inserts notifications.
- 69 legacy `db.insert(notifications)` sites still bypass `createNotification()` (known baseline, `scripts/notifications-service-baseline.json`).
- **Fix:** add the drain cron; route reeval/cron inserts through `createNotification()`; make crons return `{ok:false}`/HTTP 500 + `status:"failed"` on error; burn down the 69 baseline. **Verdict: CONFIRMED HIGH.**

### C3 — Metrics: rabies coverage window inconsistency (the "42%-vs-54%" class, still live)
- `16#1-3,5`: `lib/metrics/program-health.ts:326` rabies EXISTS has **no 12-month window** (all-time) though it claims to match `rabies_coverage_dogs_12m`; `territorial-index.ts:95` inherits it; the panorama locality `rabies-coverage` predicate is all-time `ILIKE '%rabi%'` all-species (not dogs/12m); `population-control.ts:457` net-growth doesn't apply `petsScopeClause` to the joined pets. I fixed the KPI *labels* this session but **not all the underlying queries** — they still diverge.
- **Fix:** one shared rabies predicate (dog, 12m, anchored regex) reused by every fetcher; add the missing scope clause. **Verdict: CONFIRMED HIGH.**

### C4 — Welfare terminal-status inconsistency
- `13#2-3`: `lib/analytics/govt-home-kpis.ts:701` `WELFARE_TERMINAL_STATUSES` omits `'invalid'` (while `govt-dashboards.ts:1177` includes it) → spam/invalid denuncias count as **active** in the `open_welfare_reports` KPI; `owner-dashboard.ts:441` uses `ne(status,'closed')` only → `invalid/duplicate/in_progress` all surface as "open denuncia". (`13#1,4` cite hallucinated `src/modules/welfare` + `custody-disputes` — the underlying spam-confirm-doesn't-close-case may be real under `lib/case-closers`; NEEDS-INVESTIGATION.)
- **Fix:** one shared `TERMINAL_STATUSES`/`isTerminalStatus()` constant used by every welfare count. **Verdict: CONFIRMED HIGH (the KPI double-count).**

### C5 — Migration hygiene / schema.ts drift
- `10#1`: `db/schema.ts:2226` `govt_business_rules_rule_type_valid` CHECK is missing `'travel_corridor_requirements'` (0120 widened the DB enum, schema.ts CHECK not updated) → drizzle-kit push could reject/diverge. `10#2`: 0119 index (`pet_events_type_client_key_idx`) not declared in schema.ts. `10#3-5`: `0103` `DROP CONSTRAINT` without `IF EXISTS`; `0056` `CREATE TYPE/TABLE` without existence guards; a backfill INSERT without `NOT EXISTS` → **non-idempotent, break on partial-apply retry**.
- **Fix:** add `IF EXISTS`/`NOT EXISTS`/`DO $$…duplicate_object` guards to those migrations' logic (via NEW migrations — the old ones are immutable) + sync schema.ts CHECK/index. **Verdict: CONFIRMED MED (low-effort, real).**

### C6 — Schema FK cascades on event/audit tables (defense-in-depth)
- `09#2-3,5`: `custody_disputes.raising_event_id`, `event_notification_outbox.source_event_id` `ON DELETE CASCADE`; `notifications.related_case_id` a bare UUID with no FK. Mostly latent (the append-only trigger + no-hard-delete practice mask them today).
- **Fix:** `ON DELETE RESTRICT` on the event FKs; add the missing FK with `ON DELETE SET NULL`. **Verdict: CONFIRMED MED.**

### C7 — Jurisdiction canonicalization gaps + field-mutability (#40)
- Real-path: `lib/domain/location-normalize.ts:87` `normalizeLocationForWrite` never reads `localityIndecId` (all writers pass null → catalog id unused); `app/actions/business-rules.ts:82` `normalizeJurisdiction` is trim-only, `govt_business_rules.jurisdiction_locality` never validated vs `ar_localities`; `components/LocalityPickerAcross.tsx:163` L1 picker emits raw typed text. (The `src/modules/pets/**` items are hallucinated paths but overlap the real #40 gap — jurisdiction/locality editable via the profile-edit path instead of an event-governed move.)
- **Fix:** prefer `resolveCanonicalJurisdictionById` when an indec id is present; validate `govt_business_rules` locality on write; **#40 full-lock is PO-gated** (a policy decision, already flagged). **Verdict: CONFIRMED HIGH (canonicalization) + PO-GATED (#40).**

### C8 — Testing gaps
- `20#1`: `verify` does **not** run `pnpm test` (VERIFIED — the exact gap we hit repeatedly this session). `20#3-4`: the OLD `__tests__/rls/matrix.test.ts` only probes `select` (the new `write-path-matrix.test.ts` I added this session covers writes — partial dup); its `setupError` path does `expect(true)` (no-op pass on bad seed). `20#11`: crisis e2e stops at CTA counts, no finder-form submit.
- **Fix:** a `verify:full` (or CI step) that runs `pnpm test`; fail the RLS matrix on setup error; a finder-submit e2e. **Verdict: CONFIRMED — verify≠test is real (mitigation: a pre-push/CI full-test gate, not necessarily inline in the fast `verify` loop).**

## Already-handled / clean / discounted
Privacy-PII (05) clean · authz impersonation closed (26) · RLS deny-all + write-matrix added (this session) · notification dedupe/dead-letter core built (41) · k-anon + DNI-hash intact · jurisdiction PII scoped on pets.jurisdiction (27) · provenance gate (12 confirms it holds) · case_events append-only (0121). The ~37 `src/modules/**` findings are hallucinated paths (verify the real-path equivalent before acting).

## NEEDS-INVESTIGATION (not yet verdicted)
- `19-i18n` 12 HIGH — enum/UUID/blank leaks to UI; a mix of real + false-positive, not spot-checked yet. 
- `02-projections` 6 HIGH, `07-server-actions` 7 HIGH, `08-drizzle` 4 HIGH — real-path portions need a pass.
- `13#1` welfare-spam-doesn't-close-case (real under `lib/case-closers`?).

## RE-RUN AT END-OF-DAY? (criterion: churn / touched-by-remediation)
Re-run to validate fixes + catch regressions:
- **YES** — 01-event-sourcing, 15-notifications, 17-concurrency, 18-error-handling (if we do C1+C2), 16-metrics (C3), 13-case-welfare (C4), 10-migrations (C5), 09-postgres-indexing (C6), 14-jurisdiction (C7). Plus **19-i18n + 06-nextjs + 02-projections** (pet-profile-adjacent — the profile churned 5× today).
- **NO** (static unless modified) — 11-event-catalog, 05-privacy (clean), 03-authz (hardened), 04-rls (write-matrix added), 12-compliance (holds), 20-testing (re-run only if we change the test harness), 07/08 (broad — re-run only the files we touch).

## Proposed remediation order (pending PO go-ahead)
1. **C1** (append-only migration) — critical, before any prod migrate. 2. **C2** (notification/cron resilience) — production reliability (the capstone's NOT-READY dimension). 3. **C3** (rabies window) — data-correctness the govt sees. 4. **C4** (welfare terminal-status). 5. **C5** (migration idempotency guards — before applying 0108-0126 to prod). 6. **C8** (CI full-test gate). 7. **C6/C7 canonicalization** + investigate 19/02/07/08. #40 + the src/modules re-checks are separate.
