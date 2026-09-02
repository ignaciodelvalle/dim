# 2026-09 fresh audit — backlog

> Snapshot: `b975f3e9d` (`main`; `11c0ffc57` pushed 2026-09-02 plus `lenses/A01.md`) · Audited SHA: `d7dbf25f7` (lenses ran before WU-0 merged) · Facts: `docs/architecture/facts.json`
> Status: draft — finalized 2026-09-02 by the synthesis writer; fresh review fixes applied 2026-09-02

Every CONFIRMED finding from the 15 executed lenses: **1 CRITICAL (closed), 6 HIGH, 55 MED, 38 LOW = 100**; 99 of them open. Ranked by severity, then by blast radius (who is reachable: anonymous third parties → other tenants/jurisdictions → the actor themselves → nothing live yet). Refuted findings are not here; they are in `FINDINGS.json` with `status: "refuted"`.

Line numbers are as of the audited SHA `d7dbf25f7`. HEAD has moved past `11c0ffc57` — **re-locate by content before editing**.

Twelve commits landed on `main` after the audited SHA. Besides the 0211 fix (`ae97186b9`, closes `A01-R1`, partly moves `A02-2`) and the architecture-facts work (`0cf63af8e`: `AGENTS.md`, `package.json`), three touched audited surfaces (`f899f52f8`, `264032a38`, `11c0ffc57`) and none of those closes a numbered finding below: all three touch test-infrastructure files (`e2e/demo/_db-cleanup.ts`, `scripts/check-seed-hygiene.ts`, `scripts/clean-test-orphans.ts`) that no executed lens filed against. They do move `facts.json` (`vitest_files` 1485 → 1487).

## CLOSED

| id | sev | kind | path:line (audited SHA) | what | fix that landed |
|---|---|---|---|---|---|
| `A01-R1` | CRITICAL | security | `db/rls.sql:48` · `scripts/check-authz-guards.ts:818` | `"Profiles updatable by self"` pinned the ROW (`id = auth.uid()` in both `USING` and `WITH CHECK`) and never a COLUMN. No column `GRANT`/`REVOKE` on `profiles`, no `BEFORE UPDATE` trigger comparing `old.role`/`new.role`, the `account_type`/`role` pairing CHECK dropped in `0016`, and `supabase/config.toml:13` exposes the public schema. Any authenticated user could `PATCH /rest/v1/profiles?id=eq.<own uid>` with `{"role":"admin","account_type":"institutional"}` and mint themselves an admin — the authorization layer reads those columns and never the JWT. The fence that would police this (`findImpersonationExports`) reads `"use server"` exports and cannot see PostgREST. | Migration `db/migrations/0211_profiles_lock_postgrest_writes.sql` **drops** the policy — deny-all for PostgREST writes, mirroring `0163` on `ownerships` — plus fence `__tests__/rls/profiles-write-lockdown.test.ts`. Commits `ae97186b9`, `36c8204c9`. Applied by the PO to Supabase `DIM-staging` on 2026-09-02, the only live database (no production database exists; the old `DIM` project is INACTIVE). |

**The id is a synthesis assignment, not a lens one.** The finding arrived as a **healthy-claim refutation** in lens A01, not as a finder submission, so `lenses/A01.md` recorded it under "Claimed healthy, not verified" and it entered no severity tally there. `R` marks refuter-originated. Escalated to 5 refuters per the plan's CRITICAL rule and confirmed **5/5**; the vote of record is engram topic `sdd/audit-2026-09/decisions`, re-refutation workflow `wf_8bd36c20-bc1`.

Three follow-ups the fix deliberately deferred, each a real item and none of them urgent now that the door is shut:

1. **`BEFORE UPDATE` trigger on `profiles`** refusing a `role`/`account_type` change from anything but the BYPASSRLS connection. Belt-and-braces. Note that a column-level `REVOKE` is *not* an option: `applySchemaGrants` (`scripts/deploy-provision.ts:533-541`) re-grants `ALL` to `authenticated` on every provision, so a `REVOKE` is undone by the next deploy — that is why 0211 drops the policy instead.
2. **A column-scope probe in the RLS matrix.** `__tests__/rls/write-path-matrix.test.ts:20-31` classifies an `auth.uid()`-scoped policy as SAFE by construction — true of rows, false of columns. Related to `A02-5` below, which is the same blind spot from the other side.
3. **`A02-1`** — the identical mistake on `pet_events`, still open, now queued as migration **0212**.

## Still without a finding id, and it outranks the numbered list

One item remains from the pair the drafts flagged. It arrived as a *healthy-claim* refutation, so it carries no finding id and appears in no severity count.

| what | lens | path | why it outranks |
|---|---|---|---|
| `drain-outbox` re-delivers: the `FOR UPDATE SKIP LOCKED` lock is scoped to a transaction containing only the `SELECT`, which commits before per-row delivery; rows stay `status='pending'` through the whole batch loop, so an overlapping run re-selects and re-sends them. `deliverOutboxRow` has no idempotency key. | C04 | `app/api/cron/drain-outbox/route.ts:78` | The correct claim-by-`UPDATE ... SET status='processing' ... RETURNING *` pattern is already in the repo at `src/modules/surveillance/infrastructure/surveillance-repository.ts:494`. C04's own text asks the next audit to file this. **Lote 2 should file it as `C04-R1`**, under the convention `A01-R1` introduces — it needs an id and a reproduction before it can be fixed and cited. |

## HIGH (6)

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A05-1 | HIGH | security | code-sdd | `db/migrations/0059_subject_rights_rpcs.sql:24` | Forward migration redefining `pii.caller_is_admin` with `AND deleted_at IS NULL` (copy `0188:56-60`); add an erased-admin case to `__tests__/subject-rights-rpcs.test.ts`. | `sdd/erasure-art16` | no |
| A02-1 | HIGH | security | code-sdd | `db/migrations/0190_titular_only_rls.sql:140` | **DECIDED — queued as migration 0212, next batch** (PO 2026-09-02, engram `sdd/audit-2026-09/decisions`): same shape as 0211 — lock the PostgREST write path, since `/api/v1` and the use cases are the only legitimate writers. Ship with `pnpm facts:write` (the migration count moves) and an RLS fence test. Remote apply is PO-gated, staging only. Migration not yet written. | `sdd/rls-write-policies` | decided |
| A09-1 | HIGH | security | po-decision | `src/modules/transfers/domain/owner-transfer-rules.ts:124` | Gate the e-mail fallback arm on the accepting account's `email_confirmed_at` being non-null, or bind the invitation to a single-use secret delivered to the address. | — | **yes** |
| A01-1 | HIGH | security | code-sdd | `lib/infra/live-user.ts:324` | Decide the personal-deactivation policy in `requireLiveUser`, not per-guard: widen `:324` to any `accountType` **and** build the deactivated-account landing screen, or make `selfDeactivatePersonalAccountForUser` refuse until it exists. | `sdd/authz-boundary` | **yes** (paired with A04-8) |
| A05-2 | HIGH | fence-gap | fence-candidate | `scripts/check-subject-rights-coverage.ts:197` | Split into a per-table `{export, erase}` classification, each side `covered \| exempt(reason) \| gap(reason)`, failing on any unclassified side; move `attachments` out of `EXEMPT`. | — | no |
| C04-1 | HIGH | bug | code-sdd | `app/api/cron/expire-decomiso-handoffs/route.ts:38` | Give the route a `batchSize` (keyset on the raw scan id, as the five sibling case routes do) **or** make `runCaseCron`'s unbatched branch honour `budgetHeaders`; then tighten `READS_THE_BUDGET` so passing `budgetHeaders` without `batchSize` no longer reads as `honoursBudget`. | `sdd/crons-budget` | no |

## MED (55)

### Reachable by an anonymous or third-party caller

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A07-1 | MED | security | code-sdd | `db/storage.sql:46` | One forward migration setting `file_size_limit = 5242880` and `allowed_mime_types = array['image/jpeg','image/png','image/webp']` on `pet-photos`, mirroring `0206`; repeat for `event-attachments`, `avatars`, `org-logos`. | `sdd/uploads` | no |
| A03-G7 | MED | security | code-sdd | `app/(public)/perdidas/page.tsx:85` | `callerIp(await headers())` + `enforceRateLimit("lost_listing", ip, …)` at the top of the page with a soft-fail notice, and the same for `app/sitemap.ts`. | `sdd/public-surface-throttle` | limit value only |
| A03-G8 | MED | bug | code-sdd | `app/sitemap.ts:53` | Replace the `Array.includes` filter with a `Set`; decouple the fetch cap from `pageSize` for bulk callers; wrap the sitemap's `Promise.all` in `loadWithTimeout`. | `sdd/public-surface-throttle` | no |
| A03-G2 | MED | security | code-sdd | `app/sitemap.ts:51` | Wrap the three reads in `loadWithTimeout` per the `perdidas` pattern, `.limit()` the organizations select, give the route a real `revalidate` or a per-IP bucket, and add it to `check-db-budget.ts`'s `DASHBOARD_PAGES`. | `sdd/public-surface-throttle` | no |
| A03-G3 | MED | bug | code-sdd | `app/sitemap.ts:34` | Pass the fourth argument the function already exposes (`queryLostListing({}, null, SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE)`) or drop the constant, and correct the `:32-33` comment that claims both queries are already bounded. | `sdd/public-surface-throttle` | no |
| A03-3 | MED | security | code-sdd | `app/(public)/refugios/[orgToken]/page.tsx:107` | Give each route its own literal bucket before the first DB read, then widen `__tests__/public-token-throttle-coverage.test.ts`'s scan beyond DIM-token resolvers. | `sdd/public-surface-throttle` | no |
| A03-2 | MED | security | code-sdd | `src/modules/pets/application/sighting/report-pet-sighting.ts:145` | Add a second, IP-less bucket keyed on the token alone alongside the per-`(token,ip)` one, in all three anonymous write actions — the pattern already exists in `submit-org-contact.ts`. | `sdd/public-surface-throttle` | no |
| A03-1 | MED | fence-gap | code-sdd | `lib/infra/public-cache-policy.ts:40` | Derive the fence from the tree (walk `app/(public)/**`, `app/libreta/**`, `app/r/**` for `force-dynamic`) with an explicit exemption map, then add `/t/` and `/refugios` to `NO_STORE_PREFIXES`. | `sdd/public-surface-throttle` | no |
| A03-G1 | MED | bug | code-sdd | `app/robots.ts:83` | `"/r"` → `"/r/"` and `"/t"` → `"/t/"` (robots.txt disallows are prefix matches, not segment matches), plus a test cross-checking every URL shape `app/sitemap.ts` emits against the disallow array. | `sdd/public-surface-throttle` | no |
| A06-G5 | MED | security | code-sdd | `src/modules/pets/application/public/notify-owner-of-found-pet.ts:140` | One negative case per anon-callable action asserting `ok:false`, the `DISPUTE_TIP_NOTICE` error, and that `createNotificationsBulk` was NOT called. | `sdd/notifications-lifecycle` | no |
| A11-G1 | MED | security | code-sdd | `app/api/v1/welfare-reports/commands.ts:277` | Stop letting a client-echoed province/locality set `unverified:false` — cross-check it against `locationLat`/`locationLng` and fall back to `unverified:true` on disagreement, or make `resolve_location` return a signed candidate handle. | `sdd/scoping-jurisdiction` | no |
| A06-2 | MED | security | code-sdd | `apps/mobile/src/observability/sentry.ts:41` | Give `Sentry.init` a `beforeSend` running message/exception text through the web's `redactText` rules and a `beforeBreadcrumb` stripping query strings from http breadcrumbs; pin both in `sentry.test.ts`. | `sdd/mobile-observability` | no |
| A01-4 | MED | security | code-sdd | `app/actions/localities.ts:51` | Move both `__reset*ForTests` helpers out of the `"use server"` modules into the plain rate-limit module; add a fence rule banning `__*ForTests`/`__reset*` exports from `"use server"` files. | `sdd/authz-boundary` | no |

### Cross-tenant, cross-jurisdiction, or reaching a subject who already left

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A10-G1 | MED | security | code-sdd | `db/migrations/0137_rls_initplan_auth_subselect.sql:45` | Forward migration adding `AND p.deleted_at IS NULL` to the `alert_subscriptions` admin EXISTS branch, matching `0188`; add an erased-admin principal to `__tests__/rls`. | `sdd/alerts-liveness` | no |
| A10-G3 | MED | bug | code-sdd | `src/modules/alerts/application/firings/record-firings.ts:98` | Join `profiles` in the owner sweep and require `role='admin' AND deactivated_at IS NULL AND deleted_at IS NULL`, or have erase/deactivate set `is_active=false` on the subject's subscriptions; update the `KNOWN_GAP` entry to say which. | `sdd/alerts-liveness` | no |
| A06-G2 | MED | bug | code-sdd | `app/api/cron/drain-notification-dead-letter/route.ts:138` | Resolve (or null the payload of) the subject's dead-letter rows in the same transaction as `erase_subject_data`; belt-and-braces, skip replay when the recipient profile has `deleted_at` set. | `sdd/erasure-art16` | no |
| A06-G1 | MED | bug | code-sdd | `lib/infra/notification-service.ts:265` | On resolve, null the payload (keep `dedupe_key`/`error_message`/timestamps), or add a retention sweep to `data-lifecycle`. | `sdd/notifications-lifecycle` | no |
| A07-3 | MED | bug | code-sdd | `src/modules/auth/application/subject-rights/erase-subject-data.ts:195` | Add an `avatars/{userId}/` prefix sweep reusing the paginated loop at `:143-167`; decide and document whether `welfare-evidence` and `revocations` are retention or gap; extend the coverage fence with a bucket inventory. | `sdd/erasure-art16` | no |
| A10-1 | MED | security | code-sdd | `app/org/[orgToken]/transitos/page.tsx:83` | Bind the historial foster rows to the viewing org the way `activos` is bound — innerJoin `fosterProposals` on `resolvedOwnershipId` with `eq(fosterProposals.organizationId, organization.id)`. | `sdd/scoping-jurisdiction` | no |
| A10-2 | MED | security | code-sdd | `src/modules/organizations/application/admin-proposals/propose-vet-upgrade.ts:100` | Load the actor's active `govt_assignments` in `admin-proposals/helpers.ts` (mirror `admin-decisions/helpers.ts`) and reject unless `jurisdictionScopeContains(...)`; route the pair through `resolveCanonicalJurisdiction`. | `sdd/scoping-jurisdiction` | no |
| A01-2 | MED | security | code-sdd | `lib/analytics/admin-metrics.ts:172` | Give `fetchQueueHealthScoped` the role its sibling helpers take: `if (role === 'govt' && jurisdictions.length === 0) return zeroed` before any query — empty means universal only for admin. | `sdd/authz-boundary` | no |
| A10-G2 | MED | security | code-sdd | `lib/metrics/alert-evaluation.ts:124` | For a non-admin `baseActor`, intersect the subscription's pair with the caller's own jurisdictions before evaluation; correct the `:137-139` comment; add a govt-actor test case. | `sdd/alerts-liveness` | no |

### Data correctness, caches and the event spine

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A08-G1 | MED | bug | code-sdd | `src/modules/events/infrastructure/events-repository.ts:380` | Fetch `event_amended` alongside the three weight-bearing types and run `overlayAmendments` before `replayPetWeight`; add a db test that amends a weight then back-dates a weighing. | `sdd/amendment-overlay` | no |
| A08-G2 | MED | bug | code-sdd | `src/modules/pets/application/pregnancy/rederive-pregnancy-status.ts:39` | Include `event_amended` in the WHERE and overlay before `replayPetPregnancy` — two lines, matching the sibling that already overlays the identical stream. | `sdd/amendment-overlay` | no |
| A08-3 | MED | fence-gap | fence-candidate | `app/api/cron/reconcile-pet-status/route.ts:64` | Widen `STATUS_FAMILY` to the full report with per-family severity, or schedule `scripts/detect-pet-cache-drift.ts` as a job beside `db-doctor-staging.yml`. | — | no |
| A08-4 | MED | fence-gap | fence-candidate | `lib/infra/rederive-pet-cache.ts:435` | Offline fitness test doing `getTableColumns(pets)`, asserting every column is either returned by a `replay*` projection or a member of an exported `EXCLUDED_CACHE_COLUMNS`. | — | no |
| A08-G3 | MED | fence-gap | fence-candidate | `scripts/check-event-payload-parity.ts` (no fence file exists) | New `scripts/check-amendment-overlay.ts` enumerating every module that imports a `replayPet*` or selects `petEvents.payload` for an `AMENDABLE_EVENT_TYPES` member, requiring `overlayAmendments` or a reasoned allowlist entry. | — | no |
| A10-3 | MED | bug | code-sdd | `app/actions/business-rules.ts:56` | Run (province, locality) through `resolveCanonicalJurisdiction` inside `normalizeJurisdiction` and reject an unresolvable pair before create/update, as `createPetAction` does. | `sdd/scoping-jurisdiction` | no |
| A10-4 | MED | fence-gap | code-sdd | `__tests__/govt-assignments-locality-integrity.test.ts:56` | Sibling db-project test asserting every active `pets` row's non-null (province, locality) resolves against `ar_localities`, plus a forward repair migration mirroring `0117` for `pets`. | `sdd/scoping-jurisdiction` | no |
| A09-2 | MED | bug | code-sdd | `src/modules/transfers/application/accept-pet-transfer.ts:160` | Destructure `{ endedCaretakerGrants }`, pass `{ actorUserId, now }`, and call `notifyCaretakersOfHandoff` after commit exactly as `finalize-adoption.ts:361` does; update `use-cases.test.ts:485`'s two-argument assertion in the same change. | `sdd/custody-chain` | no |
| A08-1 | MED | fence-gap | code-sdd | `__tests__/pet-events-append-only.test.ts:107` | Add two cases mirroring `case-events-append-only.test.ts:117-123`: missing-actor refusal (`23001`) and a successful-override audit-row assertion. | `sdd/event-spine-audit` | no |
| A08-2 | MED | debt | code-sdd | `db/migrations/0127_pet_events_append_only.sql:54` | Add old/new `payload`/`notes`/`occurred_at`/`event_type` to both `jsonb_build_object` calls in a new migration — **scoped to exclude PII fields**, per the refuter's caveat about the erase-subject-data consumer — and mirror in `db/triggers.sql`. | `sdd/event-spine-audit` | no |

### Auth, session and the deploy plane

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A04-1 | MED | bug | code-sdd | `src/modules/auth/application/password-reset/update-password.ts:23` | Require proof of the recovery flow (AAL/amr) or of the current password; flip `secure_password_change = true` in `supabase/config.toml` and on the hosted project; correct the file's misleading header. | `sdd/auth-session` | no |
| A04-8 | MED | doc-drift | po-decision | `lib/infra/live-user.ts:324` | Correct the `DeactivateAccountDialog.tsx:45` comment now; then either widen the guard once a deactivated-account landing screen exists, or have the use case call `auth.admin` global sign-out. | — | **yes** (same decision as A01-1) |
| A04-3 | MED | security | po-decision | `supabase/config.toml:227` | Shorten `otp_expiry` to ~600 s and raise `otp_length` to 8 (confirm on the hosted project — `config.toml` is dev-only); longer term, redeem through `/api/v1` so it spends a per-e-mail budget. | — | **yes** |
| A04-5 | MED | security | po-decision | `supabase/config.toml:177` | Set `minimum_password_length = 8` and `password_requirements = "lower_upper_letters_digits"`, and match on the hosted project's Auth settings. | — | **yes** |
| A04-2 | MED | convention | code-sdd | `src/modules/auth/application/logout.ts:11` | Bind `signOut`'s result in both functions and stop redirecting on failure, mirroring `turno-vencido/route.ts:133`; if a redirect must happen, delete `sb-*` cookies explicitly first. | `sdd/auth-session` | no |
| C06-4 | MED | bug | code-sdd | `apps/mobile/eas.json:22` | Add an `env` block per profile pinning `EXPO_PUBLIC_API_BASE_URL` and the Supabase pair per environment; extend `release-config.test.ts` to assert `production`'s API origin is not the staging default. | `sdd/deploy-env` | no |
| A04-4 | MED | bug | fence-candidate | `apps/mobile/eas.json:22` | **Duplicate of C06-4** (found independently by batch A). Same fix; batch A adds: drop the staging default at `api.ts:52` for a loud refusal, or extend `planesLookCrossed()` with a staging-host check. | `sdd/deploy-env` | no |
| C06-1 | MED | bug | po-decision | `package.json:94` | Change the chain to `pnpm verify && pnpm test:verified && …`, and prefer deploying a pushed git ref over `--archive=tgz`; if the local-tree upload is deliberate, rename it `deploy:staging:hotfix`. | — | **yes** |

### Uploads and crons

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A07-2 | MED | bug | code-sdd | `src/modules/pets/application/profile/upload-avatar.ts:31` | Derive both `fileSize` and `mimeType` from the blob inside the use case — check `fileBlob.size` and run the bytes through `detectRasterMime`, dropping `fileName.split('.').pop()`. | `sdd/uploads` | no |
| A07-4 | MED | convention | code-sdd | `app/actions/decomiso.ts:158` | Route decomiso uploads through `uploadAttachmentIfPresent`, or give `lib/media/validate.ts` a second whitelist for document evidence with its own magic-byte table; derive the extension from the validated type. | `sdd/uploads` | no |
| A07-5 | MED | doc-drift | doc-fix | `lib/infra/welfare-uploads.ts:62` | Rewrite the docblock to say the function guards no live surface (or delete the export), or make it answer from a persisted boolean set in the try rather than the client-declared mime. | — | no |
| C04-2 | MED | bug | code-sdd | `lib/infra/cron-dispatcher.ts:390` | Thread the dispatcher budget into all three ceiling-exempt jobs and move them into `CRON_JOB_CEILINGS` with `honoursBudget:true`; failing that, give each a real `ceilingMs` so the dispatcher refuses to start one that cannot finish. | `sdd/crons-budget` | no |
| C04-4 | MED | bug | code-sdd | `app/api/cron/refresh-cube/route.ts:75` | Wrap the body in `withCronRun(CRON_NAME, …)` with `failed: cronStatus === 'failed'` — that buys both the alert and finalize-on-throw. | `sdd/crons-budget` | no |

### Fences and RLS machinery (no live offender today)

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A02-2 | MED | doc-drift | doc-fix | `db/rls.sql:86` | Sync `db/rls.sql` and its four siblings to the live policy set; strip the "apply by pasting" line from every `db/*_rls.sql` header and from `AGENTS.md:1024`; repoint the `AGENTS.md` checklist row at `db/migrations/NNNN_*.sql`. **Partly moved by 0211**: the profiles block now carries a deny-all note naming 0211, and the file header names 0163 and 0211 — but the "Apply once per environment by pasting into Supabase Studio" line is still there. The finding stands. | — | no |
| A02-3 | MED | fence-gap | fence-candidate | `scripts/check-rls-coverage.ts:154` | Enumerate `pg_class` where `relkind in ('v','m')` in the public schema and fail any view SELECT-able by `anon`/`authenticated` without `security_invoker=true`, plus a non-vacuity floor that sees the two known views. | — | no |
| A02-4 | MED | fence-gap | fence-candidate | `__tests__/rls/function-hardening.test.ts:32` | Add a fourth `it()` modelled on the sibling RULE test: select from `pg_proc` where `prosecdef` and no `proconfig` matching `search_path=%`, assert empty, with a non-vacuity floor; `SEARCH_PATH_PINNED` can then shrink or go. | — | no |
| A02-5 | MED | test-theater | fence-candidate | `__tests__/rls/matrix.test.ts:64` | Wire the write half for `pets`, `ownerships`, `pet_events`, `welfare_reports` (`OPERATIONS_UNDER_TEST = ["select","insert"]`); the probe that matters is an owner inserting with `author_role='govt', author_verified=true` being denied. **Raised in value by `A01-R1`**: this file declared `profiles.owner.update = allow` and never executed the cell, which is why nobody asked *which columns*. Add the column-scope probe here. | — | no |
| A01-3 | MED | fence-gap | fence-candidate | `scripts/check-authz-guards.ts:105` | Drop `"auth.getUser"` from `AUTH_GUARDS` and route legacy call sites through `requireLiveUser`; if it must stay, widen `findDeletionUnawareMutations` from `PET_TABLE_RE` to any Drizzle mutation on any table. | — | no |
| A03-G4 | MED | fence-gap | fence-candidate | `scripts/check-db-budget.ts:91` | Narrower than first proposed, per the refuters: list `app/sitemap.ts` in `DASHBOARD_PAGES` (or lower `FANOUT_THRESHOLD` for root metadata routes) and leave the throttle census correctly scoped to token *resolvers*. | — | no |
| A05-4 | MED | fence-gap | fence-candidate | `scripts/check-subject-rights-coverage.ts` (the gap is the absence of a fence) | New `lint:*` fence walking the zod event schemas, collecting every `z.string()` leaf key and requiring each classified `swept \| structural \| retained-with-reason` in a checked-in table. | — | no |
| A05-5 | MED | doc-drift | doc-fix | `db/migrations/0208_subject_rights_watermarks_tag_interest_org_invitations.sql:42` | Add the correction to the existing ERRATA block in `erase-subject-data.ts:20-55`: `organization_memberships` is export-only, and closing it is an open art. 16 item. | — | no |
| A11-1 | MED | bug | code-sdd | `app/api/v1/adoptions/[petToken]/route.ts:87` | Spend `API_V1_AUTHENTICATED_READ_USER_LIMIT` on `api_v1_adoptions_read_user` immediately after `requireLiveUser`, in the shape the sibling catalogue route already uses. | `sdd/api-v1-budgets` | no |
| A11-3 | MED | fence-gap | code-sdd | `app/api/v1/pets/[publicToken]/route.ts:96` | Add `__tests__/api-v1-pet-detail-route.test.ts` importing `{ GET }`: identical 404 for not-held vs non-existent token, the four `requireLiveUser` refusals, and 503-not-404 on `DbBudgetExceededError`. | `sdd/api-v1-budgets` | no |

## LOW (38)

| id | sev | kind | fixClass | path:line | one-line fix | SDD cluster | PO? |
|---|---|---|---|---|---|---|---|
| A09-4 | LOW | debt | po-decision | `src/modules/cases/application/escalate-stale-disputes.ts:45` | Add a 30/60-day first-response SLA addressed to the assigned arbiter, distinct from the 365-day stale flag; surface days-open on the dispute queue. | — | **yes** |
| A05-6 | LOW | debt | po-decision | `lib/events/event-schemas.ts:173` | Either record accepted professional-attribution retention in the ERRATA block, or sentinel-sweep `vet_name`/`administered_by` scoped to `recorded_by_user_id = p_user_id`. | — | **yes** |
| A06-4 | LOW | convention | po-decision | `app/(public)/p/[publicToken]/page.tsx:769` | Run the four owner-authored free-text fields through a render-time scrub reusing `lib/observability/redact.ts`'s phone/digit rules, or warn at the write side. | — | **yes** |
| A07-6 | LOW | debt | po-decision | `docs/reviews/native-readiness/README.md:159` | No code change proposed; surface B30 to the PO — with no storage GC and only event-triggered deletion, every replaced photo and unconfirmed staged blob accumulates without bound. Start with a report-only reconciliation cron. | — | **yes** |
| C04-7 | LOW | debt | po-decision | `lib/infra/cron-alert.ts:42` | Confirm `CRON_ALERT_WEBHOOK` is set in Vercel production and staging, then make the claim checkable — e.g. `alertingConfigured` in `cron_runs` details, surfaced on `/admin/sistema`. | — | **yes** |
| A01-8 | LOW | fence-gap | po-decision | `scripts/check-authz-scoping.ts:239` | Pick a burn-down owner and date, or convert the ratchet to fail on the sum so the 44/19 total can only go down. | — | **yes** |
| A04-9 | LOW | debt | po-decision | `docs/plans/PENDIENTES.md:92` | No code change — enable leaked-password protection at the moment the project moves to the Supabase Pro plan. | — | **yes** |
| A01-5 | LOW | debt | code-sdd | `lib/analytics/owner-dashboard.ts:1925` | Push the predicate into SQL (viewer argument + `EXISTS` clause) the way `getOutbreakInvestigationDetail` was fixed; delete the dead `fetchVaccinationHistory`. | `sdd/authz-boundary` | no |
| A01-6 | LOW | convention | code-sdd | `lib/infra/admin-search.ts:90` | Remove the `scope: UserSearchScope = { role: "admin" }` default and make the parameter required — compile-only, all three call sites already comply. | `sdd/authz-boundary` | no |
| A04-10 | LOW | debt | code-sdd | `src/modules/organizations/application/revocations/revoke-vet-role.ts:37` | Invalidate via the GoTrue admin refresh-token/logout endpoint keyed by user id (**not** `auth.admin.signOut(jwt, scope)`, which takes a live JWT, not a user id) as a best-effort post-transaction step in all five revocation/deactivation writers. | `sdd/auth-session` | no |
| A09-5 | LOW | debt | code-sdd | `scripts/detect-pet-cache-drift.ts:30` | Extend `checkPetOwnerships` to the `owner` role first (re-derive from the custody event types, report a set difference under a new kind), then foster and shelter_custody. | `sdd/cache-drift` | no |
| A09-3 | LOW | bug | code-sdd | `db/schema.ts:3644` | Add `'escalated'` to the `custody_disputes_status_valid` CHECK (forward migration, recount the next free `NNNN` at write time) and to the status union, or read lifecycle from the linked `cases` row. | `sdd/custody-chain` | no |
| A09-6 | LOW | convention | fence-candidate | `src/modules/custody-disputes/application/resolve-dispute.ts:34` | **Answered by the B02 decision** (below): `application → @/db` is not the axis being fenced — writes must move to `src/modules` use cases and page-level reads are baselined shrink-only. Extend `check-dependency-direction.ts` only if the new `scripts/check-app-db-boundary.ts` leaves this class uncovered; the 43 current files are the natural first baseline. | — | decided |
| A05-7 | LOW | bug | code-sdd | `lib/projections/pet-compliance.ts:1` | Move the overlay inside each `replay*` entry point, or brand the input type (`AmendedEvents`) so a raw array stops type-checking at call sites. | `sdd/erasure-art16` | no |
| A08-G4 | LOW | debt | code-sdd | `scripts/repair-pet-cache-drift.ts:129` | Wrap the fetched stream in `overlayAmendments` before `replayPetStatus`, matching `rebuild-projections.ts:215` — two lines, and it makes the docblock true again. | `sdd/amendment-overlay` | no |
| A08-6 | LOW | convention | code-sdd | `db/migrations/0127_pet_events_append_only.sql:77` | Seed a fixed system-cron profile uuid and write it as `actor_user_id` in the scan-purge branch, in a new migration plus `db/triggers.sql`. | `sdd/event-spine-audit` | no |
| A08-7 | LOW | fence-gap | fence-candidate | `lib/events/event-idempotency.ts:122` | Move the `validatedEventValues` call inside the shared helper so every caller is covered, and route the surveillance repository's three raw inserts through it. | — | no |
| A02-7 | LOW | debt | fence-candidate | `db/migrations/0124_notifications_dedupe_key_and_dead_letter.sql:72` | Nothing to change in 0124/0125 (immutable). Add a lint over `db/migrations/*.sql` failing when a file `CREATE TABLE`s in the public schema without a matching `ENABLE ROW LEVEL SECURITY`, allowlisting historical offenders by filename. | — | no |
| A02-8 | LOW | doc-drift | doc-fix | `db/schema.ts:1289` | Change the comment to name both writers: validated on the Drizzle path only; the `pet_events` INSERT RLS policy does not constrain `event_type`. Delete once A02-1 closes (migration 0212). | — | no |
| A03-G5 | LOW | bug | code-sdd | `src/modules/lost/infrastructure/lost-listing-read.ts:174` | `const disclosing = new Set(disclosingIds)` then `.has(...)` — one line, O(n), no behaviour change. | `sdd/public-surface-throttle` | no |
| A03-G10 | LOW | convention | code-sdd | `src/modules/lost/infrastructure/lost-listing-read.ts:187` | Project the two keys instead of the whole `payload` column, matching `load-public-credential.ts:279`, and drop the JS coalesce. | `sdd/public-surface-throttle` | no |
| A03-G11 | LOW | convention | code-sdd | `app/(public)/perdidas/page.tsx:52` | Validate `province` against the page's own map, drop the locality bit unless it resolves in the catalog, add `alternates: { canonical: '/perdidas' }`; mirror into `app/(public)/adoptar/page.tsx`. | `sdd/public-surface-throttle` | no |
| A03-G6 | LOW | doc-drift | doc-fix | `next.config.ts:58` | Reword to past tense, name `app/robots.ts` and its landing date, and state why the `X-Robots-Tag` block still earns its place (it covers a 303 and non-HTML responses). | — | no |
| A04-6 | LOW | convention | code-sdd | `src/modules/auth/application/password-reset/update-password.ts:46` | Return one generic sentence for every `updateUser` failure, matching `signup.ts:192-195`. | `sdd/auth-session` | no |
| A06-1 | LOW | fence-gap | fence-candidate | `lib/analytics/dashboards/surveillance.ts:494` | Make `fetchCasesPerLocality` return `MetricResult<SuppressedCells>` built by `suppressSmallCells`; if raw rows are genuinely needed, rename to `…Raw` and add a lint asserting every exported fetcher with a locality `groupBy` returns the branded type. | — | no |
| A06-G3 | LOW | doc-drift | doc-fix | `app/api/cron/drain-notification-dead-letter/route.ts:13` | Correct the comment to cite `cron-registry.ts`'s `runsVia: "daily"` — the real window is 24 h, not the 1 h the header claims. | — | no |
| A06-G4 | LOW | bug | code-sdd | `app/api/cron/drain-notification-dead-letter/route.ts:77` | Add `"success"` to the severity union in `toInput`, or export the severity type from the service and validate against it. | `sdd/notifications-lifecycle` | no |
| A10-6 | LOW | convention | code-sdd | `src/modules/foster/infrastructure/foster-repository.ts:443` | Use `canonicalProvince` in the UPDATE branch too, and run the (province, locality) pair through `normalizeLocationForWrite({ locality: "strict" })` on both branches. | `sdd/scoping-jurisdiction` | no |
| A10-7 | LOW | convention | code-sdd | `src/modules/organizations/application/admin-proposals/propose-org-verification.ts:26` | Reject a govt proposer unless `jurisdictionScopeContains(...)` (requires fixing `admin-proposals/helpers.ts:50` first, per A10-2) and correct the `:28` comment either way. | `sdd/scoping-jurisdiction` | no |
| A11-G2 | LOW | convention | code-sdd | `apps/mobile/src/transfers/TransferDetailScreen.tsx:271` | Have the screen call `buildAcceptTransfer`/`buildRejectTransfer`/`buildCancelTransfer` and branch on `built.ok`, matching `TransferInitiateScreen.tsx:85-92`. | `sdd/mobile-client-contract` | no |
| A11-2 | LOW | fence-gap | fence-candidate | `__tests__/api-v1-rate-limit-families.test.ts:194` | Add a third assertion mapping per-user call sites to families with `*_USER_LIMIT` constants, with an explicit allowlist for families whose per-user half deliberately lives in the use-case layer. | — | no |
| A11-4 | LOW | doc-drift | doc-fix | `app/api/v1/welfare-reports/route.ts:99` | Replace the transcribed `13 044` with a pointer to `API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE` and its `toBe` assertion (the live value is 13,884). | — | no |
| A11-5 | LOW | doc-drift | doc-fix | `apps/mobile/src/api/client.ts:286` | Rewrite the client comment to say the countdown branch is defensive against a future server, citing `docs/architecture/api-invariants.md:860` for why no `/api/v1` 429 carries `retry-after` today. Keep the branch and its test. | — | no |
| C04-3 | LOW | bug | code-sdd | `app/api/cron/cron-health/route.ts:71` | Exclude the current run id when the entry being evaluated is `CRON_NAME` (or insert the telemetry row after the loop), and fix the `:43-45` comment. | `sdd/crons-budget` | no |
| C04-5 | LOW | doc-drift | doc-fix | `app/api/cron/expire-decomiso-handoffs/route.ts:4` | Replace both comments with the truth — dispatched once daily at 04:00 UTC / 01:00 ART via `/api/cron/daily`; sub-daily is impossible on Hobby — and re-derive the 500-row cap from a 24 h window. | — | no |
| C06-5 | LOW | convention | code-sdd | `scripts/migrate.ts:389` | Invert the default (make checksum drift fatal, add `--allow-drift` for the rare recorded exception), or at minimum pass `--strict` from `deploy:staging`. | `sdd/deploy-env` | no |
| C06-6 | LOW | doc-drift | doc-fix | `.github/workflows/db-doctor-staging.yml:24` | Rewrite the four workflow headers to say `main`, keeping the history sentence already correctly written at `scripts/check-scheduled-fence-refs.ts:76-83`. | — | no |
| A01-7 | LOW | fence-gap | fence-candidate | `scripts/check-authz-guards.ts:974` | Add `lib/**/*.ts` and `lib/**/*.tsx` to `ACTION_SOURCE_GLOBS` — discovery is content-based, so this costs one scan pass today. | — | no |

## PO decisions needed

**Thirteen** decisions. Each names the options and what the lens actually recommended; none of these should be re-asked as an open question, only decided. The drafts listed fourteen — B02 has since been decided and moves to the section below.

### 1. C06-1 — `deploy:staging` ships with the test half of the DoD never run

- **The fact.** `deploy:staging` = `pnpm verify && tsx scripts/migrate.ts && npx vercel --prod --archive=tgz`. `verify` chains lint, typecheck, `verify:mobile` (which *does* run the mobile jest suite), the fence set and `pnpm build` — but never `test:verified`, so the web vitest suite never runs. `--archive=tgz` uploads the working directory, not a git ref, so uncommitted, unpushed, un-CI'd code can reach the staging production alias.
- **Options.** (a) Add `pnpm test:verified` to the chain. (b) Keep the fast path but rename it `deploy:staging:hotfix` and route the normal path through a pushed git ref. (c) Accept as-is and document it.
- **Lens recommendation.** (a) **and** (b): add the test step, and prefer a pushed git ref over the local-tree upload so the tree that ships is the tree CI graded. The refuter downgraded this from HIGH to MED because no doc claims this path runs the full DoD — it is a documented gap, not a false-green gate.

### 2. C04-7 — `CRON_ALERT_WEBHOOK` is unasserted, so all Vercel-side paging may be a silent no-op

- **The fact.** Every "pages a human" claim in the cron fleet routes through `sendCronAlert`, which returns immediately when `CRON_ALERT_WEBHOOK` is unset. No lint fence, test or startup check asserts it is configured. The GitHub-side counterpart (`alertFindings`, wired as `lint:sched-refs` inside `verify`) *is* fenced — the asymmetry is the finding.
- **This cannot be settled from the tree.** Reading `.env*` was out of scope by contract; that is the point.
- **Lens recommendation.** Confirm the variable is set in Vercel production and staging, then make the claim checkable rather than trusted: have `/api/cron/cron-health` report `alertingConfigured: Boolean(process.env.CRON_ALERT_WEBHOOK)` in its `cron_runs` details and surface it on `/admin/sistema`.

### 3. A09-1 (HIGH) — an unconfirmed e-mail address moves titularidad

- **Options.** (a) Gate the e-mail fallback arm on `email_confirmed_at` being non-null (the id arm is unaffected). (b) Bind the invitation to a single-use secret delivered to the address, rather than exposing `transferToken` to any account matching the string. (c) Turn `enable_confirmations` ON, which closes it at the root.
- **Lens recommendation.** (a) or (b) now; (c) is tracked as PO item #65 and is **currently priced only as an enumeration leak — re-price it with this custody consequence attached.** Also reword `lib/infra/live-user.ts:103-105`, which reasons about token authenticity as if it cleared the addressee arm.

### 4. A01-1 + A04-8 — what does personal-account self-deactivation actually do?

One decision, two findings. Today it writes `deactivated_at` and nothing else: no sign-out, no token revocation, and `requireLiveUser`'s refusal is institutional-only, so the account keeps working forever. The dialog comment claims a guard that does not exist for it.
- **Options.** (a) Widen the guard to every `accountType` **and** build the deactivated-account landing screen. (b) Make the use case refuse until that screen exists. (c) Declare personal deactivation a bookkeeping flag by design and fix the copy.
- **Lens recommendation.** Decide the policy in `requireLiveUser`, not per-guard, and **do not widen the predicate without the landing screen** — a bare widening risks repeating the 2026-07-04 `ERR_TOO_MANY_REDIRECTS` incident. Correct the dialog comment regardless of which option wins.

### 5. A04-3 — recovery OTP: 6 digits, valid for a full hour, redemption unbudgeted

Redemption goes device → GoTrue directly, bypassing `enforceRateLimit` entirely; the only ceiling is GoTrue's own `token_verifications`. **Recommendation:** shorten `otp_expiry` to ~600 s and raise `otp_length` to 8, confirming on the hosted project (`supabase/config.toml` is dev-only); longer term, redeem through `/api/v1` so it spends a per-e-mail budget like every other auth act.

### 6. A04-5 — GoTrue's password floor is 6 with no complexity, and the app's 8 is bypassable

The anon key is public on the web and compiled into the Android binary, so a direct GoTrue call skips the app-side rule. **Recommendation:** set `minimum_password_length = 8` and `password_requirements = "lower_upper_letters_digits"` locally and on the hosted project. *Recorded dissent:* the impact refuter rates residual value LOW — the only actor who can exercise the bypass is the account holder weakening their own account, and direct signup still lands the lowest role.

### 7. A04-9 — leaked-password protection stays off until the Pro plan

Already DIFERIDO with a written reason (2026-08-05, `docs/plans/PENDIENTES.md:92`). **Recommendation:** no code change; enable the toggle at the moment the project moves to Pro, and treat that as part of the production cutover checklist.

### 8. A05-6 — professional-name snapshots survive a professional's own erasure

`vet_name` and `administered_by` stay as verbatim plaintext on every event a vet signed, after that vet erases their account. Arguably professional attribution on an act performed in a professional capacity — but unlike an FK, plaintext is a decision no future policy change can re-scope, and **the decision has never been written down**. **Recommendation:** either record accepted retention in the ERRATA block, or sentinel-sweep both keys scoped to `recorded_by_user_id = p_user_id`, leaving the FK pair as durable attribution.

### 9. A05-3 (refuted, but still a PO item) — `injuries_summary` survives erasure

The finding was refuted because the omission is a **documented decision**, not an oversight: `db/migrations/0129_erase_subject_data_event_pii_redaction.sql:31` states in a section headed SCOPE that only the two identifying contact keys are removed, and a test pins that green today. It is nonetheless free prose about a bite victim surviving on an append-only row. **Recommendation:** re-open with the PO as the same class as A05-6 — a retention decision to confirm or reverse, not a defect to fix quietly.

### 10. A06-4 — owner-authored free text publishes to `/p` with no scrub

An owner can type a phone number into `lostDescription`, or a third party's DNI into `permanentConditionsOther`, and it renders on a permanently addressable anonymous URL. Downgraded to LOW because in all four sites the data subject is the author *and* the publisher, behind a consent toggle or on a field whose purpose is publication. **Recommendation:** render-time scrub reusing `lib/observability/redact.ts`'s phone/digit-run rules, or a warning at the write side in the lost-mode and conditions forms.

### 11. A07-6 / RN-4 B30 — no storage garbage collection exists at all

25 cron routes, zero of which call `.storage.from(`. Only event-triggered deletion exists, so every replaced photo, failed-transaction orphan and unconfirmed staged blob accumulates without bound. **Recommendation:** a **report-only** reconciliation cron first, to size the problem before anything deletes.

### 12. A09-4 — the only dispute SLA is a 365-day notification with no consequence

Because the dispute flag hard-refuses every custody writer, an unattended dispute is an indefinite titularidad freeze — fail-safe, not fail-open, which is why it is LOW. **Recommendation:** add a 30/60-day first-response SLA addressed to the assigned arbiter, distinct from the 365-day stale flag; the PO decides the consequence of a missed first response.

### 13. A01-8 — the authz-scoping ratchet has no owner and never shrinks

44 tolerated offenders across 19 files, up from 41/16. `ratchet()` fails only on per-file growth, so a real scoping regression inside an already-baselined file is invisible until it pushes that file's count up by one. **Recommendation:** pick a burn-down owner and date, or convert the ratchet to also fail on the sum so the total can only go down.

*Also flagged as needing a PO call inside a technical fix, not a standalone decision:* the rate-limit value for `A03-G7` (crawlers are wanted on `/perdidas` — `app/robots.ts:46` allows `/` on purpose, and the `tag_resolve` 100/min shape is the closest precedent).

## Decided — SDD unit pending

### B02 — the `app/` → `db` boundary (the one architectural question, now answered)

**Decision taken by the PO on 2026-09-02** (delegated: "decidí vos en base al mejor caso de uso y robustez"), recorded in engram under topic `sdd/audit-2026-09/decisions`. It is **Option A as a write-only fence, plus Option C's norm going forward, with the full read migration deferred** — which is what the lens recommended, adopted as written.

- **Writes go ONLY through `src/modules` use cases.** Hard rule, no exceptions, fenced.
- **Page-level READS from `app/` through Drizzle are TOLERATED**, under a **shrink-only baseline**: a new `scripts/check-app-db-boundary.ts` plus an `app-db-boundary-baseline.json` in the same shape as `scripts/file-size-baseline.json`. Every current offender is listed; a new `app/` file importing `@/db` or `drizzle-orm` fails `verify`; **removing an entry is the only edit the baseline accepts**. The count is a tablero number, and the direction of travel is that reads migrate into query modules over time.
- **Rationale of record.** 204 `app/` files import `@/db`. Banning reads outright is a rewrite nobody asked for and would stall the pilot; banning WRITES outside modules is where the integrity invariants actually live — invariant #2 (append-only spine) and invariant #3 (caches declare themselves).
- **Status: not yet written.** Neither `scripts/check-app-db-boundary.ts` nor the baseline file exists at this snapshot (verified at HEAD). This is a queued SDD unit, not a landed change, and the baseline must be generated at the SHA it lands on — not from the audit's counts.
- **Pin the spine writer explicitly.** The baseline should be table-annotated so `cronRuns (ledger)` is visually distinct from `petEvents (SPINE)`, with `spineWriters` pinned at **1**: `app/(public)/p/[publicToken]/encontre/action.ts` is the last non-test file in `app/` that inserts into the event spine. Pinning it protects invariant #2 more than any read-path tidying.
- **One correction needed regardless.** `src/modules/pets/application/read/owner-pet-detail-queries.ts` — the one existing read-path migration — imports `@/db` and `drizzle-orm` from inside `application/`, which `docs/architecture/hexagonal-lite.md:63` forbids. The read path needs its own row in that table before a second file moves into it.
- **What was deferred, and what deferring costs.** The full read migration (the lens's Option B, ~154 files) is a separate future decision. `apps/mobile` has 0 direct db imports and reaches the server exclusively through `api/v1`, so every page-only read is a read that gets written twice if mobile later needs it. That is the cost of deferring, and it is a real cost, not zero.
- Related backlog row: `A09-6`, now answered by this decision.

### A02-1 (HIGH) — queued as migration 0212

Decided in the same delegation. Same shape as 0211: lock the `pet_events` PostgREST write path, since `/api/v1` and the use cases are the only legitimate writers. Ship with `pnpm facts:write` (the migration count moves) and an RLS fence test. Remote apply is PO-gated and staging-only. **The migration is not written** — `db/migrations/0212*` does not exist at this snapshot (verified at HEAD). Recount the next free `NNNN` at write time; do not hardcode 0212 from this document.

## Deferred to lote 2

21 lenses, all with complete self-contained briefs at `docs/reviews/2026-09-fresh/briefs/<id>.md`. One line each, from the brief's own Scope paragraph.

| id | lens | scope |
|---|---|---|
| B01 | Module shape vs `hexagonal-lite.md` | Every module under `src/modules/*` against the four-layer shape — which layers exist, which are missing, and whether a module missing `actions.ts`/`infrastructure/` is calling `@/db` from `app/` instead. `auth` is the priority read: it has only `actions.ts` + `application`. |
| B03 | Next.js edge | Merges 06-nextjs-app-router and 07-server-actions: `'use client'` boundaries, non-serializable props, hydration determinism, RSC waterfalls — plus zod validation at every action boundary, `revalidatePath`/`redirect` correctness, and any action trusting a client-supplied id, role or jurisdiction. |
| B04 | Data access & indexing | Merges 08-drizzle-patterns and 09-postgres-indexing, extended to `src/modules/*/infrastructure/*.ts`: N+1 loops, fetch-then-filter-in-JS on PII/tenant data, missing transaction boundaries, keyset pagination correctness — and hot filter+sort queries with no covering composite index, FK cascade semantics, over-indexing. |
| B05 | Migrations & DB objects | `db/migrations/**` and `scripts/migrate.ts`: any migration not forward-only/idempotent, `CREATE INDEX CONCURRENTLY` inside a transaction without the `-- dim:no-transaction` marker, destructive steps without a guard, checksum-tracking gaps, `schema.ts` drift vs the migration history. |
| B06 | Projections & cache pairing | Merges 02-projections and 22-cache-event-pairing: is every view a pure `(events, filters) -> view`, is re-derivation deterministic and total — and for EACH write to a cached `pets` column, is it paired with a matching `pet_events` insert in the same transaction. |
| B07 | `packages/contract` boundary & event catalog | A new contract-boundary audit plus a re-run of 11-event-catalog with the corrected count: every event type's payload zod-validated before insert, payload versioning, the asiento/DOM field whitelist, enum drift between the DB enum and the TS union. |
| B08 | Mobile app architecture & release config | Layering of `apps/mobile/src/*` (20 subdirectories), the API client and offline credential cache, deep links, EAS build profiles, and secret/config handling in `apps/mobile/app.config.ts`. |
| B09 | Concurrency & idempotency | `lib/**` write paths and any plain `db.insert` on a hot path: double-insert/double-transfer races, idempotency guards on retryable writes, check-then-write TOCTOU gaps, non-atomic counter updates. **Add `drain-outbox` (the unnumbered C04 item above) to this lens's scope** — it is exactly this class. |
| B10 | Performance & size budgets | The two largest components in the codebase, the file-size baseline that pins them, and the route-weight fence. |
| B11 | Fence honesty | The fences themselves, not the code they check: vacuity, floors-vs-exact-pins, text-anchor fragility, and `check-*.ts` scripts never invoked by `pnpm verify` or CI. **This is the lens that would have caught `C04-1` as a class** — and, on the RLS side, the "row-scoped reads as column-safe" blind spot that hid `A01-R1`. |
| C01 | Cases, welfare, denuncias, decomiso, return-to-owner | The `CaseStatus` vs `welfareReports` enum mismatch, whether `case_events` is append-only enforced like `pet_events`, illegal state transitions (closed→open, merged→anything), custody-dispute party handling, any case mutation bypassing the event log. |
| C02 | Compliance rules & canonical metrics | Merges 12-compliance and 16-metrics: the provenance gate (is an obligation ever "al día" from a self-declared event), PPP/rabies/chip rule correctness vs the cited ordinances — plus k=5 on every aggregate returned to a client and KPI numerator/denominator correctness. |
| C03 | Notifications & push | Is the single `createNotification` write path honoured everywhere, dedupe-key collisions or gaps, dead-letter drain existence and idempotency, whether the ARCH-P silent-swallow is fully closed, in-app-only as documented limitation vs silent gap. |
| C05 | Observability & error handling | The ARCH-P silent-swallow anti-pattern, boot env validation fail-closed correctness, error boundaries over async/Suspense trees, cron failures retried or dead-lettered, unhandled promise rejections. |
| C07 | UI conventions, design system, es-AR copy | Any raw UUID, DB enum, snake_case key or blank rendered to a user instead of an es-AR label; English leaking into user-facing UI; non-es-AR date/number formatting; pluralization. |
| C08 | Test honesty | The `pnpm verify` vs `pnpm test` gap, brittle source-DOM guards, fitness-sweep hermeticity under concurrency, e2e coverage of the crisis paths, RLS read AND write matrix presence, any critical path with no test. **`A02-5` and `A01-R1` are this lens's opening exhibit**: a declared-but-unexecuted matrix cell. |
| C09 | e2e practice | `e2e/*.spec.ts` against `e2e/README.md`'s own rules: real-browser vs API-only seams, cleanup discipline, runtime-discovered fixtures (no hardcoded tokens/ids), and the nightly job. Note that `e2e/demo/_db-cleanup.ts` changed materially after the lenses ran (`f899f52f8`) — read it at HEAD, not at the audited SHA. |
| D01 | `AGENTS.md` §Data model / §Event catalog / §Roles / §Authorization / §Privacidad / §Legal vs code | Six sections of a 1,763-line document checked against the code they describe — not against each other and not against their own prose. |
| D02 | `AGENTS.md` process sections + `CLAUDE.md` in full vs code | `AGENTS.md`'s process/convention sections plus all 110 lines of `CLAUDE.md`, against actual code and tooling. |
| D03 | `docs/agents/*`, `docs/superpowers/`, `docs/architecture/`, `README.md`, run-books | The repo's meta-documentation layer, plus the "dangling paths" claim. |
| D04 | Process & governance | CI advisory-vs-required status, branch protection to the extent inferable, `docs/agents/open-work.md` staleness, DoD honesty, and which of `recommendations-2026-08-30.md`'s recommendations landed. |

### Recount notes the briefs carry — resolve these on the way in

Each is a number in a planning document that this pass measured differently. None is yet a finding; each is either a doc-drift note or a real drift, and the brief tells you to re-run the command rather than trust either figure.

1. **B01 — 22 modules, 13 outliers, not the plan's 11.** `facts.json` `modules = 22`, and the immediate subdirectories of `src/modules/` still number 22 at HEAD. Layer by layer, the audit pass found **9** modules with all five layers (`adoption`, `caretakers`, `events`, `foster`, `organizations`, `pets`, `rehome`, `surveillance`, `transfers`) and **13** missing at least one (`alerts`, `auth`, `cases`, `custody-disputes`, `decomiso`, `localities`, `lost`, `notifications`, `panorama`, `return-to-owner`, `search`, `service-offerings`, `welfare`) — not 11. If a re-run also gets 13, the plan's "11" is doc drift on the plan itself, not a code defect. **Not re-measured for this synthesis** — the layer-by-layer count is B01's own work.
2. **B05 — RESOLVED. `db/migrations` holds 210 `.sql` files and `facts.json` agrees.** The draft flagged a 210-vs-209 gap; migration `0211` landed in between and `facts.json` was regenerated with it, so both now read **210**. The directory holds **211 entries**: the 211th is `db/migrations/meta/`, Drizzle's journal directory (`_journal.json`), not a stray migration. Re-verified at HEAD. Nothing to move; the note exists so the next reader does not re-open it.
3. **B10 — `PanoramaConsole.tsx` is 4,896 lines against a baseline pin of 4,874.** Re-verified at HEAD: `scripts/file-size-baseline.json:8` pins `components/panorama/PanoramaConsole.tsx` at **4874**; the file is **4896** lines. Its sibling `SituationalMap.tsx` matches its pin exactly at **3319**, which rules out a systematic off-by-N in the measurement. A 22-line drift above a pin is either a baseline that was not updated with a landed change, or a fence that is not failing when it should — settle which before writing any other B10 finding.
