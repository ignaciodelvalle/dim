# Operator dashboards — fix roadmap (synthesis)

Synthesis of 5 independent inputs on the operator dashboards (`/gob`, `/admin`, `/org`), 2026-07-04:
- 3 internal portal audits: `capstone/dashboards-{gob,admin,org}` (+ handoffs `2026-07-04-{gob,admin,org}-*-audit.md`)
- Cursor `/gob` core-journeys second opinion (`2026-07-04-gob-journeys-review.md`)
- The four-actor / Endsley literature critique (PO-provided)

## The signal: convergence

Five independent methods land on the SAME systemic backbone. When that many agree, it's the roadmap, not noise:

1. **Master-detail / shared-component adoption.** `CaseQueue`, `CaseDetailShell`, `OpBulkBar`, `OpScopeChip` EXIST but the highest-value case surfaces hand-roll instead: `/gob/casos` + `/admin/casos` bypass `CaseQueue` (divergent, gob has zero filters); welfare detail doesn't use `CaseDetailShell`; surveillance has no queue/inspector. Cursor: *"Palantir-grade honesty, pre-2010 ServiceNow navigation — the fix components already exist, just unwired."*
2. **Pagination/search not extended.** The keyset pattern exists (`lib/utils/keyset-pagination.ts`, used in `/gob/casos`, `/gob/maltrato`, org `/adopciones`) but 6 org list routes (`mascotas`, `transferencias`×2, `voluntarios`, `propuestas`, `miembros`) + `/admin/moderacion` (caps 500) are unbounded.
3. **KPI-definition-as-code catalog** (the highest-leverage NEW idea). No documented numerator/denominator per KPI → the "42% vs 54% same label" class. A `lib/metrics/*` docstring convention (num/denom/source/cadence) is the antidote. VERIFIED absent.
4. **PII-safe jurisdiction scoping.** `/gob/servicios` + `/gob/disputas` fetch all-jurisdiction PII then filter in JS (AGENTS.md anti-pattern). Isolation is per-query discipline (also the capstone multi-tenancy finding).
5. **Operational vs analytical split** (Few) + **exceptions-before-averages** (Endsley/Grafana): breaches/queues up top, trend charts in an analytical tab.

## Already fixed (cross-checked against HEAD — do NOT re-fix)
- Owner "AL DÍA vs 0 DE 3" contradiction → `PetHealthStatusStrip` says "Sin pendientes" by design (2026-07-03).
- Org adoptions crash on active rows → fixed + regression test (#19).
- `/gob/casos` pagination → keyset done. Vet bite-report capability-gating → fixed. Maltrato/Bienestar/Investigaciones triple-naming → fixed. Org `OpScopeChip` tenancy → solid.
- Panorama "single zoom control" → being built now (IA v2).

## Fix waves

**Wave A — HIGH (security/PII + real bugs) — LAUNCHED**
- `/gob` (opus, a05f2fd): raw JSON payload dump in `/gob/cola/[publicToken]` [PII]; `servicios`+`disputas` SQL-scope [PII/isolation]; home filter-contract mismatch; investigation-create `router.push` dup-submit; govt analytics unbounded-hang (add admin's `loadWithTimeout`).
- `/org` (sonnet, a2c301db): 6-list pagination/search; censo species dead param; `OrgMascotasBulkList` i18n leak; confirm dialogs on Devolver/Eliminar; nav-coherence.

**Wave B — systemic (next)**
- Wire `/gob/casos` + `/admin/casos` onto `CaseQueue`/`CaseQueueFilters`; welfare detail onto `CaseDetailShell` (master-detail). Extract shared Outbox component (`/admin/outbox` canonical). `/admin/moderacion` keyset. `AdminKpiStrip` parity on `/gob`.
- **KPI catalog**: `lib/metrics` num/denom docstring convention + a canonical registry; disambiguate the cobertura labels.

**Wave C — polish**
- `/gob/historial` jurisdiction-scoped + filterable audit; CSV export on poblacion/censo/adopciones/campanas; bulk assign + timeline entry on `/gob/maltrato`; operational/analytical split on `/gob` vs `/gob/analytics`.

## Deferred (per PO decision 2026-07-04)
Endsley level-3 projection/simulation ("predict coverage in 90 days"), any derived composite score, any prescriptive next-action recommendation — **cut**: "solo data útil, no inventamos métricas ni recomendamos next-actions aún."

## Strength worth banking
No PII-plaintext or k-anon defects found in the entire sweep; suppression honestly disclosed; org-scope tenancy solid; the honesty layer (degraded metrics, freshness, provenance) is genuinely production-grade.
