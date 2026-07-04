# Handoff to Claude Code — Round 2 QA (fix-verification + write-flows)

## Context
Round 2 of the manual QA clickthrough, run against the "+20 commits" build on localhost:3000 (2026-07-03). This pass verified the round-1 fixes, then exercised the onboarding + write-flows that round 1 skipped — including full end-to-end submits (pet create, weight, **lost→found**, **vacuna**, **mordedura**, **denuncia**). Full detail: **`critique-round2-2026-07-03.md`** (this folder). Read that first.

## What's confirmed FIXED ✅ (don't re-touch, avoid regressions)
- Audit-log `×N` collapse (`/admin/auditoria`) — consecutive identical actions grouped with count + time range + expand. Excellent.
- Scannable admin consoles — `/admin/govts` now has search + status filters (Todos/Activos/Sin localidades/Desactivados).
- `/admin/reglas` business-rules cascade console — works (país→provincia→localidad, 8 rule types).
- Neutral **REGISTRADA** chip on the pet **detail header** (0/3 pet no longer falsely "AL DÍA").
- New-pet SuccessScreen (instant QR credential), natural-language event matcher, INDEC/Nominatim autocompletes.
- **Adoptions LIST** (`/org/DIM-TC7Z-APW6/adopciones`) renders the 2 applications on all tabs.
- Maltrato label unified in nav (was 3 names).
- All write-flows submit: denuncia (`DEN-TF4N-4PJW`), mordedura (case `CAS-3KRJ-433G` + 10-day observation), vacuna, lost→found.

## Fix / verify — priority order

**0. 🔴🔴 Lost-pet public credential: the full-bleed photo blocks ALL finder CTAs (CONFIRMED, North-Star-breaking).**
On `/p/[token]` for a pet **that has an uploaded photo** (e.g. Michi `/p/DIM-4SUZ-U2HT`), the photo renders as `<img class="object-cover">` at `position:absolute`, full-viewport (≈1409×751 at 0,0), `z-index:auto`, **`pointer-events:auto`** — stacked **on top of** the credential content. Verified via `document.elementFromPoint` at each CTA center: the three finder actions — **"📞 Llamar a Lucía" (`tel:`), "📍 La tengo conmigo" (`/encontre`), "👀 La vi cerca de acá" (`/sighting`)** — all return the IMG as the top element (`clickReachesLink:false`, `blockedByImageOrCanvas:true`). So a finder who scans the QR **cannot tap any contact/return action**. This breaks the reunification loop for essentially every real (photographed) lost pet, and is worst on mobile (where QR scans happen). It was missed in our passes because our test pet had no photo. **Fix:** put the CTAs/content above the image in the stacking context (z-index) and/or set `pointer-events:none` on the background photo layer (and constrain it so it doesn't overlay the interactive area). Verify by re-running the elementFromPoint check on a photographed lost pet. *(Credit: external Codex pass surfaced this; confirmed here.)*

**1. 🔴 Adoptions DETAIL still crashes (the round-1 fix is PARTIAL).**
`/org/DIM-TC7Z-APW6/adopciones/<applicationId>` throws the Server-Components error boundary ("Algo salió mal", **código 3025710647**). The list renders now, but **opening a postulación to approve/reject crashes** — the review workflow is still broken. Same data-dependent-render class as the original bug, moved down one level. Reproduce by opening either pending application (→ Coco / → Negro) on the Refugio. **Highest priority.**

**2. 🟡 Mutations freeze the main thread on the map-heavy pet page.**
On `/mis-mascotas/[token]`: the "Registrar peso" slide-over sheet spun ~8s (event persisted); "✓ Marcar encontrado" **froze the click dispatch** (`Input.dispatchMouseEvent` timeout) twice before recovering. Full-page wizards (lost, vacuna, mordedura) are fine — the freeze is specific to that page. Strongly correlated with →

**3. 🟡 maplibre console error (govt/admin maps).**
`layers.regions-fill.paint.fill-color[4][5]: Input/output pairs for "interpolate" expressions must be arranged with input values in strictly ascending order.` Sort the choropleth `fill-color` interpolate stops ascending. Affects panorama/vigilancia/analytics region layers and is a likely cause of the main-thread stalls.

**4. 🟡 REGISTRADA fix is incomplete across surfaces.**
Detail header = "REGISTRADA" (fixed), but `/inicio` + `/mis-mascotas` **list** rows show the same 0/3 pet as green **"AL DÍA"**, and the `/inicio` sidebar shows it as **"1 PENDIENTE"** — three truths, one pet, one screen. Drive all three from the one compliance selector.

**5. 🟡 Compliance vs vaccination-status double-standard.**
Owner-declared antirrábica → "DECLARADA · SIN VERIFICAR", correctly not counting toward "0 DE 3 AL DÍA" (good). But "ESTADO DE VACUNACIÓN" then shows "1 AL DÍA / 2 POR VENCER" on the same page. Reconcile so the two panels don't contradict.

**6. 🟡 English validation on Spanish forms.**
Native HTML5 `required` surfaces "Please fill out this field." (e.g. new-pet form). Replace with localized messages; likely repo-wide.

**7. 🟢 Minor polish.**
- Adoption list count typo "2 postulaci**ó**nes" → "postulaciones".
- Maltrato page **H1** still "Investigaciones de maltrato" (nav is unified; align the H1).
- Lost-pet wizard: step 2/3 subtitle still shows step 1's location copy (static subtitle).
- New-pet form "Paso 1 de 1"; Localidad says "Requerido" but has no `*`.
- `/admin/reglas` uses ASCII `->` not `→`; rule defaults render as raw truncated JSON.
- "PRÓXIMO 💉 Refuerzo antirrábica · 3 jul 2027" tagged "— HOY —".
- New-pet form doesn't capture `acquisition_method` (AGENTS says `pet_registered` tracks it for EAH analytics) — confirm where it's captured, else `/gob/analytics` acquisition mix is seed-only.

## Repro setup
- Accounts (pw `Test1234!`): `owner@`, `alejo@` (admin of all 4 orgs), `admin@`, `govt@`, `lilian@`.
- Org tokens: Refugio `DIM-TC7Z-APW6` · Clínica `DIM-6TZM-DUJZ` · Rescate `DIM-KN7W-JTB8` · Autoridad `DIM-PWZR-B75C`.
- Test artifacts: pet `DIM-BAFX-B7VF` (owner@, open bite case `CAS-3KRJ-433G`), denuncia `DEN-TF4N-4PJW`.

## Not yet QA'd (open test-debt for a round 3)
Vet-upgrade onboarding (`/cuenta/upgrade` → govt approval → `/cuenta/crear-consultorio`); govt surfaces `/gob/usuarios·perdidas·decomisos·disputas·programa`; KPI-reconciliation (antirrábica 42 vs 54) + coverage-label taste-check; adoption-application submit (public side); death/disposition + data-rights; Tier 0+/Tier-2 toggles; and the **owner app-mode mobile** pass.

## Working rules for these fixes
Verify each against the code before patching; treat seed/test-data noise (duplicate accounts, future dates, junk names) as data unless the render logic is wrong. Add/adjust tests where coverage exists (`pnpm test`, `pnpm e2e`, `lint:authz`/`lint:rls`). No side-effectful submits were left un-verified — where a flow persisted despite a UI hang, it's noted.
