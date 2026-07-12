# Panorama ViewState — concrete design (the shape, before migration)

> The PLAN-FIRST artifact the master plan (`panorama-viewstate-master-plan.md`) gates P1 on.
> This fixes the SHAPE of the canonical value, its projection boundaries, and the
> capability/encoding/LOD schema **before** any call site is migrated. The risk of this
> refactor is entirely in the shape; everything after is mechanical.
>
> Status: DRAFT for PO review (task #50, overnight run). Grounded against `integration/all-20260703`.

---

## 0. The one decision this document makes

Today the panorama's *what-is-selected-and-how-it-is-shown* lives in **6+ places** (URL params,
`useState`/`useRef`, effects, `compatibility.ts`, a `temporal` flag read ~11×, hardcoded preset
strings, hand-synced points-mode across 3 files, 3 color systems). This design collapses that into:

```
PanoramaViewState  ── the single canonical value (what the operator selected)
       │
       ▼
capabilitiesFor(viewState, runtime) ── ONE pure function (how it must be shown)
       │
       ├──► map layers + encoding (fill/scale/legend)
       ├──► KPIs / metrics column
       ├──► dock (registros / stats / timeline)
       ├──► caption ("explain this view")
       ├──► CABA inset
       └──► URL (serialize) + saved views + embed
```

**Discipline:** `(ViewState, runtime) → render`, the exact `(events, filters) → view` discipline the
data layer already uses, applied to the *view* layer. Two surfaces reading one value **cannot diverge** —
the coherence invariant stops being defended per-fix and becomes structurally impossible.

---

## 1. `PanoramaViewState` — the canonical value

```ts
// src/modules/panorama/domain/view-state.ts  (NEW, pure — no @/db, no next, no React)

export type PanoramaViewState = {
  /** WHAT data is in view. Data-scope only — NOT the camera. */
  scope: PanoramaViewScope;

  /** The analytic window selector. Resolves to {from,to} via resolveAnalyticsPeriod. */
  period: PanoramaViewPeriod;

  /** The time-scrubber cut. null = live edge (current state). */
  asOf: string | null;                 // ISO timestamp | null

  /** Bitemporal replay lens. Only meaningful while asOf != null. */
  basis: TimeBasis;                    // "valid" (occurred_at) | "transaction" (recorded_at)

  /** Active layers, in activation order [base, signal?, ...references]. */
  layers: LayerId[];

  /** Vet-signed filter (the `?verified=1` toggle). A real data-scope axis. */
  verifiedOnly: boolean;

  /** The preset this view came from (null once the operator hand-edits into "modo avanzado"). */
  preset: PresetId | null;

  /**
   * Encoding SELECTION. `null` = "auto": capabilitiesFor derives the encoding from
   * preset + layers exactly as today (P1 keeps this null everywhere — no behavior change).
   * An explicit id is the seam #24 (encoding switcher) wires later.
   */
  encoding: EncodingId | null;

  /** Which surface the dock foregrounds. Today = the dock tab. #33 expands the enum. */
  representation: Representation;

  /**
   * OPTIONAL camera frame, for reproduction only (deep-link / saved view / embed).
   * The LIVE zoom used for LOD is a RUNTIME input to the projection, NOT stored here
   * (storing continuous zoom would thrash the canonical value on every pan).
   */
  camera?: CameraFrame | null;
};

export type PanoramaViewScope =
  | { kind: "national" }
  | { kind: "province"; province: string }
  | { kind: "locality"; province: string; locality: string };

export type PanoramaViewPeriod =
  | { kind: "preset"; preset: AnalyticsPeriodPreset }   // "30d" | "90d" | "12m" | "3a" | ...
  | { kind: "custom"; from: string; to: string };       // ISO dates

export type Representation = "registros" | "stats" | "timeline"; // = PanoramaDockTab today
// FUTURE (#33 viz-suite): "map" | "estadisticas" | "tendencias" | "flujos" join this union.

export type EncodingId =
  | "choropleth-seq"   // classed sequential (density / non-meta rate)
  | "choropleth-meta"  // classed META (rate layers with a complianceTarget)
  | "bivariate"        // riesgo-brotes 3×3 (coverage × signal)
  | "graduated"        // graduated symbols (aggregated points at province/locality)
  | "points"           // real event-location dots (near-zoom)
  | "reference"        // discrete pins (refugios / decomisos)
  | "glow";            // signal glow — NEW in P4 (warm transparent radial, CVD-validated)
// delta / lag / heatmap are named by the master plan as future encodings; declared when built.

export type CameraFrame =
  | { kind: "national" }
  | { kind: "bbox"; bounds: [[number, number], [number, number]] };
```

### 1.1 What is STORED vs what is DERIVED

The single most important table in this design. If a value can be computed from the ViewState, it is
**not** stored — storing it is what let two surfaces disagree.

| Value | Today | In this design |
|---|---|---|
| scope (province/locality) | URL param + props | **STORED** (`scope`) |
| period window {from,to} | resolved from `?period`/`?from`/`?to` | DERIVED from `period` via `resolveAnalyticsPeriod` |
| asOf cut | `useState` + URL `?asOf` | **STORED** (`asOf`) |
| basis | `useState` (not URL) | **STORED** (`basis`) — URL-opt per §4.2 |
| active layers | `useState` + URL `?layers` | **STORED** (`layers`) |
| verified-only filter | `useState` + URL `?verified=1` | **STORED** (`verifiedOnly`) |
| preset id | `useState` + URL `?preset` | **STORED** (`preset`) |
| **aggregation level** (province/locality) | `useState` + URL `?level` + hysteresis effect | **DERIVED** `derivedLevelWithHysteresis(prev, scope, zoom)` — but see §4.3: `?level` stays a URL SEED in P1 |
| **encoding** (seq/meta/bivariate) | inline `isMeta` ×3 + preset strings | **DERIVED** by `capabilitiesFor` (unless `encoding` set) |
| **points-mode on/off** | `POINTS_LAYER_IDS` + `pointsEligible` across 3 files | **DERIVED** from `representationPerZoom` (P4) |
| which controls enabled | `temporal` flag read ~11× | **DERIVED** `capabilities.allowedControls` |
| dock tab | `useState` (`dockTab`) | **STORED** (`representation`) |
| camera zoom/center (live) | maplibre internal | RUNTIME input for LOD; not in the canonical value |
| camera FRAME (for reproduction) | URL `?z/lat/lng` (continuous shallow sync) + preset `framing` | **STORED optional** (`camera`) — already URL-backed today, must be preserved |

### 1.2 Reserved axis — attribute filters (#44), not built yet

The one operator-facing data axis on the horizon that this shape does NOT yet name: **attribute
filters** (species / sex / status), the `#44` "attribute filters" feature gap. It does not exist as a
panorama control today, so — per this design's own discipline (no speculative fields) — it is NOT added
now. But when #44 builds it, it MUST land as a first-class ViewState axis:

```ts
filters: AttributeFilter[];   // e.g. [{ field: "species", in: ["dog"] }, { field: "sex", in: ["f"] }]
```

routed through the SAME `viewStateToParams`/`viewStateFromParams` boundary (so it deep-links and saves
for free) and gated by `capabilitiesFor` (which attribute filters apply to the active layers). The
failure mode to avoid is #44 shipping attribute filters as another scattered `useState` beside the
canonical value — that would reintroduce exactly the divergence this refactor removes. Reserved here so
the axis lands IN the structure, not next to it.

---

## 2. `capabilitiesFor` — the declarative gate

```ts
// src/modules/panorama/domain/capabilities.ts  (NEW, pure)

/**
 * The single gate. Given the canonical value + the runtime facts a projection
 * cannot know statically (live zoom, the loaded data extents), returns everything
 * every surface needs to render coherently. NO surface re-derives any of this.
 */
export function capabilitiesFor(
  view: PanoramaViewState,
  runtime: {
    /** live camera zoom — the only continuous input; drives LOD band selection */
    zoom: number;
    /** loaded feature extents / value domains per active layer (for scale domains) */
    data?: CapabilityData;
  },
): PanoramaCapabilities;

export type PanoramaCapabilities = {
  /** the resolved aggregation level (province | locality) — DERIVED, single source */
  level: AggregationLevel;

  /** which modifiers apply — replaces every `layer.temporal` read site */
  allowedControls: {
    scrubber: boolean;          // temporal layers present ⇒ scrubber live
    basisToggle: boolean;       // scrubbing AND a temporal base ⇒ valid/transaction lens
    bivariateEligible: boolean; // base is a rate-with-target AND a signal is active
  };

  /** which dock tabs / representations light up (temporal off ⇒ no timeline) */
  allowedRepresentations: Representation[];

  /** the encoding for what is painted — scale ALWAYS matches paint (structural) */
  encoding: ResolvedEncoding;

  /** CABA inset: visibility + the SAME encoding the main map uses (structural) */
  insetBehavior: { visible: boolean; encoding: ResolvedEncoding | null };

  /** LOD — the representation to draw at each zoom band, per layer (P4) */
  representationPerZoom: Record<LayerId, ZoomRepresentation>;
};
```

`capabilitiesFor` is the ONLY place the following formerly-scattered decisions live:

1. **bivariate gating** — today `preset === "brotes-activos"` hardcoded string (PanoramaConsole ~2134).
   Becomes: `allowedControls.bivariateEligible = base.dataType === "rate" && base.complianceTarget != null && signalPresent`. The `brotes-activos` preset *satisfies* this predicate; no preset id is ever named in code.
2. **isMeta** — today an inline `dataType === "rate" && complianceTarget != null` predicate, copy-pasted **×4**
   (`SituationalMap.tsx:1936` and `:2814`, `MapLegends.tsx:138`, `map-popup.ts:68`).
   Becomes: the resolved `encoding.kind` (`choropleth-meta` vs `choropleth-seq`), computed once.
3. **points-mode** — today `POINTS_LAYER_IDS` (`layers.ts`) + `pointsEligible(zoom, scope)`
   (`situational-map-utils.ts`) + the imperative render switch (`PanoramaConsole.tsx:1519-1526`), hand-synced.
   Becomes: `representationPerZoom[layer]` read against live zoom (P4). The declaration already exists on
   `layer.renderPolicy` (documented as "intent only, runtime is imperative" — A7); P4 makes the runtime READ it.
   **Guardrail:** the SERVER-side eligibility re-check in `get-layer-features.ts:55,249` is the real security
   boundary (client `pointsEligible` is UX-only) and MUST stay a separate server-side gate — P4 does not collapse it.
4. **temporal** — today `layer.temporal` read ~11× (dim non-temporal layers, disable scrubber, KPI as-of…).
   Becomes: `allowedControls` + `allowedRepresentations` (temporal off ⇒ timeline tab greyed).

A `capabilities.test.ts` cross-checks the registry: for every layer/preset/scope/zoom combination, the
gate's output is asserted (the guard that would have caught the coherence drift 5/5 times).

---

## 3. First-class `Encoding` (P3)

An encoding = **(data field, scale, legend, suppression style)**, declared once, resolved by the gate.

```ts
export type ResolvedEncoding = {
  kind: EncodingId;
  /** the polygon/feature property painted */
  field: string;
  /** the MapLibre fill/paint spec source — built from ONE scale, shared with the legend */
  scale: ClassScale | DivergentScale | BivariateScale | GraduatedScale | GlowScale;
  /** the legend rows — built from the SAME scale object (scale-matches-paint = structural) */
  legend: LegendModel;
  /** how suppressed (k<5) cells are drawn */
  suppression: SuppressionStyle;   // "hatched" | "muted"
};
```

The three color systems reconcile INTO this:

| Today | After |
|---|---|
| `province-choropleth-style.ts` (`provinceColorExpr`, `provinceMetaColorExpr`, `provinceDivergentColorExpr`) | `choropleth-seq` / `choropleth-meta` encodings; **`provinceDivergentColorExpr` is DEAD** (replaced by the META path — PO decision) → DELETE |
| `class-scale.ts` (`computeClassScale`, `stepColorExpr`) | the scale builder behind `choropleth-*` |
| `bivariate-fill.ts` (`bivariateFillColorExpr`, palette, legend grid) | the `bivariate` encoding |
| `viz-scales.ts` (`getRamp`, `ScaleKey`) | `getRamp`/`ScaleKey` are **unused** → DELETE; keep the tokens the encodings reference |

**Structural guarantees that fall out:**
- *Scale matches paint* — legend and fill both read the one `scale` object; they cannot drift.
- *CABA inset same color* — `insetBehavior.encoding` IS the main `encoding`; the inset projects it (no
  separate fill decision). `lerpHex`/`colorForValue` sample the SAME scale for the inset's flat fill.

Note (surfaced, non-blocking): `bivariate-fill.ts`'s palette comments still describe the **retired dark
navy canvas** (`#0b1020`); the console flipped to the light canvas (v2C, `fd757227`). The palette values
may need a CVD re-validation on the light surface when the `bivariate` encoding is formalized in P3.
Flagging for the PO — not touched in P0/P1.

---

## 4. The URL boundary (P1) — one serialize/deserialize seam

```ts
// src/modules/panorama/domain/view-state-url.ts  (NEW, pure)
export function viewStateToParams(v: PanoramaViewState): URLSearchParams;
export function viewStateFromParams(sp: URLSearchParams, defaults: ViewStateSeed): PanoramaViewState;
```

### 4.1 Round-trip is the test (fixes H14 deep-link)

The property `viewStateFromParams(viewStateToParams(v)) ≡ v` is a unit test over a matrix of ViewStates.
Any param **read but never written** (or vice-versa) fails it — the H14 class of deep-link breakage
becomes a red test, not a field report.

### 4.2 Which fields serialize

**The client URL surface is bigger than the SSR contract.** The server pages
(`app/gob|admin/panorama/page.tsx`) read `period | from | to | province | locality | preset | layers | asOf`,
but the client *also* shallow-syncs `level`, `verified`, and the camera (`z | lat | lng`). The boundary MUST
preserve the FULL client surface so an unchanged view emits byte-identical params (SSR seed + deep-link both
untouched).

| field | URL param | notes |
|---|---|---|
| scope | `province`, `locality` | national = both absent |
| period (preset) | `period` | e.g. `90d` — **full-reload write** (PeriodPanel), see §4.3 |
| period (custom) | `from`, `to` | mutually exclusive with `period` — full-reload write |
| asOf | `asOf` | absent = live; continuous shallow write, day precision |
| layers | `layers` | comma-joined, activation order |
| verifiedOnly | `verified` | `1` when on; absent when off |
| level | `level` | **SEED only** — written just for `locality`, deleted for `province` (lossy today). See §4.3 |
| camera | `z`, `lat`, `lng` | continuous shallow write via `onCameraChange`; mount-decoded into `initialCamera` |
| preset | `preset` | first-visit / preset activation |
| basis | *(none)* | **intentionally NOT serialized** — existing code calls it "a viewing lens, not a shareable coordinate" (PanoramaConsole:1072). It IS injected into outgoing `/api/panorama/*` fetches as `?basis=transaction`, never the visible URL. Kept ephemeral in P1; a future decision can add `?basis=` for embed/compare reproduction (fork #1). |
| encoding | *(none in P1)* | reserved for #24; `null` today ⇒ nothing to emit |
| representation | *(none in P1)* | dock tab is ephemeral today; not URL-backed |

**Consequence:** P1 changes the *internal* plumbing (one value, one boundary) with **zero** change to the
emitted URL or the SSR contract. Deep-link round-trip is fixed (H14) because the boundary is now symmetric,
not because new params are added — the `basis` gap and the lossy `level` write are the two concrete
round-trip defects the symmetric boundary + its property test close.

### 4.3 Two hazards the inventory surfaced (P1 must respect)

1. **Dual write mechanisms.** `period`/`from`/`to` (PeriodPanel) and standalone `province`/`locality`
   (JurisdictionSwitcher) commit via a **full `window.location.assign` page reload**; `layers`/`level`/
   `verified`/`asOf`/camera commit via **shallow `replaceMapStateUrl`/`pushMapStateUrl`**. The split exists
   because Next App Router's `useSearchParams()` does not observe shallow history commits (worked around by
   reading `window.location.search` directly in places — comments cite engram #621/#622). **Design decision:**
   the boundary is the single *serialize* function `viewStateToParams`; the *commit mechanism* (shallow vs
   reload) stays per-call-site in P1 to preserve behavior exactly. Unifying commit mechanisms is explicitly
   **out of P1 scope** (its own follow-up) — collapsing it blind would risk the router-drop defect the
   full-reload paths were built to dodge.

2. **`level` is derived but URL-seeded.** Architecturally `level = derivedLevelWithHysteresis(prev, scope,
   zoom)`. But today `?level` seeds the mount (with a MAP-5 fallback: `level=locality` + no province → downgrade
   to `province`) and gates the SSR cache key (C2 invariant: seed level MUST equal `initialLevel` or the map
   blanks). **Design decision:** P1 keeps `?level` as a mount SEED for `camera`/scope reconstruction and leaves
   the C2 seed contract untouched; the *live* level remains derived from the hysteresis helper. ViewState does
   not store `level` — it stores `scope` + optional `camera`, and the boundary reconstructs the seed. This
   preserves the SSR seed contract while keeping level derived at runtime.

---

## 5. LOD / representation-per-zoom (P4)

Each layer already DECLARES `renderPolicy` (province mark, locality mark, `autoLevel.belowZoom`, optional
`points`). Today the runtime IGNORES it (A7: the switch is imperative via `POINTS_LAYER_IDS`). P4 makes
the gate compute `representationPerZoom[layer]` from `renderPolicy`, and the map reads THAT against live
zoom — no per-layer patch, no 3-file hand-sync.

```ts
export type ZoomRepresentation = {
  /** below autoLevel.belowZoom → the national mark (province choropleth, no blobs) */
  national: RenderMode;
  /** province in scope, mid zoom → the drilled mark (dept circles) */
  drilled: RenderMode;
  /** near zoom in scope → real points (if renderPolicy.points) else drilled mark */
  near: RenderMode;
};
```

This is where the master plan's **intended** rendering change lands (the only phase that touches pixels):
- graduated/signal point layers render as province **choropleth** at national (not overlapping blobs — #49 item 10);
- dept circles when drilled; real points at locality.
- **Signal glow** — a NEW `glow` encoding (warm transparent radial, CVD-validated) declared here, not hand-painted.

**Inventory note (P4 scope):** LOD is scattered across THREE independent zoom thresholds today —
`Z_LOCALITY`/`Z_LOCALITY_ENTER`/`Z_LOCALITY_EXIT` (province↔locality hysteresis band), `Z_POINTS=10`
(near-zoom real dots), and `Z_DIVISIONS=6.5` (departamento/barrio admin-division activation). `representationPerZoom`
unifies the first two per layer; the admin-division axis (`resolveDivisionProvinces`) is a parallel overlay concern
and folds in as a `divisions` band rather than replacing the mark. P4 must account for all three, not just points.

The characterization net's snapshots are updated **deliberately** at P4, with the change documented — every
prior phase must leave them byte-identical.

---

## 6. Projection boundaries — who reads what

After the refactor, each surface is a pure function of `(view, capabilities)`:

| Surface | reads | never reads |
|---|---|---|
| `SituationalMap` fill/legend | `capabilities.encoding`, `capabilities.representationPerZoom`, live zoom | preset ids, `isMeta`, `POINTS_LAYER_IDS` |
| KPIs / metrics column | `view.preset.metrics`, `view.period`, `view.asOf` | the map's level |
| `PanoramaDock` | `view.representation`, `capabilities.allowedRepresentations` | `layer.temporal` |
| `PanoramaCaption` | `view` + `capabilities.level` (via `captionFor`) | anything the map computed separately |
| CABA inset | `capabilities.insetBehavior` | a second fill decision |
| URL / saved views / embed | `viewStateToParams(view)` | scattered param writes |

The coherence invariant (map = label = numbers) holds because **level, encoding, and window all come from
one value** — no surface computes its own.

---

## 7. Phasing & guardrails (recap, binding)

- **P0** pins current behavior in a characterization net (unit-first over the pure projections — the refactor
  lives entirely in this layer; deterministic, server-free, per-commit fence) + a light Playwright evidence
  pass against :3000. Net GREEN after every commit through P3; updated deliberately at P4.
- **P1** introduces `PanoramaViewState` + the URL boundary; internal plumbing only, URL/SSR byte-identical.
- **P2** builds `capabilitiesFor`, migrates the 6 sites one at a time, deletes dead strings + `provinceDivergentColorExpr` + `getRamp`/`ScaleKey`, adds `capabilities.test.ts`.
- **P3** consolidates the encodings; scale-matches-paint + inset-same-color become structural.
- **P4** LOD/glow — the one intended visual change; snapshots updated with documentation.
- **P5** harvests gifts; minimum: "explain this view" caption from the value.

Per-phase revertible commits; fresh adversarial review each phase.

---

## 8. Forks surfaced for the PO (decide before the dependent phase)

1. **`basis` in the URL?** — Today intentionally ephemeral ("a lens, not a coordinate"). This design keeps it
   ephemeral in P1 (no behavior change). If shared deep-links must reproduce a transaction-time replay
   (embed/compare, #51/#32), we add `?basis=`. **Not blocking P0–P4.**
2. **Bivariate palette on the light canvas** — `bivariate-fill.ts` palette was CVD-validated against the
   *retired* dark navy surface. When P3 formalizes the `bivariate` encoding, it likely needs re-validation on
   the light canvas. **Blocks P3, not P0–P2.**
3. **`representation` naming** — This design models today's reality (dock tab: registros/stats/timeline) under
   the plan's `representation` name, with the grander enum (map/estadisticas/tendencias/flujos) reserved for
   #33. If the PO prefers the field named `dock` until #33, it's a rename only. **Cosmetic, not blocking.**

None of these are shape-breaking; the canonical value above is stable for P0–P4.
