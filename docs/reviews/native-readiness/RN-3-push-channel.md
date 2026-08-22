# RN-3 — Push / notification channel

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Builds on RN-1/RN-2 (not repeated).

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> | Finding / improvement | Status | Evidence |
> |---|---|---|
> | F5 — daily 01:00 ART `overdue_critical` re-emit | PARTIAL (B17 landed) | `1310813e` killed the daily vaccine-reminder push at 01:00 ART; B17 suppresses only that ONE re-emit path, not quiet-hours/preferences generally |
> | F6 — sighting/encontré/found-pet have no dedupeKey | PARTIAL | sighting got one via `3a6045a3` (2026-07-18); `/encontre`'s finder-in-possession flow got one via `3275c9b2` (2026-08-21, `dedupeKey: event:${eventId}:${notification.userId}:...`); **only `notify-owner-of-found-pet.ts` still has none** |
> | F9 / F15 — no push delivery observability; promised stale-pruning cron missing | PARTIAL | `11f47611` (2026-08-22) added `data-lifecycle` draining of revoked `push_subscriptions` (one of four tables it now purges) — this answers "are stale rows cleaned up", not "did the push send"; no `push_deliveries` table or per-run counters exist |
> | F13 — geographic fanout doesn't exist | still true, but the schema gap is smaller than stated | `ar_localities.latitude`/`longitude` exist, `pets.localityId` FKs it, and `pet_events.location_lat`/`location_lng` exist — a centroid+radius targeting model (PO decision #3, option B) is now a query away, not a new-columns migration |
> | F14 — two write paths (24 files / 68 legacy) | numbers corrected, still PARTIAL | current count: **67 files, 78 call sites** on `.insert(notifications)` outside `notification-service.ts` (baseline: `scripts/notifications-service-baseline.json`, 64 entries once the service file itself is excluded — close to "66/78" depending on whether the service file's own 3 internal inserts are counted); **11 of those also hand-call `sendPushForNotifications`** directly |
> | F17 (new) — cron dispatcher had no fair-share budget | FIXED | `11f47611` (2026-08-22): `x-cron-budget-ms` (`lib/infra/cron-dispatcher.ts:79`) gives each remaining job a fair share of what's left of the daily dispatcher's window |
> | Improvement 1 — notification type registry (134 rows) | NOT STARTED, count corrected | no registry table/module exists; the distinct `notificationType` literal count today is **~149** (was 134 when this review counted), so the eventual registry is closer to 146-153 rows depending on exactly what corpus is scanned |
>
> Also: the 6 rehome-related notification types are severity `info` by design,
> which puts them outside `web-push.ts`'s hardcoded pushable predicate
> (`severity === "urgent" || notificationType === "pet_sighting"`,
> `lib/infra/web-push.ts:171`) — i.e. they are non-pushable today, consistent
> with F2's finding that eligibility is a hardcoded boolean, not a real
> `isPushable()` (which still does not exist as a named function anywhere).

## Architecture as it is

```
use-case → notification row → sendPushForNotifications(rows) → sendWebPush(userId, payload) → web-push lib
```

One choke point (lib/infra/web-push.ts:167-181) with a provider-neutral
payload (title/body/url/tag). Everything below it is VAPID. Adding FCM/APNs as
a sibling sender is an afternoon; making the channel BEHAVE is the expensive
part.

## Findings (ranked)

- **F1 — Schema blocker**: `push_subscriptions` cannot express a device token
  (endpoint UNIQUE + p256dh/auth NOT NULL; no platform/device_id/app_version/
  locale). FCM token rotation would orphan rows — no install identity to
  conflict on. The ONE hard schema blocker of the dimension.
- **F2 — The three flagship native use-cases are mostly NOT pushed today.**
  Eligibility is a hardcoded boolean (`urgent || pet_sighting`):
  lost_pet_broadcast is warning → never pushed; custody updates → not pushed;
  vaccine due only pushes at overdue/critical. Product finding before a
  native one.
- **F3 — Reach hole**: the SW registers only in the citizen shell; the
  lost-pet broadcast's entire audience is org members — who have no shell
  that registers a SW and no opt-in card. The highest-value fanout reaches
  zero devices.
- **F4 — No type registry**: 134 notification types exist as labels only;
  severity/category/CTA chosen ad hoc per insert site (category values
  already drifting). Nowhere to declare Android channel, APNs interruption
  level, collapse policy, opt-out group, pushable.
- **F5 — No preferences, no quiet hours, no profiles.timezone → the daily
  overdue_critical re-emit fired at 04:00 UTC = 01:00 ART.** ~~On native
  that's a 1 AM alarm and an uninstall.~~ **PARTIALLY FIXED (B17,
  `1310813e`):** the daily overdue-vaccine re-issue no longer pushes at all,
  which kills THIS ONE 01:00 ART push. Preferences and quiet hours generally
  still do not exist — any other type that re-emits daily inherits the same
  bug.
- **F6 — Collapse keys day-bucketed (vaccine) → consecutive days stack;
  highest-value sites (sighting, encontré, found-pet) have NO dedupeKey at
  all** → zero collapse, zero idempotency; APNs/FCM would inherit exactly
  this. **PARTIALLY FIXED:** sighting got a `dedupeKey` (`3a6045a3`,
  2026-07-18) and the `/encontre` finder-in-possession flow got one
  (`3275c9b2`, 2026-08-21). **Only `notify-owner-of-found-pet.ts` still has
  none.**
- **F7 — Bulk path re-pushes dedupe no-ops** (tag collapse doesn't suppress
  re-display after dismissal; on native it's a re-buzz per retry).
- **F8 — Sends inline, sequential, unretried**: N urgent recipients = N
  sequential HTTPS round-trips inside the user's request; non-410 failures
  dropped forever. The dead-letter table protects the ROW insert, not the
  SEND. The ADR points at event_notification_outbox's backoff as the template
  — never built for push.
- **F9 — Zero delivery observability**: no push_deliveries, no cron_runs
  entry, no audit. "Did the lost-pet push go out last night?" has no answer
  anywhere. /admin/sistema reports key presence only (by explicit design of
  outbound-channels.ts — this is the other half it points at). **Still true**
  for delivery/send observability; the adjacent lifecycle-cleanup half (F15,
  below) landed.
- **F10 — ~50 ctaUrl templates are unmapped web paths** incl. absolute
  argentina.gob.ar links; no universal-link config, no route→screen table.
  Hook to extend: notification-cta-fitness test.
- **F11 — Badge counts don't exist as data** (sw.js `badge:` is the icon);
  unread count is an RSC-only read applying reconcile SQL — native badge is
  new work that must run the same reconciliation.
- **F12 — Delivered pushes can't be retracted**: read-time reconciliation
  hides stale lost-episode rows in the inbox but the tray keeps "URGENTE"
  after the pet is home; no silent close push.
- **F13 — Geographic fanout doesn't exist**: string-equality on jurisdiction
  vs org coverage. ~~No lat/lng on pets/sightings/profiles.~~ **CORRECTED:**
  `ar_localities.latitude`/`longitude` exist, `pets.localityId` FKs
  `ar_localities`, and `pet_events.location_lat`/`location_lng` exist — the
  coordinate data a centroid+radius model needs is already in schema. "Pet
  lost near you" is still a new feature with a new targeting model (PO
  decision #3), but it is a query away, not a migration away.
- **F14 — Two write paths**: 24 files on createNotification*; 68 legacy
  direct-insert files (guarded baseline, slow shrink); 12 of those hand-call
  sendPushForNotifications after raw inserts. **Numbers corrected 2026-08-22:
  67 files / 78 call sites** bypass `createNotification*` (baseline at
  `scripts/notifications-service-baseline.json`, 64 entries excluding the
  service file itself); **11 also hand-call `sendPushForNotifications`**.
  Adding FCM = 1 file; correct semantics = 11-12 files + schema.
- **F15 — Token lifecycle half-good**: 410→soft-revoke correct and tested;
  erasure hard-deletes with audit (good precedent). ~~But the promised
  stale-row cleanup cron does not exist.~~ **PARTIALLY FIXED (`11f47611`,
  2026-08-22):** `app/api/cron/data-lifecycle/route.ts` now drains
  `push_subscriptions WHERE revoked_at < now() - PUSH_SUBSCRIPTION_REVOKED_TTL_DAYS`
  as one of four bounded-batch purges. Delivery observability (F9) is still
  separate and still missing.
- **F16 — No production evidence**: push default-OFF, VAPID unvalidated at
  boot, never exercised at volume.

## Ranked improvements (native cheaper AND web better today)

1. **Notification type registry** (~149 rows as of 2026-08-22, was 134;
   category, defaultSeverity, optOutGroup, pushable, collapseStrategy,
   target). First PR behavior-neutral; isPushable() replaces the hardcoded
   predicate (`web-push.ts:171`'s `severity === "urgent" ||
   notificationType === "pet_sighting"` — still the live logic today). Kills
   the category drift; CTA fitness asserts against a table.
2. **Preferences + quiet hours + profiles.timezone, urgent bypass.** Ship
   THIS week without schema: stop the 01:00 ART overdue_critical push (move
   the scan or hold for a 09:00-local window). Store-review checklist item.
3. **Generalize push_subscriptions → push_targets** (platform, device_id as
   the unique key, nullable token vs endpoint+keys, app_version, locale) +
   the promised stale-pruning cron. Web gets a real device list in /cuenta.
4. **Finish the ratchet on the 12 push-calling legacy sites first** (real
   dedupeKeys; those sites currently have neither idempotency nor
   dead-lettering — a sighting lost to a DB blip is lost forever).
5. **Delivery record + operator tile**: push_deliveries (or per-run counters
   in cron_runs) + a 24h sent/failed/revoked tile next to the
   outbound-channels card. Closes the same false-comfort gap that card was
   built for.
6. **Move sends off the request path** with the outbox-drainer backoff shape;
   retry non-410, cap attempts. Server actions stop blocking on N HTTPS
   calls; APNs/FCM batching becomes a drainer detail.
7. **Deep-link map + link fitness**: notificationTarget(type, params) →
   {path}|{externalUrl}; AASA/assetlinks becomes a mechanical export.
8. **Decide the lost-pet targeting unit NOW** (locality-string fanout to
   opted-in citizens vs centroid+radius needing coordinates) — before native
   promises "pet lost near you".

## Verdict: EXPENSIVE

The promised seam is real: one function, neutral payload, FCM sibling in an
afternoon. But "can add a provider" is not "has a push channel": the target
table can't hold a device token, the eligibility boolean excludes two of the
three use-cases the native pitch is built on, the only audience getting
broadcasts runs in a shell that never registers a service worker, and the
channel's most frequent urgent message fires at 1 AM ART with no preferences,
no retries and no delivery record. Four-five discrete workstreams (schema,
registry, preferences, drainer, observability) must land before a native push
feature is worth having — and every one is a web bug fix first.
