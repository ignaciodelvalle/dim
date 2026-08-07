# Precomputed aggregate cube — design (road-to-10 infra #1)

Status: DESIGN ONLY (uncommitted). Branch `integration/all-20260703`. Author pass: exploration of the panorama module, lib/metrics, watermark, pg_cron precedent, RLS gate.

## Context — what exists today (the ground truth the cube must fit)

Panorama serves 13 layers through `getLayerFeatures` (`src/modules/panorama/application/get-layer-features.ts`), split by shape:

| Group | Layers | Window-sensitive? | k-anon | Notes |
|---|---|---|---|---|
| **Choropleth** (current-state) | cobertura, esterilizacion, microchip, ppp, mortalidad | **NO** — `asOf`/`period` are *ignored*; rate metrics fix their own `windows.trailing12m()` internally | dept-level yes (k=5), province no | 5 metrics × {province, locality} |
| **Aggregated points** | perdidas, mordeduras, denuncias, zoonosis, sintomas, reunificacion | **YES** — `since`/`asOf`/`basis` all apply | dept-level yes, province no | window+basis dimension |
| **Reference / real dots** | refugios, decomisos, points-mode dots | n/a | no | discrete identity — never aggregate |

Two existing cache layers already wrap this (both keyed by full authz scope, both cache only the post-k-anon envelope, both keep `withDbBudget` OUTSIDE so degraded results never persist):
- `load-layer-features-cached.ts` — Next Data Cache, 300s bucket == 300s revalidate, points-mode bypasses.
- `kpis-cache.ts` + `load-panorama-kpis.ts` — L1 per-lambda Map + L2 Data Cache, 60s, over a 17-statement fan-out.

Key mechanics the cube inherits or must respect:
- **Suppression is procedural, two-pass**: `suppressSmallCells` (k=5 on COUNT DISTINCT pets) → `complementarySuppress` (grouped by province; hides the next-smallest visible sibling when a province has exactly one suppressed cell, to defeat the differencing attack against the published U5 province total). Both are PURE (`lib/metrics/anonymity.ts`).
- **Department fold happens BEFORE k-anon**: `aggregateCellsToDepartment` folds per-locality rollups to INDEC department (barrio for CABA) so the k-anon unit matches the division polygon the map draws. This clears k=5 far more often than raw localities.
- **Additivity**: every rollup is `COUNT(DISTINCT pets.id)` (rate metrics) or `COUNT(DISTINCT events.id)`, and each pet/event has exactly one home (province, locality→department). So numerators AND denominators decompose additively across departments — a province total is the exact sum of its departments. This is the load-bearing property that makes an *unscoped, geographically-decomposed* cube sliceable per scope.
- **Rates need num/den, never the pct**: province rate metrics delegate to canonical fetchers (`fetchRabiesCoverageByProvince` etc.) that compute `sum(num)/sum(den)`. You cannot sum pcts. `reunification-rollups.ts` is the explicit precedent (suppress on the DENOMINATOR, carry num/den, not ratePct).
- **noLocality residual (WARNING 4)**: pets with a province but NULL locality are counted at province level and invisible at department level. Province totals include them; department rows do not.
- **Watermark**: `lastIngestAt(ctx)` = `MAX(pet_events.occurred_at)` scoped by pet home. The cube's build watermark should use `MAX(recorded_at)` (transaction time — "what the system knew when the cube was built").
- **pg_cron precedent**: migration `0136` runs a `SECURITY DEFINER` `search_path=''` function on a `* * * * *` schedule. pg_cron backends are DIRECT (not `application_name='Supavisor'`) so they are NOT reaped by 0136 and NOT subject to the transaction pooler's ignored `statement_timeout`.
- **Dual pool**: heavy analytics run on `analyticsDb` (session pooler, `ANALYTICS_DATABASE_URL`, honors `statement_timeout`). `db` is the transaction pooler for OLTP.
- **RLS gate**: `scripts/check-rls-coverage.ts` fails CI if any public table lacks RLS + a policy UNLESS it is in `DENY_ALL_ALLOWLIST` (service-role-only tables: `rate_limit_buckets`, `eno_processing_queue`, etc. — RLS ENABLED, zero policies, documented reason).
- **Flag pattern**: none exists yet in panorama (`process.env` unused there). New `CUBE_READS` env flag, default OFF; rollback = unset.

---

## Decision 1 — Storage shape

**Chosen: a single long table per grain, split into a PRIVATE build layer + a PUBLIC readable layer, plus a `cube_meta` singleton. v1 covers CHOROPLETH only.**

Three tables:

1. `panorama_cube_build` — RAW per-department num/den. **Never served to a request.** Holds sub-k values. Deny-all RLS.
2. `panorama_cube` — the READABLE k-anon'd surface. Two grains via `unit_level`. NEVER contains a sub-k value (suppressed rows carry `value = NULL`). Deny-all RLS (app reads via `analyticsDb`/Drizzle service-role, never PostgREST).
3. `panorama_cube_meta` — singleton: `built_at`, `watermark`, `status`, `row_count`, `duration_ms`.

`panorama_cube` long-table columns (matches the shape the task floated, adapted):

```
metric            text     -- 'rabies-coverage' | 'sterilization-coverage' | 'microchip-penetration' | 'ppp-compliance' | 'mortality'
unit_level        text     -- 'province' | 'department'
province          text     -- display name (join key for basemap + ISO map)
department_code   text     -- INDEC 5-digit | 'barrio:<name>' (CABA) | 'loc:<name>' fallback | NULL at province grain
department_name   text
centroid_lat/lng  numeric  -- department grain only (province uses basemap polygon)
value             numeric  -- department: k-anon'd numerator count (NULL if suppressed); province: ratePct (rate) or count (density)
den               integer  -- province grain, rate metrics only: denominator so the reader NEVER re-derives it; NULL elsewhere
suppressed        boolean  -- department grain only
complementary     boolean  -- department grain only (was it the secondary/differencing-defense suppression)
PRIMARY KEY (metric, unit_level, province, department_code)
```

**Why long table, not wide matview or per-layer tables:**
- The query pattern is always "give me every cell for (metric, level) within a scope" → a single indexed scan on `(metric, unit_level)` + a `province`/`department_code IN (...)` filter. A wide matview (one column per metric) fights the k-anon-per-cell model and can't carry a per-row `suppressed` flag. Per-metric tables multiply DDL and the refresh function for zero query benefit at this size.
- **Size is tiny**: ~530 INDEC departments + ~48 CABA barrios ≈ 580 department rows × 5 metrics ≈ 2 900, plus ~24 province rows × 5 ≈ 120. Under 3 100 readable rows total. No partitioning, no incremental refresh, no matview-CONCURRENTLY machinery needed.

**Why NO window/basis columns in v1:** choropleth layers are current-state — they ignore `asOf`/`period` entirely (confirmed in `get-layer-features.ts` cases `cobertura`/`mortalidad`/… and the rate metrics fix `trailing12m` internally). So the choropleth cube key is `(metric, level, geography)` with NO time dimension. This is why choropleth is the correct first slice: it sidesteps the entire custom-window/asOf fallback problem (Decision 4) — the cube serves choropleth for ANY period because the answer doesn't depend on the period.

**Why the build/readable split (answers Decision 3):** the readable surface must never contain a sub-k value, but the province total (published, U5) still needs suppressed departments' raw nums summed into it. Resolve by computing province totals AT BUILD from the private `panorama_cube_build` and writing them as province-grain readable rows. Department nums for suppressed cells stay ONLY in the private build table. A serving bug against `panorama_cube` can leak at most a NULL.

Rejected: **one wide matview** (can't express per-cell suppression / procedural complementary pass); **REFRESH MATERIALIZED VIEW CONCURRENTLY** (needs a unique index AND expresses only the mechanical GROUP BY — the two-pass suppression + province-residual reconciliation is procedural; see Decision 2).

---

## Decision 2 — Refresh

**Chosen: pg_cron every 15 min → a `SECURITY DEFINER` plpgsql function that FULL-rebuilds all three tables inside ONE transaction (DELETE + INSERT). No matview.**

Mechanics:
1. `panorama_refresh_cube()` runs as a direct pg_cron backend (not Supavisor → not reaped by 0136, honors `statement_timeout`).
2. It computes `w := max(recorded_at) from pet_events` (the build watermark) once at the top.
3. For each of the 5 metrics: build the department-grain num/den rollup (the SAME predicates as `metricPredicate()` + `rollupPetsPerLocality` + the `aggregateCellsToDepartment` fold, re-expressed in SQL), PLUS a per-province no-locality residual (num/den for province-set/locality-NULL pets — the WARNING-4 seam) so province totals match the canonical fetchers exactly.
4. Apply k-anon: `value = num` where `num >= 5`, else mark `suppressed`. Apply complementary suppression per province (a window-function pass: a province with exactly one suppressed department also suppresses its smallest visible department). Both fully in SQL.
5. Inside a single transaction: `DELETE FROM panorama_cube_build; INSERT …; DELETE FROM panorama_cube; INSERT department rows (value NULL where suppressed) + province rows (ratePct or count, from summed build nums including the residual); UPDATE panorama_cube_meta SET built_at=now(), watermark=w, status='ok', row_count=…, duration_ms=…`.
6. Postgres MVCC gives every reader a consistent snapshot — they see the ENTIRE old cube or the ENTIRE new one, never a half-swapped state. This is the atomicity `REFRESH … CONCURRENTLY` would have bought, without the unique-index/matview constraints, and it's the only way to express the procedural suppression.

**Full rebuild, not incremental**: <3 100 rows over 5 EXISTS-rollups. Not worth incremental bookkeeping.

**Cadence — pg_cron, not watermark-triggered**: pg_cron is the established precedent (0136) and current-state choropleth tolerates staleness well (day-granularity data). 15 min. Watermark-triggered (LISTEN/NOTIFY on ingest) is a follow-up optimization, not a one-night item.

**Honest degradation (answers "stale cube must be detectable"):**
- On any exception the function sets `status='error'` (or leaves the prior `built_at`/`watermark`) and does NOT swap — the last good cube survives.
- Reader computes staleness on every read: `now() - built_at > STALE_MAX` (propose 6h for current-state choropleth) OR `status != 'ok'` OR `live_watermark - cube.watermark > WATERMARK_LAG_MAX` → treat as stale → fall back to the LIVE query for that request (identical outcome to `CUBE_READS` off, per request). Never serve a cube known-stale beyond threshold.

**Refresh cost risk (micro instance):** each rollup is the same scan the uncached choropleth path measured at 3.6–10s; 5 metrics ≈ 20–40s per rebuild. Acceptable OFF the request path on a 15-min cron, but MUST be validated on staging before enabling cron (run `SELECT panorama_refresh_cube()` manually, read `duration_ms`, set `statement_timeout` generously e.g. 120s for this function only). See open questions.

---

## Decision 3 — Suppression at build

**Chosen: bake PRIMARY k-anon at the department grain into the readable surface (suppressed → `value NULL`); bake COMPLEMENTARY suppression per province at build; compute province totals from the PRIVATE build table so no sub-k value ever reaches the readable surface.**

- Readable `panorama_cube` department rows: `value = num if num>=5 else NULL`, with `suppressed`/`complementary` flags. **A sub-k count is never stored in the readable table.**
- Raw num/den live ONLY in `panorama_cube_build` (deny-all, service-role, off the request path).
- This directly satisfies the goal's "privacy leaves the hot path — a serving bug cannot leak an unsuppressed aggregate": the worst a mis-wired reader can do is emit a NULL.
- Parity guarantee: the build re-uses the EXACT metric predicates and the k=5 / complementary rules from `lib/metrics/anonymity.ts` (re-expressed in SQL), and the parity test (Decision "Parity") pins cube == live.

Rejected: store raw num in the readable table and suppress in the reader — that puts sub-k values on the hot path, defeating the entire point.

---

## Decision 4 — Reader integration (which loaders switch, what stays live)

**Chosen v1: cube serves the 5 CHOROPLETH layers for ADMIN actors only (national + province drill + locality drill). Everything else stays live.**

Reader is a new `load-layer-features-cube.ts` that produces the SAME `LayerFeaturesResult` envelope by reusing `buildChoroplethFeatures` / `buildProvinceChoroplethFeatures`. Picked per-request at the choropleth call sites, under the flag.

Eligibility gate (all must hold, else live):
- `process.env.CUBE_READS === '1'`.
- Layer ∈ {cobertura, esterilizacion, microchip, ppp, mortalidad}.
- Cube fresh (Decision 2 staleness check).
- **Actor is admin** (national, or `adminProvince`/`adminLocality` drill). Govt → live in v1.

**Why admin-only in v1 — the scope-subset differencing subtlety (important):**
The cube is stored UNSCOPED and decomposed to department, with suppression baked over the NATIONAL set. This is EXACTLY correct for any reader who sees a *complete* geographic slice:
- Admin national → sees all departments → national suppression is the correct suppression. ✅
- Admin province drill → sees all departments in province X; complementary is province-grouped and national → identical to a live scoped-to-X computation. ✅
- Admin locality drill → single department; primary k-anon on that one cell is scope-independent. ✅

It is NOT automatically correct for a PARTIAL slice: a govt scoped to a subset of a province's departments would see a province subtotal (sum of THEIR departments) that differs from the national province total, so the nationally-baked complementary suppression may leave a lone suppressed department differenceable within their subset. Whole-province govt is safe (complete slice); partial-locality govt is not. To keep v1 airtight and small, govt → live for now. **Whole-province govt is the immediate follow-up** (detect via assignment coverage), partial-province govt likely stays live permanently (or gets a per-scope build — out of scope here).

**Stays LIVE forever (never cubed):**
- Points-mode real coordinates (single-viewport, volatile, near-zero reuse — already cache-bypassed today).
- Custom windows + asOf scrub for the WINDOW-SENSITIVE point layers (can't enumerate; cube can't precompute). N/A for choropleth (no window dimension).
- Reference layers refugios/decomisos (discrete identity).
- Unit-history event lists + trend (`repository.ts` §F4) — per-unit event catalogues, not aggregates.

The existing `load-layer-features-cached.ts` Data Cache stays as-is BEHIND the cube: cube-eligible requests read the cube; everything else keeps the current cached-live path unchanged. The cube COMPOSES with the Data Cache — it does not replace it.

**Parity test plan:** a DB-backed script/vitest that, for each (metric ∈ 5) × (level ∈ {province, department}) over the seed, runs the cube reader AND the live `getLayerFeatures` for admin-national and admin-province-drill (Pampa flagship province), asserting identical cells: same `value`, `suppressed`, `complementary`, `centroid`, and identical `province` ratePct/count. PLUS a suppression-invariant test: `SELECT count(*) FROM panorama_cube WHERE unit_level='department' AND value IS NOT NULL AND value < 5` MUST be 0. Run post-refresh in staging QA.

---

## Decision 5 — KPI fan-out

**Chosen: OUT of scope for tonight. v1 = map choropleth cube only. A `kpi_cube` is the highest-value follow-up.**

Rationale: the KPI fan-out is 17 statements with num/den per metric, prior-window deltas, and trend sparklines — window-sensitive and a much larger surface than the current-state choropleths. It already has L1+L2 caching mitigating its cost. Cubing it needs its own window+delta modeling. One night buys a correct, airtight choropleth cube that proves the whole pattern (storage, refresh, suppression-at-build, reader flag, RLS, parity). Sequence the KPI cube next.

---

## Decision 6 — Migrations (forward-only DDL sketch)

One migration `NNNN_panorama_aggregate_cube.sql` (recount the next free integer at write time — do NOT hardcode). Sketch:

```sql
-- PART 1: private build layer (raw num/den; NEVER served)
create table public.panorama_cube_build (
  metric text not null,
  province text not null,
  department_code text not null,
  department_name text,
  centroid_lat numeric, centroid_lng numeric,
  num integer not null,
  den integer,              -- rate metrics only
  is_no_locality boolean not null default false,  -- WARNING-4 province residual bucket
  primary key (metric, province, department_code)
);
alter table public.panorama_cube_build enable row level security;  -- deny-all (no policy)

-- PART 2: readable k-anon'd surface (served via analyticsDb/service-role)
create table public.panorama_cube (
  metric text not null,
  unit_level text not null,        -- 'province' | 'department'
  province text not null,
  department_code text not null default '',  -- '' at province grain (keeps PK non-null)
  department_name text,
  centroid_lat numeric, centroid_lng numeric,
  value numeric,                   -- NULL when suppressed (department) 
  den integer,                     -- province rate rows only
  suppressed boolean not null default false,
  complementary boolean not null default false,
  primary key (metric, unit_level, province, department_code)
);
create index panorama_cube_lookup_idx on public.panorama_cube (metric, unit_level);
alter table public.panorama_cube enable row level security;  -- deny-all

-- PART 3: meta singleton
create table public.panorama_cube_meta (
  id integer primary key default 1 check (id = 1),
  built_at timestamptz,
  watermark timestamptz,
  status text not null default 'pending',
  row_count integer,
  duration_ms integer
);
insert into public.panorama_cube_meta (id) values (1) on conflict do nothing;
alter table public.panorama_cube_meta enable row level security;  -- deny-all

-- PART 4: refresh function (SECURITY DEFINER, search_path='') — see Decision 2.
create or replace function public.panorama_refresh_cube() returns void
language plpgsql security definer set search_path = '' as $$
declare w timestamptz; t0 timestamptz := clock_timestamp();
begin
  select max(recorded_at) into w from public.pet_events;
  -- per-metric: rebuild build rows (dept fold + no-locality residual),
  -- then k-anon + complementary, then write readable dept + province rows.
  -- (full body omitted from sketch — this is the implementation payload.)
  update public.panorama_cube_meta
    set built_at = now(), watermark = w, status = 'ok',
        row_count = (select count(*) from public.panorama_cube),
        duration_ms = (extract(epoch from clock_timestamp()-t0)*1000)::int
  where id = 1;
exception when others then
  update public.panorama_cube_meta set status = 'error' where id = 1;
  raise;  -- surfaces in cron logs; last-good cube untouched (no swap on error path)
end $$;
revoke all on function public.panorama_refresh_cube() from public;

-- PART 5: schedule (mirror 0136)
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule(jobid) from cron.job where jobname='panorama-refresh-cube';
exception when others then null; end $$;
select cron.schedule('panorama-refresh-cube', '*/15 * * * *', $$select public.panorama_refresh_cube()$$);
```

**RLS coverage gate:** add `panorama_cube_build`, `panorama_cube`, `panorama_cube_meta` to `DENY_ALL_ALLOWLIST` in `scripts/check-rls-coverage.ts`, each with a one-line reason ("Precomputed panorama aggregate; k-anon'd at build, read only via analyticsDb service-role. Deny-all to PostgREST is safe."). Without this the CI RLS gate fails.

**Staging-apply plan (Ignacio-gated):** writing the migration file is agent work; applying to the remote DB is PO-gated. Sequence: (1) apply migration, (2) run `SELECT panorama_refresh_cube()` manually once, read `panorama_cube_meta.duration_ms` + row_count, (3) run the parity + suppression-invariant tests against the freshly built cube, (4) only then enable the cron job (it's created disabled-safe by being idempotent; or comment PART 5 out of the first apply and add it in a follow-up once cost is confirmed).

**Rollback story:** `CUBE_READS` unset → readers use the live path; the cube tables just sit there refreshing harmlessly (or unschedule the cron). Dropping the tables is a separate forward-only migration if ever needed. No reader depends on the cube when the flag is off.

---

## Decision 7 — Risks

1. **Refresh cost on the micro instance** — 5 EXISTS-rollups ≈ 20–40s. Mitigate: off the request path, session-pooler/direct backend, per-function `statement_timeout`, MEASURE on staging before enabling cron. If too heavy, drop cadence to 30–60 min (current-state data tolerates it).
2. **Watermark race** — the build reads `max(recorded_at)` at the top and the rollups a moment later; a row inserted between is attributed to the NEXT refresh (watermark is a floor, not a fence). Acceptable — day-granularity data, 15-min cadence. The reader's staleness check catches a stuck cube.
3. **SQL/TS drift** — the refresh function re-expresses the metric predicates + fold + suppression that today live in Drizzle/TS. The parity test is the guard; it MUST run in staging QA after every schema/metric change. This is the single biggest correctness risk and the reason parity testing is non-negotiable.
4. **Province-total reconciliation** — province rate must include the no-locality residual or it diverges from the canonical fetchers. Modeled explicitly (`is_no_locality` bucket in build → summed into province rows).
5. **Scope-subset differencing** — handled by restricting v1 to complete slices (admin / — follow-up — whole-province govt). Documented in Decision 4.
6. **Staging RLS/permissions** — cube tables are deny-all + allowlisted (precedent: `rate_limit_buckets`, `eno_processing_queue`). App reads via `analyticsDb` (service-role, BYPASSRLS); PostgREST cannot read them. The refresh function is `SECURITY DEFINER` owned by postgres.

---

## Tonight's implementation slicing (work-unit commits)

1. **`feat(panorama): cube tables + RLS deny-all + meta`** — migration PARTS 1–3 + PART 5 schedule (cron optionally deferred), + 3 allowlist entries in `check-rls-coverage.ts`. `pnpm lint:rls` green.
2. **`feat(panorama): cube refresh function`** — migration PART 4 body: the 5 metric rollups + dept fold + no-locality residual + k-anon + complementary + province sums + meta write. The correctness payload.
3. **`feat(panorama): cube reader behind CUBE_READS`** — `load-layer-features-cube.ts`: admin-eligibility + staleness gate → reads `panorama_cube`, builds `LayerFeaturesResult` via existing `build-features` fns. Flag default OFF.
4. **`feat(panorama): wire cube reader at choropleth call sites`** — page + `[layer]/route.ts` pick cube-vs-live per request under the flag; live path untouched when off.
5. **`test(panorama): cube==live parity + sub-k invariant`** — parity over 5 metrics × 2 levels for admin national + Pampa province drill; assert no readable dept row has `value < 5`.

Commits 1–2 are the DB half (Ignacio-gated apply); 3–5 the app half (shippable with flag OFF — inert until the cube is applied + flag on).

---

## Open questions for the orchestrator

1. **Confirm admin-only v1?** (Defer whole-province govt to follow-up, keep partial-province govt on live.) Or is whole-province govt required for the funcionario-provincial demo path tonight?
2. **Refresh cadence + staleness threshold** — proposing `*/15 * * * *` and `STALE_MAX = 6h`. OK for current-state choropleth? And should cron be enabled in the FIRST apply or deferred until `duration_ms` is measured manually on staging?
3. **`den` per department in the private build layer** — a per-department registry/population denominator is a total, not a sensitive attribute (never published at department grain; only summed to province). Confirm it needs no k-anon in the build layer.
4. **SQL re-expression vs TS reuse** — the refresh function duplicates the metric-predicate logic in raw SQL (drift risk vs the Drizzle loaders). Accept, with the parity test as the guard? (Alternative — a Node refresh worker calling the existing loaders + writing the cube — trades the pg_cron-direct-backend advantage for zero drift. Not recommended for v1 but flag it.)
5. **KPI cube sequencing** — confirm it's the next change after this lands (highest follow-up value).
