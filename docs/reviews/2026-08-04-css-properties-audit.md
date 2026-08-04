# CSS property audit — DIM / MiMAR against the "100 CSS properties" list

**Date:** 2026-08-04
**Scope:** read-only audit of `app/**`, `components/**` and the five project stylesheets, against the ~100-property list from the 2020 article *"100 days — 100 CSS properties in a tweet"*.
**Verdict up front:** 92 of the ~100 properties produced **zero actionable work**. Six tasks are proposed, and the two most valuable of them come from properties that are *not on the list at all*. The single highest-value finding is a print defect on the lost-pet poster (`print-color-adjust`, §4 task 1).

---

## Method and limits

### What I verified (with citations)

- Every "IN USE" claim below is backed by a `file:line` that I read. Tailwind utilities count as usage of the underlying property; where a property arrives via a utility rather than raw CSS, the row says so.
- Stylesheets in scope: `app/globals.css` (4 434 lines / 128 479 bytes), `app/(app)/mis-mascotas/[publicToken]/cartel/cartel-print.css`, `.../libreta/libreta-print.css`, `.../chapita/chapita-print.css`, `app/gob/maltrato/[id]/expediente-print.css`. Plus the inline `<style>` in `app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx:84` and the server-generated stylesheet in `app/api/mis-mascotas/[publicToken]/libreta-export/route.ts:309`.
- Deliberately **excluded**: `node_modules/`, `.next/`, `.ds-sync/`, `ds-bundle/`, `docs/design_handoff_landing/**` (design handoff artifacts, not shipped code), and `.claude/worktrees/`.
- `app/globals.css` is imported from the root layout (`app/layout.tsx:13`), so it is render-blocking for **every** route, including the operator consoles.

### What I could NOT verify

- **No runtime measurement.** I ran no build, no Lighthouse, no Playwright trace, no `performance` profiling. Every performance claim below is a *mechanism* argument ("this property removes layout/paint work for off-screen subtrees"), not a measured delta. Any task whose justification is performance should be gated on a before/after measurement.
- **No visual verification.** I did not render the print surfaces to PDF. The poster finding (§4, task 1) is derived from the CSS cascade + the browser's default `print-color-adjust: economy` behaviour, and from reading the markup. It is a very high-confidence *prediction*, not an observed screenshot. **Print the cartel once before writing the fix** — it takes 60 seconds and turns a prediction into a fact.
- **Two sweeps were delegated, then spot-checked.** (a) The 236 `outline-none` occurrences were classified by a helper pass; I re-read and independently confirmed the three genuine offenders in §3, but I did not personally re-read all 236. (b) The long-list survey behind §4 task 3 was likewise delegated; I independently re-read and confirmed the top three candidates (`app/admin/observaciones/page.tsx:324,343` + `lib/metrics/observaciones-query.ts:29,111`; `app/gob/vigilancia/brotes/page.tsx:184`; `app/gob/perdidas/page.tsx:545` + `_components/LostPetRow.tsx:148`). The remaining candidates and the "already well-capped" exclusions are reported as delegated findings.
- **Row caps are ceilings, not observed values.** I know the query limits (25-500); I do not know how many rows these screens actually render in production.

### A note on the source article

The article is from 2020 and its browser-support commentary is obsolete. Against 2026 reality, **all** of the following are baseline and need no caveat, guard, or fallback in this codebase: `inset`, `gap` in flexbox, the independent `translate` / `rotate` / `scale` properties, `contain`, `content-visibility`, `text-wrap: balance|pretty`, `:has()`, container queries, `color-mix()`, and `@layer`. Where the article hedges on these, it is simply wrong now. Two things the article predates that are *actually* relevant here and are used in this repo already: `@starting-style` + `transition-behavior: allow-discrete` (`app/globals.css:544-567`) and container queries (`components/panorama/TimeScrubber.tsx:708`).

The genuinely still-patchy items in 2026 — and the reason two candidate recommendations below are downgraded — are `orphans`/`widows` (no Firefox support) and `writing-mode: sideways-lr` (uneven).

---

## 1. Categorization table

Legend: **IN USE** · **OPPORTUNITY** (concrete, named place) · **OUT OF SCOPE** · **ALREADY SOLVED** (need exists, met another way).

| # | Property | Verdict | Evidence / reasoning |
|---|---|---|---|
| 1 | `outline` | IN USE | `app/globals.css:514-517` — global `:focus-visible` ring. Also `app/globals.css:966,1309,1536` etc. See §3 for three unprotected overrides. |
| 2 | `font-size-adjust` | ALREADY SOLVED | `next/font/google` (`app/layout.tsx:2-8,21-74`) generates metric-matched fallback faces automatically (`adjustFontFallback` defaults on). Hand-authoring `font-size-adjust` would duplicate that. |
| 3 | `transform` | IN USE | `app/globals.css:552,829,1306,2062,2413,3425,4183` (33 declarations). |
| 4 | `display` | IN USE | `app/globals.css:753,1992,2003` and thousands of Tailwind `flex`/`grid`/`hidden` utilities. |
| 5 | `clip-path` | OUT OF SCOPE | Zero occurrences (raw or `[clip-path:…]`). The one edge-fade need is already met by `mask-image` (`app/globals.css:1419`). No shape the design system asks for requires it. |
| 6 | `box-sizing` | IN USE | Via Tailwind preflight (`@import "tailwindcss"` at `app/globals.css:1`; preflight sets `box-sizing: border-box` on `*`). |
| 7 | `position` | IN USE | `app/globals.css:876,941,2054,3423`. |
| 8 | `all` | OUT OF SCOPE | Zero occurrences. The reset-shorthand use case barely exists here — exactly one `border: 0` reset in `app/globals.css:4377`; buttons come from `components/ui/dashboard/OpButton.tsx`, not from ad-hoc resets. |
| 9 | `border-image` | OUT OF SCOPE | Zero occurrences. No ornamental frame in the design language; borders are 1px token lines. |
| 10 | `font` (shorthand) | IN USE | `app/globals.css:1277` (`font: 700 10px / 1 var(--font-ln-mono)`), `1797`, `1890` (`font: inherit`). |
| 11 | `animation-play-state` | OUT OF SCOPE | Zero occurrences. The three infinite animations (`app/globals.css:1216,2431` + skeleton sweep `620,631`) are already neutralised for reduced-motion at `app/globals.css:522-530`; pausing off-screen would need an IntersectionObserver, i.e. JS, not this property. |
| 12 | `inset` | IN USE | `app/globals.css:1320,1512,1709,1719,2398,2428`; `app/gob/maltrato/[id]/expediente-print.css:35`; Tailwind `inset-0` widely (`components/AdoptionListingCard.tsx:72`). Article's support caveat is obsolete. |
| 13 | `caption-side` | OUT OF SCOPE | Every `<caption>` in the app is `sr-only` (`components/panorama/MapDataTable.tsx:280`) — it has no visual side to place. |
| 14 | `background-attachment` | OUT OF SCOPE | Zero occurrences; no `bg-fixed` utility anywhere. There is no parallax/fixed-backdrop surface in the design system. |
| 15 | `animation-delay` | OPPORTUNITY (low) | Not used. Its sibling `transition-delay` **is**, as six hardcoded stagger rules (`app/globals.css:899-920`). A single `calc(var(--d) * 80ms)` rule deletes ~20 lines. Cosmetic; see §4 "considered and rejected". |
| 16 | `text-combine-upright` | OUT OF SCOPE | CJK-only (tate-chū-yoko). es-AR product. |
| 17 | `padding-block-end` | OUT OF SCOPE | Logical properties buy nothing in an LTR-only, es-AR-only product with no RTL roadmap. Zero occurrences of the whole logical family. |
| 18 | `font-kerning` | ALREADY SOLVED | Browser default `auto` already kerns the IBM Plex / Encode Sans faces. Zero occurrences, correctly. |
| 19 | `columns` | OUT OF SCOPE | Zero occurrences. Only plausible surface is the landing footer list (`app/globals.css:2965`); multi-column there would harm tab-order predictability for no gain. |
| 20 | `justify-content` | IN USE | `app/globals.css:867,1124,2007` + Tailwind `justify-*` everywhere. |
| 21 | `right` | IN USE | `app/globals.css:942`. |
| 22 | `text-shadow` | IN USE | `app/globals.css:1744` (hero scrim legibility). |
| 23 | `list-style-image` | OUT OF SCOPE | Zero occurrences. Icons are lucide SVG components (`components/Icon.tsx`), not list bullets. |
| 24 | `white-space` | IN USE | `app/globals.css:1099,1280,1412,1466`; Tailwind `whitespace-nowrap` (`components/panorama/PanoramaDock.tsx:224`) and `whitespace-pre-wrap` (`app/(app)/denuncias/[id]/page.tsx:258`). |
| 25 | `scroll-behavior` | ALREADY SOLVED (partly) | Smooth scrolling is done in JS, not CSS: `components/ui/Field.tsx:337-346` correctly gates on `prefers-reduced-motion`. **But** `app/gob/vigilancia/_components/ScrollToSignal.tsx:22` hardcodes `behavior: "smooth"` with no such gate — see §3 and §4 task 4. |
| 26 | `max-height` | IN USE | `components/panorama/PanoramaDock.tsx:157` (inline `maxHeight`); `components/panorama/MapDataTable.tsx:277` (`max-h-80`). |
| 27 | `block-size` | OUT OF SCOPE | See #17 — logical family unused, deliberately. |
| 28 | `text-indent` | OUT OF SCOPE | Zero occurrences. Good: the `text-indent: -9999px` hiding idiom is absent (see §3). Screen-reader hiding uses `sr-only`. |
| 29 | `justify-items` | IN USE | `app/globals.css:3238`. |
| 30 | `scale` (independent) | OUT OF SCOPE | Zero occurrences; `transform: scale()` used instead (`app/globals.css:1533,2435`). The pain point the independent property solves — a state variant having to re-declare a positioning transform — **does not exist here**: I checked the centring-transform rules (`app/globals.css:2062`, `2073`, `2413`, `3425`) and none has a `:hover`/`:focus` override that would have to re-declare the translate. Verified by absence. |
| 31 | `animation-direction` | OUT OF SCOPE | Zero occurrences; no ping-pong animation in the system. |
| 32 | `mix-blend-mode` | OUT OF SCOPE | Zero occurrences. The one scrim-over-photo case (`app/globals.css:1717` `.lp-bond-scrim`) is a gradient overlay that reads correctly and is contrast-audited; a blend mode would make the text contrast data-dependent, which fights the WCAG posture. |
| 33 | `text-orientation` | OUT OF SCOPE | Only meaningful with vertical writing modes for CJK glyph orientation. The one vertical label in the app (`components/panorama/BivariateMatrix.tsx:37`) is Latin text and uses the correct `vertical-rl` + `rotate(180deg)` idiom. `writing-mode: sideways-lr` would delete the rotate hack but support is still uneven in 2026 — not worth it. |
| 34 | `letter-spacing` | IN USE | `app/globals.css:745,776,784,791`; Tailwind `tracking-*` (`components/ui/SuccessScreen.tsx:125`). |
| 35 | `content` | IN USE | `app/globals.css:763,2025`. |
| 36 | `hyphens` | OPPORTUNITY (low) | Zero occurrences. `<html lang="es-AR">` (`app/layout.tsx:142`) means `hyphens: auto` would actually work for Spanish. Candidate surface: long Spanish nouns in narrow cells at 390px (unit names in `components/panorama/MapDataTable.tsx:311`, chip labels). Low measured value; see §4 "considered and rejected". |
| 37 | `object-fit` | IN USE | Tailwind `object-cover` (`components/AdoptionListingCard.tsx:72`); raw at `app/globals.css:1342,1713,3252`. |
| 38 | `caret-color` | OUT OF SCOPE | Zero occurrences. Default caret inherits `color` and is legible on every token background. No brand requirement. |
| 39 | `scroll-margin` | IN USE | `app/globals.css:1987` (`scroll-margin-top: 96px`); Tailwind `scroll-mt-24` (`app/(public)/p/[publicToken]/page.tsx:745`, `app/gob/vigilancia/_components/OutbreakSignalRow.tsx:60`). |
| 40 | `resize` | IN USE | Tailwind `resize-none` (`app/org/[orgToken]/servicios/nuevo/ServiceOfferingForm.tsx:108`, `app/(app)/cuenta/_components/DeactivateAccountDialog.tsx:102`). |
| 41 | `background-blend-mode` | OUT OF SCOPE | Zero occurrences. Same reasoning as #32. |
| 42 | `isolation` | IN USE | `app/globals.css:1700` (`isolation: isolate` on the landing bond block). |
| 43 | `text-decoration-thickness` | OUT OF SCOPE | Zero occurrences. Underline treatment is handled with `underline-offset-*` (`components/ui/WizardShell.tsx:100`) and `text-underline-offset` (`app/globals.css:1095`). WCAG imposes no thickness requirement; changing it is a taste call with no defect behind it. |
| 44 | `direction` | OUT OF SCOPE | LTR-only product. |
| 45 | `translate` (independent) | OUT OF SCOPE | See #30. No composition conflict exists to solve. |
| 46 | `background-position` | IN USE | `app/globals.css:605,608` (skeleton sweep keyframes). |
| 47 | `text-justify` | OUT OF SCOPE | No justified text anywhere; justified copy would hurt legibility on 390px. |
| 48 | `flex` | IN USE | `app/globals.css:1053,1673,1785,1907`; Tailwind `flex-1`/`flex-none` throughout (`components/panorama/PanoramaDock.tsx:169`). |
| 49 | `z-index` | IN USE | `app/globals.css:944,980,1710,1730` — and notably via **tokens** (`--z-stripe`, `--z-header`), which is the disciplined form. |
| 50 | `cursor` | IN USE | `app/globals.css:823`; Tailwind `cursor-pointer`/`cursor-not-allowed` (`components/panorama/TimeScrubber.tsx:693`). |
| 51 | `will-change` | IN USE (sparingly — correct) | `app/globals.css:3071`, one declaration. Adding more would be a regression, not an improvement. |
| 52 | `tab-size` | OUT OF SCOPE | The only `<pre>` (`app/admin/sistema/_components/sistema-sections.tsx:532`) renders error strings with `whitespace-pre-wrap break-all`, not tabbed source. |
| 53 | `margin-block` | OUT OF SCOPE | See #17. |
| 54 | `font-feature-settings` | ALREADY SOLVED | The need (lining/tabular figures for dashboards) is met by the higher-level `font-variant-numeric` — `app/globals.css:3975,4167,4358` and Tailwind `tabular-nums` in ~40 places (`components/ui/dashboard/OpKpi.tsx:745`). `font-feature-settings` is the lower-level escape hatch and is correctly unused. |
| 55 | `image-orientation` | ALREADY SOLVED | Browser default is `from-image`, so EXIF-rotated phone uploads already display upright. Declaring it would be a no-op. |
| 56 | `line-break` | OUT OF SCOPE | CJK line-breaking control. |
| 57 | `box-shadow` | IN USE | `app/globals.css:2056`; Tailwind `shadow-lg` (`components/panorama/PanoramaDock.tsx:128`). |
| 58 | `writing-mode` | IN USE | `components/panorama/BivariateMatrix.tsx:37` (`[writing-mode:vertical-rl]`, axis label on the bivariate legend). Note: arrives as an **arbitrary Tailwind value**, i.e. it sits under the ratchet. |
| 59 | `counter-increment` | OPPORTUNITY — **rejected** | Zero occurrences. The landing genuinely hand-numbers chapters in JS (`components/landing/StorySection.tsx:160,179,193`). CSS counters would delete that JS — **but** counter output lives in generated `content`, which is not selectable, not copyable, and inconsistently announced by screen readers. For a WCAG-conscious product (Ley 26.653) that is a downgrade. Deliberately not proposed. |
| 60 | `quotes` | OUT OF SCOPE | No `<q>`/`<blockquote>` styling surface. Spanish angular quotes, where needed, are literal characters in copy. |
| 61 | `image-rendering` | OUT OF SCOPE | The QR codes — the one asset where pixel snapping would matter — are **SVG** (`app/(app)/mis-mascotas/[publicToken]/chapita/chapita-print.css:62`, `components/pet-profile/CredentialFace.tsx:323`), so they rasterise correctly at any print DPI. |
| 62 | `justify-self` | OUT OF SCOPE | Zero occurrences; grid children are positioned with `place-items` on the container. |
| 63 | `place-content` | OUT OF SCOPE | Zero occurrences; the four `align-items:center` + `justify-content:center` adjacencies (`app/globals.css`) are already mostly expressed as `place-items`. Collapsing four rules is noise, not work. |
| 64 | `row-gap` | IN USE | `app/globals.css:1084`. |
| 65 | `backface-visibility` | ALREADY SOLVED (deliberately avoided) | `components/pet-profile/FlipCard.tsx:10` documents the decision to avoid `preserve-3d` / `backface-visibility` stacking, and `components/pet-profile/FlipCard.test.tsx:179` **asserts its absence**. This is a settled architectural choice — do not reopen it. |
| 66 | `opacity` | IN USE | `app/globals.css:553,558,890,896`. |
| 67 | `border-block-end` | OUT OF SCOPE | See #17. |
| 68 | `box-decoration-break` | OUT OF SCOPE | Chips/badges are `inline-flex` with `whitespace-nowrap` (`app/globals.css:1279-1280`), so they never fragment across lines. The property has nothing to fix. |
| 69 | `padding` | IN USE | `app/globals.css:811,854,858`. |
| 70 | `gap` | IN USE | `app/globals.css:760,807,1115,1129,1995` — including **flexbox** gap, whose 2020-era caveat is long obsolete. |
| 71 | `filter` | IN USE | `app/(app)/mis-mascotas/[publicToken]/cartel/cartel-print.css:24` (`grayscale(100%)` for the B&W poster); `components/pet-profile/CredentialFace.tsx:209` (memorial state). |
| 72 | `grid` (shorthand) | ALREADY SOLVED | The `grid` *shorthand* is unused; `display: grid` + explicit `grid-template-columns` is used instead (`app/globals.css:1112-1115,1992-1995`). That is the readable form — the shorthand is famously write-only. Correct as is. |
| 73 | `mask-image` | IN USE | `app/globals.css:1419` (right-edge fade on an overflowing row). |
| 74 | `object-position` | IN USE | `app/globals.css:1715,1757`. |
| 75 | `order` | IN USE | `app/globals.css:1123,2000,2045,4273`. One of these is an a11y finding — see §3. |
| 76 | `margin` | IN USE | `app/globals.css:500,780,800`. |
| 77 | `orphans` | OPPORTUNITY (low) | Zero occurrences. Genuinely applicable to the paged surfaces (`libreta-print.css`, `expediente-print.css`) — but **Firefox does not support it in 2026**, and the coarser `break-inside: avoid` is already applied at `expediente-print.css:56,60` and `libreta-print.css:8`. Bundled as a nice-to-have into §4 task 1, not a task of its own. |
| 78 | `place-self` | OUT OF SCOPE | Zero occurrences; no need. |
| 79 | `table-layout` | OPPORTUNITY | Zero occurrences. Concrete problem: `components/panorama/MapDataTable.tsx:278` and `components/panorama/PanoramaDataTable.tsx:403` render `<table class="w-full">` with `auto` layout, so **column widths are recomputed from content on every data change** — changing the period or the layer set makes the columns jump. `table-fixed` pins them. See §4 task 6. |
| 80 | `scrollbar-color` | IN USE | `app/globals.css:683` (the `op-scroll` thin-scrollbar affordance used by `components/panorama/PanoramaDock.tsx:176`). |
| 81 | `overflow` | IN USE | `app/globals.css:1212,1337,1375,1413,2053`; `overflow-hidden` on the dock (`components/panorama/PanoramaDock.tsx:128`). |
| 82 | `word-spacing` | OUT OF SCOPE | No defect; adjusting it in a gob.ar-derived type system would be an unmandated deviation. |
| 83 | `padding-inline-start` | OUT OF SCOPE | See #17. |
| 84 | `color` | IN USE | `app/globals.css:479,726,747` — always through `--color-ln-*` tokens, which is the fence `pnpm lint:tokens` enforces. |
| 85 | `widows` | OPPORTUNITY (low) | Same as #77. |
| 86 | `scroll-snap-stop` | OPPORTUNITY (low) | Zero occurrences, but scroll snap **is** used: `components/panorama/PanoramaDock.tsx:176` (`snap-x`) + `:224` (`snap-start`) on the horizontally-scrolling tablist. `scroll-snap-stop: always` would stop a fast swipe from skipping past tabs on mobile. Genuinely small; folded into §4 task 6. |
| 87 | `text-emphasis-style` | OUT OF SCOPE | East-Asian emphasis marks. |
| 88 | `visibility` | IN USE | `app/gob/maltrato/[id]/expediente-print.css:25,30` — and used *correctly*, for the print-one-region idiom, with the reasoning documented at lines 10-15. |
| 89 | `place-items` | IN USE | `app/globals.css:1012,1299,1619` + Tailwind `place-items-center` in ~15 components (`components/ui/Card.tsx:181`). |
| 90 | `inline-size` | OUT OF SCOPE | See #17. |
| 91 | `text-transform` | IN USE | `app/globals.css:746,1030,1279` (~30 declarations, the eyebrow/label tier). |
| 92 | `perspective` | IN USE | `app/globals.css:1186,3016`. |
| 93 | `shape-outside` | OUT OF SCOPE | No magazine-style text wrapping anywhere in the product. |
| 94 | `pointer-events` | IN USE | `app/globals.css:2079,3090`; Tailwind `pointer-events-none` in ~20 components. All audited uses are decorative overlays that correctly re-enable events on children (`components/panorama/SituationalMap.tsx:3120` + `:3128` `pointer-events-auto`). See §3. |
| 95 | `rotate` (independent) | OUT OF SCOPE | See #30. |
| 96 | `shape-image-threshold` | OUT OF SCOPE | Depends on `shape-outside`. |
| 97 | `touch-action` | IN USE | Tailwind `touch-none` (`components/panorama/TimeScrubber.tsx:693`) — stops a touch-drag on the scrubber from scrolling the page. Exactly the right use. |
| 98 | `perspective-origin` | OUT OF SCOPE | The two `perspective` users are centred; the default `50% 50%` is correct. |
| 99 | `font-optical-sizing` | OUT OF SCOPE | **Verified structurally**: all five faces are loaded as *static* weight sets via `next/font/google` (`app/layout.tsx:21-74` — Encode Sans, IBM Plex Serif/Sans/Mono, Caveat). Static fonts have no `opsz` axis, so the property has nothing to act on. |
| 100 | `print-color-adjust` (`color-adjust`) | **OPPORTUNITY — high** | Zero occurrences anywhere, and the product has four real print surfaces. See §4 task 1 — this is a verified defect on the lost-pet poster. |

**Counts (they sum to 100):** IN USE **44** · OUT OF SCOPE **41** · ALREADY SOLVED **7** · OPPORTUNITY **8** — of which 2 become real tasks (`print-color-adjust`, `table-layout`), 1 is explicitly rejected on a11y grounds (`counter-increment`), and 5 are low-value riders folded into other tasks (`orphans`, `widows`, `scroll-snap-stop`, `hyphens`, `animation-delay`).

---

## 2. Known context — verified, not assumed

### 2.1 `app/globals.css` is 128 KB and render-blocking. Is there a property that lets us *delete* CSS?

**Verified:** 128 479 bytes / 4 434 lines, imported at `app/layout.tsx:13`, so it blocks first paint on every route including `/gob/*` and `/admin/*`. 411 `.lp-*` references, 304 of which are top-level `.lp…` selector rules spanning roughly **lines 715–2990 — about half the file**.

**Honest answer: no.** I looked specifically for property-level deletions and the yield is trivial:

- `inset` shorthand: zero four-sided `top/right/bottom/left` blocks to collapse (`0` matches).
- `place-content` / `place-items`: only **4** `align-items:center` + `justify-content:center` adjacencies remain.
- `all: unset`: exactly one reset (`app/globals.css:4377`) to absorb.
- `transition-delay` → `calc(var(--d) * 80ms)`: ~20 lines (`app/globals.css:899-920`).

Total realistic property-level saving: **well under 100 lines out of 4 434**. That is noise.

**The real lever is not a CSS property, and this audit should say so plainly:** ~2 275 lines of landing-only `.lp-*` CSS ship to every operator console. Moving that block into a route-scoped stylesheet imported by `app/page.tsx` / `components/landing/*` (Next's App Router supports per-component CSS imports) would cut the render-blocking payload for the authenticated app roughly in half. That is a **code-splitting task, not a property task**, and it is out of scope for this document — but it is the finding that matters, and the property list is a distraction from it.

### 2.2 `PanoramaConsole.tsx` — 4 954 lines, 51 `useState`. Which properties reduce layout/paint?

**Verified:** 4 954 lines (`wc -l`), 51 `useState` occurrences.

**CSS cannot touch the expensive part, and nothing in this list changes that.** The cost of that file is JS parse + hydration + re-render breadth of a single client component holding 51 pieces of state. No property — not `contain`, not `content-visibility`, not `will-change` — reduces bundle size, hydration time, or React re-render count. Anyone who proposes a CSS fix for that file is solving the wrong problem; the fix is component splitting and state colocation.

What CSS *can* do here is bounded and modest:

- `contain: layout paint` on the independent chrome regions (rail, dock, metrics column) confines layout invalidation so a dock re-render cannot dirty the map's layout box. Mechanism-real, magnitude unmeasured.
- **Already solved, and worth noting:** the dock does not pay for its hidden panes at all — `components/panorama/PanoramaDock.tsx:272` renders `{open ? panes[tab] : null}`, so collapsed panes have zero DOM. A `content-visibility` recommendation there would be redundant. Someone should check that before "optimising" it.

### 2.3 `PanoramaDock` opens/closes with no transition

**Verified as an open finding:** `docs/reviews/2026-07-12-panorama-design-critique.md:60` (P1) and `:301` (ranked #1). The v2C handoff even specifies the value: `dock height .18s ease` (`docs/design/handoffs/2026-07-11-panorama-v2C/README.md:157`).

**Current behaviour:** `components/panorama/PanoramaDock.tsx:148-161` swaps an inline `height` between `min(42%, calc(100% - 26rem))` and `undefined` (i.e. content height). No transition anywhere.

**The correct property set — and why it works here without new machinery:**

1. `transition: height 180ms ease-out` on the dock `<section>`. It already has `overflow-hidden` (`:128`), which a height transition requires.
2. Give the **collapsed** state an explicit length instead of `undefined` — the bar is `h-10` + border, so a concrete `height` makes both endpoints resolvable lengths and the transition animates. (Do **not** reach for `interpolate-size: allow-keywords`; it is unnecessary once both ends are lengths, and its support is narrower than the rest of this list.)
3. `prefers-reduced-motion` needs **no new code**: `app/globals.css:522-530` already collapses every `transition-duration` to `0.01ms` globally, and `app/globals.css:533-538` documents that plain CSS transitions are covered by it precisely because they are not imperative JS. This is the deciding argument for doing it in CSS rather than with a JS animation.
4. If the panel's `hidden` attribute (`:269`) causes a pop at the end, the repo already has the pattern: `transition-behavior: allow-discrete` + `@starting-style`, in production at `app/globals.css:544-567` (`.op-drawer-enter`). Reuse it; don't invent one.

**Ratchet constraint (important):** the transition must live in `app/globals.css` as a class, not as a Tailwind arbitrary value. The component itself explains why at `components/panorama/PanoramaDock.tsx:133-135`: *"Height lives here (not a class) because the token ratchet bans new arbitrary values."*

### 2.4 Where else does `content-visibility: auto` genuinely apply?

**Verified:** the only containment usage in the entire repo is `app/globals.css:2010-2011` (`content-visibility: auto` + `contain-intrinsic-size: auto 640px` on `.lp .lp-ch-device`). There is **no virtualization library** anywhere.

A caveat that most write-ups of this property get wrong and that governs the answer here: **CSS containment does not reliably apply to internal table elements** (`<tr>`, `<tbody>`). So the instinctive target — long operator tables — is the *wrong* shape for it. `content-visibility` pays off on **block-level** repeated children (cards, `<li>`, sections).

**A correction to the brief I was given.** The premise was "long operator queues/tables are the obvious candidate". Half of that is right and half is wrong:

- **The tables are the wrong target**, per the containment caveat above. `components/ui/dashboard/CaseQueue.tsx:383` (`<tr>`, caps 50-200, used by five screens), `components/admin/AlertInboxTable.tsx:145` (`<tbody>`, cap 500), `components/admin/EventLedgerTable.tsx:46`, `components/panorama/PanoramaDataTable.tsx:403` and `components/panorama/MapDataTable.tsx:301` are all native `<table>` internals. Applying `content-visibility` there would be cargo cult.
- **No list in this codebase is actually unbounded.** I expected to find runaway queries; there are none in `app/gob/**`, `app/admin/**`, `app/org/**` or `components/panorama/**`. Every list traced to its source has an explicit cap (25 / 50 / 100 / 200 / 500), several with comments citing prior perf audits. So the honest framing is **"capped-large and block-level"**, not "unbounded" — 500 heavy `OpCard`s rendered inline is still real first-paint cost, but the ceiling is known and the upside is correspondingly bounded.

The block-level candidates that survive both filters are listed in §4 task 3.

### 2.5 The token fence and the arbitrary-value ratchet

**Verified:** `pnpm lint:tokens` → `scripts/check-design-tokens.ts`, part of `pnpm verify`. Rules 4-10 run against a ratchet baseline at `scripts/design-tokens-baseline.json`, whose `_meta.totalViolations` is exactly **1751** (generated 2026-07-05). Rules C1-C7 extend the same idea to `.css` files under `scripts/design-tokens-css-baseline.json` — so **`app/globals.css` is now inside the fence too**, which it was not before 2026-07-31.

**Every recommendation in §4 is annotated for this.** Summary: no proposed task adds a new arbitrary Tailwind value. Where a property needs a value the token scale doesn't carry, the task puts it in `app/globals.css` as a named class — the same escape hatch `PanoramaDock` already documents.

### 2.6 Print is NOT out of scope — it is where the worst defect is

**Verified print surfaces:** four route-scoped stylesheets (`cartel-print.css`, `libreta-print.css`, `chapita-print.css`, `expediente-print.css`), an `@page` rule injected at component-mount lifetime (`PosterPreview.tsx:82-84`), and a server-rendered export document (`app/api/mis-mascotas/[publicToken]/libreta-export/route.ts:309`). Physical-scale millimetre sizing for cut-out tags (`chapita-print.css:36-52`). This is a real paper product, not an afterthought.

So the print-related properties in the list — `print-color-adjust`, `orphans`, `widows`, `box-decoration-break` — must be judged on the merits. One of them is a defect. See §4 task 1.

---

## 3. Accessibility cross-check

The product is es-AR, WCAG 2.1 AA under Ley 26.653 / Disp. ONTI 6/2019 (`AGENTS.md:1060`).

| Risk | Status | Evidence |
|---|---|---|
| `outline: none` with no replacement | **3 real offenders** (see below) | Global pattern at `app/globals.css:511-518` is correct. Of 236 `outline-none` occurrences, ~209 pair it with a `focus:ring-*` / `focus:border+shadow` replacement in the same class string; ~21 sit on `tabIndex={-1}` programmatic-focus targets or focus-trapped dialog panels (not Tab-reachable — a convention, not a defect); 3 are genuine. |
| `visibility: hidden` on things that should stay reachable | **Clean** | The only use is `app/gob/maltrato/[id]/expediente-print.css:25,30`, inside `@media print`. Screen output is untouched. |
| `pointer-events: none` on things that should stay reachable | **Clean** | ~20 uses, all on decorative overlays/icons. The one group-level application (`components/panorama/SituationalMap.tsx:3120`) explicitly re-enables `pointer-events-auto` on each interactive child (`:3128`), and the intent is documented at `:3118-3119`. A regression test already guards one case (`__tests__/lost-public-credential-photo-overlay.test.tsx:97`). |
| `order` creating a visual/tab-order mismatch | **1 minor real case** | `app/globals.css:1122-1124`: below 900px, `.lp-hero-photo { order: -1 }` lifts the hero credential **above** the headline and CTAs, but its DOM position is after them (`components/landing/LandingHero.tsx:241`). The photo block contains a real `<button>` (the card-flip control, `LandingHero.tsx:120-125`), so on mobile the first *visible* control is the last-ish in tab order. Low severity (the flip button is a demo affordance, and the CTAs it displaces are the ones users want first) — but it is a genuine WCAG 2.4.3 "Focus Order" smell and should be recorded rather than denied. |
| | **Checked and clean** | `app/globals.css:1999-2000` (`.lp-ch-device { order: -1 }`) reorders static phone-mockup screens with no controls (`components/landing/StorySection.tsx:34-52`), and is reset below 940px (`:2045`). `app/globals.css:4273` (`.ln-qr { order: 3 }`) keeps the QR link last visually *and* last in DOM (`components/pet-profile/CredentialFace.tsx:281-330`) — no mismatch. |
| `text-indent: -9999px` hiding | **Clean** | Zero occurrences of the idiom. Visually-hidden text uses `sr-only`. |
| `cursor: none` | **Clean** | Zero occurrences. |
| *(added)* JS smooth-scroll ignoring `prefers-reduced-motion` | **1 real offender** | `app/gob/vigilancia/_components/ScrollToSignal.tsx:22` hardcodes `behavior: "smooth"`. The correct pattern already exists two files away: `components/ui/Field.tsx:340-342` reads `matchMedia("(prefers-reduced-motion: reduce)")` and downgrades to `"auto"`. The global CSS rule at `app/globals.css:522-530` cannot reach an imperative `scrollIntoView` call — that is exactly the gap the comment at `app/globals.css:533-538` warns about. |

**The three unprotected focus rings** (each independently re-read and confirmed):

1. `app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx:235` — an editable `<textarea>` with `focus:outline-none` and no ring, border-change or shadow. A keyboard user typing extra poster text gets **no** focus indicator. Worst of the three.
2. `app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager.tsx:213` — `readOnly` `<input>` holding a share URL, `focus:outline-none`, no replacement. `readOnly` is still Tab-focusable, and this input is the thing you focus in order to copy a link.
3. `app/(public)/refugios/[orgToken]/OrgHero.tsx:97` — a real navigable `<Link href="?sheet=verificacion-info" className="focus:outline-none">` around the "Verificado" badge. No replacement at all.

Note the mechanism, because it explains why these slipped past the global rule: Tailwind's `focus:outline-none` compiles to a `.class:focus` selector (specificity 0,2,0) which outranks the global `:focus-visible` ring (0,1,0). The global rule at `app/globals.css:514` is not a safety net against a component-level utility.

---

## 4. Proposed tasks

Ranked. Six tasks. Every one names files and a problem that exists today.

### Task 1 — `print-color-adjust: exact` on the lost-pet poster (and audit the other print surfaces)  ·  size **S**  ·  risk **low**  ·  **rank 1**

**What.** The A4 lost-pet poster prints its headline as **white text on a coloured block**:

```
components/… PosterPreview.tsx:142
<div className="bg-[var(--color-ln-seal)] text-white text-center py-3 rounded-[var(--radius-sm)]">
  <p className="text-4xl font-black tracking-widest uppercase">{lostPosterHeadline(sexRaw)}</p>
```

Browsers default to `print-color-adjust: economy` and **drop background colours when printing** (Chrome's "Background graphics" checkbox is off by default). The background disappears; `text-white` does not. The result is **"PERDIDO" printed white-on-white — the single most important word on the poster, invisible.** `cartel-print.css:8` forcing `background: white !important` on `html, body` does not save it; the banner is a descendant div with its own background.

The same mechanism affects the no-photo placeholder (`PosterPreview.tsx:157`, `bg-[var(--color-ln-stripe)]` + `ring-4`).

**Where.** `app/(app)/mis-mascotas/[publicToken]/cartel/cartel-print.css`, `app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx`. Then re-check `chapita-print.css`, `libreta-print.css`, `expediente-print.css` and `app/api/mis-mascotas/[publicToken]/libreta-export/route.ts` for the same pattern (the libreta export uses dark-on-white throughout and looks safe — `route.ts:215-303`).

**Why it matters here.** This is the *whole point* of the cartel: a person prints it and staples it to a pole. A poster whose headline vanishes is a product failure, and it fails silently — nobody sees it in the browser, only on paper.

**Fix.** Add `print-color-adjust: exact; -webkit-print-color-adjust: exact;` inside the `@media print` block for the poster root. Belt-and-braces (recommended, because `exact` is still user-overridable in some print dialogs): give the banner a print-only fallback of dark text on white with a heavy border, so the headline is legible **even if colour is stripped**. Optionally add `orphans: 2; widows: 2` to the paged prose surfaces while you are in there (Chrome/Safari only — Firefox ignores it; `break-inside: avoid` already covers the important cases at `expediente-print.css:56` and `libreta-print.css:8`).

**Ratchet.** No new arbitrary Tailwind values — the change belongs in the existing `*-print.css` files.

**Gate.** Print to PDF before and after. This is a 60-second verification and it converts the prediction into a fact.

### Task 2 — Animate the PanoramaDock open/close  ·  size **S**  ·  risk **low**  ·  **rank 2**

**What.** Give the dock the `height .18s ease` transition the v2C handoff already specifies.

**Where.** `components/panorama/PanoramaDock.tsx:148-161` (give the collapsed branch an explicit height rather than `undefined`) + a new `.op-dock` class in `app/globals.css`.

**Why here.** It is the #1 item on an existing open review (`docs/reviews/2026-07-12-panorama-design-critique.md:301`), the target value is already specified by the design handoff (`docs/design/handoffs/2026-07-11-panorama-v2C/README.md:157`), and the dock is the control an operator toggles most often. A panel that teleports between two sizes over a live map costs the operator re-orientation on every toggle.

**Why CSS and not JS.** `app/globals.css:522-530` already collapses every CSS `transition-duration` to `0.01ms` under `prefers-reduced-motion`. A CSS transition inherits that for free; a JS animation would need its own guard, and `app/globals.css:533-538` documents exactly that trap. If the `hidden` panel causes an end-of-transition pop, reuse the in-repo `@starting-style` + `allow-discrete` pattern at `app/globals.css:544-567`.

**Ratchet.** The transition goes in `app/globals.css` as a named class, per the existing note at `PanoramaDock.tsx:133-135`. **Do not** add `transition-[height]` or a duration arbitrary value in the className.

**Risk.** Watch the timeline pane: it uses `height: auto` + `maxHeight` (`:150-158`), so an `auto` endpoint will not animate. Either accept no transition on that one branch or transition `max-height` there. Do not paper over it with `interpolate-size`.

### Task 3 — `content-visibility: auto` on long **block-level** operator lists  ·  size **M**  ·  risk **medium**  ·  **rank 3**

**What.** Extend the `content-visibility: auto` + `contain-intrinsic-size` pattern (already proven at `app/globals.css:2010-2011`) to the repeated **block-level** rows of the largest-capped operator lists.

**Where** — five concrete surfaces, all `<li>`/card rows, all verified:

| Surface | Row element | Cap | Existing scroll box? |
|---|---|---|---|
| `app/admin/observaciones/page.tsx:343` (`<li><OpCard>`, mapped at `:324`) | `<li>` | **500** — `OBSERVACIONES_ROW_LIMIT`, `lib/metrics/observaciones-query.ts:29`, applied `:111` | **No** — bare `<ul class="space-y-2">` on a full-page scroll |
| `app/gob/vigilancia/brotes/page.tsx:184` → `app/gob/vigilancia/_components/OutbreakSignalRow.tsx:56` | `<li>` | **500** (`lib/analytics/dashboards/surveillance.ts:137`) | No |
| `app/gob/perdidas/page.tsx:545` → `app/gob/perdidas/_components/LostPetRow.tsx:148` | `<li>` | **500** (`lib/analytics/dashboards/perdidas.ts:168`) | No |
| `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx:308` (+ the board variant `OrgMascotasPipelineBoard.tsx:177`) | `<li>` | **200** — `CUSTODY_LIST_CAP`, `app/org/[orgToken]/mascotas/page.tsx:37` | List view no; board columns yes |
| `app/gob/cola/page.tsx` → `components/BulkApprovalQueueList.tsx:218` (also serves `/admin/cola`) | `<li>` | **200** — `COLA_PAGE_LIMIT`, `app/gob/cola/page.tsx:27` | No |

Implement as one shared class in `app/globals.css` (e.g. `.op-lazy-row { content-visibility: auto; contain-intrinsic-size: auto <estimate>px; }`), applied to the repeated child.

**Why here.** There is **no virtualization library in the repo at all** (verified against `package.json`), so up to 500 multi-element cards are laid out and painted on first render even though most are below the fold. The one place the pattern already exists (`app/globals.css:2010`) proves the team is comfortable with it.

**Critical constraint — read before implementing.** Containment does not reliably apply to `<tr>` / `<tbody>`. Applying `content-visibility` to table rows will appear to work in one browser and silently do nothing (or break row heights) elsewhere. **Only the block-level rows in the table above.** For the actual tables, use Task 6.

**Risks to test explicitly:** `contain-intrinsic-size` must be a reasonable estimate or the scrollbar length will jump as the user scrolls; in-page find (Ctrl+F) and anchor deep-links must still reach skipped content — `app/gob/vigilancia/_components/OutbreakSignalRow.tsx:60` carries `scroll-mt-24` and is the target of the `?signalId=` deep-link, so it is the exact case to regression-test.

**Gate.** This task is performance-motivated and I have **no measurement**. Measure first. Note the caps are ceilings, not typical values — if the real-world row count on these screens is 30, drop the task entirely rather than shipping containment for a hypothetical.

### Task 4 — Gate `ScrollToSignal`'s smooth scroll on `prefers-reduced-motion`  ·  size **S**  ·  risk **very low**  ·  **rank 4**

**What.** `app/gob/vigilancia/_components/ScrollToSignal.tsx:22` calls `scrollIntoView({ behavior: "smooth" })` unconditionally.

**Where.** That one file. Copy the pattern from `components/ui/Field.tsx:340-342` verbatim.

**Why here.** WCAG 2.3.3 / vestibular safety, in a product explicitly held to Ley 26.653 (`AGENTS.md:1060`). The global CSS reduced-motion rule cannot reach an imperative JS scroll — the repo already knows this and documents it at `app/globals.css:533-538`; this file is the one place that forgot. Five-line fix with a correct in-repo precedent.

### Task 5 — Restore the three missing focus indicators  ·  size **S**  ·  risk **very low**  ·  **rank 5**

**What.** Remove `focus:outline-none` (or pair it with the standard ring) at:
- `app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx:235` (editable textarea — highest priority)
- `app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager.tsx:213` (readOnly share-URL input)
- `app/(public)/refugios/[orgToken]/OrgHero.tsx:97` (navigable "Verificado" link)

**Why here.** WCAG 2.4.7 Focus Visible, AA. In every case the simplest correct fix is to **delete the utility** and let the global `:focus-visible` ring (`app/globals.css:514-517`) do its job — which also removes three lines rather than adding any.

**Ratchet.** Deletions only. No new values.

### Task 6 — `table-layout: fixed` on the panorama data tables (+ `scroll-snap-stop: always` on the dock tablist)  ·  size **S**  ·  risk **low**  ·  **rank 6**

**What.** Two small, unrelated-but-adjacent polish items.
- `components/panorama/MapDataTable.tsx:278` and `components/panorama/PanoramaDataTable.tsx` use `<table class="w-full">` with default `auto` layout inside a `max-h-80 overflow-auto` container (`MapDataTable.tsx:277`). Column widths therefore recompute from content on every filter/period/layer change, so columns visibly jump as an operator scrubs. `table-fixed` + explicit column widths pins them.
- `components/panorama/PanoramaDock.tsx:176,224` already uses `snap-x` / `snap-start` on the horizontally-scrolling tablist. Adding `scroll-snap-stop: always` stops a fast mobile swipe from flying past tabs.

**Why here.** Both are jitter in the operator console during exactly the interaction the console exists for (changing the period and watching the numbers move). Neither is a defect; both are cheap.

**Ratchet.** `table-fixed` and `snap-*` are named Tailwind utilities, not arbitrary values — clean. If explicit column widths are needed, use the spacing scale or a named class in `globals.css`, **not** `w-[137px]`.

### Considered and explicitly rejected

Being honest about the "no" list is the point of this audit.

- **`counter-increment` / `content` counters** to replace the landing's JS chapter numbering (`components/landing/StorySection.tsx:160,179,193`). Rejected: generated content is unselectable, uncopyable and inconsistently announced. That is a WCAG downgrade for an aesthetic saving.
- **`translate` / `rotate` / `scale` as independent properties.** Fashionable, and the article's support caveat is obsolete — but the problem they solve (a state variant clobbering a positioning transform) **does not occur in this codebase**; verified by absence across all four centring-transform rules. A migration would be churn with no defect behind it.
- **`hyphens: auto`.** Would work (`<html lang="es-AR">`), but no reported overflow defect motivates it, and Spanish auto-hyphenation in dense operator tables reduces scannability. Revisit if a 390px overflow bug is actually filed.
- **`animation-delay` / `transition-delay` consolidation** of the six landing stagger rules (`app/globals.css:899-920`). Deletes ~20 lines out of 4 434. Real but immaterial; bundle it into any future landing-CSS extraction, not into its own task.
- **`will-change`.** Exactly one declaration exists (`app/globals.css:3071`). Adding more would create permanent compositor layers and make things worse. Leave it alone.
- **`orphans` / `widows` as a standalone task.** No Firefox support in 2026 and `break-inside: avoid` already covers the important cases. Ride along with Task 1 or skip.
- **Anything proposed as a fix for `PanoramaConsole.tsx`'s size.** CSS cannot reduce hydration or re-render cost. See §2.2.

### Scorecard

- **92 of the ~100 properties produced zero actionable work.** Only eight appear anywhere in §3 or §4: `print-color-adjust`, `orphans`, `widows` (Task 1), `outline` (Task 5), `table-layout` and `scroll-snap-stop` (Task 6), `scroll-behavior` (Task 4), and `order` (a §3 finding recorded but not worth a task).
- **The two most valuable engineering tasks come from properties that are NOT on the 2020 list at all.** Task 2 (the dock transition) needs `transition` + `transition-behavior: allow-discrete` + `@starting-style`; Task 3 needs `content-visibility` + `contain-intrinsic-size`. Neither appears in the hundred. That is the most useful thing this audit says about the list itself.
- 6 tasks proposed, **4 of them size S**, and one (Task 1) is a probable user-visible defect on a printed artifact.
- 1 opportunity examined and **rejected on a11y grounds** (`counter-increment`).
- The largest CSS win available to this repo — halving a render-blocking 128 KB stylesheet by route-scoping ~2 275 lines of landing CSS — **is not a property change at all**, and no item on the 2020 list would have surfaced it.
