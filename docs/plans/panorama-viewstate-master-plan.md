# Panorama ViewState — master plan (foundational refactor)

> The plan that pays down panorama's one structural debt — scattered view state — and turns the
> recurring bug family (coherence breaks, LOD/zoom mismatches, deep-links, embed rework) into
> structural impossibilities, while making a slate of future improvements fall out for free.
> This IS the expanded task #50; #24 (switcher), #33 (viz-suite), #49 (LOD), #51 (embed),
> #32 (presentation) all build on it. Grounded against `integration/all-20260703`.

## Context — the problem in one sentence

The panorama's data/domain layer is well-engineered (pure functions, hexagonal separation, k-anon
centralized, event-sourced data), but the **view-configuration state** — what's selected and how
it's shown — was added surface-by-surface and now lives in **6+ scattered places**: URL params +
React refs + effects for the config; `compatibility.ts` (the only real matrix, base/signal/ref
slots) + a `temporal` flag read by ~11 consumers + hardcoded strings `"brotes-activos"/"cobertura"/
"zoonosis"` for bivariate (`PanoramaConsole.tsx:2134`) + points-mode "synced by hand" across 3
files + an `isMeta` predicate copy-pasted 3× + a dead `provinceDivergentColorExpr` + 3 independent
color systems (`viz-scales` / `class-scale` / `bivariate-fill` / `province-choropleth-style`).

**Every recurring bug is one symptom of this:** the coherence invariant broke (KPI derived from a
different state slice than the map), the deep-links don't round-trip (H14), the LOD problem
(points useless at national — no declarative representation-per-zoom), and embed/saved-views/
compare each re-derive state. Six fuse boxes instead of one panel; nothing on fire, but two boxes
sometimes disagree, and every new room means tracing wires through all six.

## Companion artifacts (task #50 execution)

- **Concrete design** (the PLAN-FIRST shape gate before P1 code): `panorama-viewstate-design.md` —
  the canonical `PanoramaViewState`, the STORED-vs-DERIVED table, `capabilitiesFor`, the URL boundary
  (incl. the dual-write-mechanism + level-seed hazards), and the forks surfaced for PO review.
- **Migration checklist** (the P0 inventory): `panorama-viewstate-inventory.md` — every scattered site
  with file:line, a tickable checklist per phase, and the round-trip defects the boundary closes.

## Non-negotiable framing

The map WORKS and is PO-validated. This is a **behind-the-UX refactor**, incremental, never a
big-bang rewrite. Each phase preserves the exact current behavior (proven by a characterization
test net) until the final phase harvests the new capabilities. No phase ships a UX regression.

## Target architecture

**1. `PanoramaViewState` — the single canonical value (source of truth):**
```
PanoramaViewState = {
  scope:          national | { province } | { province, locality }   // + region camera-frame
  period:         '7d'|'30d'|'90d'|'12m'|'ytd'|'3a'|'5a'|custom
  asOf:           timestamp | null            // the scrubber's cut
  basis:          'valid' | 'transaction'     // bitemporal
  layers:         LayerId[]                    // active layers
  encoding:       EncodingId                   // choropleth-seq | meta | bivariate | glow | delta | lag | heatmap
  representation: 'map' | 'registros' | 'estadisticas' | 'tendencias' | 'flujos'
}
```
Everything — the map, KPIs, dock, legend, CABA inset, the URL, saved-views, embed — is a **pure
projection** `(ViewState, data) → render`. Same `(events, filters) → view` discipline the data
layer already uses, applied to the view layer. Two surfaces reading one value **cannot diverge** —
the coherence invariant stops being defended per-fix and becomes structurally impossible.

**2. `ViewState → Capabilities` — the declarative gate (the matrix that's missing today):**
```
capabilitiesFor(viewState, data) = {
  allowedControls:        which modifiers apply (scrubber on/off, bivariate-eligible, ...)
  allowedRepresentations: which dock tabs / map modes light up (temporal off ⇒ no Tendencias)
  encoding:               the scale + legend for what's painted (scale ALWAYS matches paint)
  insetBehavior:          CABA inset visibility + fill + encoding adoption
  representationPerZoom:   LOD — which rendering at which zoom band (choropleth national →
                           dept circles drilled → real points at locality)
}
```
One pure function. Every scattered predicate is deleted and replaced by a read of this. No
hardcoded preset/layer id strings — the layer/preset/mode **registry declares** its compatibility,
scale, inset, and LOD. A `compatibility.test.ts` cross-checks the registry (the guard that would
have caught every drift).

**3. First-class `Encoding`** — an encoding = (data field, scale, legend, suppression style),
declared once per layer. Reconcile the 3 color systems into this; delete the dead divergent scale
and the unused `getRamp`/`ScaleKey`. "Scale matches the paint" becomes structural.

## Phases (each behind current UX; characterization net green throughout)

**P0 — Characterization net + inventory (no behavior change).** Before touching anything, pin the
CURRENT behavior in a Playwright + unit characterization suite: for a matrix of (preset × scope ×
period × asOf × zoom), snapshot what renders (KPIs, map layers, legend, dock, inset). This is the
regression fence — the refactor is "correct" iff these stay identical until P5. Formalize the
scattered-decision inventory (already mapped in `docs/reviews`/the 2026-07-12 compat audit) as the
migration checklist.

**P1 — ViewState value + URL boundary.** Introduce `PanoramaViewState` and make the URL a single
serialize/deserialize boundary (`ViewState ↔ URLSearchParams`), replacing the scattered param
reads. Surfaces still compute as today, but now derive their inputs FROM the one ViewState. Fixes
H14-class deep-link round-trip as a side effect. Saved-views become `serialize(ViewState)`.

**P2 — Capability gate + predicate migration.** Build `capabilitiesFor(viewState)`. Migrate the 6
scattered compatibility sites to read from it, one at a time (bivariate string-gating → a preset
field; `isMeta` → encoding declaration; points-mode → LOD declaration; temporal → allowedControls).
Delete the hardcoded strings + `provinceDivergentColorExpr` + unused ramps. Add
`compatibility.test.ts`. Bivariate→timeline-off and all mode-compatibility now come free and
correct.

**P3 — First-class Encoding.** Consolidate the color/scale systems into the declarative `Encoding`
per layer. Scale-matches-paint + CABA-inset-same-color become structural (the inset projects the
same encoding). New encodings (glow, delta, lag, heatmap) become "declare an Encoding", not "edit
3 files".

**P4 — LOD / representation-per-zoom.** Each layer declares its representation per zoom band; the
map picks the zoom-appropriate one from the declaration. The national-blob-points problem
(#49 item 10) is now the systematic default, not a per-layer patch.

**P5 — Harvest the gifts.** With ViewState canonical + the capability gate in place, these are now
trivial projections, not features:
- **Embed** (#51): `<PanoramaEmbed viewState={frozen} />` — render surfaces from a fixed ViewState.
- **Presentation mode** (#32): a ViewState with chrome projections hidden.
- **Compare two views**: two ViewStates side-by-side (the period-delta is a special case).
- **Reproducible deep-links**: guaranteed by the P1 boundary.
- **Undo/redo of exploration**: a stack of ViewStates.
- **"Explain this view"** (the honest export description the PO wants): a ViewState is fully
  describable in words — the caption is generated from the value.

## Invariants become structural guarantees (with tests)

| Invariant | Today | After |
|---|---|---|
| Coherence — map = label = numbers | defended per-fix (kept breaking) | structural — all surfaces read one ViewState |
| Scale matches the paint | inline `isMeta` ×3, drift-prone | structural — encoding declared once |
| CABA same color main↔inset | separate fill decision | structural — inset projects same encoding |
| Show only zoom-appropriate data (LOD) | not declared → blobs | structural — representationPerZoom |
| Controls compatible with mode | hardcoded strings | structural — capability gate |

## Guardrails

- No UX change per phase until P5; characterization net green after every commit.
- Per-phase commits, each independently revertible; **fresh adversarial review each phase**
  (the pattern that caught the coherence gap 5/5 times).
- PLAN-FIRST on the ViewState shape + projection boundaries + the capability/LOD schema — design
  the value and its edges before migrating call sites (an architect-review gate before P1 code).
- Migrations are mechanical once the shape is fixed; the risk is in the shape, so we pay attention
  there.

## Relationship to the backlog

- This **is** task #50, expanded — #50 points here.
- **Do it after #49 (visuals) and before #24 (switcher) + #33 (viz-suite)** — building those on the
  scattered state means rebuilding them later. Pay the wiring before adding rooms.
- **De-risks / unblocks:** #24 (modes = encodings + capability gate), #33 (each viz = a
  representation/encoding), #49's LOD (systematic version), #51 (embed), #32 (presentation).

## Verification

Characterization parity (Playwright before/after byte-identical UX through P4) + the five new
invariant tests + `compatibility.test.ts` registry cross-check; then each P5 gift demoed live with
a screenshot. `pnpm verify` + panorama suite green after every phase.
