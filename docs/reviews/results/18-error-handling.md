1. `lib/infra/cron-registry.ts:79` · `notification_dead_letter` has no drain cron in fleet registry (migration 0124 comment unimplemented) · **HIGH** · add `/api/cron/drain-notification-dead-letter` + registry/`vercel.json` entry replaying `resolved_at IS NULL` via `createNotification()`.
2. `lib/infra/notification-service.ts:223` · insert + dead-letter both fail → only `console.error`; notification permanently lost · **MED** · write `audit_log`/metric/alert on this branch.
3. `lib/infra/lost-pet-broadcast.ts:198` · outer `catch` logs and returns `{ broadcastedToMemberIds: [], orgCount: 0 }` — pre-insert failures never dead-lettered · **HIGH** · dead-letter built payloads or return `{ error, deadLetteredCount }` to caller/metrics.
4. `lib/infra/lost-pet-broadcast.ts:192` · `createNotificationsBulk` result (`deadLetteredCount`) discarded · **MED** · propagate counts; metric/warn when `deadLetteredCount > 0`.
5. `lib/infra/notifications.ts:199` · `runVaccineDueScan` ignores `createNotification` `dead_lettered` status; cron reports only inserts · **MED** · track `deadLetteredCount`; fail/warn cron when nonzero.
6. `lib/infra/notifications.ts:386` · `runPostAdoptionCheckinScan` same blind spot on proactive inserts · **MED** · same dead-letter accounting.
7. `src/modules/events/actions.ts:1018` · ARCH-P `flushNotifications` — `catch` only `console.error`, no dead-letter (same pattern in 8 other modules) · **HIGH** · route each pending row through `createNotification()` with `dedupeKey`.
8. `src/modules/events/application/writers.ts:58` · duplicate ARCH-P flush in shared writer path · **HIGH** · same `createNotification()` migration.
9. `src/modules/events/application/lifecycle/set-pet-lost-use-case.ts:390` · lost broadcast failure swallowed (`console.error` only) after primary tx succeeded · **HIGH** · call `broadcastLostPet` via `createNotificationsBulk` or dead-letter on failure.
10. `lib/infra/case-cron.ts:56` · per-candidate `catch` appends to `details.errors` but leaves `status: "ok"` and never logs · **HIGH** · set `status: "failed"` when `errors.length > 0` and `console.warn` per failure.
11. `app/api/cron/drain-outbox/route.ts:143` · fatal `catch` sets `cronStatus="failed"` but response always `{ ok: true }` HTTP 200 · **HIGH** · return `{ ok: cronStatus === "ok" }` and HTTP 500 when failed.
12. `app/api/cron/expire-cross-org-transfers/route.ts:25` · always HTTP 200 even when `runCaseCron` has `errors[]` · **MED** · return 500 when `result.errors.length > 0` or `result.status === "failed"`.
13. `app/api/cron/escalate-stale-welfare-cases/route.ts:28` · same — batch partial failures invisible to Vercel retry · **MED** · same 500 contract as #12.
14. `app/api/cron/auto-expire-approvals/route.ts:104` · cron uses direct `db.insert(notifications)` — no `dedupeKey`/dead-letter · **HIGH** · `createNotification({ dedupeKey: 'approval-expired:'+r.id, ... })`.
15. `app/api/cron/auto-expire-approvals/route.ts:134` · returns HTTP 200 when `status: "failed"` · **MED** · return HTTP 500 when `status !== "ok"`.
16. `app/api/cron/data-lifecycle/route.ts:77` · purge failure sets `status: "failed"` but still HTTP 200 · **MED** · return HTTP 500 when `status === "failed"`.
17. `app/api/cron/purge-scan-events/route.ts:72` · same HTTP 200 on failed purge · **MED** · return HTTP 500 when `status === "failed"`.
18. `app/api/cron/reconcile-pet-status/route.ts:180` · per-pet rederive errors stored in `details` only — `cronStatus` stays `"ok"`, no per-row log · **MED** · `console.warn` per error; set `cronStatus="failed"` when `errors.length > 0`.
19. `app/api/cron/cron-health/route.ts:228` · reports `{ ok: true }` HTTP 200 even when `unhealthy.length > 0` · **MED** · return HTTP 503 (or `ok: false`) when any cron unhealthy.
20. `lib/domain/cron-auth.ts:31` · fail-closed uses `NODE_ENV === "production"` while `env.ts` keys prod-only vars on remote DB — local `next start` boot passes but all crons 401 without `CRON_SECRET` · **LOW** · align both on `isRealProdDeploy()`.
21. `lib/infra/env.ts:125` · `NODE_ENV=test` skips validation via unsafe cast — misconfigured CI can boot then fail opaquely later · **LOW** · call `parseEnv()` in test setup with explicit fixtures.
22. `lib/infra/welfare-uploads.ts:118` · storage rollback `.catch(() => {})` — orphaned upload paths vanish silently · **MED** · log rollback failure; retry `remove()` or record orphan path.
23. `instrumentation.ts:11` · no `process.on("unhandledRejection")` handler — stray floating promises can crash Node with no structured log · **LOW** · register handler in `register()` logging digest + rethrow policy.

**clean:** `app/error.tsx` + `app/global-error.tsx` (segment + root layout fallback, console logging, digest UI); `lib/infra/env.ts` remote-prod fail-closed (secrets required, dev pepper rejected); Suspense-heavy routes inherit segment `error.tsx` / `loading.tsx` (RSC rejections covered — client `useEffect` fetch failures are not, by Next.js design).
