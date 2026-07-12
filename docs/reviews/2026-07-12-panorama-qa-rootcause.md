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
