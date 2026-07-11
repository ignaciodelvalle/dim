# Panorama v2 — fixed-console redesign + QA fixes

> Standalone deliverable. Grounded against branch `integration/all-20260703`.
> Sources: (1) **PO-annotated screenshot** (`C:\Users\ignac\OneDrive\Pictures\miMAR\evidence\Cordoba.jpg`,
> Córdoba drill on `/admin/panorama`) — the layout authority; (2) Cowork's adversarial QA closure
> (`docs/reviews/2026-07-11-cowork-panorama-adversarial-qa.md`, verified live against `53df8c22`);
> (3) an earlier Cowork QA pass (findings folded in below). Line numbers are anchors —
> **spot-check at execution time**.

## Context

The situational map shipped its v1 overhaul. Two QA passes (one exploratory, one adversarial
with 3 accounts + 2 code agents) confirmed the security spine is airtight — jurisdictional fence
held 3 forced-leak attempts, k-anon display suppression is hermetic across all 5 render paths —
but surfaced (a) a layout that wastes the map, and (b) a prioritized fix-list. The PO then
ratified a **fixed-console redesign** via an annotated screenshot. This doc is the single
execution plan for both.

---

## Part A — PO layout direction (ratified 2026-07-11 via annotated screenshot)

**The pattern: viewport-locked GIS console.** The panorama page becomes `100dvh`, no page
scroll — the map is fixed like the AppShell sidebar and fills everything except slim bars.
Current layout to replace: 2-col grid with fixed 342px right rail + `h-[76vh]` map
(`PanoramaConsole.tsx:~3063,3076`).

1. **Map dominant & fixed.** Map fills the viewport minus a slim top strip (preset tabs + KPI
   chips + single-line filters). The 342px right rail is **eliminated**; its contents relocate
   (below). Circles/graduated symbols must be readable at working zoom — that's the point.
2. **Legend → single-line overlay.** "Eventos por unidad" becomes one horizontal strip overlaid
   bottom-left on the canvas: `● 1 ● 5 ● 10 ● 12 · ⊘ Datos insuficientes (privacidad)`. Same
   treatment for classed/META swatch legends (compact strip, expandable on hover/click for the
   full reading). Replaces the rail-docked `MapLegends` placement (`MapLegends.tsx:~157`).
3. **Geographic scope → implicit on the map.** Remove the Provincia/Localidad `<select>`s from
   the rail. Drill (click) + the masthead breadcrumb pill IS the scope. **Keep an accessible
   non-pointer path**: the breadcrumb pill ("Córdoba") becomes clickable → opens the existing
   `JurisdictionSwitcher` as a dropdown. Do NOT ship a pointer-only scope selection.
4. **Date filter → single line + "ver más".** `7d · 30d · 90d · 12m · ▾ más` (año en curso /
   3 años / 5 años / personalizado behind "más"). Replaces the two-row pill grid in the rail.
5. **KPIs stay, actually visible.** Slim always-visible chip row (top strip), filter-reactive,
   each chip linking to its filtered view (same KPI→filtered-surface principle as the govt
   inspector campaign).
6. **Bottom dock with tabs: `Registros | Estadísticas | Línea de tiempo`.** A collapsible,
   drag/click-expandable panel docked to the map's bottom edge (DevTools-style):
   - **Collapsed (THE DEFAULT — PO re-ratified 2026-07-11: "MÁS MAPA, la lista es opcional")**:
     a 37px bar with live counts ("Registros 267"). The map owns everything above it.
   - **Expanded** (opt-in only): ~38% of viewport, map stays live above; collapses back anytime.
   - Reference mockup: `docs/design/handoffs/2026-07-11-panorama-v2-mockup.html` (v2,
     PO-validated layout — annotations toggleable for the design handoff).
   - **Registros**: a GOOD record list for the current scope+period+layers (the "bandeja" the
     map never had). **Inventory verdict (2026-07-11): don't build a new primitive — promote
     what exists.** `components/panorama/MapDataTable.tsx` (multi-layer per-unit values, sticky
     header, CSV export, k-anon "Protegido (k<5)" cells — today a rail toggle at
     `PanoramaConsole.tsx:~3138`) is the Registros seed. For case-shaped rows later,
     `components/ui/dashboard/CaseQueue.tsx` is the mature record-table pattern (real table,
     keyset cursor owned by caller, filter chips) — copy its idiom, not the component (its row
     type is case-domain-specific).
   - **Estadísticas**: list-mode aggregates. Seed: `components/panorama/PanoramaDataTable.tsx`
     (ranked units, client-sortable with `aria-sort`, "Ver tabla completa" — today behind a rail
     toggle at `PanoramaConsole.tsx:~3281`) + `RankedUnitsPanel.tsx` (worst-N, hover-synced with
     the map, opens DetailDrawer — `:~3261`). Promote into the dock tab; keep the map hover-sync.
   - **Side review from the inventory (PO's "de paso revisamos eso")**: no shared Table
     primitive exists — all tables hand-roll the same idiom (table + sr-only caption +
     `th scope="col"` + OpPill). `app/admin/inteligencia/page.tsx` copy-pastes near-identical
     table markup 3× inline (`:~238,328,411`) and `RegionRankingTable` duplicates the same
     rank/name/bar shape — extraction candidates for a later `RankingTable<T>`, NOT blocking
     this work.
   - **Línea de tiempo**: the TimeScrubber + histogram MOVES here as an opt-in tab (PO crossed
     out the always-on block; this fulfills the earlier "timeline as optional layer" ask). Its
     internal controls (loop window / basis / Simple-Detalle) come along as the tab's config.
7. **Small-screen behavior**: below `lg`, dock defaults collapsed; legend strip wraps; the top
   strip scrolls horizontally rather than stacking tall.

**Also folded into Part A** (previous QA pass, still valid):
- **CABA inset gating (BUG)**: `insetVisible` keys on zoom (`insetZoom < Z_DIVISIONS 6.5`,
  `SituationalMap.tsx:~2876`), not on CABA-in-viewport → panning south at regional zoom still
  shows the inset. Gate on CABA-in-viewport / national scope. Plus the national "see everything"
  view keeps CABA enlarged (AMBA magnifier) — only there, never when drilled elsewhere.
- **Heatmap / viz differentiation — OPEN FORK (PO decides before building)**: (a) real density
  heatmap layer, (b) discoverable viz-mode switcher over the existing encodings (sequential /
  divergent META / bivariate 3×3 / graduated), or (c) both.

---

## Part B — Cowork adversarial QA fix-list (verified against `53df8c22`)

Full report: `docs/reviews/2026-07-11-cowork-panorama-adversarial-qa.md`. Verdict: fence
airtight, k-anon display hermetic, H2 refuted live on both paths. Fixes by priority:

1. **MAP-1 / H1 — dead quantile branch (HIGH, effectiveness).** The classed scale always falls
   to equal-interval because the fill always passes a non-null `lockedDomain`
   (`resolveScrubDomain({live:…})` → the quantile branch never fires, `class-scale.ts:~100`).
   Live-confirmed: Río Negro dept breaks 48/89/131/172 (equal steps). In skewed provinces the
   choropleth flattens — the central promise of the rewrite, half-delivered. Fix: make quantile
   actually fire for sequential layers (or honestly document equal-interval and fix docstrings —
   but prefer the real fix).
2. **MAP-2 + M2 — Back-button desync (MED, correctness).** `popstate` reverts `preset`/`layers`
   in the URL but the view doesn't re-derive: tab/legend/bubbles/KPIs stay on the previous
   preset (scope DOES resync). Same stale-`useSearchParams` root as the scrubber's aggregate
   histogram ignoring the drilled scope (`PanoramaConsole.tsx:~1997`). Fix both at the root:
   re-derive preset/layers/histogram-scope from the URL on popstate.
3. **Cube national-scale refresh (HIGH latent, operational — blocks `CUBE_READS`).** The heavy
   builder reads run on the `analyticsDb` pool whose `statement_timeout` bakes to 15s at
   module-load; the 120s timeout sits on the WRITE client. A BA dept read (~96s measured) →
   `57014` at 15s → the atomic build txn fails whole → deterministic retry fails → `status='error'`
   → reader falls to live for everything. Raising the env project-wide reopens the death-spiral
   the 15s backstop prevents. Fix: a **dedicated analytics-read handle** (session-pooler, like
   the write client) with a long timeout **only for builder reads**. Do this BEFORE enabling
   `CUBE_READS` at national scale. Related: **CB1** — cube reader hardcodes `truncated:false`
   (BA drill would break live-vs-cube parity + false completeness claim).
4. **KA1/KA2 — differencing residual (PRIVACY, PO decision pending).** `complementarySuppress`
   promotes exactly 1 sibling and doesn't widen to a feasible-interval ≥k (`anonymity.ts:~107-138`),
   while province density publishes RAW (`repository.ts:~940-962`) → `{A:1,B:5}` recoverable via
   the provincial density marginal. Also KA4 (narrow scrubber window on `mortalidad` can expose
   an individual death's date + disposition under a ≥5 cell). **Needs a PO ruling** — fix
   (interval-widening + k-anon the density marginal) vs. accept-and-document.
5. **Polish batch (LOW):**
   - MAP-3: count-vs-rate encoding on drill (province fill = rate, drilled fill = counts, KPI
     stays rate) — at minimum label the legend explicitly.
   - MAP-5: deep-link `level=locality` at national scale → empty map until toggling to
     Provincias (KPIs load fine).
   - M1: CABA inset uses the old continuous ramp on *sequential* layers
     (`SituationalMap.tsx:~2859-2867`) — mismatches the classed main fill.
   - Copy: "Recalculado para CABA" shown to a Palermo-scoped operator (ambiguous denominator);
     out-of-scope pill shows raw code ("AR-V") instead of the province name; stray "0" on
     `/login` (likely `{count && …}` leak).
   - L-batch from the report: vestigial "Dato protegido" category in province legend; `NaN` →
     lowest class instead of no-data (`class-scale.ts:~168`, harden to `Number.isFinite`);
     half-open labels (40–60/60–80) don't disambiguate 60.
   - LOW defense-in-depth: `/api/panorama/scope/route.ts:~45-83` doesn't validate
     `province ∈ allowedProvinces` — harmless today (public padrón geography only), add the
     `narrowGovtScope` guard before ANY scope-derived field is ever added.
6. **Centroid dots in water (BUG from earlier pass — PRIVACY-CONSTRAINED, no jitter).**
   Aggregated province/dept markers plot at the arithmetic-mean centroid (`AVG` of locality
   coords, `repository.ts:~1488-1489`; dept fold `build-features.ts:~455-456`) with no
   point-on-surface correction → TdF's mean falls in the sea. Fix: representative-point /
   polylabel so markers land on the polygon. **Rejected as stated**: "always real points +
   diffusion" — jitter blurs WHERE, not WHETHER/HOW-MANY; it is not a substitute for k=5
   suppression (`lib/metrics/anonymity.ts:~48`); denuncias' exact coord is a hard never-SELECT
   invariant; mordeduras stores no coord. Real points follow the approved scope-gated + consent
   plan (`docs/design/handoffs/2026-07-08-panorama-event-points-plan.md`), never jitter.

**Verified solid — do not touch:** jurisdictional fence (mig 0140, cube admin-gated,
`narrowGovtScope`, US-1), k-anon display suppression (5 paths), KPI↔map reconciliation
single-sourcing, H2 (refuted), saved views, boundary classing (test-pinned).

---

## QA contract

1. **Updated tests** — quantile actually firing (assert breaks ≠ equal intervals on a skewed
   fixture), popstate re-derivation, dock expand/collapse state, legend-strip render, CABA inset
   viewport predicate, point-on-surface placement (TdF marker on-polygon).
2. **Playwright visual** as `lucas@dim.test` + admin: fixed console at 1440px and 1024px —
   national view → drill Córdoba → expand Registros dock → switch to Línea de tiempo tab →
   Back-button resync → collapse dock. Screenshot-iterate against the PO's reference image.
3. **Clickthrough**: no dead-ends; keyboard path for scope change (breadcrumb dropdown); k-anon
   hatch still renders; no console errors.
4. **Fix-gate:** auto-fix MAP-1/MAP-2/M1/M2/MAP-5/polish (mechanical, confirmed); **PO
   ratifies**: dock default height, heatmap fork, KA1/KA2 ruling, magnifier scope.
5. `pnpm verify` + `pnpm test` green (paste output). Cowork's pass is CLOSED — `:3000` should be
   free now; confirm before rebuilding.

## Execution order

1. **Part B quick wins first** (MAP-1 quantile, MAP-2/M2 popstate root, M1, MAP-5, polish batch)
   — they're mechanical, live-confirmed, and independent of the redesign.
2. **Part A redesign** (fixed console + dock) — screenshot-iterate against the PO reference.
3. **Cube read-handle** (Part B #3) — before any `CUBE_READS` enablement.
4. **KA1/KA2** — after the PO ruling.
