# UI Component Registry

## Antes de construir UI, buscá acá

**This file is mandatory reading before you add any UI.** DIM already has a
canonical primitive for almost every shape — buttons, tabs, badges, fields,
sheets, cards, KPIs, empty states. Reimplementing one by hand means: wrong
focus rings, wrong touch targets, raw palette classes that fail `lint:tokens`,
and a raw `<button>` that fails `lint:buttons`. **Find the primitive here, use
it, extend it if it's missing a prop — do not clone it.**

Two skins coexist:

- **`Ln*`** — the **citizen / owner** surface (public pages, owner PWA). Warm
  "Poncho" credential aesthetic. Files at `components/ui/*`.
- **`Op*`** — the **operator** surface (`/gob`, `/admin`, `/org` dashboards).
  Denser, cooler operator chrome. Files at `components/ui/dashboard/*`.

Pick the skin that matches the surface you're building. Never render a citizen
`Ln*` status tone on an operator surface (that was the CaseBadge regression —
see the variant-map note below).

---

## Buttons & actions — DON'T write a raw `<button>`

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnButton` | `Button.tsx` | Citizen buttons. Variants: `primary\|seal\|ghost\|ok\|warn`, sizes `sm\|md\|lg`. | No raw `<button>` on citizen surfaces. |
| `LnLinkButton` | `LinkButton.tsx` | A **link** styled as a button (`<a>`/`<Link>`). Shapes `pill\|block`, fill `filled\|outline`. | Don't wrap `LnButton` in an anchor. |
| `OpButton` | `dashboard/OpButton.tsx` | Operator buttons. Variants: `primary\|ghost\|danger\|ok`. | No raw `<button>` on `/gob`, `/admin`, `/org` — `lint:buttons` fails. |
| `IconCircleButton` | `IconCircleButton.tsx` | Icon-only round control. | Don't hand-roll a round icon button. |
| `CopyButton` | `CopyButton.tsx` | Copy-to-clipboard with feedback. | Don't reimplement clipboard + toast. |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive/confirm gate. Tones `danger\|warn\|neutral`. | Don't roll your own confirm modal. |
| `OpSubmitButton` | `dashboard/OpField.tsx` | Operator form submit with pending state. | Don't wire `useFormStatus` by hand. |

## Tabs & navigation — no reimplementes tabs

| Component | File | Use for | DON'T |
|---|---|---|---|
| `UrlTabs` / `UrlTabsContent` | `UrlTabs.tsx` | Tabs whose active state lives in the **URL** (`?tab=`), shareable/deep-linkable. | No reimplementes tabs. Don't sync tabs to the URL by hand. |
| `LnTabs` | `Tabs.tsx` | Tabs with **local** active state (no URL). | No reimplementes tabs. |
| `LnAccordion` / `LnAccordionGroup` | `Tabs.tsx` | Collapsible sections. | Don't build a `<details>` accordion ad hoc. |

## Badges, chips & status

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnBadge` | `Badge.tsx` | Citizen inline badge. | — |
| `LnChip` / `LnChipGroup` / `LnStatusDot` / `LnPetPill` | `Chip.tsx` | Chips, selectable chip groups, status dots, pet pills. | Don't hand-color status dots. |
| `LnStatusFlag` / `LnVstamp` / `LnMemorialChip` | `StatusFlag.tsx` | Pet status flag, vaccination stamp (`ok\|due\|over`), memorial chip. | — |
| `OpPill` / `OpStatusPill` / `OpStateBadge` / `OpCodeBadge` / `CaseStatusBadge` | `dashboard/*` | Operator pills & status badges. `OpStatusPill` is the shared status primitive (tones `st-ok\|st-warn\|st-err\|st-info\|neutral`). | Don't hardcode a status color — use the `st-*` tone so it remaps per skin. |
| `AmendedBadge` | `AmendedBadge.tsx` | "Corrected by amendment" marker. | — |

## Callouts & alerts

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnAlert` | `Alert.tsx` | Citizen inline alert/notice. | — |
| `LnCallout` | `DocElements.tsx` | Credential-doc callout (tones `azul\|warn`). | — |
| `OpCallout` | `dashboard/OpCallout.tsx` | Operator callout (title + body + icon). | — |
| `OpFormAlert` | `dashboard/OpField.tsx` | Form-level error banner in operator forms. | — |

## Fields & forms

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnField` + `LnInput` / `LnSelect` / `LnTextarea` / `LnRow` | `Field.tsx` | Citizen form fields with label/hint/error + native validation localized to es-AR (`localizedValidationMessage`). | Don't render a bare `<input>` — you lose validation + a11y wiring. |
| `OpField` + `OpInput` / `OpSelect` / `OpTextarea` | `dashboard/OpField.tsx` | Operator form fields. | Same — use the primitive. |
| `DateInputAr` | `DateInputAr.tsx` | Argentine date entry (dd/mm/aaaa). | Don't use a raw `<input type="date">` for AR dates. |
| `LnToggle` / `LnToggleGroup` | `Toggle.tsx` | Toggles / segmented choices (`azul\|amber`). | — |
| `WizardShell` (`LnWizardShell`) | `WizardShell.tsx` | Multi-step wizard chrome. | Don't hand-build step headers/progress. |

## Cards, sheets & surfaces

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnCard` / `LnCardHead` / `LnCardBody` | `Card.tsx` | Citizen card surface. | — |
| `LnSheet` / `LnSheetPet` | `Card.tsx` | Inline sheet-style panel (tones `azul\|verde\|warn\|violeta\|seal`). | — |
| `LnSheetPage` family (`LnSheetHeader/Body/Footer/Card/Wrap/…`) | `Sheet.tsx` | Full citizen "sheet page" layout (flow/wizard pages). | — |
| `Sheet` (Vaul) | `VaulSheet.tsx` | Bottom/right **drawer** modal (`bottom\|right`). | Don't build a portal+overlay drawer by hand. |
| `OpCard` / `OpCardHead` / `OpCardBody` | `dashboard/OpCard.tsx` | Operator card surface. | — |
| `LnHero` | `Hero.tsx` | Citizen page hero. | — |

## Lists, tables & KPIs

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnLedger` / `LnVaccineLedger` | `Ledger.tsx` | Citizen tabular ledger (typed columns). | Don't render a raw `<table>` for ledger data. |
| `LnRegRow` / `LnRegistry` / `LnPetPhoto` | `RegRow.tsx` | Registry rows + pet photo thumbnail. | — |
| `DiscList` / `DiscRow` | `../pet-profile/DiscList.tsx` | Disc-bulleted definition lists on the pet profile. | — |
| `OpKpi` / `OpKpiSm` | `dashboard/OpKpi.tsx` | Operator KPI tile (value + tone + trend). | Don't build a KPI tile from scratch — see the `dataviz` skill for chart tiles. |
| `KpiStrip` | `dashboard/KpiStrip.tsx` | Row of KPIs. | — |

## Empty & loading states

| Component | File | Use for | DON'T |
|---|---|---|---|
| `LnEmptyState` | `EmptyState.tsx` | Citizen empty state (icon + message + action). | Don't write a bespoke "no hay datos" block. |
| `Skeleton` / `LnCardSkeleton` | `Skeleton.tsx`, `LnCardSkeleton.tsx` | Citizen loading placeholders. | — |
| `OpCardSkeleton` / `OpKpiSkeleton` | `dashboard/*` | Operator loading placeholders. | — |

## Credential-document chrome

| Component | File | Use for |
|---|---|---|
| `LnGuilloche` / `LnDocCode` / `LnSeal` / `LnLabel` / `LnSectionHead` / `LnCallout` | `DocElements.tsx` | The security-document look for credential/certificate pages. |

## Icons — use the registry, not raw imports

| Component | File | Use for | DON'T |
|---|---|---|---|
| `Icon` (+ `ICON_MAP`, `iconNames`) | `../Icon.tsx` | All iconography. `ICON_MAP` is a curated `Record<string, LucideIcon>` covering every icon actually used. | Don't `import { Foo } from "lucide-react"` in a component — add the icon to `ICON_MAP` and render `<Icon name="foo" />`. |
| `Photo` | `Photo.tsx` | Pet photos with fallback. | Don't use a raw `<img>` for pet photos. |

---

## Convention: typed variant/tone maps are the single source (CVA-style)

A component's variant → className mapping lives in **one** typed lookup, keyed by
a union type, so every call site is exhaustive and the classes live in exactly
one place. This is the house version of `class-variance-authority`.

- **House example:** `OP_TONE_CLASSES` — a `Record<PetSituationTone, string>`
  mapping each situation tone to its border/background classes
  (`app/org/[orgToken]/mascotas/[publicToken]/page.tsx`). Its exhaustiveness is
  enforced by `scripts/check-ui-invariants.ts` (`lint:ui`): a new tone with no
  class entry fails CI.
- **Reusable primitive:** `TONE_CLASSES: Record<StatusTone, string>` exported
  from `dashboard/OpStatusPill.tsx` — the shared status-tone map. Prefer this
  over inlining status colors.
- **More of the same shape:** `toneTopBorder` / `toneIconBg` / `toneCtaClass`
  in `Sheet.tsx` and `Card.tsx`, `selectedClasses` in `Chip.tsx`,
  `confirmBtnClass` in `ConfirmDialog.tsx`.

When you add a variant: extend the union type **and** the map. Never scatter
`tone === "warn" ? "..." : "..."` ternaries across JSX — that's how a tone ends
up styled three different ways.

## Enforcement — fences that keep this registry honest

- **`lint:buttons`** (`scripts/check-raw-buttons.mjs`) — ratchets raw `<button>`
  count down across `/gob`, `/admin`, `/org`. New raw buttons fail; use
  `LnButton` / `OpButton`.
- **`lint:ui`** (`scripts/check-ui-invariants.ts`) — guards the situation-tone
  variant map (`OP_TONE_CLASSES`) for exhaustiveness, among other UI invariants.
- **`lint:tokens`** (`scripts/check-design-tokens.ts`) — blocks raw palette
  classes, `dark:` prefixes, arbitrary hex/px; the tone maps above must use
  `gob-*` / `ln-*` / `st-*` tokens, not raw palette utilities.
- **Tabs:** there is **no** dedicated tablist fence yet. Using `UrlTabs` /
  `LnTabs` instead of a hand-rolled tablist is convention, not CI-enforced —
  hold the line in review.

> Missing a primitive, or found one this file doesn't list? Add it here in the
> same PR. This registry is only useful if it stays complete.
