# Panorama QA — root-cause triage & ViewState verdicts (2026-07-12)

> READ-ONLY investigation. No production edits. Branch `integration/all-20260703`.
> The PO handed 9 panorama QA findings and asked, for EACH: (a) root cause with exact
> `file:line`, (b) a **ViewState verdict** — `SOLVED by phase X` / `NEEDS NEW DESIGN` /
> `COSMETIC` — judged against the canonical `PanoramaViewState` design
> (`docs/plans/panorama-viewstate-design.md`) and its P0–P5 phasing
> (`docs/plans/panorama-viewstate-master-plan.md`), and (c) where NEEDS NEW DESIGN, a
> concrete proposal consistent with that architecture.
>
> **State of the migration (sharp boundary):** P1b has landed — the console now derives
> scope + period from ONE `PanoramaViewState` (`view-state.ts`, `view-state-url.ts`). But
> **layer rendering, encoding, and LOD are still imperative** — P2 (capabilities gate),
> P3 (first-class Encoding + inset), and P4 (representation-per-zoom) are NOT built. Every
> verdict below respects that line: anything about *what/how a layer paints* is still
> imperative today.

---

## Verdict table (one line each)

| # | Finding | Root | Verdict |
|---|---|---|---|
| 1 | Capas & Vista share one icon | `Icon.tsx:191-192` both → `Layers` | **COSMETIC** |
| 2 | Vista simple/detail toggle | `PanoramaRail.tsx:177` renders toggle unconditionally | **COSMETIC** |
| 3a | Período simple/detail toggle | same `RailPanel` toggle | **COSMETIC** |
| 3b | "personalizado" full page reload | `PeriodPanel.tsx:51` `window.location.assign` | **NEEDS NEW DESIGN** — the "unify commit mechanism" follow-up §4.3 already named |
| 4 | Timeline histogram clips text | `TimeScrubber.tsx:547-550` `absolute bottom-full`, no reserved space | **COSMETIC** |
| 5 | Exportar simple/detail; notes below button | same `RailPanel` toggle + inline layout | **COSMETIC** |
| 6 | Acerca simple/detail toggle | same `RailPanel` toggle | **COSMETIC** |
| 7 | Zoom/nav: can't go province→province, scroll breaks | wheel-hierarchy takeover `performNavStep` + continuous-zoom→level hysteresis | **NEEDS NEW DESIGN** — navigation-input model; P4 covers *render* not *input* |
| 8 | Ghosting: stale locality marks at national | `SituationalMap.tsx:1971-1980` province branch `continue`s without tearing down the layer's prior locality representation | **SOLVED by P4** — but ONLY if P4 keys the mounted-layer registry on resolved representation |
| 9 | "pérdidas activas" disappears for CABA | inset selects choropleth layers only `SituationalMap.tsx:3340-3384`; `perdidas` is `geomType:"point"` `layers.ts:57` | **SOLVED by P3** (insetBehavior) — P3 must extend the inset to graduated/points encodings |

---

## Rail / right-tray UI

### 1. Capas and Vista use the SAME icon — **COSMETIC**

**Root cause.** The rail renders `item.icon` through `components/Icon.tsx`. Both glyphs
resolve to the identical Lucide component:

- `components/Icon.tsx:191` — `vista: Layers`
- `components/Icon.tsx:192` — `capas: Layers`

The two rail items are built in `PanoramaConsole.tsx`:
- **Vista** (top): `id:"vista"`, `icon:"vista"`, `label:"Vista"` (`PanoramaConsole.tsx:3665-3667`) — its panel body is the **`PresetPanel`** (the preset/view selector). This is the one whose glyph is wrong; a preset selector should not read as "layers".
- **Capas** (second): `id:"filtro"`, `icon:"capas"`, `label:"Capas del mapa"` (`PanoramaConsole.tsx:3700-3702`) — its body is the **`FiltroPanel`** (layer on/off + opacity + verified). The `Layers` glyph is CORRECT here.

**Fix (no ViewState dependency).** Give `vista` a distinct glyph (e.g. `Eye` / `LayoutGrid`
/ `Sparkles` — a "saved view / preset" reading), leave `capas: Layers`. One-line change in
`Icon.tsx`. Independent of the canonical value entirely.

### 2 / 5 / 6. Vista / Exportar / Acerca simple-detail toggles — **COSMETIC** (one batch)

**Root cause (shared).** The Simple/Detalle toggle is NOT per-panel logic — it is rendered
**unconditionally** in the shared panel chrome:

- `PanoramaRail.tsx:176-181` — `RailPanel`'s header always renders `<SimpleDetalleToggle>`.

Every rail panel item declares `detail` + `onDetailChange` (`RailPanelItem` type,
`PanoramaRail.tsx:38-42`), and the console wires per-panel state: `vistaDetail`,
`capasDetail`, `periodoDetail`, `exportDetail`, `acercaDetail`. The panel bodies gate
"extra" content on `detail` (e.g. Vista `PanoramaConsole.tsx:3686`, Exportar `:3786`,
Acerca `:3817`).

**Fix (mechanical).** Make the toggle **opt-in**: the PO wants it GONE for **Vista (#2),
Período (#3a), Exportar (#5), Acerca (#6)** — those panels ALWAYS render detail. Keep it
only for **Capas** (the one panel where simple/detail is a real information-density choice).
Cleanest shape: make `detail`/`onDetailChange` OPTIONAL on `RailPanelItem`; `RailPanel`
renders `SimpleDetalleToggle` only when `onDetailChange` is present; toggle-less panels
render their body with `detail = true` hardcoded. Then drop the now-unused
`vista/periodo/export/acerca Detail` state.

- **#5 Exportar extra**: "each clarification note goes BELOW its button." Today the three
  buttons render first and ONE combined note sits at the bottom under a `detail` gate
  (`PanoramaConsole.tsx:3760-3792`). With detail always on, split that paragraph and place
  each note directly under its button (Copiar vista / Vistas guardadas / Exportar PNG).
  Pure layout in the Exportar `render`.

**Why COSMETIC, not ViewState.** The Simple/Detalle tier is a *presentation-density*
preference on a control panel — it is not part of `PanoramaViewState` (not scope, period,
layers, encoding, representation). The design's §8 fork #3 discusses `representation` naming
but nothing about panel disclosure tiers. Removing these toggles neither helps nor is helped
by the canonical value. Do it as a standalone rail-cleanup PR.

### 3a. Período simple/detail toggle — **COSMETIC** (same batch as 2/5/6)

Same `RailPanel` toggle mechanism (`PanoramaRail.tsx:177`). `PeriodPanel` itself gates its
"more" windows (año en curso / 3a / 5a / personalizado) on `detail`
(`PeriodPanel.tsx:64,90`). With the toggle removed, always pass `detail = true` so the full
period list (incl. Personalizado + `DateRangePicker`) always shows.

### 3b. "personalizado" triggers a FULL PAGE RELOAD — **NEEDS NEW DESIGN** (the follow-up §4.3 already named)

**Root cause (exact).** `PeriodPanel` commits EVERY period change through a full document
navigation:

- `PeriodPanel.tsx:45-52` — `updateParams()` ends in `window.location.assign(...)` (line
  **51**).
- `pick(preset)` (`:54-57`) and `handleCustomRangeChange(range)` (`:59-62`) both call it.
- Selecting "Personalizado…" calls `pick("custom")` (`:95`) → `window.location.assign` →
  full reload; then picking dates calls `handleCustomRangeChange` → a **second** full
  reload.

The header comment (`PeriodPanel.tsx:5-8`) states this is deliberate: the `?period` /
`?from` / `?to` write uses the full navigation because it is "the one mechanism immune to
the Next 15.5.x router-drop defect."

**This IS the documented dual-write mechanism.** Design §4.3 hazard #1 says verbatim:
`period`/`from`/`to` (PeriodPanel) commit via a **full `window.location.assign` page
reload**, while `layers`/`level`/`verified`/`asOf`/camera commit **shallow**. The split
exists because Next App Router's `useSearchParams()` does not observe shallow history
commits (engram #621/#622). The design's explicit decision: keep the commit mechanism
per-call-site in P1; **"Unifying commit mechanisms is explicitly out of P1 scope (its own
follow-up)."**

Note the scope path was ALREADY unified: province→province drill migrated OFF
`window.location.assign` to a shallow `pushMapStateUrl` + client refetch (task #55,
`PanoramaConsole.tsx:1283-1370`, `commitScopeDrill`). So the pattern for the fix already
exists in-repo — period is the last holdout on the reload path.

**Verdict: NEEDS NEW DESIGN — but it is the "own follow-up" the design already named**, not
a new axis. The ViewState *shape* covers period (`period` field, STORED→derived window). The
gap is purely the COMMIT MECHANISM: unify period onto the shallow
`pushMapStateUrl`/`replaceMapStateUrl` + client refetch path that scope and layers already
use, so custom-period selection no longer reloads.

**Concrete proposal (consistent with the architecture).**
1. Route period through the SAME seam as scope: build the URL via `viewStateToParams`, commit
   with `pushMapStateUrl(targetUrl)` (shallow), then trigger the existing client
   KPI/layer refetch effects (they already key off the derived period window).
2. Mirror the popstate handling `commitScopeDrill` uses (`PanoramaConsole.tsx:1395` `onPopState`)
   so Back/Forward across period changes stays URL⇄view coherent without a router observe.
3. Keep the full-reload as the GRACEFUL FALLBACK on refetch failure — exactly the
   `fetchScopeBundle` degradation pattern (`:1325-1329`).
4. This is a **discrete follow-up PR** sized like task #55; it does not block P2/P3/P4 and
   should NOT be smuggled into the mechanical rail-cleanup batch.

---

### 4. Timeline (signal histogram) clips / overlaps the text — **COSMETIC**

**Root cause (exact).** The task-#65 signal histogram is absolutely positioned ABOVE the
scrubber track with **no reserved vertical space in the flow**:

- `TimeScrubber.tsx:547-566` — the histogram wrapper is
  `absolute inset-x-0 bottom-full mb-1 flex h-5 …` inside the track `<div>` (the H4 pointer
  hit-area, `:529-542`).
- `bottom-full` pins it entirely ABOVE the track's box; `h-5` (20px) + `mb-1` is drawn OUTSIDE
  normal flow, so nothing reserves room for it. It floats up into the row directly above —
  the header (`Reproducción temporal` label + as-of readout + Simple/Detalle toggle,
  `:449-487`) or, in Brotes activos, the `currentStateBaseLabel` disclaimer paragraph
  (`:505-514`). That collision is the clipping/overlap the PO sees.

**Fix (pure CSS/layout).** Reserve the histogram's height in the flow so it can't overlap:
add top padding/margin to the play-track row equal to the histogram band (e.g. `pt-6` on the
`flex items-center` row at `:515`, or wrap the histogram in a non-absolute flex child with
its own `h-5` above the track). No ViewState involvement — the histogram bins are already
passed in as a prop (`histogramBins`, `:147`); this is spacing only.

**Why COSMETIC.** Independent of the canonical value; it's an overflow bug in one
presentational component.

---

## Behavioral / structural (the deep ones)

### 7. Zoom / navigation model — **NEEDS NEW DESIGN** (navigation-INPUT model; distinct from P4's render-LOD)

**What's actually running for the PO.** The PO tests as **admin ⇒ `universalNav = true` ⇒
`scrollNavEligible = true`** (`PanoramaConsole.tsx:3248`, wired at `:3911-3912`). So he is
NOT on plain cooperative scroll-zoom — he is on the **wheel→hierarchy-navigation takeover**
(task #36 fix 5):

- `SituationalMap.tsx:1020-1023` — when `scrollNav`, `map.scrollZoom.disable()` and the
  wheel is routed to `handleNavWheel`.
- `handleNavWheel` (`:1405-1428`) accumulates `deltaY` with a threshold + a cooldown + an
  in-flight guard, then calls `performNavStep`.
- `performNavStep` (`:1469-1520+`) resolves ONE hierarchy step via `resolveScrollNav`
  (`components/panorama/panorama-regions.ts`) over a `NavState` of
  `{province, locality, region}` where `region` is re-derived from the LIVE viewport
  (`deriveCameraRegion`, `:1438-1448`). A scope change is committed via
  `onScopeCommitRef.current?.(next.province, next.locality)` (`:1519`).

**Why province→province fails, and why it "keeps breaking."** The hierarchy is strictly
**nación → región → provincia → (free zoom inside)**. There is no lateral edge between two
sibling provinces: to go from province A to province B you must wheel OUT to región/nación,
re-center over B, then wheel IN. Compounding fragility, all visible in the code as a stack of
adversarial-QA patches:
- The wheel accumulator/cooldown/in-flight guard (`:1410-1421`, `NAV_COOLDOWN_MS`,
  `navAnimatingRef`) — a step is dropped mid-animation or during cooldown, so flicks feel
  "dead" or double-fire.
- Camera-as-truth region derivation (`deriveCameraRegion`, HIGH 3) races the committed scope.
- Inside a committed province, wheel-IN falls through to `freeZoomTowardCursor` (HIGH 2,
  `:1490-1493`) — a *different* gesture semantics than the same wheel one level up.
- Separately, the aggregation LEVEL is driven by CONTINUOUS camera zoom through a Schmitt
  band: `derivedLevelWithHysteresis(levelRef.current, scope, mapZoom)`
  (`PanoramaConsole.tsx:2714`, band `Z_LOCALITY_ENTER=5.4` / `Z_LOCALITY_EXIT=4.6`,
  `situational-map-utils.ts:57-84`). Crossing the band flips province⇄locality and REFETCHES
  the level-sensitive layers (`onLevelChange`, `:2715`). So the camera and the data-level are
  coupled: a zoom gesture that was "just look closer" silently re-aggregates and re-fetches —
  "the camera fighting the level."

So the answer to the PO's diagnostic question is **all three at once**: the hierarchy model
has no lateral province move (structure), the wheel takeover is a fragile accumulator state
machine (input), and continuous zoom is wired to data-level via hysteresis (coupling).

**Judged against the ViewState design.** The design covers the *output* side well:
`scope` is STORED, `camera` is an OPTIONAL reproduction frame, live zoom is a RUNTIME input,
and §5/P4 `representationPerZoom` says WHAT to draw per zoom band. But the design is
deliberately silent on the *input gesture model* — how a wheel/click MUTATES `scope` and
`camera`. §1.1's note "storing continuous zoom would thrash the canonical value on every pan"
is the one adjacent principle, and it actually ARGUES FOR the PO's instinct: the camera
should not be a live driver of canonical state.

**Verdict: NEEDS NEW DESIGN — a navigation-input model, which P4 does NOT provide** (P4 is
render-LOD, not gesture handling). The PO's proposal (disable scroll-zoom, full-click
navigation) is sound and is SIMPLER and MORE ROBUST on the ViewState foundation.

**Concrete proposal (consistent with the ViewState architecture).**
1. **Disable the wheel-hierarchy takeover.** Remove/park `scrollNav` (`handleNavWheel`,
   `performNavStep`, `resolveScrollNav`, `deriveCameraRegion`, `freeZoomTowardCursor`) — the
   whole accumulator/cooldown/region-race machine is the fragile part. Keep `scrollZoom`
   disabled; zoom stays on the explicit `NavigationControl` buttons + keyboard (already
   present, `:1057`).
2. **Click-drives-scope.** Province→province is a click on the target province polygon →
   `commitScopeDrill(provinceCode, null)` (`onProvinceDrill`, `:1373-1375`) — a shallow
   `pushMapStateUrl` commit that ALREADY works and is lateral (no need to exit to nación
   first). Drill localities by clicking a department/barrio; "← Volver" (`onReturnNational`,
   `:1378`) exits. This is `scope` = STORED, mutated by explicit clicks.
3. **Decouple level from continuous zoom.** Make aggregation LEVEL a function of `scope`
   (national ⇒ province choropleth, province/locality scope ⇒ drilled) plus DISCRETE zoom
   bands from `capabilities.representationPerZoom` (P4) — not the continuous
   `derivedLevelWithHysteresis(mapZoom)` refetch trigger. This is exactly the design's
   "camera is a runtime input, not stored" discipline: the camera FRAMES the committed scope;
   it does not silently re-commit data-level on every wheel tick. The hysteresis band and its
   refetch (`PanoramaConsole.tsx:2714-2716`) go away.
4. **Sequencing.** Step 1+2 (kill the wheel takeover, lean on click-drill) is a self-contained
   PR deliverable NOW and removes the bulk of the "keeps breaking" surface. Step 3 (level from
   scope+discrete band) lands cleanly WITH P4, since P4 is where `representationPerZoom`
   becomes the single source for the mark at each zoom. Recommend the PO greenlight step 1+2
   immediately and fold step 3 into P4.

This is the biggest item and the recommendation is unambiguous: **the ViewState scope+camera
split makes the click-driven model both simpler and structurally cleaner than the current
wheel-hierarchy machine; adopt it.**

---

### 8. Ghosting — stale locality marks remain at national — **SOLVED by P4** (conditionally)

**Confirmed reproduction.** `?layers=esterilizacion&preset=control-poblacional&z=3.54` —
locality-level purple point/circle features linger over Buenos Aires / La Pampa at national
zoom. `esterilizacion` is `geomType:"choropleth"` (`layers.ts:241`); at LOCALITY it renders
division-fill polygons PLUS **centroid circles for unmatched cells**
(`SituationalMap.tsx:2003-2006`, `circleData = join.unmatched` → `addChoroplethLayer` creates
an own `srcId(layer.id)` GeoJSON source + circle layer).

**Root cause (exact).** `syncLayers` reconciles the imperative map layers by TWO keys only:
(a) layer id no longer active → `removeLayer` (`:1877-1884`), and (b) a POINT layer whose
render MODE flipped → teardown (`pointModeFlipped`, `:2076-2097`, gated on
`layer.geomType === "point"`). It does **not** handle a layer whose id STAYS active but whose
**representation/level flips** (locality division+circles ⇄ province basemap choropleth). The
province-choropleth branch:

- `SituationalMap.tsx:1932` — `if (layer.geomType === "choropleth" && layer.level === "province")`
- `:1971-1976` — because the layer was previously mounted (as the LOCALITY rep),
  `mountedRef.current.has(layer.id)` is TRUE, so it calls `updateProvinceChoroplethLayer`
  (repaints the shared basemap fill) …
- `:1980` — `continue`.

That `continue` skips the ONLY cleanup that would remove the layer's stale locality artifacts
— the division-fill/suppression teardown at `:2061-2070` and any own-source circle layer
(`srcId(layer.id)`) — because that cleanup lives BELOW the province branch. Net: the province
choropleth is painted onto the basemap while the layer's OLD locality centroid-circle
source/layer (and division fill) stay mounted = the purple ghost. (The symmetric hole exists
going the other way: `mountedRef.has(id)` also short-circuits the reverse transition.)

**Verdict: SOLVED by P4 (representationPerZoom) — but STRUCTURALLY only if P4 pairs the
declarative representation with a mounted-registry keyed on the RESOLVED representation.** The
design's claim (master plan: "the national-blob-points problem is now the systematic default,
not a per-layer patch"; §5) is about SELECTING the right mark per zoom band. That alone does
not kill the ghost — the ghost is a *teardown* gap, not a *selection* gap. The declarative
projection prevents leaving a ghost **iff** the runtime treats
`representationPerZoom[layer]` as the layer's identity on the map: when the resolved
representation changes (graduated/points/locality-choropleth-with-circles → province-
choropleth), the diff MUST unmount the prior representation's sources/layers before mounting
the new one.

**Concrete proposal (make it explicit in P4).** Replace the id+point-mode reconciliation with
a `mountedRepresentationRef: Map<LayerId, ResolvedRepresentation>` where
`ResolvedRepresentation` ∈ `{province-choropleth, locality-choropleth+circles, graduated,
points, reference}` (derived from `capabilities.representationPerZoom` against live zoom).
On each sync, if `mounted != resolved` for a still-active layer, run the FULL `removeLayer`
teardown (own source, circle layer, division fill, suppression hatch) THEN add the new
representation — the same discipline `pointModeFlipped` uses today, generalized to the
representation axis. Then a projection `(view, capabilities) → layers` cannot leave a ghost,
because a changed resolved representation forces a teardown. Without this explicit keying, P4
would ship the declarative selection and STILL ghost — so call it out in the P4 task.

(If the PO wants the ghost gone BEFORE P4 lands: the minimal stopgap is to generalize the
`pointModeFlipped` teardown at `:2076-2097` to also fire when a choropleth layer's `level`
changed since it was mounted — but the durable fix is the P4 registry above.)

---

### 9. "pérdidas activas" disappears for CABA — **SOLVED by P3** (insetBehavior — must cover point/graduated encodings)

**Root cause (exact).** The CABA inset only ever projects a **choropleth** base layer:

- `SituationalMap.tsx:3340-3341` — `insetLocalityLayer = layers.find(l => l.geomType === "choropleth" && l.level === "locality")`.
- `:3342-3345` — `insetProvinceLayer` = a `geomType:"choropleth"` province layer (fallback).
- `:3384` — `insetLayer = insetLocalityLayer ?? (insetUniformFill !== null ? insetProvinceLayer : null)`.
- `:3388-3394` — the inset is only visible when `hasInsetLayer` (i.e. a choropleth resolved).

`perdidas` is **`geomType:"point"`** at EVERY level (`layers.ts:53-72`: province/locality both
`clustered-points`, plus `points:"clustered-points"` near-zoom real dots) — it is NEVER a
choropleth. So when perdidas is the active base layer, `insetLocalityLayer` and
`insetProvinceLayer` are both null → `insetLayer = null` → the inset is HIDDEN. And on the
MAIN map at national, perdidas is graduated/clustered circles at representative points; CABA
(~200 km²) is a pixel-smear (`:3331` comment), so its single circle is invisible. Net: CABA
has **no legible representation of pérdidas at national** — neither in the inset (choropleth-
only) nor on the main map (sub-pixel).

This is NOT a data-suppression / k-anon gap: a province-aggregate perdidas count for CABA
exists in the graduated layer's features (the main map draws per-province bubbles including
CABA). It is a **presentation gap**: the inset re-decides its own fill as a division/uniform
CHOROPLETH (`CabaInset.tsx:60-85`, `syncFill` `:208-247`) and simply has no code path to
project a graduated/points encoding.

**Verdict: SOLVED by P3 — design §3 insetBehavior — provided P3's insetBehavior is defined to
project ANY resolved encoding, not just choropleth.** §3's structural guarantee is
"`insetBehavior.encoding` IS the main `encoding`; the inset projects it (no separate fill
decision)" and the STORED/DERIVED table lists `insetBehavior: { visible, encoding }` from
`capabilitiesFor`. The current inset VIOLATES exactly this — it makes a SEPARATE fill decision
and only understands choropleth. Under P3, if perdidas resolves to a `graduated` encoding,
`capabilities.insetBehavior.encoding` is `graduated`, and the inset must render a CABA count
bubble (or a barrio-joined graduated mark), not a choropleth fill. Then CABA is legible for
perdidas by construction.

**Concrete proposal (extend §3 explicitly).** P3's `ResolvedEncoding` union already includes
`graduated` and `points` (`design §1` EncodingId). Make `insetBehavior` carry the same
`ResolvedEncoding` and have `CabaInset` switch on `encoding.kind`:
- `choropleth-seq|meta` → today's barrio join / uniform-value fill (keep).
- `graduated` → render a single CABA-aggregate bubble sized on the SAME `GraduatedScale` the
  main map uses (the count is the province-aggregate for CABA that already exists in the
  layer features).
- `points`/`reference` → project the CABA-scoped dots/pins (or, at national, degrade to the
  graduated CABA bubble — the honest aggregate, since real dots are near-zoom only).
This keeps the inset a pure projection of the one resolved encoding (the §3 invariant) and
removes the choropleth-only assumption at `SituationalMap.tsx:3340-3384`.

---

## Cross-cutting synthesis — 9 findings → 4 roots

The PO's suspicion is correct: the nine findings collapse to **four** roots, and the split
between "finish a ViewState phase" and "needs your decision" is clean.

**Root A — Rail simple/detail cleanup (mechanical, COSMETIC).** Findings **1, 2, 3a, 5, 6**.
One PR: (a) give `vista` a distinct icon (`Icon.tsx:192`); (b) make `SimpleDetalleToggle`
opt-in on `RailPanel` and drop it from Vista/Período/Exportar/Acerca (keep on Capas),
defaulting those bodies to `detail = true`; (c) move each Exportar note below its button.
Independent of `PanoramaViewState`. Ship anytime. (Finding **4**, the histogram overflow, is
also COSMETIC but a different file — fold it into the same "panorama polish" PR.)

**Root B — Commit-mechanism still split (period reloads).** Finding **3b**. This is the
"unify commit mechanisms" follow-up the design ALREADY named (§4.3 hazard #1, out of P1
scope). The scope path was already unified in task #55; period is the last holdout on
`window.location.assign`. Discrete follow-up PR modeled on `commitScopeDrill`. **Your call**
only on sequencing — the design already decided the direction.

**Root C — Layer render / encoding / inset still imperative (P3 + P4).** Findings **8** and
**9** are the SAME structural gap the master plan predicts: rendering is imperative, so
representation transitions leak (8) and the inset re-decides its own encoding (9).
- **8** is a P4 concern (representation-per-zoom) — SOLVED iff P4 keys the mounted registry on
  the resolved representation and tears down on change.
- **9** is a P3 concern (first-class Encoding + `insetBehavior` projecting the SAME encoding)
  — SOLVED iff P3's inset handles graduated/points, not just choropleth.
Both are "finish the phase, and make this specific requirement explicit in the phase's tasks."
No new architecture — but the P3 and P4 task lists should name finding 9 (inset graduated
support) and finding 8 (representation-keyed teardown) as acceptance criteria, or the phases
can ship without closing them.

**Root D — Navigation-input model is undesigned.** Finding **7**. The ViewState design nails
the OUTPUT (scope stored, camera as runtime frame, LOD render in P4) but never specifies the
INPUT gesture model. The current wheel-hierarchy takeover is a fragile state machine with no
lateral province move, plus continuous-zoom→level coupling. **This needs your decision**, and
the recommendation is firm: adopt the PO's click-driven model (disable scroll-zoom; click-
drill scope via the existing `commitScopeDrill`; decouple level from continuous zoom into
discrete P4 bands). It is simpler AND more robust on the ViewState foundation. Step 1+2
shippable now; step 3 lands with P4.

**Scoreboard:** 9 findings → 4 roots.
- **A (5 findings):** mechanical, ship now — COSMETIC.
- **B (1):** named follow-up, direction already decided — sequence it.
- **C (2):** solved by finishing **P3 (finding 9)** and **P4 (finding 8)**, IF each phase's
  tasks name the requirement.
- **D (1):** the one genuine open DECISION — a navigation-input model P4 does not cover;
  recommend adopting the click-driven model.

---

# Round 2 — dock, labels, card affordance (design)

> Same discipline as round 1: for each item — (a) root cause with `file:line`, (b) how it maps
> to the structure (the ViewState `representation` concept + the viz-suite plan
> `docs/plans/viz-suite.md` #33 3-axis IA + the #53 design-critique + #44 signal-driven ranking
> / department-rate gaps), (c) a concrete design recommendation. This round is design-heavy; item
> 4 gets real, buildable visual options because the PO explicitly asked "how do we solve this
> visually?"
>
> **State line (unchanged since round 1):** the dock is a presentational shell
> (`PanoramaDock.tsx`) fed bespoke panes by the console; the **`representation` axis of
> `PanoramaViewState` is NOT built** — there is no representation config, no representation
> registry, no `representation → columns/units/kind` declaration. Every list/table below is a
> hand-wired one-off. That absence IS the root of items 1 and 3.

## Verdict table (one line each)

| # | Finding | Root | Verdict |
|---|---|---|---|
| 1 | Estadísticas ranking is a FIXED "Peores 10" — no chooser, one hardcoded list | `PanoramaConsole.tsx:3507-3550` derives one ranking from `captionLayer`; `RankedUnitsPanel.tsx:63` title hardcoded; `ranking.ts:14` `RankingKind` fixed to rate\|density | **SOLVED-BY-#33** (representation-chooser) — a small pre-#33 increment is viable |
| 2 | The bare `-49` has no visible label | `RankedUnitsPanel.tsx:104-111` renders `−gap` with an `aria-label` only (no on-screen label/header); `-49` = `target−value` (`ranking.ts:108`), esterilización target 70% − Salta 21% | **COSMETIC now / structural in #33** — one-file label fix today; representation-declares-columns is the durable form |
| 3a | Registros "CAPA" column repeats on every row when 1 layer | `MapDataTable.tsx:110-118,129` always renders the Capa column; `PanoramaConsole.tsx:3496` feeds it | **COSMETIC** — conditionally drop the column |
| 3b | Registros vs Estadísticas: two bespoke components doing ~the same job | `MapDataTable` (Capa/Unidad/Valor, no sort, CSV) vs `PanoramaDataTable`/`RankedUnitsPanel` (ranked, sortable, kind-aware) — three separate table shapes | **SOLVED-BY-#33 + #53** — a shared dock-representation table primitive |
| 4 | KPI cards don't afford "tap to change the view" — only a thin blue border | `KpiChips.tsx:117-121` active = `border-ln-op-azul … ring-1 ring-ln-op-azul/40`; `:127` uses `aria-pressed` (NOT radiogroup); read-only cards look near-identical (`:143-150`) | **DESIGN-DECISION** — the PO must pick the visual direction (options ranked below) |

---

## 1. Estadísticas "Peores 10" — no chooser, one hardcoded list — **SOLVED-BY-#33** (pre-#33 increment viable)

**Root cause (exact).** The Estadísticas pane renders exactly ONE ranking, fully determined by
the active base layer — there is no chooser anywhere:
- `PanoramaConsole.tsx:3507-3518` — `dockStats` builds a single `<RankedUnitsPanel>` from
  `rankedRows` + `rankingKind`, both derived from `captionLayer` (the active base layer). No
  metric picker, no best-vs-worst toggle, no dimension selector.
- `RankedUnitsPanel.tsx:63` — the heading string is literally `Peores {N} jurisdicciones`;
  "peores" (worst) is baked into the copy AND the data (`rankWorstUnits`).
- `src/modules/panorama/domain/ranking.ts:93-118` — `rankWorstUnits` only ever returns WORST-N:
  rate layers keep units strictly below target ordered by largest gap (`:105-110`); density
  layers order by highest count (`:111-113`). "Best", "vs national average", "by a different
  dimension" are not expressible — the function has one behavior.
- `ranking.ts:14-15` — `RankingKind = "rate" | "density"` is the ONLY axis of variation, and it
  is inferred from the layer's `dataType`, not chosen by the operator.

So "let the user choose what to see" has **no seam to hang on**: the ranking is a pure function
of `captionLayer`, and the only representation of a layer's per-unit data is this one worst-N
list (plus its accessible twin `PanoramaDataTable`, same rows).

**Maps to the structure.** This is precisely the missing **`representation`** axis. The viz-suite
IA (`viz-suite.md` §"Organizing principle", axis 3) says the dock is **non-spatial
representations GROUPED BY INTENT** — **Listas** (Registros / Estadísticas), Tendencias, Flujos —
"3-4 intent tabs with a sub-selector, not ten flat tabs." Today the "Listas" family exists as two
frozen tabs with zero sub-selector. The PO's ask — pick the metric, best-vs-worst, the dimension —
IS the sub-selector the plan already names. It also lines up with **#44**: signal-driven ranking
(rank by a signal layer, not just the base) and department-rate coverage (rank at department grain)
are new *representations of the same view*, not new pages. This is the round-1 pattern repeating:
just as findings 8 & 9 were one root ("layer render is imperative"), items 1 & 3 here are one root
— **the dock's list representations are underbuilt and hand-wired** (see synthesis).

**Recommendation.** Model a **ranking representation** as declarative config, so "better dashboards"
= adding a representation, never editing `dockStats`:

```
type RankingRepresentation = {
  id: string;                       // "worst-coverage" | "best-coverage" | "vs-national" | "by-department"
  label: string;                    // es-AR sub-selector label
  source: "base" | "signal" | LayerId;   // which layer feeds it (#44 signal-driven)
  kind: "rate" | "density";
  order: "worst" | "best";          // drops "peores" from being hardcoded
  reference: "target" | "national-avg" | "none";  // what the gap column compares to
  grain?: AggregationLevel;         // #44 department-rate coverage
  columns: RankingColumn[];         // { key, header, unit } — see item 2
};
```

`dockStats` becomes: render a small `<select>`/segmented sub-selector over the representations
**valid for the current view** (the same `ViewState → allowed` gate #50 uses — a signal-source
ranking only appears when a signal layer is active; `by-department` only when the scope supports
department grain), then render the chosen representation through ONE table primitive. The empty/
suppressed/`dataUnavailable` honesty states (`RankedUnitsPanel.tsx:65-78`) move into the primitive
unchanged.

**Build as part of #33, or a pre-#33 increment?** A **thin pre-#33 increment is viable and worth
it**: introduce `RankingRepresentation[]` + the sub-selector for 2-3 representations
(worst-coverage, best-coverage, and — if a signal is active — signal-ranked) WITHOUT waiting for
the full `PanoramaViewState.representation` refactor. It is additive (new config + a `<select>`),
touches only `dockStats` + `ranking.ts`, and it de-risks #33 by proving the representation shape on
the cheapest surface. Fold the config into `ViewState.representation` when #33 lands (the
sub-selection becomes a projected ViewState field, deep-linkable + saveable for free). **Do NOT**
ship "more dashboards" as more bespoke `dockStats` branches — that is the exact debt #33 exists to
retire.

---

## 2. The unlabeled `-49` — **COSMETIC now / structural in #33**

**Confirmed: `-49` = brecha vs meta (points below the compliance target), NOT delta vs national
average.** Traced end to end:
- `RankedUnitsPanel.tsx:104-111` — for a `rate` row with a non-null gap it renders
  `−{Math.round(row.gap)}` inside a `<span>` whose ONLY label is `aria-label="brecha vs meta"`.
  Screen readers hear "brecha vs meta"; **sighted users see a bare `−49`** — no header, no unit.
- `ranking.ts:108` — `const gap = target - p.value` (target minus the unit's rate).
- `PanoramaConsole.tsx:2964` — `target: captionLayer.complianceTarget` feeds the rank.
- `layers.ts:253` — esterilización `complianceTarget = TARGETS.STERILIZATION_COVERAGE_PCT` = **70%**
  (`presets.ts:161` states "anchored at … (70%)"). Salta 21% ⇒ `70 − 21 = 49` ⇒ `−49`. **QED.**
  The first number `21%` is the coverage value (`:101-103`), also header-less in this panel.

Note the accessible twin already gets this right: `PanoramaDataTable.tsx:112-114` renders real
column headers — `Jurisdicción` / `Cobertura` (or `Eventos`) / `Brecha vs meta`. So the fix is
"bring the panel up to the table's honesty," and the correct label text already exists in-repo.

**Maps to the structure.** This is the PO's own stated rule — "siempre que pongamos listas o
números, indiquemos a qué pertenecen" — and it is the same principle as the ViewState
"encoding-carries-its-own-legend" idea from round 1 (finding 9's insetBehavior): a representation
should DECLARE what its numbers mean, not leave the reader to guess. The bare `−49` is that rule
violated on the Listas surface.

**Verdict: one-file label fix TODAY; structural in #33.** Two tiers:
1. **Now (COSMETIC, `RankedUnitsPanel.tsx`):** give the panel a header row or inline units. Because
   `RankedUnitsPanel` is a compact list, a mini header line ("Jurisdicción · cobertura · pts vs
   objetivo") above the `<ol>` is enough; or suffix the value with `%` (already done) and the gap
   with a visible " pts" plus a one-time legend caption. The gap column should read as
   **"pts vs objetivo"** (points vs the 70% target) — not a bare number.
2. **Durable (#33):** the `columns: { key, header, unit }[]` on `RankingRepresentation` (item 1)
   makes every column self-describing BY CONSTRUCTION — the table primitive reads headers+units
   from config, so no representation can ever ship a naked number again. This is why item 2 is
   "cosmetic today, but its permanent home is the representation declaring its columns."

Do the one-file fix in the same polish PR as item 3a; it does not wait for #33.

---

## 3. Registros vs Estadísticas — divergent components, redundant CAPA column

### 3a. Redundant "CAPA" column when one layer is active — **COSMETIC**

**Root cause.** `MapDataTable` unconditionally renders a Capa column:
- `MapDataTable.tsx:110-112` — a fixed `<th>Capa</th>` header; `:129` — every row prints
  `row.layer`. When `activeLayers` has one base layer, every row repeats the same layer name — a
  column with zero information (all rows identical). `PanoramaConsole.tsx:3496` feeds
  `mapTableRows` in with no dedup.
- The CSV twin (`MapDataTable.tsx:33` `CSV_HEADER`) intentionally keeps Capa — for an export that
  is fine (self-contained file), so gate the on-screen column, not the CSV.

**Signal-vs-noise on the Registros columns.** Today: Capa / Unidad / Valor. When 1 layer: Capa =
noise, Unidad + Valor = signal. When 2+ layers: Capa becomes signal (it disambiguates interleaved
rows) — so the column is conditionally useful, exactly the "drop when it repeats" case.

**Fix (COSMETIC).** Render the Capa column only when `activeLayers.length > 1`; when a single layer
is active, drop the column and instead name the layer once in the table caption / the dock meta
line (`PanoramaConsole.tsx:3462` already builds `"… · N capas"`). Pure presentational gate, no
data change, CSV unchanged. Fold into the item-2 polish PR.

### 3b. Registros and Estadísticas are two bespoke components doing ~the same job — **SOLVED-BY-#33 + #53**

**Audit — they ARE divergent bespoke tables of ONE view.** Three separate table shapes exist over
the same per-unit projection:
- **Registros** → `MapDataTable.tsx` — columns Capa/Unidad/Valor, **not sortable**, its own CSV
  builder, `"Protegido (k<5)"` suppression text, its own empty state (`:83-89`).
- **Estadísticas (primary)** → `RankedUnitsPanel.tsx` — a headerless `<ol>` of buttons, hover-sync
  with the map, `value` + `−gap`, its own empty/`dataUnavailable` states.
- **Estadísticas ("Ver tabla completa")** → `PanoramaDataTable.tsx` — a REAL sortable
  `<table>` with Jurisdicción/Cobertura/Brecha headers, its own sort state, its own empty states.

Three components, three column vocabularies, three empty-state implementations, two suppression
idioms — all rendering per-administrative-unit values of the currently-active layer(s). The PO's
instinct is correct: **Registros and Estadísticas are the same job** (tabulate the view's per-unit
data) shown with gratuitously different structure. The divergence is historical: `MapDataTable` was
the "accessible map table" (Ley 26.653) promoted into the dock's Registros tab
(`PanoramaConsole.tsx:3459-3461`), while `RankedUnitsPanel`/`PanoramaDataTable` grew from the
ia-v2 §3.3 ranking — they were never unified because there was no representation primitive to unify
them onto.

**Maps to the structure.** This is **#53 (design-system consistency)** on top of the missing
**`representation` axis**. In the ViewState model, Registros and Estadísticas are BOTH "Listas"
representations of ONE view (`viz-suite.md` axis 3) — they should share a visual + structural
family (one table primitive, one suppression idiom, one empty-state idiom, one sort behavior) and
differ ONLY in what they emphasize: Registros = raw per-unit rows (all units, layer-faceted);
Estadísticas = ranked/curated rows (worst/best-N, gap column). Same primitive, different
representation config — not two codebases.

**Recommendation.** Back both with a shared **`<DockTable>`** primitive driven by the
`RankingRepresentation`/columns config from item 1:
- Columns come from config (`{ key, header, unit }`) — fixes item 2 for both surfaces at once.
- One suppression cell renderer (`"Protegido (k<5)"`), one empty/`dataUnavailable` pair, one
  sort implementation, one CSV export.
- Registros = the representation `{ order:"none", columns:[unit,value], facetBy:"layer" }`;
  Estadísticas = `{ order:"worst", columns:[unit,coverage,gapVsTarget] }`. The map hover-sync stays
  a prop on the primitive (used by Estadísticas, off for Registros).
This is a #33 deliverable (it needs the representation config to exist), but the **#53 consistency
pass can start earlier** by at least unifying the empty-state + suppression + header idioms across
the three files even before the full primitive lands. Recommend: land the item-1 pre-#33 increment
and the `<DockTable>` primitive together, since they share the columns config.

---

## 4. KPI cards don't afford "tap to change the view" — **DESIGN-DECISION** (options ranked)

**Root cause (exact).** The 4 left cards are `KpiChips.tsx` (task #38 "KPI CARDS over the map"). A
card whose KPI id names a BASE-role map layer is a button that RE-BASES the choropleth
(`KpiChips.tsx:10-13, 123-135`, `onRebase(baseId)` → `onToggle` → radio-exclusive base swap). The
selected affordance is thin:
- `KpiChips.tsx:117-121` — active = `border-ln-op-azul bg-ln-op-card ring-1 ring-ln-op-azul/40`;
  idle = `border-ln-op-line bg-ln-op-card`. **The fill is identical** (`bg-ln-op-card`) in both
  states — deliberately opaque per #49 item 1 (translucent tints washed out over busy basemaps).
  So selection reads ONLY as a blue 1px border + a 40%-opacity 1px ring + (via `CardBody`
  `:172-176`) blue value text. That is the "thin blue border" the PO sees.
- `KpiChips.tsx:132` — hover = `hover:border-ln-op-celeste` (a faint border tint) — the only "these
  are interactive" cue, and it is invisible until hover.
- `KpiChips.tsx:127` — semantics are **`aria-pressed`** (toggle-button), NOT `role="radiogroup"` /
  `role="radio"` — even though the comment (`:11-12`) calls it "the radio-exclusive base swap." So
  the a11y model is weaker than the behavior; the true radiogroup pattern already exists next door
  in `PresetPanel.tsx:176-177` and should be adopted here (this UPGRADES a11y, it doesn't fight it).
- `KpiChips.tsx:143-150` — a KPI with NO base layer renders as a read-only `<div>` that looks
  **near-identical** to a clickable card (only cursor + tooltip differ). H8 already flagged this;
  visually the "which of these can I even tap?" ambiguity is unresolved.

**Maps to the structure.** These cards are the operator's control over the map's `encoding`/active
base layer — a first-class ViewState mutation (round 1: `scope` is mutated by explicit clicks; this
is the layer analog). The design principle from round 1 applies: an interactive control should
LOOK like the thing it does. It should also stay in the **v2C light-canvas aesthetic** (opaque
cards over the map, `ln-op-azul`/`ln-op-celeste` accents, `--radius-md`, the token ratchet — no new
arbitrary values). Critically, **`PresetPanel` (Vista) already owns the "segmented strip picker"
visual** directly above — so the KPI cards must read as selectable WITHOUT becoming a second
segmented strip (two stacked strips meaning different things would be worse than the status quo).

### Options (each buildable, with a sketch)

**Option A — Segmented "métrica" strip (borrow the PresetPanel pattern).** Wrap the base-selecting
cards in one bordered track; the active tab fills `bg-ln-op-azul/15 text-ln-op-azul`, idle
`text-ln-op-ink-2 hover:bg-ln-op-stripe` — literally `PresetPanel.tsx:139-148` strip classes.

```
┌───────────────────────────────────────────────┐
│ [ Antirrábica ]  Esteriliz.   Microchip   Pérd.│   ← active tab filled blue
└───────────────────────────────────────────────┘
```
- Pros: reuses a tested radiogroup+roving-focus pattern; unmistakably a picker; radiogroup a11y
  comes free.
- Cons: **fights the content** — these cards carry value + delta + sparkline (`CardBody`), and a
  single-line segmented strip is for bare labels. You'd lose the KPI richness. And it DUPLICATES the
  preset strip's look right below it. **Poor fit for rich tiles.**
- a11y: excellent (true radiogroup). v2C fit: clashes (double strip).

**Option B — Elevated active card: left accent bar + `seleccionado ●` + elevation.** Keep the cards
and the opaque fill (respects #49 item 1); make the ACTIVE card unmistakable with three redundant
cues: a solid 3px left accent bar (`bg-ln-op-azul`), a small `● seleccionada` pill top-right, and a
stronger shadow + `ring-2` (vs idle `shadow-sm`). Idle base cards get `cursor-pointer` + a persistent
faint "tap" hint so they read as interactive at rest, not just on hover.

```
┌─▎ Antirrábica          ● seleccionada ┐   ← accent bar + dot + ring-2 + shadow-lg
│▎ 64 %            ▲ +2 pts             │
└───────────────────────────────────────┘
┌  Esterilización                       ┐   ← idle: cursor-pointer, subtle "tocá para pintar"
│  38 %            ▼ −1 pts             │
└───────────────────────────────────────┘
```
- Pros: keeps rich KPI content + opaque fill; the active card is obvious via 3 cues; minimal
  departure from today's cards (low build risk).
- Cons: still card-shaped — the GROUP doesn't scream "one-of-a-set" as loudly as a radio control;
  the "seleccionada" pill adds a little chrome.
- a11y: pair with the radiogroup upgrade (see below). v2C fit: strong (opaque, token accents).

**Option C — Radio-affordance on the cards (recommended).** Add a small radio glyph to each
base-selecting card — `○` idle / `◉` (`ln-op-azul`) active — in the card's top-left, and promote the
group from `aria-pressed` to `role="radiogroup"`/`role="radio"` (the code already behaves as radio-
exclusive; this makes semantics match behavior, reusing `PresetPanel`'s exact pattern). The active
card keeps the blue border + blue value; the radio dot is the "one-of-a-set, tap to choose" signal.
Read-only reference cards (no base layer) simply carry **no radio dot** — which structurally fixes
the H8 clickable-vs-read-only ambiguity (`:143-150`) at the same time.

```
┌───────────────────────┐   ┌───────────────────────┐
│ ◉ Antirrábica    ▲+2 │   │ ○ Esterilización  ▼−1 │
│   64 %  ▁▂▃▅        │   │   38 %  ▂▂▁▂         │   ← ○ = tappable choice, not selected
└───────────────────────┘   └───────────────────────┘
   (active: filled dot,        (a read-only KPI card would have
    blue border, blue value)    NO dot at all — honestly non-tappable)
```
- Pros: fixes the ACTUAL root — the cards now read as "a set of choices, tap to change the map";
  simultaneously resolves the H8 read-only ambiguity (no dot ⇒ not a choice); upgrades a11y to a
  true radiogroup (matching the documented behavior); keeps rich KPI content AND opaque fill; visually
  DISTINCT from the preset strip above (dots-on-cards ≠ segmented strip), so no double-strip
  confusion.
- Cons: adds one glyph per card (minor density); the dot must be visually distinct from the tone
  glyph OpKpi already shows — place it leading the label, tone glyph stays with the value.
- a11y: best (real radiogroup + the dot is a visible selection indicator, not color-only). v2C fit:
  strong.

### Ranking & recommendation

**C > B > A.** Recommend **Option C as the primary direction, with B's active-card elevation
layered on** (accent bar + `ring-2` for the active card *plus* the radio dots). Rationale: C is the
only option that fixes the real defect (cards don't afford "one-of-a-set → tap changes everything")
AND resolves the pre-existing H8 read-only ambiguity AND upgrades the a11y from `aria-pressed` to
the true radiogroup the code already behaves as — while staying inside the v2C opaque-card aesthetic
and NOT colliding with the preset segmented strip directly above. B alone helps but leaves the
"is this a set of choices?" question soft; A is the wrong pattern for value+delta+sparkline tiles
and duplicates the preset strip. **This is the item the PO most wants answered: adopt C (radio dots
+ radiogroup semantics) + B's elevation for the active card. It is a `KpiChips.tsx`-local change,
no ViewState dependency, shippable now once the PO picks the direction.**

---

## Cross-cutting synthesis — the 4 items

**Classification.**
- **(i) Cosmetic / now:** item **2** (visible label/units on `RankedUnitsPanel` — one file) and
  item **3a** (drop the redundant CAPA column when 1 layer). One small polish PR, no ViewState
  dependency. Ship anytime.
- **(ii) Solved by the #33 representation system:** items **1** (representation-chooser + Listas
  sub-selector) and **3b** (a shared `<DockTable>` primitive backing both Registros and
  Estadísticas). Item 2's *durable* form (columns declare their own headers+units) also lands here.
  Item 1 is worth a **thin pre-#33 increment** (a `RankingRepresentation[]` + sub-selector for 2-3
  rankings) that de-risks #33 on the cheapest surface; do NOT grow more bespoke `dockStats` branches.
- **(iii) Design-decision the PO must pick:** item **4** — the KPI-card affordance. Recommendation
  is firm (Option C + B's elevation), but the visual direction is the PO's call.

**Items 1 & 3 are the SAME root** — exactly as round 1's items 8 & 9 shared the "imperative render
layer" root. Here the shared root is **the dock's list representations are underbuilt and
inconsistent**: there is no `representation` axis, so Estadísticas is one frozen worst-N list (item
1) and Registros/Estadísticas are three hand-wired table shapes of one view (item 3). #33's
representation system — declarative representations, grouped by intent (Listas/Tendencias/Flujos),
gated by the `ViewState → allowed` compatibility function (#50) — systematizes both at once:
"better dashboards" and "consistent tables" both become "add/parameterize a representation," never
"edit a bespoke component." Item 2 is the honesty rule (numbers self-describe) that the
representation's `columns` config enforces structurally; item 4 is an independent
`KpiChips.tsx`-local affordance decision that rides on none of the above.

**Round-2 scoreboard:** 4 findings → 3 buckets.
- **Cosmetic now (items 2, 3a):** one polish PR.
- **#33 representation system (items 1, 3b; item 2's durable form):** one root — Listas
  representations underbuilt + inconsistent; item 1 carveable as a pre-#33 increment.
- **Design-decision (item 4):** PO picks the card affordance — recommend Option C + B's elevation.
