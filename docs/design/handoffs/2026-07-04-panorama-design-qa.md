# Design-QA — Panorama Fase-1 Redesign

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `08324f65` |
| **Redesign commits reviewed** | `80bf0aff` (foundations), `71f5f6ef` (reading + suppression + frame), `931f6cac` (reflow + debounce/abort) |
| **Note** | `components/panorama/presets.ts` does not exist; presets live in `src/modules/panorama/domain/presets.ts` |

---

## Executive summary

This is a **real** redesign, not furniture-moving: progressive disclosure, question-framed presets, auto-reading, and promoted privacy counts address the original “27 controls / buried gaps” problem structurally. It is **demo-ready with nits** — credible for a municipality walkthrough, but the ≤8 control budget is not met in production, the auto-reading is honest yet thin for a mayor, and the default landing still undersells the selling point.

---

## 1. First-paint restraint

**Verdict: PARTIAL**

**What works**

- Layer toggles, aggregation axis, opacity sliders, and scope/period pickers are correctly buried behind **one** `Personalizar` disclosure and a separate `Alcance y período` disclosure (`PanoramaConsole.tsx:1356-1397`, `PanoramaShell.tsx:113-121`).
- Hierarchy is **Reading → Presets → Suppression → Scrubber → Map → KPIs**, enforced in composition and tests (`PanoramaConsole.tsx:1319-1402`, `PanoramaConsole.test.tsx:292-304`).
- Presets are question-framed and full-width above the map (`PresetPanel.tsx:31-51`, `presets.ts:74-133`).
- The automated control-budget test exists and documents intent (`PanoramaConsole.test.tsx:323-337`).

**What weakens the claim**

- Production first paint is **~11 interactive controls**, not ≤8:
  - 5 preset buttons (`PresetPanel.tsx:37-52`)
  - 3 TimeScrubber controls: play, range, “Ahora” (`TimeScrubber.tsx:154-189`) — **always visible**, not behind disclosure
  - 1 “Mi alcance” map button (`SituationalMap.tsx:959-965`)
  - 2 disclosure summaries (`PanoramaConsole.tsx:1357-1381`)
  - Plus MapLibre zoom controls (`SituationalMap.tsx:278`)
- The ≤8 test **passes only because `TimeScrubber` is mocked to `null`** in the test harness (`PanoramaConsole.test.tsx:77-79`). That gap between test and runtime is a credibility risk for the capstone adoptability claim.
- Default landing is **not a preset**: `perdidas` layer on, `activePresetId` null unless URL carries `?preset=` (`PanoramaConsole.tsx:275-288`, `1009-1012`). The promoted preset row and map state are visually disconnected on first paint.
- **Scope** is visible in the shell chip (`PanoramaShell.tsx:87-90`), but **period** is one click away — reasonable for restraint, but a govt operator changing the analytical window must discover `Alcance y período`.

**Hierarchy judgment**

Reading-before-preset is the stronger call for a mayor (“so what” before “which lens”). Preset → map → reading would bury the headline. The weak link is **scrubber-before-map**: a 3-year temporal control on every landing competes with the map hero and blows the control budget.

---

## 2. Auto-reading (`reading.ts`)

**Verdict: PARTIAL**

**What works**

- Derives **only** from `KpiDelta[]` on known KPI ids; unknown ids ignored; no extra queries (`reading.ts:57-64`, `76-95`, `PanoramaReading.tsx:21-26`).
- Valence logic is sound: cobertura `goodUp`, mordeduras/zoonosis `badUp` (`reading.ts:35-39`, `62-63`).
- Headline = largest \|pct\| among non-flat deltas; tie-break by input order (`reading.ts:79-84`).
- es-AR is natural: *“Mordeduras empeora 12% vs período anterior; 2 de 3 indicadores mejoran.”* (`reading.test.ts:37`).
- Stale KPIs hide the reading — avoids misleading synthesis (`PanoramaReading.tsx:22`, `PanoramaConsole.tsx:1327-1329`).
- Privacy guard: decoy suppressed-cell fields do not affect output (`panorama-privacy-guard.test.tsx:37-60`).

**What limits usefulness for a mayor**

- Only **3 of 7** KPIs carry deltas (cobertura, mordeduras, zoonosis) — `get-panorama-kpis.ts:199-202`, `270`, `318+`. Esterilización, pérdidas, denuncias never headline.
- Headline selects **largest swing**, not **worst outcome**. A +12% mordeduras move can headline over a −20% cobertura drop depending on array order/magnitude (`reading.ts:79-84`, `reading.test.ts:40-46`) — magnitude ≠ salience for public health.
- No **absolute** context: *“empeora 12%”* without *“cobertura al 42%, meta 80%”* — a mayor cannot act from the sentence alone.
- Fallback is filler on demo/no-prior-window data: *“Sin variación destacable frente al período anterior.”* (`reading.ts:42`, `reading.test.ts:101-113`) — honest, but not situational.

---

## 3. Honest data-gaps (`PanoramaSuppressionNotice`)

**Verdict: WORKS (with parity nits)**

**What works**

- Promoted to first-class, zero-click, between presets and map (`PanoramaConsole.tsx:1339-1341`).
- Shows **counts of suppression**, never rates (`PanoramaSuppressionNotice.tsx:8-11`, `51-70`).
- Calm pill styling — informational, not alarm (`PanoramaSuppressionNotice.tsx:48-49`, `58-69`).
- Per-layer breakdown in `title` builds trust (`PanoramaSuppressionNotice.tsx:42-44`, `60-61`).
- Ignores inactive/loading layers — no false positives (`PanoramaSuppressionNotice.tsx:33-34`, tests at `panorama-suppression-notice.test.tsx:84-98`).

**Parity vs `MapChoropleth`**

| Surface | Copy |
|---|---|
| MapChoropleth tooltip | *“Datos insuficientes (protegidos por privacidad · k-anonimato)”* (`MapChoropleth.tsx:535-536`) |
| SituationalMap tooltip | Same phrase (`SituationalMap.tsx:747`, `861-862`) |
| PanoramaSuppressionNotice | *“{N} celdas con menos de 5 casos ocultas por privacidad (k-anonimato)”* (`PanoramaSuppressionNotice.tsx:61`) |
| SituationalMap legend | *“Suprimido”* only (`SituationalMap.tsx:1074`) |
| MapChoropleth legend | *“Datos insuficientes (privacidad)”* (`MapChoropleth.tsx:851`) |

Aggregate notice + per-cell tooltips are **complementary and honest**. Legend copy on the situational map is **weaker** than dashboard choropleths — a trust nit for cross-surface demos.

**Landing gap**

Default-on `perdidas` often shows **no** suppression pills until a choropleth/density preset activates (`PanoramaSuppressionNotice.tsx:33-34`, `55`). The promotion is structural, not always visible on first paint.

---

## 4. Perceived speed / native feel

**Verdict: WORKS**

**What works**

- Preset commit: synchronous state + shallow URL; **200ms trailing debounce** on layer fetch burst (`PanoramaConsole.tsx:67`, `1116-1126`).
- Keyed abort per layer + KPIs; superseded fetches must not deactivate layers (`PanoramaConsole.tsx:227-230`, `73-75`, `709-713`).
- Preset framing is camera-only; `brotes-activos` → national frame (`presets.ts:85-87`, `SituationalMap.tsx:393-414`, `situational-map-utils.ts:192-200`).
- Map stays mounted; no full navigation on preset (`PanoramaConsole.tsx:1041-1047`).
- `kpisStale` warning instead of silent stale numbers (`PanoramaConsole.tsx:1403-1412`).

**Jank / layout-shift risks**

- KPI strip below map can reflow when 7 tiles load (`PanoramaKpiStrip.tsx:52-71`) — demotion is intentional but adds vertical shift after map engagement.
- Suppression pills pop in when layer envelopes resolve (`PanoramaSuppressionNotice.tsx:51-55`).
- Preset camera `fitBounds` on national frame can feel like a “jump” after click — intentional, but needs reduced-motion respect (handled: `SituationalMap.tsx:406-413`).

Overall: reads as **intentional and fast**, not janky, assuming backend latency is acceptable.

---

## 5. Coherence with LN design system

**Verdict: PARTIAL**

**What works**

- Operator tokens throughout: `text-ln-op-mute`, `border-ln-op-line`, `bg-ln-op-card`, `ln-op-azul` active preset (`PresetPanel.tsx:41-44`, `PanoramaShell.tsx:82-96`).
- Type scale consistent: `text-xs font-bold uppercase tracking-[0.12em]` section labels (`PresetPanel.tsx:31`, `TimeScrubber.tsx:147`).
- Dark map canvas + light operator chrome is a deliberate operator-console split (`SituationalMap.tsx:171-174` vs `MapChoropleth.tsx:292`).
- Methodology disclosure at bottom supports govt credibility (`PanoramaShell.tsx:131-158`).

**Nits**

- Scope chip uses emoji 📍 (`PanoramaShell.tsx:88`) — slightly informal vs rest of operator chrome.
- Map overlay legends (`text-white/90` on `bg-black/55`) are **map-native**, not `ln-op-*` — acceptable for canvas, but feels bolted-on next to light DS panels.
- `TimeScrubber` is always expanded — visually equal weight to presets; competes with the “restrained board” story (`TimeScrubber.tsx:142-207`).

No major contrast failures spotted in code; dark-map popup contrast is intentionally high (`SituationalMap.tsx:701`).

---

## 6. Three open PO flags — recommendations

### A. Reading verb / badge copy (`reading.ts:25`, `87-94`)

**Shipped default:** `mejora` / `empeora` + magnitude + count suffix.

**Recommendation: KEEP**, with one fast-follow: append **one absolute anchor** when headline KPI is cobertura or esterilización (e.g. *“…; cobertura actual 42% (meta 80%).”*). Valence verbs are correct for es-AR govt register; the gap is context, not grammar.

### B. Preset map framing — only `brotes-activos` (`presets.ts:64-87`)

**Shipped default:** Single demonstrator; framing-less presets clear frame (`PanoramaConsole.tsx:1098-1103`, test at `PanoramaConsole.test.tsx:358-365`).

**Recommendation: EXPAND in fast-follow**, not block demo:
- Add `{ kind: "national" }` to **`cumplimiento`** and **`control-poblacional`** (province choropleth presets — same national-overview question).
- Keep **`bienestar`** / **`sintomas`** locality-level without framing (local drill-down questions).

### C. KpiStrip demoted below map (`PanoramaConsole.tsx:1400-1402`)

**Shipped default:** Map hero; KPIs as supporting evidence.

**Recommendation: KEEP for demo narrative** — the selling point is situational geography, not a dashboard clone. Fast-follow: add **2-tile mini-strip** (cobertura + esterilización only) between reading and presets, or fold absolutes into the reading sentence. Full 7-tile strip can stay below the map.

---

## Prioritized fast-follow nits

| Sev | Nit | Specific fix |
|---|---|---|
| **P0** | Control budget fails in production (~11+) because TimeScrubber is first-class | Collapse scrubber behind *“Reproducir en el tiempo”* disclosure default-closed; or exclude scrubber from budget but document honestly |
| **P0** | ≤8 test mocks away TimeScrubber | Render real `TimeScrubber` in budget test, or rename budget to “board controls” vs “temporal controls” |
| **P1** | Auto-reading lacks absolute situational context | Extend `buildPanoramaReading` input with current `%` for headline KPI (from existing KPI payload, not map cells) |
| **P1** | Default landing: no preset selected, `perdidas` only | Default `activePresetId` to `cumplimiento` or `brotes-activos` for govt `/gob/panorama` first visit |
| **P2** | Suppression legend says “Suprimido” vs dashboard “Datos insuficientes (privacidad)” | Align `SituationalMap.tsx:1074` with `MapChoropleth.tsx:851` |
| **P2** | Scope chip emoji | Replace 📍 with lucide/map pin icon or text-only badge |
| **P3** | Headline = max \|pct\|, not max harm | Secondary sort: prefer `empeora` KPIs when magnitudes are close (`reading.ts:79-84`) |
| **P3** | Period picker hidden on landing | Show active period as read-only chip next to scope in shell header |

---

## Demo verdict

### **YES-WITH-NITS**

**Fixes the original problem enough to demo** because:
- ~8 layer toggles + filters + aggregation are correctly hidden (`PanoramaConsole.tsx:1373-1397`).
- Presets answer questions in plain es-AR (`presets.ts:78-131`).
- Privacy suppression is no longer buried in layer badges (`LayerPanel.tsx:136-149` → promoted `PanoramaSuppressionNotice.tsx:51-70`).
- Fetch coalescing/abort makes preset switching feel deliberate (`PanoramaConsole.tsx:1116-1126`).

**Not fully closed** because production still presents ~11+ controls, default landing doesn’t showcase the strongest preset story, and the auto-reading is honest but not yet mayor-actionable.

---

## Single highest-leverage design improvement still on the table

**Default-activate a question-framed preset (recommend `cumplimiento` or `brotes-activos`) on first govt visit**, with matching map framing + auto-reading that includes one absolute compliance number — so the first screen instantly answers *“¿dónde estamos mal?”* instead of showing an orphan `perdidas` layer with a generic fallback sentence.

That one change aligns preset row, map content, suppression notice, and reading into a single credible “Centro de Situación” moment for a municipality demo.
