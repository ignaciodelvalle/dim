# Viz Suite — 8 visualizations the event-sourcing architecture gives for free

> Standalone deliverable, PO-approved 2026-07-11. Grounded against `integration/all-20260703`
> by two deep explorations (temporal/chart infra + transitions/amendments/durations); all
> anchors verified at write time — spot-check at execution. **Execution: post-backlog** — after
> #21 (v2C console) and #24 phase 1 (viz switcher) land; every method mounts on the switcher /
> dock / existing pages. **Zero new pages.**

## Context

Because events are append-only with dual timestamps (`occurredAt` valid-time + `recordedAt`
transaction-time) and every view is a pure projection `(events, filters) → view`, any
visualization that is "a function of the past" is one more projection — no data-model changes.
Two explorations audited exactly HOW free each method is. This plan sequences all 8 in
reuse-density order, adds only 5 shared enablers, and bakes the privacy gates in up front.

## The "regalado" audit (what exists vs what's missing)

| Method | Truly free (verified) | Missing piece |
|---|---|---|
| Delta choropleth | `divergentStops(target,min,max)` is generic value-vs-anchor → `divergentStops(0,minΔ,maxΔ)` renders signed deltas AS-IS (`lib/analytics/viz-scales.ts:199`); `MapChoropleth scaleMode="divergent"` plumbs through; prior-window pattern proven at KPI grain (`get-panorama-kpis.ts:317` `priorWindowOf`+`deltaOf`) | Per-CELL two-window pipeline; `suppressDelta` privacy rule; coverage/stock metrics have NO window params (always-now) → deltas start with EVENT-windowed metrics only |
| Reporting lag | Bitemporal basis wired end-to-end for event layers (`eventWindowCol(basis)`, `src/modules/panorama/infrastructure/repository.ts:2286`; both timestamps NOT NULL on pet_events) | Per-unit lag aggregate = new simple query; ⚠️ NO index on `recordedAt` → forward-only index migration (apply Ignacio-gated) |
| As-of (event layers) | ~Shipped: 9 event loaders take `asOf` (`lte(tcol,asOf)`); `asOf`+`basis` already URL params (`PanoramaConsole.tsx:~1063`) | Promote to a first-class mode ("Situación al DD/MM"). As-of for STOCK metrics (coverage) = the one heavy item — staged last, design-doc-first |
| Calendar heatmap | Data contract exact: `loadScopeDailyCounts` → `{date,count}[]`, basis-aware (`repository.ts:2264`) | Small new grid-of-day-cells component; copy TimeSeriesChart's a11y `<details>` table |
| What-changed feed | Event-ledger keyset pattern (`lib/metrics/event-ledger.ts`) + alert-inbox date-range pattern | Per-user watermark does NOT exist (verified) → new small column/table |
| Flows/Sankey | Custody chain readable from `ownerships.startedAt/endedAt` (state machine, no replay); rabies obs = the clean FK-pair join template (`surveillance-metrics.ts:227`); adoption 3-hop join possible (`application_event_id` + `adopted_from_application_id`) | Sankey render (recharts Sankey — already a dep — or small SVG); the 3-hop cohort join (today's funnels are honest independent-window counts, `adoption-funnel.ts:68`); lost→sighting NOT a pet_event → node limited to lost→recovered |
| Corrections lens | `event_amended` payload: target_event_id + changes[] + actor_role; partial index (mig 0118); `overlayAmendments` + SQL twin; ledger drill-down UI exists | Aggregate by jurisdiction/period/target-type = new straightforward self-join; scope = the 9 AMENDABLE types (`lib/infra/amendment.ts:28-41`) |
| Cohort/time-to-event | `percentile_cont` shipped (`lib/metrics/custody.ts fetchTimeInState`); reunification `medianDaysToRecovery` exists | Expose `type="stepAfter"` on TimeSeriesChart (one prop); the 3-hop join above |

## Placement map (where each lives · purpose · page context)

| Method | Visible at | Purpose | Page context |
|---|---|---|---|
| Delta choropleth | Panorama — viz-switcher mode | "¿DÓNDE empeoró/mejoró?" (map catches up to the KPI chips' deltas) | Legend flips to "vs período anterior"; prior window derived from the active period pill |
| Reporting lag | Panorama — switcher mode + ranking in dock Estadísticas | Which jurisdiction reports late; data-timeliness oversight | Per-unit `median(recordedAt−occurredAt)`; admin national, gob their scope |
| As-of | Panorama — first-class mode, deep-linkable/saveable | Audit & accountability: "what did the system know when X was decided" (Mi Argentina argument) | Masthead shows the as-of date prominently — must never pass as present; basis selectable |
| Calendar heatmap | Panorama — pane in dock Estadísticas (GitHub-style year grid) | Seasonality at a glance (summer bites, post-fireworks losses) | Respects scope+layer+basis; day-cell click filters the map to that day |
| Novedades | **/gob + /admin operator HOME** (not panorama) | Session-start orientation: "esto cambió en tu jurisdicción desde el martes" (sibling of #14 onboarding) | Compact ledger-style feed, per-item "ver en su cola" link; per-user watermark |
| Flows/Sankey | `/admin/inteligencia` + `/gob/analytics`; later per-shelter variant in the org panel | Where the pipeline stalls (intake→tránsito→adopción; casos) | New section on existing analysis pages; a flow diagram, not a map |
| Corrections lens | `/admin/libro` — aggregates header + mini-dashboard above the existing ledger; geo via MapChoropleth same page | Data-quality governance: % amended by jurisdiction/type/period, time-to-correction | ADMIN-ONLY initially (ledger already admin; chain drill-down exists) |
| Cohort/time-to-event | `/gob/analytics` + `/admin/inteligencia`; later median KPI on shelter panel | "¿Mejoramos el tiempo de reunificación?" — true followed cohorts replace independent-window funnels | Alongside existing trend charts; stepAfter TimeSeriesChart family |

## Waves

### Wave 0 — shared enablers (S; do once, everything reuses)
1. **`suppressDelta` in `lib/metrics/anonymity.ts`** — a delta cell is suppressed if EITHER
   window's count is suppressed (k<5); same complementary pass. Differencing rule: never let Δ
   reveal a hidden cell. THE privacy cornerstone; test-pinned before any delta render.
2. **`joinEventPairs(startType, endType, backRefField)`** — generalize the rabies FK-pair join.
   Convention: FK back-reference joins ONLY (never nearest-next-transition — fragile to
   interleaved status changes).
3. **`recordedAt` index migration** — composite `(event_type, recorded_at)`, forward-only,
   recount NNNN at write time; remote apply Ignacio-gated.
4. **`type="stepAfter"` prop on TimeSeriesChart.**
5. **Param naming** aligns with the v2C deep-link contract (post-#21 param surface);
   saved-views capture new params for free (raw-URL persistence, `saved-views.ts:21`).

### Wave 1 — renders of existing data (XS-S each)
- **CalendarHeatmap** component (day-cell grid, es-AR labels, a11y table) over
  `loadScopeDailyCounts`; mounts in the dock + as a switcher mode; basis-aware for free.
- **Novedades feed**: new watermark + ledger keyset query `recordedAt > watermark` (uses the
  Wave-0 index); read-time reconcile discipline — never mutate the log.

### Wave 2 — comparison engine (M)
- **Period-delta choropleth** for event-windowed metrics (denuncias/mordeduras/perdidas/
  sintomas/zoonosis): run the existing choropleth loader twice (current + `priorWindowOf`),
  diff per cell, `suppressDelta`, render via `divergentStops(0,…)`. Legend "vs período
  anterior" + methodNote. Cube stays out initially (single-snapshot by design) — a cube period
  dimension is a later optimization ONLY if measured live latency demands it (db-budget applies).

### Wave 3 — bitemporal exclusives (M) — what nobody without event sourcing can copy
- **Reporting-lag map**: per-unit median lag for reportable types → sequential choropleth +
  ranking variant. Locality grain: fold-to-department + suppress on the event-count DENOMINATOR
  (the `reunification-rollups.ts:17` pattern), never on the derived lag.
- **As-of mode (event layers)**: promote existing plumbing to a first-class mode with honest
  framing copy. Mostly UI.
- **As-of for stock metrics**: FLAGGED L — event-reconstructed aggregate state at T; ship the
  suite without it; design doc first if wanted.

### Wave 4 — new structure that earns its place (L)
- **True adoption cohorts + time-to-event curves** (3-hop join via Wave-0 helper →
  `medianDaysToAdoption`, stepAfter curves, cohort-by-intake-month).
- **Custody/case Sankey**: national/province grain FIRST; nodes from `ownerships` transitions +
  case status; recharts Sankey or small SVG. Sub-province flows = new suppression surface —
  only with the Wave-0 rules.
- **Corrections lens**: amendment aggregates (count/rate × jurisdiction × target-type × period;
  time-to-correction via pair join) + admin dashboard section; MapChoropleth for the geo view.

## Privacy gates (non-negotiable)
- Locality grain in Waves 2/3: `suppressDelta` + fold-to-department + suppress-on-denominator.
- Flows: province+ grain default; sub-province needs explicit suppression design.
- Corrections lens: amendment COUNTS only — never render old/new payload values in aggregates
  (changes[] stays drill-down-only behind admin ledger authz).
- Public exposure of ANY of these fires the KA1/KA2 reopen trigger
  (`docs/architecture/privacy-known-limitations.md`) — the suite is operator-gated until that
  fix lands.
- Every new viz carries the methodNote/k-anon disclosure idiom (DashboardTooltip pattern).

## Verification contract (per wave)
Suppression rules test-pinned FIRST (`suppressDelta` before any delta render); pair-join helper
tests; watermark semantics; stepAfter render. `pnpm verify` + panorama/analytics suites green.
Playwright walk of each new mode as admin + `lucas@dim.test` (drill, suppression visible, es-AR
copy, no console errors), screenshot per mode. Fix-gate: mechanical auto-fix; judgment (mode
naming, Sankey node taxonomy, watermark UX) → PO.

## Sequencing
After #21 + #24 phase 1. Waves independently shippable, order 0→1→2→3→4. Work-unit commits,
single-PR w/ `size:exception` per project default; per-wave split remains possible. On execution
start: create per-wave tasks chained to #24.
