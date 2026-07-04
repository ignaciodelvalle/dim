# Admin dashboard UX/quality audit — cross-portal parity focus

> READ-ONLY audit. Repo `C:\dev\dim`, branch `integration/all-20260703`. Scope: `/admin/*` operator portal (universal scope), audited against its `/gob/*` (jurisdiction-scoped govt) counterpart for parity. `/admin/panorama` excluded (IA v2 in flight). No code was changed to produce this report.

## A. Executive summary (parity-drift-first)

1. **Worst drift — `/admin/casos` vs `/gob/casos`**: neither uses the shared `CaseQueue`/`CaseQueueFilters` component; both hand-roll divergent list UIs, and `/gob/casos` is strictly poorer (zero filters, `app/gob/casos/page.tsx:62-101`) than admin's raw `<form>` filter (`app/admin/casos/page.tsx:114-168`). No canonical side exists yet — both need migration.
2. **Second-worst drift — `/admin/outbox` vs `/gob/outbox`**: ~90% line-for-line duplicated code (same constants, same table markup) instead of a shared component/query builder. Admin is canonical (has an `[id]` detail route gob lacks; gob's own code comment flags this as a known follow-up, `app/gob/outbox/page.tsx:416-429`).
3. **Reliability asymmetry, not just cosmetic**: admin's analytics quartet (`programa`/`censo`/`poblacion`) wraps fetchers in `loadWithTimeout` + `AnalyticsLoadFallback` (D2 pattern); the identical `/gob` pages use the same fetchers bare, with no timeout guard on 3 of 4 pages. A govt user gets an unbounded hang where an admin gets a graceful degrade — this is the single most repeated one-portal-solved-it-the-other-didn't finding.
4. **5 routes are parity-safe by construction**: `cola`, `usuarios`, `organizaciones`, `reglas` (+ nested), `servicios` are confirmed literal `export { default } from "@/app/gob/..."` re-exports with no hidden admin logic — zero drift risk, portal-follows-viewer pattern working as designed.
5. **`AdminKpiStrip` (built to stop KPI-tile drift per critique C26) has no `/gob` counterpart** — `/gob/page.tsx` and `/gob/programa` duplicate near-identical KPI tiles ad-hoc with copy-pasted `info={{definition,formula,caveat}}` blocks. Same failure mode C26 fixed for admin is live and unaddressed on the gob side.
6. **Admin carries two overlapping audit-trail-shaped routes**: `/admin/auditoria` (true universal log) and `/admin/historial` (self-only, functionally a subset of auditoria's own actor filter) sit in different nav sections with no visual cue they're not the same thing. Gob's equivalent self-only view is honestly labeled "Mi actividad" — admin's isn't.
7. **`/admin/moderacion` silently caps at `.limit(500)` with no pagination**, unlike its sibling `/gob/maltrato` (keyset pagination) and `/admin/outbox` (also keyset) — silent data loss risk once a queue exceeds 500 rows.
8. **Universal-scope indication is unambiguous on both portals** (`SUPERADMIN`/"Universal" chip) — only a cosmetic chip-variant/casing mismatch for the "admin visiting `/gob`" case, not a real ambiguity.
9. **Admin-only surfaces are mostly justified, not gaps**: `alertas` (cross-case-kind aggregation, explicitly commented as intentionally not `CaseQueue`), `libro` (event-sourcing log, oversight tool), `admins`/`govts` (account management, inherently universal), `acerca/integracion-miarg` (federation reference content) — all lack a `/gob` counterpart by design and are reasonably well-built.
10. **k-anonymity applied inconsistently within a single page**: `/admin/censo`'s `registrationTrend` suppresses small cells but its sibling `registryByProvince` (same page, same fetch batch) does not (`lib/metrics/census.ts:442-460`). Safe today at province granularity, but a latent landmine if the fetcher is ever reused at locality level.

## B. Scorecard — route × pattern

Legend: **KPI**=KPI cards w/trend+tone · **URL**=URL filter bar · **Q**=queue/presets · **Facet**=faceted search · **TL**=timeline · **Aud**=audit trail · **Drill**=drill-down · **Prog**=progressive disclosure · **GS**=global search (OpOmnibox) · **Chip**=status/risk chips · **Bulk**=bulk-with-reason · **Cmd**=command palette · **Alert**=alert banners · **Chart**=interactive charts · **Seg**=segmented control · **Empty**=empty state w/CTA · **Wiz**=wizards · **Tabs**=detail tabs · **k-an**=k-anon honesty · **Fresh**=freshness footer · **Degr**=degraded-metric honesty · **PII**=PII-safe queries · **Par**=cross-portal parity (code reuse) · **Skel**=loading/skeleton · **Nav**=nav QOL · **Copy**=es-AR copy

### B.1 — Analytics & population

| Route | KPI | URL | Drill | Prog | GS | Chip | Alert | Chart | Empty | k-an | Fresh | Degr | PII | Par | Skel | Nav | Copy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Admin home | ✅ | ➖ | ✅ | ➖ | ✅ | ➖ | ⚠️ | ➖ | ➖ | ➖ | ✅ | ➖ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Gob home | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Admin programa | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ⚠️ | ✅ (has D2) | ✅ | ✅ |
| Gob programa | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ➖ | ✅ | ✅ | ✅ | ⚠️ | ❌ (no D2) | ✅ | ✅ |
| Admin censo | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ✅ | ➖ | ✅ | ✅ | ✅ (has D2) | ✅ | ✅ |
| Gob censo | ✅ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ✅ | ➖ | ✅ | ✅ | ❌ (no D2) | ✅ | ✅ |
| Admin población | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ (has D2) | ✅ | ✅ |
| Gob población | ✅ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ❌ (no D2) | ✅ | ✅ |
| Admin adopciones | ✅ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ⚠️ (no D2, symmetric) | ✅ | ✅ |
| Gob adopciones | ✅ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin inteligencia | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ➖ | ✅ | ✅ | ➖ | ✅ | ✅ | ⚠️ | ✅ (has D2) | ✅ | ✅ |
| Gob analytics | ✅ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ➖ | ✅ | ⚠️ | ❌ (no D2) | ✅ | ✅ | ✅ |
| Gob analytics/export (no admin equiv) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ✅ | ➖ | ✅ | ➖ | ➖ | ✅ | ❌ (no admin equiv) | ➖ | ➖ | ✅ | |

### B.2 — Operations & cases

Legend adds: **Fac**=faceted search, **Q**=queue/presets, **Fresh**=freshness footer, **Deg**=degraded-honesty, **Load**=loading.tsx, **esAR**=copy.

| Route | KPI | URL Filt | Q | Chips | Fresh | PII | Load | esAR |
|---|---|---|---|---|---|---|---|---|
| Casos admin | ➖ | ⚠️ raw form | ❌ hand-rolled `<ul>` | ✅ | ➖ | ➖ | ❌ | ✅ |
| Casos gob | ➖ | ❌ none | ❌ hand-rolled `<ul>` | ✅ | ➖ | ➖ | ❌ | ✅ |
| Alertas admin (no gob equiv) | ➖ | ✅ | ⚠️ a11y table, not CaseQueue (deliberate) | ✅ | ➖ | ✅ | ✅ | ✅ |
| Moderación admin | ➖ | ✅ | ⚠️ `.limit(500)`, no paging | ✅ | ➖ | ✅ | ❌ | ✅ |
| Maltrato gob | ✅ | ✅ | ✅ UrlTabs + keyset | ✅ | ✅ | ✅ | ✅ | ✅ |
| Observaciones (single shared route) | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ❌ | ⚠️ hardcoded "Admin·" eyebrow |
| Sistema admin | ✅ | ➖ | ➖ | ✅ | ✅ | ➖ | ❌ | ✅ |
| Sistema gob | ✅ | ✅ | ➖ | ✅ | ✅ | ➖ | ❌ | ✅ |
| Outbox admin | ➖ | ✅ | ✅ keyset | ✅ | ➖ | ➖ | ❌ | ✅ |
| Outbox gob | ➖ | ✅ | ✅ keyset | ✅ | ✅ | ➖ | ❌ | ✅ |

### B.3 — Governance, audit, identity (no gob counterpart assumed)

| Route | URL | Facet | Aud | Drill | Prog | GS/Cmd | Chip | Empty | Fresh | PII | esAR |
|---|---|---|---|---|---|---|---|---|---|---|---|
| admin/auditoria | ✅ | ✅ | ✅ (is one) | ➖ | ✅ | ✅ | ✅ | ⚠️ no CTA | ➖ | ➖ | ✅ |
| admin/historial | ➖ | ➖ | ✅ (is one) | ➖ | ➖ | ✅ | ➖ | ⚠️ no CTA | ➖ | ⚠️ no payload detail | ✅ |
| admin/libro | ✅ | ✅ | ✅ (is one) | ✅ replay link | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ logs every view | ✅ |
| admin/admins | ➖ | ➖ | ✅ tail, per-detail | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ⚠️ email, no log | ✅ |
| admin/govts | ✅ | ✅ | ✅ tail, per-detail | ✅ | ✅ | ✅ | ✅ | ✅ +CTA | ➖ | ⚠️ email, no log | ✅ |
| acerca/integracion-miarg | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ | ✅ |

**Wrapper verification** (cola / usuarios / organizaciones / reglas+nested / servicios): all 6 files confirmed genuine single-line `export { default } from "@/app/gob/.../page"` with the same boilerplate comment, no hidden admin-specific logic. Chrome correctly supplied by each portal's own `layout.tsx`. **`nav-presets.ts`'s "portal-follows-viewer" claim holds.**

## C. Ranked findings

| # | Finding | File:line | Impact | Effort | Fix |
|---|---|---|---|---|---|
| 1 | `loadWithTimeout`/`AnalyticsLoadFallback` (D2) guard exists on admin's analytics quartet but is missing on 3 of 4 identical `/gob` pages — same fetchers, no timeout guard, govt users get an unbounded hang where admin degrades gracefully | `app/admin/censo/page.tsx:69-88` vs `app/gob/censo/page.tsx:103-108`; same divergence in poblacion (`admin:73-94` vs `gob:115-123`) and programa (`admin:122-150` vs `gob:142-162`) | High | S | Wrap the same `Promise.all` in `loadWithTimeout` + render `AnalyticsLoadFallback` in the 3 gob pages that lack it |
| 2 | `/admin/casos` and `/gob/casos` both bypass `CaseQueue`/`CaseQueueFilters` and hand-roll divergent list UIs; gob has zero filters, both cap the list at a different arbitrary limit | `app/admin/casos/page.tsx:114-168` (raw `<form method=get>`, limit 500) vs `app/gob/casos/page.tsx:62-101` (plain `<ul>`, no filters, limit 300) | High | M | Migrate both to `CaseQueue`/`CaseQueueFilters`, share pagination/limit constants |
| 3 | `/gob/outbox` is ~90% duplicated from `/admin/outbox` (same `TARGET_KIND_LABEL`, `BREACH_PILL_TONE`, `STATUS_VALUES`, filter form, table markup) instead of a shared component/query builder | `app/admin/outbox/page.tsx:26-64` vs `app/gob/outbox/page.tsx:41-79` | High | M | Extract shared `OutboxTable` / `buildOutboxWhere(actor, jurisdictions, filters)` used by both routes |
| 4 | `AdminKpiStrip` (built to stop KPI drift per critique C26) has no `/gob` equivalent — `/gob/page.tsx` and `/gob/programa` duplicate near-identical KPI tiles ad-hoc with copy-pasted `info={{...}}` blocks | `components/admin/AdminKpiStrip.tsx` vs `app/gob/page.tsx`, `app/gob/programa/page.tsx` | Med | M | Generalize `AdminKpiStrip` into a shared `components/ui/dashboard` component parameterized by KPI set, or build a `GobKpiStrip` twin |
| 5 | `admin/historial` duplicates `admin/auditoria`'s self-filter (`actor` dropdown already supports this) as a separately-maintained keyset query, and its nav label ("Historial") gives no signal it's self-only, unlike gob's honest "Mi actividad" label for the same shape | `app/admin/historial/page.tsx:23-25` vs `app/admin/auditoria/page.tsx:37-41,245-257`; `components/layout/nav-presets.ts:378` vs `:283` | Med | S/M | Drop `/admin/historial` in favor of `/admin/auditoria?actor=<self>` quick-link, or rename to "Mi actividad" and complete parity (finding 10) |
| 6 | `/admin/moderacion` truncates at `.limit(500)` with no pagination at all, unlike sibling `/gob/maltrato` (keyset) | `app/admin/moderacion/page.tsx:69-74` | Med | S | Add the same `keysetWhere`/`olderHref` pattern already used in `gob/maltrato` and `admin/outbox` |
| 7 | `/gob/outbox` has no `[id]` detail route — dead `—` cell where admin gets "Detalle →"; code already flags it as a follow-up | `app/gob/outbox/page.tsx:416-429` | Med | S | Build `/gob/outbox/[id]` scoped to jurisdiction, reusing admin's detail markup minus admin-only retry action |
| 8 | CSV/dataset export exists only under `/gob/analytics/export`; zero equivalent anywhere under `/admin`, with no code comment confirming whether the gap is intentional (universal-scope export = bigger PII/aggregation blast radius) | `app/gob/analytics/page.tsx:242-253` (live CTA) + `export/actions.ts`; grep for `text/csv`/`toCsv` under `app/admin` returns 0 hits | Med | M | If intentional, document the decision in `app/admin/inteligencia/page.tsx`; if not, scope a universal export with stricter k-anon/PII gating |
| 9 | 2-step delete confirmation pattern exists for admin's alert-subscription delete but not for the identical gob action — `/gob` fires the destructive action from a single-button `<form>` | `app/admin/programa/DeleteAlertSubscriptionButton.tsx` vs `app/gob/programa/page.tsx:643-654` | Med | S | Extract `DeleteAlertSubscriptionButton` to a shared location and reuse in both |
| 10 | `admin/historial` selects less PII detail than `gob/historial` for the identical self-activity view (doesn't select `payload`, so admin's own audit self-view is less informative than a govt user's) | `app/admin/historial/page.tsx:36-41` vs `app/gob/historial/page.tsx:146-152,204-220` | Low-Med | S | Add `payload` to the select and copy the render block |
| 11 | `gob/vigilancia` deep-links govt operators into `/admin/observaciones` and `/admin/outbox`, both of which carry a hardcoded "Admin ·" eyebrow even though the shared route also serves govt viewers (functionally safe — `requireAdminOrGovtOrRedirect` + jurisdiction filter verified — but nav-inconsistent) | `app/gob/vigilancia/page.tsx:407,447`; `app/admin/observaciones/page.tsx:105,160` | Med | S | Make the eyebrow role-aware (`surveillanceEyebrow(profile.role)` already used elsewhere in the file, just not applied to these two static strings) |
| 12 | Staff-email PII lookups in admin/admins and admin/govts aren't logged, unlike `admin/libro`'s `logEventLedgerView` on every list view | `app/admin/admins/page.tsx:13,27`, `admins/[userId]/page.tsx:69-71`, `app/admin/govts/page.tsx:14,44`, `govts/[userId]/page.tsx:40-42` | Low (scope call — staff email ≠ citizen PII under most readings) | S | PO call: extend `pii_queried`-style logging if staff email is considered in-scope PII |
| 13 | `registryByProvince` has no `suppressSmallCells` while its sibling `registrationTrend` on the same page/fetch batch does — inconsistent application, currently safe at province granularity | `lib/metrics/census.ts:442-460` | Low-Med | S | Route through `suppressSmallCells` or add a code comment documenting the province-level exemption |
| 14 | Stale comment in `gob/analytics/export/page.tsx` claims the page is "not reachable from any nav or dashboard CTA," but it's already linked live from `/gob/analytics` | `app/gob/analytics/export/page.tsx:1-13` vs `app/gob/analytics/page.tsx:244-252` | Low | S | Delete/update the stale banner comment |
| 15 | Admin/gob layout scope-chip variant + casing mismatch for the "admin visiting /gob" case (same semantic scope, different visual treatment) | `app/admin/layout.tsx:84,137` vs `app/gob/layout.tsx:22-24,89-93` | Low | S | Pick one chip variant/casing and use it in both |
| 16 | Fabricated full-format unmasked DNI in mock content (`"DNI 30.485.211"`) — not a live DB query, but sets a copy-pasteable bad pattern next to invariant #5 (no DNI in plaintext) | `app/admin/acerca/integracion-miarg/page.tsx:54` | Low | S | Swap to a `dniLast4()`-style masked mock |
| 17 | `loading.tsx` missing across casos (both sides), moderación, observaciones, sistema (+crons), outbox (both sides) — uniform gap, not admin/gob-specific drift | multiple | Low | S | Add `loading.tsx` matching each route's final layout footprint per AGENTS.md nav-QOL checklist |
| 18 | Alert banners asymmetric on home pages — admin home has only a portal-switch `OpCallout`, gob home has none, despite both having queue-age/breach signals one click away on their own `programa` pages | `app/admin/page.tsx`, `app/gob/page.tsx` | Low | S | Low priority — home pages are meant to be light; note only |

## D. Parity section — every /admin ↔ /gob divergence, and which side is canonical

| Route pair | Verdict | Canonical side | Reason |
|---|---|---|---|
| Home (`/admin` vs `/gob`) | DRIFTED-MAJOR | Neither (converge only the KPI-strip abstraction) | Pages intentionally answer different questions — universal admin landing vs jurisdiction operating console — but finding 4 (AdminKpiStrip asymmetry) is real drift |
| `/admin/programa` vs `/gob/programa` | DRIFTED-MINOR | **Admin** (D2 fallback + 2-step delete confirm) | Same fetchers/layout/feature; admin has two safety patterns gob lacks (findings 1, 9) |
| `/admin/censo` vs `/gob/censo` | DRIFTED-MINOR | **Admin** for D2 only | Fully shared fetchers; table-vs-choropleth split is a legitimate difference in information need, not drift |
| `/admin/poblacion` vs `/gob/poblacion` | DRIFTED-MINOR | **Admin** for D2 only | Same shape as censo |
| `/admin/adopciones` vs `/gob/adopciones` | SAME CODE | — | Near-verbatim twin; cleanest pair in the set, no action needed |
| `/admin/inteligencia` vs `/gob/analytics` | DRIFTED-MAJOR / not really a pair | **Inteligencia** canonical for k-anon disclosure pattern (`componentsUsed<3` asterisk); **analytics** canonical for CSV export + per-capita choropleth | Different features sharing a nav "intelligence" slot; recommend porting the k-anon disclosure pattern into gob/analytics' region table |
| Casos (`/admin/casos` vs `/gob/casos`) | DRIFTED-MAJOR | Neither | Both bypass `CaseQueue`; gob is strictly worse (no filters) |
| Alertas (`/admin/alertas`, no gob equivalent) | ADMIN-ONLY-CANONICAL | — | Genuine cross-case-kind aggregation of `alert_firings`; code comment explicitly justifies not using `CaseQueue` |
| Moderación vs Maltrato | GENUINELY-DIFFERENT-FEATURE | Maltrato is the more mature template | Different schema/workflow (pre-triage anonymous-flag resolution vs full assignment/derivation/decomiso investigation); polish (pagination, KPIs) should be backported from maltrato to moderación |
| Observaciones (single shared route under `/admin/*`) | SAME-CODE-SHARED-ROUTE | — | Serves both roles via `requireAdminOrGovtOrRedirect`; functionally fine, cosmetically mislabeled for govt viewers (finding 11) |
| Sistema (+ crons) | DRIFTED-MINOR (intentional) | **Admin** for crons (infra-internal, not jurisdiction data) | `gob/sistema`'s header comment explicitly documents itself as a deliberate KEEP/DROP subset of `admin/sistema` |
| Outbox (+ `[id]`) | DRIFTED-MAJOR | **Admin** (has detail route + pet-token link column gob lacks) | Near-duplicate reimplementation instead of a shared component (finding 3) |
| Cola / Usuarios / Organizaciones / Reglas / Servicios | SAME CODE (verified literal re-exports) | — | Portal-follows-viewer pattern working exactly as designed; zero drift risk |
| Admin layout vs Gob layout (scope chip) | DRIFTED-MINOR (cosmetic) | — | Both gate scope correctly; only chip-variant/casing differs for the "admin-in-universal-scope" case |
| `/admin/auditoria` vs `/gob/historial` | NOT DIRECTLY COMPARABLE (by design) | **Gob/historial** is correctly self-only ("Mi actividad"); **admin/auditoria** is correctly the universal log | Confirmed genuinely different scopes, not drift |
| `/admin/historial` vs `/admin/auditoria` (intra-admin, not cross-portal, but drives confusion) | REDUNDANT | **Auditoria** (has the actor filter already) | Historial is a functional subset with a misleading nav label — the actual "parity bug" here is admin failing to match gob's honest self-scoped naming, not a gob-side problem |
| Libro / Admins / Govts / Acerca-integracion-miarg (no gob counterpart) | ADMIN-ONLY-CANONICAL | — | Inherently universal-scope operations (raw event log, admin/govt account management, federation reference); all reasonably well-built, none are gaps |

## Top 5 /admin fixes

1. **Migrate `/admin/casos` off the hand-rolled `<form>` + `<ul>` onto `CaseQueue`/`CaseQueueFilters`** — the single biggest queue-pattern violation in the portal, and the fix pulls `/gob/casos` up with it once the shared component exists (finding 2).
2. **Add keyset pagination to `/admin/moderacion`** — currently the only queue in either portal with a silent hard cap (`.limit(500)`, no paging) (finding 6).
3. **Resolve the `/admin/historial` vs `/admin/auditoria` redundancy** — either drop historial in favor of an `auditoria?actor=self` link, or rename it to match gob's honest "Mi actividad" label and complete PII-detail parity (findings 5, 10).
4. **Extract a shared Outbox table/query builder** so `/admin/outbox` stops being the un-synced canonical copy that `/gob/outbox` silently duplicates — also unblocks building the missing `/gob/outbox/[id]` (findings 3, 7).
5. **Add an explicit k-anonymity pass (or a documented exemption) to `registryByProvince`** in `lib/metrics/census.ts`, consumed by `/admin/censo` — closes the one inconsistency in an otherwise correctly k-anon-disciplined fetch batch (finding 13).
