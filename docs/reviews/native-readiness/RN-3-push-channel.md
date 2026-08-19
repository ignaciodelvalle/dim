# RN-3 — Push / notification channel

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Builds on RN-1/RN-2 (not repeated).

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
  overdue_critical re-emit fires at 04:00 UTC = 01:00 ART.** On native that's
  a 1 AM alarm and an uninstall.
- **F6 — Collapse keys day-bucketed (vaccine) → consecutive days stack;
  highest-value sites (sighting, encontré, found-pet) have NO dedupeKey at
  all** → zero collapse, zero idempotency; APNs/FCM would inherit exactly
  this.
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
  outbound-channels.ts — this is the other half it points at).
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
  vs org coverage; no lat/lng on pets/sightings/profiles. "Pet lost near you"
  is a new feature with a new targeting model, not a transport port.
- **F14 — Two write paths**: 24 files on createNotification*; 68 legacy
  direct-insert files (guarded baseline, slow shrink); 12 of those hand-call
  sendPushForNotifications after raw inserts. Adding FCM = 1 file; correct
  semantics = 12 files + schema.
- **F15 — Token lifecycle half-good**: 410→soft-revoke correct and tested;
  erasure hard-deletes with audit (good precedent). But the promised
  stale-row cleanup cron does not exist.
- **F16 — No production evidence**: push default-OFF, VAPID unvalidated at
  boot, never exercised at volume.

## Ranked improvements (native cheaper AND web better today)

1. **Notification type registry** (134 rows: category, defaultSeverity,
   optOutGroup, pushable, collapseStrategy, target). First PR
   behavior-neutral; isPushable() replaces the hardcoded predicate. Kills the
   category drift; CTA fitness asserts against a table.
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
