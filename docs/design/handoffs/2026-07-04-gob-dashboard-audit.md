# /gob operator-dashboard UX/quality audit

Read-only audit of the GOBIERNO portal (`/gob/*`, ~38 routes, `/gob/panorama` excluded — recently redesigned, IA v2 in flight). Benchmarked against Linear/Palantir/Retool/ServiceNow operational-dashboard patterns, adapted for non-technical Argentine institutional users and Ley 25.326 privacy constraints (k-anon, no-DNI-plaintext). Evaluated against `components/ui/dashboard/index.ts` (the operator design system), `components/JurisdictionFilterBar.tsx` (URL filter contract), `components/layout/nav-presets.ts` (`GOB_NAV_SECTIONS`), and `docs/archive/design-handoffs/04-govt-dashboards.md` (original spec).

Method: four parallel cluster audits (sanitary/epi, welfare/enforcement, population/outreach/services, admin/governance), each reading every `page.tsx` in its cluster plus co-located data/query modules, then synthesized here.

## A. Executive summary — worst daily-work blockers

1. **`/gob/historial` — the portal's only audit-trail surface — is self-scoped ("Mi actividad") and has zero filtering** over ~90 action types. It cannot answer "who did what in my jurisdiction," undermining the governance oversight the rest of the portal depends on. The underlying `audit_log` table is comprehensive; only the surface is broken.
2. **`/gob/cola/[publicToken]` renders a raw `JSON.stringify()` event payload** in a `<pre>` to the operator — a direct violation of the documented "never return raw event payloads" rule and a PII exposure risk.
3. **Case-to-animal drill-downs dead-end in two clusters**: `/gob/casos` links to the owner-only portal (`/mis-mascotas/[token]`, wrong audience for a govt operator) and `/gob/vigilancia/investigaciones/[caseCode]` has no pet link at all, despite the source signal carrying the pet name.
4. **The portal's front door (`/gob` home) is broken in two ways**: its time-range chips write a `?range=` param that nothing reads (dead control), and its jurisdiction filter uses a different param format (province *slug*) than every sub-page (province *ISO code*) — scope is silently lost on the very first click from home.
5. **Creating a new investigation (`/gob/vigilancia/investigaciones/nuevo`) submits via `router.push`** instead of the project's `navigateAfterActionSuccess` helper, re-exposing the known Next.js router-drop defect — an officer can silently double-submit and create duplicate investigations.
6. **Two work queues (`servicios`, `disputas`) fetch all-jurisdiction rows — including provider/party PII — then filter scope in JavaScript** instead of pushing the predicate into SQL. This is the exact anti-pattern AGENTS.md prohibits, and it recurs in two independent clusters.
7. **The welfare queue (`/gob/maltrato`) has no bulk assign/triage and no in-timeline record of who claimed a case and when.** The officer's core daily action — triage — isn't supported at the list level, and assignment isn't auditable in the case timeline.
8. **Rich population/census/adoption dashboards (`poblacion`, `censo`, `adopciones`, `campanas`) have no CSV export and no link to `/gob/analytics`**, even though the export capability already exists one route over (`outreach`). The monthly-analyst journey dead-ends at "copy the numbers by hand."
9. **Design-system adoption is uneven**: `CaseQueue` / `CaseDetailShell` / `OpBulkBar` / `OpScopeChip` are the intended vocabulary, but most case-management and queue routes hand-roll their own list/detail layout instead. This is the root cause behind most of the recurring polish gaps below (missing empty states, freshness footers, scope chips).
10. **No PII-plaintext or k-anon-suppression correctness defects were found.** Where suppression is applied (mortalidad, censo, vigilancia trends), it is disclosed honestly. The gaps found are about scope-predicate placement and audit-surface completeness, not raw data leaks — genuinely a strength to preserve, not just an absence of bugs.

## B. Scorecard — route × pattern-group

Legend: ✅ cumple · ⚠️ parcial · ❌ ausente · ➖ n/a
Buckets: **1** KPIs & Metrics · **2** Filtering & Search · **3** Case/Entity Management · **4** Navigation & Hierarchy · **5** Feedback & States · **6** MiMAR Governance

### Sanitary / Epidemiology
| Route | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `/gob` (home) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/programa` | ⚠️ | ⚠️ | ➖ | ✅ | ✅ | ⚠️ |
| `/gob/vigilancia` | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ |
| `/gob/vigilancia/brotes` | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| `/gob/vigilancia/zoonosis` | ⚠️ | ⚠️ | ➖ | ✅ | ⚠️ | ⚠️ |
| `/gob/vigilancia/investigaciones` | ❌ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ |
| `…/investigaciones/nuevo` | ➖ | ➖ | ➖ | ⚠️ | ✅ | ⚠️ |
| `…/investigaciones/[caseCode]` | ➖ | ➖ | ✅ | ⚠️ | ✅ | ✅ |
| `/gob/mortalidad` | ✅ | ⚠️ | ➖ | ✅ | ✅ | ✅ |
| `/gob/analytics` | ✅ | ⚠️ | ➖ | ✅ | ✅ | ✅ |
| `/gob/analytics/export` | ➖ | ⚠️ | ➖ | ✅ | ✅ | ✅ |

### Welfare / Enforcement / Case Management
| Route | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `/gob/maltrato` (queue) | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| `/gob/maltrato/[id]` | ➖ | ➖ | ⚠️ | ✅ | ⚠️ | ✅ |
| `/gob/decomisos` (queue) | ⚠️ | ❌ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| `/gob/decomisos/nuevo` | ➖ | ➖ | ➖ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/decomisos/[publicCode]` | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ |
| `/gob/disputas` (queue) | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| `/gob/disputas/[disputeToken]` | ➖ | ➖ | ⚠️ | ✅ | ✅ | ⚠️ |
| `/gob/casos` | ❌ | ❌ | ⚠️ | ❌ | ✅ | ⚠️ |
| `/gob/cola` (queue) | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ |
| `/gob/cola/[publicToken]` | ➖ | ➖ | ⚠️ | ✅ | ✅ | ❌ |
| `/gob/perdidas` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ |

### Population / Outreach / Services
| Route | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `/gob/poblacion` | ⚠️ | ⚠️ | ➖ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/censo` | ⚠️ | ⚠️ | ➖ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/campanas` | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/outreach` | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| `/gob/outbox` | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| `/gob/adopciones` | ⚠️ | ⚠️ | ➖ | ❌ | ⚠️ | ⚠️ |
| `/gob/servicios` (queue) | ➖ | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| `/gob/servicios/[offeringToken]` | ➖ | ➖ | ⚠️ | ✅ | ⚠️ | ⚠️ |

*(`OpScopeChip` + `OpOmnibox` are mounted portal-wide in `app/gob/layout.tsx`, so scope-chip/global-search are inherited by this cluster and not separately dinged per route.)*

### Admin / Governance / System
| Route | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `/gob/sistema` | ⚠️ | ✅ | ➖ | ➖ | ✅ | ⚠️ |
| `/gob/organizaciones` | ❌ | ⚠️ | ⚠️ | ➖ | ❌ | ⚠️ |
| `/gob/usuarios` | ⚠️ | ⚠️ | ⚠️ | ➖ | ⚠️ | ⚠️ |
| `/gob/reglas` (index) | ➖ | ⚠️ | ➖ | ✅ | ⚠️ | ⚠️ |
| `/gob/reglas/[country]/[province]/[locality]` | ➖ | ➖ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| `…/reglas/…/nueva` | ➖ | ➖ | ➖ | ✅ | ✅ | ⚠️ |
| `…/reglas/…/editar/[ruleId]` | ➖ | ➖ | ➖ | ✅ | ✅ | ⚠️ |
| `/gob/historial` | ➖ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ |

## C. Ranked findings

HIGH = flagged as PII-safety, k-anon-honesty, audit-trail, or authorization gap regardless of effort.

### Sanitary / Epidemiology
| # | Finding | file:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| A1 | **[BROKEN] HIGH** — Home time-range chips are dead: `?range=` is written but never read; KPIs are pinned to fixed `trailing12m`/`trailing30d` windows. | `app/gob/page.tsx:140-141,242-250` | High — a visible control does nothing | M | Feed `params.range` into `resolveAnalyticsPeriod`, or replace with `PeriodPicker` |
| A2 | **[BROKEN] HIGH** — Filter contract split: home uses `JurisdictionFilterBar` (province=slug), sub-pages use `JurisdictionSwitcher`+`PeriodPicker` (province=ISO). A mismatched param is silently dropped → scope resets on every drill-down from home. | `components/JurisdictionFilterBar.tsx:88` vs `components/gob/JurisdictionSwitcher.tsx:104` | High | M | Standardize home on `JurisdictionSwitcher`+`PeriodPicker` |
| A3 | **[MISSING] HIGH** — Investigation detail has no link to the pet/mascota or back to the originating signal, though the signal carries `petName`. | `app/gob/vigilancia/investigaciones/[caseCode]/page.tsx` | High — journey terminates | M | Add pet deep-link + signal backlink |
| A4 | **[BROKEN] HIGH** — Create-investigation uses `router.push` for primary nav (the router-drop defect the rest of the surface avoids) — risk of silent no-nav → duplicate investigation on re-submit. | `.../investigaciones/nuevo/OpenInvestigationForm.tsx:39,109` | High — data integrity | S | `navigateAfterActionSuccess(...)` |
| A5 | [MISSING] Investigaciones list has no filter/search, hardcoded 90-day window, hand-rolled `<ul>` instead of `CaseQueue`. | `.../investigaciones/page.tsx:22-113` | Medium | M | Reuse `CaseQueue` |
| A6 | [POLISH] Case surfaces bypass `CaseDetailShell`/`CaseStatusBadge`, use raw layout + `OpPill`. | `[caseCode]/page.tsx`, `investigaciones/page.tsx:16-27` | Medium | M | `CaseDetailShell`, `CaseStatusBadge` |
| A7 | [MISSING] No `DashboardFreshnessFooter` on `brotes`/`zoonosis`/`investigaciones` despite being event-log projections. | `brotes/page.tsx`, `zoonosis/page.tsx` | Medium | S | Mount `DashboardFreshnessFooter` |
| A8 | [POLISH] `OpScopeChip` unused cluster-wide; scope shown as free text. | `page.tsx:213-216` + headers | Low-Med | S | `OpScopeChip` |
| A9 | [POLISH] Dev jargon in copy: raw `profile.role` ("govt"/"admin"); operator asked to paste a raw event UUID. | `page.tsx:214`; `OpenInvestigationForm.tsx:91` | Low-Med | S | Friendly labels |
| A10 | [POLISH] Bare `<p>` empty states instead of `LnEmptyState`. | `page.tsx:485,509,556` | Low | S | `LnEmptyState` |
| A11 | [POLISH] Stale comment claims export page is unreachable; it isn't (linked from analytics) — CTA is a low-visibility text link. | `export/page.tsx:1-13`; `analytics/page.tsx:247` | Low | S | Delete stale comment; promote to `OpButton` |
| A12 | [POLISH] Divergent hardcoded, inconsistently-accented province lists instead of `GOB_ALL_PROVINCES`. | `brotes/page.tsx:18`; `export/page.tsx:29` | Low | S | Use `GOB_ALL_PROVINCES` |
| A13 | [POLISH] Choropleths have no click→filter/drill. | `vigilancia/page.tsx:550`, `analytics/page.tsx:315` | Low-Med | L | Wire `onSelect` |
| A14 | [POLISH] No loading skeletons; all routes are blank-page `force-dynamic`. | all routes | Low | M | Suspense + skeleton |

### Welfare / Enforcement / Case Management
| # | Finding | file:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| B1 | **[BROKEN] HIGH** — `cola/[publicToken]` dumps the raw event payload via `JSON.stringify(request.payload)` in a `<pre>` — violates the "never return raw event payloads" rule; may carry PII. | `app/gob/cola/[publicToken]/page.tsx:143` | High | M | Project explicit fields into a `<dl>`/`OpCard` |
| B2 | **[BROKEN] HIGH** — `casos` pet link points at the owner-portal route (`/mis-mascotas/[token]`); wrong audience for a govt operator → dead drill-down. | `app/gob/casos/page.tsx:88` | High | S | Link to `/p/[token]` or an operator pet view |
| B3 | **[MISSING] HIGH** — Maltrato queue has no bulk assign/triage; `CaseQueue`'s bulk slot unused. | `app/gob/maltrato/page.tsx:294-343` | High | M | Migrate to `CaseQueue` + `OpBulkBar` |
| B4 | **[MISSING] HIGH** — Assignment isn't written into the case timeline; only current assignee name shown. | `AssignmentActions.tsx:36-55` | High | M | Emit + render assignment `caseEvent` in `Timeline` |
| B5 | [MISSING] Disputas queue fetches all disputes then filters scope in JS instead of SQL predicate. | `app/gob/disputas/page.tsx:44-56` | Medium (privacy-architecture) | M | Push jurisdiction tuples into `where` |
| B6 | [POLISH] Maltrato/disputas detail bypass `CaseDetailShell` — hand-rolled stacked cards. | `maltrato/[id]/page.tsx:262+`, `disputas/[disputeToken]/page.tsx:115+` | Medium | M | `CaseDetailShell` |
| B7 | [POLISH] Disputas detail renders raw event-type identifiers (`custody_transferred`, `authorRole`). | `disputas/[disputeToken]/page.tsx:201,208` | Low-Med | S | Localized label helper |
| B8 | [POLISH] Decomisos/nuevo hand-rolls every input instead of `OpField*`; DC2 confirm is a bespoke dialog. | `decomisos/nuevo/_components/DecomisoForm.tsx:314-917` | Medium | M | `OpField*`, `ConfirmDialog` |
| B9 | [MISSING] No SLA/breach banner despite tracked ages (maltrato "Atrasadas >90d", decomisos 7-day window). | `maltrato/page.tsx:209-214`, `decomisos/page.tsx:236-238` | Medium | S | `OpBreach` |
| B10 | [MISSING] Decomisos queue has no persistent filter bar (period/jurisdiction/status). | `decomisos/page.tsx:59-126` | Medium | M | `JurisdictionFilterBar`/`PeriodPicker` + `CaseQueue` |
| B11 | [POLISH] `OpScopeChip` unused across the cluster. | all 11 routes | Low-Med | S | `OpScopeChip` |
| B12 | [POLISH] Bare `<p>` empty states on maltrato/decomisos/cola queues. | `maltrato/page.tsx:302`, `decomisos/page.tsx:168`, `BulkApprovalQueueList.tsx:118` | Low | S | `LnEmptyState` |
| B13 | [POLISH] Cola reinvents `OpBulkBar` with a richer bespoke bar (partial-failure legibility) — fold back into the shared primitive. | `BulkApprovalQueueList.tsx:179-263` | Medium | M | Absorb into `OpBulkBar` |
| B14 | [POLISH] Maltrato parses `kind`/`severity` params but exposes no facet UI. | `maltrato/page.tsx:41-53,240-244` | Low-Med | S | Facet chips |
| B15 | [POLISH] No KPI carries a temporal delta anywhere in the cluster. | `maltrato/page.tsx:247-291`, `perdidas/page.tsx:179-228` | Medium | M | `OpKpi` delta |
| B16 | [POLISH] Perdidas choropleth aggregated in JS, not via suppressed SQL aggregate. | `perdidas/page.tsx:30-45,143` | Low | S | Compute in query layer |

**Positive note:** the maltrato investigate→evidence→MPF-export spine is solid and privacy-correct — `logWelfareLocationViewed` writes an access-trail row before render, and `MpfExportButton`/`generateMpfExportAction` is a real, working fiscal export. The breakage is at the top of the funnel (triage/assignment), not the payoff.

### Population / Outreach / Services
| # | Finding | file:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| C1 | **[BROKEN] HIGH** — Servicios queue fetches every pending offering nationwide (incl. provider PII) then filters in JS instead of SQL. | `app/gob/servicios/page.tsx:67-85` | High (privacy-architecture) | M | Push `(province,locality) IN (...)` into Drizzle `where`, as `outbox:135-141` does |
| C2 | **[MISSING] HIGH** — Province choropleths silently drop rows with NULL/non-ISO province with no footnote (map total ≠ KPI total); campanas' own comment admits the drop. | `censo:126-130`, `poblacion:135-139`, `campanas:140-157` | High (honesty) | S | Disclose dropped-count, as the existing "períodos ocultos" pattern does |
| C3 | [MISSING] `poblacion`/`censo`/`adopciones`/`campanas` have no CSV export and no link to `/gob/analytics`; only `outreach` exports. | all four metrics pages | High (journey dead-end) | S | `OpButton` export + "Ver en Analítica →" link |
| C4 | [BROKEN] Outbox empty state is raw text, not `LnEmptyState`. | `app/gob/outbox/page.tsx:305-310` | Medium | XS | `LnEmptyState` |
| C5 | [MISSING] Govt sees an outbox SLA breach in their own jurisdiction but detail is admin-only ("—", no drill-in). | `app/gob/outbox/page.tsx:416-429` | Medium | M | Scoped `/gob/outbox/[id]` via `CaseDetailShell` |
| C6 | [MISSING] No hierarchical drill-down: `censo` computes a suppressed `byLocality` and never renders it; no map `onSelect` anywhere in the cluster. | `poblacion`, `censo`, `campanas`, `adopciones` | Medium | M | Wire `MapChoroplethDynamic onSelect` → URL params |
| C7 | [MISSING] Servicios queue is a hand-rolled `<ul>`: no `CaseQueue`, no filter, no bulk-approve. | `app/gob/servicios/page.tsx:109-153` | Medium | M | `CaseQueue` + `OpBulkBar` |
| C8 | [POLISH] Schema/enum jargon leaks into visible copy (not just tooltips): `pregnancy_status='in_progress'`, `ownerships.role='foster'`. | `poblacion:199,166`; `adopciones:166,181,183,196` | Medium | S | Plain es-AR copy |
| C9 | [POLISH] Only `campanas` uses a temporal delta (`deltaV2`); rest show bare number+sparkline. | `censo`, `poblacion`, `adopciones`, `outreach` | Medium | M | `OpKpi deltaV2` |
| C10 | [POLISH] No `loading.tsx`/Suspense skeletons anywhere in the cluster. | all 8 routes | Low | M | Add skeletons |
| C11 | [POLISH] No segmented cards/table/map or day/week/month toggle. | metrics routes | Low | M | Segmented control |
| C12 | [POLISH] Servicio-offering detail has no history/timeline of the decision. | `servicios/[offeringToken]/page.tsx:86-197` | Medium | M | `CaseDetailShell` timeline |

**Positive note:** `outreach` is the reference implementation for governance (per-view AND per-export `pii_queried` audit rows, disclosed in copy with a link to `/gob/historial`) — worth propagating, not just fixing gaps elsewhere.

### Admin / Governance / System
| # | Finding | file:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| D1 | **[BROKEN] HIGH** — `/gob/historial` filters `actorUserId = self` ("Mi actividad"); a govt operator cannot see peer/admin actions in their jurisdiction (role grants, revocations, PII queries, rule changes) though the `audit_log` table holds them. | `app/gob/historial/page.tsx:136-137`; `nav-presets.ts:283` | High — governance unverifiable | M | Jurisdiction-scoped audit view (filter by *target*, not actor) as `CaseQueue`; keep "Mi actividad" as a personal tab |
| D2 | **[MISSING] HIGH** — Historial has zero filtering over ~90 action types (no facets, no date range). | `historial/page.tsx:252-278` | High | M | `OpOmnibox` + action-category segmented control + period param |
| D3 | [MISSING] Reglas detail shows only the current payload; no change-history timeline despite `audit_log` recording rule create/update/delete. | `reglas/[…]/page.tsx:107-139` | Medium | M | `CaseDetailShell` timeline reading `audit_log` |
| D4 | [BROKEN] Reglas detail dumps raw `JSON.stringify(rulePayload)` while the read-only lens elsewhere uses `summarizeRulePayload`. | `reglas/[…]/page.tsx:133-135` | Medium | S | Reuse `summarizeRulePayload` |
| D5 | [MISSING] Organizaciones hides the pending-verification queue though the backend already supports `verifiedFilter` pushed into SQL. | `organizaciones/page.tsx:30-33`; `admin-search.ts:194-199` | Medium | S | Segmented control bound to `?estado=` |
| D6 | [MISSING] Bare-text empty states on usuarios/organizaciones/reglas. | `usuarios:136-143`; `organizaciones:67-75`; `reglas/[…]/page.tsx:103-105` | Low-Med | S | `LnEmptyState` |
| D7 | [MISSING] No `OpScopeChip` on usuarios/organizaciones/reglas/historial — scope shown only as prose. | `usuarios:74-82`; `organizaciones:42-52`; `reglas:69-79` | Medium (safety-boundary visibility) | S | `OpScopeChip` |
| D8 | [MISSING] No `DashboardFreshnessFooter` on organizaciones/reglas/historial. | n/a | Low-Med | S | Add footer |
| D9 | [POLISH] KPIs lack temporal-comparison deltas. | `sistema:137-189`; `usuarios:98-119` | Low-Med | S | `OpKpi` delta |
| D10 | [POLISH] No command palette/`OpOmnibox`; name-only search, no role/type facets. | `usuarios:122-133`; `organizaciones:54-65` | Low-Med | M | `OpOmnibox` |
| D11 | [POLISH] `LocalityRuleDrilldown` uses `router.push` for a cross-route jump. | `reglas/LocalityRuleDrilldown.tsx:74` | Low | S | Full-page nav helper |

**Positive note:** PII scoping in this cluster is done correctly in SQL predicates (`admin-search.ts:83-101,182-192`); bulk-revoke (motivo+evidence+confirm+per-item result) and rule-delete (reason-gated) are exemplary; every rule form already uses `navigateAfterActionSuccess`; the reglas país→provincia→localidad chain is a genuine progressive drill-down with breadcrumbs.

## Journeys

**Sanitary officer, morning** (`/gob` → brote → investigación → mascota): strong KPI wall and a genuinely good vigilancia drill-down (choropleth + live SLA breach banner), but breaks three times before reaching the animal: dead time-range chips on home (A1), lost scope on the home→vigilancia handoff (A2), and a dead-end at the investigation detail with no pet link (A3). Creating a new investigation risks silent duplicate submission (A4).

**Welfare officer** (`/gob/maltrato` queue → assign → timeline → MPF export): the investigate→evidence→export spine is solid and privacy-correct (pre-render access-trail logging, a real working MPF PDF export) — but the front of the funnel has no bulk triage (B3) and assignment isn't auditable in the timeline (B4). Two portal-wide snags surface here too: `casos`' dead pet link (B2) and cola's raw JSON dump (B1).

**Monthly analyst** (filter jurisdiction → chart → CSV export): the on-screen experience on `poblacion`/`censo` is honest and well-reasoned (explicit k-anon disclosure, directional-metric caveats), but the journey dead-ends — no export, no link to `/gob/analytics` (C3) — even though `/gob/analytics/export` itself is a fully-built, working CSV export with a 24h signed URL and Ley 25.326 notice (A11 corrects a stale comment claiming it's orphaned; it isn't, just low-visibility).

## Top 5 /gob fixes worth doing now

1. **Make `/gob/historial` a real jurisdiction-scoped audit trail** (D1+D2) — filter by target jurisdiction not just actor, add action-category/date facets. This is the portal's only oversight surface and it currently can't answer "what happened here."
2. **Kill the raw JSON payload dump in `/gob/cola/[publicToken]`** (B1) — direct rule violation, PII exposure risk, quick fix.
3. **Reconnect the "reach the pet" dead-ends**: fix `/gob/casos`' owner-portal link (B2) and add a pet/signal link to the investigation detail (A3) — both break the flagship sanitary/welfare journeys at the last step.
4. **Fix the `/gob` home page's broken filter contract and the investigation-create duplicate-submission risk** (A1+A2+A4) — the literal front door of the daily sanitary journey is currently unreliable.
5. **Push jurisdiction scoping into SQL predicates in `servicios` and `disputas`** (C1+B5) — the same fetch-then-filter-in-JS anti-pattern recurring in two independent clusters; each fix is mechanical once flagged.
