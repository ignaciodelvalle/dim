# Audit 1 — Visual Consistency (Level 1: visual grammar)

**Date**: 2026-07-21
**Scope**: read-only, no edits. Covers `app/(app)`, `app/(public)` (citizen/Ln*), `app/gob`, `app/admin`, `app/org` (operator/Op*), `components/ui`, `components/landing`, `components/panorama`.
**Method**: static grep/count survey across `.tsx`/`.ts`, cross-referenced against `app/globals.css` token definitions (lines 1–4023). CI fences already covering tokens/buttons/select/touch-targets/tablist/eyebrow are assumed correct and were not re-audited; this pass hunts for what those fences don't see.

Scoring: 1 (chaotic, no discernible system) – 10 (fully tokenized and enforced).

---

## 1. Shadows — score 7/10

`globals.css` defines a real 3-tier scale (lines 203–205):
```
--shadow-sm: 0 1px 2px 0 rgba(0,0,0,.06);
--shadow-md: 0 2px 6px 0 rgba(0,0,0,.09), 0 1px 2px 0 rgba(0,0,0,.06);
--shadow-lg: 0 4px 16px 0 rgba(0,0,0,.1), 0 2px 4px 0 rgba(0,0,0,.06);
```
Used consistently inside `globals.css` itself (10 call sites: lines 943, 955, 958, 1316, 1494, 1625, 3882, 3999, plus the two `shadow-[var(--shadow-*)]` Tailwind bridges).

**Gaps found** (not caught by `lint:tokens`, which checks color/spacing tokens, not shadow literals):
- Tailwind utility classes `shadow-sm` (15), `shadow-md` (13), `shadow-lg` (22), `shadow-xl` (8), `shadow-none` (2) are used directly — these resolve to **Tailwind's own default shadow scale**, not `--shadow-sm/md/lg`. Two parallel shadow systems coexist with no visual guarantee they match. 75 files touch some `shadow-` class.
- 14 fully bespoke `box-shadow` literals outside the token set, e.g.:
  - `shadow-[0_18px_50px_rgba(20,40,60,.22)]` / `,.14)]` (landing hero, 6 occurrences)
  - `shadow-[0_0_0_3px_rgba(176,119,26,.16)]`, `rgba(162,58,44,.16)`, `rgba(14,90,153,.12)` — three near-identical focus-ring shadows with different literal colors instead of referencing the existing `--color-ln-*` state colors already used elsewhere for the same purpose (compare line 3188–3200, which correctly use `var(--color-ln-err-050)` etc.)
  - `components/panorama` and `LandingHero`/`StorySection` account for most of the bespoke values (glow/depth effects for hero visuals — arguably legitimate one-offs, but undocumented as such).
- `text-shadow` appears once (line 1435) — an outlier, no token, no reuse.

**Fence-able**: yes, partially. A lint rule banning raw `shadow-[...]` (arbitrary bracket) outside an explicit allowlist (hero/landing decorative files) would catch the drift. Banning `shadow-sm|md|lg|xl` in favor of `shadow-[var(--shadow-*)]` would unify the two scales — but this requires either extending the Tailwind theme to alias `shadow.DEFAULT` etc. to the CSS vars, or a codemod.

---

## 2. Animation / transition — score 5/10

**Tailwind class layer** (well-behaved): `transition-colors` (335), `transition` (61), `transition-opacity` (41), `transition-transform` (10), `transition-all` (5), `transition-shadow` (4). Explicit `duration-*` overrides are rare (`duration-150` ×6, `duration-300` ×1) and `ease-*` overrides are almost never used (`ease-out` ×2, `ease-in` ×2) — meaning nearly everything rides Tailwind's default 150ms/ease. This layer is de facto consistent.

**Raw CSS layer in `globals.css`** (the gap): no `--duration-*` / `--ease-*` custom properties exist anywhere. 17 distinct hand-written duration literals are scattered through component-level rules: `0.08s, 0.14s, 0.15s(×12), 0.16s(×5), 0.18s(×8), 0.2s(×8), 0.24s, 0.28s, 0.32s, 0.4s, 0.45s, 0.5s(×9), 0.6s, 0.8s(×2), 1.5s, 1.6s, 1.8s`. Micro-interactions cluster loosely around 0.15–0.2s (fine) but there is no named scale to enforce that clustering — a future edit can drift to 0.17s or 0.22s with nobody noticing.
- Easing is inconsistent where specified at all: some transitions specify no easing (default `ease`), others `ease` explicitly, others `cubic-bezier(0.2,0.7,0.2,1)` (line 737) or `cubic-bezier(0.4,0,0.2,1)` (line 944) — two different named "material-ish" curves used once each, no shared token.

**`prefers-reduced-motion`**: handled centrally and correctly — one global catch-all at lines 457–465 collapses all `animation-duration`/`transition-duration` to `0.01ms`. This alone is sufficient. However 5 more **redundant** local `@media (prefers-reduced-motion: reduce)` blocks exist (lines 756, 1265, 2726, 2844, 3397) that re-implement the same guard for individual components — dead weight, not a correctness bug, but signals the global rule isn't trusted/known by whoever wrote those later.
- JS-driven animation (16 files use `useReducedMotion`/`matchMedia` in TS: `landing/*`, `charts/*`, `panorama/SituationalMap.tsx`, `pet-profile/FlipCard.tsx`, `pet-profile/DocumentChrome.tsx`, `pet-profile/LostCaseBlock.tsx`, `ui/Field.tsx`, `ui/Skeleton.tsx`) correctly self-check rather than relying on CSS alone — good coverage, no gaps found where JS drives layout-affecting animation.
- No animation library (`framer-motion`/`motion`) is used — everything is CSS `@keyframes` (`skeleton-sweep`, `lp-hcard-lost`, `lp-hbadge-in`, `lp-hstate-in`, `lp-pin-pulse`, `ln-doc-in`) or Tailwind `animate-pulse`(36)/`animate-spin`(8). Consistent choice, no framework sprawl.

**Missing transitions**: not exhaustively verifiable by grep (requires visual/DOM diffing), flagged as a Level-2 follow-up rather than claimed here.

**Fence-able**: partially. Duration/easing values in raw CSS are fenceable today only via a hand-maintained regex denylist (no tokens to point at); the real fix is introducing `--duration-fast/base/slow` + `--ease-standard` custom properties first, *then* fencing new literals against them.

---

## 3. Typography — score 4/10

Named Tailwind scale is the majority pattern: `text-sm` (1670), `text-xs` (948), `text-base` (73), `text-lg` (54), `text-xl` (40), `text-2xl` (38), `text-3xl` (7), `text-4xl`(4), `text-5xl`(3).

**The gap**: a large, systematic **second, un-tokenized type scale** built entirely from arbitrary bracket values, used far too often to be incidental:
```
text-[13px]  790×   text-[11px] 317×   text-[11.5px] 53×  text-[12.5px] 48×
text-[9.5px]  45×   text-[9px]  38×    text-[10.5px] 37×  text-[28px]  26×
text-[30px]   21×   text-[17px] 22×    text-[15px]   20×  text-[13.5px] 15×
```
(64 unique arbitrary values total, 322 files touched.) `13px` sits between Tailwind's `text-xs` (12px) and `text-sm` (14px) and is used **more than either named class on its own** in absolute terms in specific surfaces — this is a real, deliberate "13/11/9" micro-type scale (visible across `app/org` 65 files, `app/gob` 50, `app/(app)` 40+52, `app/admin` 25+17, `components/ui` 16+16) that has never been promoted to a token or a Tailwind theme extension (`fontSize: { '2xs': ... }` etc.). Any future type-scale adjustment means a global find/replace across 300+ files instead of editing one config entry.
- Half-pixel values (`11.5px`, `12.5px`, `9.5px`, `13.5px`, `14.5px`) appear specifically — a strong signal this was tuned by eye per-component rather than derived from a formula (e.g. a modular scale would not need `.5px` steps).
- `font-weight`: `font-semibold` (1126), `font-medium` (665), `font-bold` (186), `font-normal` (70), `font-black` (2, isolated outlier — worth checking if intentional).
- `line-height`: mix of named (`leading-tight` 85, `leading-relaxed` 85, `leading-snug` 47, `leading-none` 37) and 13 different arbitrary `leading-[N]` values (1.05 to 1.7) — same pattern as font-size, a shadow scale nobody named.
- Font-family roles are **defined and used correctly**: `--font-ln-serif` (IBM Plex Serif), `--font-ln-sans`/`--font-sans` (Encode Sans / IBM Plex Sans), `--font-ln-mono` (IBM Plex Mono), plus `--font-ln-caveat` (decorative cursive, used for a signature/personal-touch effect). Role separation (serif = citizen headings/editorial, mono = codes/IDs/timestamps, sans = body) is respected everywhere sampled — no `font-serif` Tailwind utility exists in the codebase (0 uses) because the project intentionally always goes through the CSS custom properties instead (`font-family: var(--lp-serif)` etc., 12+ call sites) rather than Tailwind's generic utility. This is a *good* pattern, just worth knowing `font-serif`/`font-sans` Tailwind utilities are effectively unused (3 raw `font-sans` uses look like leftovers, not the primary mechanism).

**Fence-able**: yes, and this is the highest-value fence to add. A rule flagging any new `text-[Npx]` outside an explicit allowlist (or requiring it map to a documented `--font-size-*` token set) would stop the scale from growing further; retrofitting existing usage would be a large, separate migration.

---

## 4. Spacing rhythm — score 5/10

Standard Tailwind 4px-grid spacing dominates by volume: `py-2` (611), `px-3`(503), `px-4`(482), `py-3`(213), `gap-2`(417), `gap-3`(354), etc. — all on-grid (multiples of 4px/0.25rem).

**The gap mirrors the typography one exactly**: a parallel off-grid spacing scale in arbitrary brackets, concentrated in the **shared primitive components themselves**, not just ad-hoc call sites:
```
px-[18px] 32×   py-[13px] 24×   py-[5px] 20×   py-[7px] 16×   py-[11px] 15×
px-[7px]  11×   py-[18px] 10×   px-[9px]  9×   py-[3px]  8×   py-[9px]  6×
gap-[7px] 21×   gap-[5px] 15×   gap-[18px] 4×  gap-[9px] 3×   gap-[13px] 3×
```
`components/ui/Card.tsx` itself — the shared card primitive every surface builds on — uses `px-[18px]`, `py-[13px]`, `p-[18px]`, `gap-3.5` internally (lines 90, 213, 217) rather than tokens or the standard scale. So the off-grid numbers aren't misuse by feature authors; they're baked into the design-system component and then copy-propagated by anyone building a similar card/panel without a shared constant to reference. Confirmed: **zero** `--space-*`/`--spacing-*` custom properties exist in `globals.css` (grep returned 0 matches) — there is no spacing token layer at all, only the shadow/radius/color layers are tokenized.
- Consequence: "same-concept, different padding" is real but subtle — e.g. Card content padding is `18px/13.5px`-ish while many feature panels instead use the standard-grid `p-4`(16px)/`p-6`(24px), so two visually-similar "card" boxes on the same screen can carry different internal padding depending on which primitive was reached for.

**Fence-able**: yes, same mechanism as typography — introduce `--space-*` tokens (even if aliased to the existing odd values, e.g. `--space-card-x: 18px`), then fence new arbitrary bracket spacing values against that list.

---

## 5. Icons — score 8/10 (registry adherence) / gap concentrated in nav chrome

The central registry (`components/Icon.tsx`, lucide-react backed) is respected almost everywhere: **0 files** import `lucide-react` directly outside `Icon.tsx`. This dimension is well-fenced for the common case.

**The gap**: 28 files still contain raw `<svg>`. Most are legitimate (QR/poster rendering, coordinate-based sparkline/map paths, test files, decorative brand marks) — but **7 files hand-roll a `HamburgerIcon`/`CloseIcon`/`ChevronIcon` local component that duplicates icons already in the registry** (`menu` → `Menu`, `close` → `X`, `chevron-down` → `ChevronDown`, confirmed present in `Icon.tsx` lines 214, 233):
- `components/layout/AppCitizenMasthead.tsx` (Hamburger + Close, lines 65/78)
- `components/layout/AppShellDrawer.tsx` (Hamburger, line 42)
- `components/layout/HeaderNav.tsx` (Hamburger + Close, lines 47/59)
- `components/layout/ContextSwitcher.tsx` (Chevron, line 26)
- `components/ui/dashboard/OpMobileDrawer.tsx` (Hamburger, line 31)

These are the primary navigation shells for both citizen and operator surfaces — the single highest-visibility, highest-repetition icon usage in the app — and every one of them bypasses `<Icon>` with a comment like `/* SVGs inline para hamburguesa y cerrar — icono-arg no los incluye. */` (HeaderNav.tsx:46) or `/* Chevron-down icon (inline SVG, no icon-lib dep). */` (ContextSwitcher.tsx:25). The comments reference a legacy rationale ("icono-arg" webfont) that Icon.tsx's own header comment says was already replaced by the current lucide-based map — the excuse is stale.
- No emoji-as-icon usage found in rendered UI (the 8 `✓` hits are all inside comments describing literal `"✓ completo"` text, and the actual render calls in `Sheet.tsx:465` / `Tabs.tsx:136` correctly use `<Icon name="check" .../>` — false positive on first pass, verified).
- Size/stroke consistency: `Icon.tsx` enforces `sm/md/lg` (16/20/24px) as the only sanctioned sizes; not separately audited whether raw-SVG icons above match those sizes (HeaderNav's Hamburger defaults to 22px — off the 16/20/24 scale).

**Fence-able**: yes, directly — a grep-based CI check for `function \w*Icon\(` / raw `<svg` outside an explicit allowlist (map/QR/poster files) would catch exactly these 5 nav-chrome duplicates. Cheapest high-value fence in this whole audit.

---

## 6. Border-radii — score 5/10

Tokens exist and are well-designed: `--radius-xs`(2px) / `--radius-sm`(4px) / `--radius-md`(6px, aliases `--radius-op-btn`) / `--radius-lg`(8px) / `--radius-input`(10px) / `--radius-card`(16px) / `--radius-pill`(9999px), documented with a clear px→token mapping table right in `globals.css` (lines 185–196).

Token usage is real and heavy: `rounded-[var(--radius-sm)]` (437×), `rounded-[var(--radius-md)]` (408×), `rounded-[var(--radius-lg)]` (46×), `rounded-[var(--radius-xs)]` (36×), plus `--radius-card`/`--radius-pill`/`--radius-input`/`--radius-op-btn` bridges.

**The gap**: **219 call sites** use raw arbitrary pixel radii that fall *right next to* an existing token, defeating the point of having one:
- `rounded-[3px]` — 170× (vs. `--radius-sm` = 4px, off by 1px for no visible reason). Concentrated in `app/(app)` (45 files) and `components/ui` (12 files); example: `app/(app)/cuenta/crear-consultorio/CrearConsultorioForm.tsx` (lines 44, 94, 117, 148) and `app/(app)/cuenta/desactivar/GovtSelfDeactivateForm.tsx` (line 183) — every primary button/CTA on these two account-management screens uses `rounded-[3px]` while equivalent buttons elsewhere use the token.
- `rounded-[5px]` — 49×, concentrated in `app/(public)` (10 files) — again a near-miss of `--radius-sm`(4px)/`--radius-md`(6px) with no token in between.
- Plus stray one-offs: `rounded-[14px]` (3), `rounded-[7px]` (1), `rounded-[12px]` (1), `rounded-[1px]` (2).
- Separately, plain Tailwind named radii are also used in parallel with the token system: `rounded-full`(209, fine — no token needed for circles), `rounded-lg`(59), `rounded-md`(30), `rounded-xl`(29), `rounded-2xl`(15), `rounded-sm`(8) — these resolve to **Tailwind's own radius scale**, which is never guaranteed to match `--radius-lg`(8px)/`--radius-md`(6px)/etc. Tailwind's default `rounded-lg` is 8px (happens to match `--radius-lg`) but `rounded-md` is 6px (matches `--radius-md`) only by coincidence, not design — nothing prevents the two scales from diverging on a future Tailwind upgrade or config change.

**Fence-able**: yes, straightforward. Ban `rounded-\[[0-9]` (any raw pixel radius) outside an allowlist, and separately flag bare `rounded-(sm|md|lg|xl|2xl)` in favor of the `--radius-*` bridge classes to fully unify the two scales.

---

## 7. Number alignment & decimals — score 6/10

`tabular-nums` is used 68 times but its distribution is **surface-skewed**: concentrated in operator surfaces (`app/gob` 26, `components/panorama` 15, `app/admin` 11, `components/admin` 3, `app/org` 3, `components/charts` 4) with only 2 hits in `components/ui` and effectively none in the citizen surface (`app/(app)`, `app/(public)`). Metric/count displays in citizen-facing screens (case counts, pet ages, appointment counts) were not verified to need it as urgently since they're rarely tabular, but this means the standard isn't applied on a "does this display a number" basis — it's applied on a "is this the operator dashboard" basis, which is an implicit rather than explicit rule.

Decimal-place consistency for the same metric type looks fine where checked: date/time/count formatting converges on `toLocaleString("es-AR")` (176 call sites) as the dominant, near-universal pattern, with a handful of explicit-options variants for specific needs (`maximumFractionDigits: 1` ×4, `maximumFractionDigits: 2` ×1, date-only/time-only formats). Percentage/rate values mostly go through `Math.round(x*100)` (13 sites) rather than `toFixed`, giving integer percentages consistently; the few `toFixed(1)` hits found are SVG path-coordinate strings (`AsientoCard.tsx`, `WeightSparkline.tsx`) and a file-size-in-MB display (`DecomisoForm.tsx:811`), not competing "rate" formats — no real per-metric-type drift found here, contrary to what might be assumed from the raw grep count.

**Fence-able**: partially. "Every numeric/metric display must sit inside a `tabular-nums` wrapper" is hard to fence generically by grep (would need a component-boundary lint, e.g. flag JSX expressions rendering `{someNumber}` without an ancestor class), realistic only as a targeted lint over specific components (KPI tiles, table cells) rather than the whole surface.

---

## 8. Language / copy — score 6/10

Broad terminology sampling (mascota/animal, denuncia/reporte, common CTA verbs) found no widespread synonym drift — the large majority of copy converges on one term per concept ("mascota" throughout, "denuncia" throughout for the citizen-facing report flow).

**Concrete gap found**: the login CTA uses three different verbs across the app for the identical destination/action:
- `"Iniciar sesión"` — the dominant, correct pattern (7 files: `app/(auth)/login/*`, `app/(auth)/signup/page.tsx`, `app/(app)/denuncias/mias/page.tsx`, `app/r/invite/[token]/page.tsx`, `components/layout/AppCitizenMasthead.tsx`, `components/layout/HeaderNav.tsx`).
- `"Ingresar"` — used once, in `components/landing/LandingNav.tsx:48`, as the marketing-site nav CTA for the exact same `/login` destination. The surrounding comment (line 46) shows this was a deliberate choice ("demoted to a ghost [button]") but the verb itself was never reconciled with the in-app copy.
- `"Acceder"` — used once, in `app/admin/acerca/integracion-miarg/page.tsx:82` ("Acceder con Mi Argentina (próximamente)") — this is contextually a *different* action (federated SSO, not yet shipped) so not a true violation, but worth tracking so it doesn't get confused with the other two once shipped.

Not exhaustively auditable by grep alone (terminology drift across 300+ files of prose requires either an LLM-assisted full-text pass or a maintained glossary lint); this section should be treated as a spot-check, not a complete census. Sentence-case adherence on headings/buttons was not systematically checked (would need a regex for Title Case violations, which is noisy given proper nouns like "Mi Argentina", "MiMAR", "DIM", jurisdiction names).

**Fence-able**: partially — a small glossary lint (`Ingresar` outside `LandingNav.tsx` → warn; canonical term is `Iniciar sesión`) would catch this specific drift and any regressions, but a general terminology fence would need a maintained synonym-ban list to be worth the CI cost.

---

## Summary table

| # | Dimension | Score | Fence-able |
|---|---|---|---|
| 1 | Shadows | 7/10 | Yes (partial — needs allowlist for decorative one-offs) |
| 2 | Animation/transition | 5/10 | Partial (needs duration/easing tokens first) |
| 3 | Typography | 4/10 | Yes (highest-value fence — 300+ files, un-tokenized 13/11/9px scale) |
| 4 | Spacing rhythm | 5/10 | Yes (same mechanism as #3 — needs `--space-*` tokens, currently zero) |
| 5 | Icons | 8/10 | Yes (cheapest fence — 5 nav-chrome files duplicate the registry) |
| 6 | Border-radii | 5/10 | Yes (219 near-miss raw pixel radii vs. existing token set) |
| 7 | Numbers/decimals | 6/10 | Partial (tabular-nums applied by surface, not by "has a number") |
| 8 | Language/copy | 6/10 | Partial (spot-checked only; one concrete login-verb drift found) |

**Overall visual-grammar consistency: ~5.75/10.** The project's *intent* is consistent (real token sets for color/radius/shadow exist and are the majority pattern everywhere) but two large un-tokenized shadow scales — one for type size, one for spacing — have grown to 300+ files each, entirely outside what the current CI fences check. Those two are the top priority: they're the largest in raw count, the most clearly "a system that was never named," and the cheapest to fence once a token layer is added. The icon-registry gap (5 nav files) is small in count but high in visibility and trivially fence-able today with no prerequisite work.
