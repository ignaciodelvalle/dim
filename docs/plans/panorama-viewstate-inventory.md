# Panorama ViewState — scattered-decision inventory & migration checklist

> The P0 artifact the master plan requires: "formalize the scattered-decision inventory as the migration
> checklist." Every site below is verified against the working tree (`integration/all-20260703`). Tick each
> box as its phase migrates it; the characterization net (`view-projection.characterization.test.ts`) is the
> fence proving each tick changed nothing observable (until P4, which changes rendering deliberately).

## URL params — the boundary P1 replaces

| Param | Read | Written | Mechanism | Note |
|---|---|---|---|---|
| `preset` | Console:2109 | 2715-2716, 2479, 2803-2827 | shallow | |
| `layers` | 689 (`parseLayersParam`), 2746 | 2712 | shallow | |
| `level` | 605-620 (MAP-5 fallback) | 2713-2714 | shallow | **lossy**: writes only `locality`, deletes for `province` |
| `verified` | 630-632 | 2718-2719 | shallow | filter axis → `verifiedOnly` |
| `province` | 519-521 | 1305-1320; JurisdictionSwitcher:146 | shallow / **full reload** | dual mechanism |
| `locality` | 522-524 | 1305-1320 | shallow | |
| `period` | 991 | PeriodPanel:56/61; 2479 | **full reload** | dual mechanism |
| `from`/`to` | 992-993 | PeriodPanel:61 | full reload | |
| `asOf` | mount 795; | 3090-3096 (day precision) | shallow | |
| `z`/`lat`/`lng` | mount 1011-1015 | 3068-3075 (`onCameraChange`) | shallow | camera frame |
| `basis` | **never from URL** | fetch querystrings only (1213,1639,2298) | ephemeral | **H14 gap** — copy-vista silently reverts to `valid` |
| `mode=points` | never from URL | fetch only (1590) | ephemeral | derived from (scope,zoom) |

**Round-trip defects the symmetric boundary + property test close:** (1) `basis` never round-trips; (2) `level`
write is lossy. Both become red tests under `viewStateFromParams(viewStateToParams(v)) ≡ v`.

## The 6 scattered decision sites (P2)

- [ ] **(a) bivariate string-gating** — `PanoramaConsole.tsx:2134-2138`: `activePresetId === "brotes-activos" && level === "province" && states.cobertura?.active && states.zoonosis?.active`. Off-registry (no `bivariate` field on `PanoramaPreset`). Consumers: 2149-2166, 2188-2206, 3561-3584, 4017-4018. → `capabilities.allowedControls.bivariateEligible` (predicate on `dataType==='rate' && complianceTarget!=null && signalPresent`; no preset id in code).
- [ ] **(b) isMeta ×4** — `SituationalMap.tsx:1936`, `:2814`, `MapLegends.tsx:138`, `map-popup.ts:68` (each: `dataType==='rate' && typeof complianceTarget==='number'`). → resolved `encoding.kind` (`choropleth-meta`|`choropleth-seq`), computed once by the gate.
- [ ] **(c) points-mode across 4 files** — declare `types.ts:94-110` (self-aware "runtime is imperative" comment), derive `layers.ts:427-436` (`POINTS_LAYER_IDS`), predicate `situational-map-utils.ts:113,126-128` (`Z_POINTS`, `pointsEligible`), imperative switch `PanoramaConsole.tsx:1519-1526`. → `capabilities.representationPerZoom[layer]` read against live zoom (P4). **KEEP SEPARATE:** server security re-check `get-layer-features.ts:55,249`.
- [ ] **(d) temporal ×10** — `isTemporalLayer`/`layer.temporal` at Console:1199,1488,2041,2080,2229,2257,3320,3332; `FiltroPanel.tsx:81`; `LayerPanel.tsx:97` (+ `TimeScrubber.tsx:307` via aggregate). → `capabilities.allowedControls.scrubber` + `allowedRepresentations` (timeline tab).
- [ ] **(e) dead code to DELETE** — `provinceDivergentColorExpr` + `FIXED_RATE_DOMAIN` (`province-choropleth-style.ts:53,218-257`, only the `divergent-choropleth-style.test.ts` references them); `getRamp`/`getScale5`/`ScaleKey` (`viz-scales.ts:288-310`, zero production/test callers — only the master plan doc names them). Delete with their now-orphaned test.
- [ ] **(f) color systems to consolidate (P3)** — `viz-scales.ts` (tokens) → `class-scale.ts` (classed-step engine) → `province-choropleth-style.ts` (MapLibre exprs); `bivariate-fill.ts` is a separate hardcoded 9-color palette (a de-facto 4th system). Reconcile into `ResolvedEncoding` per layer. **Fork #2:** bivariate palette was CVD-validated on the RETIRED dark navy canvas — re-validate on the light canvas in P3.

## Secondary scattered derivations (fold into projections)

- [ ] `captionLayer` selection (Console:2864-2873): preset `base` if a preset is active, else first active non-reference layer — a scattered decision feeding `captionFor`. → a projection helper `primaryLayerFor(view)`.
- [ ] `currentStateBaseLabel` (Console:3331-3334): a *second* derivation off `captionLayer` + `isTemporalLayer` for the scrubber disclaimer — duplicate of the caption's temporal branch.
- [ ] `temporalAvailable` (Console:3319-3321): hand-rolled aggregate boolean → `capabilities.allowedControls.scrubber`.
- [ ] State/ref/URL triplication: view-config truth lives in React state, ref mirrors (`levelRef`, `activePresetIdRef`, `timeBasisRef`, `verifiedRef`…), AND the URL — reads split between `useSearchParams()` and raw `window.location.search`. The single canonical value + boundary removes the ref mirrors' reason to exist (they exist only for effect-closure freshness of scattered state).

## LOD axes (P4) — three independent thresholds today

- [ ] `Z_LOCALITY=5` / `Z_LOCALITY_ENTER=5.4` / `Z_LOCALITY_EXIT=4.6` — province↔locality hysteresis (`derivedLevelWithHysteresis`, used Console:2656-2660).
- [ ] `Z_POINTS=10` — near-zoom real dots (`pointsEligible`).
- [ ] `Z_DIVISIONS=6.5` — departamento/barrio admin-division activation (`resolveDivisionProvinces`, 413-426) — a parallel overlay axis, folds in as a `divisions` band.
- [ ] Mark selection is imperative (Console:1514-1526), never reads `renderPolicy`. → unify under `representationPerZoom`.

## Definition of done per phase

- P0: characterization net green (this checklist committed). ✅ when net pins current projections.
- P1: `view-state.ts` + `view-state-url.ts` pure modules + round-trip property test; console derives inputs FROM one value; URL/SSR byte-identical.
- P2: `capabilities.ts` + `capabilities.test.ts`; sites (a)-(d) migrated; (e) deleted.
- P3: (f) consolidated into `ResolvedEncoding`; scale-matches-paint + inset-same-color structural.
- P4: `representationPerZoom` drives the map; glow encoding; snapshots updated deliberately.
- P5: "explain this view" caption from the value (min gift).
