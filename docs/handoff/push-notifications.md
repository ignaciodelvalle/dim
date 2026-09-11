# Handoff — mobile push notifications

**For an agent with no prior context on this repository.**

Everything here is decided. There are no open choices in this document, and that is
deliberate: where you would otherwise have to pick, section 3 picks for you and says
why. **If you find yourself about to make a design decision that this brief does not
cover, stop and report it instead of choosing.** A wrong assumption here costs a
migration that cannot be taken back.

Written 2026-09-10 against commit `0ab294099`. Every claim below was measured against
the tree on that date, not remembered.

---

## 1. What exists today, measured

The web already has a working push channel. Mobile has none. The seam between them is
one function.

**The delivery path**, end to end:

```
use-case → createNotification() → notifications row
                                → sendPushForNotifications(rows)
                                → sendWebPush(userId, payload) → VAPID / web-push
```

- `lib/infra/notification-service.ts:110-166` — `createNotification()` inserts one row
  with `ON CONFLICT (dedupe_key) DO NOTHING`, then **awaits** `sendPushForNotifications`
  at line 152. It never re-throws; failures go to `notification_dead_letter`.
- `lib/infra/web-push.ts:170-172` — the eligibility filter, verbatim:
  ```ts
  const pushable = rows.filter(
    (row) => row.severity === "urgent" || row.notificationType === "pet_sighting",
  );
  ```
- `lib/infra/web-push.ts:124-149` — on delivery failure: HTTP 404 or 410 soft-revokes the
  subscription (`revokedAt` set, never retried); any other error is reported and the row is
  left alone. There is no retry loop.
- `NEXT_PUBLIC_PUSH_ENABLED` (`web-push.ts:60-63`) gates the **web** leg only.

**The destinations table** `push_subscriptions` (`db/schema.ts:1721-1756`) is shaped for
Web Push and cannot hold a device token:

| column | type | null | note |
|---|---|---|---|
| `id` | uuid | no | PK |
| `user_id` | uuid | no | FK → profiles, ON DELETE CASCADE |
| `endpoint` | text | **no** | **UNIQUE, globally** |
| `p256dh` | text | **no** | Web Crypto public key |
| `auth` | text | **no** | Web Crypto auth secret |
| `user_agent` | text | yes | |
| `created_at` | timestamptz | no | `now()` |
| `last_used_at` | timestamptz | yes | |
| `revoked_at` | timestamptz | yes | soft-revocation |

No `platform`, no `device_id`, no `app_version`, no `locale`. Three NOT NULL columns a
native token cannot fill.

**The mobile app** has a poll-based notifications inbox already
(`apps/mobile/src/notifications/`, reading `GET /api/v1/me/notifications`) and **zero**
push code: no `expo-notifications` dependency, no token capture, no permission request,
no port. Confirmed by grep, not assumed.

**There is no FCM or APNs code anywhere in the repository.** Only design documents.

---

## 2. Scope

### In scope

1. A new table for native push targets, with its migration.
2. A v1 endpoint the app calls to register and to unregister a device token.
3. The Expo sender, as a sibling behind the existing choke point.
4. The mobile side: the native module, a port following this repo's seam convention, the
   permission request, token capture, registration on sign-in, unregistration on sign-out.
5. Tests for all of it, including the mutation verification described in section 6.

### Explicitly out of scope — do not build these

- **The lost-pet geographic broadcast** ("aviso de mascota perdida cerca tuyo"). It depends
  on an undecided targeting unit and is a separate workstream. Only notifications that
  already reach a specific, identified user get pushed.
- **A notification type registry** or any widening of the eligibility filter. See 3.3.
- **Quiet hours, per-type preferences, or `profiles.timezone`.** See 3.4.
- **An outbox drainer for push.** See 3.5.
- **A `push_deliveries` table or any delivery-observability surface.** See 3.6.
- **Org-member reach.** See 3.7.
- **Any change to `push_subscriptions` or to the web push path.** It works. Leave it alone.

---

## 3. The decisions, already made

### 3.1 Transport: Expo Push Service, not direct FCM/APNs

Use `expo-notifications` on the device and `expo-server-sdk` on the server.

**Why.** The app is Expo-managed with EAS builds. Expo's push service brokers to both FCM
and APNs, so there is one server code path instead of two, no APNs `.p8` key handling, and
no FCM service-account JSON in the server environment. The product owner has already
obtained the FCM credential, and uploading that credential to Expo is exactly what this
path needs.

The existing design documents only ever say "FCM/APNs" because they were written before
the Expo app existed. They are not overriding this; they simply never considered it.

**Server environment variable**: `EXPO_ACCESS_TOKEN`. Read it the way `web-push.ts` reads
its VAPID vars, and make the sender a no-op when it is absent, exactly as
`isWebPushEnabled()` does. Do not throw on a missing token.

### 3.2 Schema: a new table `push_targets`, and `push_subscriptions` is not touched

Create a new table. Do **not** ALTER `push_subscriptions`.

**Why.** Making `endpoint`, `p256dh` and `auth` nullable to fit a device token would
weaken three invariants the working web channel depends on, to accommodate a channel that
does not exist yet. A new table costs one migration and risks nothing. Web push stays on
`push_subscriptions` permanently; the two tables are siblings, not a migration path.

**Shape** — this is the schema, not a suggestion:

| column | type | null | note |
|---|---|---|---|
| `id` | uuid | no | PK, `gen_random_uuid()` |
| `user_id` | uuid | no | FK → `profiles.id`, **ON DELETE CASCADE** |
| `device_id` | text | no | **UNIQUE** — see below |
| `expo_push_token` | text | no | rotates; updated in place |
| `platform` | text | no | CHECK in (`'ios'`, `'android'`) |
| `app_version` | text | yes | for triage |
| `created_at` | timestamptz | no | `now()` |
| `last_used_at` | timestamptz | yes | bump on successful send |
| `revoked_at` | timestamptz | yes | soft-revocation |

Indexes: `(user_id) WHERE revoked_at IS NULL` for the send path, and
`(revoked_at) WHERE revoked_at IS NOT NULL` for the purge path. Copy the naming and the
shape from migration `0152_push_subscriptions.sql` and from `0197`.

**The unique key is `device_id`, and it is not the token.** Push tokens rotate; a token as
the conflict target orphans a row on every rotation and there is then no install identity
to reconcile against. `device_id` is a UUID the app generates **once** on first launch and
stores in `expo-secure-store` (already a dependency). One install is one row.

**Consequence, and it is the intended behaviour**: registration upserts `user_id` on
conflict with `device_id`. If a second person signs in on the same phone, the row's owner
flips to them and the first person stops receiving pushes on that device. That is correct
— the device's lock screen belongs to whoever is signed in.

**RLS**: mirror `push_subscriptions` exactly (migration `0152`, lines 69-94). SELECT,
INSERT and UPDATE restricted to `user_id = auth.uid()`. **No DELETE policy at all** — rows
are soft-revoked, and hard deletion happens only server-side.

**Erasure**: `erase_subject_data()` must hard-delete from `push_targets` the same way it
does from `push_subscriptions`. That RPC is redefined wholesale by each migration that
touches it — find its latest definition (search `db/migrations/` for
`erase_subject_data`, take the highest-numbered file) and carry it forward with your
table added. **This is not optional and it is easy to miss.** Ley 25.326 art. 16.

**Purge**: extend `purgeRevokedPushSubscriptions()` in `lib/infra/data-lifecycle.ts:274`,
or add a sibling next to it, using the same 30-day TTL constant and the same 500-row
batching under the daily cron budget.

### 3.3 Eligibility: the same filter as web, unchanged

Mobile pushes exactly what web pushes:

```ts
row.severity === "urgent" || row.notificationType === "pet_sighting"
```

**Why not wider.** The wider filter everyone wants needs a notification-type registry that
does not exist; `notificationType` is free text, not an enum, with roughly 149 distinct
values in the corpus. Widening without a registry means a second hardcoded list that
drifts from the first. Two channels disagreeing about what is urgent is worse than both
being narrow.

Refactor the filter into one exported predicate that both senders call. Do not copy it.

### 3.4 No preferences, no quiet hours

The OS permission prompt is the opt-in. Signing out is the opt-out. Nothing else in v1.

**Why.** Preferences and quiet hours need a per-user timezone the `profiles` table does not
have, and a type registry that does not exist. Both are named workstreams elsewhere.

**One thing you must still honour**: `createNotification` accepts `suppressPush`. Respect
it in the mobile sender exactly as the web sender does.

### 3.5 Durability: the existing inline path, no outbox

Your sender is a sibling call inside `sendPushForNotifications`, on the request path,
awaited, with no retry beyond the revoke case in 3.6.

**Why.** This inherits precisely the fragility web push already has — a known, accepted
posture, not a new risk. Building the outbox-shaped drainer is a multi-week workstream
that would swallow this one. Do not start it.

### 3.6 Observability: match web's posture, add no tables

- On Expo's `DeviceNotRegistered` error, **soft-revoke the target** (`revokedAt`). This is
  the analog of web's 404/410 handling.
- Any other failure: `reportError("expo-push/send", ...)`, leave the row alone.
- Bump `lastUsedAt` on success.

No `push_deliveries` table, no counters, no operator tile.

### 3.7 Audience: owners and citizens only

The signed-in person on their own phone. Organisation-member reach is out of scope: the
mobile app has no organisation-facing shell at all today.

### 3.8 The registration endpoint requires no `Idempotency-Key`

`POST /api/v1/me/push-targets` (register/refresh) and `DELETE` or a `revoke` command to
unregister.

**Why no key.** The operation is idempotent on final state — it upserts on `device_id`.
This matches `/api/v1/me/notifications`, whose commands deliberately carry no key, and not
`/api/v1/pets/{token}/events`, which requires one because it appends to an immutable log.
Requiring a key here would force the app to manufacture one for an operation whose repeat
is harmless.

### 3.9 Ship in the NEXT native build — the one this section used to name is gone

`expo-notifications` is a native module. `runtimeVersion` is `{ policy: "fingerprint" }`,
so adding it changes the fingerprint and requires a new store build.

**AMENDED 2026-09-11, and the amendment is the whole point of reading this section.** It
used to say that the product owner had decided everything pending ships in one build, and
that your work had to land before that build was cut. **That build was cut on 2026-09-11
WITHOUT push.** So:

- Your change **cannot travel over the air**. It needs its own store build. That is no
  longer a risk to avoid — it is the plan.
- **You cannot test against the build that is on Play.** Build your own with the
  `development` or `preview` profile in `apps/mobile/eas.json`; both produce an APK. That
  is your test environment, and nothing in this document assumed it before.
- The deadline pressure is off. What replaces it: a **closed test is running**, so nothing
  you ship may break what is already installed on somebody's phone.

**Do not change the `runtimeVersion` policy to avoid the fingerprint change.** It is
supposed to change.

### 3.10 One tripwire you must not trip

`apps/mobile/app.config.ts` passes `cameraPermission: false` and
`microphonePermission: false` to the `expo-image-picker` plugin, because that plugin
otherwise adds `RECORD_AUDIO` and English Info.plist strings.

`cameraPermission: false` maps to `withBlockedPermissions`, **and a blocked permission wins
over any later plugin that adds it**. `expo-notifications` does not need the camera, so
this should not affect you — but if you find yourself adding any module that does, remove
that key in the same commit or you will ship a build whose camera can never open, silently,
because a missing manifest permission is a runtime denial and not a build error.

### 3.11 A stale document, so you are not misled

`docs/adr/2026-07-18-native-readiness.md` Decision 5 says "No React Native code. No mobile
project scaffolded." That was true when written and is **no longer true**: `apps/mobile/`
exists with a working bearer-auth API client and a notifications inbox. The ADR has not
been amended. Read it for the seam reasoning, not for current state.

---

## 4. Conventions you must follow

Read one file from each group before writing the equivalent. The house style is not
optional here; fences enforce most of it.

**A v1 route.** Read `app/api/v1/me/notifications/route.ts` in full. The shape:
- `createClientFromBearer(request.headers.get("authorization"))`, then
  `apiV1Error("auth_required" | "auth_expired", 401)` on failure.
- `requireLiveUser(...)` wrapped in `withDbBudgetOrThrow(..., 5_000, "...")`, **inline in
  the handler body** — the fence reads handler bodies and does not follow calls.
- Errors via `apiV1Error(code, status)` with a code from the closed `ApiV1ErrorCode`
  vocabulary. Success via `apiV1Json(payload, { status })`.
- Two-tier rate limiting: an IP bucket and a user bucket, limits as named constants in
  `lib/infra/api-v1-limits.ts`.

**A contract input schema.** Read `packages/contract/src/input/notification.ts`. Yours goes
next to it as `push-registration.ts`: a `SCREAMING_SNAKE_CASE` closed list of input codes,
a zod schema, and shared constants imported rather than restated.

**A mobile API call.** Read `apps/mobile/src/api/endpoints.ts:1124-1136`. Use `apiRequest`
and `SessionPort`. Do not hand-roll a fetch.

**A native seam.** Read `apps/mobile/src/native/image-picker-port.ts` and
`apps/mobile/src/native/expo-image-picker-adapter.ts`. The convention is: a port interface,
a `moduleMissing…` default that answers honestly instead of throwing,
`set/get/reset` functions, and the real adapter registered at bootstrap in
`apps/mobile/app/_layout.tsx`. Follow it for push.

**Project invariants** (from `CLAUDE.md`, all non-negotiable):
- Spanish (es-AR) user-facing copy including permission strings. English identifiers,
  comments and documentation. No slang in either.
- Events are append-only. Never edit or delete one.
- No DNI in plaintext — `lib/utils/dni-hash.ts`.
- Migrations are forward-only and immutable.

---

## 5. Territory

**Files you own.** Nobody else will touch these:

```
db/migrations/NNNN_push_targets.sql          (see the numbering rule below)
db/schema.ts                                  (the push_targets block only)
lib/infra/expo-push.ts                        (new — your sender)
lib/infra/push-target-store.ts                (new)
app/api/v1/me/push-targets/route.ts           (new)
packages/contract/src/input/push-registration.ts   (new)
packages/contract/src/api/…                   (a new file if you need a wire type)
apps/mobile/src/native/push-port.ts           (new)
apps/mobile/src/native/expo-push-adapter.ts   (new)
apps/mobile/src/notifications/…               (registration wiring)
```

**Files you must edit but do not own** — keep the change minimal and say so in your report:

```
lib/infra/web-push.ts             (extract the shared eligibility predicate only)
lib/infra/data-lifecycle.ts       (the purge)
apps/mobile/app/_layout.tsx       (one line: register the port)
apps/mobile/app.config.ts         (the plugin entry)
apps/mobile/package.json          (the dependency)
```

**Files you must NOT touch, under any circumstances:**

```
docs/architecture/facts.json      ← see 6.3
docs/architecture/**.md            markers
docs/presentation/**               markers
db/migrations/0001–0217            immutable, already applied to staging
push_subscriptions                 the working web channel
scripts/**                         the fences
```

---

## 6. The rules that will bite you

### 6.1 Node version

The shell resolves Node 24. This repo pins **22.23.2**. Every `node`, `pnpm` or `npx`
command must be prefixed, or your green means nothing:

```
export PATH="/c/Users/ignac/AppData/Roaming/fnm/node-versions/v22.23.2/installation:$PATH"
```

### 6.2 The migration number

Migrations are numbered `NNNN_`. **Write your migration LAST, and recount the free number
at the moment you write it** — do not fix it now from this document. The highest was `0217`
when this was written and is **`0220` as of 2026-09-11**; it has moved twice since, which is
exactly why this paragraph tells you to recount rather than giving you a number to copy.
There are gaps at `0009` and `0057`, so a file count is not the number.

Two people both picking `0218` does not produce a text conflict. It produces two different
files with the same number and a broken migration runner.

**Do not apply your migration to any remote database.** Local only. Applying to staging or
production is the product owner's, and only theirs.

### 6.3 The facts chain — do not run it

Adding a `route.ts`, a test file or a migration moves `docs/architecture/facts.json` **and**
seventeen hand-edited markers of the form `<!-- fact:key -->N<!-- /fact -->` across
`docs/architecture/` and `docs/presentation/`. A doc test fails when they disagree.

**Do not run `pnpm facts:write` and do not edit any marker.** Instead, report the exact
counts of:
- new `route.ts` files
- new vitest `*.test.ts(x)` files
- new mobile jest test files

The integrating maintainer runs the facts pass once, at merge. Two people editing that file
conflicts on every batch.

Prefer adding tests to **existing** files where it does not hurt them, so the chain does not
move at all.

### 6.4 The gate, and what you may and may not run

The full gate is `pnpm verify` (69 fences, plus a Next.js build) followed by
`pnpm test:verified`. It takes roughly twenty-five minutes and it scans the whole
repository.

**Do not run it.** The integrating maintainer runs it on the merged tree. If you run it
while your work and theirs are both in a tree, neither of you gets a verdict about your own
change, and touching any file while it runs poisons the fences that scan the repo.

Run targeted checks instead, and read exit codes **directly**, never through a pipe — a
pipe returns its own status and will report success over a red typecheck:

```
npx vitest run <file>                    # web
cd apps/mobile && npx jest <path>        # mobile — jest, not vitest
npx biome check <your changed files>
npx tsc --noEmit                         # repo root
cd apps/mobile && npx tsc --noEmit
```

`pnpm test` is forbidden repo-wide: its exit code lies in both directions.

### 6.5 Branch, and do not commit to main

Branch from `main` **after** the in-flight image-picker work has landed, so you inherit the
`app.config.ts` plugin block rather than conflicting with it. Work on your branch. Open a
pull request. Do not push to `main`.

### 6.6 Attribution

**Nothing carries AI attribution.** No `Co-Authored-By`, no "generated with", nothing, in
any commit message, pull request body, comment or file. This project has already had to
rewrite twenty-two published commits to remove it. Conventional commits only.

---

## 7. Tests you must write

Assert **presence**, not absence. A test that only checks a thing is missing passes when the
whole feature is missing.

Never assert a value against the function that produced it. Pin user-facing copy against
string literals.

**Required coverage:**

1. **The eligibility predicate** — a notification that qualifies, and one of each severity
   that does not. Pin the exact filter.
2. **Upsert on `device_id`** — same device, second registration with a rotated token:
   one row, new token. Same device, a different user: one row, owner flipped.
3. **Soft-revoke on `DeviceNotRegistered`** — the row is revoked, not deleted, and not
   retried.
4. **`suppressPush` is honoured.**
5. **Erasure** — after `erase_subject_data`, the person's `push_targets` rows are gone.
   This is a legal obligation, not a nicety.
6. **The adapter's mapping** — every shape `expo-notifications` can return, mapped onto
   your port's outcome union, against a mocked module.
7. **The endpoint's auth and rate limiting** — an unauthenticated call, an expired token,
   and the limit being hit.

**Mutation-verify at least items 2, 3 and 5.** Break the implementation, confirm exactly the
expected tests fail and no others, restore. Back up with `cp` before mutating — **never
`git checkout --`**, which would destroy other uncommitted work in the tree. Report the
mutation matrix.

---

## 8. How to report, so this can actually be reviewed

Your report is the review surface. A report that says "done, tests pass" cannot be reviewed
and will be sent back.

Include, in this order:

1. **File-by-file summary.** One line each. Mark clearly which files you edited that you do
   not own.

2. **Every decision you made that this brief did not cover.** If the answer is none, say so
   explicitly. If it is not none, each one needs what you chose and why. **This is the
   single most important section**, because a decision made silently is the thing a reviewer
   cannot see.

3. **The migration**, quoted in full, with the number you recounted and when you recounted
   it. Plus confirmation that you applied it **locally only**.

4. **Verbatim output**, not summarised, of: your targeted vitest runs, your mobile jest
   runs, `npx biome check`, and both `tsc --noEmit` with their exit codes read directly.

5. **The mutation matrix** — which mutation killed which tests, and confirmation that
   nothing unrelated died.

6. **The three file counts** for the facts chain (6.3).

7. **What a person can actually do on a phone after your change, and what they cannot.**
   Be precise and be conservative. There is no device in your environment, so you cannot
   have seen a push arrive. Say what you verified and what remains unverified until someone
   runs a build on real hardware. **This project has twice shipped a claim that a capability
   was reachable when only its plumbing was, and both times a reviewer caught it.** Do not
   be the third.

8. **Anything you could not finish**, stated plainly, with what it would take.

9. **Confirmation** that you did not run `pnpm verify`, `pnpm test:verified` or
   `pnpm facts:write`, did not apply anything to a remote database, did not touch a file
   outside your territory without listing it, and added no AI attribution anywhere.

---

## 9. What "done" means

- The migration exists, is numbered correctly, and applies cleanly to a **local** database.
- A signed-in person on a real build gets the OS permission prompt in Spanish, and a token
  reaches `push_targets`.
- A notification that already qualifies for web push now also reaches a registered device,
  through the same choke point, with no change to the web leg.
- Signing out revokes the target.
- Erasing an account removes it.
- Every test in section 7 exists and passes, with the mutation matrix to prove three of
  them are not vacuous.
- The report in section 8 is complete, and its section 2 either says "no decisions beyond
  the brief" or lists them.
