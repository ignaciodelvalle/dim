# Tier 5 critique — decisions report (resilience & cross-cutting)

## Migrations — subsystem STRONG

Verified clean: forward-only/immutable runner with checksum drift detection +
`--strict` fatal mode, no NNNN collisions (0000→0140, only harmless gaps 0009/0057),
schema ⇄ migrations in sync, RLS tracked (live-catalog coverage tripwire),
destructive migrations safe (0106 backfills dni_hash BEFORE dropping dni_number,
transactional, drop-dependents-first), idempotency (no-transaction files guarded),
per-DB `_dim_migrations` tracking → 0140 applies remote exactly once when Ignacio
runs the gated apply (no double-apply, no skip). 0 auto-fixes.

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| MG1 | LOW | Immutability breach: `0084` was EDITED after it shipped (PR #663 added a `DROP INDEX` so a strict fresh replay wouldn't fail). Any DB that recorded 0084 pre-edit now has permanent checksum drift. Deploy path is non-strict (warning, not fatal); 0084 never re-applies (filename-PK tracking). Author documented the tradeoff in-file. | `db/migrations/0084_...sql:22`, `scripts/migrate.ts:176` | Accept the one-time drift, or revert 0084 + add the DROP INDEX as a NEW forward migration (which re-drifts DBs baselined on current bytes)? PO ruling. |
| MG2 | LOW/note | `0137` is `-- dim:no-transaction` with 70 statements + no `IF EXISTS` → a mid-file failure leaves it partial with no rollback. PROVABLY safe (all `ALTER POLICY`, idempotent, all targets predate it) — `ALTER POLICY` doesn't need no-transaction, so the directive is over-conservative, not a defect. | `db/migrations/0137_...sql` | None needed — note only. |

## Rate limiting — SOUND (0 auto-fixes)

Verified clean: full anon-write surface enumerated — ALL bounded (no unbounded anon
write); `callerIp` non-spoofable at every caller (last XFF hop, never client-set
first); bucket math race-safe (atomic INSERT…ON CONFLICT, `count>limit` correct);
fail-open (scan/atender, by design) vs fail-closed (all writes) deliberate + moot
(bucket shares the write's Postgres); growth bounded (batched daily cleanup +
per-window self-expiry).

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| RL1 | MED | Owner-notification writes (sighting/finder/found_notify) are keyed per-(token,IP) ONLY — no per-TARGET cap → a botnet (each IP its own bucket) can flood ONE lost pet's owner with `urgent` notifications. `found_notify` is worst: no idempotency (unlike sighting's key + finder's 5-min dedupe). Same gap as welfare per-target. | `notify-owner-of-found-pet.ts:43`, `report-pet-sighting.ts:61`, `encontre/action.ts:53` | Add a per-target (per-token, all-IP) ceiling + idempotency on found_notify? A hard cap could throttle legit finders of a high-profile lost pet. |
| RL2 | MED | `org_contact_org:{orgId}` uses the `"any"` cohort = a single GLOBAL 20/day counter per org → an attacker can exhaust a shelter's 20/day and block ALL legit contact/volunteer messages to it for the day. Anti-spam cap doubles as a per-target denial vector. | `submit-org-contact.ts:93` | Rework so abuse can't starve legit senders (per-IP + generous per-org, or a soft cap)? |
| RL3 | LOW | `claim_lookup` keyed on userId only (no IP dimension) → N accounts = N×200/hr against the chip/tattoo enumeration oracle. Heavily mitigated (auth-gated, signup IP-limited, 10¹⁵ keyspace). | `lookup-for-claim.ts:48` | Add an IP dimension for parity with the public lookup? Low. |

## DB-budget / death-spiral — core CRASH-SAFE; edges are ops/honesty calls

Verified clean: `withDbBudget` crash-safe (`.catch` before first `await` → no
unhandledRejection can escape; `timedOut` gates rethrow-vs-swallow; largest fan-out
uses `allSettled` not `all` → no abandoned sibling). All four outcomes test-pinned.

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| DB1 | HIGH | `KPIS_BUDGET_MS=20_000` may EXCEED the platform function timeout (Hobby 10s / Pro-non-Fluid 15s — vercel.json sets maxDuration only for crons) → the platform kills `/api/panorama/kpis` BEFORE `withDbBudget` degrades = task-#74 symptom returns. Worst in the `ANALYTICS_DATABASE_URL`-unset misconfig (no statement_timeout). The 8s/9s budgets are safely below; only KPIs is above. | `load-panorama-kpis.ts:39` | Confirm deployed maxDuration ≥20s (Fluid) OR lower `KPIS_BUDGET_MS` below the platform limit. Ops/config. |
| DB2 | MED | `check-db-budget` guard enforces only ~4 sites; 6 D2 analytics pages of identical shape (admin/gob censo/poblacion/inteligencia/programa) aren't enforced (they ARE wrapped today, but a future drop stays green), and gob/analytics, gob/page, gob/vigilancia fan out with NO wrapper + aren't scanned. Substring match ≠ every fan-out bounded. | `check-db-budget.ts:48,73` | Widen guard scope + wrap the bare gob fan-outs (defensive, mechanical) + move to AST/usage detection (bigger). |
| DB3 | MED | Layer/histogram TIMEOUT degrades to a SILENT EMPTY (200, `features:[]`, no `degraded` marker) — byte-indistinguishable from a genuinely empty scope, unlike the KPI path which carries `degraded:true`. The ~96s BA-locality cobertura case renders an empty choropleth reading as "zero coverage" instead of "no pudimos calcular". (A rejection correctly 503s; only the timeout is silent.) | `[layer]/route.ts:158,191` | Add a `degraded:true` marker to the layer envelope on timeout + honest console copy. |
| DB5/6 | LOW | (5) A second unbudgeted `db.select` on the guard-"covered" admin/programa page (narrow indexed lookup, low risk — demonstrates DB2's evasion). (6) Connection not released on budget expiry until statement_timeout (15s) / reaper — bounded on the session pool, sharpens only in the ANALYTICS_DATABASE_URL-unset misconfig. | `admin/programa/page.tsx:191`, `db/index.ts:178` | Minor — fold into DB1/DB2 config hardening. |

## Cron fleet — auth/parity/idempotency SOLID; single-dispatcher resilience gaps

Verified clean: auth airtight (all 24 routes `authorizeCronRequest`, fail-closed in
prod, timingSafeEqual; children re-validate), parity enforced (DAILY_JOB_ORDER ≡
CRON_REGISTRY ≡ dirs, module-load throw on drift), idempotency genuine (dedupe
unique index, `FOR UPDATE SKIP LOCKED`, state-transition closes; safe under
retry-the-fleet amplification), rabies auto-close compares INSTANTS (timezone-safe).
Auto-fixed in-loop: CR5 (stale header comments) + CR6 (parity-test auth assertion).

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| CR1 | HIGH | Budget (55s) exhaustion silently STARVES the order tail (drain_outbox, drain_dead_letter, cron_health) — yet reports `ok:true, 200` and skipped jobs write NO `cron_runs`. One slow early job (materialize backlog) → notifications undelivered + no health check that run, invisibly. Chronic over-budget = perpetual tail starvation, dashboard green. | `daily/route.ts:64,135`, `cron-dispatcher.ts:169` | Order-aware budgeting (protect the drains + monitor), or count skips as a surfaced state, not silent. |
| CR2 | MED-HIGH | The watcher isn't watched: `cron_health` is the LAST job INSIDE the single dispatcher → it can't detect the dispatcher itself failing to fire. If `/api/cron/daily` stops (plan downgrade, misconfig), nothing runs incl. cron_health → NO alert. `cron_daily`/`refresh_cube` telemetry is unchecked (absent from registry). | `cron-dispatcher.ts:172` | External uptime ping / dead-man switch. |
| CR3 | MED | `refresh_cube` writes telemetry but is monitored by nobody + never `sendCronAlert`s on failure → a silently failing `*/15` cube refresh on Pro produces NO fleet alert (only backstop: 6h staleness→live). Deliberately excluded (cadence ≠ daily), hence the honest gap. | `refresh-cube/route.ts:33` | External monitor for the cube refresh. |
| CR4 | MED | Hobby/Pro premise is CONTRADICTORY: `vercel.json` has a `*/15` cron (needs Pro), but the whole daily-fold was justified by "Hobby rejects sub-daily". If Pro, the fragile single-dispatcher fold (CR1/CR2) was adopted unnecessarily; the "on Hobby it never fires" comment is a shaky Vercel claim (a rejected schedule is a deploy failure). | `vercel.json`, `cron-dispatcher.ts:6` | Confirm the actual plan; if Pro, reconsider the daily-dispatcher fold entirely. |

