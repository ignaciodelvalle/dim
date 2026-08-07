# Native-mobile-feel audit — citizen/owner PWA

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD** | `13b709a3` |
| **Commands** | `git -C C:/dev/dim branch --show-current` · `git -C C:/dev/dim rev-parse --short HEAD` |

**Scope:** `app/(app)/**` + `app/(public)/**` (excludes `/gob`, `/admin`, `/org` operator consoles).

---

## Already native-grade (credit where due)

| Area | Evidence |
|---|---|
| **PWA installability (Fase A)** | `app/manifest.ts:19` — `display: "standalone"`, icons, `start_url: /inicio` |
| **Apple web-app meta** | `app/layout.tsx:84-88` — `appleWebApp.capable`, `statusBarStyle`, `title` |
| **Instant sheet open (no router lag)** | `lib/ui/sheet-nav.ts:43-46` — `pushSheetUrl()` via History API; `components/pet-profile/SheetTriggerLink.tsx:39-42` — `prefetch={false}` + intercept |
| **Bottom sheets w/ drag handle** | `components/ui/VaulSheet.tsx:82-91` — `h-[85dvh]`, mobile drag pill, Vaul drawer |
| **Flip animation + reduced motion** | `components/pet-profile/FlipCard.tsx:105-109` — 500ms ease; `:77-98` — `prefers-reduced-motion` branch |
| **44px form controls + iOS zoom guard** | `components/ui/Field.tsx:166-175` — `min-h-[44px]`, `text-base sm:text-[13.5px]`; `app/globals.css:429-434` — mobile `font-size: 16px` on inputs |
| **Touch targets on hot path (pet profile)** | `components/pet-profile/PetActionRow.tsx:46-50` — `min-h-11 min-w-11`; guarded by `__tests__/a11y-touch-targets.test.tsx:76-80` |
| **Segment skeletons** | e.g. `app/(app)/inicio/loading.tsx:14-19`, `app/(public)/p/[publicToken]/loading.tsx:12-18` |
| **Inner scroll reset on route change** | `components/layout/ScrollReset.tsx:19-22` + `AppShell.tsx:103` — `[data-scroll-reset]` |
| **Global reduced-motion** | `app/globals.css:376-383` |
| **One correct safe-area pattern (reference)** | `app/(public)/adoptar/[petToken]/ApplyButton.tsx:105` — `pb-[max(0.75rem,env(safe-area-inset-bottom))]` |
| **Touch-down feedback (isolated)** | `components/EventCatcher.tsx:360` — `active:scale-[0.97]` on `/inicio` pet pills |

---

## Findings by affordance

### 1. Navigation pattern

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P0** | Primary nav | `components/layout/nav-presets.ts:37-45` | 3-item `OWNER_NAV`: Inicio / Mis mascotas / Denuncias — ideal tab-bar cardinality | **No bottom tab bar.** Mobile uses hamburger + left drawer (`AppCitizenMasthead.tsx:97-103`, `319-409`) | Add `CitizenTabBar` fixed bottom on `<md`, wired to `OWNER_NAV`. Hide hamburger for primary destinations; keep bell + avatar in top bar |
| **P1** | Desktop-first nav chrome | `AppCitizenMasthead.tsx:128-153` | Inline horizontal nav `hidden md:flex` | On phone, primary nav is buried behind “Abrir menú” — 2 taps vs native 1 tap | Bottom tabs replace drawer for the 3 owner destinations |
| **P2** | Public browse nav | `nav-presets.ts:14-19` | 4-item `PUBLIC_NAV` in same top chrome | Anonymous visitors also get web masthead, not tab pattern | Optional 4th tab or “Más” overflow for `/adoptar`, `/perdidas`, etc. |
| **P2** | Context switcher | `AppCitizenMasthead.tsx:247` — `hidden md:block` | Desktop-only popover | Mobile: switcher only in drawer foot (`385-405`) | Acceptable; or add to “Cuenta” sheet |

**Grep:** `rg 'OWNER_NAV|hamburger|Drawer.Root' components/layout/AppCitizenMasthead.tsx`

**Bottom tab fit:** Yes — 3 items map 1:1 to native iOS/Android primary tabs.

---

### 2. Safe-area insets

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P0** | Viewport meta | `app/layout.tsx:94-102` | `width`, `initialScale`, `themeColor` | **`viewportFit: "cover"` absent** — grep `viewport-fit` → 0 matches repo-wide | Add `viewportFit: "cover"` to `export const viewport` |
| **P0** | Global safe-area | `rg 'env\(safe-area-inset'` → **1 hit** (`ApplyButton.tsx:105`) | Single adoptar sticky CTA handles home indicator | **Citizen masthead, footers, Vaul sheets, sticky CTAs** ignore notch + home indicator in standalone PWA | Add utility in `globals.css`: `.pb-safe { padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }` + `.pt-safe` for top; apply to `AppCitizenMasthead`, `LnSheetFooter`, `VaulSheet` content |
| **P1** | Citizen shell | `AppShell.tsx:92-108` | `min-h-screen flex-col`; `<main>` scrolls | No `env(safe-area-inset-*)` on header/footer | `padding-top: env(safe-area-inset-top)` on masthead; bottom tab bar gets `padding-bottom: env(safe-area-inset-bottom)` |
| **P1** | Landing credential | `AppShell.tsx:151-174` | Same `min-h-screen` pattern for `/p/[token]` | QR scan surfaces can clip under iOS status bar | Same safe-area padding on landing header + main bottom padding |

**Grep:** `rg 'env\(safe-area-inset|viewport-fit|viewportFit' C:/dev/dim`

---

### 3. Touch feedback

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P0** | Press states | `rg -c 'hover:' app/(app) app/(public) components/layout components/pet-profile components/ui/Button.tsx` → **418**; `rg 'active:(scale\|opacity\|bg-)'` → **1 hit** (`EventCatcher.tsx:360`) | Almost all feedback is **`hover:`** only | **`active:` press states** on buttons, links, list rows, icon circles | Add to `LnButton` (`Button.tsx:33-37`): `active:scale-[0.98] active:opacity-90`; mirror in `IconCircleButton.tsx:31-42` and `Sheet.tsx` CTAs |
| **P1** | Tap highlight | `rg 'tap-highlight'` → **0 matches** | Browser default gray flash (webby) | Controlled `-webkit-tap-highlight-color` | In `globals.css` body/html: `-webkit-tap-highlight-color: transparent` + rely on `active:` states |
| **P2** | Sheet close | `VaulSheet.tsx:98` | `hover:bg-ln-stripe` on × | No `active:` on close | Add `active:bg-ln-line` |

**Ratio command:** `rg -c 'hover:' …` vs `rg 'active:(scale|opacity|bg-)' …`

---

### 4. Scroll & overscroll

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P1** | Scroll container | `AppShell.tsx:103` | Citizen: `<main id="main-content" className="flex-1 overflow-auto">` — **inner scroll** (good) | Document can still rubber-band; operator gets `fixed inset-0 overflow-hidden` (`124`) but citizen does not | `overscroll-behavior: none` on `html, body, [data-scroll-reset]` |
| **P1** | Overscroll bounce | `rg 'overscroll'` → **0 matches** | No pull/contain rules | Whole-page iOS bounce on standalone PWA | `overscroll-behavior-y: contain` on main scroll container |
| **P2** | Momentum scroll | `app/globals.css:1271` | `-webkit-overflow-scrolling: touch` on landing page rail only | Not applied to citizen `<main>` | Add to `[data-scroll-reset]` in globals |
| **P2** | Viewport height | `AppShell.tsx:92` | `min-h-screen` (100vh, not dynamic) | Mobile browser chrome jumps; `100dvh` more stable | Consider `min-h-dvh` on citizen shell when adding bottom tab bar |

**Contrast:** Operator shell is viewport-locked (`AppShell.tsx:124`); citizen is document-style scroll.

---

### 5. Transitions / physics

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P2** | Face flip | `FlipCard.tsx:105-109` | 500ms `ease-in-out` 3D flip + height sync | Good native-adjacent motion | Keep; optionally tune to `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-like) |
| **P1** | Sheet transitions | `VaulSheet.tsx:57-64` | Vaul default slide (library) | No custom spring/easing tokens | Tune Vaul `snapPoints` / CSS transition if API exposed |
| **P1** | Page transitions | `rg 'view-transition|startViewTransition'` → **0** | Route changes are **instant cut** (skeleton → content) | View Transitions API or shared-element fade | Low priority; skeletons already help |
| **P2** | Tab/filter nav | `UrlTabs.tsx:17-31` | **Full `window.location.assign`** — intentional router-drop fix | Feels like mini reload vs native tab swipe | Accept tradeoff; optional CSS fade overlay during assign |
| **✅** | Reduced motion | `globals.css:376-383`, `FlipCard.tsx:77-98` | Respected globally + flip-specific | — | — |

**Sheet instant open (native win):** `sheet-nav.ts` shallow History API — no fetch, no spinner.

---

### 6. PWA standalone chrome

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P1** | theme-color mismatch | `app/layout.tsx:101` → `#ffffff`; `app/manifest.ts:22` → `#0e5a99` | Both set, **different values** | iOS/Android status bar may flash white over navy masthead | Align to `#0e5a99` (masthead) or use `themeColor: [{ media: '(prefers-color-scheme: light)', color: '...' }]` |
| **P1** | Standalone detection | `rg 'display-mode|beforeinstallprompt|matchMedia.*standalone'` in app code → **0** (manifest only) | No runtime standalone branch | Install hints, extra safe-area, hide “Iniciar sesión” chrome noise | `useStandalone()` hook: `matchMedia('(display-mode: standalone)').matches \|\| navigator.standalone` |
| **P2** | Install prompt | `docs/design/handoffs/2026-07-04-pwa-gap-analysis.md:18` (doc); code → **0** | Manifest enables install; no in-app nudge | No `beforeinstallprompt` capture | Deferred per gap analysis Fase A scope — add post-deploy if PO wants |
| **P2** | iOS status bar | `app/layout.tsx:86` — `statusBarStyle: "default"` | Light status bar style | Navy header may want `black-translucent` + safe-area top padding | Test on device; pair with `viewportFit: cover` |

---

### 7. Hover-dependent UI

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P2** | Desktop popover | `AppCitizenMasthead.tsx:273-289` | “Portales” menu on click (not pure hover) | `hidden md:block` — **not shown on mobile** | OK on touch |
| **P2** | `title=` tooltips | `PetActionRow.tsx:48-49` — `title="Anotar"` | Icon-only bar uses `aria-label` (accessible) | `title` tooltips never show on touch (harmless) | Optional: remove `title` to avoid desktop-only redundancy |
| **P1** | Button visual feedback | `Button.tsx:45-54` | Variants use **`hover:` only** | Touch users get no pressed visual until finger lifts | Add `active:` variants (see §3) |
| **P2** | Recharts tooltips | `components/charts/*` | Chart hover tooltips | N/A in owner PWA hot paths | — |

**No critical hover-only affordances** found on mobile primary flows; main gap is missing **pressed** state, not hidden hover menus.

---

### 8. Forms / keyboard

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **✅** | iOS zoom prevention | `globals.css:429-434`, `Field.tsx:166-172` | 16px mobile inputs + `text-base` class | — | Extend to any raw `<input>` outside `LnInput` |
| **✅** | inputMode (partial) | `WeightForm.tsx:59-60`, `DniVerifyForm.tsx:49`, `SignupForm.tsx:124` | Numeric/decimal/tel on key forms | — | — |
| **P1** | inputMode coverage gaps | `LoginForm.tsx:53-76` | Email + password via `LnInput` | Password lacks `enterKeyHint="go"`; no `type="tel"`/`inputMode` audit on welfare/denuncia phone fields | Grep `LnInput` without `inputMode` in citizen forms; add `enterKeyHint` on wizard final steps |
| **P1** | Keyboard covering inputs | `rg 'scrollIntoView|visualViewport' app/(app)` → **0** | Sticky footers exist (`Sheet.tsx:296`, `WizardShell.tsx:50-52` scrolls main) | No focus-scroll when keyboard opens | `onFocus` → `el.scrollIntoView({ block: 'center', behavior: 'smooth' })` in `LnInput` wrapper, or `visualViewport` resize listener on mobile |
| **P1** | Sticky footer safe-area | `Sheet.tsx:296` — `sticky bottom-0 … py-[13px]` | Sticky CTA on long forms | **No `env(safe-area-inset-bottom)`** — CTA can sit under home indicator | Copy `ApplyButton.tsx:105` pattern |
| **P2** | Denuncia wizard CTAs | `DenunciaWizard.tsx:372-379` | Full-width “Continuar” inline, not sticky | Long step 3/4: CTA scrolls off-screen | Sticky bottom bar with safe-area on steps ≥3 |

**Tests:** `components/ui/event-forms-mobile.test.tsx` pins Field + LnSheetFooter contracts.

---

### 9. Touch targets

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **✅** | Pet profile actions | `PetActionRow.tsx` + test | `min-h-11 min-w-11` | — | — |
| **✅** | Wizard back | `WizardShell.tsx:63` | `h-11 w-11` | — | — |
| **P1** | Masthead hamburger | `AppCitizenMasthead.tsx:324` | `h-10 w-10` (**40px**) | Below 44px minimum | `min-h-11 min-w-11` |
| **P1** | Notification bell | `AppCitizenMasthead.tsx:173-188` | 18×18 icon, no min touch box | Tap area ~18px | Wrap in `min-h-11 min-w-11 inline-flex items-center justify-center` |
| **P1** | Login CTA (anon) | `AppCitizenMasthead.tsx:220` | `min-h-[36px]` | 36px height | `min-h-11` |
| **P2** | Vaul close button | `VaulSheet.tsx:98` | `h-8 w-8` (32px) | Below 44px | `h-11 w-11` |
| **P2** | Drawer nav rows | `AppCitizenMasthead.tsx:372` | `min-h-10` (40px) | Slightly under spec | Bump to `min-h-11` |

**Test gap:** `__tests__/a11y-touch-targets.test.tsx` covers `PetActionRow` + `WizardShell`, **not** `AppCitizenMasthead`.

---

### 10. Loading / perceived perf

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **✅** | Route skeletons | 5× `loading.tsx` in `(app)`, 5× in `(public)` | Layout-stable shimmer skeletons | — | Add skeletons for `/denuncias/nueva`, `/cuenta/*` wizards |
| **✅** | Sheet open perf | `SheetTriggerLink.tsx:35-36` | History API — **instant**, no RSC fetch | — | — |
| **P1** | Cross-route nav | Default Next `<Link>` prefetch | Owner nav links prefetch destinations | Possible bandwidth waste; mitigated on timeline (`EventTimeline.tsx:137` `prefetch={false}`) | Prefetch top 3 tab routes only when bottom bar lands |
| **P2** | Optimistic UI | `ReminderActions.tsx`, `PhysicalTagInterestSheet.tsx:52-53` | Spotty | Most submits wait for server round-trip | Expand to reminder dismiss, sheet toggles |
| **P2** | Full-page tab nav | `UrlTabs.tsx:28-29` | Hard navigation | Brief white flash possible | Optional top progress bar (NProgress-style) |

---

### 11. Gestures (opportunities, not defects)

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P2** | Swipe dismiss sheets | `VaulSheet.tsx:90-91` | Drag handle rendered | Vaul `direction="right"` (`63`) but mobile styled as bottom sheet — swipe-down behavior may be inconsistent | Set `direction="bottom"` on `<md`; verify Vaul dismiss threshold |
| **P2** | Swipe-back | — | Browser back gesture works for routes | Sheets use History API — **back gesture should close sheet** (partially implemented `sheet-nav.ts:63-64`) | QA on iOS standalone; document expected behavior |
| **P2** | Pull-to-refresh | — | None | Native apps often PTR on lists (`/inicio`, `/mis-mascotas`) | Optional `overscroll-behavior` + custom PTR — high effort, low ROI until offline (Fase B) |
| **P2** | Long-press | `EventCatcher.tsx:355-357` | Long-press on `/inicio` pet pills | Not elsewhere | — |

---

## Prioritized master table (cross-cutting)

| Priority | Area | File:line | What exists | What's missing | Concrete fix |
|---|---|---|---|---|---|
| **P0** | Safe-area + viewport | `layout.tsx:94-102` | Basic viewport | No `viewportFit: cover`; safe-area only in `ApplyButton.tsx:105` | Add viewportFit + global safe-area utilities on masthead, main, sticky footers, bottom tabs |
| **P0** | Primary navigation | `nav-presets.ts:37-45`, `AppCitizenMasthead.tsx:97-103` | 3-item owner nav in top hamburger drawer | No bottom tab bar | Implement fixed bottom `OWNER_NAV` tab bar on mobile |
| **P0** | Touch feedback | `Button.tsx:33-54`, hover count **418** | Hover-only transitions | No `active:` press states (except `EventCatcher.tsx:360`) | Global `active:scale-[0.98]` / opacity on interactive tokens |
| **P1** | Overscroll | `AppShell.tsx:103` | Inner scroll container | No `overscroll-behavior` anywhere | `overscroll-behavior-y: contain` on scroll roots |
| **P1** | theme-color | `layout.tsx:101` vs `manifest.ts:22` | Both present | Mismatched colors | Unify to `#0e5a99` |
| **P1** | Masthead touch targets | `AppCitizenMasthead.tsx:324,173,220` | Sub-44px controls | Hamburger 40px, bell ~18px, login 36px | Bump to `min-h-11 min-w-11` |
| **P1** | Sticky form footers | `Sheet.tsx:296`, `VaulSheet.tsx:82-108` | Sticky / fixed bottom UI | No safe-area padding | `pb-[max(0.75rem,env(safe-area-inset-bottom))]` |
| **P1** | Standalone mode | — | Manifest standalone | No JS detection / chrome adaptation | `useStandalone()` for conditional install banner + padding |
| **P2** | View transitions | — | FlipCard + Vaul only | No route/view transitions | Optional `@view-transition` or fade wrapper |
| **P2** | Install UX | `manifest.ts` | Installable | No `beforeinstallprompt` UI | Post-Fase A enhancement |
| **P2** | Gestures | `VaulSheet.tsx:90` | Drag handle | Inconsistent swipe-dismiss; no PTR | Tune Vaul direction; defer PTR |

---

## TOP 5 highest-impact changes

| # | Change | Impact | Cost |
|---|---|---|---|
| **1** | **`viewportFit: "cover"` + safe-area padding** on masthead, main, sticky footers, future tab bar (`layout.tsx:94-102`, pattern from `ApplyButton.tsx:105`) | Fixes content under notch/home indicator in installed PWA — **native-breaking today** | **Cheap — CSS + 1-line viewport export** |
| **2** | **Bottom tab bar** for `OWNER_NAV` (`nav-presets.ts:37-45`) replacing mobile hamburger for primary nav | Biggest “website vs app” signal; 3 items fit perfectly | **Structural — new component + AppShell layout change** |
| **3** | **Global touch-down (`active:`) states** on `LnButton`, `IconCircleButton`, list rows, nav tabs; disable garish tap highlight | Instant tactile feedback on every tap | **Cheap — CSS/Tailwind in design tokens** |
| **4** | **`overscroll-behavior-y: contain`** on `html`, `body`, `[data-scroll-reset]` (`AppShell.tsx:103`) | Stops whole-app rubber-band; feels more “locked” like native | **Cheap — CSS only** |
| **5** | **Unify theme-color + standalone hook** (`layout.tsx:101` ↔ `manifest.ts:22`) + optional safe-area when `display-mode: standalone` | Status bar matches navy chrome; room for install/safe-area tweaks | **Cheap — metadata + small client hook** |

---

## Implementation notes for the implementer

1. **Do not regress** `sheet-nav.ts` History API pattern — it is intentionally more native-feeling than router navigation.
2. **Extend** the lone safe-area exemplar (`ApplyButton.tsx:105`) rather than inventing a second pattern.
3. **Extend** `__tests__/a11y-touch-targets.test.tsx` to cover `AppCitizenMasthead` once touch targets are fixed.
4. **Bottom tab bar** should coexist with existing `AppShell` citizen variant: masthead shrinks to brand + bell + avatar; tabs own primary navigation on `<md` only.
5. PWA **Fase B (offline credential)** is out of scope here but would further improve native feel once service worker lands (`docs/design/handoffs/2026-07-04-pwa-gap-analysis.md`).
