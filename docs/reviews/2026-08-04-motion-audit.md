# Motion, transition and state-change feedback — audit

**Date:** 2026-08-04
**Scope:** read-only audit of every place the DIM / MiMAR UI moves or changes state visually — `app/**`, `components/**`, `lib/**`, plus `app/globals.css` and the four print stylesheets.
**Verdict up front:** the motion in this repo is **a set of good isolated instincts with no system behind them.** Individual implementations are unusually well-reasoned (the `@starting-style` drawer, the MapLibre reduced-motion floor, the `translateX(cqw)` scrubber marker, the FlipCard edge-on turn). What does not exist is a *scale*: **18 distinct feedback durations and 8 distinct easing curves are in use, with zero `--duration-*` / `--ease-*` tokens to point at.** The three highest-cost gaps are all *absences*, not bad implementations: the panorama dock teleports, 165 route skeletons hard-cut to content, and the app's default confirmation modal pops in with no entry while a working entry pattern sits 300 lines away in the same stylesheet.

Two `prefers-reduced-motion` defects were found (WCAG 2.3.3 / Ley 26.653 territory). One of them was already reported in `docs/reviews/2026-08-04-css-properties-audit.md:227`; **the other is new and is on a citizen-facing public page.**

---

## Method and limits

### What I did

- Read `app/globals.css` in full for every `transition`, `animation`, `@keyframes`, `transition-delay`, `@starting-style` and `prefers-reduced-motion` block, and read the surrounding rule to name the surface each one belongs to.
- Swept `**/*.tsx` for the Tailwind motion utilities (`transition-*`, `animate-*`, `duration-*`, `ease-*`) and counted them.
- Swept `**/*.{ts,tsx}` for imperative motion: `scrollIntoView`, `scrollTo`, `.animate()`, `requestAnimationFrame`, `setInterval`/`setTimeout` driving style, MapLibre `easeTo`/`flyTo`/`fitBounds`/`panBy` and `*-transition` paint properties.
- Read every component named by those hits that plausibly owns a state change: dock, dialogs, drawers, sheets, tabs, disclosures, toasts, skeletons, KPI cards, charts, map, landing choreography.

### What I could NOT verify — every claim below is static

- **No runtime, no browser, no trace.** I did not run the app, take a screenshot, record a Playwright trace, or profile a frame. Every "this jumps" / "this pops" claim is derived from reading the code path, not from watching it. Marked **UNVERIFIED** where the reading could plausibly be wrong.
- **No perceived-performance measurement.** §6 says motion masks latency; I have no before/after number for that and am not claiming one.
- **Tailwind's compiled output is assumed, not read.** I take Tailwind v4's documented defaults as fact: `transition-*` ⇒ `150ms` + `cubic-bezier(0.4, 0, 0.2, 1)`; `animate-pulse` ⇒ `2s cubic-bezier(0.4,0,0.6,1) infinite`; `animate-spin` ⇒ `1s linear infinite`. I did not read the generated CSS in `.next/static/css/` to confirm. Verifying would take one `rg 'transition-duration' .next/static/css/*.css`.
- **Excluded:** `node_modules/`, `.next/`, `.ds-sync/`, `ds-bundle/`, `docs/design_handoff_landing/**`, `.claude/worktrees/`, and `e2e/**` (test-harness motion such as `e2e/demo/_helpers.ts:495` is a recording aid, not shipped UI).

### Relationship to the adjacent audit

`docs/reviews/2026-08-04-css-properties-audit.md` (same date) already covers the dock transition (its §2.3 / Task 2) and the `ScrollToSignal` guard (its Task 4) from a CSS-property angle. **This document does not restate their fix mechanics; it places them in the motion system and adds what a property-by-property sweep could not see:** the duration/easing census, the systemic disclosure gap, the second unguarded smooth scroll, and the "do not animate" list.

---

## 1. The motion inventory

Classification key: **[CSS-T]** CSS transition · **[CSS-A]** CSS animation/keyframes · **[TW]** Tailwind utility · **[JS]** imperative JS · **[NONE]** no motion where a state change happens.

### 1.1 Sheets, drawers, dialogs

| Surface | File:line | Class | Notes |
|---|---|---|---|
| Panorama `DetailDrawer` (native `<dialog>`) | `components/panorama/DetailDrawer.tsx:890-891` → `app/globals.css:544-572` | **[CSS-T]** | The one fully-modern entry/exit in the repo: `transform`/`opacity` 180ms `ease-out` + `overlay`/`display` `allow-discrete` + `@starting-style`. **This is the reference implementation.** |
| `ConfirmDialog` (native `<dialog>`, `showModal()`) | `components/ui/ConfirmDialog.tsx:190-206` | **[NONE]** | Backdrop and box appear instantly. `.op-drawer-enter` is deliberately scoped so "other native dialogs keep their current behavior" (`app/globals.css:542-543`) — i.e. the absence is *documented*, not accidental. It is still the most-used modal in the app. |
| `BulkRevokeList` confirm (native `<dialog>`) | `components/BulkRevokeList.tsx:284` | **[NONE]** | Same as above. |
| `Sheet` / bottom-drawer (Vaul) | `components/ui/VaulSheet.tsx:97-107` | **[JS]** (library) | Vaul owns the slide + drag physics. Not our code, not our tokens — an unmeasured third duration/easing source. **UNVERIFIED:** whether Vaul's animation honors `prefers-reduced-motion`. Verify by reading `node_modules/vaul/style.css` or emulating reduce in DevTools. |
| `OpMobileDrawer` (Vaul, operator nav) | `components/ui/dashboard/OpMobileDrawer.tsx:53-72` | **[JS]** (library) | Same. |
| `LnSheetPage` (full-page sheet, owner event forms) | `components/ui/Sheet.tsx:116-139` | **[NONE]** | It is a route surface, not an overlay — the "transition" is the route change (see 1.7). |
| Panorama `ContextBar` popover panel | `components/panorama/ContextBar.tsx:234-238` → `app/globals.css:585-595` | **[CSS-T]** | `.op-panel-enter`: 8px `translateY` + opacity, 120ms `ease-out`, `@starting-style`. |
| `OverlayDisclosure` popover panel (panorama pills, legend) | `components/panorama/OverlayDisclosure.tsx:136-143` | **[NONE]** | 🟠 The panel is a `<details>` child that is always in the DOM and simply becomes visible. Floats over a live map. Named as an open item in `docs/reviews/2026-07-12-panorama-design-critique.md:305`. |
| Masthead / `ContextSwitcher` / `HeaderNav` popovers | `components/layout/ContextSwitcher.tsx:115`, `components/layout/HeaderNav.tsx:152`, `components/layout/AppCitizenMasthead.tsx:262` | **[TW]** on the trigger only | `transition-colors` / `transition-opacity` on the button; the panel itself has no entry. |
| `OpOmnibox` results panel | `components/ui/dashboard/OpOmnibox.tsx:294,340` | **[TW]** spinner only | Panel appears instantly; `setTimeout(…, 150)` at `:294` is a blur-close delay, not an animation. |

### 1.2 The dock — the headline gap

| Surface | File:line | Class | Notes |
|---|---|---|---|
| `PanoramaDock` expand/collapse | `components/panorama/PanoramaDock.tsx:148-161` | 🔴 **[NONE]** | Inline `height` swaps between `min(42%, calc(100% - 26rem))` and `undefined`. No transition anywhere on the `<section>` (`:128`). |
| `PanoramaDock` tabs | `components/panorama/PanoramaDock.tsx:224` | **[TW]** `transition-colors` | The 2px active underline and label color cross-fade; the *pane content* underneath swaps instantly (`:272`, `{open ? panes[tab] : null}`). |
| `PanoramaDock` tabpanel | `components/panorama/PanoramaDock.tsx:265-273` | **[NONE]** | `hidden={!open}` — a discrete property. Even with a height transition added, this will pop at the end unless `allow-discrete` is applied (the `.op-drawer-enter` pattern). |

### 1.3 Tabs, accordions, disclosures — systemic

**Instance count: at least 9 distinct `<details>`-based disclosure surfaces, 0 of which animate the panel.** In every one, the *chevron* transitions and the *content* teleports. That asymmetry is the tell — someone reached for motion, got the easy half, and the hard half (auto-height) silently stayed a jump cut.

| Surface | File:line | Chevron | Panel |
|---|---|---|---|
| `LnAccordion` (owner forms) | `components/ui/Tabs.tsx:141` | **[TW]** `transition-transform duration-150` | **[NONE]** |
| `LnSheetAccordion` (editar mascota) | `components/ui/Sheet.tsx:471` | **[TW]** `transition-transform duration-150` | **[NONE]** |
| `OpMobileDrawer` nav sections | `components/ui/dashboard/OpMobileDrawer.tsx:182` | **[TW]** `transition-transform` | **[NONE]** |
| `AppShellDrawer` nav sections | `components/layout/AppShellDrawer.tsx:173-199` | — | **[NONE]** |
| `OverlayDisclosure` (panorama) | `components/panorama/OverlayDisclosure.tsx:121-144` | — | **[NONE]** |
| `PetForm` "Otros" block | `components/PetForm.tsx:406-618` | — | **[NONE]** |
| Landing FAQ (5 items) | `components/landing/FaqSection.tsx:22` | — | **[NONE]** (the `.lp-reveal` on it is a *scroll* reveal, not a disclosure) |
| `/leyes` catalog | `app/(public)/leyes/page.tsx:49` | **[TW]** `duration-150` | **[NONE]** |
| Owner disclosure rows | `app/globals.css:3779-3791` (`.ln-disc-chev`) | **[CSS-T]** `transform 0.2s ease` | **[NONE]** |
| Vaccination drill-down caret | `app/globals.css:4179-4184` (`.ln-vac-caret`) | **[CSS-T]** `transform 0.15s ease` | **[NONE]** |
| `PetDetailTabsPanel` face switch (credencial ⇄ libreta) | `components/pet-profile/FlipCard.tsx:141-166` | **[JS]** | The exception, and it is excellent: a real edge-on turn, guarded, with re-entrancy handling. |

### 1.4 Toasts, skeletons, pending states

| Surface | File:line | Class | Notes |
|---|---|---|---|
| Toasts (sonner) | `components/Toaster.tsx:19-29` | **[JS]** (library) | 4000ms default dismiss, 7000ms for errors. Enter/exit animation is sonner's, on sonner's curve. A fourth external motion source. |
| Skeleton shimmer (citizen) | `app/globals.css:603-621` | **[CSS-A]** | `skeleton-sweep 1.5s linear infinite`. |
| Skeleton shimmer (operator) | `app/globals.css:623-632` | **[CSS-A]** | Same keyframe, operator tokens. |
| `animate-pulse` placeholders | 37 occurrences / 27 files (e.g. `components/panorama/PanoramaBoardSkeleton.tsx:21-40`, `components/charts/*Dynamic.tsx:13`) | **[TW]** | Tailwind's 2s pulse — a **second, unrelated** skeleton idiom running alongside `skeleton-shimmer`. |
| Button spinners | 12 occurrences / 10 files (`components/ui/Button.tsx:98`, `components/ui/dashboard/OpButton.tsx:86`, `components/ui/Sheet.tsx:328`) | **[TW]** `animate-spin` | Correct and consistent. |
| Skeleton → content swap | 165 `loading.tsx` files (`app/**/loading.tsx`) | 🔴 **[NONE]** | Hard cut. |
| Streamed Suspense sections | `app/admin/sistema/_components/sistema-sections.tsx` (10×), `app/admin/inteligencia/inteligencia-panels.tsx` (6×), `components/admin/PetStatusDriftCard.tsx:31` | **[CSS-T]** `.op-fade-in` | 150ms opacity + `@starting-style`. **19 uses total, on 3 files — against 165 loading routes.** |
| Slow-load notice | `app/admin/AdminLoadingTimeoutNote.tsx:19-25` | **[JS]** timer | 12s → renders a note. Not motion; correct pattern (progressive disclosure of latency). |
| Action-stall notice | `lib/ui/action-stall.ts:40` (8000ms), `app/org/[orgToken]/atender/[publicToken]/AtenderStallNotice.tsx:73` | **[JS]** timer | Same. Good. |

### 1.5 Numbers, chips, filters, optimistic updates

| Surface | File:line | Class | Notes |
|---|---|---|---|
| `OpKpi` value on change | `components/ui/dashboard/OpKpi.tsx:750` → `components/ui/AnimatedNumber.tsx:35` → `lib/hooks/useCountUp.ts` | **[JS]** RAF | Eases the delta, 600ms `easeOutCubic`, guarded via `useReducedMotion`. Genuinely good. |
| Panorama `KpiChips` value on change | `components/panorama/KpiChips.tsx:282,304` | 🟠 **[TW]** opacity only | The whole list dims to `opacity-60` while refetching, then values **snap**. Two KPI components, two different answers to the same question. |
| `OpKpi` hover popover | `components/ui/dashboard/OpKpi.tsx:313-321` | **[JS]** timer | 220ms close delay (hover intent), not an animation. |
| Landing console counters | `components/landing/CountUp.tsx:19,91-97` | **[JS]** RAF | 900ms `easeOutCubic`, IntersectionObserver-triggered, guarded. |
| Ranking hover preview card | `app/globals.css:3025-3044` (`.ln-hovertip-in`) | **[CSS-A]** | 140ms, and the *comment* explains why it is short. Exemplary. |
| Chips / filters / period pickers | `components/gob/PeriodPicker.tsx:92`, `components/JurisdictionFilterBar.tsx:106`, + 340 more | **[TW]** `transition-colors` | The one genuinely consistent layer in the whole system. |
| Optimistic row add/remove in queues | `components/BulkApprovalQueueList.tsx:227`, `components/AdoptionQueueList.tsx:259,316`, `components/admin/AlertInboxTable.tsx:156` | **[NONE]** on the row itself; **[TW]** on hover | A row that leaves the list vanishes. Feedback comes from the button spinner + toast, not from the list. See §5 — this is arguably **correct**. |

### 1.6 Map, layers, scope

The best-systematised motion in the repo. Every camera move and every paint transition takes an explicit reduced-motion argument.

| Surface | File:line | Class | Guard |
|---|---|---|---|
| Division outline fade | `components/panorama/situational-map-config.ts:574` (`DIVISION_FADE_MS = 300`), applied `:912`, `use-choropleth-motion.ts:35-38`, `SituationalMap.tsx:1282` | **[JS]** paint transition | `duration: reducedMotion ? 0 : …` ✅ |
| Layer dim on focus | `components/panorama/situational-map-config.ts:721` (`DIM_TRANSITION_MS = 150`), applied `:729-731` | **[JS]** paint transition | ✅ |
| Jurisdiction autozoom | `components/panorama/SituationalMap.tsx:1074-1084` | **[JS]** `fitBounds`/`flyTo` | `animate: !prefersReducedMotion` ✅ |
| Preset frame | `components/panorama/SituationalMap.tsx:1114-1120` | **[JS]** `fitBounds` | ✅ |
| Province drill | `components/panorama/SituationalMap.tsx:2071-2076` | **[JS]** `fitBounds` | ✅ |
| Double-click / cluster zoom | `components/panorama/SituationalMap.tsx:2494-2498, 2542-2546, 2636` | **[JS]** `easeTo` | ✅ |
| Keyboard pan | `components/panorama/SituationalMap.tsx:2968-2971` | **[JS]** `panBy` | ✅ |
| CabaInset fit | `components/panorama/CabaInset.tsx:293` | **[JS]** | `animate: false` — always a cut, by design (an inset that animates is noise) ✅ |
| Deep-link camera restore | `components/panorama/SituationalMap.tsx:877` | **[JS]** `jumpTo` | Instant by design ✅ |
| Time scrubber play marker | `components/panorama/TimeScrubber.tsx:726` | **[TW]** `transition-transform duration-150 ease-linear` | Global CSS rule ✅ (comment at `:723-725` reasons it out) |
| Time scrubber play loop | `components/panorama/TimeScrubber.tsx:64,410-421` | **[JS]** `setInterval` 1100ms | Not an animation — a data cadence. |
| Recharts series | `components/charts/TimeSeriesChart.tsx:200,218`, `ForecastChart.tsx:203-241`, `StackedTimeSeriesChart.tsx:160` | **[JS]** (library) | `isAnimationActive={!reducedMotion}` ✅ |

### 1.7 Page transitions

**There are none.** Zero `startViewTransition`, zero `view-transition-name`, zero `unstable_ViewTransition` anywhere in the repo (`rg` returned only the 2026-07-04 native-mobile audit noting the same at `docs/design/handoffs/2026-07-04-native-mobile-audit.md:95`). Every navigation is: current page → `loading.tsx` skeleton → new page, both cuts.

### 1.8 Landing choreography (`.lp-*`)

Its own self-contained motion vocabulary, deliberately slower than the app. Listed for completeness because it dominates the duration census.

| Surface | File:line | Class |
|---|---|---|
| Scroll reveal | `app/globals.css:888-926` + `components/landing/RevealManager.tsx` | **[CSS-T]** 0.8s `cubic-bezier(0.2,0.7,0.2,1)` + 6 hardcoded delays |
| Hero credential auto-cycle | `components/landing/LandingHero.tsx:97,154-166` | **[JS]** 2600ms `setInterval`, one lap then stops |
| Hero card flip | `components/landing/LandingHero.tsx:178-199` | **[JS]** 290ms + 300ms |
| Hero card state morph | `app/globals.css:1194-1216, 1248, 1283-1284, 1339, 1396-1397, 1507` | **[CSS-T]/[CSS-A]** 0.2 / 0.28 / 0.4 / 0.45 / 0.5 / 0.7s |
| "Lost" pulse | `app/globals.css:1216` | **[CSS-A]** `1.6s ease-in-out infinite` |
| Map pin pulse | `app/globals.css:2431` | **[CSS-A]** `1.8s ease-out infinite` |
| Chapter jump | `components/landing/StorySection.tsx:76-82`, `components/landing/MilestoneNav.tsx:67-73` | **[JS]** smooth scroll, guarded ✅ |
| Credential document reveal | `app/globals.css:3046-3060` (`.ln-doc-in`) | **[CSS-A]** 0.6s |

---

## 2. The gaps that cost the most

Ranked by **frequency of encounter × cost per encounter**. Severity: 🔴 fix · 🟠 should fix · 🟡 worth doing · 🟢 note only.

### Gap 1 — 🔴 The panorama dock teleports over a live map
`components/panorama/PanoramaDock.tsx:148-161`

The control an operator toggles most often, expanding to 42% of the map viewport instantly. The handoff already specifies the value (`docs/design/handoffs/2026-07-11-panorama-v2C/README.md:157`, `dock height .18s ease`); the critique already ranked it #1 (`docs/reviews/2026-07-12-panorama-design-critique.md:301`); the CSS audit already wrote the fix (`docs/reviews/2026-08-04-css-properties-audit.md:267-279`). Three documents, zero implementations.

**What the user loses:** *sense of place*. The map is a spatial instrument — the operator holds a mental model of where things are on it. A panel that appears instantly over the bottom 42% forces re-acquisition of that model on every toggle, because nothing told the eye that the map was being *covered* rather than *changed*. This is the difference between "a drawer opened" and "the screen is now different." Repeated dozens of times a session.

### Gap 2 — 🔴 165 route skeletons hard-cut to content
`app/**/loading.tsx` (165 files) vs 19 uses of `.op-fade-in` on 3 files

Every navigation in the product ends in a jump cut from a shimmering placeholder to real text at (usually) a different height. The repo *already owns* the fix — `.op-fade-in` (`app/globals.css:576-584`) is a 150ms opacity transition with `@starting-style`, costs 9 lines, and is proven in production on `/admin/sistema` and `/admin/inteligencia`. It has simply never been applied to the 162 other routes.

**What the user loses:** the answer to *"did the page change or did it just re-render?"* A skeleton and its content occupy different heights; the cut reads as a layout glitch rather than an arrival. On operator consoles, where the same person navigates the same five routes all day, this is the most-repeated visual event in the whole product.

**Caveat, and it is load-bearing:** applying a fade to a route body means the *first* frame of real content is at `opacity: 0`. On a slow route that adds 150ms to time-to-legible-text. Apply it to **streamed Suspense boundaries** (where content arrives after the shell is already stable) — not to the top-level page body. That is exactly how the 19 existing uses are placed.

### Gap 3 — 🟠 `ConfirmDialog` pops in, and it is the app's default modal
`components/ui/ConfirmDialog.tsx:190-206`

Native `<dialog>` + `showModal()` with no `@starting-style`. The backdrop and the box appear on the same frame with no transition. Used for revocations, transfers, custody handoffs, decomisos — roughly 20+ call sites, all irreversible actions where the entire design intent (`ConfirmDialog.tsx:42-50`) is to make the user *stop and read*.

**What the user loses:** the modal's own argument. A dialog that appears instantly is easier to dismiss reflexively than one that arrives; a 150ms entry is the cheapest possible "something just changed, look here." The scoping comment at `app/globals.css:542-543` ("other native dialogs in the app keep their current behavior") reads as a deliberate decision, but the *reason* given is conservatism about scope, not a judgment that the confirm dialog should pop.

**Caveat:** do **not** animate the *exit* of a destructive-confirm dialog (§5).

### Gap 4 — 🟠 Nine disclosure surfaces where the chevron animates and the panel teleports
`components/ui/Tabs.tsx:141`, `components/ui/Sheet.tsx:471`, `components/panorama/OverlayDisclosure.tsx:136`, `components/ui/dashboard/OpMobileDrawer.tsx:182`, `components/layout/AppShellDrawer.tsx:173`, `components/PetForm.tsx:406`, `app/(public)/leyes/page.tsx:49`, `app/globals.css:3779`, `app/globals.css:4179`

The half-done state is worse than either endpoint: the rotating chevron *promises* a smooth expand that never comes, so the pop reads as a bug rather than a design choice.

**What the user loses:** in the owner forms (`Tabs.tsx`, `Sheet.tsx`, `PetForm.tsx`), everything below the accordion jumps down by the panel's height with no warning — the classic "I lost my scroll position" moment on a phone. In `OverlayDisclosure`, a panel materialises over the map with no directional cue about which pill it belongs to.

**This is the one gap where the fix is genuinely hard** — see §6 on `interpolate-size` and why the dock's constraint generalises.

### Gap 5 — 🟠 Two KPI components, two answers
`components/ui/dashboard/OpKpi.tsx:750` (animates its delta) vs `components/panorama/KpiChips.tsx:282,304` (dims, then snaps)

`AnimatedNumber` + `useCountUp` exists, is guarded, is tested (`components/ui/AnimatedNumber.test.tsx`), and is wired into exactly **one** consumer. The panorama's own KPI strip — the numbers an operator watches *while scrubbing time*, i.e. the single surface in the product where a number's change is the whole point — does not use it.

**What the user loses:** *which* number moved. Six figures re-render simultaneously; with no tween, nothing distinguishes the one that changed from the five that didn't. The `opacity-60` dim at `:257` tells you *the set* is stale; it cannot tell you *which member* moved. (The `Actualizando al {date}…` note at `:265-270` is a good honesty fix for staleness, and orthogonal to this.)

**Caveat:** on a *scrub* the values change every 1100ms (`TimeScrubber.tsx:64`). A 600ms tween would still be running when the next value arrives. Either shorten the tween on the scrub path or leave the scrub uncounted — do not ship a permanently-mid-tween number.

### Gap 6 — 🟡 Panorama popovers and rail panels have no entry
`components/panorama/OverlayDisclosure.tsx:136-143` — already logged at `docs/reviews/2026-07-12-panorama-design-critique.md:305`

`.op-panel-enter` (`app/globals.css:585-595`) already solves this and is already applied to the sibling `ContextBar` panel (`components/panorama/ContextBar.tsx:238`). One class, one file. The cheapest item in this document.

### Gap 7 — 🟢 Two unrelated skeleton idioms
`skeleton-shimmer` / `op-skeleton-shimmer` (1.5s linear sweep, `app/globals.css:612-632`) coexist with 37 `animate-pulse` (Tailwind's 2s opacity pulse). Both appear on loading screens; some pages show both. Cosmetic, but it is the clearest possible symptom of "no system": two teams' instincts, never reconciled.

---

## 3. The inconsistencies — the actual census

### 3.1 Every duration value in use

**Layer A — raw CSS in `app/globals.css`** (16 distinct non-zero durations, plus the reduced-motion floor):

| Value | Count | Where (representative) | Role |
|---|---|---|---|
| `0.01ms` | 2 | `:526,528` | reduced-motion floor |
| `120ms` | 1 rule (2 props) | `:586` `.op-panel-enter` | panel entry |
| `140ms` | 2 | `:1046`, `:3042` `.ln-hovertip-in` | hover preview, tab pill |
| `150ms` / `0.15s` | 8 | `:577` `.op-fade-in`, `:959`, `:1608`, `:1644`, `:1799`, `:1894`, `:4151`, `:4180` | micro-interaction |
| `160ms` / `0.16s` | 1 rule (4 props) | `:826` | button hover |
| `180ms` / `0.18s` | 8 | `:546-549` `.op-drawer-enter`, `:562`, `:847`, `:970`, `:3159`, `:3659`, `:4104`, `:4244` | drawer entry, hover |
| `200ms` / `0.2s` | 4 | `:985`, `:1301`, `:1507`, `:3782` | chevron, chip |
| `280ms` / `0.28s` | 1 | `:1210` | landing hero card |
| `400ms` / `0.4s` | 1 | `:1284` `lp-hbadge-in` | landing badge |
| `450ms` / `0.45s` | 1 | `:1397` `lp-hstate-in` | landing state |
| `500ms` / `0.5s` | 6 | `:1210,1248,1283,1339,1396,3169` | landing morph, icon spin |
| `600ms` / `0.6s` | 1 | `:3058` `.ln-doc-in` | credential reveal |
| `700ms` / `0.7s` | 1 | `:1194` | landing hero reveal |
| `800ms` / `0.8s` | 1 | `:892` `.lp-reveal` | landing scroll reveal |
| `1.5s` | 2 | `:620,631` | skeleton sweep (loop) |
| `1.6s` | 1 | `:1216` | lost-pet pulse (loop) |
| `1.8s` | 1 | `:2431` | map pin pulse (loop) |

Plus **6 hardcoded `transition-delay` values** — `0.08 / 0.16 / 0.24 / 0.32 / 0.4 / 0.48s` (`:899-920`) — which are one 80ms cadence written out six times. The comment at `:911-914` even *says* it is one cadence. `calc(var(--d) * 80ms)` collapses all six into one rule.

**Layer B — Tailwind utilities** (adds 3 distinct values):

| Value | Count | Source |
|---|---|---|
| `150ms` (implicit default) | **~433** — `transition-colors` 342, `transition-opacity` 42, bare `transition` ~23, `transition-transform` 17, `transition-all` 5, `transition-shadow` 4 | Tailwind default |
| `150ms` (explicit `duration-150`) | 7 — `components/ui/Toggle.tsx:101,111`, `components/ui/Tabs.tsx:141`, `components/ui/Sheet.tsx:471`, `app/(public)/denuncias/nueva/WelfareReportForm.tsx:391`, `app/(public)/leyes/page.tsx:49`, `components/panorama/TimeScrubber.tsx:726` | redundant with the default |
| `300ms` (`duration-300`) | 1 — `components/ui/WizardShell.tsx:119` | 🟡 the only `duration-300` in the repo |
| `1000ms` | 12 — `animate-spin` | Tailwind |
| `2000ms` | 37 — `animate-pulse` | Tailwind |

**Layer C — JS-driven** (adds 7 distinct values):

| Value | File:line | Role |
|---|---|---|
| `150ms` | `components/panorama/situational-map-config.ts:721` `DIM_TRANSITION_MS` | map layer dim |
| `200ms` + `260ms` | `components/pet-profile/FlipCard.tsx:143,155` | flip phases |
| `205ms` + `280ms` | `components/pet-profile/FlipCard.tsx:164,162` | phase timers (must track the above by hand) |
| `250ms` | `components/ui/Field.tsx:345` | keyboard-avoidance delay |
| `290ms` + `300ms` | `components/landing/LandingHero.tsx:190,195` | hero flip phases |
| `300ms` | `components/panorama/situational-map-config.ts:574` `DIVISION_FADE_MS` | division fade |
| `600ms` | `lib/hooks/useCountUp.ts:26` | KPI delta tween |
| `900ms` | `components/landing/CountUp.tsx:19` | landing counter |
| `1100ms` | `components/panorama/TimeScrubber.tsx:64` | play cadence (data, not motion) |

**Layer D — external libraries** (unmeasured, unaligned): Vaul (`components/ui/VaulSheet.tsx`, `OpMobileDrawer.tsx`), sonner (`components/Toaster.tsx`), recharts (`components/charts/*`). Three more curves and durations nobody in this repo chose.

> ### Headline count
> **18 distinct feedback durations** (≤ 800ms, excluding infinite loops and the play cadence): `120, 140, 150, 160, 180, 200, 205, 250, 260, 280, 290, 300, 400, 450, 500, 600, 700, 800`.
> **26 distinct duration values overall** across CSS + Tailwind + JS, before counting the three external libraries.
> **Zero** `--duration-*` custom properties exist. Confirmed: `rg -- '--duration|--motion|--ease'` over `**/*.{ts,tsx,css}` returns nothing but prose in `docs/`.

### 3.2 Every easing value in use — 8 distinct

| Curve | Where | Count |
|---|---|---|
| `cubic-bezier(0.4, 0, 0.2, 1)` | Tailwind's implicit default on ~433 utilities; explicit once at `app/globals.css:1210` | **dominant by ~433:1** |
| `ease` (CSS default, unspecified) | `:826,847,959,970,985,1046,1248,1283,1301,1339,1396,1507,1608,1644,1799,1894` | 16 rules |
| `ease` (explicit keyword) | `:1284,1397,3159,3169,3659,3782,4104,4151,4180,4244` | 10 rules |
| `ease-out` | `:546-549,562,577,586,2431` | 8 declarations |
| `ease-in-out` | `:1216` | 1 |
| `linear` | `:620,631`; `components/panorama/TimeScrubber.tsx:726` (`ease-linear`); `animate-spin` | 4 |
| `cubic-bezier(0.2, 0.7, 0.2, 1)` | `:892,1194,3042,3058` | 4 |
| `easeOutCubic` (JS, `1 - (1-t)**3`) | `lib/hooks/useCountUp.ts:44`, `components/landing/CountUp.tsx:92` | 2 |
| *(plus `ease-in` / `ease-out` as JS strings)* | `components/pet-profile/FlipCard.tsx:143,155` | 2 |

**A design system with eight easings has none.** Worse: the *most-used* curve — `cubic-bezier(0.4, 0, 0.2, 1)`, riding ~433 Tailwind utilities — is the one nobody chose and nobody wrote down. Every hand-authored rule in `globals.css` that says `ease` or `ease-out` is **silently disagreeing with the rest of the app.**

### 3.3 The recommended set

Smallest defensible scale. Each role is won by the value **that already has the most instances**, so adoption is mostly deletion.

**Durations — 4 tokens + 1 ambient:**

| Token | Value | Wins because | Replaces |
|---|---|---|---|
| `--motion-fast` | **150ms** | ~440 existing instances (Tailwind's default + 8 CSS rules + `DIM_TRANSITION_MS`). It is already the house standard; naming it costs nothing. | 120, 140, 150, 160 |
| `--motion-base` | **180ms** | `.op-drawer-enter` (`:546-549`) + 7 more rules, **and** it is the value the v2C handoff specifies for the dock (`README.md:157`). Code and design already agree here. | 180, 200, 205, 250, 260 |
| `--motion-slow` | **300ms** | `DIVISION_FADE_MS` (`situational-map-config.ts:574`) has a *test* pinning it to 150–600ms (`situational-map-config.test.ts:16-17`) — the only duration in the repo with a guard. Also the sole `duration-300`. | 280, 290, 300, 400, 450 |
| `--motion-deliberate` | **600ms** | `useCountUp`'s default (`useCountUp.ts:26`) and `.ln-doc-in` (`:3058`). Reserved for value tweens and document reveals — things the user is meant to *watch*. | 500, 600, 700, 800 |
| `--motion-ambient` | **1500ms** | `skeleton-sweep` (`:620,631`). Loops only. | 1.5s, 1.6s, 1.8s, and `animate-pulse`'s 2s if the pulse idiom is retired |

**Easings — 2 tokens + 1 rule:**

| Token | Value | Wins because |
|---|---|---|
| `--ease-standard` | **`cubic-bezier(0.4, 0, 0.2, 1)`** | ~433 instances. It is what the app already does; every `ease` / `ease-out` / `ease-in-out` keyword in `globals.css` should become this. |
| `--ease-editorial` | **`cubic-bezier(0.2, 0.7, 0.2, 1)`** | 4 instances, all deliberate and all documented (`:892` landing reveal, `:1194` hero, `:3042` hovertip, `:3058` document). Scope it to `.lp` + the credential reveal; it should never appear in an operator console. |
| *(rule, not a token)* | `linear` | Infinite loops only — spinner, shimmer. A looping animation with an ease has a visible stutter at the seam. |

**Delays:** delete the six hardcoded `transition-delay` rules (`:899-920`) in favour of `transition-delay: calc(var(--d, 0) * 80ms)` driven off the existing `data-d` attribute. −20 lines, and the cadence becomes a number instead of a convention. *(The CSS-properties audit called this "immaterial" as a line-count saving — it is right about the bytes and wrong about the point: the value is that `data-d="7"` starts working without an edit.)*

**Ratchet impact of all of the above: zero new arbitrary Tailwind values.** Tokens go in the `:root` block of `app/globals.css` alongside `--radius-*` and `--z-*`, which is the shape the fence already expects (`docs/reviews/2026-08-04-css-properties-audit.md:202` — `globals.css` is inside the CSS baseline as of 2026-07-31, so *adding* declarations is fenced; adding `:root` custom properties is exactly the sanctioned move, and consolidating 30+ literals into 7 tokens should *reduce* the violation count).

---

## 4. `prefers-reduced-motion` correctness

The global CSS rule (`app/globals.css:522-530`) is correct and covers every CSS transition and animation. The comment at `:533-538` correctly states that it **cannot reach imperative JS**. So the audit reduces to: *is every JS-driven animation independently guarded?*

The in-repo reference pattern is `components/ui/Field.tsx:340-342`:

```ts
const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ? "auto"
  : "smooth";
```

### 4.1 Guarded — ✅ (19 sites)

| Site | File:line |
|---|---|
| `useReducedMotion` hook (the runtime twin of the CSS rule) | `lib/hooks/useReducedMotion.ts:12-33` |
| Field mobile keyboard scroll | `components/ui/Field.tsx:340-342` |
| `useCountUp` KPI tween | `lib/hooks/useCountUp.ts:27,35` |
| Landing `CountUp` | `components/landing/CountUp.tsx:50-52,68,80` |
| `RevealManager` (never adds `.lp-motion` under reduce) | `components/landing/RevealManager.tsx:23` |
| `StorySection` chapter scroll | `components/landing/StorySection.tsx:71-81` |
| `MilestoneNav` scroll | `components/landing/MilestoneNav.tsx:57-72` |
| `LandingHero` auto-cycle | `components/landing/LandingHero.tsx:155` |
| `LandingHero` flip | `components/landing/LandingHero.tsx:184` |
| `FlipCard` turn | `components/pet-profile/FlipCard.tsx:76-82,134` |
| Map division fade | `components/panorama/use-choropleth-motion.ts:24-38` |
| Map layer dim | `components/panorama/situational-map-config.ts:727-731` |
| Map division opacity | `components/panorama/situational-map-config.ts:909-913` |
| Jurisdiction autozoom | `components/panorama/SituationalMap.tsx:1063,1077,1083` |
| Preset frame | `components/panorama/SituationalMap.tsx:1109,1116` |
| Province drill | `components/panorama/SituationalMap.tsx:2074` |
| easeTo × 3 | `components/panorama/SituationalMap.tsx:2497,2545,2636` |
| Keyboard pan | `components/panorama/SituationalMap.tsx:2968-2971` |
| Recharts × 3 charts | `TimeSeriesChart.tsx:200,218`, `ForecastChart.tsx:203-241`, `StackedTimeSeriesChart.tsx:160` |

That is genuinely strong coverage — better than most codebases. Which makes the two misses more surprising, not less.

### 4.2 Unguarded — real defects

#### 🔴 D-1 — `ScrollToSignal` (operator, surveillance)
```ts
// app/gob/vigilancia/_components/ScrollToSignal.tsx:22
el.scrollIntoView({ behavior: "smooth", block: "center" });
```
Fires on mount for any `?signalId=` deep-link. Already reported at `docs/reviews/2026-08-04-css-properties-audit.md:227` and proposed as its Task 4. Restating it here only to keep the reduced-motion picture complete.

#### 🔴 D-2 — `CredentialActionBar` (public, lost-pet page) — **NEW, not previously reported**
```ts
// app/(public)/p/[publicToken]/CredentialActionBar.tsx:70-76
function revealSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
```
**This is the worst of the three**, and the reason is context, not code. It is the sticky action bar on the **public lost-pet credential** — the surface a stranger who just found a scared animal on the street opens on a phone, one-handed, under stress. The bar is mobile-only (`:83`, `sm:hidden`). A vestibular-sensitive user who has asked their OS to reduce motion gets a full-page smooth scroll they did not opt into, at the exact moment the product most needs them to keep going. It is also the `dispute` path — the neutral tip form for a *custody-disputed* pet.

The fix is the same three lines from `Field.tsx:340-342`. There is a test file adjacent (`app/(public)/p/[publicToken]/CredentialActionBar.test.tsx:85,100,114`) that already asserts *whether* `scrollIntoView` is called — adding a `behavior` assertion under a mocked `matchMedia` is a two-line test, and `components/landing/MilestoneNav.test.tsx:42,132` shows the exact mocking idiom already in use in this repo.

#### 🟠 D-3 — `PetDetailTabsPanel` hash deep-link scroll
```ts
// components/pet-profile/PetDetailTabsPanel.tsx:188-193
requestAnimationFrame(() => {
  document.querySelector("[data-section='flip-card']")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});
```
Owner-authenticated surface, fires once on mount when the URL hash names a face. Lower blast radius than D-2 (the user is a logged-in owner on their own pet, not a stressed stranger) but identically unguarded, and it sits **in the same component tree as `FlipCard`, which guards correctly** (`FlipCard.tsx:76-82`). Two files, one directory apart, opposite answers.

### 4.3 Guarded-by-accident / worth naming

- 🟢 `components/ui/WizardShell.tsx:54-55` — `scrollTo({ top: 0 })` with **no** `behavior`, so it defaults to `"auto"` (instant). Correct by omission. Worth a comment so a future "polish" PR does not add `behavior: "smooth"` and turn a correct line into D-4.
- 🟡 **Vaul, sonner and recharts** are three third-party animation sources. Recharts is guarded by us (`isAnimationActive`). **UNVERIFIED:** whether Vaul's drawer slide and sonner's toast entry honor `prefers-reduced-motion` internally. Vaul animates via CSS transforms, so the global rule at `:522-530` *probably* catches it (it applies to `*`), but sonner ships its own stylesheet and may set `animation-duration` at a specificity the `!important` global still beats — likely fine, unconfirmed. Verify by emulating `reduce` in DevTools and opening one sheet + firing one toast.

### 4.4 Why this is a defect and not a nit

WCAG 2.3.3 *Animation from Interactions* (AAA) is the letter; **2.2.2 *Pause, Stop, Hide* and the vestibular-disorder guidance behind them are the substance.** The product is held to Ley 26.653 / Disp. ONTI 6/2019 (`AGENTS.md`). A user who has set the OS-level reduce-motion flag has made an **accessibility declaration**, and D-2 overrides it on the single most emotionally-loaded public page in the product. The repo already knows this — it wrote the guard 19 times and documented the CSS/JS boundary at `app/globals.css:533-538`. These three are the places that forgot.

---

## 5. Where motion would be WRONG — do not animate these

Adversarial section. Each of these is a place where a well-meaning polish pass would make the product worse.

### 5.1 Operator queue rows leaving or entering a list
`components/BulkApprovalQueueList.tsx:227`, `components/AdoptionQueueList.tsx:259,316`, `components/admin/AlertInboxTable.tsx:156`, `components/ui/dashboard/CaseQueue.tsx`

An exit animation on a queue row means the operator waits for the row to finish leaving before the next row is under the cursor. Someone processing 200 approvals pays that 200 times. The correct feedback for "your click registered" is already there and is faster: the button's `animate-spin` + the toast. **Do not animate row exit or the reflow of the rows below it.**

### 5.2 Anything in an emergency flow
`app/(app)/mis-mascotas/[publicToken]/perdida/MarkLostWizard.tsx`, `app/(public)/denuncias/nueva/**` (bite/welfare report wizard), `app/(public)/p/[publicToken]/CredentialActionBar.tsx`, `app/org/[orgToken]/mordedura/nuevo/OrgBiteForm.tsx`

Marking a pet lost, filing a maltrato complaint, reporting a bite. The user is distressed, often on a phone, often one-handed. Every millisecond of decoration is a millisecond of "is this thing working?" These flows should feel **instant and mechanical**. Note the tension with §4 D-2: the fix there is to *remove* motion, not to make it nicer. The correct amount of animation on a lost-pet action bar is **zero**, and the reduced-motion guard should arguably be a plain `behavior: "auto"` for everyone.

### 5.3 Data tables where a value changes
`components/panorama/MapDataTable.tsx:278`, `components/panorama/PanoramaDataTable.tsx:403`, `components/admin/EventLedgerTable.tsx:46`

A cell that fades or slides while its number changes makes the number **less readable during the change** — the exact interval the operator is looking at it. This is also why the CSS-properties audit's `table-layout: fixed` recommendation (its Task 6) matters more than any transition here: the real jitter is *column widths recomputing*, and the fix is to stop the layout from moving, not to animate the movement. **Fix the jump by removing it, not by easing it.**

*(This does not contradict Gap 5. A KPI card is a single large figure the user is deliberately watching; a table cell is one of two hundred. Tween the tile, never the cell.)*

### 5.4 Anything the user is waiting on
`components/ui/ConfirmDialog.tsx:256` (`"Procesando…"`), `components/ui/Sheet.tsx:324-331` (`"Registrando…"`), every `isPending` branch (630 occurrences / 251 files)

An **exit** animation on a confirmation dialog delays the result the user is waiting for. Entry: yes (Gap 3). Exit: no — close it on the frame the action resolves. Same for success screens (`components/ui/SuccessScreen.tsx`), the pet-created aha (`app/(app)/mis-mascotas/nueva/[publicToken]/credencial/PetCreatedAha.tsx`) and any "copied!" affordance — those already use an instant swap with a `setTimeout` revert, which is right.

### 5.5 The append-only event spine
Anything that renders an event from the ledger — `app/admin/libro/**`, the pet timeline, `components/gob/*`.

Events are legal records (project invariant #2). Animating their arrival makes a record look like a *notification*. A row in the libro should appear the way a line appears in a ledger: it is simply there. **No entrance animation on event rows, ever.**

### 5.6 Maps during a time scrub
`components/panorama/TimeScrubber.tsx:64` (`PLAY_INTERVAL_MS = 1100`) + `DIVISION_FADE_MS = 300`

Already correctly balanced: 300ms fade inside an 1100ms step leaves 800ms of stable frame to read. **Do not raise `DIVISION_FADE_MS` toward `--motion-deliberate`**; the test at `situational-map-config.test.ts:16-17` pins it to 150–600ms for exactly this reason and that test is doing real work.

### 5.7 Route bodies (as opposed to streamed sections)
See the caveat on Gap 2. Fading a whole page body adds latency to first legible text. Fade **streamed Suspense boundaries** only.

---

## 6. Modern platform features — adopt / not yet / no

Judged against files, not novelty.

### `@starting-style` + `transition-behavior: allow-discrete` — **ADOPT (already proven here)**

In production at `app/globals.css:544-572` (`.op-drawer-enter`), `:576-584` (`.op-fade-in`), `:585-595` (`.op-panel-enter`). It is the only thing that makes entry/exit animation work for an element that goes from *not rendered* to *rendered*, or from `display: none` to shown — which is precisely the shape of every gap in §2.

Where entry/exit animation **currently cannot work** and this fixes it:
1. `components/ui/ConfirmDialog.tsx:190-206` — native `<dialog>`, identical shape to the drawer that already works. Copy `.op-drawer-enter`, swap `translateX` for a small `scale`/`translateY`. (Gap 3)
2. `components/panorama/PanoramaDock.tsx:265-273` — the tabpanel's `hidden` attribute is a *discrete* property; without `allow-discrete` it will snap at the end of any height transition added. (Gap 1)
3. `components/panorama/OverlayDisclosure.tsx:136-143` — `.op-panel-enter` applies verbatim. (Gap 6)
4. The 162 `loading.tsx` routes without `.op-fade-in`. (Gap 2)

**Ratchet: clean** — all four reuse existing named classes in `globals.css`. Cost: ~0 new bytes for three of them.

### `interpolate-size: allow-keywords` / `calc-size()` — **NO**

The existing task note is right and **the reason generalises well beyond the dock.** `docs/reviews/2026-08-04-css-properties-audit.md:181,279` says do not paper over `PanoramaDock.tsx:150-158`'s `height: auto` branch with `interpolate-size`. Two reasons, and the second is the important one:

1. It is unnecessary there. Once both endpoints are lengths — give the collapsed state an explicit height instead of `undefined` — the transition works with plain `transition: height`. Reaching for a new global keyword to avoid writing one number is the wrong trade.
2. **`interpolate-size` is a `:root`-level opt-in that changes how `auto`, `min-content` and `fit-content` interpolate for the entire document.** Turning it on to fix one dock silently changes the animation semantics of all nine disclosure panels in §1.3, plus anything future. That is a global behavior change bought for a local problem — the same category of mistake as a global `!important`.

**For Gap 4 (the nine disclosures), the honest answer is: use `grid-template-rows: 0fr → 1fr` on a wrapper.** It animates auto-height with no new platform opt-in, no JS measurement, and works today everywhere Tailwind v4 already requires. One named class in `globals.css` (`.op-disclosure-body`), applied nine times. **Ratchet: clean** (named class, no arbitrary values). Cost: ~6 lines of CSS.

### `transition-behavior: allow-discrete` (standalone) — **ADOPT**

Already covered above; it is what makes `hidden`, `display` and `overlay` participate. The dock (`PanoramaDock.tsx:269`) is the concrete case.

### View Transitions API — **NOT YET**

Gap 2 is real, and this is the obvious-looking fix. It is not the right one *for this codebase, right now*:

- **Next 15 App Router support is behind `experimental.viewTransition`** and the RSC navigation model fights it: a cross-document/soft navigation transition has to hold the outgoing frame while the incoming RSC payload streams. With 165 `loading.tsx` boundaries the framework is *already committed* to showing a skeleton — a view transition would animate **into the skeleton**, not into the content, which is the wrong half of the problem.
- The repo has **zero** view-transition usage today (verified) and no `next.config` experimental flag. Adopting it means owning a framework-experimental surface across 165 routes.
- **The 90% fix is `.op-fade-in` on streamed boundaries** — 9 lines that already exist, already ship, already work, and already honor reduced motion via the global rule.

**Revisit when:** (a) `viewTransition` leaves experimental in a Next version this repo is on, and (b) there is a *specific* shared-element case worth it. There is one plausible candidate: pet card in `/mis-mascotas` → the credential on `/mis-mascotas/[publicToken]` (`components/PetCard.tsx` → `components/pet-profile/FlipCard.tsx`). That is a genuine shared-element continuity story, not a generic page fade. Prototype it on that one pair before touching anything else. **Ratchet: N/A** (config + `view-transition-name` in `globals.css`).

### Scroll-driven animations (`animation-timeline: view()` / `scroll()`) — **NOT YET, but the case is specific**

The one place it genuinely fits is `components/landing/RevealManager.tsx` — 72 lines of `IntersectionObserver` + fail-open timeout + manual `.in` class, all to do what `animation-timeline: view()` does declaratively. **But the fail-open contract is the reason to leave it alone:** `RevealManager.tsx:7-12` documents that the landing must render *visible* if JS fails, if motion is reduced, or if the observer never fires — and it implements all three. A pure-CSS scroll-driven version inverts that (the CSS hides, and there is no JS left to un-hide). Rewriting it means re-deriving the fail-open guarantee from scratch on the highest-traffic public page. **The existing code is more defensive than the platform feature.** Do not trade it away for elegance.

No other surface in the repo has a scroll-linked effect. Nothing else to adopt it for.

### `popover` attribute + `<dialog>` — **PARTIAL ADOPT: `<dialog>` yes (mostly done), `popover` not yet**

- `<dialog>` is **already the house pattern** and is fenced: `__tests__/ra9-a11y-barriers.test.tsx:69-70` asserts that no `.tsx` renders a `<dialog>` with a literal `open` attribute, forcing `showModal()`. `ConfirmDialog.tsx:148`, `BulkRevokeList.tsx:177`, `DetailDrawer.tsx:890` all comply. Nothing to adopt — just extend the *animation* to it (Gap 3).
- **`popover` would genuinely simplify** `components/panorama/OverlayDisclosure.tsx`: 47 lines of manual Escape handling, outside-pointerdown dismissal and focus restore (`:100-118`) is exactly what the popover top layer gives for free, plus it fixes stacking against the map overlay. **But** the component's own comment (`:6-13`) explains that `<details>` was chosen so the panel content stays in the DOM while closed, "always reachable/testable" — and there are tests relying on that. Migrating means changing a tested contract for ergonomics. **Not yet:** worth doing when `OverlayDisclosure` is next opened for a real reason, not as a standalone refactor.
- The Vaul dependency (`components/ui/VaulSheet.tsx`, `OpMobileDrawer.tsx`) is a bigger prize — a library carrying its own animation curves for something `<dialog>` + `@starting-style` now does natively. **Not yet:** Vaul's drag-to-dismiss physics is real functionality the platform does not replace.

### `@property` for typed custom properties — **NO**

Nothing in the repo animates a custom property. Adding `@property` to enable it would be inventing the need.

---

## Appendix — perceived performance, stated honestly

`components/panorama/PanoramaConsole.tsx` is ~4 950 lines with ~51 `useState` in a single hydration unit (independently confirmed in `docs/reviews/2026-08-04-css-properties-audit.md:163`).

**Motion masks latency; it does not remove it.** A 180ms dock transition makes the toggle *feel* deliberate instead of glitchy — it does not make the pane render faster, and it does not reduce a single byte of hydration cost. Nothing in §6 changes JS parse time, bundle size, or React re-render breadth. If anything, adding transitions to a surface that is already janky under hydration can make the jank *more* legible, because a dropped frame in a moving element is more visible than a dropped frame in a static one.

Any motion work on the panorama console should be sequenced **after** (or at least not sold as a substitute for) the component split. The dock transition is worth doing on its own merits — re-orientation cost is real and measurable in user terms — but it must not be logged as a performance improvement.

---

## Severity summary

| # | Finding | Severity | Systemic? |
|---|---|---|---|
| D-2 | `CredentialActionBar.tsx:75` unguarded smooth scroll on the public lost-pet page | 🔴 | one-off (new) |
| D-1 | `ScrollToSignal.tsx:22` unguarded smooth scroll | 🔴 | one-off (already reported) |
| Gap 1 | Panorama dock has no transition | 🔴 | one-off |
| Gap 2 | 165 `loading.tsx` skeleton→content hard cuts; `.op-fade-in` used 19× on 3 files | 🔴 | **systemic (165 instances)** |
| §3 | 18 distinct feedback durations, 8 easings, 0 tokens | 🟠 | **systemic (~30 CSS literals + ~440 Tailwind utilities)** |
| Gap 3 | `ConfirmDialog` has no entry animation | 🟠 | ~20 call sites |
| Gap 4 | Chevron animates, disclosure panel teleports | 🟠 | **systemic (9 surfaces)** |
| D-3 | `PetDetailTabsPanel.tsx:190` unguarded smooth scroll | 🟠 | one-off |
| Gap 5 | `KpiChips` snaps while `OpKpi` tweens | 🟠 | 2 components, 1 contradiction |
| Gap 6 | `OverlayDisclosure` panels have no entry | 🟡 | one-off (fix is one class) |
| §3.1 | Six hardcoded stagger delays that are one 80ms cadence | 🟡 | one-off (`globals.css:899-920`) |
| Gap 7 | `skeleton-shimmer` and `animate-pulse` coexist as two skeleton idioms | 🟢 | **systemic (37 + ~15 instances)** |
| §4.3 | Vaul / sonner reduced-motion behavior unverified | 🟢 | UNVERIFIED — emulate `reduce` in DevTools |
