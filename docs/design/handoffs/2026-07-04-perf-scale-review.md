## Ground truth

| | |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `4ef0617e` |

*(Command: `git -C C:/dev/dim branch --show-current && git rev-parse --short HEAD`)*

---

## What already scales (credit, not problems)

- **Pet-scoped event reads** use `(pet_id, occurred_at)` index — `db/schema.ts:1152` (`pet_events_pet_id_occurred_at_idx`).
- **Jurisdiction filters** on `pets` — `pets_jurisdiction_idx` at `db/schema.ts:694-697`.
- **Keyset pagination** on heavy operator streams: event ledger (`lib/metrics/event-ledger.ts:22-26`, `DEFAULT_LEDGER_LIMIT = 50`), `/admin/auditoria` (`app/admin/auditoria/page.tsx:12-57`), `/admin/outbox`, `/gob/cola`, `/gob/historial`, `/gob/maltrato` (offset + `PAGE_SIZE`).
- **k-anonymity** enforced in metrics/panorama (`lib/metrics/anomaly.ts`, `repository.ts:14-15`).
- **Panorama layer caps** — `PER_LAYER_CAP = 2000` (`src/modules/panorama/infrastructure/repository.ts:51-53`).
- **Public credential** mostly bounded queries (`app/(public)/p/[publicToken]/page.tsx:179-199` — `LIMIT 1` patterns).
- **Pet profile Face 1** optimized: `fetchPetEventsForProfileV2` replaced “fetch everything + sign all attachments” (`lib/analytics/owner-dashboard.ts:1497-1498`).
- **Request-scoped dedup** via `React.cache` (`lib/metrics/cache.ts:1-10`) — not cross-request.
- **maplibre / most recharts** behind `next/dynamic` wrappers (`components/charts/TimeSeriesChartDynamic.tsx:8-10`, `components/panorama/SituationalMapDynamic.tsx:13-14`); `next.config.ts:50` has `optimizePackageImports` for both.

---

## Prioritized punch-list

| Priority | Area | file:line | Query / pattern | Why it won't scale | Fix |
|---|---|---|---|---|---|
| **P0** | Pet profile — Libreta face | `src/modules/pets/application/tab-data/get-libreta-face-data.ts:86-102` | `SELECT * FROM pet_events WHERE pet_id = ? … ORDER BY occurred_at DESC` — **no LIMIT** | Long-lived pet → thousands of rows + full JSONB payloads per profile view; deferred fetch still runs on mount (`PetDetailTabsPanel.tsx:11-13`) | Paginate timeline (cursor / “load more”); server-side projection of display fields only; optional materialized libreta summary |
| **P0** | Tier-2 libreta share | `app/libreta/compartir/[shareToken]/page.tsx:106-111` | Full libreta filter, **no LIMIT** | Vet opening a share link pulls entire medical history into one RSC response | Same as above — cap + pagination; consider streaming PDF export instead of inline render |
| **P0** | Govt KPIs / home dashboard | `lib/analytics/govt-home-kpis.ts:147-155`, `app/gob/page.tsx:143-191` | Live `COUNT`/`COUNT DISTINCT` over `pets` + `pet_events` (12m window) on **every** `/gob` render | Province = millions of pets × events; 14 parallel live aggregations per page load | Pre-aggregated rollups (nightly cron → `metric_rollups` table or matview); cross-request cache (`unstable_cache` + tag invalidation) |
| **P0** | Panorama choropleth / KPI parity | `lib/analytics/govt-home-kpis.ts:234-253`, `src/modules/panorama/infrastructure/repository.ts:837-847` | `GROUP BY jurisdiction_province` over full `pets` + join `pet_events` — **no pre-aggregation** | National 24-jurisdiction render re-scans event history; temporal `asOf` adds `lte(occurred_at, asOf)` but still live (`repository.ts:169`, `app/api/panorama/[layer]/route.ts:61-64`) | Same rollup table; index `(event_type, occurred_at)` + payload GIN only helps partially — pre-aggregate is the real fix |
| **P0** | Missing analytics index | `db/schema.ts:1153` vs `lib/analytics/govt-home-kpis.ts:218-221` | Queries filter `event_type = 'vaccination_administered'` **and** `occurred_at >= since12m`; only `pet_events_event_type_idx` on `event_type` alone (`rg` on migrations — no `(event_type, occurred_at)` composite) | Province-wide scans hit millions of vaccination rows; planner may bitmap-and weak indexes | **DB migration**: `CREATE INDEX … ON pet_events (event_type, occurred_at DESC)` (and consider partial indexes per hot types) |
| **P1** | Signed URL fan-out | `get-libreta-face-data.ts:152-164` | `Promise.all(attachmentRows.map(async … createSignedUrl))` | Not N+1 SQL, but **O(attachments)** Storage API calls per libreta load | Batch signing helper or lazy sign on expand; cap attachments fetched |
| **P1** | Admin `/govts` roster | `app/admin/govts/page.tsx:76-89`, `201-205` | `LIMIT 50+1` with truncate message — **no cursor / next page** | QA smoke correct at seed scale; at province operator count, first 50 is a wall with no navigation | Keyset pagination (same pattern as `auditoria/page.tsx:10-75`) |
| **P1** | Admin/gob `/usuarios` | `lib/infra/admin-search.ts:50-52`, `125`; `app/gob/usuarios/page.tsx:49-145` | Default listing `DEFAULT_LIST_LIMIT = 50`, search `SEARCH_LIMIT = 25`; **all rows rendered** in `BulkRevokeList` | Empty search = “first 50 users” with no pages; province user base unusable for browse | Server pagination + virtualized list; never render 50 full cards without `?q=` |
| **P1** | Auth email map on admin pages | `lib/supabase/admin.ts:36-66`; `app/admin/govts/page.tsx:44` | `buildAuthEmailMap` pages up to **50 × 200 = 10,000** auth users per `/admin/govts` load | Linear Supabase Admin API fan-out on every roster render | Lookup email only for displayed rows; cache map with TTL |
| **P1** | PPP re-eval cron | `lib/infra/business-rules-reeval.ts:82-95`, `126-134`; `app/api/cron/business-rules-reeval/route.ts:66-72` | Unbounded `SELECT … FROM pets WHERE …` per jurisdiction scope; **sequential `for (const pet)` with `await`** | Province AR scan = all dogs with breed/weight; single cron pass can exceed 60s | Keyset batches + time budget (like `reconcile-pet-status`); parallel workers; narrow with index on `(jurisdiction_province, species, potentially_dangerous_breed)` |
| **P1** | Drift-reconcile cron | `lib/infra/rederive-pet-cache.ts:137-147`; `app/api/cron/reconcile-pet-status/route.ts:54-59` | Per pet: load **all** `pet_events` ordered ASC; max **2000 pets/run** | Full province drift check needs ~millions of pet-day passes; 2000/night = years to full scan | Incremental cursor persisted in `cron_runs`; sample-based drift; or projection table maintained on write |
| **P1** | Org check-ins bootstrap | `app/org/[orgToken]/checkins/page.tsx:58-66` | `SELECT pet_id FROM pet_events WHERE event_type='adoption_finalized' AND payload->>'previous_owner_organization_id'=…` — **no LIMIT** | High-volume shelter: unbounded scan before the capped follow-ups (`limit 30` at `:103`) | Index on expression or denormalized `adopted_from_org_id`; paginate pet ID discovery |
| **P1** | Admin observaciones queue | `app/admin/observaciones/page.tsx:98`, `119-129` | Pets capped at **500**, then unbounded `pet_events` for `rabies_observation_started` via `inArray(petIds)` | 500 pets × multiple started events; no pagination on queue itself | Keyset pagination on pets; lateral join for latest started event only |
| **P1** | Admin moderación | `app/admin/moderacion/page.tsx:69-74` | `LIMIT 500`, no pages | Spam wave fills 500 and hides rest | Keyset pagination |
| **P1** | Dashboard aggregate recompute | `lib/metrics/cache.ts:7-10` | Explicit: cross-request caching **out of scope**; only `React.cache` per request | Every govt/admin dashboard hit = full SQL re-aggregation | Matviews / rollup tables + `unstable_cache(revalidate: 3600)` |
| **P1** | Alert evaluation cron | `src/modules/alerts/application/firings/record-firings.ts:63-76` | Loop all alert subscription owners; each calls `evaluateAlertSubscriptions` (KPI re-fetch) | Subscription count × full metric queries nightly | Cache metric values per jurisdiction window; evaluate from rollups |
| **P2** | Profile typed events (Face 1) | `lib/analytics/owner-dashboard.ts:1503-1520` | Whitelist filter, **intentionally uncapped** | 10+ year pet with heavy med history → large typed stream | Acceptable short-term; add monitoring; cap with “replay from checkpoint” if >500 |
| **P2** | Weight sparkline | `lib/analytics/owner-dashboard.ts:1377-1397` | 12m window but includes all `event_amended` rows unbounded | Amend-heavy pet pulls extra rows | Filter amendments to weight targets only in SQL |
| **P2** | Owner nudges (`/inicio`) | `lib/infra/owner-nudges.ts:306-325` | All nudge event types for all owner pets — **no LIMIT** | Owner with many pets OK; query grows with pets × events | Already batched (not per-pet loop); cap or window events |
| **P2** | `/gob` preview queue | `app/gob/page.tsx:159-160` | `fetchVisiblePendingRequests(…, { limit: 200 })` | Preview OK; not a full list surface | — |
| **P2** | `/admin/admins` | `app/admin/admins/page.tsx:15-24` | Unpaginated admin roster | Low cardinality ( handful of admins ) | Watch only |
| **P2 — bundle** | **recharts in shared operator chunk** | `components/ui/dashboard/OpKpi.tsx:5` | Static `import { Area, AreaChart, ResponsiveContainer } from "recharts"` | `/gob` home imports `OpKpi` directly (`app/gob/page.tsx:18`) — recharts in operator first-load even when sparkline unused | Split `OpKpiSparkline` into dynamic child; keep tile shell lean |
| **P2 — bundle** | **recharts not dynamic on 2 routes** | `app/gob/analytics/_components/AcquisitionChart.tsx:10`; `app/gob/vigilancia/zoonosis/page.tsx:1` | Static `TimeSeriesChart` import | Pulls recharts into those route chunks despite `TimeSeriesChartDynamic` elsewhere | Switch to `TimeSeriesChartDynamic` |
| **P2 — bundle** | **maplibre CSS** | `components/maps/StaticFirstMap.tsx:39` | Static `import "maplibre-gl/dist/maplibre-gl.css"` | Lost-pet profile loads CSS on first paint; JS still dynamic (`:80`) | Acceptable for lost-only path; ensure not in `/inicio` or credential first paint |
| **P2 — bundle** | **maplibre JS** | `components/charts/MapChoropleth.tsx:278`, `components/panorama/SituationalMap.tsx:243` | `import("maplibre-gl").then(...)` inside mount | Correct pattern — not in shared owner chunk | Keep; extend to any new map surfaces |
| **P2** | Cold start — pdf-lib | `lib/analytics/welfare-exports.ts:17`, `ppp-exports.ts:21` | Static pdf-lib on export paths only | Heavy but not first-load | Lazy-import inside export actions (already partially noted in welfare MPF path) |

**Status key:** CONFIRMED = traced in source; SUSPECTED = inferred from index/planner gap without EXPLAIN at 2k seed.

---

## TOP 5 scale risks before a province tenant

1. **Unbounded libreta event loads** (`get-libreta-face-data.ts:86-102`, share page `:106-111`) — single-pet timeline becomes multi-MB at 10+ years of events. **Fix:** code pagination + payload projection; optional rollup table. **Migration:** none for pagination itself.

2. **Live province-wide KPI/dashboard SQL** (`govt-home-kpis.ts:147-155`, `govt/page.tsx:143-191`, panorama `:234-253`) — every operator page re-counts millions of rows. **Fix:** pre-aggregated rollups + cache. **Migration:** yes — rollup/matview tables + refresh job.

3. **Missing `(event_type, occurred_at)` index for analytics scans** (`schema.ts:1153` vs `govt-home-kpis.ts:218-221`) — jurisdiction dashboards filter by type + time without pet_id. **Fix:** composite/partial indexes. **Migration:** yes.

4. **Operator lists without real pagination** (`admin/govts/page.tsx:76-89`, `admin-search.ts:50-52`, `moderacion/page.tsx:69-74`) — seed hides it; province operator/user rosters break. **Fix:** keyset pagination everywhere lists render rows. **Code-only.**

5. **Cron sweeps that replay full pet history** (`rederive-pet-cache.ts:137-147`, `business-rules-reeval.ts:82-95`) — 60s Vercel budget × millions of pets. **Fix:** batched keyset + persisted cursor + incremental projections. **Migration:** optional cursor/rollup tables; indexes on cron predicates help.

---

## Bundle-reduction task (capstone dimension) — summary

| Asset | Status | Evidence |
|---|---|---|
| **maplibre-gl JS** | Mostly OK | Dynamic in `MapChoropleth.tsx:278`, `SituationalMap.tsx:243`, `SituationalMapDynamic.tsx:13-14`; `StaticFirstMap.tsx:80` on user tap |
| **maplibre CSS** | Watch | Static in `StaticFirstMap.tsx:39` (lost-profile path only) |
| **recharts (charts)** | Mostly OK | `TimeSeriesChartDynamic.tsx`, `ForecastChartDynamic`, `StackedTimeSeriesChartDynamic` on main gob/admin dashboards |
| **recharts (leaks)** | **Fix needed** | Static in `OpKpi.tsx:5` (used on `/gob` first paint); `AcquisitionChart.tsx:10`; `vigilancia/zoonosis/page.tsx:1` |
| **Tree-shaking aid** | Present | `next.config.ts:50` — `optimizePackageImports: ["recharts", "maplibre-gl"]` |

**Recommended bundle work (code-only):** dynamic-import sparkline fragment out of `OpKpi`; replace the two static `TimeSeriesChart` call sites; verify with `@next/bundle-analyzer` that owner `/mis-mascotas/[token]` and public `/p/[token]` chunks exclude maplibre/recharts (they should today, except lost → `StaticFirstMap`).

---

## QA smoke note (auditoria / govts / usuarios)

Your smoke observation is **partially stale vs HEAD**:

- **`/admin/auditoria`** — CONFIRMED paginated: keyset limit 200 (`app/admin/auditoria/page.tsx:12-57`). ~150 rows = one page, not unbounded.
- **`/admin/govts`** — CONFIRMED capped at 50 with truncate copy (`:17-19`, `:89`, `:201-205`) but **no next-page links** — degrades at scale, doesn’t load all rows.
- **`/admin/usuarios`** — CONFIRMED capped at 50 default / 25 search (`lib/infra/admin-search.ts:50-52`) — same “first page only” pattern, not full-table scan.
