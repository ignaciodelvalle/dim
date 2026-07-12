# Cowork funcionario QA — code-grounded triage (2026-07-12)

> Source: `docs/reviews/2026-07-11-panorama-funcionario-3-misiones.md` (H1-H14).
> Each verdict grounded against `integration/all-20260703`. **PO decision on H1/H6: HYBRID** —
> the primary KPI number must equal what the map+Registros show for the same period+scope+scrub;
> a backlog/all-time figure, where useful, becomes a clearly-labeled SECONDARY.

## Verdicts

| # | Finding | Verdict | Mechanism (file) | Action |
|---|---|---|---|---|
| H1 | scrubber moves map+list but not KPI | BY-DESIGN | `get-panorama-kpis.ts` has NO `asOf` param; KPI effect keys on `scopePeriodQs` only (`PanoramaConsole.tsx:770-830`); asOf effect (`:1059-1114`) refetches only temporal LAYERS, never KPIs | **HYBRID**: temporal-layer KPIs follow the scrub (refetch on asOf); stock KPIs (coverage) labeled "estado actual" |
| H6 | Registros sum ≠ KPI (965 vs 2202; 142 vs 102) | MIXED (different populations, zero disclosure) | denuncias: KPI=`status NOT IN(closed,duplicate)` all-time (`govt-home-kpis.ts:1081`); Registros=`createdAt>=since` any-status (`repository.ts:1819`). zoonosis: KPI=dedup pets + fixed-30d disease; Registros=raw signal events in-period | **HYBRID**: primary = in-period (matches list); backlog shown as labeled secondary; zoonosis KPI labeled "estado actual (30d)" |
| H2 | coverage province-only; drill "Sin datos" | MIXED | coverage loaders swap rate→raw-count at locality with NO relabel (`repository.ts:1011-1138`, "V1 LIMITATION"); generic empty string (`SituationalMap.tsx:3591`) | **NOW**: distinct empty-state copy ("cobertura solo a nivel provincia"). **TASK**: department-rate coverage (architecture) |
| H3 | timeline "dead" in Brotes | NOT REPRODUCED | `temporalAvailable` checks ANY active temporal layer (`PanoramaConsole.tsx:3098`); zoonosis IS temporal → enabled. What was seen = the `currentStateBaseLabel` disclaimer + H4 | **NOW**: soften disclaimer copy; real fix is H4 |
| H4 | scrubber thumb no mouse (keyboard only) | BUG | pointer handlers on the track/thumb (`TimeScrubber.tsx`) | **NOW**: wire pointer drag + click-to-seek |
| H5 | decomisos map-only, not tabulated | BY-DESIGN | `mapTableRows` skips non-aggregate (`PanoramaConsole.tsx:2809`); reference layers never in KPI fan-out | **NOW**: one-line disclosure near Registros |
| H7 | "Datos al…" changes with scope | BY-DESIGN (last-event-in-scope) | reads as freshness | **NOW**: relabel ("último evento en el alcance" not "datos al") |
| H8 | ranking always by coverage | MIXED | ranking IS preset-parameterized (`PanoramaConsole.tsx:2710-2749`) but signal layers can't be `base`; zoonosis KPI chip is an inert `<div>` (`KpiChips.tsx:56`) | **NOW**: non-base chips honestly non-interactive (tooltip). **TASK**: signal-driven ranking |
| H9 | implausible deltas +76% | BY-DESIGN math, MISLABELED | `deltaOf`=relative % of a percentage (`get-panorama-kpis.ts:236`); rate KPIs need pts | **NOW**: rate deltas in "pts" not "%" |
| H10 | bivariate no legend | MIXED | legend exists but behind collapsed disclosure; collapsed pill shows WRONG sequential ramp in bivariate mode (`LegendPill`/`PanoramaConsole.tsx:3238`) | **NOW**: bivariate-aware collapsed pill (force open / correct hint) |
| H11 | "Filtro" funnel = layer selector, no attribute filters | design | rename cheap; real attribute filters = feature | **NOW**: rename/re-icon. **TASK**: attribute filters (severity/status) |
| H12 | blank map 2-4s on URL entry | perf/loading | bubbles paint late | **NOW**: loading skeleton/state |
| H13 | sparkline yes, timeline "no disponible" | consistency | relates to H3 temporal messaging | **NOW**: reconcile the two temporal-availability messages |
| H14 | URL drill doesn't fly camera | BUG | `?province=` without z/lat/lng stays national | **NOW**: derive camera from province on load |

**Confirmed GOOD (do not touch):** rótulo↔KPI↔mapa resync on drill/back; Peores 10; Registros
sort/download; k-anon honest; bivariate concept; **cobertura BA no crash (hardening confirmed live)**.

## Split
- **Coherence round (#41):** H1/H6 hybrid + the NOW-labeled honesty batch (H2-copy/H5/H7/H8-chip/
  H9/H10/H13) + H4 + H14 + H3-copy + H12 + the PO invariant (floating label = data, scope-follows).
- **A11y round (#43):** the WCAG batch.
- **Visuals round:** crowded points, distinct layer colors, CABA entrable + inset gating.
- **Feature tasks:** department-rate coverage, signal-driven ranking, attribute filters, (maybe)
  tabulate decomisos.
