# Run autónomo 2026-07-21 (overnight, PO away) — bloques 0→5

> PO approved autonomous execution of blocks 0–5 including all polish + reviews.
> Panorama (block 4) = PLAN ONLY for tomorrow, not code. Foster (P1) NOT
> confirmed in demo narrative → stays deferred (default when unanswered).
> Source backlog: docs/reviews/results/2026-07-19-run-nocturno-backlog.md.
>
> Discipline per commit: verify item isn't already done → sonnet writer →
> fresh adversarial review (esp. legal/security items) → pnpm verify (minus
> `build`, which needs local Supabase up + clobbers :3000) + targeted tests →
> work-unit commit (conventional, no AI attribution). Stop only for a real PO fork.

## Status

| Block | Item | Status |
|---|---|---|
| 0 | Pet-by-token destination + re-wire omnibox pet search | ✅ `d6e81b75` |
| 1 | Honestidad H1/H2/H3/H5/H6/H7 | ✅ pre-done `004ed43f` + H7 test `b945412c` |
| 5 | Roadmap-10 Fase 1: scope fence + KPI↔list parity harness | ✅ `ee248de6` |
| 2 | A11y/usabilidad V1/V2/V3/V6/V10 pre-done; V9 UUID→combobox | ✅ V9 `a41f859e`; rest pre-done |
| 3 | F1 deltaV2 (done-by-exclusion) + F2 historial/decomisos + #26 drift | ✅ `352808b7`/`49823254`/`b7df5d05`/`1b0bfda0`/`fbfd89c8` |
| 4 | Panorama button/element rethink — PLAN DOC | ✅ 2026-07-21-panorama-controls-plan.md |

## Decisions locked this run
- Pet-by-token: reuse `PetSubView` (presentational, `{pet: GobPetSubView}`) in new
  routes `/gob/mascotas/[token]` + `/admin/mascotas/[token]`, gated by a NEW
  jurisdiction-only loader (mirror `petJurisdictionScope`), NOT the linking-case
  gate. Component reuse confirmed clean.
- Foster (P1): deferred (not confirmed in demo).
- Post-demo untouched: roadmap-10 Fases 2/3/4, PF1, Fase C saved views, cutover #760.

## Audit finding (KEY): 2026-07-19 nocturno backlog was LARGELY pre-executed
Commits `004ed43f` (H3/H5/H6/H7/V10), `c5994e62` (V1 inert sweep, 10 wizards),
`aafe34e2` (V9 decomiso combobox). Already DONE: H1 H2 H3 H5 H6 H7, V1 V2 V3 V6 V10.
Verify-before-build saved several redundant writers.

### Genuinely OPEN (this run's real work)
- V9 dispute side — `AddPartyForm` still raw-UUID (only a verify step); upgrade to
  the `ReasignarButton` combobox pattern. quick.
- F1 deltaV2 — 4/9 done (mortalidad, adopciones, vigilancia, poblacion + admin twins).
  OPEN: censo, programa, maltrato, analytics (+ admin/censo, admin/programa).
  CAVEAT: maltrato is period-AGNOSTIC now (H-work removed its period) → deltaV2 may
  not apply honestly there; skip if no period basis.
- F2 — `gob/historial`→shared PeriodPicker; `gob/decomisos` add period param (has
  `daysElapsed` already). OPEN.
- F2 drift (#26) — admin/historial lacks gob/historial's filters; gob/casos lacks
  admin/casos's kind/province + count; admin/outbox↔gob/outbox self-admitted fork
  (extract shared builder). medium each.
- Bloque 5 fences — unchecked, likely open.

## Log
- (start) Committed pre-run: dock redesign `c44878d1`, DNI-hash + omnibox polish `bafff438`.
- Bloque 0 DONE: pet-by-token + jurisdiction destination `d6e81b75`.
- Bloque 1 DONE (pre-existing) + H7 regression test `b945412c`. Supabase now UP.
- F1 deltaV2: DONE by exclusion — remaining 6 screens are all stock/rate/period-agnostic;
  adding a delta would be "trend over snapshot" dishonesty. No commit (correct).
- IN FLIGHT (writer af98b0179): V9 dispute combobox + F2 gob/historial→PeriodPicker +
  gob/decomisos period control.
- NEXT: F2 drift #26 (admin/historial filters, gob/casos kind/province+count, outbox
  shared builder) → Bloque 5 honesty fences → Bloque 4 Panorama plan (for tomorrow).
- V9 combobox `a41f859e`; F2a `352808b7`; F2b `49823254`; authz re-baseline `0a7de629`.
- #26 drift: D1 `b7df5d05`, D2 `1b0bfda0`, D3 `fbfd89c8`.
- Bloque 5 `ee248de6`. Bloque 4 plan doc written (panorama-controls-plan).
- RUN COMPLETE. Nothing pushed (PO/prod-gated). `pnpm build` never run (would clobber :3000).

## Batched PO decisions (all proceeded with a defensible default — confirm/adjust)
1. V9: govt operators see only IN-jurisdiction party candidates; out-of-jurisdiction
   parties are admin-only. Intended tradeoff?
2. F2a gob/historial: default scope shifted unbounded → trailing-12m; custom date
   boundary AR-midnight → UTC-midnight (aligned to the shared PeriodPicker convention).
3. F2b decomisos: bare from/to without period=custom falls back to 12m (pre-existing,
   shared with campanas — not introduced here).
4. #26 D1 admin/historial: default view changed from "own actions, unbounded" to
   "all actors, trailing-12m" (matches universal-scope intent). Confirm.
5. Panorama plan §2 organizing principle + opacity-control placement (in the doc).

## Pre-push checklist (for when PO returns — pushes are PO/prod-gated)
- Run the DB integration suites that needed Supabase: omnibox-search,
  gob-pet-subview-jurisdiction-fence (Bloque 0 wrote them; Supabase is up now).
- Fresh adversarial review over the whole commit range (d6e81b75..HEAD).
- Full `pnpm verify` (incl. build) on a clean tree, then rebuild :3000.
