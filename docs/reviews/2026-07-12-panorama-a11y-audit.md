# Panorama v3 console — accessibility audit (read-only)

Scope: `/gob/panorama` (lucas@dim.test, jurisdiction-scoped CABA) and `/admin/panorama`
(admin@dim.test, universal scope), served from the existing :3000 build. Automated pass via
axe-core 4.11.4 (repo devDependency, loaded from
`node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js`, no CDN). Manual pass via
Playwright keyboard driving + accessibility-tree snapshots. No files were edited; no server was
restarted; :3001 was never touched.

States covered: national admin view, admin drilled into CABA (province=AR-C), govt jurisdiction
view drilled to locality/comuna level, each of the 5 rail panels (Vista/Filtro/Período/Exportar/
Acerca) open, the dock collapsed and expanded on all 3 tabs (Registros/Estadísticas/Línea de
tiempo).

---

## AUTOMATED (axe-core) findings

These 3 reproduced identically across every state tested (national, drilled, all 5 rail panels,
both accounts) — they are structural, not state-dependent.

| # | Surface | Issue | WCAG criterion | Impact | Evidence |
|---|---|---|---|---|---|
| A1 | Dock tab row, **collapsed** (`components/panorama/PanoramaDock.tsx:91`) | `aria-controls="pano-dock-panel"` on each tab button references an element that **does not exist in the DOM** — the tabpanel (`id="pano-dock-panel"`, line 130) is only rendered when `open === true`. Axe: `aria-valid-attr-value`, critical. Confirmed by re-running axe with the dock expanded: violation disappears. | 4.1.2 Name, Role, Value | Critical | axe `aria-valid-attr-value`, target `#pano-dock-tab-registros`, "Invalid ARIA attribute value: aria-controls=\"pano-dock-panel\"". Reproduced on both `/gob/panorama` and `/admin/panorama`, national and drilled. |
| A2 | Left nav rail (AppShell chrome, not Panorama-specific but present on every Panorama page) | Section headers ("Gobierno"/"Administración", "Vigilancia sanitaria", "Casos y cumplimiento", etc.) at 9px, and the role badge ("GOBIERNO"/"ADMINISTRADOR/A") + "· 5 LOCALIDADES" meta at ~10px, render `#7c93ac` on `#0a3556` → **4.0:1**, below the 4.5:1 AA text minimum. | 1.4.3 Contrast (Minimum) | Serious | axe `color-contrast`, 6 nodes, "insufficient color contrast of 4 (expected 4.5:1)". Out of Panorama's own scope but shared chrome, so it rides along on every Panorama page load. |
| A3 | Map canvas region (`components/panorama/SituationalMap.tsx:3486-3489`) | The map wrapper `<div role="img" tabindex="0">` contains **3 independently-focusable descendants**: the MapLibre canvas itself (which MapLibre stamps with `role="region" tabindex="0"` and its own `aria-label="Mapa de situación"`), plus the Acercar/Alejar zoom buttons. `role="img"` tells AT to treat the subtree as a single leaf/atomic node, but it has real interactive children — a screen reader's virtual cursor may never reach the canvas or the zoom buttons even though sighted keyboard users can Tab to them (confirmed: Tab visits the wrapper div AND the inner canvas as two separate, redundant stops for the same map). | 4.1.2 Name, Role, Value / keyboard-AT parity | Serious | axe `nested-interactive`. The code's own comment (line 3470-3487, `biome-ignore lint/a11y/noNoninteractiveTabindex`) already flags the div/tabindex side of this as a known, deferred tradeoff — the axe hit shows the tradeoff is now a live violation, and it's wider than the comment anticipated (MapLibre's own canvas tabstop + the zoom buttons compound it). |

### State-specific automated findings

| # | Surface | Issue | WCAG criterion | Impact | Evidence |
|---|---|---|---|---|---|
| A4 | Vista rail panel open (`components/panorama/PresetPanel.tsx:154-190`) | The presets `<ul role="radiogroup">` overrides the `<ul>`'s implicit "list" role with "radiogroup". Its `<li>` children keep their implicit "listitem" role but no longer have a valid list-type ancestor, so axe flags them as orphaned. | 1.3.1 Info and Relationships | Serious | axe `listitem`, 6 nodes, only appears when the Vista panel is open (`fieldset > ul > li`). Fix would be `role="presentation"` on the `<li>` (semantics already carried by the `role="radio"` button inside). |
| A5 | Filtro rail panel open (`components/panorama/FiltroPanel.tsx`, layer description text) | The per-layer helper copy ("Reportes de mascotas perdidas y avistajes…", etc., `text-ln-op-faint` at `text-xs`) fails contrast against its card background. 7 nodes. | 1.4.3 Contrast (Minimum) | Serious | axe `color-contrast`, only surfaces with Filtro open. |
| A6 | Estadísticas dock tab, expanded | The row hint "Pasá el mouse por una fila para ubicarla en el mapa · click para ver el detalle." (`text-ln-op-faint`) fails contrast. | 1.4.3 Contrast (Minimum) | Serious | axe `color-contrast`, only surfaces on the Estadísticas tab. |

Período, Exportar, Acerca panels, and the Registros/Línea de tiempo dock tabs added **no**
additional violations beyond A1–A3.

---

## MANUAL findings (the a11y axe can't see)

| # | Surface | Issue | WCAG criterion | Impact | Evidence |
|---|---|---|---|---|---|
| M1 | **Scope pill → jurisdiction commit** (`components/panorama/OverlayDisclosure.tsx:49-58` vs. `60-78`) | The `closeSignal` effect (used ONLY by the scope pill, `PanoramaConsole.tsx:3620`, to auto-close the panel once a province/locality commits) calls `setOpen(false)` but — unlike the explicit-Escape handler two blocks below it, which correctly does `summaryRef.current?.focus()` — **never restores focus**. Confirmed live: focus scope pill → Enter (opens) → Tab (lands on the province `<select>`) → ArrowDown (commits `province=AR-C`, panel auto-closes) → `document.activeElement` is `<body>`. A keyboard user's focus is silently dropped to the top of the document after every scope change — they have to re-discover their place from scratch. Explicit Escape (no commit) DOES correctly return focus to the pill — this is narrowly a bug in the *auto-close-on-commit* path, not the whole component. | 2.4.3 Focus Order (best-practice gap; no strict SC number covers "orphaned focus" cleanly, but this is the practical failure) | **High** | Live repro on `/admin/panorama` with a multi-province account. Root cause pinpointed to `OverlayDisclosure.tsx` lines 52-58 (`closeSignal` effect body) missing the focus-restore call present at line 66. |
| M2 | **Scope commit → no announcement** | Nothing announces the new scope to a screen reader when it changes. The scope pill's visible text updates (`liveScopeLabel`, `PanoramaConsole.tsx:3626`), the map re-frames, KPIs refetch — none of it lives inside an `aria-live` region. Compare: the console DOES wire `aria-live="polite"` for `kpisStale`, `scaleAnchoredToAsOf`, and `pointsInfo` notices (all in the same render block) — the scope-change case was simply never given the same treatment. Mission's specific ask ("does ANYTHING announce 'Córdoba' when scope commits?") — confirmed **silent**. | 4.1.3 Status Messages | **High** | Verified: no `aria-live`/`role="status"`/`role="alert"` ancestor or sibling wraps the scope pill's summary text or fires on scope change. Compounds with M1 — a screen-reader user gets neither a focus cue nor a spoken announcement after changing scope via the one keyboard path. |
| M3 | **Dock tablist** (`components/panorama/PanoramaDock.tsx:81-112`) | `role="tablist"`/`role="tab"` is applied, but there is no roving-tabindex/arrow-key handling — confirmed live: focused a tab, pressed ArrowRight, focus did not move. All 3 tabs are separate Tab stops instead. Keyboard-operable (SC 2.1.1 is satisfied via Tab), but it deviates from the WAI-ARIA APG tab pattern that `role=tablist` advertises, which a screen-reader user may reasonably expect (arrow keys usually switch tabs; Tab usually moves ONE stop for the whole group). Compare `components/panorama/PresetPanel.tsx`, which implements the pattern correctly (roving tabindex + Arrow/Home/End, lines 80-130) for its own radiogroup — the dock just didn't get the same treatment. | ARIA APG conformance / 2.1.1 (satisfied, but pattern-inconsistent) | Medium | Live repro: `ArrowRight` on a focused dock tab is a no-op. |
| M4 | **Legend pill — redundant accessible name** (`components/panorama/LegendPill.tsx` + `PanoramaConsole.tsx` caller) | When the only active base layer is a point layer with no choropleth (e.g. "Denuncias" + one other point layer active, no rate/count fill), `baseLabel` and one of the `layerDots` end up naming the **same layer**, so the pill's flattened accessible text reads "Denuncias de bienestar Denuncias de bienestar Reunificación ⊘ k<5 protegido" — confirmed identically on both the govt (CABA) and admin (national) sessions, so it's a systemic pattern, not a one-off data quirk. Sighted users see it as two adjacent chips (less confusing visually); a screen reader flattens it into one repetitive sentence. | 1.3.1 / general SR-clarity (no hard SC violation, UX-for-AT quality issue) | Low–Medium | Snapshot evidence from both accounts, identical duplication pattern. |
| M5 | **Rail, Filtro, Período, Exportar, Acerca panels** — Enter/Esc/focus-return | All correct. Live-verified on the Filtro panel: focus trigger → Enter opens the panel (native button activation) → Esc closes it AND returns focus to the trigger button. Non-modal (map stays interactive underneath), matches the code's documented intent (`PanoramaRail.tsx:70-89`). | — | Compensating path (pass) | Verified via `document.activeElement` before/after. |
| M6 | **Scope pill itself** — Enter/Esc/focus-return | All correct in isolation (i.e. the non-commit path). `<summary>` (native, implicit button role) → Enter opens the `<details>`, next Tab lands on the province `<select>` → explicit Escape (no selection change) closes the panel and correctly returns focus to the `<summary>`. Only the commit-driven auto-close loses focus (see M1). | — | Compensating path (pass, partially — see M1) | Verified via `document.activeElement`. |
| M7 | **Full Tab order / focus trap check** | Real order observed: masthead nav links → global search → "Cerrar sesión" → map (div + nested canvas, 2 stops — see A3) → zoom buttons → "Volver a mi jurisdicción"/"Vista nacional" → dock (3 tabs, CSV link, Expandir) → scope pill → KPI cards → "Ver metodología" → **rail (all 7 buttons: Vista/Filtro/Período/Línea de tiempo/Exportar/Actualizar/Acerca)** → legend pill → wraps cleanly back to the masthead. The rail **is** fully keyboard-reachable (mission's specific concern) and **no focus trap** exists anywhere in the walk (40+ Tab presses, full loop confirmed). Note the rail comes AFTER the KPI cards/map, not right after the masthead as the mission's phrasing implied — worth knowing for QA scripts that assume that order, but not itself a defect. | 2.4.3 Focus Order (informational) | — | Full order captured via `document.activeElement` polling across 60 Tab presses. |

---

## Compensating paths verified (wheel-nav is pointer-only by design)

- **Scope change via the pill is the sole, fully keyboard-operable equivalent of wheel-driven
  scope commits.** Verified end-to-end on the admin (multi-province) account: Tab to the pill →
  Enter opens it → Tab reaches the province `<select>` → Arrow Up/Down changes + **commits** the
  province immediately (native `<select>` behavior, no separate Enter needed) → URL updates
  (`province=AR-C`) → panel auto-closes. This is a real, working keyboard path — **but see M1/M2
  above**: the auto-close silently drops focus to `<body>` and nothing announces the new scope, so
  while the path exists and functions, the experience for keyboard/screen-reader users immediately
  after a commit is degraded (no confirmation, no predictable focus landing spot).
- Locality `<select>` could not be exercised the same way on the govt (single-province) account —
  it was correctly `disabled` (no localities available for that scope in the current seed data);
  this is expected component behavior (`JurisdictionSwitcher.tsx:174`), not a bug.
- Explicit Escape (without changing the select) correctly closes the scope pill and returns focus
  to the trigger — only the "selection just committed" path (M1) is broken.

---

## Contrast spot-checks (light theme)

Computed via injected `getComputedStyle` + the WCAG relative-luminance formula (not just axe's
built-in flags), on rendered elements:

| Element | Foreground | Background | Font size | Ratio | Verdict |
|---|---|---|---|---|---|
| "⊘ k<5 protegido" suppressed-hatch legend chip (`LegendPill.tsx:66-75`) | `#66727c` | `#eef1f4` | 13px / 400 | **4.35:1** | Fails AA text (4.5:1) by a small but real margin. Axe's automated pass did not surface this specific node (likely a selector/whitespace difference in how axe walks the nested spans), but the computed ratio is below threshold — flag for a manual fix pass. |
| Scope-pill footer hint "También podés hacer click en una provincia del mapa." (`text-ln-op-faint`, inside the Jurisdicción panel) | `#95a0a8` | `#ffffff` | 13px / 400 | **2.67:1** | **Clear fail** — well under both the 4.5:1 normal-text and 3:1 large-text minimums. |
| AppShell muted nav/masthead text (`text-ln-op-mute`, e.g. breadcrumb "Dashboard", role badge) | `#66727c` | `#ffffff` | 10–12px / 400 | 4.67–4.93:1 | Pass (barely, on the 12px samples; the 10px ones are borderline-pass — worth re-checking if the token's exact hex is nudged in a future revision). |
| KPI delta glyph/percentage (▲ +71%, ▼, ＝) | — | — | — | **N/A by design** | `components/panorama/PanoramaKpiTile.tsx:7` states explicitly: "The delta stays a neutral text line — NEVER a valence color," backed by a dedicated regression test (`__tests__/panorama-kpi-tile.test.tsx:54`, "keeps the delta line a NEUTRAL glyph — never a valence color"). `KpiChips.tsx` renders every delta in the same `text-ln-op-faint` regardless of direction. **The mission's premise of a "CVD-tuned delta color set" does not apply to this v3 component** — there is no valence coloring to check. If a CVD-safe red/green pairing exists elsewhere (e.g. an older `PanoramaMetricsColumn` path), it wasn't reachable from the v3 rail UI exercised here. |

---

## Prioritized fix shortlist

1. **[Critical]** A1 — Give the dock tabpanel container a stable `id="pano-dock-panel"` that exists
   in the DOM regardless of `open`, or drop `aria-controls` while collapsed. One-line, high blast
   radius (fires on every single page load/state).
2. **[High]** M1 + M2 — Scope-commit auto-close: (a) add the same `summaryRef`-style focus-restore
   to `OverlayDisclosure`'s `closeSignal` effect that the Escape handler already has; (b) add an
   `aria-live="polite"` region announcing the new scope label on commit (mirror the existing
   pattern already used for `kpisStale`/`scaleAnchoredToAsOf`). These two fixes are adjacent code
   and address the single most consequential gap found — the ONE keyboard path to change scope
   currently leaves keyboard/AT users stranded with no feedback.
3. **[Serious]** A3 — Map region nested-interactive: either drop `role="img"` (now that the div is
   legitimately interactive/focusable, i.e. resolve the tension the code comment already flags as
   deferred) in favor of a `role="application"`/plain landmark + proper labeled child controls, or
   move the zoom buttons outside the `role="img"` subtree and suppress MapLibre's own canvas
   tabindex via its a11y config.
4. **[Serious]** A2 + A5 + A6 + contrast-spot-check row 1/2 — Batch contrast fix: bump
   `--color-ln-op-rail-mute`, `text-ln-op-faint` and the k-anon chip's foreground token(s) enough
   to clear 4.5:1 against their respective card/rail backgrounds. Several distinct call sites share
   the same 1-2 tokens, so this is likely a small token-level fix with wide effect.
5. **[Serious]** A4 — Add `role="presentation"` (or equivalent) to `PresetPanel.tsx`'s `<li>`
   wrappers now that the parent `<ul>` carries `role="radiogroup"`.
6. **[Medium]** M3 — Add roving-tabindex + Arrow/Home/End handling to `PanoramaDock`'s tablist,
   mirroring the pattern `PresetPanel.tsx` already implements correctly for its radiogroup.
7. **[Low]** M4 — De-duplicate the legend pill's accessible name when `baseLabel` coincides with a
   `layerDot` label (skip rendering the redundant dot, or merge the two into one phrase).
