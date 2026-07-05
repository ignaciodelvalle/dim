1. `lib/infra/case-cron.ts:116` · `withCronRun` always finalizes `cron_runs.status='ok'` when `fn()` returns — ignores partial-failure counters in `summarize.details` · **HIGH** · Add `deriveStatus(result)` (or fail when `errorCount`/`failed`/`errors`/`stillFailing` > 0) before the UPDATE.

2. `app/api/cron/close-rabies-observations/route.ts:42` · HTTP 200 + `cron_runs` ok when `closeEligibleObservations` returns `stats.errors.length>0` (legal 10-day auto-close can fail silently) · **HIGH** · After `withCronRun`, if `stats.errors.length>0` return 500 and patch run to `failed`.

3. `app/api/cron/process-eno-queue/route.ts:44` · HTTP 200 + `cron_runs` ok when `result.failed>0` (ENO fanout rows marked failed in queue) · **HIGH** · Return 500 and set `cron_runs.status='failed'` when `failed>0`.

4. `app/api/cron/auto-expire-approvals/route.ts:155` · Sets `cron_runs.status='failed'` on per-row errors but always HTTP 200 (Vercel treats as success) · **HIGH** · `NextResponse.json(..., { status: status === 'ok' ? 200 : 500 })`.

5. `app/api/cron/escalate-stale-welfare-cases/route.ts:28` · `runCaseCron` writes `failed` to DB but route always HTTP 200 (same pattern in `escalate-stale-disputes`, `close-stale-lost-episodes`, `close-followup-expired-adoptions`, `expire-cross-org-transfers`, `expire-decomiso-handoffs`) · **HIGH** · `{ status: result.status === 'ok' ? 200 : 500 }` on all six routes.

6. `app/api/cron/cron-health/route.ts:228` · Returns `ok:true` + records own `cron_runs` as ok when `unhealthy.length>0` — only `console.warn`, zero paging · **HIGH** · Return HTTP 500, set meta-run `failed`, and POST `CRON_ALERT_WEBHOOK` (or admin notification) with `unhealthy[]`.

7. `vercel.json:49` · `drain-outbox` scheduled `0 6 * * *` (daily) while route comment claims every 5 min — ENO/outbox SLA backlog at scale · **HIGH** · Change schedule to `*/5 * * * *` (or hourly) and loop batches until budget exhausted.

8. `vercel.json:53` · `process-eno-queue` once/day + `BATCH_SIZE=50` (`src/modules/surveillance/application/process-eno-queue-batch.ts:62`) — >50 pending ENO rows/day = growing legal-notification backlog · **HIGH** · Hourly schedule + cursor/resume loop until `MAX_DURATION_MS` or queue empty.

9. `src/modules/service-offerings/application/slot-materialization/materialize-slots.ts:43` · Loads **all** active schedule rules and bulk-inserts 60-day windows in one invocation — unbounded · **HIGH** · Keyset on `service_schedule_rules.id` with `MAX_RULES_PER_RUN` + time budget (mirror `reconcile-pet-status`).

10. `lib/infra/business-rules-reeval.ts:83` · `reEvaluatePppClassificationChange` SELECTs all in-scope dogs with no row cap — AR country scope (always index 0) can scan huge sets inside one scope call · **HIGH** · Keyset paginate pets inside scope; persist `nextPetId` in `cron_runs.details`.

11. `lib/infra/notifications.ts:91` · `runVaccineDueScan` unbounded global reminder SELECT + per-row history SQL (N+1) · **HIGH** · Keyset batch reminders (`LIMIT` + cursor) with wall-clock budget per run.

12. `src/modules/transfers/infrastructure/transfers-repository.ts:298` · `expirablePetTransfers` no LIMIT — loads all expired pending transfers · **HIGH** · `.limit(BATCH_SIZE)` + daily re-run until empty or budget hit.

13. `src/modules/cases/application/escalate-stale-welfare-cases.ts:44` · `findStaleWelfareCases` unbounded nationwide case scan · **HIGH** · Add `.limit(N)` + keyset on `cases.id` (same for `findStaleDisputes`, `findStaleLostEpisodes`, `findFollowupExpiredAdoptions`, `findExpirableCrossOrgCases`, `findStaleDecomisoCandidates`).

14. `src/modules/surveillance/infrastructure/surveillance-repository.ts:203` · `findPetsInProgress` capped at 500/run but per-pet multi-query loop — >500 active observations delays legal auto-close · **MED** · Lower batch + hourly schedule, or cursor resume across runs.

15. `app/api/cron/expire-pet-transfers/route.ts:30` · Drops `errors` from action return; `withCronRun` ok when `expirePetTransfers` had per-row failures · **MED** · Summarize `errors`; fail HTTP/DB when `errors>0`.

16. `app/api/cron/expire-foster-proposals/route.ts:36` · HTTP 200 + `cron_runs` ok when `stats.errors>0` · **MED** · Fail when `errors>0`.

17. `app/api/cron/drain-notification-dead-letter/route.ts:173` · `stillFailing>0`/`invalid>0` leaves `cronStatus='ok'` and HTTP 200 · **MED** · Set `cronStatus='failed'` when `stillFailing+invalid>0`.

18. `app/api/cron/purge-scan-events/route.ts:72` · `status='failed'` in DB but response omits `{ status: 500 }` · **MED** · Add `{ status: status === 'ok' ? 200 : 500 }`.

19. `app/api/cron/data-lifecycle/route.ts:77` · Same HTTP-200-on-failure pattern · **MED** · Add `{ status: status === 'ok' ? 200 : 500 }`.

20. `app/api/cron/reconcile-pet-status/route.ts:247` · Fatal `cronStatus='failed'` still HTTP 200; per-pet `errors[]` never flip `cronStatus` · **MED** · HTTP 500 on fatal; set `failed` when `errors.length>0`.

21. `app/api/cron/auto-expire-approvals/route.ts:67` · Unbounded SELECT of all stale `approval_requests` then serial tx loop · **MED** · `.limit(BATCH_SIZE)` + keyset on `createdAt,id`.

22. `src/modules/foster/infrastructure/foster-repository.ts:534` · `expirePendingProposals` unbounded pending-proposal scan · **MED** · `.limit(BATCH_SIZE)` on candidates.

23. `lib/infra/scan-retention.ts:90` · Single daily pass deletes max 500 scan rows — large backlogs exceed 90-day TTL · **MED** · Loop batches until 0 rows or `MAX_DURATION_MS`.

24. `lib/infra/data-lifecycle.ts:119` · One 500-row batch per purge target per day — expired-notification/cron_runs backlogs linger · **MED** · `while` loop each purge until cap or time budget.

25. `lib/infra/rate-limit.ts:147` · `cleanupExpiredBuckets` unbounded DELETE (no batch) · **MED** · Batched DELETE with `LIMIT 500` subquery.

26. `src/modules/alerts/application/firings/record-firings.ts:63` · Evaluates every admin subscription owner sequentially with full KPI fetch — unbounded at admin count · **MED** · Batch owners + cache metric rollups per jurisdiction window.

27. `app/api/cron/expire-decomiso-handoffs/route.ts:4` · Comment “every 12h” but `vercel.json:61` schedules `0 0 * * *` (daily) for time-sensitive decomiso handoffs · **MED** · Schedule `0 */12 * * *` or increase scan frequency.

28. `lib/infra/cron-registry.ts:48` · `drain_notification_dead_letter` hourly (`15 * * * *`) but `maxStalenessMs` = 26h — one missed hour invisible to staleness for a day · **LOW** · Use `maxStalenessMs: 2 * 60 * 60 * 1000` (2h) for hourly crons.

---

**Clean (bounded and/or failure semantics OK today):** `business-rules-reeval` (scope cursor + time budget), `reconcile-pet-status` (keyset + budget; HTTP/drift signaling gaps only), `drain-outbox` (batch 50 + SKIP LOCKED; schedule is the problem), `drain-notification-dead-letter` (batch 200; partial-failure signaling gap only), `vaccine-due`/`post-adoption-checkin`/`evaluate-alerts` (only throw-path 500; scale/partial-failure gaps above), `data-lifecycle`/`purge-scan-events` (batched purges; HTTP/loop gaps above).
