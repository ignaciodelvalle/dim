# Notifications / alerts consistency review — 2026-07-04

**Trigger**: PO report — "a veces están duplicadas y a veces no aparecen." Read-only systemic
review of the entire owner-facing alert/notification surface on `integration/all-20260703`.
No code changed by this review.

## A. Map of every notification/alert surface

| # | Surface | Source (file) | Dedup key | Render | Delivery |
|---|---|---|---|---|---|
| 1 | Vaccine due (cron) | `lib/infra/notifications.ts::runVaccineDueScan` (via `app/api/cron/vaccine-due/route.ts`, daily 12:00 UTC) | `relatedReminderId` + `notificationType LIKE 'vaccine_%'`, per-variant throttle (read history, no DB constraint) | `/notificaciones` (category `health`) + `/inicio` PetHealthStatusStrip nudge (suppressed while active) | in-app only |
| 2 | Post-adoption check-in (proactive + missed) | `lib/infra/notifications.ts::runPostAdoptionCheckinScan` (`app/api/cron/post-adoption-checkin`) | `NOT EXISTS` subquery on `relatedReminderId` + `notificationType` (proactive / missed are separate types) | `/notificaciones` | in-app only |
| 3 | Owner nudges (`/inicio` strip) | `lib/infra/owner-nudges.ts::derivePetHealthStatus` | Pure/derived, no DB row. Cross-surface dedupe (C3, commit `f5482717`): vaccine_overdue nudge suppressed when an ACTIVE `vaccine_due` notification exists for `(userId, relatedPetId)` | `/inicio` only | n/a (derived, not stored) |
| 4 | Event-derived notifications (approvals, transfers, custody, adoption, welfare, revocations, chip-match, intake, etc.) | ~40 use-cases under `src/modules/**/application/*` + a handful of `app/actions/*` shims, all following the "ARCH-P" pattern: accumulate `pendingNotifications[]` inside the event tx, flush with a bare `db.insert(notifications)` **after** commit, wrapped in `try { } catch (e) { console.error("notifications insert failed", e) }` | `(user_id, related_event_id, notification_type)` **partial unique index**, migration `0088_eno_durability_idempotency.sql` (only when `related_event_id IS NOT NULL`) | `/notificaciones` (category varies) | in-app only |
| 5 | Lost-pet broadcast | `lib/infra/lost-pet-broadcast.ts::broadcastLostPet`, called post-tx from `set-pet-lost-use-case.ts` | **None.** No unique key, no `related_event_id` set, chunked insert (500/batch), whole function wrapped in try/catch that swallows and returns empty on any failure | `/notificaciones` (category `perdidas`) | in-app only |
| 6 | ENO fanout (govt + owner legal notifications) | `lib/infra/eno-queue-processor.ts` fed by `event_notification_outbox` (migration `0048`) + `eno_processing_queue` (migration `0053`), drained by `/api/cron/process-eno-queue` | Same partial unique index as #4 (`related_event_id IS NOT NULL`), consumer uses `ON CONFLICT DO NOTHING` per migration `0088`'s stated fix | `/notificaciones` (category `admin`/health per type) | in-app only; outbox also has a separate `govt_webhook`/`eno_authority` delivery lane, orthogonal to the in-app `notifications` table |
| 7 | Govt/admin threshold alerts | `alert_subscriptions` + `alert_firings`, evaluated by `src/modules/alerts/application/firings/record-firings.ts` (`app/api/cron/evaluate-alerts`, daily) | `shouldOpenFiring`: one OPEN firing per `subscriptionId` — read-then-insert, not in a transaction, but low concurrency risk (admin-owned, daily cron) | `/admin/programa` (separate table, NOT the owner `notifications` table) | in-app only |
| 8 | Cron health | `cron_runs` table, `withCronRun`/`runCaseCron` (`lib/infra/case-cron.ts`), surfaced at `/admin/sistema` via `/api/cron/cron-health` | n/a (telemetry, not user-facing alerts) | `/admin/sistema` | n/a |
| 9 | Notification inbox / rendering | `app/(app)/notificaciones/page.tsx` + `components/NotificationCard.tsx` | Client-side grouping only (`groupNotifications`, buckets ≥3 of the same `(relatedPetId, notificationType)` into a collapsed group) — this is **display grouping**, not write-time dedup | `/notificaciones` | — |

There is **no bell/badge counter** anywhere in `AppShell`/`CitizenTabBar` — the only unread signal
is the inline "N sin leer" text on `/notificaciones` itself, and no email/SMS/push exists anywhere
in the codebase (in-app only, confirmed).

## B. Duplication sites

1. **`lib/infra/lost-pet-broadcast.ts::broadcastLostPet` — no idempotency key at all** (file:
   `lib/infra/lost-pet-broadcast.ts:82-200`). Every call inserts fresh `lost_pet_broadcast`
   notifications with `relatedEventId` unset, so migration 0088's unique index does not apply.
   If the calling use-case (`set-pet-lost-use-case.ts`) is invoked twice for the same lost episode
   (retry after a client timeout, a double-submit, or a later status-flip that re-enters the
   lost branch), **every covering org member is notified again** — this is the highest-blast-radius
   duplication site in the codebase (hundreds of recipients per pet at national scale). It is also
   chunked (500 rows/insert); a failure on chunk 3 of 5 is swallowed by the outer try/catch, so a
   caller-level retry of the whole operation would re-insert chunks 1-2 while possibly succeeding
   on 3-5 this time — same effect.
   **Fix**: add `relatedEventId` (the `status_changed`/lost event id) to the insert and let it
   participate in the 0088 unique index (or add a dedicated partial unique index on
   `(user_id, related_pet_id, notification_type)` scoped to a time window), OR gate the call
   site so `broadcastLostPet` only fires once per lost episode (check for an existing broadcast
   before calling).

2. **`runVaccineDueScan` throttle is check-then-act, not atomic** (file: `lib/infra/notifications.ts:130-198`).
   The per-reminder history read (`SELECT MIN/MAX/COUNT ... WHERE related_reminder_id = ...`) and
   the subsequent `INSERT` are two separate statements with no transaction and no unique
   constraint (the file's own comment explains `relatedEventId` is deliberately left `NULL` so the
   0088 unique index does **not** apply here — that index exemption is correct for the *legitimate*
   repeat-emission use case, but it also removes the only DB-level guard against a genuine race).
   If the cron is ever invoked twice concurrently (manual re-trigger while a slow run is still in
   flight, or a platform-level retry after a timeout that doesn't kill the original invocation),
   both processes can read the same `notifCount`/`lastAt` and both pass `checkThrottle`, producing
   two `vaccine_due` notifications for the same reminder in the same instant.
   **Fix**: wrap the read+insert in a single transaction with `SELECT ... FOR UPDATE` on the
   reminder row, or take a Postgres advisory lock keyed on `reminderId` for the duration of the
   check+insert.

3. **84 independent call sites `.insert(notifications)`** across `src/modules/**` and `lib/infra/**`
   (grep count), each deciding its own `notificationType`/dedup posture ad hoc. The 0088 unique
   index is the only shared guard, and it only applies when `related_event_id` is set — a
   significant fraction of call sites (cron-emitted, broadcast, and any future one-off) fall
   outside it by construction. This is not a single bug; it is the structural reason bugs like #1
   and #2 keep recurring at different sites — there is no canonical write path enforcing "one
   notification per obligation."

4. **Pre-C2 backward-compat one-time duplicate is called out in the code itself**
   (`lib/infra/notifications.ts:64-67`): the first post-C2 run of the vaccine throttle produces
   one extra notification per active reminder because the old dedup was keyed differently. This
   is a known, accepted, one-time cost — not a live bug, but worth confirming it has already run
   in production (if this deploy hasn't shipped yet, expect a one-time duplicate wave on rollout).

## C. Dropout sites (ranked by likelihood)

1. **HIGH — the ARCH-P swallow pattern is the dominant dropout mechanism, by design, at ~45 sites.**
   Every post-tx notification insert (grep: `"notifications insert failed"` → 45 matches across
   `src/modules/**`) is wrapped in `try { await db.insert(notifications)... } catch (e) { console.error(...) }`.
   This is *intentional* — `__tests__/notifications-outside-tx.test.ts` documents the contract:
   "a notification insert failure must not roll back the user's intent." That tradeoff is correct
   (you don't want a notifications-table hiccup to fail an adoption approval), but the failure mode
   today is **total and silent**: the log line goes to whatever ingests `console.error` (Vercel
   function logs), nothing retries, nothing dead-letters, and nothing surfaces to an operator or
   the user. Any transient DB blip (pool exhaustion, a deploy-time connection drop, a brief outage)
   at the exact moment of the post-tx flush means that notification is **gone forever** for that
   user, while the underlying action (the thing that matters legally/operationally) succeeded.
   This exactly matches the PO's "a veces no aparecen" — from the owner's perspective the action
   worked (pet transferred, claim resolved, etc.) but no notification tells them so.
   **Fix**: minimal reinforcement — a dead-letter table (`notifications_failed_flush` or reuse
   `event_notification_outbox`'s shape) that the catch block writes to instead of only logging,
   plus a cron that retries/alerts on non-empty dead-letter rows. This turns "silently gone" into
   "delayed but recoverable," which is the cheapest fix with the highest owner-visible impact.

2. **MEDIUM — `broadcastLostPet`'s own try/catch is equally silent** (`lib/infra/lost-pet-broadcast.ts:196-199`,
   D8 "any failure is logged and returns an empty result WITHOUT re-throwing"). A DB error mid-fanout
   means some or all org members never get the lost-pet alert, with zero operator visibility beyond
   a log line. Same reinforcement as #1 applies here.

3. **MEDIUM — `/notificaciones` "N sin leer" undercounts past page 1**
   (`app/(app)/notificaciones/page.tsx:179`): `unreadCount` is computed as
   `rows.filter(r => r.notification.readAt === null).length` over the **current page only**
   (`NOTIFICATIONS_PAGE_LIMIT = 100`), while `fetchNotificationCategoryCounts` (used for the tab
   badges) counts across **all** non-archived rows regardless of read state. An owner with more
   than 100 open notifications (unlikely today, but the lost-pet broadcast fanout in B.1 could
   produce exactly this for an org admin in a busy jurisdiction) would see an understated "sin
   leer" figure — a first-hand "notifications say fewer than there are" symptom, distinct from a
   true write-time dropout but reads the same to the PO.

4. **LOW-MEDIUM — C3 cross-surface dedupe (commit `f5482717`, shipped today) is a suppression
   rule, and suppression rules can over-suppress if the dedupe key drifts.** The nudge is
   suppressed whenever `(userId, relatedPetId, notificationType='vaccine_due', archivedAt IS NULL)`
   matches — this is correct today, but it means if the `vaccine_due` notification for a pet is
   ever archived without the underlying obligation being resolved (the exact case the code
   comments call out as intentional — "archiving brings the nudge back"), the owner has a window
   where **neither** signal exists until the next cron run re-emits the notification (up to the
   throttle interval, e.g. 7 days for the `upcoming` variant). This is a deliberate, documented
   tradeoff (not a bug) but worth the PO knowing: archiving is not "I've handled this," it silences
   the alert for up to a week.

5. **LOW — `reconcile-pet-status` MAX_PETS_PER_RUN=2000 cursor cap — ALREADY FIXED today**
   (`app/api/cron/reconcile-pet-status/route.ts:34-42`, dated fix comment "fixed 2026-07-04").
   The cursor is now persisted in `cron_runs.details.nextCursor` across invocations, so the cron no
   longer re-scans only the first 2000 pets forever. This cron detects `pets.status` cache drift;
   it does not itself write notifications, so its blast radius on the PO's specific complaint was
   indirect (stale `pets.status` could feed a stale compliance card) and is now closed. **No action
   needed — flag as resolved, not a live risk.**

6. **LOW — `evaluate-alerts` / `alert_firings` read-then-insert has the same non-transactional gap
   as #2 in section B**, but this is the govt/admin surface (daily cron, per-admin-owned
   subscriptions), not the owner-facing path the PO is reporting on. Noted for completeness, not
   ranked as a live owner-facing risk.

## D. Unify / reinforce proposal

**Scope split, per the task's framing**: the PO's complaint is about the **owner-facing
nudge/notification pipeline** — items A.1-A.5 and A.9 above (vaccine_due, post-adoption,
`/inicio` nudges, event-derived notifications, lost-pet broadcast, and the inbox itself). The
**govt alert_firings pipeline** (A.7) is a structurally separate, already-well-guarded system
(single dedup rule, admin-owned, low volume) and is not implicated in "duplicada"/"no aparecen"
reports from pet owners — it should stay out of scope for any owner-pipeline fix.

**Is there a single choke point today?** No. The `notifications` table is a single canonical
*storage* location (good), but there is **no single write path** — 84 call sites each decide their
own notification-type, dedup posture, and failure handling. The only two guards that exist
(the 0088 partial unique index, and the C3 nudge/notification cross-suppression) are both
point-fixes bolted onto specific incidents (P1-4 legal-notification dupes; the triple vaccine
signal), not a general contract every writer must satisfy.

**Minimal reinforcement (do not need a full outbox rewrite):**

1. **One notification service function** — `createNotification(input, opts?: { dedupeWindow?, relatedEventId? })`
   wrapping every current `db.insert(notifications)` call site. It should:
   - Require callers to declare *how* they dedupe (by `relatedEventId`, by
     `(userId, relatedPetId, notificationType)` + a time window, or explicitly "no dedupe, this
     type legitimately repeats") rather than leaving it to each of 84 call sites to reinvent.
   - Internally always attempt the insert with `ON CONFLICT DO NOTHING` against whichever key
     applies, closing the `broadcastLostPet` (B.1) and vaccine-throttle-race (B.2) gaps without a
     schema migration for most cases (a new partial unique index on
     `(user_id, related_pet_id, notification_type)` scoped by a `created_at` window, or a
     dedicated `broadcast_batch_id` for lost-pet fanout, are the only schema additions needed).
   - On insert failure, write to a small dead-letter table (or reuse the `event_notification_outbox`
     shape) instead of only `console.error` — closes the ARCH-P dropout (C.1) which is the
     single highest-value fix here.
2. **One dedup rule stated once**: "one obligation, one visible signal, per (user, pet,
   obligation-type)" — already the spirit of the C3 fix, just not enforced structurally outside
   the vaccine case. Migrating `lost_pet_broadcast` and the ARCH-P event-derived notifications onto
   the same rule (via the service function above) generalizes C3 instead of leaving it as a
   one-off special case.
3. **Fix the `/notificaciones` unread count** (C.3) to run the same query as
   `fetchNotificationCategoryCounts` (add `readAt IS NULL` to that aggregate) instead of
   `rows.filter(...)` over the current page.

## E. Verdict

**A few concrete bugs riding on top of a missing architectural choke point — the choke point is
the higher-value fix.** The individual sites (B.1 lost-pet broadcast, B.2 vaccine-throttle race,
C.1 ARCH-P silent swallow) are each independently fixable in isolation, but they are three
symptoms of the same root cause: **84 call sites write directly to `notifications` with no shared
contract for dedup or failure handling.** Patching each site individually (as C3 and 0088 already
did, one incident at a time) will keep producing new instances of the same two failure modes as
new features add new call sites. A thin service-function choke point (D.1-D.3) is the reinforcement
that stops the pattern from recurring, without requiring a full outbox/event-bus rewrite.

### Top 5 fixes, ranked

1. **Dead-letter (or reuse outbox) for the ARCH-P swallow** — closes the single highest-likelihood
   dropout mechanism (45 call sites today, growing). Highest owner-visible impact per unit effort.
2. **Idempotency key on `broadcastLostPet`** — closes the highest-blast-radius duplication site
   (hundreds of recipients per incident). Add `relatedEventId` to the insert + extend the 0088
   index, or a dedicated per-broadcast dedup key.
3. **Atomic check-then-insert for the vaccine throttle** — closes a real but lower-probability
   race (`SELECT ... FOR UPDATE` or an advisory lock keyed on `reminderId`).
4. **Fix the `/notificaciones` unread-count query** — cheap, removes a visible "the count is wrong"
   symptom that reads like a dropout to the PO even though it's a display bug.
5. **Introduce the single `createNotification()` service function** — not urgent on its own, but is
   the structural fix that makes 1-3 durable instead of one-off patches, and prevents the next
   84th-call-site from repeating the same two mistakes.

### Cross-check against HEAD (already fixed, no action needed)

- **C3 nudge/notification cross-suppression** (commit `f5482717`, today) — correctly implemented;
  see C.4 for the one documented edge case (archiving silences for up to the throttle interval),
  which is a known tradeoff, not a bug.
- **P3 idempotency** (migration `0088_eno_durability_idempotency.sql`) — correctly closes the ENO
  fanout duplication (A.6) via a partial unique index + `ON CONFLICT DO NOTHING`. Does **not**
  cover cron-emitted (vaccine/post-adoption) or broadcast (lost-pet) notifications by design
  (partial predicate excludes `related_event_id IS NULL` rows) — those are exactly B.1/B.2 above.
- **`reconcile-pet-status` 2000-pet cursor cap** — fixed today (see C.5). No longer a live risk.
