> **ARCHIVED — do not use.** This document is historical. `components/poncho/`
> no longer exists in this codebase, and the `gob-*` Tailwind classes below
> (`bg-gob-primary`, `text-gob-primary`, etc.) are not defined anywhere in
> `app/globals.css` — they were removed along with the webfont this doc
> assumed. If you're looking for the current design system, the app's
> components live under `components/ui/` (Libreta Nacional tokens — see the
> `--font-ln-serif` / `--color-ln-*` vars in `app/globals.css`), and the
> public landing has its own components under `components/landing/`. Kept
> here only for historical reference to the pre-rename Poncho phase.

# Poncho Design System — Component Reference (historical)

All components live in `components/poncho/` and are exported from `components/poncho/index.ts`.
Convention: components carry **no** "Poncho" prefix — they are `Button`, `Badge`, `Photo`, etc.

## Component Table

| Component | Purpose | Variants / Sizes | A11y notes |
|-----------|---------|-----------------|-----------|
| **Button** | Primary interactive control | `variant`: primary, secondary, success, danger, link, tag · `size`: sm, md, lg | `aria-busy` on loading; icon-only requires `ariaLabel`; focus ring from globals.css; touch target ≥44px |
| **Badge** | Semantic status pill | `variant`: info, success, warning, danger, neutral | Icon-only badge requires `aria-label` |
| **Alert** | Inline informational banner | `variant`: info, success, warning, danger | `role="alert"` for live announcement; dismiss button has `aria-label="Cerrar"` |
| **Panel** / PanelHeader / PanelBody | Card-style content container with optional header | — | Semantic section wrapper; header level set by consumer |
| **Tabs** | Tab-bar navigation | Items via `TabItem[]` prop | Uses `role="tablist"` / `role="tab"` / `role="tabpanel"` |
| **EmptyState** | Zero-data placeholder | — | Decorative illustration is `aria-hidden` |
| **MetricCard** | KPI tile with trend indicator | `tone`: neutral, info, success, warning, danger | Numeric value + label always visible; trend icon is decorative |
| **ReminderCard** | Vaccine/reminder action card | variant driven by `ReminderVariant` (upcoming, overdue, due-soon, …) | Action button inherits Button a11y |
| **DateRangePicker** | Date range input control | — | Labels required by caller |
| **PeriodPicker** | Period preset selector | `PeriodPreset` enum | Keyboard navigable via Button |
| **JurisdictionSwitcher** | Province/municipality scope toggle | `JurisdictionScope` | Focus ring; current scope communicated via `aria-pressed` |
| **MapChoropleth** | SVG choropleth map | `ChoroplethRegionDatum[]` | `aria-label` on SVG; decorative regions are `aria-hidden` |
| **TimeSeriesChart** | Recharts line/area chart | `TimeSeriesPoint[]` | Wrapping `<figure>` + `<figcaption>` required by consumer |
| **Photo** _(new)_ | Pet avatar with status treatment | `status`: ok, lost, found, deceased · `size`: sm (40 px), md (56 px), lg (80 px), xl (120 px) | `alt` always required; status pill text is visible (not hidden); grayscale on deceased |
| **Sheet** _(new)_ | Bottom-sheet / right-drawer (Vaul) | `size`: sm (320 px), md (480 px), lg (640 px) · `side`: bottom / right | `aria-labelledby` links to Drawer.Title; close button has `aria-label="Cerrar"` |
| **Crumbs** _(new)_ | Breadcrumb navigation | — | `<nav aria-label="Breadcrumb">`; last item has `aria-current="page"`; separator is `aria-hidden` |

## Deep-link helpers (Sheet)

`Sheet.helpers.ts` exports URL utilities for deep-linking to sheets via `?sheet=<id>`:

```ts
getSheetIdFromSearchParams(searchParams)         // → string | null
buildSheetUrl(pathname, searchParams, sheetId)   // → URL string
buildCloseSheetUrl(pathname, searchParams)       // → URL string (sheet param removed)
getDrawerWidth(size)                             // → Tailwind class, e.g. "md:w-[480px]"
```

The caller (server component) computes `open={searchParams.sheet === id}` and passes it down;
the Sheet component itself has no `typeof window` checks.

## Photo status helpers

`Photo.helpers.ts` exports pure functions for status-driven rendering:

```ts
getStatusRingClass(status)   // → Tailwind class string
getStatusBadgeProps(status)  // → { label, tone } | null
getSizePx(size)              // → number (40 / 56 / 80 / 120)
```

## Semantic tokens (Tailwind v4)

All components use `@theme` tokens defined in `app/globals.css`:

| Token prefix | Examples |
|---|---|
| `gob-primary` | `bg-gob-primary`, `text-gob-primary` |
| `gob-success` / `gob-danger` / `gob-warning` / `gob-info` | Ring and badge colors |
| `gob-text` / `gob-text-gray` / `gob-text-muted` | Typography hierarchy |
| `gob-border` / `gob-border-strong` | Borders and rings |
| `gob-surface` / `gob-surface-alt` | Backgrounds |
