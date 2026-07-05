**lib/** concurrency/idempotency review (write paths only):

1. `lib/infra/business-rules-reeval.ts:157` · PPP reeval uses raw `db.insert(notifications)` with no `dedupe_key` — rerun/overlap duplicates owner alerts · **HIGH** · Route through `createNotification()` with stable key e.g. `ppp-reeval:${petId}:${notificationType}`.

2. `lib/infra/owner-disease-alerts.ts:81-114` · 30-day throttle is check-then-insert with no DB dedupe — concurrent `symptom_observed` handlers can both pass count and insert · **MED** · Use `createNotification()` + `dedupeKey` `disease_alert:${petId}:${diseaseCode}:${windowStart}` (drop the COUNT gate).

3. `lib/events/event-idempotency.ts:99-103` · `clientIdempotencyKey` null → plain `insert` — retry without key duplicates `pet_events` · **MED** · Require key on retryable owner paths or derive server-side key before calling.

4. `lib/events/event-outbox-enqueue.ts:69` · Blind outbox insert; no `UNIQUE(source_event_id, target_kind)` in schema — double `enqueueOutboxForEvent` duplicates SLA rows · **MED** · Add unique index + `onConflictDoNothing()`.

5. `lib/infra/case-cron.ts:51-55` · `runCaseCron` rescans full candidate set with no row claim/advisory lock — overlapping cron invocations can double-call `processOne` · **MED** · `pg_advisory_xact_lock(hashtext(cronName))` or `FOR UPDATE SKIP LOCKED` in `scan`.

**Clean in lib (for requested domains):**
- **Ownership transfer** — no lib write paths.
- **Scan capture** — no lib insert path (`scan-retention.ts` is purge-only).
- **Movement capture** — no lib write path.
- **Lost-mode toggle** — `openCase` backed by `cases_open_per_pet_kind_idx`; `broadcastLostPet` uses `createNotificationsBulk` + `dedupeKey`.
- **`lib/infra/rate-limit.ts`** — atomic UPSERT counter.
- **`lib/infra/notification-service.ts`** — `ON CONFLICT (dedupe_key) DO NOTHING`.

**Out of lib scope (but same lens):** `src/modules/pets/application/scans/log-scan.ts:119` and `record-movement.ts:40-52` are plain `petEvents` inserts with no idempotency key.
