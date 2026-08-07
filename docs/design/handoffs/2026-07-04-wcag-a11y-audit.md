# WCAG 2.1 AA Accessibility Audit — MiMAR / DIM

## Ground truth

| Field | Value |
|---|---|
| **Branch** | `integration/all-20260703` |
| **HEAD (short)** | `6dff9584` |
| **Scope** | Read-only; canonical checkout `C:/dev/dim` |
| **Auditor role** | External recommendations only — no files modified |

---

## Executive summary

**Rough compliance level: high intent, partial AA — not procurement-ready without fixes.**

The codebase shows deliberate WCAG work: `lang="es-AR"`, global `:focus-visible` rings, contrast-hardened LN tokens, `LnField` form primitives, Biome a11y rules at error level, skip links + `#main-content` landmarks, reduced-motion collapse, 44px targets on core citizen controls, and honest disclosure at `/accesibilidad`. Custom widgets (Vaul sheets, FlipCard, OpOmnibox, EventCatcher radiogroup) are partially accessible.

**Systemic gaps** cluster in: (1) keyboard completeness on custom tab/sheet patterns, (2) heading structure on the primary QR credential surface, (3) a few contrast edge cases with `--color-ln-celeste`, (4) duplicate/mixed-language skip links, (5) thin automated test coverage beyond static markup assertions.

---

## What's already compliant (credit)

| Area | Evidence |
|---|---|
| **Language** | `app/layout.tsx:110` — `<html lang="es-AR">`; viewport omits `maximumScale` (WCAG 1.4.4) |
| **Focus global** | `app/globals.css:365-372` — `:focus { outline:none }` + `:focus-visible` 3px azul ring |
| **Reduced motion** | `app/globals.css:376-384` — global `prefers-reduced-motion: reduce` collapse; FlipCard branch at `components/pet-profile/FlipCard.tsx:77-98` |
| **Skip link** | Root: `app/layout.tsx:113-118` ("Ir al contenido principal"); AppShell variants: `components/layout/AppShell.tsx:94-99` etc. |
| **Landmarks** | AppShell owns single `<main id="main-content">`; tested in `__tests__/public-token-landing-structure.test.tsx` |
| **Touch targets** | `components/ui/Field.tsx:168-169` min-h-[44px]; PetActionRow tested in `__tests__/a11y-touch-targets.test.tsx` |
| **Forms (LN)** | `LnField` wires `htmlFor`, `aria-describedby`, `aria-invalid`, `role="alert"` errors (`components/ui/Field.tsx:69-104`) |
| **Denuncia radios** | fieldset/legend tested in `__tests__/a11y-structural.test.tsx` |
| **OpOmnibox** | Full combobox APG: `role="combobox"`, `aria-activedescendant`, ↑/↓/Enter/Escape (`components/ui/dashboard/OpOmnibox.tsx:160-179`) |
| **FlipCard** | `aria-label` + `aria-pressed`, reduced-motion fallback (`components/pet-profile/FlipCard.tsx:143-156`) |
| **VaulSheet** | `Drawer.Title`, close `aria-label="Cerrar"`, optional focus return (`components/ui/VaulSheet.tsx:95-104`) |
| **Contrast tokens** | `app/globals.css:50-51,62` — mute/faint/warn darkened with documented ratios |
| **Transparency** | `app/(public)/accesibilidad/page.tsx` — states no formal third-party audit |

---

## Findings by area

### 1. Keyboard operability (2.1.1, 2.1.2, 2.4.3)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P1** | 2.1.1 Keyboard | `components/ui/UrlTabs.tsx:86-93` | Tabs are `<button role="tab">` but only activate on click + full page reload; no Arrow Left/Right, Home, End, or roving tabindex per APG Tabs pattern | Add keydown handler on `tablist`; Arrow keys switch tabs; preserve `aria-selected` / focus sync |
| **P1** | 2.1.1 Keyboard | `components/EventCatcher.tsx:129-141,235-240` | "Double-tap to open profile" and long-press navigation are pointer-only; keyboard users can select a pet chip but cannot open the profile | Add explicit keyboard action (e.g. Enter on focused chip when already selected, or dedicated "Abrir perfil" link/button per chip) |
| **P2** | 2.1.1 Keyboard | `components/layout/AppCitizenMasthead.tsx:246-290` | `CitizenSwitcher` popover opens on click but lacks Escape-to-close and arrow-key menu navigation | Add `onKeyDown` Escape; optional `role="menu"` + arrow keys / focus trap |
| **P2** | 2.1.1 Keyboard | `components/LocationFields.tsx:347+` (map via `LocationPicker`) | L2 map pin adjustment is drag-centric; geolocation button is keyboard-accessible but map interaction likely isn't | Verify MapLibre keyboard pan/zoom; expose lat/lng text fallback or documented keyboard path |
| ✅ | 2.1.1 | `components/ui/dashboard/OpOmnibox.tsx:160-179` | Combobox fully keyboard-operable | — |
| ✅ | 2.1.2 No Keyboard Trap | `components/ui/VaulSheet.tsx:57-64` | Vaul/Radix drawer provides focus trap + Escape (library default) | Verify with manual SR test |
| ✅ | 2.4.3 Focus Order | `components/EventCatcher.tsx:260-269` | Pet chip radiogroup supports Arrow Left/Right with roving focus | — |

---

### 2. Focus visible (2.4.7)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P2** | 2.4.7 Focus Visible | `app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager.tsx:171` | Read-only input uses `focus:outline-none` with no `focus-visible:ring` or border replacement | Add `focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]` or match `LnInput` pattern |
| **P2** | 2.4.7 | `app/(public)/refugios/[orgToken]/OrgHero.tsx:96` | Verified badge link: `focus:outline-none` only (relies on global `:focus-visible`) | Acceptable if global ring verified; prefer explicit `focus-visible:ring` like sibling CTAs at `:127` |
| **P2** | 2.4.7 | `components/layout/AppShell.tsx:96,128,157` | Skip links use `focus:outline-none` but show bg/color on `:focus` — works, but `:focus` not `:focus-visible` may flash on click | Change to `focus-visible:not-sr-only` to avoid mouse-click focus ring on skip |
| ✅ | 2.4.7 | `app/globals.css:368-372` | Global `:focus-visible` 3px azul outline on elements without component overrides | — |
| ✅ | 2.4.7 | `components/ui/Field.tsx:173-175` | Inputs replace outline with border + 3px celeste-050 shadow (non-color cue) | — |

---

### 3. Name, role, value (4.1.2)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P2** | 4.1.2 Name/Role/Value | `components/pet-profile/FlipCard.tsx:149-150` | `aria-pressed={isLibreta}` on a face-switch button is unconventional (reads as toggle state, not navigation); may confuse SR users | Consider `aria-expanded` + `aria-controls` pointing at face panels, or treat as plain button with descriptive `aria-label` only |
| **P2** | 4.1.2 | `components/ui/UrlTabs.tsx:78-81` | `aria-label` on tablist is optional; gob/perdidas usage may omit it | Require `aria-label` prop or default `"Secciones"` |
| **P2** | 4.1.2 | `components/pet-profile/CredentialFace.tsx:100-106` | QR thumbnail inside link has `aria-label` on link but SVG itself is silent; link name may not include QR purpose on all paths | Mirror `PetCreatedAha.tsx:115-116` pattern: `role="img"` wrapper with descriptive `aria-label` |
| ✅ | 4.1.2 | `components/ui/VaulSheet.tsx:95` | `Drawer.Title` provides accessible name for dialog | — |
| ✅ | 4.1.2 | `components/EventCatcher.tsx:278-359` | Pet chips: `role="radiogroup"`, `aria-pressed`, `aria-label` with state | — |
| ✅ | 4.1.2 | `components/layout/AppCitizenMasthead.tsx:321-324,348-351` | Mobile drawer trigger/close have `aria-label` | — |

---

### 4. Contrast (1.4.3 / 1.4.11)

Token definitions: `app/globals.css:41-64` (post–June 2026 darkening).

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P1** | 1.4.3 Contrast (Minimum) | `app/globals.css:44` + `components/EventCatcher.tsx:74,385` | `--color-ln-celeste` (#4e97d1) used for normal-size text on paper/card (~3.3:1, below 4.5:1) | Reserve celeste for large text (≥18pt), icons, or UI chrome; use `--color-ln-azul` or `--color-ln-ink-2` for body text |
| **P1** | 1.4.3 | `components/layout/AppCitizenMasthead.tsx:122,344` | Subtitle "MI MASCOTA ARGENTINA" in celeste on azul-900 at 9–9.5px — decorative but still parsed; ratio likely sub-AA at that size | Use `text-white/80` or lighter celeste-100 on dark band |
| **P2** | 1.4.3 | `app/globals.css:94` + memorial chip usage | `--color-ln-memorial-chip-text` (#6a5a3f) on `--color-ln-memorial-chip-bg` (#f0ead9) — verify ≥4.5:1 (likely borderline ~4.3) | Re-audit; darken text if needed |
| **P2** | 1.4.3 | `docs/a11y/contrast-audit.md:15-28` | Audit doc references **stale** pre-LN tokens (#000000, #ffce1c ring, etc.); procurement reviewers may get wrong signal | Update doc to match current `@theme` values in `globals.css` |
| ✅ | 1.4.3 | `app/globals.css:50-51,62` | mute (#616e77) 5.02:1, faint (#67747d) 4.60:1, warn (#96600e) 5.28:1 on paper — documented | — |
| ✅ | 1.4.11 | `app/globals.css:108-117` | Focus ring uses geometry (3px + offset) per contrast-audit rationale | — |

---

### 5. Forms (1.3.1, 3.3.1, 3.3.2, 4.1.3)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P1** | 1.3.1 Info & Relationships | `app/(public)/p/[publicToken]/encontre/FinderInPossessionForm.tsx:211-222` | Section heading "¿Dónde la tenés ahora?" is a `<p>`, not associated with `LocationFields` inputs (which expose their own "Dirección o referencia" label at `components/LocationFields.tsx:321-323`) | Use `<fieldset>`/`<legend>` wrapping LocationFields, or pass a `legend`/ `aria-labelledby` into LocationFields |
| **P2** | 3.3.2 Labels/Instructions | `components/ui/Field.tsx:50-86` | `LnField` shows visual `*` for required but does **not** set `aria-required="true"` on child controls | Pass `aria-required={required \|\| undefined}` in render props |
| **P2** | 3.3.1 Error Identification | `components/ui/Field.tsx:96-103` | Field errors use `role="alert"` (good) but only when `error` prop set client-side; server-action errors on non-LnField forms vary | Standardize server error → `role="alert"` + `aria-describedby` on all public forms |
| ✅ | 3.3.2 | `app/(public)/denuncias/nueva/WelfareReportForm.tsx:158+` | Denuncia uses `LnField` + required selects/inputs | — |
| ✅ | 3.3.1 | `app/(public)/p/[publicToken]/encontre/FinderInPossessionForm.tsx:327-329` | Form errors: stable `errorId`, `role="alert"`, `aria-describedby` on inputs | — |
| ✅ | 3.3.1 | `components/ui/Field.tsx:109-115` | Native validation bubbles localized to es-AR via `setCustomValidity` | — |

---

### 6. Headings & landmarks (1.3.1, 2.4.1, 2.4.6)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P0** | 1.3.1 / 2.4.6 | `app/(public)/p/[publicToken]/page.tsx:746-748` | **Primary QR credential page** renders pet name in a `<div>`, not `<h1>` — no page-level heading on the most-scanned public surface | Add `<h1 className="sr-only">` or visible `<h1>{pet.name}</h1>` (visually integrate with existing name bar) |
| **P1** | 2.4.1 Bypass Blocks | `app/layout.tsx:113-118` + `components/layout/AppShell.tsx:94-99` | **Duplicate skip links** on AppShell routes: root Spanish link + AppShell English "Skip to main content" | Keep one skip link (Spanish) in root layout only; remove AppShell duplicates |
| **P2** | 3.1.2 Language of Parts | `components/layout/AppShell.tsx:98,130,159` | Skip link text is English on an es-AR site | Change to "Ir al contenido principal" |
| ✅ | 2.4.1 | `app/layout.tsx:113-118` | Skip-to-main present | — |
| ✅ | 1.3.1 | `components/ui/Hero.tsx:84-86` | Owner pet profile has proper `<h1>{name}</h1>` | — |
| ✅ | 1.3.1 | `app/(public)/denuncias/nueva/_components/Step1Kind.tsx:45+` | Denuncia wizard steps each expose `<h1>` (one mounted at a time) | — |

---

### 7. Images & media (1.1.1)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P2** | 1.1.1 Non-text Content | `app/(public)/p/[publicToken]/page.tsx` (credential card) | No QR code block on Tier-0 public page (QR is scan entry, not displayed) — OK; but if QR is added, needs `role="img"` + label | N/A today; follow `PetCreatedAha.tsx:113-116` if added |
| **P2** | 1.1.1 | `components/pet-profile/FutureLedgerList.tsx:94-98` | Emoji icons (💉🏥💊) marked `aria-hidden` — good — but adjacent text may not convey icon meaning for all users | Optional: replace with Lucide + `aria-hidden` (already project direction per `/accesibilidad`) |
| ✅ | 1.1.1 | `components/ui/RegRow.tsx:44` | `LnPetPhoto` requires `alt` prop | — |
| ✅ | 1.1.1 | `app/(public)/p/[publicToken]/page.tsx:722-724` | Pet photo `alt={pet.name}` | — |
| ✅ | 1.1.1 | `components/EventCatcher.tsx:367-359` | Photo `alt=""` with name in button `aria-label` — correct pattern | — |
| ✅ | 1.1.1 | `app/(app)/mis-mascotas/nueva/[publicToken]/credencial/PetCreatedAha.tsx:113-116` | QR: `role="img"` + descriptive `aria-label` including URL | — |

---

### 8. Language & status (3.1.1, 4.1.3)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P2** | 3.1.1 Language | `components/layout/AppShell.tsx:98` | English skip-link strings on es-AR site | Spanish copy (see above) |
| **P2** | 4.1.3 Status Messages | `components/Toaster.tsx:17-30` | Sonner wrapper with no explicit `toastOptions`; relies on library defaults for `aria-live` | Confirm sonner v4 exposes `role="status"`/`aria-live="polite"`; add `toastOptions={{ /* a11y */ }}` if configurable |
| ✅ | 3.1.1 | `app/layout.tsx:110` | `lang="es-AR"` on `<html>` | — |
| ✅ | 4.1.3 | `components/LocationFields.tsx:337-339` | Geocode progress: `aria-live="polite"` | — |
| ✅ | 4.1.3 | `components/ui/Field.tsx:100` | Field errors: `role="alert"` | — |

---

### 9. Motion & target size (2.5.5, 2.3.3)

| Severity | WCAG SC | file:line | Issue | Fix |
|---|---|---|---|---|
| **P2** | 2.5.5 Target Size | `components/ui/VaulSheet.tsx:98` | Close button `h-8 w-8` (32×32px) below 44×44 minimum | Increase to `min-h-11 min-w-11` or expand hit area with padding |
| **P2** | 2.5.5 | `components/layout/AppCitizenMasthead.tsx:220` | Anonymous "Iniciar sesión" uses `min-h-[36px]` | Change to `min-h-11` |
| **P2** | 2.5.5 | `components/layout/AppCitizenMasthead.tsx:352` | Mobile drawer close `h-8 w-8` | Same as VaulSheet fix |
| ✅ | 2.3.3 | `app/globals.css:376-384` | Global reduced-motion | — |
| ✅ | 2.5.5 | `components/pet-profile/FlipCard.tsx:145-152` | Flip affordance via `IconCircleButton` min-h-11 min-w-11 | — |
| ✅ | 2.5.5 | `__tests__/a11y-touch-targets.test.tsx` | Guards PetActionRow, WizardShell back, OpRailNav | — |

---

### 10. Existing a11y tests — coverage & gaps

**Present (`__tests__/a11y-*.test.tsx`):**

| File | Asserts |
|---|---|
| `a11y-structural.test.tsx` | Denuncia fieldset/legend; no nested anchors; EventCatcher radiogroup |
| `a11y-touch-targets.test.tsx` | 44px on WizardShell, OpRailNav, PetActionRow |
| `a11y-table-scope.test.tsx` | `<caption>` + `scope` on two gob tables |
| `a11y-badge-kpi.test.tsx` | OpStateBadge/OpKpi non-color cues (1.4.1) |

**Also:** `__tests__/public-token-landing-structure.test.tsx` (single `#main-content`), e2e smoke (`e2e/public-smoke.spec.ts`, `e2e/owner-shell.spec.ts`).

**Gaps (not tested):**

- Keyboard interaction (UrlTabs arrows, sheet Escape, EventCatcher profile open)
- Focus ring presence on custom controls
- Heading hierarchy on `/p/[publicToken]`
- Contrast regression (token changes)
- Live region / toast announcements
- Playwright axe scan on citizen + public routes (only structural count checks today)

---

## TOP 5 blockers before government procurement / formal audit

| Rank | Issue | WCAG | Cost to fix |
|---|---|---|---|
| **1** | **No `<h1>` on `/p/[publicToken]`** — the QR landing page millions will scan | 1.3.1, 2.4.6 | **Cheap** — one heading element |
| **2** | **`UrlTabs` not keyboard-operable** (Arrow/Home/End) — used on gob citizen-adjacent surfaces | 2.1.1 | **Structural** — widget key handler + tests |
| **3** | **`EventCatcher` profile navigation is pointer-only** (double-tap/long-press) on `/inicio` | 2.1.1 | **Medium** — add keyboard-visible "Abrir perfil" affordance |
| **4** | **`--color-ln-celeste` as normal text** on paper (state labels, masthead subtitle) | 1.4.3 | **Medium** — token usage audit + swap to azul/ink-2 (may touch several files) |
| **5** | **Duplicate skip links + English skip text in AppShell** | 2.4.1, 3.1.2 | **Cheap** — delete AppShell skip links; unify Spanish copy |

---

## Honest compliance assessment

| Dimension | Rating | Notes |
|---|---|---|
| **Legal defensibility (Ley 26.653 / Disp. ONTI 6/2019)** | **Not yet** | `/accesibilidad` correctly disclaims formal certification; P0 heading gap on primary credential undermines "AA intent" claims |
| **Citizen/public surfaces** | **~75–80% toward AA** | Strong forms, landmarks, tokens, motion; weak on hottest page heading + celeste text + keyboard edge cases |
| **Operator surfaces (/gob, /admin)** | **~70% toward AA** | OpOmnibox excellent; UrlTabs keyboard gap; table tests cover 2 of N tables |
| **Test / CI gate** | **Partial** | Static markup tests only; no axe, no keyboard e2e, no contrast CI |
| **Documentation** | **Good intent, stale audit** | `contrast-audit.md` predates LN token migration |

**Bottom line:** This is **materially above average** for an early-stage gov-adjacent product — the engineering culture is visible. It is **not** near procurement-grade AA today because of the missing h1 on the credential surface, incomplete keyboard support on custom widgets, and absence of third-party or automated conformance evidence. The good news: the top blockers split evenly between **cheap fixes** (h1, skip links, aria-required, close-button sizing) and **one structural pass** (UrlTabs keyboard + celeste text sweep).

---

*Audit performed read-only against branch `integration/all-20260703` @ `6dff9584`. Recommend re-run after fixes with axe-core/Playwright on `/p/*`, `/inicio`, `/denuncias/nueva`, and sheet-heavy pet profile flows.*
