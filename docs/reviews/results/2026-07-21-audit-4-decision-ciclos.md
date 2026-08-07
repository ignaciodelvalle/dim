# Level 4+5 Audit — Decision Density & Complete Cycles/Facades (2026-07-21)

Read-only audit, no edits made. Scope: main operator dashboards (`/gob/*`, `/admin/*`, `/org/*`) and key citizen flows (`app/(app)`, `app/(public)`). Executed as four parallel role-scoped sub-audits (owner+public, org+vet, govt, admin), synthesized here. Findings saved to Engram, project `dim`, topic_key `nivel-siguiente-audit` (owner obs `c5c733f6c926e7ed`, govt obs `#1552`; org/vet and admin also saved under the same topic — see note on topic-key collision at the end of this doc).

Panorama (`/gob|admin/panorama`) and the `/admin/usuarios` chip KPI were deliberately treated as low-priority / already-fixed by each sub-agent, per recent commits (`c44878d1` dock redesign, prior `admin/usuarios` fix) — not re-audited here.

---

## Part A — Level 4: Decision density / progressive disclosure

### Owner / public surfaces

- **`app/(public)/perdidas/page.tsx`** (`QuickFilterRow`, ~L251-305) + **`LostFiltersBar.tsx`** (~L150-167) — the same three filters (microchip, castrado/a, recency) are exposed **twice** at equal weight: once in the full filter form, once as a separate "Filtros rápidos" chip row. No primary/secondary distinction. *Fix: keep one control surface — either make the chip row a read-only echo of active filters (as `AdoptionFiltersBar` already correctly does), or drop the duplicated fields from the full form.*
- **`app/(app)/cuenta/page.tsx`** (~L363-387, "Rol y organizaciones") — 4 full-weight `ActionRow`s (Ofrecerme como hogar de tránsito / Propuestas / Activos / Historial) render unconditionally, at the same visual weight as core org rows, even for an owner with zero fostering engagement and all-zero badges. *Fix: collapse to a single "Tránsitos" entry point when there's no pending/active/historical foster activity; expand to the 3 sub-links only once engaged.*
- No other owner/public screen inspected (`/mis-mascotas`, pet profile, `/nueva`, `/adoptar`, `/refugios/[orgToken]`, `/notificaciones`, `/transferencias`, `/turnos/buscar`) showed gratuitous complexity — prior audit cadences (owner-ia-redesign P1-P5, "tarjeta-todo") already trimmed duplicate/dead controls here.

### Org / vet surfaces

- **`app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx`** (list card, ~L377-452) — a single pet in `shelter_custody` can show up to **6 simultaneous CTAs** in one flat `flex-wrap` row (Asignar tránsito, Cerrar tránsito, Elegibilidad, Publicar en adopción, Finalizar adopción, Devolver al dueño, Transferir); only 2 have filled/solid treatment, the rest are visually identical outlined buttons. *Fix: one primary CTA per lifecycle stage; move secondary actions behind an overflow menu once &gt;2 apply.*
- **`app/org/[orgToken]/mascotas/page.tsx`** filter form (~L249-310) — 3 independent controls at equal weight; acceptable today, will read as clutter once combined with a pipeline-board view. Minor, not urgent.
- The org dashboard (`page.tsx`), censo, transitos, adopciones queue, and servicios screens already show deliberate hierarchy (KPI demotion, `<details>`-collapsed permission catalog, role-first "Tu tarea principal" framing) — good templates to imitate elsewhere, not offenders.

### Govt surfaces

- **`app/gob/vigilancia/page.tsx`** — **8 KPI tiles across two visually-identical grids**, distinguished only by an `aria-label` (screen-reader only) — no visible heading separates "Indicadores de vigilancia" from "Indicadores de cumplimiento sanitario." A sighted user sees one undifferentiated wall of 8 equal-weight tiles. *Fix: add a visible section heading between the two KPI groups, and consider demoting the compliance-indicator group to a secondary/collapsed row.*
- **`app/gob/programa/page.tsx`** — 6 KPI tiles + 2 tables + 2 cards; partially mitigated by href drill-downs on most tiles, but still the densest single-screen composition among the govt dashboards.
- This KPI-row-overload pattern is **systemic across multiple govt dashboards**, not a one-off — worth fixing once at the shared KPI-tile-row component level rather than screen-by-screen.

### Admin surfaces

- **`app/admin/programa/page.tsx`** (via `app/gob/programa`) — 6 North-Star KPI tiles (vs. the 4-tile norm elsewhere in the portal) plus a stacked PII-oversight table + data-quality scorecard + cron-health list below. *Fix: demote 2 KPIs that already have dedicated pages into a secondary row; collapse PII-oversight/data-quality/cron-health under a "Diagnóstico" disclosure.*
- **`app/admin/inteligencia/page.tsx`** — "Calidad de datos por provincia" table has **9 columns**. Honestly captioned/footnoted (privacy/k-anon disclosures throughout) so not a facade, but the densest table in the portal. *Fix: split rank/score from the 6 completeness-signal columns into an expandable row detail.*
- **`app/admin/sistema/crons/page.tsx`** — a genuinely read-only ops screen sitting in the primary product nav with zero in-UI action (operator is told to check Vercel logs / curl externally). Discloses this honestly, but reads as dev/ops tooling wearing an admin-screen costume. *Fix: either add the one action that would make it real (manual trigger, confirm-gated), or move it out of primary nav into a "Diagnóstico" sub-link.*
- Contrary to the audit's own hypothesis, `/admin/auditoria` and `/admin/libro` — expected to be raw data dumps — turned out to be well-built: auditoría collapses consecutive same-actor/action runs into expandable groups; libro expands amendment chains inline. **Not** offenders.
- Everything else audited (cola, moderación, observaciones, censo, población, historial, adopciones) has a clear primary decision and appropriately scoped filters.

---

## Part B — Level 5: Complete cycles & facades, per role

### Owner (citizen)

**Facades inventory**

| Feature | State | Evidence |
|---|---|---|
| Movilidad jurisdiccional / `/mis-mascotas/[publicToken]/viaje` | **Honest facade — already fixed by the team** | `viaje/page.tsx` carries a "UX HONESTY PASS (2026-07-19)" comment: no writer anywhere emits `transport_recorded` (only `jurisdiction_changed` via `/mudanza`); page now renders an `LnEmptyState` "Próximamente" instead of the old semáforo/checklist. `MasSheet.helpers.ts` (~L99-114) disables the "Viaje y movilidad" menu item with a "Próximamente" badge. Underlying code (`lib/projections/travel-compliance.ts`, `lib/reference/cross-border-corridors.ts`) is untouched and ready to re-wire. **AGENTS.md line 1113 is stale** — still claims ✅ "en producción" with a working PDF export. |
| Foster/tránsito cycle (`/cuenta/ofrecerme-como-transito` → propuestas → activos → historial) | **Real, complete** | Offer → shelter proposes (accept/reject, 7-day expiry) → active (`CoFosterToggle`) → closed via `ConvertFosterButton`/`buscar-hogar`. No dead ends. |
| `lib/infra/owner-nudges.ts` (`fetchPetHealthNudges`) | **Orphaned dead code** | Zero call sites outside tests. The component it was built for (`PetHealthStatusStrip.tsx`) no longer exists — superseded by "tarjeta-todo" consolidation. Fully privacy-reviewed, tested logic (vaccine-overdue, chip-missing, scan-activity, sterilization nudges) computes real value rendered nowhere. **AGENTS.md line 1112 is stale** — claims ✅ shipped on the pet profile. |

AGENTS.md spot-check (8 owner-facing ✅ rows, L1093-1120): 6/8 check out; 2 stale as above; one minor drift — the inventory cites `/mis-mascotas/[publicToken]/turnos` for the owner's own agenda; the real route is top-level `/mis-turnos`.

**Regalos olvidados**
- `lib/infra/owner-nudges.ts` — full per-pet health-nudge derivation, tested, unused (see above).
- `pets.acquisitionMethod` — collected in `PetForm.tsx`/`MinimalNewPetForm.tsx` (feeds EAH-2018 govt trend analytics) but never displayed back to the owner anywhere (credential, libreta identity header, timeline) — only visible by reopening the edit sheet.
- Verified **not** a gap: `disposition_method` renders via the `eventPayloadDetails` fallback in `asiento-fields.ts`; PPP flag and service-dog flag both surface on the credential.

**Narrative clarity**: no failures found on the named screens. `/viaje`'s "no what-can-I-do beyond going back" is the deliberate, disclosed outcome of the honesty pass, not an oversight.

**Incomplete cycles**: none found in foster, adoption postulación, or transfer flows. The travel-writer gap is a disclosed facade, not a silent dead end.

**Verdict**: Owner-role cycle-completeness is strong. The team's own audit cadence already found and fixed most facades (including the one genuine one, cross-border travel). Residual issues are documentation drift (AGENTS.md overclaiming 2 features past the team's own fixes) and one dark, tested module (`owner-nudges.ts`) never wired to a screen.

---

### Org / Vet

**Facades inventory**

| Feature | State | Evidence |
|---|---|---|
| Custody transfer **cancel** (sender side) | **Facade** | `cancelCrossOrgTransferAction` (`src/modules/transfers/actions.ts:600`) exists with zero callers in `app/`/`components/`. `app/org/[orgToken]/transferencias/page.tsx` only offers "Ver caso →" — no cancel button anywhere. AGENTS.md L1137 claims "two-phase: propose/accept/cancel" ✅ shipped; the cancel phase isn't reachable. |
| Adoption reversal (`adoption_reversed`) | **Facade** | Event modeled end-to-end (metrics, timeline labels) but no creating action/form exists in `app/` — only seed scripts/tests write it. AGENTS.md L1138 calls this "✅ shipped"; there is no UI path to trigger it. |
| Post-adoption check-ins | **View-only** | `app/org/[orgToken]/checkins/page.tsx` lists overdue/upcoming/received check-ins with **zero action buttons** — no contact-adopter, no escalate, no manual resolve. |
| Custody transfer propose→accept/reject | Complete | Wizard → salientes/recibidas lists → accept/reject actions → case closes with `closedReason`. |
| Foster assign/end + unified `transitos` surface | Complete | Genuinely unifies pool/member/vecino; inline end-foster; historial preserves ended rows. |
| Adoption submit→review→finalize | Complete | Review (approve/reject/request_info) → finalize (application or offline/foster-shortcut path). |
| Servicios create→agenda→booking→manage | Complete | Offering → agenda + materialize-slots cron → booking list → mark attended/no-show/cancel. |
| Bulk operations (Sprint 8 #399-401) | **Confirmed real, not stale** | `app/actions/bulk-pet-events.ts` fully implements bulk vaccinate/eligibility/publish with per-pet failure tracking + audit trail. AGENTS.md's older "deferred" framing (Open questions) is stale; the Feature-inventory ✅ is accurate. |
| Pets no-aptas | Complete | Each row links to `/mascotas/[token]/eligibility` to actually change the reason. |
| Capability grants | Complete | Request → approve/deny → revoke, full cycle. |

**Regalos olvidados**: none of substance — coverage zones, census, member capability grants, and foster-pool fields are all genuinely consumed somewhere.

**Narrative clarity**: `checkins/page.tsx` is clear on WHERE AM I / WHAT JUST HAPPENED but **absent on WHAT CAN I DO** — a status-only surface on what should be an "act on this" screen. `servicios/[offeringToken]/page.tsx` has a stale maintainer-facing comment claiming schedule-rules CRUD isn't built, contradicting the shipped `./agenda` subroute (doc drift, not user-facing).

**Incomplete cycles**: (1) custody-transfer cancel — action layer built, UI never wired; (2) adoption reversal — modeled, no UI; (3) post-adoption check-ins — create-but-not-manage.

**Verdict**: The org/vet portal's primary daily-loop cycles (intake→custody, foster, adoption, transfer-accept, service booking, bulk ops) are genuinely complete and well-built — but three specific AGENTS.md ✅ claims (transfer-cancel, adoption-reversed, check-in actionability) are facades where the domain/event layer outpaced the UI.

---

### Govt (funcionario)

**Facades inventory**

| Feature | State | Evidence |
|---|---|---|
| `/gob/analytics/export` | **Genuine orphan** | Header comment: "DEFERRED BY DESIGN... NOT reachable from any nav or dashboard CTA," confirmed via repo-wide grep (zero live links, only comments reference it). Its four backing fetchers (`fetchPetsForExport`, `fetchEventsForExport`, `fetchCasesForExport`, `fetchOrganizationsForExport` in `lib/analytics/dashboards/exports.ts`) are fully implemented and correctly serialize every field — the waste is reachability of the whole feature, not dropped fields. |
| Decomiso → temporary custody → refugio chain | **Complete — AGENTS.md is stale** | `app/gob/decomisos/**` + `src/modules/decomiso/application/*`: execute → accept-handoff/reject-handoff/reassign/return-to-owner → closed, phase-labeled dashboard. AGENTS.md's "Open questions" (~L1345, "authority-side portal and UX are open") should be updated to done. |
| Campañas / Servicios (gov-side) | **Real screens, narrower gap than documented** | Both are fully-built monitoring + approval-queue screens, not stubs — but govt still cannot **create/schedule** a campaign (only orgs submit offerings; govt reviews/monitors). AGENTS.md's "gov-side scheduling" open question is still valid, just narrower than the doc implies. |
| Maltrato, Moderación, Disputas | Complete | All have full triage → action → terminal-state cycles; no facades found. |
| Reglas (`/gob/reglas`) | Complete | Correctly mirrors admin with a genuine read-only govt lens. |
| Suscripciones / Outbox / Sistema | Real, not leftover admin concepts | `sistema` cleanly redirects govt into `programa`. |

**Decision density**: see Part A — the 8-tile vigilancia dashboard is the standout offender, systemic across dashboards.

**Regalos olvidados** (in `lib/analytics/dashboards/surveillance.ts`):
- `fetchCasesPerCapita` (`ProvinceCasesPerCapita` — province/code/count/`ratePer10k`, INDEC-2022-adjusted) is fully built and unit-tested with **zero callers anywhere in `app/`**. A comment in `app/gob/analytics/page.tsx` confirms a per-capita choropleth using this exact data was "demoted per PO review" and never replaced. This is the single biggest forgotten gift in the whole audit — a ready-to-render, population-adjusted metric sitting completely dark.
- `fetchCasesPerLocality` — called once (`/gob/vigilancia`), but its `province`/`locality` string fields are computed every render and then dropped; only `code`+`count` reach the choropleth.
- `fetchSurveillanceSignals` — fetches `petId`/`petPublicToken` per signal, but `OutbreakSignalRow.tsx` never links out to `/p/{token}`, inconsistent with `/gob/perdidas`'s `LostPetRow`, which does link to the pet's public credential from an equivalent row. One-line fix.
- `fetchOutbreakHistory` — `diseaseCode` is fetched but `OutbreakHistoryTable.tsx` never reads it, not even as the React list key (uses array index instead).
- Everything else checked (`fetchAnalyticsMetrics`, `fetchWelfareMetrics`, `fetchPerdidasMetrics`, `fetchVigilanciaMetrics`, `fetchZoonosisTrend`, `fetchWelfareTimeline`, `computeDiseaseSummary`) has every returned field rendered somewhere.

**Narrative clarity / incomplete cycles**: not separately itemized by the sub-audit beyond what's captured above; maltrato/moderación/disputas were independently confirmed to have full triage→terminal-state cycles, implying adequate "what can I do" clarity on those screens. No incomplete cycles found beyond the orphaned export route and the campaign-scheduling gap already listed above.

**Verdict**: The govt portal's core queues (maltrato, moderación, disputas, decomiso) are complete end to end, and AGENTS.md's "Open questions" section is measurably behind the code — at least two entries (decomiso portal, campaign-UX framing) should be tightened or closed in a doc pass. The standout product loss is `fetchCasesPerCapita`: real, tested, population-adjusted epi data that a PO review demoted and nothing replaced.

---

### Admin

**Facades inventory**

| Feature | State | Evidence |
|---|---|---|
| `/admin/reglas` (business rules console) | **Partial facade** | The write-side (create/edit) `RULE_FORM_REGISTRY` covers only 8 of 9 wired rule types — missing `microchip_required` (migration 0150, live and driving a real owner-facing compliance card). Admin has **no UI path to ever create a per-jurisdiction override** for it; the read-only govt lens can resolve/display it but admin's editing lens can't configure it. Additionally, the admin cascade-editing lens **fails WHERE AM I**: "Reglas activas" only shows rules configured at the exact level being viewed (no label saying so), and "Tipos sin excepción" can show the wrong "what applies here" value when a higher-level (country/province) override actually governs — an admin can't tell whether a shown rule is truly in effect or masked by an inherited override. The read-only govt lens (`SOURCE_LABEL`) gets this right; the admin editing lens doesn't. |
| `/admin/cola`, `/admin/moderacion`, `/admin/observaciones` | Complete | Full pending→decision cycles; observaciones shows live progress (días transcurridos, cierre estimado) and a typed-confirmation gate for positive-rabies closure — contrary to the audit's own hypothesis that this would be entry-only. |
| `/admin/inteligencia` | Real, not a stub | Full derived-metrics pipeline. |
| `/admin/suscripciones` | Real, not a stub | Create/toggle/delete threshold alerts with a live breach banner. |
| `/admin/admins/new`, `/admin/govts/new` | Complete | Create → magic-link panel → detail page → deactivate/reset-credentials/assign-revoke-locality, reflected in the list. |
| `/admin/outbox` | Real, honestly scoped | One real action (retry), explicitly disclosed as async (next drain cycle, not instant). |
| `/admin/servicios`, `/admin/organizaciones`, `/admin/casos`, `/admin/alertas` | Complete | Approve/reject/verify/revoke/triage all persist and reflect back into the list. |
| `/admin/acerca/integracion-miarg` | Honest stub | Banner discloses "Integración en desarrollo — vista ilustrativa," disabled CTA — doesn't pretend to work. |

**Regalos olvidados**:
- `microchip_required` rule type: read surface exists (govt cascade view), write surface (admin form registry) doesn't.
- `travel_corridor_requirements` is reserved in the DB CHECK constraint (migration 0120) but has zero presence anywhere in the TS domain layer (`GOVT_BUSINESS_RULE_TYPES`, `RULE_TYPE_REGISTRY`, `RULE_FORM_REGISTRY` all omit it) — pure latent schema capacity, unused, low risk since nothing references it.
- PII-query audit logging (`logPiiQueryForAuthority`) is **not** forgotten — `pii_queried` is a labeled, filterable action visible in `/admin/auditoria`'s generic stream.

**Narrative clarity**: `/admin/reglas/[country]/[province]/[locality]` fails WHERE AM I in the cascade sense (see facade above) — the exact question this audit asked to verify, and the answer is no, the admin editing lens doesn't tell you. All other traced screens (cola, moderación, observaciones) are clear on all three questions.

**Incomplete cycles**: `/admin/reglas` cascade config — the write side covers 8/9 rule types and doesn't expose cascade provenance the way the read side does; a genuine create-but-can't-fully-manage gap. No other incomplete cycles found.

**Verdict**: The admin portal is largely well-built with real, closed action cycles, and better progressive disclosure than the audit's own hypotheses assumed (auditoría/libro are not raw dumps). The one substantive gap is `/admin/reglas`: correct resolver, but the editing lens shows less cascade truth than the read-only govt lens and has a live rule type with no admin write path.

---

## Part C — Cross-cutting synthesis

### Top decision-density offenders (ranked)
1. **`app/gob/vigilancia/page.tsx`** — 8 KPI tiles, two grids distinguished only by an SR-only label. Systemic pattern worth a shared-component fix, not a one-off.
2. **`app/admin/programa/page.tsx`** — 6 KPIs + 2 tables + 2 cards stacked with no disclosure.
3. **`app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx`** — up to 6 equal-weight CTAs per pet card.
4. **`app/admin/inteligencia/page.tsx`** — 9-column table (honestly disclosed, but dense).
5. **`app/admin/sistema/crons/page.tsx`** — ops tooling wearing an admin-screen costume, zero in-UI action.
6. Duplicate filter controls: `app/(public)/perdidas/page.tsx` (quick filters mirror the full form) and `app/(app)/cuenta/page.tsx` (foster action rows shown unconditionally).

### Top facades (ranked by user/PO impact)
1. **`fetchCasesPerCapita`** (govt) — real, tested, population-adjusted epi metric with zero callers; the single biggest forgotten gift in the audit.
2. **`/admin/reglas` write-side gap** — `microchip_required` has no admin form; the admin cascade lens can't tell you whether a rule is truly in effect or masked by an inherited override (govt's read-only lens can).
3. **Adoption reversal + custody-transfer cancel** (org) — both modeled end-to-end in the domain/event layer, neither reachable from any UI.
4. **`lib/infra/owner-nudges.ts`** (owner) — fully built, tested, privacy-reviewed nudge engine, orphaned since its host component was deleted.
5. **`/gob/analytics/export`** — fully implemented export fetchers behind a page with zero nav/CTA links anywhere.
6. **Post-adoption check-ins** (org) — view-only; no action possible from the one screen meant to let an org act on them.
7. **Viaje transfronterizo** (owner) — the one facade the team already caught and honestly disclosed (empty-state "Próximamente"), not a new finding, but AGENTS.md still overclaims it as ✅ shipped.

### AGENTS.md staleness found (should be corrected in a follow-up doc pass)
- L1112 (owner-nudges) — claims ✅ shipped; feature is orphaned.
- L1113 (viaje) — claims ✅ "en producción" with working PDF export; actually an honest "Próximamente" empty state since the 2026-07-19 pass.
- L1137-1138 (org transfer-cancel / adoption-reversed) — claim ✅ shipped; no UI exists for either.
- L1345 ("Open questions" — decomiso authority-side portal) — stale; decomiso cycle is complete end to end.
- L1354 ("Open questions" — campaign UX) — narrower than stated; monitoring/approval exists, only govt-side scheduling is still missing.
- Feature inventory's cited route `/mis-mascotas/[publicToken]/turnos` doesn't exist; the real route is `/mis-turnos`.

### Per-role cycle-completeness verdict
- **Owner**: Strong. One disclosed facade (viaje), one dark module (owner-nudges), otherwise complete.
- **Org/Vet**: Strong on the daily loop; 3 facades where domain/event layer outpaced UI (transfer-cancel, adoption-reversed, check-ins view-only).
- **Govt**: Strong on triage queues (maltrato/moderación/disputas/decomiso); the analytics layer has real waste (per-capita metric, orphaned export route) and AGENTS.md's open-questions section needs tightening.
- **Admin**: Strong overall; the one substantive gap is the reglas cascade editing lens (write coverage + provenance display), otherwise closed cycles throughout.

### Note on Engram topic-key collision
All four sub-audits were instructed to save under the same `topic_key: 'nivel-siguiente-audit'`, which upserts — a design mistake in how this audit was dispatched. `mem_search` on that key currently surfaces the govt observation (`#1552`, 7 revisions); the owner sub-agent separately reported saving to an observation id `c5c733f6c926e7ed`. Org/vet and admin findings may not be independently retrievable from Engram going forward under this key — this document is the durable record of all four; do not rely on Engram alone to recover the org/vet or admin findings later.
