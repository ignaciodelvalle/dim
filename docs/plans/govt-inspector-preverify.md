# Govt inspector (task #12) — preverify companion (2026-07-12)

> Verified against `integration/all-20260703` @ `aa9de59c` (~60 commits after the spec was
> written). **VERDICT: ADJUST** — 4 items below before build; everything else in
> `docs/design/handoffs/2026-07-11-govt-inspector-spec.md` checks out exactly as written.
> The #12 executor consumes THIS + the ratified spec together.

## The 4 adjustments

1. **Shell (spec improvement — ADOPT):** do NOT hand-downgrade `DetailDrawer`'s native
   `<dialog>` (still modal, `showModal()`, focus-trap — `components/panorama/DetailDrawer.tsx:736-816`).
   The v3 rail already solved this exact problem: **`RailPanel`** (`components/panorama/PanoramaRail.tsx:156-195`,
   focus/Esc/outside-click logic at `:70-89`) is the non-modal floating shell, and its docblock
   explicitly documents rejecting the DetailDrawer `<dialog>` as modal. Reuse/extract that
   a11y logic for the inspector panel.
2. **Correction:** drop/re-scope the "`/gob/vigilancia/investigaciones` — also kills the dead
   `?signalId=`" claim. That param is NOT on this route and is NOT dead elsewhere (`signalId`
   lives on `/gob/vigilancia/brotes` as a live deep-link scroll target and on
   `investigaciones/nuevo` as prefill). This target also has NO pagination (flat ≤90-day list,
   no keyset) — wave-2 adoption needs pagination added first or a re-scope.
3. **Correction:** `/admin/moderacion` IS keyset-cursor (`decodeCursor`/`keysetWhere`,
   `app/admin/moderacion/page.tsx:85-90,111-115`) but renders a bespoke `<ul>`, not
   CaseQueue/OutboxTable/BulkApprovalQueueList — bespoke row wiring needed there.
4. **Addition:** fold **`/gob/moderacion` (+ `/[id]`)** into the wave-2 rollout — shipped
   2026-07-10 (after the spec's inventory), structural sibling of `/admin/moderacion`
   (same `buildModerationQueueConditions` pattern).

## Verified-exact anchors (no drift)

- Audit-on-open block: `app/gob/maltrato/[id]/page.tsx:145-147` (`logWelfareLocationViewed`
  when `locationPoint`) — page comment at `:138-147` already codifies the route-prefetch
  parity tradeoff. The new `GET /api/gob/maltrato/[id]` moves this block VERBATIM.
- Detail JSX boundary corrected: `page.tsx:276-586` (spec said 583; 586 is `</main>`).
- `WelfareDenunciaRow.tsx:69` hover ✓ · `MpfExportButton.tsx:20` ✓ ·
  `findOpenCasesForPetWithCodes` at `lib/infra/case-queries.ts:357` ✓.
- Primitives unchanged: `lib/ui/sheet-nav.ts:36-68` (`openedViaPush`),
  `lib/ui/map-layer-nav.ts:34-49`, `components/panorama/use-keyed-abort.ts:19-43`.
- Mounter pattern: 4 SheetMounters exist (pet-profile `SheetMounter.tsx:140-471`,
  OrgPetSheetMounter, MisTurnosSheetMounter, CuentaSheetMounter) — well-established template
  for the new `InspectorMounter`.
- Guards: `requireAdminOrGovtOrRedirect` (`lib/infra/auth-guards.ts:123-140`),
  `jurisdictionScopeContains` (`lib/domain/jurisdiction-canonical.ts:122-133`, fail-closed,
  whole-province subsumption), `logWelfareLocationViewed` (`lib/infra/welfare-location-audit.ts:17-34`).
- `CaseDetailShell` still UNUSED on maltrato — AND has **no tab machinery** (single children
  slot, `components/ui/dashboard/CaseDetailShell.tsx:60-92,264`); the Resumen/Timeline/Acciones/
  Export tabs must be built by the caller (`UrlTabs` idiom).

## Rollout targets (wave 2)

| Target | List structure | Note |
|---|---|---|
| /gob/casos | CaseQueue + keyset | ✓ as spec'd |
| /gob/disputas | CaseQueue, `?tab=` preserved | ✓ |
| /gob/cola | BulkApprovalQueueList | ✓ (and `/admin/cola` is a thin re-export — covered automatically) |
| /gob/vigilancia/investigaciones | flat, NO pagination | needs pagination first / re-scope (adjustment 2) |
| /admin/moderacion | keyset but bespoke `<ul>` | bespoke wiring (adjustment 3) |
| **/gob/moderacion** | keyset, sibling pattern | ADD (adjustment 4) |

## Conflicts / reuse notes

- **URL machinery: zero collision.** sheet-nav + map-layer-nav both use native
  `history.pushState` (never `router.push`); `?caso=` is a third consumer of the same family.
- **`prefetch={false}` warning:** operator-rail Links needed `prefetch={false}` (commit
  `bddec1c5` — default prefetch self-saturated the backend, ~248 req/page). The inspector's
  kept `<a href>` fallback anchors must NOT become default-prefetch `<Link>`s during the
  wave-2 extraction across 7 queues — same self-DoS risk.
- **Org queue engine:** its count→queue links are static routes, not row-level selections —
  no reuse for the inspector's URL mechanic (sheet-nav family remains the sole source).
- **Omnibox already drops pets for operators** (`lib/infra/omnibox-search.ts:5,314-316`) —
  the PO's no-pet-search invariant holds today; the new pet route is additive, no omnibox
  changes needed.
