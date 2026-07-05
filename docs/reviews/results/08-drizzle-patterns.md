1. `lib/infra/notifications.ts:119` · N+1: per vaccine reminder candidate runs a throttle `SELECT` + `createNotification()` inside `for (const row of candidates)` · **HIGH** · One grouped SQL over `related_reminder_id IN (...)` (or lateral join) + bulk `createNotificationsBulk`.
2. `lib/infra/notifications.ts:434` · N+1: missed post-adoption loop does `petEvents` + `organizationMemberships` + `organizations` queries per candidate, then per-admin `createNotification()` · **HIGH** · Prefetch adoption payloads/admins/org tokens in batched queries keyed by `sourceEventId`/`orgId`.
3. `lib/infra/business-rules-reeval.ts:126` · N+1 + missing tx: per flipped pet runs `UPDATE pets` + `SELECT ownerships` + `INSERT notifications` sequentially with no transaction · **HIGH** · Batch updates/notifications or wrap each flip in `db.transaction`; prefetch owners for all flipped pet ids.
4. `lib/analytics/govt-dashboards.ts:344` · Keyset/pagination correctness: `LIMIT 500` on `pets` with no SQL `ORDER BY`, then sorts by `markedLostAt` in JS — arbitrary 500 rows, not “most recently lost” · **HIGH** · `ORDER BY` latest lost `status_changed.occurred_at DESC` (e.g. `DISTINCT ON`/subquery) before `LIMIT`.
5. `lib/analytics/govt-dashboards.ts:363` · Over-fetch: pulls every `status_changed→lost` event for up to 500 pets, dedupes “latest” in JS · **MED** · Replace with `DISTINCT ON (pet_id) ... ORDER BY pet_id, occurred_at DESC`.
6. `lib/infra/case-queries.ts:531` · Keyset pagination: comment says fetch `limit+1` for `hasMore`, but `listCasesForGovt` uses `.limit(limit)` only · **MED** · Use `.limit(limit + 1)` and slice; return `hasMore`.
7. `lib/infra/case-queries.ts:600` · Same `limit+1`/`hasMore` gap in `listCasesForAdmin` · **MED** · Same fix as #6.
8. `lib/infra/approval-scope.ts:109` · Keyset + over-fetch: `fetchVisiblePendingRequests` uses `.select()` (all columns) and `.limit(opts.limit)` without `+1` despite PERF-5 comment · **MED** · Explicit column list + `.limit(limit + 1)`.
9. `lib/infra/eno-queue-processor.ts:39` · N+1: batch processor wires `getPet`/`getOwnership` as one query per outbox row · **MED** · Batch-load pets/ownerships with `inArray(petId, …)` once per batch.
10. `lib/infra/business-rules-reeval.ts:157` · Missing transaction boundary + bypasses canonical notification path: direct `db.insert(notifications)` without `dedupeKey`/dead-letter · **MED** · Use `createNotificationsBulk` inside the same tx as the `pets` update.
11. `lib/infra/case-queries.ts:502` · Unstable sort: `listCasesForOrg` orders by `openedAt` only (no `id` tiebreak) before `limit+1` truncation · **LOW** · Add `desc(cases.id)` as secondary sort key.
12. `lib/infra/case-queries.ts:280` · Unstable sort: case-detail pet timeline `ORDER BY occurred_at DESC` only, capped at 200 · **LOW** · Add `desc(petEvents.id)` tiebreak.
13. `lib/infra/rederive-pet-cache.ts:129` · Over-fetch: `executor.select().from(pets)` loads full pet row for drift check · **LOW** · Select only columns in `CHECKED_COLUMNS` (+ keys).
14. `lib/infra/business-rules-resolver.ts:74` · Over-fetch: cascade lookup uses `.select().from(govtBusinessRules)` (up to 3 round-trips) · **LOW** · `.select({ id, rulePayload, jurisdiction* })` or single ranked query.
15. `lib/analytics/policy-outcome.ts:293` · N+1 (bounded): `fetchPolicyOutcomes` runs 2 `COUNT` queries per rule change via `changes.map(async …)` · **LOW** · Single grouped SQL / CTE over all changes.
16. `lib/infra/notification-service.ts:198` · N+1 (failure path): dead-letters failed bulk chunk with sequential `await deadLetter()` per row · **LOW** · Multi-row insert into `notification_deadLetter`.
17. `lib/infra/outreach-pipelines.ts:252` · Fetch-then-filter: `fetchStrayDensityAreas` groups in SQL then drops `locality IS NULL` rows in JS · **LOW** · Add `AND p.jurisdiction_locality IS NOT NULL` to the query.

**clean:** `db/index.ts` (pool/HMR only; no query anti-patterns)

**clean:** Raw SQL injection — user input goes through Drizzle params/`likeContains`; `sql.raw` is limited to whitelisted `date_trunc` units / numeric `windowDays` from resolved rules, not request strings.
