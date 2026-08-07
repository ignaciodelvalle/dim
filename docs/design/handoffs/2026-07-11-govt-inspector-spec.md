# Govt/Admin master-detail Inspector — ratified build spec (2026-07-11)

PO-ratified design for the `/gob` (then `/admin`) queue inspector. Fixes the root of
the dead-ends in `2026-07-04-gob-journeys-review.md` (lost tab/cursor/scroll on
`← Volver`; no pet drill-down). Build on `/gob/maltrato` FIRST, screenshot-QA, then
extract a shared `<QueueInspectorLayout>`.

## The pattern (synthesis of 3 shipped primitives — minimal new surface)
- **Panel** = `components/panorama/DetailDrawer.tsx` structure, DOWNGRADED modal→non-modal
  side panel (container class + manual focus-restore; keep Esc-to-close + focus mgmt).
- **Selection state** = a `?caso=<welfareReportId>` URL param changed via the shallow-history
  primitive (`lib/ui/sheet-nav.ts` push/close + `openedViaPush` back-vs-replace semantics;
  `lib/ui/map-layer-nav.ts` pushMapStateUrl/replaceMapStateUrl). Same-route pushState →
  the queue's Server Component NEVER re-runs → tab + keyset cursor + scroll are physically
  untouched (they're DOM state in a never-unmounted node). Immune to the Next 15.5 router
  drop bug.
- **Fetch** = `components/panorama/use-keyed-abort.ts` (last-click-wins), reading `?caso=`
  reactively via a new `InspectorMounter` (twin of `SheetMounter.tsx`).

## Layout (desktop-only)
Split INSIDE the maltrato page content slot (AppShell rail/topbar untouched, `app/gob/layout.tsx`):
master list ~40% (own `overflow-y-auto`, KPIs+tabs+facets pinned above) + inspector ~60%
(own scroll; empty-state "Elegí una denuncia para verla acá" when no `?caso=`). Below `lg`:
inspector flips to the existing overlay-drawer behavior (same component, container class only)
— no separate mobile route. **Inspector is TABBED** (Resumen / Línea de tiempo / Acciones /
Export) so actions aren't buried below a scroll. Keep "◹ Abrir en página completa" (the
canonical full-page route `/gob/maltrato/[id]` STAYS as the escape hatch + shareable URL).

## Interaction & state preservation
- Row click: `preventDefault` the existing `<a href="/gob/maltrato/[id]">` (keep it for
  right-click/no-JS) and `pushSelectionUrl(...&caso=<id>)`. First selection = pushState
  (back strips `?caso=` → exact list state restored). Subsequent selection = replaceState
  (back closes the inspector in one press).
- Selected row: `‹sel›` marker (left border + `bg-ln-op-stripe`), same language as the
  hover state (`WelfareDenunciaRow.tsx:69`).
- Preserves: **tab** (`?queue=`), **keyset cursor** (`?cursor=`), **scroll** — selection only
  APPENDS `&caso=`, never rewrites the other params; the list node never remounts.
- a11y: non-modal — focus moves to the inspector close button on open, Esc closes (→ shallow
  back), focus restores to the activated row on close; list stays in tab order throughout.

## New server surface (2 API routes) — PO DECISIONS BAKED IN
1. **`GET /api/gob/maltrato/[id]`** — re-runs `requireAdminOrGovtOrRedirect` +
   `jurisdictionScopeContains` (out-of-scope → 404, never leak existence), returns the case
   detail. **PO-DECIDED: audit the coordinate view ON CASE OPEN (parity with today's
   route-prefetch behavior)** — `logWelfareLocationViewed` fires when the inspector fetches
   the case, exactly as `[id]/page.tsx:145-147` does now. Move the guard + audit VERBATIM
   into the route (do not re-implement loosely).
2. **`GET /api/gob/mascotas/[token]`** — the pet sub-view (`&mascota=<token>`, second level in
   the SAME inspector; "← Volver a la denuncia" pops `mascota`, keeps `caso`). **PO-DECIDED:
   pet reachable ONLY through an in-jurisdiction linking case/report** — the route verifies
   the pet is the subject/primary of a case OR welfare report inside the caller's jurisdiction
   (same `jurisdictionScopeContains` on the linking case's jurisdiction), else 404. **NO
   omnibox pet search, NO pet directory** for govt. Read-only projection: identity, species/
   sex/status, microchip, owner-of-record, open cases (`findOpenCasesForPetWithCodes`,
   `lib/infra/case-queries.ts:357`).

## Reuse (net new = 2 API routes + 1 InspectorMounter + split the detail JSX into a
presentational component + row onClick→shallow-select)
DetailDrawer (panel/a11y), sheet-nav/map-layer-nav (URL state), use-keyed-abort (fetch),
SheetMounter (reactive param), CaseDetailShell (`components/ui/dashboard/CaseDetailShell.tsx` —
header/parties/normativa/tabs, currently UNUSED on maltrato — adopt it), the existing detail
JSX (`app/gob/maltrato/[id]/page.tsx:276-583`), the queue list/KPIs/keyset/UrlTabs/
WelfareDenunciaRow (all kept).

## MPF export gate (folds in here — plan T1)
The MPF export button lives in the inspector's Acciones. Gate it (confirm + reason +
require a non-`open` triage state) — the confirm opens as a nested modal `<dialog>` OVER the
inspector (`ConfirmDialog` is already modal). `MpfExportButton.tsx:20`.

## Rollout
Wave 1: `/gob/maltrato`. Wave 2: extract `<QueueInspectorLayout>` (list slot + `idParam` +
detail-endpoint config) and adopt on `/gob/casos`, `/gob/disputas`, `/gob/cola`,
`/gob/vigilancia/investigaciones` (also kills the dead `?signalId=`), `/admin/moderacion`,
`/admin/cola`.

## Verification
Playwright as `lucas@dim.test` (govt) on :3000: open a case in the inspector (list keeps
tab+cursor+scroll), browse cases (keyed-abort, no stale render), drill to the pet in place,
back-button closes inspector to exact list state, out-of-jurisdiction case/pet → 404,
coord-view audit row written on open. `pnpm verify` + `pnpm test` green + new route/nav tests.
Screenshot QA desktop.
