# Second-opinion UX review — `/gob` operator journeys

**Ground truth:** `integration/all-20260703` @ `5c082d21`  
**Scope:** Journey 1 (sanitary morning) + Journey 2 (welfare case work) only. Read-only audit against canonical `C:/dev/dim`.

---

## Cross-cutting pattern gap (both journeys)

MiMAR’s operator chrome is **solid at the shell layer** (`OpScopeChip`, `OpOmnibox`, `OperatorBreadcrumbs`, `DashboardFreshnessFooter`, `loading.tsx` on hot segments) but both journeys still behave like **2000s full-page CRUD**, not modern queue software.

| Pattern | Linear / ServiceNow / Palantir expectation | MiMAR today |
|---|---|---|
| Master–detail | List stays visible; detail opens in inspector / split pane; scroll + filter state preserved | Every drill is a **full route change**; list context, tab, and keyset cursor are lost |
| Saved views | Named filters, pinned queues, badge counts on tabs | Maltrato has URL tabs but **no tab badges**, no saved views; kind/severity/status exist in SQL but **no UI** |
| Signal → record | One click from alert to the affected entity | Surveillance has pet data in the fetcher but **no govt pet navigation path** |
| Legal actions | Confirm + reason + evidence before irreversible export | MPF has **backend audit** but **one-click UI** |
| Scope + freshness | Always visible, always trustworthy | Scope chip ✅; freshness footer on list dashboards ✅ but **missing on investigation detail** |

The dashboard barrel (`components/ui/dashboard/index.ts`) already exports the right primitives (`CaseQueue`, `CaseDetailShell`, `OpBulkBar`) — welfare detail **does not use** `CaseDetailShell`, and surveillance **does not use** a queue/inspector pattern at all.

---

## Journey 1 — Sanitary officer’s morning (surveillance → action)

**Target path:** `/gob` → spot signal → `/gob/vigilancia` (+ `/brotes`, `/zoonosis`) → `/gob/vigilancia/investigaciones/[caseCode]` → drill to pet.

**Verdict: YES-WITH-FIXES** — metrics and honesty banners are production-grade; the **“something’s wrong → I’m acting on it → I see the animal”** chain breaks in three places.

### Friction log

| Step | What works | What breaks | File:line | Fix |
|---|---|---|---|---|
| 1 · Land `/gob` | Live KPI strip with deltas, sparklines, ⓘ definitions, `DashboardFreshnessFooter`; jurisdiction filter bar | **No outbreak-signal preview.** “Casos zoonosis activos” is a composite (rabies obs + bite cases + lepto/hidat) — not `outbreak_signal`. Vigilancia aside is placeholder copy only. Mortality/compliance blocks push the actionable signal **below the fold**. | `app/gob/page.tsx:324-342`, `594-611` | Add a **“Señales recientes”** strip (top 3 `OutbreakSignalRow`) above the fold, or retitle/relink the danger KPI to `/gob/vigilancia/brotes`. |
| 2 · Open vigilancia | Rich dashboard: map, compliance KPIs (A7/A8/A12), honest k-anon notes, `OpBreach` for external-notification gap, recent signals panel | **English leak:** “Signals recientes”. Rabies breach links to **`/admin/observaciones`** — wrong portal for a `govt` user on `/gob`. “Brotes activos” KPI tooltip says “estado open” but query counts **all** `outbreak_signal` in 30d (no open filter). Disease summary table is **count-only** — no drill. | `app/gob/vigilancia/page.tsx:287-296`, `401-411`, `560-562`, `714-718` (via `lib/analytics/govt-dashboards.ts`) | Localize copy; link breach to a **govt-scoped** rabies queue; align KPI label/query; add row href → filtered brotes or pet. |
| 3 · `/gob/vigilancia/brotes` | Full signal list, jurisdiction + period filters, “Solo verificados institucionalmente” tier filter, `ConfidenceBadge` | **`?signalId=` is a dead parameter** — preserved in a hidden form field but never used to scroll, highlight, or open detail. Row click → same list with no affordance change. TODO comment admits missing disease chips. | `app/gob/vigilancia/brotes/page.tsx:39`, `142`, `132`; `OutbreakSignalRow.tsx:38` | Implement signal deep-link: filter-to-one, scroll-into-view, expand panel with pet + “Abrir investigación” + link to source event. |
| 4 · `/gob/vigilancia/zoonosis` | Disease rollup table (24h/7d/30d), trend chart | **Analytic-only** — no path to a specific pet/signal/case. No per-disease drill (TODO at line 109). | `app/gob/vigilancia/zoonosis/page.tsx:109-117` | Make disease rows link to `/gob/vigilancia/brotes?diseaseCode=…`. |
| 5 · Open investigation | Prefill from signal (`diseaseCode`, `signalId`); SNVS honesty `OpBreach`; server stores `signal_link` case event | Extra click vs one-step “Investigar”; signal field is **raw UUID** (operator-hostile); accents missing (“investigacion”, “situacion”); uses `router.push` (not the project’s post-mutation reload pattern). | `OutbreakSignalRow.tsx:75-80`; `OpenInvestigationForm.tsx:76`, `83-93`, `39` | Primary CTA on signal row: **“Abrir investigación”** (skip brotes hop); show pet name + disease, hide UUID behind “Signal vinculada ✓”. |
| 6 · Investigation detail | Status pills, epidemiological dataset vs timeline split, external-notification structured fields, `InvestigationActions` with min-length reasons, normativa block, persistent SNVS honesty banner | **No pet drill.** Investigations are `primaryPetId: null` by design; linked signal appears as timeline text only — **no link to pet, event, or libreta**. No freshness footer. Back link goes to list, not the signal/brotes context. | `lib/infra/case-queries.ts:817-818`; `investigaciones/[caseCode]/page.tsx:103-108`, `205-224`; `outbreak-investigation.ts:178` | Resolve `signal_link` → pet public token + symptom event; render **“Ver mascota / Ver evento origen”** in header. Add `DashboardFreshnessFooter`. |
| 7 · Drill to pet | `SurveillanceSignal` already carries `petPublicToken` | **No govt navigation path.** Omnibox explicitly returns **no pets** for admin/govt (`omnibox-search.ts:246-256`). Row link goes to brotes, not pet. Home “Casos regulatorios” pet link targets `/mis-mascotas/…` — wrong surface for institutional operators. | `OutbreakSignalRow.tsx:60-61`; `lib/infra/omnibox-search.ts:246-256`; `app/gob/page.tsx:577-582` | Add govt pet read surface (or scoped `/gob/mascotas/[token]`) and link from every signal/investigation; optionally restore pet results in omnibox with PII audit. |

### Click budget (signal → investigation open → pet)

| Path | Clicks | Context switches |
|---|---|---|
| Home KPI → vigilancia → signal → “Abrir investigación” → submit form | **~5 + form** | 4 full pages; list scroll lost each time |
| Same + attempt pet | **+∞ (blocked)** | No in-app route |

Compare: Linear/ServiceNow would be **1 click alert → inspector** with entity link in the header.

### What’s genuinely good (credit)

- `OpKpi` v2 pattern on home/vigilancia: delta, sparkline, drill `href`, honest caveats (PPP 0%, k-anon suppression counts).
- `DashboardFreshnessFooter` — “Calculado al … · último evento …” (`DashboardFreshnessFooter.tsx:57-59`).
- Confidence tier + verified filter on brotes (`OutbreakSignalRow.tsx:58-59`, `brotes/page.tsx:88-103`).
- Investigation audit model: typed epidemiological entries, external notification payload, escalate/close with minimum reason lengths (`InvestigationActions.tsx:234-269`).
- Scope chip always in topbar (`app/gob/layout.tsx:89-93`).

### Highest-leverage fix (Journey 1)

**Close the signal → pet loop in one PR:**  
(1) Fix `?signalId=` on `/gob/vigilancia/brotes` (highlight + detail drawer).  
(2) Add **“Ver mascota →”** using existing `petPublicToken` in `OutbreakSignalRow` / investigation header (resolve via `signal_link`).  
(3) Surface top-3 signals on `/gob` above the fold.

Without (2), the journey ends at an epidemiology notebook — not at the animal the officer must act on.

---

## Journey 2 — Welfare officer’s case work (queue → resolution → export)

**Target path:** `/gob/maltrato` → detail → assign/triage → timeline → MPF export.

**Verdict: YES-WITH-FIXES** — queue infrastructure is real (keyset pagination, URL tabs, scope-safe SQL, location-view audit); **triage UX and legal export guardrails** aren’t yet daily-driver quality.

### Friction log

| Step | What works | What breaks | File:line | Fix |
|---|---|---|---|---|
| 1 · Queue `/gob/maltrato` | Four queue tabs via `UrlTabs` (full-page nav — intentional, router-drop safe); keyset pagination; KPI strip; scope warning; freshness footer | **KPI “Sin asignar” links to `?queue=urgent`** — urgent = critical/high severity, **not** unassigned (`buildMaltratoListConditions` urgent vs unassigned metric). **PeriodPicker is decorative** — `period/from/to` never hit the query. **kind/severity/status** parsed from URL but **no filter UI**. Tab badges absent (can’t see urgent count). | `app/gob/maltrato/page.tsx:248-252`, `241-244`, `81-83`, `209-214`; `govt-dashboards.ts:1268-1287`, `1317-1321` | Fix KPI href → `?queue=all&status=open` + unassigned filter, or add `queue=unassigned`. Wire period to SQL or remove picker. Add facet chips + tab badges. |
| 2 · Triage row | Severity/status pills, reference code, jurisdiction, time-ago, whole-row link | Row doesn’t show **assignee name**, **SLA/overdue** badge, or **kind** at a glance beyond title. “Atrasadas” tab exists but row doesn’t surface **days open**. | `WelfareDenunciaRow.tsx:74-89`; `govt-dashboards.ts:1280-1284` | Add assignee column, overdue pill (>7d open), severity sort default on Urgentes. |
| 3 · Open detail | Scope-safe `notFound`; **location view audited** before render; exact coords labeled “uso oficial (Ley 14.346)”; rich cards (subject, evidence, reporter PII); timeline merges case + pet events; decomiso prefill with pet token | **Not a hub** — long vertical scroll; **actions fragmented** (assign top, triage mid, derivation/decomiso/MPF/timeline bottom). **`caseId` never linked** to unified `/casos/[publicCode]` (`CaseDetailShell` exists but unused). **`subjectPetToken` only used for decomiso**, not shown in Sujeto card. | `maltrato/[id]/page.tsx:125-127`, `335-347`, `462-544`; `CaseDetailShell.tsx` | Migrate to `CaseDetailShell` tabs (Resumen / Timeline / Acciones / Export) or sticky right-rail “Siguiente paso”. Link registered pet + `/casos/…`. |
| 4 · Assign | Optimistic “Asignármela” / “Desasignar”, no banned `router.refresh()` | **No audit_log** on assign (by design in `assign-welfare.ts`). Assigned-to chip doesn’t update from server without manual refresh if another operator assigns. No “assign to colleague”. | `AssignmentActions.tsx:32-56`; `assign-welfare.ts` | Add audit + optional assignee picker for admin; refresh assignee chip after action. |
| 5 · Triage / close | Status-gated buttons; **≥10 char** mandatory notes; full-page reload after mutation (correct per nav doctrine) | Workflow labels overlap (“Marcar revisada” vs “Iniciar seguimiento”) with no guided “what’s next”. Actions sit **above** evidence/map — operator reads context then scrolls back up. | `TriageActions.tsx:71-98`, `313-321` | Single **“Siguiente paso recomendado”** banner driven by status; move Acciones to sticky footer. |
| 6 · Timeline | Visual timeline with actor names, pet_event bridge | At **bottom of page** — easy to miss during triage. No link from `pet_event` entries to event detail. | `Timeline.tsx:37-57`; `page.tsx:546-552` | Promote timeline to tab 2 in shell; link pet events. |
| 7 · MPF export | Backend: scope guard, PDF pipeline, **`welfare_mpf_export_generated` audit**, 24h idempotency | UI: **one click, no confirm, no reason/evidence, no triage gate** — available even on untouched `open` reports. Legal copy mentions MPF CABA but button doesn’t warn **jurisdiction**. | `MpfExportButton.tsx:20-42`, `106-109`; `generate-mpf-export.ts:118-142`, `232-242` | `ConfirmDialog`: “Confirmar export fiscal” + optional expediente ref (≥5 chars) stored in audit payload; disable or warn until `triaged`/`in_progress`. |

### Click budget (queue → assign → triage → export → back)

| Step | Clicks |
|---|---|
| Home → maltrato | 1 |
| Tab (e.g. Urgentes) — **full page reload** | 1 |
| Open case | 1 |
| Asignármela | 1 |
| Marcar revisada (open form → Confirmar) | 2 |
| Scroll to Export fiscal | 0 (scroll tax) |
| Generar PDF MPF | 1 |
| ← Volver al listado | 1 (**loses tab + cursor + scroll**) |
| **Total** | **~8 clicks + scroll** |

ServiceNow would preserve queue state in a split view; Linear would keep the list filtered and scrolled.

### PII / legal-register assessment

| Area | Assessment |
|---|---|
| Queue | No reporter PII in list ✅ |
| Detail map | Exact coords + `logWelfareLocationViewed` ✅ strong |
| Reporter block | PII appropriate for govt role ✅ |
| MPF export | Backend audit ✅; **UI guard insufficient** for Ley 14.346 workflow |
| es-AR copy | Mostly good; home CTA **“Acta de infracción”** for maltrato queue is **legally misleading** (`app/gob/page.tsx:232-237`) — denuncias ≠ acta |

### What’s genuinely good (credit)

- `buildMaltratoListConditions` — scope intersection, moderation exclusion, queue predicates (`govt-dashboards.ts:1212-1290`).
- Keyset pagination with honest total count header (`maltrato/page.tsx:153-207`).
- Welfare timeline pulls `case_events` org intervention notes — gov was previously blind (`fetchWelfareTimeline` comment at `govt-dashboards.ts:1458-1460`).
- `UrlTabs` document navigation documented and justified (`UrlTabs.tsx:23-31`).
- `loading.tsx` on maltrato segment.

### Highest-leverage fix (Journey 2)

**Master–detail shell for `/gob/maltrato`:** list pane (40%) + detail pane (60%) on desktop, preserving `queue`, filters, and keyset cursor in the URL. Short-term unblock: fix **Sin asignar → urgent KPI href bug** and add **MPF confirm + audit reason** — both are trust-breaking for daily use.

---

## Summary verdicts

| Journey | Verdict | One-line rationale |
|---|---|---|
| **1 · Sanitary morning** | **YES-WITH-FIXES** | Dashboards inform well; **cannot reliably reach the pet** or deep-link a signal. |
| **2 · Welfare case work** | **YES-WITH-FIXES** | Queue SQL is serious; **UI triage + export + list context** lag the backend. |

---

## Recommended implementation order (feeds next pass)

1. **P0 · Journey 1:** Pet drill from signals + fix `signalId` deep-link + home signal strip.  
2. **P0 · Journey 2:** Fix unassigned KPI href; MPF confirm dialog with audit reason.  
3. **P1 · Both:** Master–detail layout (or `CaseDetailShell` adoption on maltrato).  
4. **P1 · Journey 1:** Govt pet lookup (omnibox or `/gob/mascotas/[token]`).  
5. **P2 · Journey 2:** Faceted filters UI + tab badges + wire/remove PeriodPicker.

---

## vs Linear / Palantir / ServiceNow (opinion)

MiMAR has **Palantir-grade honesty** (degraded metrics, k-anon, SNVS gap banners, freshness stamps) but **pre-2010 ServiceNow navigation** (full page everywhere, no inspector, no saved views). The gap is not data modeling — it’s **interaction architecture**. The components to close that gap already exist in `components/ui/dashboard/`; they’re just not wired into these two highest-value journeys yet.
