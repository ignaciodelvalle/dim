# Panorama zoom-progressive event points — implementation plan

Status: PO-approved 2026-07-08. Implementation TOMORROW. Read-only planning doc.
Scope: evolve the Panorama map to zoom-progressive semantics — fills = rates only,
far zoom = graduated count-bubbles (current), NEAR zoom (operator jurisdiction) =
REAL event-location points. This doc maps the current state, audits data readiness,
recommends decisions, and slices the work.

> Prerequisite: two fix agents are mid-flight. `repository.ts` has an UNCOMMITTED
> rewrite (137+/70-) making perdidas/mordeduras loaders count REAL production events
> (regression test `__tests__/perdidas-mordeduras-real-events.test.ts`, untracked).
> This plan assumes that rewrite lands first. Do NOT start Slice 1 on top of a dirty
> tree — rebase onto the committed fix.

---

## 1. Current-state map

**Layer registry** — `src/modules/panorama/domain/layers.ts`. Each layer has a
`renderPolicy: { province, locality, autoLevel }` of `RenderMode`
(`choropleth-fill | graduated-symbol | clustered-points`) and a `dataType`
(`rate | density | signal | reference`). Density+signal point layers
(perdidas, mordeduras, denuncias, zoonosis) currently declare
`graduated-symbol` at BOTH levels; reference layers (refugios, decomisos)
`clustered-points`.

**Aggregation axis is DERIVED, not manual** — `components/panorama/situational-map-utils.ts`:
- `Z_LOCALITY = 5` → `derivedLevel(scope, zoom)` returns `"province" | "locality"`.
  Any scope selection (province/locality) forces `locality`; national scope flips
  at `zoom >= 5`.
- `Z_DIVISIONS = 6.5` → `resolveDivisionProvinces(...)` decides which provinces
  render admin-division polygons (barrios/departamentos) in view.
- There is NO third "points" tier today. Level is strictly 2-state.

**Repository loaders** — `src/modules/panorama/infrastructure/repository.ts` (2235 lines):
- Per-unit AGGREGATION loaders (current live path for density/signal):
  `loadPerdidasByUnit`, `loadMordedurassByUnit`, `loadDenunciasByUnit`,
  `loadZoonosisByUnit` → COUNT(DISTINCT event) GROUP BY (province) or
  (province, locality), join `ar_localities` for centroid, `suppressSmallCells(k=5)`
  at locality only. Attribution is by the PET'S HOME jurisdiction (JOIN pets),
  NOT the event's own coords.
- Per-EVENT loaders that already SELECT `location_lat/lng` (the "real points"
  primitives, repository.ts ~201-383): `loadBiteEvents`, `loadOutbreakSignals`
  (both `isNotNull(petEvents.locationLat)`), `loadDenunciaCentroids` (COARSE —
  centroid only), `loadShelters`, `loadDecomisos` (centroid). NOTE: there is NO
  per-event perdidas loader; `buildPerdidasFeatures` exists but is unfed.
- Choropleth loaders: `loadChoroplethByLevel` (rate metrics delegate to canonical
  fetchers at province; count-density at locality — a known v1 limitation).
- `loadUnitHistory` (F4): drives the DetailDrawer "Historia de la unidad" panel;
  k-anon guard (k=5) at locality level per layer.

**Render** — `components/panorama/SituationalMap.tsx`. `PointRenderMode =
"graduated" | "reference"`:
- `addGraduatedPointLayer` (~1013): one NON-clustered circle per unit, `circle-radius`
  step on `count`. No MapLibre clustering.
- reference layers (~1075): MapLibre native clustering (`cluster:true`,
  clusterRadius 48, clusterMaxZoom 12), cluster bubbles zoom on click, unclustered
  pins open DetailDrawer.
- Province choropleth: `geometry:null` features data-join the shared `ar-provinces`
  basemap fill.

**Data flow** — `components/panorama/PanoramaConsole.tsx`: derives `level` from
(scope, zoom), builds `/api/panorama/[layer]?...&level=` fetches, assigns
`renderMode = geomType==="point" ? (isAggregatedPointLayer ? "graduated" : "reference")`.
API route `app/api/panorama/[layer]/route.ts` re-narrows govt scope
(`narrowGovtScope`) and admin drill-down, `level` is `province|locality` only.

**k-anon suppression paths**: `suppressSmallCells(k=5)` in the locality aggregation
loaders + the `loadUnitHistory` per-layer count guard. Province level never
suppressed (large cells).

---

## 2. Data-readiness audit (the crux)

Where do REAL event coordinates actually live? Verified against writers.

| Layer | Event(s) | Columnar `location_lat/lng`? | Fill-rate | Verdict |
|---|---|---|---|---|
| **perdidas — sightings** | `note_added` kind=sighting (`report-pet-sighting.ts`) | **YES, always** (`requireCoords:true`) | ~100% of sightings | ✅ Real dots ready |
| **perdidas — lost mark** | `status_changed` to_status=lost (`set-pet-lost-use-case.ts`) | **Optional** (only if owner dropped a pin) | partial/low | ⚠️ Dot when present, else fallback |
| **perdidas — scan GPS** | `credential_scanned` payload `scan_coords` (`log-scan.ts`) | **No** (JSONB, not columnar) | lost-only, scanner device, **90-day purge** | ❌ Do NOT use in Slice 1 (separate field + retention + privacy review) |
| **mordeduras** | `incident_reported` (`report-bite.ts`, `report-bite-from-org.ts`) | **NONE** — neither writer sets `location_lat/lng`; only `location_description` text + jurisdiction in payload | 0% | ❌ BLOCKED — no coords exist |
| **denuncias** | `welfare_reports` | exact coord **NEVER SELECTed** (hard invariant); only locality centroid | n/a | ❌ Real points forbidden; centroid only |
| **zoonosis** | `outbreak_signal` (`loadOutbreakSignals` filters `isNotNull(locationLat)`) | writer UNVERIFIED — confirm before Slice 3 | unknown | ⚠️ Verify writer sets coords |

**Fallback rule (define once, reuse):** an event with no columnar coord is NOT
plotted as a real dot. It is counted into a `sin ubicación` residual surfaced in
the legend/panel — mirroring the existing `noLocalityCount` "no-locality residual"
disclosure (commit 0a47d912). Do NOT invent a centroid dot for a missing event coord
(that would fake precision). So the points layer = real dots + an honest
"N eventos sin punto exacto" line.

**Consequence for slicing:** only PERDIDAS has real event coordinates today (driven
by sightings). Mordeduras real-dots is blocked on a writer change (capture a point
in the bite form). This reorders effort — see §4.

---

## 3. Design decisions (recommend and proceed)

**D1 — Zoom threshold for dot mode.** Add `Z_POINTS = 10` (deeper than
`Z_DIVISIONS=6.5`). Rationale: real dots are only legible / only defensible
(operator is looking INSIDE their turf) at street scale. Reuse the existing derived
machinery: add a `pointsEligible(scope, zoom)` predicate rather than a 3rd `level`
enum value (minimizes churn in the level→cache plumbing). Points mode is active when
`zoom >= Z_POINTS AND unit is inside the operator's authorized scope`.

**D2 — Scope-gating (the privacy hinge).** Real dots render ONLY inside the
operator's jurisdiction. There is NO new `jurisdictionScopeContains` primitive needed:
govt operators are ALREADY constrained by `petsScope`/`jurisdictionColumnsScope`
(returns `false`/assignment-pairs) so a govt user physically cannot fetch out-of-scope
rows. Admin sees all → gate the DOT MODE on admin having drilled into a
province/locality (`adminProvince` set), otherwise admins keep aggregated bubbles even
zoomed in (no national dot-dump). Encode as: `pointsEligible = zoom>=Z_POINTS &&
(scope.province != null)`.

**D3 — Render: clustering vs raw dots.** Reuse the reference-layer MapLibre
clustering path (`cluster:true`, existing `addReferenceLayer`), NOT raw dots — a busy
locality would otherwise blow the dot cap. New `PointRenderMode = "points"` that
shares the clustered-pin renderer but styles per-layer color and opens the DetailDrawer
on an individual dot. Keep `PER_LAYER_CAP=2000` + viewport culling.

**D4 — New per-event loader.** Add `loadPerdidasEvents(level-gated)` selecting
`petEvents.locationLat/lng`, `pets.publicToken`, `pets.name`, `pets.species`,
`pets.status`, `occurredAt`, filtered by `perdidasEventPredicate()` +
`isNotNull(locationLat)` + scope + period. Feed the EXISTING `buildPerdidasFeatures`
(its `LostPointRow` shape already matches). Return the residual count
(`sin ubicación` = matching events with null coord) in the envelope, reusing the
`noLocalityCount` field.

**D5 — Render-policy schema.** Extend `RenderPolicy` with an optional
`points?: RenderMode` (the near-zoom mark) so the descriptor stays declarative;
absence = layer never shows real dots (denuncias, mordeduras until its writer lands,
reference layers). Resolve mark as: `pointsEligible ? renderPolicy.points ?? renderPolicy[level] : renderPolicy[level]`.

**D6 — API surface.** EXTEND the existing `[layer]` route, do NOT add an endpoint.
Add a `mode=points` (or reuse a `zoom`/`level=points`) query param that the console
sets when `pointsEligible`. The route already threads scope+period+asOf; the use-case
switches the density loader between aggregated and per-event by this flag. One route,
one envelope, one cache keying discipline.

**D7 — Interaction.** Dot click → DetailDrawer showing the pet card the operator can
already access (public token → existing authz on `/gob/perdidas` / pet detail). No NEW
disclosure: the perdidas dot exposes only what `buildPerdidasFeatures` already carries
(token, name, species, status, lastSeenAt) — all public-by-consent for a lost pet.

**D8 — Denuncias & mordeduras stay aggregated.** Denuncias: centroid cap is the
invariant; at most render one centroid bubble per locality (current behavior), never
per-report dots (all snap to the same centroid → meaningless overplot + centroid IS
the privacy floor). Mordeduras: aggregated until the bite form captures a point (§4
Slice 2). Zoonosis: decided in Slice 3 after verifying the writer.

---

## 4. Phasing

### SLICE 1 (TOMORROW) — perdidas real dots at jurisdiction zoom
The ONLY layer with real coords today. Highest value, unblocked.
- **Files**:
  - `domain/types.ts` + `layers.ts`: add `RenderPolicy.points`, set
    `perdidas.renderPolicy.points = "clustered-points"`.
  - `situational-map-utils.ts`: add `Z_POINTS=10` + `pointsEligible(scope, zoom)`.
  - `infrastructure/repository.ts`: add `loadPerdidasEvents(...)` (per-event, coord
    non-null, scope, period, residual count).
  - `application/get-layer-features.ts`: route perdidas to `loadPerdidasEvents` +
    `buildPerdidasFeatures` when `mode=points`; else keep aggregated.
  - `app/api/panorama/[layer]/route.ts`: parse `mode=points`, pass through.
  - `components/panorama/PanoramaConsole.tsx`: set `mode=points` + `renderMode="points"`
    when `pointsEligible`; cache keying includes mode.
  - `SituationalMap.tsx`: `PointRenderMode` gains `"points"` sharing the clustered
    renderer with per-layer color; individual dot → DetailDrawer.
- **Tests**: pure `pointsEligible` unit test; `buildPerdidasFeatures` already tested;
  a loader integration test mirroring `perdidas-mordeduras-real-events.test.ts`
  asserting coord'd sightings become dots and null-coord lost-marks fall into the
  residual; a `get-layer-features` test for the mode switch.
- **Risks**: dot cap on a dense locality (mitigate: clustering + cap + residual line);
  cache-key collision if `mode` omitted from the key (bug-prone — assert in test).
- **es-AR copy**: legend "Puntos de eventos (ubicación real)"; residual line
  "N avisos sin punto exacto"; DetailDrawer unchanged (perdidas body exists).

### SLICE 2 — mordeduras scoped dots (BLOCKED on a writer change)
- **Prerequisite (NEW work, not in original plan)**: `report-bite.ts` +
  `report-bite-from-org.ts` must capture and persist `location_lat/lng` on the
  `incident_reported` event (add a map-point field to the bite form, route through
  `writePoint`/`normalizeLocationForWrite`). Until then `loadBiteEvents` returns zero
  and there is nothing to plot. FLAG to PO: mordeduras real-dots needs this writer
  change first.
- **Files** (after writer lands): reuse `loadBiteEvents` (already selects coords) +
  `buildMordedurasFeatures`; add `mordeduras.renderPolicy.points`; same console/map
  wiring as Slice 1. Privacy: real points ONLY within operator scope; aggregated
  outside (already enforced by `petEventsScope`).
- **Tests**: writer test that a bite persists a point; loader → dot; scope-gate test
  (out-of-scope govt gets aggregated, never dots).
- **Risk**: victim re-identification at street scale — bite dots must never render on
  public surfaces and only inside the operator's own jurisdiction (D2 gate).
- **es-AR**: legend "Mordeduras (ubicación real, jurisdicción)".

### SLICE 3 — denuncias barrio-snap + zoonosis decision
- **Denuncias**: NO real points (invariant). Confirm the near-zoom mark stays the
  locality centroid; if PO wants finer, the ONLY defensible step is barrio-centroid
  (not exact) via the existing `ar_localities` centroid resolution — still coarse,
  still k-anon. Keep the "ubicación aproximada" DetailDrawer notice.
- **Zoonosis**: FIRST verify the `outbreak_signal` writer sets columnar coords. If yes
  → real dots inside scope like Slice 1 (public-health signals are not personal data,
  lower privacy bar, but still scope-gate to avoid a national dot-dump). If no → stays
  aggregated + document the gap. Justify from the same principles: signal points are
  not individual PII, so real dots are acceptable where coords exist and scope holds.
- **Tests**: writer-coord verification; loader → dot or documented residual.
- **es-AR**: reuse Slice 1 residual copy.

---

## 5. Risks & invariants checklist

- [ ] **Privacy (AGENTS.md #privacidad)**: denuncias exact coord NEVER SELECTed
  (repository comment invariant) — unchanged. Scan `scan_coords` NOT repurposed.
- [ ] **k-anon (k=5)**: aggregates keep suppression. Individual dots only where the
  operator already sees case-level data in their queues (perdidas → `/gob/perdidas`,
  bites → `/gob/vigilancia`) — NO new disclosure. NEVER on public routes.
- [ ] **Scope-gate is the privacy hinge**: dots require `zoom>=Z_POINTS` AND
  `scope.province != null`; govt physically scope-bound by `petsScope`; admin must
  drill in. Assert with a test that a national/out-of-scope view yields aggregated.
- [ ] **Fallback honesty**: null-coord events → `sin ubicación` residual, never a fake
  centroid dot (reuse `noLocalityCount` disclosure pattern).
- [ ] **Perf**: reuse MapLibre clustering + `PER_LAYER_CAP=2000` + viewport culling;
  cap the dot source; no per-event fetch above the cap.
- [ ] **CSP**: no external tiles — dots ride the existing self-hosted basemap; no new
  network origins. Unchanged.
- [ ] **In-flight prerequisites**: (a) the uncommitted `repository.ts` real-events
  rewrite must land + commit first; (b) do not clobber the untracked regression test;
  (c) rebase, don't fork.
- [ ] **Cache keying**: `mode=points` MUST be part of the console's per-layer cache key
  or a zoomed-in fetch will paint stale aggregated data (regression-test it).

---

## Decisiones para el PO

Only two genuinely need his call; everything else is recommend-and-proceed:

1. **Mordeduras needs a writer change first.** Bite events carry NO location point
   today (both writers omit it). Real bite dots (Slice 2) require adding a
   map-point capture to the bite report form. OK to add that field, or keep
   mordeduras aggregated-only for now? (Recommendation: add the field — it's the
   same location-capture UX already used in sightings.)
2. **Scan GPS as a perdidas dot source — out of scope for Slice 1.** `scan_coords`
   is a scanner's device GPS, lost-only, purged at 90 days, stored in JSONB not the
   columnar field. Using it would need a separate loader + a privacy review.
   Recommendation: exclude from Slice 1; revisit only if sighting coverage proves
   too sparse.

---

## Review adversarial (2026-07-08)

Read-only reviewer. Re-verified every load-bearing claim against CURRENT git
state (the in-flight `repository.ts` rewrite is now COMMITTED as `c01bec56`
"perdidas/mordeduras loaders read production event shapes"; tree is clean of it;
`perdidasEventPredicate` is live). All file:line references below are the main
tree, not the worktrees.

### Verdict: **SOLID-WITH-FIXES**

The data-readiness audit is ACCURATE end-to-end and the component-reuse claims
hold. But three amendments are load-bearing for privacy correctness and must be
folded in BEFORE coding, not discovered during it. Foundation is solid; the plan
under-specifies the server-side gate and over-claims uniform public-by-consent.

### Claims VERIFIED (defend these — I quoted the code)
- **Sightings always columnar coords.** `report-pet-sighting.ts:92`
  `normalizeLocationForWrite(loc, { locality: "none", requireCoords: true })`
  then inserts `locationLat/locationLng` (l.193-194). ✅
- **Lost mark optional coord.** `set-pet-lost-use-case.ts:150`
  `writePoint(locationLat && locationLng ? {…} : null)` → columnar, null when the
  owner dropped no pin. ✅
- **Scan GPS is JSONB, lost-only, self-scan-exempt, 90-day purge.** `log-scan.ts:135`
  `!isSelfScan && pet.status === "lost" ? sanitizeCoords(...) : null`; written to
  `payload.scan_coords` (l.162), never the columnar column. ✅ Do NOT use in Slice 1.
- **Both bite writers persist NO columnar coord.** `report-bite.ts:118-134` and
  `report-bite-from-org.ts:143-159` build `incident_reported` with
  `location_description` + `jurisdiction_*` only; neither passes `locationLat/Lng`
  to `insertIncidentEventIdempotent`. `loadBiteEvents` filters `isNotNull(locationLat)`
  (repository.ts:215) → returns 0 rows today. Mordeduras real-dots BLOCKED. ✅
- **Denuncias exact coord never SELECTed.** `loadDenunciaCentroids` resolves the
  `ar_localities` centroid via correlated subquery; comment + code confirm the
  exact `welfare_reports.location_lat/lng` is never read (repository.ts:284-300). ✅
- **`buildPerdidasFeatures` + `LostPointRow` exist and match** (build-features.ts:16,41)
  and emit province-LESS props (`token/name/species/status/lastSeenAt`).
- **DetailDrawer already renders the dot.** `DetailDrawer.tsx:264` `case "perdidas"`
  FeatureBody shows Especie + "Visto por última vez" (`lastSeenAt`) + DrillLink to
  `/gob/perdidas`. And because dot props carry NO `province`, `shouldFetchHistory`
  (l.374-378) returns false → a dot click shows the pet body only, with NO k-anon
  unit-history double-fetch. This is automatically airtight — keep it that way by
  NOT adding `province` to `LostPointProps`.
- **Govt physical scope-binding holds.** `jurisdictionColumnsScope` returns `false`
  for a govt user with no assignments and pair-clauses otherwise (repository.ts:145);
  `petsScope`/`petEventsScope` route through the same projection context. A govt
  user cannot widen to a neighboring province.

### BROKEN / IMPRECISE claims — required amendments

**A1 (privacy-critical). The points gate must be SERVER-authoritative, not the
console.** The route derives `adminProvince` ONLY when a province is selected
(route.ts:100); for admin with no province, `petsScope` → `null` → NATIONAL
(repository.ts:80-96, comment l.78 "admin → null (national)"). D6 reads as trusting
the `mode=points` flag ("the use-case switches the density loader … by this flag").
If the server honors the flag without an independent province check, a crafted
`GET /api/panorama/perdidas?mode=points` from ANY admin session with no province
dumps every lost-pet + sighting coordinate in the country. REQUIRED: the route
computes `pointsMode = modeParam === "points" && provinceObj != null` and, for
admin, only when `adminProvince` is set — server-side, never client-trusted. Add a
test: admin + `mode=points` + no province → aggregated, never dots. `pointsEligible`
in the console is UX only; it is NOT the security boundary.

**A2. D2's "dots render ONLY inside the operator's jurisdiction" is FALSE as
written.** `loadPerdidasByUnit` scopes by `petsScope` (repository.ts:1128) =
attribution by `pets.jurisdiction_province` (the pet's HOME), while the dot plots
at the EVENT coordinate. A pet homed in province X but sighted in Y yields a dot
physically in Y, visible to the X operator; the Y operator does not see it. Not a
breach (it is the X operator's own case) but restate D2: dots are scoped to the
operator's OWN cases (pet-home attribution) and MAY plot outside the province
boundary. Also: `loadPerdidasEvents` must use `petsScope` (like `loadPerdidasByUnit`),
NOT `petEventsScope` — and ignore the STALE comment at repository.ts:1114 that says
"SAME scope as loadBiteEvents (petEventsScope)"; the code there actually uses
`petsScope`.

**A3. The lost-mark coordinate is NOT uniformly public-by-consent — restrict Slice 1
to SIGHTINGS.** `perdidasEventPredicate` (repository.ts:174-178) matches BOTH
`status_changed to_status=lost` AND `note_added kind=sighting`. D4's
`perdidasEventPredicate() + isNotNull(locationLat)` therefore plots lost-mark coords
too. The lost-mark coord is the owner's last-seen, governed by
`discloseLastLocationWhenLost` (set in the same writer) — NOT unconditionally public
like an anonymous finder's sighting. D7's "all public-by-consent" is airtight ONLY
for sightings. RECOMMEND: Slice 1 loader filters to `note_added kind=sighting` only
(the ~100% coverage source per §2), deferring lost-mark dots until the
disclosure-pref interplay is designed. This keeps the k-anon-bypass justification
(individual dot on a k-suppressed cell) uniformly airtight for PUBLIC-by-consent
perdidas.

### Secondary fixes (handle during implementation, but note now)
- **A4. Keep `mode` ORTHOGONAL to `level`; reject the "level=points" alternative in
  D6.** The route coerces any non-"province" level to "locality"
  (route.ts:76) — "level=points" silently becomes locality with NO loader switch.
  A separate `mode=points` is also what PROTECTS the C2 "level MUST match
  initialLevel" contract (PanoramaConsole.tsx:211-213): level stays 2-state, mode is
  additive. D1's predicate-not-3rd-enum choice is correct; make D6 unambiguous.
- **A5. The console cache has no `mode` dimension.** It is `dataRef` (locality) +
  `provinceDataRef` (province), each `Map<layerId, FC>` (PanoramaConsole.tsx:613-619).
  In points mode `level==="locality"` (zoom ≥ Z_LOCALITY=5), so points data collides
  with the locality-aggregated cache for the same layer id. §5 flags "include mode
  in key" but under-scopes it: needs a third slot or a composite key. Real work; add
  a toggle-collision test (points↔aggregated at same level → no stale paint).
- **A6. `noLocalityCount` reuse carries the WRONG copy.** The existing residual
  (0a47d912) means "pets with unknown HOME jurisdiction"; reusing the field for
  "events with null coord" makes the console's residual renderer show jurisdiction
  copy, not "N avisos sin punto exacto". Branch the renderer on mode, or use a
  distinct field.
- **A7. D5's `renderPolicy` is decorative at runtime.** `renderPolicy` is referenced
  only in domain (`layers.ts`, `types.ts`, `caption.ts`) — NOT in the console/map.
  renderMode is chosen imperatively: `isAggregatedPoint ? "graduated" : "reference"`
  (PanoramaConsole.tsx:625-626). Adding `renderPolicy.points` is documentation-only;
  the real switch must be added to that derivation. "Stays declarative" overstates it.
- **A8. "Viewport culling" is unsubstantiated.** No loader takes a bbox; MapLibre
  clustering is client-side over all fetched (≤ `PER_LAYER_CAP=2000`, repository.ts:64)
  points. For a POINTS layer, hitting the cap SILENTLY drops real dots — ensure the
  LayerPanel surfaces "mostrando 2000 de N" via the existing `truncated` flag. Drop
  the cull claim or scope it as future work; scope + cap + client clustering is the
  actual mitigation.

### Missing pieces
- **a11y**: individual dots are canvas-rendered, not keyboard-focusable (pre-existing
  MapLibre gap shared with reference layers — no regression, but the accessible
  fallback is the `/gob/perdidas` queue; state that).
- **reduced-motion**: cluster-click `flyTo` is a pre-existing reference-layer
  behavior; if `prefers-reduced-motion` isn't already honored there, points inherits
  the gap.
- **Tests to ADD** beyond the plan's list: (1) admin + `mode=points` + no province →
  aggregated; (2) govt dots never include a neighboring province; (3) cache
  points↔aggregated collision; (4) loader maps `occurredAt` → `LostPointRow.lastSeenAt`.

### GO / NO-GO
**GO for Slice 1 TOMORROW**, conditional on A1 (server-authoritative gate), A3
(sightings-only), and A4 (mode orthogonal to level) being written into the plan
before coding — those three are load-bearing for privacy correctness. A2/A5/A6/A7/A8
are correctness/clarity fixes safe to resolve during implementation. The foundation
(data-readiness audit + component reuse) is verified solid.
