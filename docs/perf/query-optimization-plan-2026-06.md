# Query & Page-Load Optimization — Findings and Fix Plan (2026-06)

Status: **EXECUTED — all six batches shipped (PRs #529–#534, 2026-06-12/13).**

## Results (A/B on identical machine conditions)

**Queries per page** (deterministic census — `scripts/qa-query-census.ts`, app-role
`pg_stat_statements` calls per page load, develop 9d809de vs PERF tip, same DB):

| Page | develop | PERF tip | Δ |
|---|---|---|---|
| /inicio | 17 | 12 | −29% |
| /gob | 25 | 22 | −12% |
| /gob/maltrato | 11 | 8 | −27% |
| /admin | 7 | 5 | −29% |
| /org/[token] | 7 | 5 | −29% |
| /mis-mascotas | 7 | 6 | −14% |
| pet detail / notificaciones / cuenta | unchanged | unchanged | wins are parallelism (PERF-3), not count |

**TTFB**: same-session A/B runs showed the gov cluster down 30–60% (e.g.
/admin/sistema 1733→670 ms, /gob/casos 740→314, /gob/cola 794→560, /gob/usuarios
778→535, /gob/perdidas 809→587 under heavy ambient load), but run-to-run machine
noise that day was ±2× on untouched control pages — treat ms-level numbers as
directional. The query-count table above is the reliable metric. PERF-1's index
and write-amplification wins do not appear in either metric at seed scale; they
are structural (verified via EXPLAIN index-usage checks).

Method: three independent evidence sources gathered on the develop tip (9d809de):

1. **DB structure audit** — pg_catalog vs db/schema.ts vs actual query code (lib/, src/, app/).
2. **Page query-pattern audit** — every `app/**/page.tsx` + the lib helpers they call.
3. **Real production timings** — `next start` build measured with `scripts/qa-timing.ts` (3 reps/route, median TTFB, per-role authenticated sweeps) + `pg_stat_statements` query census.

Local data is seed-scale, so absolute timings are a FLOOR. Anything slow on a near-empty
database is pure round-trip structure (waterfalls, N+1), not data volume — and it will
only get worse with volume.

---

## Part 0 — The headline diagnosis

**Measured: ~11.7 app queries per page load average (1,156 calls / 99 loads).** The slow
tail is NOT caused by heavy queries — every individual query measured under 1ms — it is
caused by HOW MANY round trips a page makes and how many of them run sequentially.

| Rank | Page | Median TTFB (tiny DB!) |
|---|---|---|
| 1 | /gob/maltrato | 588 ms |
| 2 | /mis-mascotas/[token] | 552 ms |
| 3 | /mis-mascotas/[token]?tab=vacunas | 507 ms |
| 4 | /cuenta | 445 ms |
| 5 | /admin/sistema | 443 ms |
| 6 | /org/[token]/agenda | 440 ms |
| 7 | /admin/outbox | 434 ms |
| 8 | /gob/analytics | 401 ms |

Anonymous pages: 5–17 ms. Fast authenticated pages (/admin, /gob/cola, /mis-mascotas):
150–180 ms. The gap between 160 ms and 590 ms on identical infrastructure is the
optimization target.

Two structural root causes:

- **R1 — profile/auth churn**: `profiles` is fetched in 4 different column shapes,
  220 calls across the sweep — layouts, guards and helpers each re-fetch the same row
  2–4× per request. No `React.cache()` anywhere in the request path.
- **R2 — sequential waterfalls**: compound pages (`pet detail`, `/cuenta`,
  `/gob/maltrato`, `/org/agenda`) chain independent awaits serially.

Additionally, the "slowness" the user feels in local dev includes **dev-mode
compilation** (10–16 s first hit per route) — that part is `next dev` behavior, not a
code defect, and is excluded from this plan.

---

## Part 1 — DB structure findings

### 1.1 Duplicate FK constraints (28 pairs, 11 tables)

The DB has BOTH a push-generated (`*_fkey`) and a migration-generated (`*_fk`)
foreign-key constraint on the same column for 28 columns (appointments ×5,
audit_log ×4, custody_disputes ×6, approval_requests ×2, foster_proposals ×3, etc.).
Every write validates each FK twice. Fix: one migration dropping all `_fkey` duplicates.

### 1.2 Duplicate indexes (8)

True duplicates (same columns/predicate), each one doubling write amplification:
`public_*_deleted_idx` × 4 (superseded naming era), plus plain indexes fully covered by
unique constraints on foster_volunteers, libreta_share_tokens, organization_invitations,
organization_memberships. Fix: drop all 8.

### 1.3 Missing indexes on real query paths

| Index | Motivating query | Impact |
|---|---|---|
| `notifications (related_pet_id) WHERE related_pet_id IS NOT NULL` | events-repository.ts:300, events/actions.ts:1329 (lost-pet / disease dedup) | HIGH |
| `appointments (service_offering_id, status)` | org servicios/[offeringToken]/page.tsx:80 | HIGH |
| `welfare_reports (jurisdiction_province, jurisdiction_locality, status) WHERE status NOT IN (closed, invalid, duplicate)` | govt-dashboards.ts:905-953 (main gov welfare inbox) | HIGH |
| `welfare_reports (province, locality, created_at) WHERE status='open'` | overdue queue, govt-dashboards.ts:948 | MEDIUM |
| `cases (applicant_user_id)` | owner-dashboard.ts (adoption applications) | MEDIUM |
| `cases (welfare_report_id) WHERE NOT NULL` | decomiso.ts:677 | MEDIUM |
| `cases (custody_dispute_id) WHERE NOT NULL` | custody-disputes.ts:291,560,687 | MEDIUM |
| `approval_requests (target_organization_id) WHERE NOT NULL` | admin-proposals.ts:204 | MEDIUM |
| `appointments (pet_id, status, created_at)` — replaces `(pet_id, created_at)` | pet detail confirmed-turnos query | LOW-MED |
| `reminders (pet_id, reminder_type, due_at)` | medication/checkin lookups | LOW |

~35 other unindexed FKs are audit-only actor columns (decided_by, created_by…) with no
WHERE path — intentionally skipped, documented in the audit.

### 1.4 Already healthy

notifications (user-scoped), pet_events (pet_id+occurred_at + payload expression
indexes), audit_log, outbox, eno_queue, organization_memberships: fully covered.
pg_stat_statements is enabled and ready for production monitoring.

---

## Part 2 — Query-pattern findings (per page)

### HIGH severity

| Surface | Problem |
|---|---|
| `/notificaciones` (page.tsx:137) | **No `.limit()`** + join; an active user accumulates thousands of rows. Needs limit + keyset pagination. |
| `/gob/cola` via `lib/approval-scope.ts:109` | `fetchVisiblePendingRequests` unbounded; busy jurisdiction queue grows forever. Needs limit/cursor param. |
| `/admin/casos` via `listCasesForAdmin` (case-queries.ts:427) | 500-row cap, silent truncation, no pagination UI. Keyset pagination. |
| `/org/[token]/mascotas` (page.tsx:122-148) | **N+1**: 2 sequential queries per lost pet inside a for-loop. Single window-function query. |
| `fetchLostPets` (govt-dashboards.ts:336) | Fetches 500 rows then applies `q` text search + `since` window **in JS**. Push into SQL. |
| `fetchOpenWorkflows` (owner-dashboard.ts) | 10 parallel sub-queries on every /inicio render. Consolidate. |
| R1 profile churn (cross-cutting) | 4 profile shapes, 2-4 fetches/request. Canonical `getProfile` + `React.cache()`. |

### MEDIUM severity

- Pet detail waterfall (`mis-mascotas/[publicToken]/page.tsx:592-668`): 4+ independent
  queries sequential; `photo` and `editPhotoRow` are the **same query executed twice**
  (lines 592-601); `allCases` unbounded full-row select (needs 2 columns + limit);
  deceased branch issues N signed-URL calls (use batch `createSignedUrls`).
- `/gob` (page.tsx:102-113): pending + recentDecisions sequential before the KPI
  `Promise.all` — merge all seven.
- `getCaseDetailByPublicCode`: petEvents + caseEvents sub-queries unbounded.
- `fetchVaccinationHistory` / `fetchPetEventsForProfileV2`: unbounded, grow with pet age.
- `/admin/auditoria` (page.tsx:49-54): action/actor filters applied in JS after a
  200-row fetch — silent misses; push to SQL.
- `fetchPerdidasMetrics` re-runs `fetchLostPets` internally when the page already has the
  data — pass it in or `cache()`.
- `/mis-mascotas` list: full 68-column pet rows + full profile row for a role check.
  Projections.
- `/gob/casos` (300 cap), historiales (100-200 caps): pagination.

### LOW severity

`/org/agenda` rows+slots sequential; historial actor query sequential; `/gob/maltrato`
offset pagination → keyset eventually; `/refugios` 500 cap fine for org counts;
`fetchDiseaseSummary` may duplicate `fetchSurveillanceSignals` (cache()).

### Over-fetching (cross-cutting)

`db.select()` star-selects on wide tables in hot paths: pets (**68 columns**),
welfare_reports (35 — gob/admin detail pages bypass the org projection discipline),
profiles (29), cases (27). Fix: typed narrow projections for list/card reads.

---

## Part 3 — Fix plan (batches, each = one PR off develop)

| Batch | Theme | Contents | Est. effect |
|---|---|---|---|
| **PERF-1** | DB hygiene migration | 0095: drop 8 duplicate indexes + 28 duplicate `_fkey` constraints; create the 4 HIGH indexes (§1.3). 0096: MEDIUM indexes. Schema.ts alignment where needed. | Write amplification ↓; gov inbox & org servicios index-backed at scale. |
| **PERF-2** | Profile/auth churn (R1) | Canonical `getProfileForRequest()` with the union column shape, wrapped in `React.cache()`; migrate the 4 call-shapes; same for govt jurisdictions + org membership lookups. | −2 a −4 queries on EVERY authenticated page. Biggest uniform win. |
| **PERF-3** | Top-5 waterfalls (R2) | Pet detail (parallelize + dedupe photo query + batch signed URLs + projected `allCases`), /cuenta, /gob/maltrato, /org/agenda, /gob dashboard (single Promise.all). | The 400-590 ms tail collapses toward the 160 ms baseline. |
| **PERF-4** | Unbounded + JS-filter queries | /notificaciones limit, fetchVisiblePendingRequests limit param, fetchLostPets SQL filters, auditoría SQL filters, case-detail sub-query limits, vaccination/profile-v2 limits, org mascotas N+1 rewrite, fetchOpenWorkflows consolidation, fetchPerdidasMetrics reuse. | Removes every silent-degradation cliff before real data growth. |
| **PERF-5** | Pagination UX | Keyset pagination (cursor on created_at/id) + UI controls on: /notificaciones, /gob/cola, /admin/casos, /gob/casos, historiales, auditoría, outbox. Shared `usePagination` searchParam idiom. | Bounded render cost forever; UX for browsing history. |
| **PERF-6** | Projections | Narrow typed selects for pets/profiles/cases/welfare hot paths (list cards, role checks, gob detail pages). | Payload + serialization ↓ on the highest-traffic pages. |

Sequencing rationale: PERF-1 is pure DB (zero app risk) → PERF-2/3 attack the measured
root causes → PERF-4 closes growth cliffs → PERF-5/6 are the larger-surface refactors.

### Verification harness (every batch)

- `scripts/qa-timing.ts` against a `next start` build — before/after medians per route
  (the baseline numbers above are the reference; keep them in this doc).
- `pg_stat_statements` calls-per-page census must DROP for PERF-2/3.
- Full vitest + tsc/lint/tokens as always; fitness tests must stay green.
- EXPLAIN spot-checks for each new index against its motivating query.

### Explicitly out of scope

- dev-mode compile latency (next dev behavior).
- Supabase auth session-validation round-trips (~5/request, infrastructure).
- Caching layers (Redis/unstable_cache) — revisit after measuring post-PERF-3.
- The ~35 audit-only FK columns without indexes (documented skip).

---

## Baseline reference (2026-06-12, develop 9d809de, seeded local DB, next start)

Kept for before/after comparison — see the ranked table in Part 0 and the per-audience
tables in the audit transcripts. Re-measure with: `pnpm exec tsx scripts/qa-timing.ts`.
