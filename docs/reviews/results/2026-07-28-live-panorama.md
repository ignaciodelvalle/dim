# Live review — panorama & map (2026-07-28)

**Ground truth:** `integration/all-20260703` @ `796a583f`
(`git -C C:/dev/dim branch --show-current && git -C C:/dev/dim rev-parse --short HEAD`)

**Captured:** `/gob/panorama`, `/gob/mortalidad`, `/gob/poblacion` (→ `/gob/padron?vista=poblacion`), `/gob/censo` (→ `/gob/padron?vista=censo`), harness `e2e/demo/_capture-live.ts`, role `govt` (scope: Tierra del Fuego, Santa Cruz, CABA).
All four routes returned **200 with 0 console errors**. The only failed requests were `?_rsc=` prefetch aborts and two `?histogram=1` aborts — noise, not findings.

Deeper interaction evidence came from six throwaway Playwright probes under `C:/Users/ignac/.claude/jobs/c64395a5/tmp/pano-rev/` (all 15 presets, scope drilling, pixel histograms, API reads). Screenshot filenames below refer to that directory unless prefixed `review/panorama/`.

---

## Findings

### P1-1 — Every compliance vista labels the WORST end of its ramp "mejor"

**What I saw:** the collapsed legend pill, on five of the fifteen vistas:

| vista | legend pill (verbatim) |
|---|---|
| Cumplimiento antirrábico | `Cobertura antirrábica (perros, 12m)` · **`40% · mejor`** · ▮▮▮▮ · `80% meta` |
| Brotes activos | `Cobertura antirrábica (perros, 12m)` · **`40% · mejor`** · ▮▮▮▮ · `80% meta` |
| Control poblacional | `Cobertura de esterilización` · **`35% · mejor`** · ▮▮▮▮ · `70% meta` |
| Identificación por microchip | `Penetración microchip (C1)` · **`40% · mejor`** · ▮▮▮▮ · `80% meta` |
| Registro PPP / Riesgo PPP | `Registro PPP (C7)` · **`40% · mejor`** · ▮▮▮▮ · `80% meta` |
| Desparasitación | `Cobertura antiparasitaria (12m)` · **`40% · mejor`** · ▮▮▮▮ · `80% meta` |

(screenshots: `collapsed-cumplimiento.png`, `probe4.out` §A — one line per preset)

The swatches flanked by those two labels run, left to right:
`rgb(239,243,255)` → `rgb(189,215,231)` → `rgb(33,113,181)` → `rgb(8,69,148)`
i.e. **lightest on the `40% · mejor` side, darkest on the `80% meta` side** (`probe3.out`, DOM-sampled `background` of each ramp cell).

**Why it's wrong:** the light end is the *lowest coverage*. The app's own code states the intended reading — `components/panorama/class-scale.ts:70` — *"The META path needs none of this: its target already declares which pole is good, and there **'dark = meta cumplida'** is the established reading."* So the paint says dark = meta met = good, and the text pinned to the opposite end says that end is `mejor`. A funcionario glancing at the pill reads "the palest provinces are the best ones" — precisely inverted. This is the polarity defect the plan unit describes, and it is not on the exotic layers: it is on the entire legal-compliance family (Ley 22.953, Ley Prov 14.107), the vistas an official actually opens.

The two layers that declare polarity explicitly read correctly, which is the control:
`Acceso veterinario (actos/1.000) | 1420 · peor | … | 1798 · mejor` and `Índice territorial (0-100) | 50 · peor | … | 100 · mejor`.

**Cause (found):** `components/panorama/PanoramaConsole.tsx:4250`

```ts
higherIsBetter: captionLayer?.higherIsBetter === true,
```

`legendRampEndpointLabels` documents `higherIsBetter?: boolean` as tri-state — *"Omit to print bare numbers"* (`components/panorama/panorama-labels.ts:198`). The call site collapses `undefined` to `false`, so every layer that does not explicitly opt in is told *higher is worse*, and `polarityMarks` (`panorama-labels.ts:159`) then returns `lo: " · mejor"`. On the META branch (`panorama-labels.ts:234`) that `" · mejor"` is stamped onto the low endpoint while the high endpoint is the meta. The unit test `panorama-labels.test.ts:572` covers the function correctly (`{ min: "5% · peor", max: "95% meta" }`) — it is the console's coercion that is wrong, and no test covers it.

**Fact or opinion:** fact.

---

### P1-2 — Changing scope with the visible dropdown shows the PREVIOUS scope's units under the NEW scope's title

**What I saw:** on `/gob/panorama?preset=cumplimiento`, opening «Alcance» and choosing **Santa Cruz** in the Provincia dropdown. On screen afterwards (screenshot: `select-AR-Z.png`):

- scope pill: `Santa Cruz`
- caption: `Indicadores: total del alcance (Santa Cruz). El mapa muestra el detalle por departamentos/partidos.`
- ranking heading: `TUS 2 DEPARTAMENTOS · COBERTURA ANTIRRÁBICA (CONTEO)`
- rows:
  ```
  Jurisdicción    Cobertura antirrábica (conteo)
  Ushuaia         18
  Palermo         80
  Protegido (k<5) — 1 unidad suprimida por k-anonimato
  ```

**Ushuaia is in Tierra del Fuego. Palermo is in CABA. Neither is a Santa Cruz department.**

This is not a render race. I sampled the same table at +3 s, +8 s and +16 s after the change — byte-identical each time (`probe7.out`, §SELECT-DRIVEN SCOPE CHANGE). And it is not what the data says: navigating to the *same URL* fresh (`/gob/panorama?preset=cumplimiento&province=AR-Z`) renders the correct thing (`probe6.out`):

```
MAYOR VOLUMEN 10 · COBERTURA ANTIRRÁBICA (CONTEO)
Protegido por k-anonimato
1 departamentos SÍ reportaron, pero sus valores son tan bajos que mostrarlos identificaría casos.
```

and the API agrees — `/api/panorama/cobertura?level=locality&province=AR-Z` returns exactly one feature, `Lago Argentino`, `value: null, suppressed: true` (`probe7.out`, §API GROUND TRUTH).

The symmetric case is just as bad. Selecting **Todas** again produced:

```
TUS 1 JURISDICCIONES · COBERTURA ANTIRRÁBICA
Santa Cruz   100%   —
```

under the heading `Alcance: Tierra del Fuego, Santa Cruz, CABA` — one of three jurisdictions, and the two missing ones are the ones with real gaps (CABA −11,6 pts, TdF −5 pts). The same turn also flipped the antirrábica KPI's delta chip from `+24 pts` to `+66 pts` for an unchanged `70,1%`.

**Why it's wrong:** the ranking table is the only place the console ranks jurisdictions, and after any dropdown-driven scope change it is showing a different jurisdiction's numbers under the current jurisdiction's name. An official drilling into Santa Cruz reads Palermo's 80 vaccinations as a Santa Cruz department. The map, the KPI column and the caption all updated correctly — only the table lagged, which is exactly what makes it credible on screen.

**Cause:** not isolated. The ranking memo appears to be recomputed from a features set that is one scope-change behind; the URL and camera update immediately (`…&province=AR-Z&level=locality&z=5.78&lat=-49.303&lng=-69.638`) while `Ranking de unidades` does not. Entry points to look at: the `rankWorstUnits` / `rankingSmallScope` memos at `components/panorama/PanoramaConsole.tsx:3429-3448` and the props handed to `PanoramaDataTable` at `:4123-4131`.

**Fact or opinion:** fact.

---

### P1-3 — `/gob/mortalidad` publishes a k<5 cell under a caption that promises k<5 cells are hidden

**What I saw:** on `/gob/mortalidad`, the «Distribución por localidad» chart (screenshot: `review/panorama/gob_mortalidad.desktop.png`; text: `review/panorama/gob_mortalidad.txt:143-151`):

```
Distribución por localidad
1 localidad oculta (privacidad)
Gráfico de barras horizontales: distribución de fallecimientos por localidad.
Localidades con menos de 5 fallecimientos están ocultas por privacidad (k-anonimato).
Palermo                                8
Tierra del Fuego (otras localidades)   2
Escala: 0 – 8 fallecimientos · celdas < 5 ocultas (k-anonimato).
```

**Why it's wrong:** the chart's own accessible description and its own scale caption both assert that cells under 5 are hidden, and the chart then renders a bar of **2**. The residual bucket is not anonymous either: it is named to a single province and that province has one named locality in this dataset, so the bar publishes "Tierra del Fuego has exactly 2 registered deaths outside Ushuaia". Rolling suppressed cells into a labelled residual does not clear k=5 — the residual is itself a cell and must be suppressed or merged upward when it lands under the threshold.

Two claims are in play here and they are different: *"fewer than 5, we cannot tell you"* and *"two"*. The page makes the first promise and delivers the second. On the same page the «Disposición» chart also publishes `Cremación 1` out of 10 deaths, which is thin for the same reason though it carries no k-anon promise.

**Fact or opinion:** fact (the contradiction between the caption and the rendered bar). Whether the residual bucket is legally a disclosure under Ley 25.326 is a judgement for the PO — the internal inconsistency is not.

---

### P2-1 — Province-grain choropleths apply no k-anonymity, while an always-on badge says they do

**What I saw:** the `⊘ k<5 protegido` pill is pinned to every legend on every vista, never hidden, with the tooltip `Unidades con menos de 5 casos: valor suprimido por k-anonimato (Ley 25.326)` (`LegendPill.tsx:209-220`, verified live in `probe3.out` HTML). Meanwhile:

- `/api/panorama/mortalidad?level=province` → one feature, CABA `value: 8`, and `"suppressedCount": 0`.
- `/api/panorama/cobertura?level=province` → `Santa Cruz value: 100, suppressed: false`.
- `/api/panorama/cobertura?level=locality&province=AR-Z` → the province's only department, `Lago Argentino`, `value: null, suppressed: true`.
- `/gob/padron?vista=poblacion&province=AR-Z` → Santa Cruz has **11 active pets** total (`63,6% · 7 de 11`).

So the console publishes `Santa Cruz — Cobertura antirrábica 100% · —` in the ranking and `100% ＝ 0 pts` in the KPI column, over a cohort whose *only* department cell it simultaneously refuses to print because "mostrarlos identificaría casos".

**Cause (found):** `src/modules/panorama/infrastructure/repository-choropleth.ts:475-483`

```ts
function toProvinceChoroplethCells(rollup: ProvinceRollupRow[]): ProvinceChoroplethCell[] {
  const cells: ProvinceChoroplethCell[] = [];
  for (const r of rollup) {
    const code = PROVINCE_ISO[r.province];
    if (!code) continue;
    cells.push({ provinceCode: code, label: r.province, value: r.count });
  }
  return cells;
}
```

No threshold, no `suppressed` flag — compare the department tier's `toChoroplethCells(...)` at `:512`, which returns a real `suppressedCount`. A province with 1 deceased pet would be painted and published verbatim. The k-anon badge is therefore a blanket assurance the province tier does not honour.

**Fact or opinion:** fact. (Whether province grain *should* carry k=5 is a policy call — most published health statistics don't suppress at province level. But then the badge must not claim it does.)

---

### P2-2 — The Mortalidad vista ships a legend with a colour and no numbers, over an almost blank map

**What I saw:** `/gob/panorama?preset=mortalidad` (screenshot: `px-mortalidad.png`). The legend pill reads, in full:

```
Mortalidad / disposición  ▮  ⊘ k<5 protegido  ▴
```

One swatch, `rgb(107,174,214)`. **No minimum, no maximum, no unit, no polarity word.** Expanding it adds only `Cada área es una provincia. Relleno = mortalidad registrada, estado actual.` and `Sin variación destacable frente al período anterior.` — still no scale.

A pixel histogram of the map canvas (`probe6.out`) finds exactly one data colour, `rgb(117,179,216)` × 6 891 px — the CABA inset. The whole mainland is `rgb(232,235,238)` (= `COLOR_NO_DATA` `#e7eaed`). The same vista's KPI tile reads `8 · Mortalidad registrada`.

`Tendencia` has the same shape: `Tendencia de eventos (Δ vs período anterior) | ⊘ k<5 protegido | ▴` — no endpoints at all.

**Why it's wrong:** `LegendPill.tsx:30-34` states the endpoints exist so that *"'what does dark mean' is answerable WITHOUT expanding"*. On these two vistas it is not answerable even *with* expanding. And this is an exportable surface — the rail carries a download control, so a PNG can leave the building carrying a coloured national map with no scale on it.

**Cause:** the degenerate branch. `classColors(n)` returns `[scale[2]]` for `n <= 1` (`class-scale.ts:75`), and `legendRampEndpointLabels` returns `null` when `liftedBreaks` is empty (`panorama-labels.ts:211`) — so a single-class scale produces a colour with no anchor rather than a stated single value.

**Fact or opinion:** fact.

---

### P2-3 — The vet desert's legend prints a bare `12 … 18` with no unit on a percentage layer

**What I saw:** `Desierto veterinario (% sin atención registrada) | 12 · mejor | ▮▮▮▮▮ | 18 · peor` (screenshot: `collapsed-desierto-veterinario.png`). The ranking beneath it, correctly, reads `TUS 3 JURISDICCIONES · % DE MASCOTAS ACTIVAS SIN ATENCIÓN VETERINARIA REGISTRADA` with `Santa Cruz 18,2 / CABA 16,1 / Tierra del Fuego 12`.

**Why it's wrong:** this is the one layer whose whole reshaping (PO 2026-07-26) was to stop being a *days* measure. The title says `%` and the expanded reading says `Relleno = % de mascotas activas sin atención veterinaria registrada, últimos 90 días` — both good. But the number pinned to the ramp, the thing an operator actually reads off the map, is a bare `12`/`18` sitting next to the words "Desierto veterinario" and "últimos 90 días". `12 … 18` next to a 90-day window reads as a duration. The sibling rate layers print `40%`, `70% meta`, `35%` — this one does not, so the inconsistency is internal too.

**Cause (found):** `components/panorama/panorama-labels.ts:214` — `const unit = captionLayer.dataType === "rate" ? "%" : "";`. The desert layer is deliberately routed as `dataType: "density"` for aggregation reasons and declares its percentage nature via `valueKind: "rate"` instead (`src/modules/panorama/domain/layers.ts:522` and the long comment at `:576-584`). The unit lookup reads the aggregation axis, not the value axis, so the `%` is dropped.

**Fact or opinion:** fact.

---

### P2-4 — The legend's plain-language "reading" describes a different metric than the map paints

**What I saw:** expanding the legend on `/gob/panorama?preset=desierto-veterinario` (screenshot: `desierto-legend-open.png`):

```
Cada área es una provincia. Relleno = % de mascotas activas sin atención veterinaria registrada, últimos 90 días.
Cobertura antirrábica mejora 24 pts vs período anterior; 1 de 1 indicadores mejora; cobertura actual 70,1%.
```

**Why it's wrong:** the first line is right. The second — the bolded, `aria-live="polite"` sentence, the one a screen reader announces and the one a hurried reader takes as *the* conclusion — is about antirrábica coverage, a metric this vista does not paint, and it delivers good news (`mejora`, `1 de 1 indicadores mejora`) on a vista whose subject is a coverage deficit. It is generated from the vista's KPI column rather than from the base layer.

**Fact or opinion:** fact.

---

### P2-5 — On mobile the panel occludes the map and the legend loses the metric name

**What I saw:** `review/panorama/gob_panorama.mobile.png` (390×844). The scope/KPI card fills roughly the middle 60 % of the viewport and the map survives only as slivers down the left and right edges. The legend pill at the bottom reads:

```
· 1 – ● 1 ● Zoonosis / señales ⊘ k<5 protegido ▴
```

The base metric name (`Síntomas / vigilancia sindrómica`) is clipped away entirely, leaving a ramp with no metric attached to it.

**Why it's wrong:** the map is the product on this route; on a phone it is not visible. And `LegendPill.tsx:116-125` deliberately gives the base label `line-clamp-2 min-w-0 flex-shrink` against `shrink-0` siblings, so at narrow widths the label is the first thing sacrificed — but it is the one element without which the rest of the pill means nothing.

**Fact or opinion:** the occlusion measurement is fact; "the panel should collapse on mobile" is opinion.

---

### P3-1 — Map floor (plan unit D.5) is real and measurable

**What I saw:** pixel histograms of the live canvas (`probe6.out`) resolve four near-identical light greys the map must keep apart:

| role | rendered | constant |
|---|---|---|
| lienzo / océano | `rgb(255,255,255)` | — |
| tierra del basemap | `rgb(244,246,248)` | — |
| provincia sin datos | `rgb(232,235,238)` | `COLOR_NO_DATA` `#e7eaed` |
| clase 1 (valor más bajo) | `rgb(240,243,255)` | `SCALE_BLUE_SEQ[0]` `#eff3ff` |

CIEDE2000 between them (`de.mjs`, `node de.mjs`):

```
ΔE00 clase 1 #eff3ff vs sin datos #e7eaed      = 4.62
ΔE00 clase 1 #eff3ff vs lienzo blanco #ffffff  = 6.06
ΔE00 clase 1 #eff3ff vs tierra basemap #f4f6f8 = 4.63
ΔE00 sin datos #e7eaed vs tierra basemap       = 2.61
ΔE00 sin datos #e7eaed vs suprimido #d1d5db    = 4.93
—— reference: clase 1 vs clase 2 #bdd7e7       = 10.77
```

**Why it matters:** every distinction the map needs at its light end sits at half the separation of two adjacent data classes, and *no-data vs basemap land is 2.61* — under the threshold at which a large flat field reads as a different colour at all. On the Mortalidad vista, where the entire mainland is no-data, there is no visible boundary between "province with no data" and "terrain". `COLOR_NO_DATA`'s own docstring (`lib/analytics/viz-scales.ts:275-279`) claims it is *"distinct from the palest data class … by being a neutral grey"* — at ΔE00 4.62 that claim is optimistic.

**Fact or opinion:** the measurements are fact; the remedy (darken the floor, or reserve class 1) is opinion.

---

### P3-2 — Number and grammar polish on the ranking + legend

All quoted verbatim from live captures:

- `TUS 1 JURISDICCIONES`, `TUS 1 COMUNAS`, `TUS 1 DEPARTAMENTOS` — plural noun on a count of one (`probe6.out`).
- Desierto ranking mixes precision: `Santa Cruz 18,2` · `CABA 16,1` · `Tierra del Fuego 12` (should be `12,0`).
- Legend endpoints drop the thousands separator the table uses: pill says `1420 · peor`, table says `1.420` (acceso veterinario).
- Legend max `18` is below the table's actual max `18,2` — the ramp's stated ceiling is under a value it paints.
- Drilled into CABA the pill degenerates to `Vacunaciones antirrábicas (conteo) | 80 | 80` — two identical numbers presented as a range.

**Fact or opinion:** fact.

---

### P3-3 — The «Desierto veterinario» vista headlines two KPIs that are not the desert

**What I saw:** the metrics column on that vista shows `70,1% Cobertura antirrábica` and `42,4% Cobertura de esterilización`. The vista's own measure appears nowhere in the column — only on the map.

This is a **declared** gap, not a discovery: `src/modules/panorama/domain/presets.ts:446-450` states there is no `PanoramaKpiId` for it and says so rather than hiding it. Flagged only because the two shown KPIs are the ones the misleading legend sentence in P2-4 is generated from, so the two defects compound: a deficit vista whose headline numbers and whose spoken conclusion are both about a different, improving metric.

**Fact or opinion:** fact.

---

## What I pressed and it held

- **The vet-desert wording.** Label (`Desierto veterinario (% sin atención registrada)`), description, expanded legend (`Relleno = % de mascotas activas sin atención veterinaria registrada, últimos 90 días`), ranking header and column all say coverage-of-attention, and `countLabel` is carefully `Mascotas sin atención registrada`, not "sin atención". I grepped the whole tree for residual duration copy (`días sin`, `días desde`, `sin actividad veterinaria`) — every hit is a comment, a test fixture, or an unrelated feature (alert queues, travel compliance). No production string calls it a time measure. Only the bare legend number (P2-3) still lets a reader think otherwise.

- **k-anonymity at department grain.** Drilling to Santa Cruz shows an explicit, honest refusal, not a zero: *"1 departamentos SÍ reportaron, pero sus valores son tan bajos que mostrarlos identificaría casos. Hay señal; no se puede publicar al detalle."* plus a `Protegido (k<5) · 1 unidad suprimida por k-anonimato` chip in the table **and** a visibly hatched polygon on the map (`select-AR-Z.png`, lower-left department). The API backs it: `value: null, suppressed: true, suppressedCount: 1`. Zero and "we can't tell you" are correctly different claims at this tier. (The province tier is P2-1.)

- **Drill affordance (plan unit C.4).** The map is *not* the only way in. The «Alcance» disclosure contains two real `<select>` elements with real `<label>`s — my first probe reported them nameless, and that was my error: read after hydration they carry `Provincia` and `Localidad` (`probe8.out`). Keyboard-reachable, options `Todas / Tierra del Fuego / Santa Cruz / CABA`, `Localidad` correctly `disabled` until a province is chosen. Drilled state also grows a visible `← Volver a Nacional` button. The affordance is one disclosure-click deep, which is a design opinion, not a defect.

- **URL determinism / shareability (plan unit C.3).** Every state change writes a complete URL — `?preset=…&layers=…&province=…&level=…&z=…&lat=…&lng=…&period=…`. I copied a live URL, opened it in a fresh page, and got a byte-identical URL back and the same legend (`probe5.out`, §D: `URL identical after reload: true`).

- **Camera reset on vista switch.** I zoomed in four notches (`z=4.22 → z=8.22`, URL gained `level=locality`), then switched vista to Índice territorial. The camera returned to `z=4.22` and dropped `level` — no stale zoom carried across (`probe6.out`, §CAMERA ON VISTA SWITCH). Note this is the *operator's scope* frame, not the national frame: `shouldEmitPresetFrame` (`presets.ts:62-69`) deliberately suppresses a `national` framing for a jurisdiction-scoped session, which is the right call for this operator and which I could not exercise for an unscoped one with the `govt` role.

- **Ranking polarity.** Unlike the legend, the table gets it right in both directions: Desierto ranks descending (`18,2 / 16,1 / 12` — worst first) and Acceso veterinario ranks ascending (`1.420 / 1.727,3 / 1.798` — worst first). `rankWorstUnits` is passed `higherIsBetter` properly at `PanoramaConsole.tsx:3433/3445/4127`. The bug in P1-1 is confined to the legend call site at `:4250`.

- **Suppression visibility on the collapsed pill.** The `⊘ k<5 protegido` chip is genuinely never hidden — present on all 15 presets, at both viewports, drilled and undrilled. (Its promise overreaches at province grain — P2-1 — but it is not hidden.)

- **Console health.** Zero console errors across all four routes and across every one of the 15 preset navigations. Nothing in this review is a crash.
