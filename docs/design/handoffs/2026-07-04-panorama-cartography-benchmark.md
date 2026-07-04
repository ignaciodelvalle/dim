# Panorama cartographic benchmark & critique

**Ground truth:** `integration/all-20260703` · `095bbc4a`

---

## Executive read

Panorama already has a strong **government-grade foundation**: declarative layer taxonomy, local-only basemap (no third-party viewport beacons), dashboard-parity KPIs, question-framed presets, divergent compliance choropleths at province level, k-anon in the query layer, URL-encoded board state, and honest suppression copy in popups/legends. The national-zoom **“green blob”** is a real encoding mismatch, not a MapLibre bug: at `locality` aggregation you plot ~2,000+ graduated circles on top of each other (`SituationalMap.tsx:482–527`, `types.ts:31–32`). Best-in-class situational consoles solve that with **admin-level-appropriate marks** (province fill nationally, finer units only when zoomed), plus a **ranked side panel** and **spatially honest suppression**. Your layer framework can absorb most of this without a rewrite — one new **render-policy** dimension is the main abstraction gap.

---

## What’s already good (credit where due)

| Strength | Evidence |
|---|---|
| Declarative layer catalogue with `dataType`, `privacy`, `temporal`, `complianceTarget` | `src/modules/panorama/domain/types.ts:48–107`, `layers.ts:20–142` |
| Base / signal / reference compatibility (prevents visual chaos) | `compatibility.ts:46–91`, presets in `presets.ts:76–141` |
| Province rate layers → **filled choropleth** + divergent scale at legal target | `SituationalMap.tsx:629–641`, `province-choropleth-style.ts:88–127`, `layers.ts:125–127` |
| Local basemap only — no OSM/Mapbox tile leakage | `SituationalMap.tsx:34–38`, `159` |
| k-anon enforced server-side; suppressed cells carry flag, never leak count | `repository.ts:985–1009`, popups `SituationalMap.tsx:746–748` |
| Shareable board via shallow URL (`layers`, `level`, `preset`, `period`) | `PanoramaConsole.tsx:11–19`, `map-layer-nav.ts:34–37` |
| Situation-room temporal scrub + dim non-temporal layers | `TimeScrubber.tsx`, `SituationalMap.tsx:1106–1165` |
| Trust primitives: methodology `<details>`, demo disclosure, KPI ⓘ tooltips, freshness | `PanoramaShell.tsx:131–158`, `PanoramaKpiStrip.tsx:73–80`, `get-panorama-kpis.ts:52–57` |
| Unit drill: drawer + sparkline history on aggregated cell click | `DetailDrawer.tsx:17–23`, `Sparkline.tsx` |

---

## Benchmark table

| Pattern | Reference dashboard(s) | What it does well | Applies to us? | Where it’d slot |
|---|---|---|---|---|
| **Admin-level choropleth at national zoom** | CDC FluView / ILINet maps, UKHSA dashboards, ECDC Surveillance Atlas | National view = filled regions (state/province); county/locality only after drill or high zoom | **Yes — critical** | Auto `level` or zoom policy in `types.ts` (`AggregationLevel` + new `renderPolicy`); render branch in `SituationalMap.tsx:432–467` |
| **Graduated symbols only when units don’t overlap** | PAHO regional dashboards, early JHU (later criticized) | Bubbles proportional to count work at sparse scales; fail at 2k+ dense centroids | **Yes — root cause of blob** | Keep `addGraduatedPointLayer` (`SituationalMap.tsx:482`) but gate on zoom/level; default national presets already use `level: "province"` (`presets.ts:85–88`) |
| **Diverging scale anchored at policy target** | CDC vaccination coverage maps, WHO immunization dashboards | Below-target = warning hue, at-target neutral, above = positive; legend names the threshold | **Yes — partially shipped** | Extend `complianceTarget` + `provinceDivergentColorExpr` to locality when rate-by-locality lands (`repository.ts:907`); legend already at `SituationalMap.tsx:986–1016` |
| **Bivariate / priority encoding** | ESRI “Opportunity” dashboards, CDC social vulnerability × outcome overlays | Combines *need* (low coverage) × *scale* (pet population) → “where to act first” | **Yes — high mayor value** | New derived layer or preset metric in `layers.ts` + loader in `repository.ts`; render as bivariate fill or ranked score in `province-choropleth-style.ts` |
| **Spatially explicit suppression** | ONS / UK small-area stats, Eurostat maps, Census Bureau ACS | Hatched or textured “insufficient data” cells distinct from “no data” / zero | **Yes** | Replace/augment `COLOR_SUPPRESSED` (`viz-scales.ts:194`) with fill-pattern in `SituationalMap.tsx:494–498` / `province-choropleth-style.ts`; keep `PanoramaSuppressionNotice.tsx` aggregate |
| **Map ↔ ranked table hover-sync** | ArcGIS Dashboards, UK COVID dashboard, ECDC Atlas tables | “Worst 10 localities” list; row hover highlights map feature; keyboard-accessible | **Yes — table stakes** | New `RankedUnitsPanel.tsx` fed by same projection as `get-layer-features.ts`; click → `DetailDrawer.tsx` |
| **Delta / change maps** | CDC week-over-week change choropleths, COVID “new cases vs prior period” | Situation room reads *movement*, not just level; often diverging delta scale | **Yes** | New temporal mode on `PanoramaLayer.temporal` or `dataType: "delta"`; loader in `repository.ts`; optional second fill layer in `SituationalMap.tsx` |
| **Scrubber + sparkline + small multiples** | FluView time series + map, PAHO epidemic curves | Scrubber drives map; selected unit shows micro-trend; optional 2-up “then vs now” | **Partial** | Scrubber exists (`TimeScrubber.tsx`); unit sparkline in drawer (`DetailDrawer.tsx`); add compare mode to drawer or preset |
| **Legend-as-filter** | ECDC Atlas, many ArcGIS ops dashboards | Click legend class → isolate bracket on map | Nice-to-have | Legend handlers in `SituationalMap.tsx:975–1083` |
| **Share view / bookmark** | ArcGIS bookmarks, UK dashboard URL state | URL restores full analytical state | **Mostly done** | `PanoramaConsole.tsx` + `map-layer-nav.ts`; add `asOf`, scope to canonical URL + “Copiar enlace” button |
| **Export PNG/PDF for briefings** | ArcGIS Dashboards, ESRI StoryMaps, gov situation slides | One-click map snapshot for interjurisdictional meetings | **Yes for gov** | MapLibre `map.getCanvas().toDataURL()` wrapper; metadata footer (scope, period, as-of) |
| **Situation annotations** | ArcGIS Dashboards notes, EM ops common operating picture | Pinned notes per jurisdiction for shift handoff | Nice-to-have | New `situation_notes` table + layer `dataType: "reference"` — out of v1 |
| **Provenance block on map chrome** | UKHSA, CDC WONDER, WHO GLASS | “Data as of”, source, methodology link always visible | **Partial** | Extend `PanoramaKpiStrip` freshness to map overlay; per-layer `source` in `layers.ts:74–75` |
| **Accessible non-map view** | UK gov tables-first policy, WCAG map alternatives | Sortable table = screen-reader path to same data | **Yes — gap** | `RankedUnitsPanel` with `role="table"`; link from `SituationalMap.tsx:955–956` `aria-label` |
| **H3 / hexbin for dense points** | Uber H3 epidemiology examples, NYT/Carto hex maps | Regular grid avoids centroid pile-up | **Defer** | No locality polygons today (`build-features.ts:243–244`); hexbin is second-best vs real admin choropleth |
| **Click province → zoom + finer agg** | ESRI drill-down, CDC state→county | One gesture narrows scope AND aggregation | **Partial** | Province click opens drawer (`SituationalMap.tsx:706–717`); wire to `JurisdictionSwitcher` + `setLevel("locality")` in `PanoramaConsole.tsx` |

---

## Assessment by topic

### 1. Encoding — right marks per `dataType`?

| `dataType` | Current mark | Verdict |
|---|---|---|
| `rate` @ province | Polygon fill + divergent @ `complianceTarget` | **Correct** |
| `rate` @ locality | Count-density graduated circles (`repository.ts:907–908`) | **Wrong** once rate-by-locality exists — should be filled units or divergent symbols |
| `density` / `signal` @ province | One graduated circle per province | **Acceptable** nationally |
| `density` / `signal` @ locality | Graduated circles at centroids | **Wrong at national zoom** — overlap blob |
| `reference` | Clustered pins | **Correct** (`SituationalMap.tsx:537–577`) |
| `mortalidad` (`density` choropleth) | Same centroid circles at locality | **Misleading label** — not a true choropleth without polygons |

**For ~2,000+ AR localities:**  
- **Best:** locality **polygon choropleth** (INDEC / GCBA boundaries — you already have `ar_localities` centroids, not polygons).  
- **Pragmatic v2:** **zoom/admin policy** — national & province zoom → province fill; locality circles only inside selected province (you already autozoom on jurisdiction — `SituationalMap.tsx:360–391`).  
- **Hexbin/H3:** useful interim for *event* density without boundaries; weaker for compliance rates mayors must defend legally.  
- **Clustering graduated symbols:** wrong tool — you deliberately disabled clustering for determinism (`SituationalMap.tsx:479–480`); clustering would hide which locality is hot.

**Bivariate (coverage × population):** **Worth it** for mayor-facing “dónde actuar”. A mayor reads a **single ranked score** (“gap grande + muchos perros”) better than two layers. Implement as:  
`priority = (target − coverage) × registered_dogs` (k-anon suppress small denominators), sequential or two-hue bivariate on province fill first. Slot: new preset in `presets.ts` or computed field on `cobertura` loader.

### 2. Rate layers + `complianceTarget`

**Verdict: diverging-at-target is the right call** for compliance rates. You already do it with CVD-safe amber / neutral / teal (`viz-scales.ts:88–114`, `provinceDivergentColorExpr`).  

Gaps:  
- Locality level still sequential count-density — undermines “% cumplimiento” presets at `level: "locality"`.  
- `mortalidad` uses sequential blue though it’s `density` — fine, but don’t give it `complianceTarget`.  
- Consider **fixed domain** [0, 100] for rate legends nationally so Buenos Aires isn’t washed out by a single hot province (CDC often uses fixed bins).

### 3. k-anon suppression honesty

**Today:** suppressed cells **don’t vanish** — they render as small muted gray circles (`COLOR_SUPPRESSED`, `SituationalMap.tsx:494–508`) with popup text (`746–748`) and legend entry (`1074–1078`). Values are hidden; geometry remains.

**Best practice (ONS/Eurostat):**  
- **Hatched / diagonally patterned** fill distinct from `COLOR_NO_DATA` (`viz-scales.ts:191–194`).  
- **Map legend + aggregate pill** — you have both (`PanoramaSuppressionNotice.tsx:51–68`).  
- Optional **“suppressed area” outline** at province level when many child localities suppressed.

**Risk today:** on dark canvas, muted gray ≈ “no data” — hatch fixes that perceptually.

### 4. Change-over-time

**Today:** TimeScrubber reconstructs cumulative state (`TimeScrubber.tsx`); KPI strip shows period deltas (`PanoramaKpiStrip.tsx:64–68`); auto-reading headlines largest delta (`reading.ts:118–136`); drawer sparkline on click.

**Situation-room best practice:**  
1. **Scrubber** (keep) — “how we got here” narrative.  
2. **Delta layer or toggle** — choropleth of Δpp vs prior period (CDC week-over-week pattern) — highest signal for briefings.  
3. **Small multiples** — “inicio del período | ahora” side-by-side for one preset — use sparingly (cognitive load).  
4. **Animation** — play loop exists (`TimeScrubber.tsx:93–100`); use only as optional, default off (`prefers-reduced-motion` already respected).

**Recommendation:** add **“Δ vs período anterior”** toggle next to scrubber; don’t replace scrubber.

### 5. Map ↔ table + ranked lists

**Standard in operational GIS** (ArcGIS, UK dashboard). You have **no ranked list** and map `aria-label` is only a point count (`SituationalMap.tsx:955–956`) — no screen-reader access to values.

**Pattern:** “Peores 15 jurisdicciones” sorted by (a) distance below target for rate presets, or (b) event count for density presets; row hover sets map feature-state highlight; Enter opens `DetailDrawer`. This is **table stakes**, not polish.

### 6. Interaction — gov priority

| Affordance | Priority |
|---|---|
| Drill-down click → scope + finer agg | **Table stakes** — wire existing province click |
| Ranked worst-N + table view | **Table stakes** |
| Share deep-link | **Mostly done** — add explicit “Copiar vista” + include `asOf` |
| PNG/PDF export | **Table stakes** for mayor slides |
| Legend-as-filter | Nice-to-have |
| Annotations / COP notes | Nice-to-have v2 |
| Bivariate / priority layer | High value, medium effort |

### 7. Trust / credibility

**Present:** dashboard-parity KPIs (`get-panorama-kpis.ts:3–7`), methodology block (`PanoramaShell.tsx:131–158`), demo flag, freshness chip, local tiles.

**Missing vs public-health analyst expectations:**  
- **“Datos al …” on the map itself**, not only KPI strip.  
- **Per-indicator source line** on active layer legend (event log vs snapshot rollup).  
- **Uncertainty / coverage caveat** when denominator small (related to k-anon but different: “registro incompleto en jurisdicción”).  
- **Export embeds metadata** (scope, period, suppression count) for audit trail.

---

## Ranked recommendations

| # | Recommendation | Impact (mayor) | Effort | Net-new vs existing |
|---|---|---|---|---|
| 1 | **Zoom/admin render policy**: national → province polygon fill; locality symbols only inside scoped province; auto-switch `level` with zoom | **Very high** — fixes blob, makes cumplimiento preset legible | M | Improves existing (`SituationalMap`, `PanoramaConsole`, `types.ts`) |
| 2 | **Worst-N ranked panel + accessible table** hover-synced to map | **Very high** — how mayors actually decide | M | Net-new component + wire to `get-layer-features` |
| 3 | **Rate-by-locality** on true choropleth or province-only rate presets until polygons exist | **High** — honest compliance story | L–M | Extends `repository.ts` + `loadChoroplethByLevel` |
| 4 | **Suppression hatch pattern** distinct from no-data | **Medium-high** — privacy credibility | S | Improves `viz-scales.ts` + map paint |
| 5 | **Δ vs período anterior** map mode (delta choropleth toggle) | **High** for situation room | M | New temporal projection + render branch |
| 6 | **“Copiar vista” + export PNG** with metadata footer | **Medium** — briefing workflow | S–M | UI on `PanoramaConsole`; share URL mostly exists |
| 7 | **Click province → set scope + locality agg** (one gesture drill) | **Medium-high** | S | Wire `onFeatureClick` in `PanoramaConsole.tsx` |
| 8 | **Priority score layer** (coverage gap × population) | **High** for campaign targeting | M | New derived layer in `layers.ts` / `repository.ts` |
| 9 | **Fixed [0,100] domain** on national rate legends | **Medium** — comparability across provinces | S | `province-choropleth-style.ts` |
| 10 | **Bivariate encoding** (coverage × density) | **Medium** — analyst-loved, mayor-harder | M–L | Optional advanced mode |

---

## Cross-check: your six proposed items

| Proposal | Verdict |
|---|---|
| **Choropleth-per-zoom** | **Correct and #1 priority.** You already have province fill + locality symbols; policy isn’t tied to zoom. Implement as automatic `level` + camera threshold, not a third aggregation enum. |
| **Diverging-at-target** | **Correct — already built for province rates.** Don’t re-litigate; extend to locality rates and fix legend domain. Not lower-value. |
| **Worst-N table** | **Correct and underweighted if not P0.** Standard ops pattern; fixes a11y gap. Higher value than legend-as-filter. |
| **Suppression hatch** | **Correct; higher value than it sounds.** Gray-on-dark reads as missing data; hatch is ONS-standard. Effort is small. |
| **Delta-over-time** | **Correct; complementary to scrubber, not replacement.** KPI deltas + reading are strip-level only; map-level delta is the gap. |
| **Share/export** | **Half done.** URL board state is strong (`PanoramaConsole.tsx`). **Share** = add explicit copy button. **Export** = still missing — do both, export is the briefing blocker. |

---

## Two recommendations you did NOT propose

1. **Accessible data table as first-class view** (WCAG / Ley 26.653) — same query as map, sortable, filterable, no WebGL required. Pairs with worst-N panel; mandatory for government handoff.

2. **“Priority / donde actuar” derived layer** — single scored surface combining compliance gap and registered pet population (bivariate collapsed to one mayor-readable rank). Presets today ask the right questions (`presets.ts:80–81`, `106–107`) but still require visual integration of two mental layers.

---

## Single highest-leverage cartographic change

**Enforce admin-level-appropriate encoding by zoom and scope: province filled choropleth at national scale; locality graduated symbols only when the camera is inside a province (or operator has selected one).**  

This one change fixes the green blob, makes `cumplimiento` and `control-poblacional` presets trustworthy on first paint, and aligns you with CDC/ECDC/UK national-view conventions — without waiting for 2,000 locality polygons.

Concrete hook: when `map.getZoom() < ~5` or scope is national, force `level: "province"` for aggregated layers and render density at province centroids or as province choropleth where metric allows (`SituationalMap.tsx:432–467`, `AggregationToggle.tsx`).

---

## Can the layer framework absorb this?

**Yes, with one extension — not a rewrite.**

`PanoramaLayer` already has the right semantic axes (`dataType`, `geomType`, `complianceTarget`, `temporal`). What’s missing is an explicit **render policy**:

```ts
// Suggested addition to types.ts — illustrative only
renderPolicy?: {
  province: "choropleth-fill" | "graduated-symbol" | "clustered-points";
  locality: "choropleth-fill" | "graduated-symbol" | "clustered-points";
  autoLevelByZoom?: { belowZoom: number; level: AggregationLevel };
};
suppressionStyle?: "muted" | "hatched";
```

- **Ranked table, export, copy-link** → new UI components consuming existing `get-layer-features` / URL state — no domain change.  
- **Delta maps** → either `temporal: "delta"` companion or `dataType: "rate"` with `valueKind: "delta"` — small schema addition + loader.  
- **Locality polygons** → infrastructure asset (`public/geo/…`), not a framework replacement; `geomType: "choropleth"` already anticipates it (`types.ts:23–25`).

**Honest read:** the descriptor framework is **80% of what you need**. The blob bug is a **missing render-policy layer**, not a wrong architecture. Ship zoom/admin policy + worst-N table before investing in H3 or bivariate — those pay off after the national view is readable.
