# Staging-readiness triage — 2026-07-12

> READ-ONLY assessment of the open backlog against the CURRENT code on
> `integration/all-20260703`. Every open task below was verified against real files
> (titles are old and several are already done or stale). Goal: an accurate map of
> what is **completable-now** vs **blocked** vs **multi-session**, so the PO can drive
> the remaining work to a coherent staging deploy.
>
> Method: four parallel read-only code passes (owner+perf, gob/admin screens,
> panorama viz, structural/infra), each grounded with `file:line`. Nothing here was
> edited.

## Structural spine you must hold in your head

Most of the panorama backlog hangs off ONE refactor. The canonical `PanoramaViewState`
value + URL boundary **already landed** (P1a/P1b — `src/modules/panorama/domain/view-state.ts`,
`view-state-url.ts`; wired at `components/panorama/PanoramaConsole.tsx:2814`). But the
**capability gate (P2)**, **first-class Encoding (P3)** and **LOD (P4)** are NOT done —
`capabilitiesFor` has zero hits in the tree. That remaining arc is **task #65 (WS-4)** and it
is the gate for **#24** (mode switcher), **#33** (viz-suite), **#51** (embed) and **#32**
(sanitary_authority/presentation). Building any of those on today's scattered state means
re-deriving the same compatibility logic a 4th time — exactly the rework the master plan
(`docs/plans/panorama-viewstate-master-plan.md:142-145`) exists to prevent.

The other structural item, **#66 (WS-5) jurisdiction-scope primitive**, is fully planned
(`docs/plans/jurisdiction-scope-primitive.md`) and independent of ViewState — its own worktree,
disjoint file territory, blocking fence-review gate.

---

## Verdict table

| # | Task | Verdict | Effort | Staging value | Files / approach |
|---|------|---------|--------|---------------|------------------|
| **#55** | "Informe de situación" operator export | **BOUNDED-NOW** | M | **HIGH** | Disabled stub in TWO files (`components/panorama/SituationalMap.tsx:3474`, `PanoramaConsole.tsx:4074`). Data (`lib/metrics/*`, `kpi-catalog.ts`) + print infra (`lib/infra/defer-print.ts` + per-surface `@media print` CSS, e.g. `denuncias/.../DescargarComprobante.tsx`) already exist. Build a print-view that assembles already-fetched KPIs (reuse `buildExportFooter` from `panorama-export.ts`), wire the button to `deferPrint()`, delete the duplicate stub. No PDF lib needed. |
| **#66** | Jurisdiction-scope primitive (WS-5) | **BOUNDED-NOW** (substantial) | M–L | **HIGH** | Plan ready + anchors verified: `lib/infra/gov-scope.ts::resolveScopedJurisdictions` (tested, 5 cases) + sibling `lib/analytics/analytics-period.ts::resolveAnalyticsPeriod`. 16(+1) inline copies (`app/gob/poblacion/page.tsx:107`, `maltrato`, exports…). Wrap the tested fence core, route all sites through it. **Own worktree + blocking fence review (§4) mid-session.** Single focused session for the primitive+net; migration commits per group after. |
| **#56a** | Panorama client observability | **BOUNDED-NOW** (+ PO sink choice) | S | **HIGH** | Error boundaries already contain (`components/ErrorBoundary.tsx:35`, `MapErrorBoundary.tsx:37`) but only `console.error`. Add a `reportError` hook at both `componentDidCatch` sites — one-function seam. **BLOCKED half:** which vendor/DSN (Sentry / Vercel Observability) is a PO/billing call. |
| **#15a** | Render `kpi-catalog` into UI | **BOUNDED-NOW** | S–M | **MED-HIGH** | `lib/metrics/kpi-catalog.ts` is doc-as-code (num/den/source/cadence), today only guards labels at CI (`scripts/check-metric-labels.ts`) — zero UI imports. Its shape already matches the `info={{definition,formula,caveat}}` prop every `OpKpi` takes (`app/gob/page.tsx:311`). Wire the catalog as the single source for those blocks → data-honesty across ALL dashboards, kills the "two coberturas" class. |
| **#52b** | poblacion misplaced KPI card | **BOUNDED-NOW** | S | **MED** | `app/gob/poblacion/page.tsx:229-329` — 5 `OpKpi` tiles in a `md:grid-cols-4` grid; the 5th ("Altas netas registradas", `:312`) wraps alone leaving 3 empty cells. Relocate it beside the "Componentes del balance" box (`:353`, arguably duplicate) or widen the grid. |
| **#52a** | gob home empty-space / rails | **BOUNDED-NOW** | S | **MED** | `app/gob/page.tsx:671` — aside column has 2 cards vs 3 in main after a placeholder was removed (`:673-677`, per 2026-07-09 audit), leaving a bottom-right gap. Add a genuinely useful third aside card (quick-links / acciones frecuentes). |
| **#16b** | Per-route fonts | **BOUNDED-NOW** | S | **MED** (perf) | `app/layout.tsx:1-64` loads Encode Sans + IBM Plex ×3 + Caveat globally; IBM Plex/Caveat used only in `(app)`/`(public)`. Move those consts into `app/(app)/layout.tsx` + `app/(public)/layout.tsx`; keep Encode Sans in root. Fix 2 stray usages (`app/admin/libro/EventLedgerRow.tsx`, `app/gob/perdidas/_components/LostPetRow.tsx`). Caveat is loaded but used nowhere. |
| **#42** | Functional index, org-scoped checkins | **BOUNDED-NOW** (file) / **BLOCKED** (apply) | S | **MED** | Query confirmed: `lib/analytics/org-dashboard.ts:723` filters `payload->>'previous_owner_organization_id'`. No such index in `db/migrations/` (latest `0140`). Write **`0141_*.sql`** expression index. Applying to remote = **PO-gated** per convention. |
| **#16a** | `/p/[token]` streaming + `next/image` | **BOUNDED-NOW** (tradeoff) | M | **MED** (perf) | `app/(public)/p/[publicToken]/page.tsx:790,893` use raw `<img>`, no `<Suspense>`. Wrap card body in Suspense w/ skeleton so the guilloché shell paints first. CAUTION: highest-traffic QR path — `eager/sync` was a deliberate LCP choice; keep `priority`, verify optimizer adds no mobile latency. |
| **#15b** | "Acerca de métricas" beyond panorama | **BOUNDED-NOW** (reuse) / MULTI-SESSION (per-screen) | M | **MED** | Panorama has it (`PanoramaConsole.tsx:4094` via `OverlayDisclosure.tsx`); zero equivalent on `/gob/*`. Reuse the existing disclosure primitive as a shared component mounted once per analytics screen (bounded). A bespoke page per ~7 screens = multi-session. |
| **#53** | Panorama frontend-design critique | **BOUNDED-NOW** (draft) — judgment-gated | M | **LOW-MED** | No current panorama-specific holistic critique exists; closest (`docs/reviews/2026-07-11-cowork-review-mapa-codigo.md` §2) is whole-app, different dimensions, and stale (predates #64/#65/#66b). `frontend-design` skill can produce a rigorous DRAFT autonomously; prioritization of findings needs PO taste. |
| **#44c** | Panorama attribute filters (species…) | **BOUNDED-NOW** (hack) / **MULTI-SESSION** (real) | M | **MED** | No attribute axis in `view-state.ts` or the loaders. A single hardcoded species predicate + one URL param is bounded — but the honest version is axis-1 of the 3-axis IA and belongs in `ViewScope`/`SERIALIZED_FIELDS` alongside ViewState, not bolted on. |
| **#31a** | perdidas filter-divergence | **BOUNDED-NOW** — sequence after #66 | S | **MED** | `app/gob/perdidas/page.tsx:87-148` never computes `filteredJurisdictions` (variant "D4" in the scope plan). Reconcile it AS the #66 Group-D migration — hand-patching standalone creates an 18th variant instead of removing one. |
| **#31c** | choropleth dedup (`toChoroplethData`) | **BOUNDED-NOW** (design) — after #66 | S | **LOW-MED** | Re-derivation at `app/gob/poblacion/page.tsx:203`, `censo/page.tsx:184`, perdidas `aggregateLostByProvince`, vigilancia rollups. Named as sibling follow-up (§6.b of the scope plan); no design doc yet. Small pure function, sequenced after WS-5. |
| **#14 (onboarding)** | gob/admin first-run checklist | **MULTI-SESSION** | M | **MED-HIGH** | `OrgSetupChecklist` (`components/OrgSetupChecklist.tsx` + `lib/infra/org-setup-checklist.ts`) is org-scoped-state-derived; zero equivalent in `app/gob`/`app/admin`. Not a port — needs its own step taxonomy (jurisdiction assignment / first campaign / first rule) + a `gob-setup-checklist` domain module. Scope as an SDD change. |
| **#15d** | Operator action receipts | **MULTI-SESSION** | M | **MED** | Zero `receipt`/`comprobante` in `app/gob`/`app/admin`; only the public denuncia comprobante exists. Print mechanism is proven/reusable, but WHICH actions warrant a receipt (acta / decomiso / case close) is product scoping first. |
| **#24** | Viz-mode switcher + heatmap (phase 1) | **MULTI-SESSION** (gated on #65 P2) | — | **LOW** | No unified switcher (`grep "Modo"` empty); encoding scattered (`MapChoropleth.tsx:115` prop, bivariate string-gate `PanoramaConsole.tsx:2270`, `isMeta` ×3). `EncodingId` union declared but inert (`view-state.ts:58`). No heatmap anywhere. Needs `capabilitiesFor` (P2). No honest bounded slice. |
| **#33** | Viz-suite waves 0-4 | **MULTI-SESSION** (gated on #24/#65) | — | **LOW** | Anchors still valid (`divergentStops` `viz-scales.ts`; `loadScopeDailyCounts` `repository.ts:2301`; amendment infra). Plan (`viz-suite.md:7`) self-sequences after #24 phase 1. Wave 0/1 (`suppressDelta`, `CalendarHeatmap`) are algorithmically independent but the plan doesn't authorize the split. |
| **#51** | Unify analytics maps on `<PanoramaEmbed>` | **BLOCKED** (behind #65 P2-P4) | — | **HIGH** (gated) | `PanoramaEmbed` doesn't exist; it's the P5 "gift" gated on the capability gate + Encoding. Location filtering — the bounded slice — is ALREADY done: all 4 screens render `<JurisdictionSwitcher>` (`poblacion:140`, `censo:139`, `perdidas:184`, `vigilancia:316`). Nothing bounded-now left here. |
| **#65** | ViewState P2→P5 (WS-4) | **MULTI-SESSION** | L (per phase) | **HIGH** (structural) | P1a/P1b landed; P2 not started. Each phase is characterization-net-gated + fresh-adversarial-reviewed on a **PO-validated production map** — collapsing phases multiplies regression surface. P2 alone unblocks #24/#33/#51/#32. |
| **#10** | Pet-profile 3b redesign | **BLOCKED** (PO design review) | L | MED | Current profile is a two-face tabbed IA (`mis-mascotas/[publicToken]/page.tsx`, `CredentialFace.tsx`, shipped 2026-07-01). Handoff 3b wants a different IA (single scroll, mirrored credential, 3 disclosure rows, no tabs) — a structural change, correctly design-gated. |
| **#9** | Owner screens 1b/5b/2b | **BLOCKED** (PO design review — conflict) | L | HIGH (if approved) | Handoff (`docs/design_handoff_owner_screens/`, gitignored) wants a credential carousel + unified pendientes + inline reclamar card. Current `inicio/page.tsx:1-17` explicitly REMOVED per-pet carousel per prior PO decision (task #34 "leaned"). Genuine conflict — needs PO to confirm the handoff supersedes #34 before any code. |

### Already DONE / STALE (no work needed)

| # | Finding | Evidence |
|---|---------|----------|
| **#25** | "marcar encontrada → gob case closes" is **WIRED** | `set-pet-found-use-case.ts:107-141` finds the open `lost_pet_episode` case and `closeCase`s it in the same tx; called from `SheetMounter.tsx:454`; regression-tested. No gap. |
| **#16d** | `microchipCode:null` bug **fixed + pinned** | `__tests__/pet-identifiers.test.ts:100`; live code sources real codes (`owner-dashboard.ts:1262`, `page.tsx:486`). Remaining literals are absent-case fixtures. |
| **#14 (empty-states)** | "Sin acceso" states already **actionable** | Every `/gob/*` uses `LnEmptyState` naming the screen + next action ("pedile al admin que te asigne…"), e.g. `poblacion/page.tsx:72`. |
| **#44a** | Department-rate coverage **shipped** | All rate loaders fold to department via `aggregateCellsToDepartment` (`repository.ts:1038/1065/1089/1113/1136`) + `reunification-rollups.ts`. |
| **#44b** | Signal-driven ranking **shipped** | `PanoramaConsole.tsx:3057` reads `getPreset().rankBy` (commit `a0bc165a`); `RankedUnitsPanel.tsx`. |
| **#44d** | Decomiso tabulation **shipped** | `layers.ts:218` `decomisos` layer, `loadDecomisos` `repository.ts:519`, rendered as points. |
| **#52c** | "casos → admin routing" is **by design, not a bug** | `gob/casos/page.tsx:35` redirects only admin-role sessions to keep them in `/admin` chrome; nav config is correctly split (`nav-presets.ts:373` gob, `:466` admin). |
| **#31b** | censo "single-source" — **not a data-source bug** | `census.ts:287/564` both query `pets` with the same `activePetsCondition`; only a DRY note (own province aggregation) that folds into #31c. |
| **#31d** | location-privacy policy doc **exists** | `docs/architecture/privacy-known-limitations.md` (KA1/KA2/KA5, populated + referenced). |
| **#56b** | Load-probe tool **exists** | `scripts/load-probe.ts` + `pnpm probe:load` + `docs/ops/load-probe.md`; only *running it at prod scale* is env/PO-gated. |
| **#16c** | geojson comment reconcile — **not found** | No live TODO/mismatch surfaced; only an archived doc reference. Needs the PO to point at the specific file, else drop it. |

### Correctly parked / blocked (confirmed, prior PO decision)

- **#26** atender consent — `docs/design/handoffs/2026-07-06-atender-consent-future.md` (pilot accepts DIM-as-consent-proxy; token model is post-pilot).
- **#28** Mi Argentina — blocked on convenio; `auth/miarg/callback/route.ts` is a hard 501, gated 404-when-unconfigured.
- **#29** PPP Buenos Aires — `lib/analytics/ppp-exports.ts` hard-fails non-CABA with `ppp_prov_ba_not_implemented` pending official wire format (Ley 14.107).
- **#32** sanitary_authority panorama-read — a new fence policy, explicitly sequenced after the ViewState foundation (`2026-07-13-overnight-report.md:49`).
- **#37** regions-as-data — no current code footprint found; backlog-only, deferred.
- **#3 / #42-apply** — remote deploy / remote migration apply is Ignacio-gated by project convention (`CLAUDE.md`).

---

## Recommended execution order for the BOUNDED-NOW items

Grouped so quick coherence wins land first, structural work is isolated, and nothing
fights the ViewState arc.

**Batch 1 — quick coherence + perf wins (all S, disjoint files, parallel-safe).**
Highest ratio of visible staging polish per hour.
1. **#52b** poblacion misplaced card — one grid fix, visible on a demoed screen.
2. **#52a** gob home rails — fill the empty aside gap.
3. **#16b** per-route fonts — move IBM Plex/Caveat out of the root layout.
4. **#42** write migration `0141_*.sql` (file only; apply stays PO-gated).

**Batch 2 — data honesty + the flagship operator deliverable (M).**
5. **#15a** wire `kpi-catalog` as the single source for `OpKpi` info blocks — structural
   data-honesty across every dashboard (canon C1/C2).
6. **#55** "Informe de situación" — turn the visible "en desarrollo" stub into a real
   print export from existing metrics. The most-wanted funcionario deliverable.
7. **#56a** add the `reportError` seam at both error boundaries — then ask the PO for the
   telemetry sink (Sentry DSN / Vercel Observability) to finish it.

**Batch 3 — structural, its own focused session (own worktree).**
8. **#66** jurisdiction-scope primitive — primitive + characterization net + the blocking
   fence review, then per-group migration commits. Absorbs **#31a** (perdidas) as its
   Group-D item; **#31c** (`toChoroplethData`) follows as a small sibling.

**Later bounded items (do after the above, each with a caveat):**
9. **#16a** `/p/[token]` streaming — careful LCP tradeoff on the busiest path.
10. **#15b** "acerca de métricas" — reuse the panorama disclosure primitive on gob screens.
11. **#53** panorama design critique — autonomous draft, then PO prioritizes.

**Gated behind the ViewState arc (#65 P2) — DO NOT rush into a mixed session:**
#24, #33, #51, #44c (real version), #32. These are the payoff of #65; start #65 as its own
plan-first multi-session effort when the PO wants to spend a night on the crown-jewel refactor.

**Design-review-gated (PO owns the decision, not code):** #9 (resolve the conflict with the
task-#34 decision first), #10.

---

## Counts

- **BOUNDED-NOW:** 13 (incl. 2 with a PO-gated second half: #42 apply, #56a sink) — plus
  #31a/#31c sequenced inside #66.
- **BLOCKED (PO / external):** #9, #10, #51, #28, #29, #3/#42-apply.
- **MULTI-SESSION:** #65, #24, #33, #14-onboarding, #15d, #44c-real.
- **DONE / STALE:** #25, #16d, #44a, #44b, #44d, #52c, #31b, #31d, #56b, #14-empty-states,
  #16c (not-found), #32/#37/#26 parked.

## The 3 items that most improve staging readiness

1. **#55 Informe de situación** — replaces a visible "en desarrollo" dead-button with the
   single deliverable funcionarios ask for; self-contained, infra already exists.
2. **#66 jurisdiction-scope primitive** — collapses 16 hand-copies of the sacred fence into
   one auditable place (two real leaks were caught from copy drift on 2026-07-12/13). The
   security spine to close before wider exposure.
3. **#15a kpi-catalog → single-source metric definitions** — makes every dashboard's numbers
   self-describing from one catalog, structurally ending the "same name, two definitions"
   class. Cheap, and it is the data-honesty backbone a national counterpart will scrutinize.
