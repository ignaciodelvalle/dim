# Metrics & operator-IA handoff — master design spec

> **Status:** 🟢 Ready for Claude Code · **Date:** 2026-06-18 · **Owner:** design handoff
>
> This is the **umbrella** for a package (Phase-0 foundation + 7 items) that
> (a) lays a governed projection foundation, (b) regroups the operator navigation
> into sections, (c) surfaces a catalog of public-health, disposal and enforcement
> **metrics** over the existing event log, (d) fixes owner-facing flow/IA debt
> (pet profile reorder + action-hub consolidation), and (e) unifies the three
> chrome systems into one role-variant `AppShell` (fixing the cross-portal
> navigation dead-ends). Items (d) and (e) come from the 2026-06-18 design and
> navigation critiques. Each item is its own spec in
> `docs/superpowers/specs/2026-06-18-*`. Start here, then execute the items in the
> order below. **Every item has closed decisions — nothing is pending owner input.**

## 1. Por qué este documento existe

Two pushes converge here:

1. **Operator IA has outgrown a flat nav.** `/gob` ships 14 flat links, `/admin` 15, `/org` 18. The design intent (a "Primary 7" for gob) is written in a comment in `components/layout/nav-presets.ts` but never expressed in the UI. We already own the primitive to fix this — `OpRailNav` accepts `sections?: NavSection[]` — but the presets pass `nav` (flat) instead.

2. **The event log already holds public-health signal that no screen reads.** The clearest example: `death_recorded` carries `disposition_method`, `facility`, `confirmed_by_vet`, `is_reportable` and `disease_code` (captured today by `DeathRecordForm`), which is exactly the traceability Ley CABA 5470 wants — but nothing aggregates it. Same story for ENO-notification latency, 10-day rabies-observation compliance, microchip penetration and dangerous-breed registry compliance.

The architectural rule from `AGENTS.md` holds throughout: **every dashboard view must be expressible as a projection over the event log.** Nothing in this package adds a table or an event type. The two small schema touches that *might* be tempting (a `disposition_method` column; a materialized metrics table) are explicitly **out of scope** — see §6.

This package was informed by a scan of leading national systems (Estonia's PRIA central register, Sweden/Finland mandatory registries, NZ National Dog Database, UK microchip law, EU ADIS/TRACES). The takeaway that shaped the metric selection: **those systems mostly cannot publish compliance percentages** because their data is fragmented; MiMAR, event-sourced from day one, can. The full cited research + the ~50-metric catalog live in `docs/superpowers/reference-intl-pet-systems-and-metrics.md` and are referenced by metric code (A1, B2, C7…) from each item spec.

## 2. Decisiones cerradas

- **D1 — No new tables, no new event types, no migrations.** Every metric is a read-time projection. If a view can't be expressed over existing events, the answer is to *defer it*, not to add schema. (One exception is flagged and deferred in §6.)
- **D2 — Reuse the `Op*` design system.** All new tiles use `OpKpi`/`OpKpiSm`, cards use `OpCard`/`OpCardHead`/`OpCardBody`, breaches use `OpBreach`, states use `OpStateBadge`. No new chrome.
- **D3 — Reuse the fetcher convention.** New projections land beside the existing ones in `lib/govt-home-kpis.ts`, `lib/govt-dashboards.ts`, `lib/admin-metrics.ts` (or a new `lib/*-metrics.ts` sibling when a file gets large). Each fetcher is jurisdiction-scoped and period-aware, mirroring `fetchRabiesCoverage`/`fetchAnalyticsMetrics`.
- **D4 — Privacy policy is non-negotiable, and now enforced in code.** Every aggregate honors the `AGENTS.md` "Aggregation & privacy policy": k-anonymity suppression (`k=5`) on small cells, no PII in projections, `jurisdiction_locality` as the smallest public unit. The audit found this policy was **documented but never implemented** — no suppression code existed. **Item 0** builds the mandatory `suppressSmallCells` boundary in `lib/metrics/anonymity.ts`; every locality-grouped fetcher (existing + new) routes through it. Items 2–4 consume it rather than each adding an ad-hoc helper.
- **D5 — SDD, test-first, per item.** See §3. No projection ships without a Vitest integration test asserting the count/rate against seeded events.
- **D6 — Nav regrouping is pure refactor.** Same routes, same `href`s, same guards. Only the grouping/order changes. No route is added or removed in Item 1.

## 3. The SDD workflow Claude Code must follow (per item)

Each item spec is executed as its own CC session producing 1+ PRs. Within an item, follow this loop **per phase**:

1. **Read first.** Re-read the item spec, the `AGENTS.md` sections it cites, and the existing sibling fetcher it extends. Confirm the event-type payload shapes in `db/schema.ts` + `lib/event-schemas.ts` before writing a query.
2. **Write the failing test.** Add a Vitest integration test in `__tests__/` that seeds the relevant events (against local Postgres, per the repo's strict-TDD convention) and asserts the expected metric value, including at least one **k-anonymity suppression** case and one **jurisdiction-scope** case. Run it; watch it fail.
3. **Implement the projection.** Add the fetcher in the designated `lib/*` file. Pure SQL/Drizzle in the fetcher; no business logic in the page.
4. **Wire the UI.** Add the `Op*` tiles/cards to the screen. Server component fetches; presentational components stay dumb.
5. **Green + lint.** `pnpm test` (the new test + no regressions), `pnpm lint` (Biome), `pnpm typecheck`.
6. **Docs in the same PR.** Update every `.md` listed in the item's "Docs to update" block. A metric that exists in code but not in `AGENTS.md → Dashboards & projections` is, by the repo's own rule, undocumented and therefore "doesn't exist."
7. **Update the index.** Flip the item's row in `docs/superpowers/README.md` from 🟢 to ✅ with the merge SHA, exactly as the existing rows do.

**Definition of done for the package:** all five item rows are ✅ in the superpowers README; `AGENTS.md` "Dashboards & projections" lists every shipped metric under its audience; the README portal table reflects any new screen (`/gob/mortalidad`); `pnpm test && pnpm lint && pnpm typecheck` is green.

## 4. Items, sequencing & dependencies

Execute top-to-bottom. Item 1 is independent and low-risk (do it first to de-risk the nav surface every later item touches). Items 2–4 are the metric payload. Item 5 is owner-facing and independent.

| # | Item / spec | Scope | Depends on | Priority |
|---|-------------|-------|------------|----------|
| **0** | **Projection primitives** · `2026-06-18-projection-primitives-design.md` | `lib/metrics/`: `ProjectionContext`, single scope/denominator helpers, the **missing k-anonymity suppression boundary**, unified period contract, `React.cache` dedup. Refactor + migrate existing fetchers. | — | **Do first** — foundation for all aggregate tiles; closes a live privacy gap |
| 1 | **Operator nav regrouping** · `2026-06-18-operator-nav-regrouping-design.md` | Convert `GOB_NAV`/`ADMIN_NAV`/`buildOrgNav` to `NavSection[]`; render via `OpRailNav sections=`. Pure refactor + snapshot tests. | — (independent of Item 0) | High (unblocks the new section homes) |
| 2 | **Mortality & disposal dashboard** · `2026-06-18-mortality-disposal-dashboard-design.md` | New `/gob/mortalidad` screen. Metrics B1–B9 (cause mix, disposition mix, traceable-disposal rate, unknown-disposition %, death→deregistration lag, reportable-death share). Ley CABA 5470. | **Item 0** + Item 1 (section "Vigilancia sanitaria") | **Highest leverage** — data exists, no schema work |
| 3 | **Surveillance metrics hardening** · `2026-06-18-surveillance-metrics-hardening-design.md` | Extend `/gob/vigilancia`: ENO-notification SLA (A7), 10-day rabies-observation compliance breach panel (A8/A9), AMR/antibiotic density (A12), reportable-disease incidence (A6), lab-confirmation rate (A10). | **Item 0** + Item 1 | High |
| 4 | **Compliance & enforcement metrics** · `2026-06-18-compliance-enforcement-metrics-design.md` | Panel + Casos + Registro tiles: microchip penetration (C1), ISO-validity (C2), chip-fraud signal (C5), dangerous-breed registry compliance (C7), reunification rate (D4), seizures (D5). | **Item 0** + Item 1 | High |
| 5 | **Owner health-status nudges** · `2026-06-18-owner-health-status-nudges-design.md` | `/inicio` per-pet compliance nudges: overdue vaccine, chip status, next reminder, scan activity. Owner-facing, no authority data. | — | Medium |
| 6 | **Pet profile v2.1 — reorder + action consolidation** · `2026-06-18-pet-profile-v21-reorder-and-action-consolidation-design.md` | Fix profile information ordering (hero-first, single priority `PetAlertStrip`, credentials/achievements inside Resumen) and collapse the 3 overlapping action hubs — `/anotar` is canonical, `/eventos/nuevo` redirects to it. From the 2026-06-18 design critique. **🟢 decisiones cerradas (§9).** | — (pairs with Item 5 on `/inicio` vs profile, via D10) | Medium-High (owner-facing clarity) |
| 7 | **Unified app shell — one shell, role variants** · `2026-06-18-unified-app-shell-design.md` | One `AppShell` (`citizen` top-bar / `operator` side-rail) replacing the 3 chrome systems; single nav source; auth-aware nav that fixes the "logged-in user stranded on public surfaces" bug; single mobile drawer + context switcher. From the 2026-06-18 navigation critique. **🟢 todas las decisiones cerradas (D1–D12, sin pendientes del dueño).** | **Item 1** (consumes its `NavSection[]`) | High (cross-portal coherence + fixes a real navigation dead-end) |

**Recommended execution order:** Item 0 → **Item 1 → Item 7 (navigation train, Fases A→D)** → Items 2/3/4 (build natively on `lib/metrics/`, inside `variant=operator`) → Items 5 & 6 (owner-facing, inside `variant=citizen`). Item 0 fixes a live k-anonymity gap in the *existing* dashboards; Item 7 supersedes Item 1's render layer (`OpRailNav`) while consuming its nav data, so run Item 1 then Item 7. **All seven items + Phase 0 now have closed decisions and are ready for executable plans — no owner decision is pending.**

Cross-cutting reference (no code): `docs/superpowers/reference-intl-pet-systems-and-metrics.md` — research + full metric catalog. Read once before Items 2–4; it justifies each metric and its legal/benchmark anchor.

## 5. Global test & docs requirements

**Tests (Vitest, local Postgres — never against a remote DB):**
- Every fetcher gets an integration test that seeds events and asserts the value.
- Every locality-grouped fetcher gets a k-anonymity test (a cell with `< 5` pets is suppressed/rolled up).
- Every jurisdiction-scoped fetcher gets a scope test (events outside the viewer's jurisdiction don't leak in).
- Nav regrouping (Item 1) gets a structural test: every pre-existing `href` still appears exactly once across the new sections (no route dropped), and capability-gated org items still filter correctly.

**Docs each item must keep in sync (same PR):**
- `AGENTS.md` → **Dashboards & projections** — add each new metric under its audience (Sanitary authority / Public-health analyst / Animal-welfare officer). This is the canonical metric registry.
- `AGENTS.md` → **Feature inventory** — flip/append the relevant rows.
- `README.md` → **Portal surfaces** table — add `/gob/mortalidad` (Item 2) with status Live once shipped.
- `docs/superpowers/README.md` — the index row for the item (status + SHA).
- Inline file-header comments — every new `lib/*` fetcher and new page gets the repo's standard "what this file does" header.

## 6. Lo que NO está en este paquete (explicitly out of scope)

- **No materialized metrics/rollup table.** All read-time. If a projection is too slow at seed scale, add an index, not a table. A rollup layer is a separate future spec once real data volume justifies it.
- **No `disposition_method` schema column.** It already lives in the `death_recorded` payload; the dashboard reads `payload->>'disposition_method'`. Do **not** denormalize it to a column in this package. (If a future spec needs fast cross-jurisdiction disposal queries, that's where the column decision belongs — flagged, deferred.)
- **No new event types.** Metrics like "death under-reporting proxy (B6)" and "registration completeness (C3)" require an external population denominator we don't have a trustworthy source for yet; they are **described in the reference catalog but deferred** — each item spec marks which of its metrics are shippable-now vs deferred-pending-denominator.
- **No external-system integration.** ENO SLA (A7) measures our own `event_notification_outbox` latency, not delivery confirmation from SENASA/SISA. Auto-fire to the ENO authority remains the separate follow-up already noted in `AGENTS.md → SENASA reference vocabularies`.
- **No `/gob/analytics` rebuild.** Items 2–4 add tiles/screens; they do not restructure the existing analytics page beyond adding clearly-scoped new fetchers.
- **No owner-visible diagnoses.** Item 5 nudges are derived from the owner's own events only; nothing surfaces surveillance signals to owners (that override lives in the separate ENO-vet-direct-report spec).

## 7. Decisiones cerradas (resueltas 2026-06-18 — nada pendiente del dueño)

Lo que antes eran preguntas abiertas quedó decidido. Ninguna requiere input del dueño; las marcadas "(CC)" son criterio de implementación de Claude Code, no decisiones de producto.

- **Mortality screen placement → standalone `/gob/mortalidad`.** No tab dentro de Vigilancia. (Item 2.)
- **AMR (A12) → Item 3 agrega `isAntimicrobial(code)`** sobre el catálogo de `lib/drugs.ts`. Si la clasificación de un código es incierta, CC envía A12 como conteo crudo con nota "clasificación provisional" en vez de tasa (CC). No requiere al dueño.
- **Dangerous-breed (C7) → se envía con degradación grácil "0% atestado hasta que exista el form".** "La adopción del registro es 0%" es señal útil para la autoridad, no un bug. No se difiere C7.
- **Suppression enforcement (Item 0 §4.4) → branded `MetricResult` type** (falla en compile-time si un resultado agrupado por localidad omite la supresión). No lint/test rule.
- **Period reconciliation (Item 0) → se acepta el valor corregido y consistente.** Si unificar el panel a `resolveAnalyticsPeriod` mueve un número que antes usaba `since12m` hardcodeado, gana la versión consistente; CC documenta el cambio en el PR.

Diferidos por falta de denominador externo (no son decisiones, son límites de datos): **B6** (death under-reporting) y **C3** (registration completeness) — descritos en el reference catalog, fuera de scope hasta tener fuente de población confiable.

---

## Próximo paso

Paquete completo: **Phase 0 + 7 items, todas las decisiones cerradas, sin pendientes del dueño.** Listo para pasar a Claude Code. Orden recomendado: Item 0 → Item 1 → Item 7 (Fases A→D) → Items 2/3/4 (dentro de `variant=operator`) → Items 5 & 6 (dentro de `variant=citizen`). Cada item es una sesión SDD self-contained (§3). El siguiente artefacto a producir son los `plans/` ejecutables por item (file-by-file), si se quieren antes de ejecutar.
