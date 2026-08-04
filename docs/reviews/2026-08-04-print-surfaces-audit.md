# Print and export surfaces audit — 2026-08-04

**Scope.** Every surface in DIM/MiMAR whose final artifact is paper (or a file opened outside the app), plus every data export route. Read-only static audit; no source file was modified.

**Why this exists.** On 2026-08-04 the lost-pet poster was found to print `PERDIDO` as white text on a coloured block. Browsers default to `print-color-adjust: economy` and Chrome's "Background graphics" checkbox is OFF, so the block was dropped and the single most important word on the poster printed white-on-white. Fixed in `app/(app)/mis-mascotas/[publicToken]/cartel/cartel-print.css:21-25`. Print surfaces are the only place in this product where the artifact is never seen on screen, so defects survive indefinitely. This audit looks for the rest.

**Headline.** The colour-dropout bug is not unique to the cartel — it exists in identical form on `/p/[publicToken]`, the surface people print *most*. And two `/gob` print artifacts (the maltrato expediente and the Panorama informe) sit inside a `position: fixed; overflow: hidden` operator shell that neither print stylesheet neutralises, so both almost certainly truncate to one page.

---

## Method and limits

- Tooling: `Grep` / `Glob` / `Read` only. `.claude/worktrees/` and `node_modules/` excluded.
- Discovery: repo-wide sweep for `@media print`, `@page`, `print-color-adjust`, `*-print.css`, the `print:` Tailwind variant, `window.print`, `deferPrint`, `Content-Disposition`, `text/csv`, and `QRCode.toString`. Twelve print/paper surfaces and nine export paths were found; the brief's starting list covered eight of them.
- **I cannot print.** Nothing here was confirmed on paper or in a print preview. Every finding is tagged:
  - **VERIFIED** — the defect is fully determined by code I read (e.g. a `color: #fff` on a background-only element with no `print-color-adjust` anywhere in the cascade). The artifact still has not been seen.
  - **PREDICTED** — inferred from the cascade or from documented browser paging behaviour, where a real print could plausibly differ. Each carries a **NEEDS A PRINT TEST** line saying exactly what to print and what to look for.
  - The cartel bug was PREDICTED from the cascade and then confirmed by reading the CSS. That is the same confidence level as the VERIFIED items below — worth remembering that it was still real.
- Severity: 🔴 the artifact is wrong or unusable on paper · 🟠 degraded · 🟡 polish · 🟢 nit.
- Design-token fence: fixes are flagged where they would add an arbitrary Tailwind value. `pnpm lint:tokens` runs a ratchet against `scripts/design-tokens-css-baseline.json`; `chapita-print.css#core` is already grandfathered with 5 `fontBelowFloor` entries (`scripts/design-tokens-css-baseline.json:8-16`).
- **Zero automated print coverage exists.** No test in the repo calls `page.emulateMedia({ media: "print" })` — repo-wide search for `emulateMedia` returns nothing. Every finding below is therefore unguarded against regression.

---

## Surface inventory

| # | Surface | Route | Print CSS | `print-color-adjust` | `@page` | Break control |
|---|---|---|---|---|---|---|
| 1 | Lost-pet poster | `/mis-mascotas/[t]/cartel` | `cartel-print.css` | ✅ scoped | ✅ mounted `<style>` | — (single page by design) |
| 2 | Chapita QR sheet | `/mis-mascotas/[t]/chapita` | `chapita-print.css` | ❌ | ⚠️ in route CSS | ❌ |
| 3 | Pet detail / libreta tab | `/mis-mascotas/[t]?tab=libreta` | `libreta-print.css` | ❌ | ❌ | partial (`li` only) |
| 4 | Libreta export doc | `/api/mis-mascotas/[t]/libreta-export` | inline `<style>` | ❌ | ❌ | `.section` only |
| 5 | Shared libreta (vet) | `/libreta/compartir/[shareToken]` | ❌ **none** | ❌ | ❌ | ❌ |
| 6 | Public credential | `/p/[publicToken]` | ❌ **none** | ❌ | ❌ | ❌ |
| 7 | Maltrato expediente | `/gob/maltrato/[id]` | `expediente-print.css` | ❌ | ❌ | ✅ |
| 8 | Panorama informe | `/gob/panorama` | inline `PRINT_CSS` | ❌ | ❌ | ❌ |
| 9 | Denuncia comprobante | `/denuncias/codigo/[code]` | inline `<style>` | n/a (forces mono) | ❌ | ❌ |
| 10 | Service-dog credential | `/mis-mascotas/[t]/asistencia/presentar` | ❌ **none** | ❌ | ❌ | ❌ |
| 11 | Turno check-in QR | `/mis-turnos/[appointmentToken]` | ❌ none | ❌ | ❌ | ❌ |
| 12 | Data exports (CSV/PDF) | 9 routes | n/a | n/a | n/a | n/a |

`app/globals.css` contains **no `@media print` block at all** (verified: zero matches). There is no app-wide print baseline — the AppShell, rails, tab bars and toasts are never hidden globally; each surface reinvents its own hiding rule, in four mutually incompatible conventions (see 🟡-3).

---

## 🔴 Findings

### 🔴-1 · The operator shell clips the printed expediente to roughly one page

**PREDICTED** (cascade VERIFIED, output not seen).

`/gob/maltrato/[id]` renders inside `OperatorShell`, which is a viewport-locked, clipped box:

- `components/layout/AppShell.tsx:156` — `fixed inset-0 flex flex-col overflow-hidden`
- `components/layout/AppShell.tsx:166` — `flex min-h-0 flex-1 overflow-hidden`
- `components/layout/AppShell.tsx:171` — `<main> … overflow-hidden`
- `components/layout/AppShell.tsx:174` — `min-h-0 flex-1 overflow-auto` (the real scroller; page content lives here)

`expediente-print.css:33-38` tries to escape the shell:

```css
.expediente-print-root {
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
```

That escape does not work. `position: absolute` resolves against the *nearest positioned ancestor*, and `.op-surface` at `AppShell.tsx:156` is `position: fixed` — a positioned ancestor. So the print root stays inside a viewport-height box with `overflow: hidden`. Crucially, `body * { visibility: hidden }` at `expediente-print.css:24-26` does **not** help: `visibility` does not affect layout or overflow, so all four clipping containers remain in force during print.

A real expediente is far taller than one viewport: description card, subject, location, evidence list, derivation, MPF export card, timeline, normativa, plus a print-only footer (`app/gob/maltrato/[id]/page.tsx:277-622`). The expected artifact is page 1 and nothing else — a case file that silently loses its own timeline. For a Ley 14.346 instrument that is worse than an obviously broken output, because the operator has no way to tell.

**NEEDS A PRINT TEST.** Open a maltrato case with at least 6 timeline entries and 2 attachments, click "Imprimir", and count the pages in the preview. Expected defect: exactly one page, cut mid-card, with the print-only footer (`page.tsx:618-621`) absent. If you see the footer, the clipping is not happening and this finding downgrades.

**Fix direction.** The print sheet must neutralise the shell, not tunnel out of it: inside `@media print`, set `.op-surface { position: static !important; overflow: visible !important; height: auto !important; }` and the same for `AppShell.tsx:166/171/174`, then drop the `position: absolute` from `.expediente-print-root`. That needs a stable hook on the two unnamed inner divs. No arbitrary Tailwind values involved; token fence unaffected.

---

### 🔴-2 · The Panorama informe is clipped by the same shell

**PREDICTED** (cascade VERIFIED).

`components/panorama/PanoramaInformeSituacion.tsx:42-51` uses the identical recipe:

```css
[data-panorama-informe] {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
```

`/gob/panorama` is an operator route, so the same `.op-surface` at `AppShell.tsx:156` traps it. The informe is unambiguously multi-page: header, KPI grid, ranking table, layers, method notes, k-anon disclosure, reproducible URL, and a `break-all` scope JSON blob (`PanoramaInformeSituacion.tsx:70-233`). Its whole purpose is to be a hand-off artifact that justifies a decision — truncated at the KPI grid it loses the ranking, the method notes and the k-anon disclosure, i.e. exactly the honesty content the component's own header comment (lines 20-22) says is "never dropped".

Additionally: `PRINT_CSS` has no `break-inside` rule anywhere, so even once the clipping is fixed the KPI list items and ranking rows can split across pages.

**NEEDS A PRINT TEST.** On `/gob/panorama`, pick a view with a ranking of ≥ 10 rows, generate the informe, and check the preview for the "Acerca de las métricas" footer block. Expected defect: one page, footer missing.

---

### 🔴-3 · `/p/[publicToken]` prints the lost-pet state as white-on-white — the cartel bug, on the surface people print most

**VERIFIED** in the cascade; artifact PREDICTED.

The public credential page has **no print stylesheet at all** — no `*-print.css` under `app/(public)/p/`, no inline `@media print`, and no `@media print` block in `app/globals.css`. So `print-color-adjust` is at its `economy` default everywhere on that page.

`app/globals.css:3552-3557`:

```css
/* Perdida is solid (urgent, white-on-red); the rest are quiet tinted chips. */
.pc-cred[data-situation="perdida"] .pc-sit-chip {
  background: var(--color-ln-err);
  border-color: var(--color-ln-err);
  color: #fff;
}
```

That is structurally identical to the poster's headline banner: a coloured background carrying white text, with nothing forcing colour retention. On paper the background drops and `PERDIDA` prints white on white. The chip is the *single textual carrier* of the situation on this surface — `globals.css:3593-3596` records that the separate `.ln-sit` status line was deliberately removed in favour of it. Everything else about the state is colour-only and also drops:

- `.pc-strip` — the masthead colour strip, background-only (`globals.css:3461-3483`)
- `.pc-head` — the per-situation header tint, background-only (`globals.css:3486-3501`)
- `.pc-dot` — a `background` + `box-shadow` ring, decorative but the only remaining visual state cue (`globals.css:3576-3591`)

Net result: a printed credential for a lost pet is indistinguishable from a printed credential for a healthy one. This matters more than the cartel case because `/p/` is the QR target — the page a finder lands on and the page owners print as the pet's document.

Note the same drop applies to `custodia-oficial`, `observacion-antirrabica` and `fallecida`, but those chips use *dark text on a light tint* (`globals.css:3558-3572`), so they degrade to unstyled dark text rather than vanishing. Only `perdida` is fatal.

**NEEDS A PRINT TEST.** Print `/p/<token>` for a pet marked lost, with Chrome's "Background graphics" left OFF (the default). Look for the `PERDIDA` chip. Expected defect: blank space where the chip is.

**Fix direction.** A route-scoped print sheet for `/p/`, following the cartel's now-correct pattern: `print-color-adjust: exact` scoped to the credential root, `.pc-sit-chip` given a printed border + dark text fallback, action bar and links hidden, and an `@page` injected from a mounted component rather than a route CSS file (see 🟠-2). Token fence: unaffected if done in `globals.css` with existing `--color-ln-*` tokens.

---

### 🔴-4 · `/gob/analytics/export` bypasses the k-anonymity suppression enforced on every screen

**VERIFIED.**

Aggregate dashboards enforce k=5 via `suppressSmallCells` / `complementarySuppress` (`lib/metrics/anonymity.ts:19,55,138`), and the four aggregate CSV exports correctly reuse the already-suppressed result — `app/gob/poblacion/export/route.ts:122-136`, `app/gob/censo/export/route.ts:108-111`, `app/gob/campanas/export/route.ts:92-100`. Good parity.

`app/gob/analytics/export/actions.ts` does not. It applies field-level allow-listing only (`anonymizeRows`, `lib/analytics/govt-exports.ts:87-106`) and never any cell- or row-count floor. The fetchers behind it (`lib/analytics/dashboards/exports.ts:37-232`) return raw per-entity rows carrying `publicToken` plus exact `jurisdictionProvince` / `jurisdictionLocality` plus `species` / `caseKind` plus a month bucket. An operator can filter to a small locality and pull individual `publicToken` rows describing a fact that `/gob/censo` renders as `SUPPRESSED_CELL_TEXT` for the same locality and month.

This is architectural, not a missed line: the export operates one level below where the suppression primitive is designed to apply. It is included in a *print* audit because it is the same failure mode — an artifact that leaves the product and is never reviewed again.

---

## 🟠 Findings

### 🟠-1 · The owner-side credential face prints its band chrome white-on-white

**VERIFIED** in the cascade.

`/mis-mascotas/[t]` loads `libreta-print.css` (imported at `components/pet-profile/PetDetailTabsPanel.tsx:39`), which sets `html, body { background: white; color: black }` but **no `print-color-adjust`** (`libreta-print.css:1-18`). Descendants with their own colour win over the `body` rule:

- `app/globals.css:3095-3110` — `.ln-band`, a gradient-only background
- `app/globals.css:3127` — `.ln-band-title { color: rgba(255,255,255,0.9) }`
- `app/globals.css:3134` — `.ln-band-title small { color: rgba(255,255,255,0.6) }`
- `app/globals.css:3441` — `.ln-band-chip { color: #fff }` on `background: rgba(0,0,0,0.22)`

The band title ("LIBRETA SANITARIA" / "CREDENCIAL") and the situation chip both print invisible. `.ln-turn` (`globals.css:3141-3151`, also `color: #fff`) is a button and *is* correctly hidden by `libreta-print.css:14-17`.

Degraded rather than 🔴 because the designed print path for this data is the separate libreta-export document, not Ctrl+P on the tab.

### 🟠-2 · `chapita-print.css` leaks unscoped rules and an `@page` across client-side navigation

**PREDICTED.**

`cartel-print.css:1-3` documents the discipline: the `@page` rule is injected from a mounted `<style>` in `PosterPreview.tsx:82-84` specifically so client-side navigation removes it. `chapita-print.css` breaks that discipline in two ways, from a route CSS file that Next.js keeps loaded for the rest of the SPA session:

- `chapita-print.css:29-32` — `@page { size: A4 portrait; margin: 8mm; }`. Once `/chapita` has been visited, this competes with the cartel's mounted `@page { margin: 1cm }` on every later print in the same session.
- `chapita-print.css:10-13` — `header, nav, aside, .chapita-no-print { display: none !important; }`. Unscoped *element* selectors. After visiting `/chapita`, any later-printed route loses every `<header>`, `<nav>` and `<aside>`. That is not hypothetical chrome: the denuncia comprobante's identity block is a `<header>` carrying the H1 and the reference code (`app/(public)/denuncias/codigo/[code]/page.tsx:232-249`), and the Panorama informe's title/period/scope block is a `<header>` too (`PanoramaInformeSituacion.tsx:73-90`).

**NEEDS A PRINT TEST.** In one browser session: visit `/mis-mascotas/<t>/chapita`, then navigate (client-side, no reload) to `/denuncias/codigo/<code>` and print. Look for the H1 + reference code. Expected defect: header block missing. If it is present, Next.js is unloading the stylesheet and this downgrades to 🟡.

**Fix direction.** Scope both rules under `.chapita-sheet` / a `[data-chapita]` root, and move the `@page` into a mounted `<style>` in `ChapitaSheet.tsx` exactly as `PosterPreview.tsx:84` does.

### 🟠-3 · The shared libreta (the vet-facing surface) has no print stylesheet

**VERIFIED.**

`app/libreta/compartir/[shareToken]/page.tsx` marks three chrome blocks `print:hidden` (lines 180, 194, 201) but imports no print CSS — the grep for `libreta-print.css` importers returns only `PetDetailTabsPanel.tsx:39`. So on this route there is no `button, a[href] { display: none }`, no forced white background, and no page-break control on the grouped event lists (`page.tsx:169`). A vet printing a shared libreta gets the landing shell's nav and every link rendered as paper furniture, and event groups split mid-entry.

This is the one libreta surface actually designed to be handed to a third party, and it is the least print-prepared of the three.

### 🟠-4 · The poster's "información adicional" field clips to two rows on paper

**VERIFIED.**

`app/(app)/mis-mascotas/[publicToken]/cartel/PosterPreview.tsx:229-237` renders the owner's free text in a `<textarea rows={2} className="… resize-none …">`. A textarea prints only its visible box; overflow scrolls, and scrolled content does not print. An owner typing four lines of "última vez visto cerca de …" gets two lines on the poster and no indication the rest was dropped.

The field is `print-color-adjust: exact`-covered and not hidden (correctly — it is content, unlike `expediente-print.css:50` which hides textareas because there they are form controls). The defect is purely the fixed height.

**Fix direction.** Auto-grow the textarea on input, or render the value into a sibling `<p>` that is `print:block` while the textarea is `print:hidden`. Token fence: unaffected.

### 🟠-5 · QR quiet zones are below the 4-module standard on both printed QR surfaces

**PREDICTED.**

The QR spec requires a 4-module quiet zone. Both printed QRs generate with less and rely on container padding to make it up:

- Cartel: `app/(app)/mis-mascotas/[publicToken]/cartel/page.tsx:99-104` — `margin: 1` (one module), `width: 180`. Rendered into `w-36 h-36 p-1` with a 1px border at `PosterPreview.tsx:218-224`. At ~38 mm across ~25 modules the module pitch is ~1.5 mm, so 4 modules ≈ 6 mm of quiet zone are needed; actual is ~1.5 mm generated + ~1 mm padding, and a visible border sits at the edge of it.
- Chapita: `app/(app)/mis-mascotas/[publicToken]/chapita/page.tsx:59-63` — `margin: 0`, i.e. **no generated quiet zone at all**. The only clearance is the container padding: `p-[2.5mm]` on the Ø30 mm circle and the 50×30 mm tag, `p-[4mm]` on the wallet card (`ChapitaSheet.tsx:51,61,76`). On the circle format the dashed cut line (`chapita-print.css:55`, `0.4mm dashed`) sits 2.5 mm from the QR edge — a dark line *inside* the quiet zone. On the tag format, `gap-[2.5mm]` puts the pet name 2.5 mm from the QR's right edge.

Modern phone decoders tolerate reduced quiet zones, which is why this is 🟠 and not 🔴 — but this is the product's core promise (scan the tag, find the family) on a physical artifact that cannot be patched after it is laminated.

**NEEDS A PRINT TEST.** Print `/chapita` at 100 % (no fit-to-page) on a normal office laser, cut out all three formats, and scan each with two different phones at ~15 cm in poor indoor light. Also try the circle with the cut made *on* the dashed line (worst case) rather than outside it.

**Good news, VERIFIED:** the QR ink itself is safe from the colour-dropout class of bug. `qrcode`'s SVG output paints with SVG `fill`/`stroke` presentation attributes, which `print-color-adjust: economy` does not touch — unlike a CSS `background`. And the cartel's grayscale mode (`print:grayscale` at `PosterPreview.tsx:137`) is a no-op on already-black modules. No QR in this codebase is at risk from colour or filter rules.

### 🟠-6 · The libreta export document can push a whole page blank

**PREDICTED.**

`app/api/mis-mascotas/[publicToken]/libreta-export/route.ts:245` and `:311` both set `page-break-inside: avoid` on `.section`. A section is a full event group — for a pet with a long vaccination history that group is taller than a page. When an unbreakable box exceeds the page box, browsers push it to a fresh page and *then* break it anyway, leaving the preceding page largely blank. There is no `break-inside` on `tr`, so rows split arbitrarily once that happens.

**NEEDS A PRINT TEST.** Export the libreta of a pet with ≥ 30 vaccination events and look for a page that ends early with a large blank region.

**Fix direction.** Move the rule from `.section` to `tr` (`break-inside: avoid`) and keep `break-after: avoid` on `.section-title` so a heading never orphans at a page foot.

### 🟠-7 · The service-dog credential has no print handling

**VERIFIED.**

`app/(app)/mis-mascotas/[publicToken]/asistencia/presentar/page.tsx` is literally the "present this credential" surface (Ley 26.858) and has no print stylesheet. Its identity signal is a colour ring — `ring-4 ring-[var(--color-ln-ok)]` on the photo, lines 96 and 99. `ring` compiles to a `box-shadow`, which Chrome does print, but the `bg-[var(--color-ln-ok-050)]` placeholder fill at line 99 is a background and drops. The "← Volver" link (line 70-75) prints as paper furniture, and `min-h-screen` at line 67 forces at least one full page height.

Lower than 🔴 because the designed flow is showing a phone screen, not paper — but a credential surface with a "presentar" name will be printed by someone.

### 🟠-8 · CSV formula injection is unmitigated across every builder

**VERIFIED.** Relayed from the export sweep.

No CSV builder in the repo neutralises a leading `=`, `+`, `-` or `@`. All five do RFC-4180 quote/comma/newline escaping only: `lib/open-data/serialize.ts:28-34`, `lib/analytics/govt-exports.ts:125-132`, `app/gob/outreach/export/route.ts:28-35`, `lib/ui/csv-export.ts:38-40`, `components/panorama/MapDataTable.tsx:82-84`.

Real exposure: `outreach/export` emits free-text `petName`, `vetLabel`, `clinic` (`route.ts:111-136`); `CsvExportLink` is wired to seven operator queues carrying free-text case and observation descriptions (`app/gob/maltrato/MaltratoQueueScreen.tsx`, `app/gob/casos/CasosScreen.tsx`, `app/gob/moderacion/ModeracionQueueScreen.tsx`, `app/gob/perdidas/page.tsx`, `app/gob/vigilancia/page.tsx`, `app/admin/casos/page.tsx`, `app/admin/observaciones/page.tsx`). A pet name typed as a formula executes when a funcionario opens the file.

### 🟠-9 · Two live CSV builders omit the UTF-8 BOM, so Excel mangles es-AR text

**VERIFIED.** Relayed from the export sweep.

Every server-rendered CSV prepends a BOM — `lib/open-data/serialize.ts:72`, `lib/analytics/govt-dashboard-export.ts:30`, `app/gob/outreach/export/route.ts:42`, `lib/analytics/senasa-export.ts:188`. The two client-side blob builders do not: `lib/ui/csv-export.ts:64-74` and `components/panorama/MapDataTable.tsx:106-122`. Both carry accented case descriptions and locality names, and both deliver via `Blob` + `<a download>` straight into Excel on Windows, which without the BOM falls back to the system codepage and corrupts á/é/í/ó/ú/ñ.

---

## 🟡 Findings

### 🟡-1 · `libreta-print.css` is the weakest of the four sheets

`app/(app)/mis-mascotas/[publicToken]/libreta/libreta-print.css` (18 lines total) has no `print-color-adjust`, no `.no-print` equivalent, no `@page`, and page-break control only on `li` (line 8) — nothing for the libreta's tables or cards. Compare `expediente-print.css:55-61`, which covers both direct children and `li`. Since this sheet is loaded on the main pet detail page (`PetDetailTabsPanel.tsx:39`), it is the most-loaded print sheet in the product and the least complete.

### 🟡-2 · Sub-9pt type on paper

Ranked by how likely the reader is to need it:

- `libreta-export/route.ts:301-304` — footer at `7.5pt` in `#a0aec0`. That is ~2.2:1 on white, well below WCAG AA, on the line that carries the generation timestamp and the "documento no persistido" disclosure. Worst offender: too small *and* too light. **VERIFIED.**
- `libreta-export/route.ts:269-270` — table headers at `8pt` in `#718096`.
- `app/globals.css:3512` — `.pc-sit-chip` at `9px` (~6.8pt), the situation carrier on `/p/`.
- `app/(public)/denuncias/codigo/[code]/page.tsx:252,262` — status and severity badges at `9.5px` (~7.1pt) on the official receipt.
- `app/globals.css:3677` — `.ln-qr-cap` at `8px`, the "escaneá" instruction under the credential QR.
- `chapita-print.css:74,80,86,91,105,110` — `7px`/`8px`. **Deliberate and defensible**: these are millimetre-scale cut-outs and the file says so at lines 68-70. Already grandfathered in the fence (`scripts/design-tokens-css-baseline.json:11`, `fontBelowFloor: 5`).

Raising any of the first five is a token-scale change, not an arbitrary Tailwind value — fence unaffected. Note that fixing `chapita-print.css` would *lower* its baseline, which the ratchet permits.

### 🟡-3 · Four incompatible "do not print this" conventions, and no baseline

`.no-print` (`cartel-print.css:27`) · `.chapita-no-print` (`chapita-print.css:13`) · `[data-print-hide]` (`denuncias/codigo/[code]/page.tsx:198`) · the `print:hidden` Tailwind variant (10 files). Plus three different region-isolation idioms: element hiding (cartel), `visibility` flip (`expediente-print.css:24-31`), and `body > *:not(...)` (`denuncias/codigo/[code]/page.tsx:197`).

Consequence: a new print surface has no obvious right answer to copy, and 🔴-1 / 🔴-2 show that copying the *wrong* one (the `visibility` + `position: absolute` recipe) reproduces a page-truncation bug. A single `@media print` baseline in `app/globals.css` — neutralising `.op-surface`, hiding the rails/tab bars/toasts, and defining one canonical `.no-print` — would remove the whole class.

### 🟡-4 · `.print-bw` is dead code

`cartel-print.css:36-40` defines `.print-bw *` and its comment says the class is "toggled by the B&W button adding class `.print-bw` to `<body>`". Nothing adds it — `PosterPreview.tsx:137` implements grayscale with the `print:grayscale` Tailwind variant instead. The rule is inert. The comment is actively misleading for the next reader who tries to extend B&W mode to a sibling surface.

### 🟡-5 · The comprobante's print block is the most robust in the codebase, and nobody reused it

`app/(public)/denuncias/codigo/[code]/page.tsx:196-200` forces `color: #000`, `background: #fff` and `border-color: #ccc` on the print root **and all descendants**. That sidesteps the entire colour-dropout class by refusing to depend on backgrounds at all — the coloured status/severity badges degrade to plain outlined text rather than vanishing. It is a legitimately different and safer strategy than `print-color-adjust: exact`, and it is used on exactly one surface. Worth a decision: pick one strategy per surface type (dense operator documents → force mono; the poster and credential → force exact) and write it down.

### 🟡-6 · Decimal comma on screen, decimal point in the CSV

**VERIFIED.** Dashboards render via `formatPercent`/`formatRate` (`lib/utils/format.ts:1281-1304`) producing `"72,5%"` (`app/gob/poblacion/PoblacionScreen.tsx:201`), while the matching export emits the raw number: `app/gob/poblacion/export/route.ts:134`, `app/gob/campanas/export/route.ts:76,88`, `app/gob/adopciones/export/route.ts:82`. Not corrupting — the delimiter is `,` and the values contain none — just a fidelity gap between what an operator reads and what they file.

`lib/open-data/datasets.ts:484` also emits decimal points, and there it is **correct**: a public machine-readable CSV with a `,` delimiter must not use decimal commas. Do not "fix" that one.

*(Checked and clean, VERIFIED: `MapDataTable`'s `value`/`gap` fields DO carry es-AR strings with embedded commas — `components/panorama/MapDataTable.tsx:32-43` — but `csvField` at lines 82-84 quotes anything matching `/[",\n]/`, so no column shift. Same for `SUPPRESSED_MARKER` at `lib/open-data/serialize.ts:30`.)*

### 🟡-7 · `senasa-export.ts` is unwired

`lib/analytics/senasa-export.ts` and `senasa-export-query.ts` have no route, action or component referencing them. Correctly isolated pure core, currently unreachable — flagged so nobody assumes the SENASA path exists.

---

## 🟢 Nits

- **🟢-1** `/mis-turnos/[appointmentToken]` generates a check-in QR (`page.tsx:86-93`) with no print handling. Target is `mimar://appointment/…`, a deep link — printing it is meaningless, so this is correct by omission. Noted only so a future sweep does not re-flag it.
- **🟢-2** Format honesty is clean across the board, **VERIFIED**: `lib/analytics/welfare-exports.ts:849` and `lib/analytics/travel-exports.ts:255` both declare `application/pdf` and both genuinely emit `pdf-lib` bytes (`generateWelfareMpfPdf`, `generateTravelExportPdf`). `Content-Disposition` filenames are all closed-enum or date-derived — no header injection (`app/(public)/transparencia/datos/[dataset]/route.ts:107` and the four `/gob/*/export` routes). And `libreta-export/route.ts:11-15,337-339` explicitly refuses to claim a `.pdf` filename for HTML, with the reasoning written down — the one surface that could have lied and doesn't. `ExportLibretaButton.tsx:28` labels it "Imprimir libreta (PDF)", which is honest about the browser print-to-PDF path.

---

## Severity count

| | Count |
|---|---|
| 🔴 | 4 |
| 🟠 | 9 |
| 🟡 | 7 |
| 🟢 | 2 |

---

## Suggested order of work

1. **Print two things first** (below) to confirm 🔴-1 and 🔴-3 before writing any CSS.
2. Add the `@media print` baseline to `app/globals.css` — neutralise `.op-surface`, hide rails/tab bars/toasts, define one `.no-print`. That is the shared root of 🔴-1, 🔴-2, 🟠-3, 🟠-7 and 🟡-3.
3. Route-scoped print sheet for `/p/[publicToken]` (🔴-3).
4. Scope `chapita-print.css` and move its `@page` into a mounted `<style>` (🟠-2).
5. Add a Playwright spec using `page.emulateMedia({ media: "print" })` that asserts, for each surface, that the state-carrying element has a computed colour distinguishable from its background. Nothing above is currently guarded.
6. Export fixes: k-anon floor on `/gob/analytics/export` (🔴-4), formula-injection neutralisation in the five builders (🟠-8), BOM on the two blob builders (🟠-9).
