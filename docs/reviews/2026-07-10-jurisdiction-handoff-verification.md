# Jurisdiction scoping + cross-role handoff verification (pre-national)

**Date:** 2026-07-10
**Scope:** READ-ONLY authorization-correctness audit ahead of national multi-tenant deployment.
**Branch:** `integration/all-20260703`
**Verdict:** **Multi-jurisdiction authz is SOUND for national multi-tenant use.** No CRITICAL or HIGH gap found. Two CONCERNs (routing completeness + a PII-policy interpretation) and one operational note are recorded below; none is a leak or a blocker. No fix commit was warranted (nothing trivial-and-proven to fix).

Builds on `docs/reviews/2026-07-10-security-pre-national.md` (which independently rated scope narrowing / RLS / PII gating "strong") and `docs/reviews/2026-07-10-comprobantes-info-quality.md`. This report does not repeat their findings; it verifies the subsumption + handoff invariants specifically.

---

## Commands run (evidence)

| Command | Result |
|---|---|
| `tsx scripts/check-jurisdiction-subsumption.ts` | ✓ clean — 0 exact-pair authorization gates |
| `tsx scripts/check-authz-scoping.ts` | ✓ clean — 0 NEW tenant-guarded-but-unscoped actions (baseline 43 unchanged) |
| `vitest run __tests__/rls` | 4 files, **53 passed** |
| `vitest run __tests__/{jurisdiction-pair-clause,jurisdiction-subsumption-class,metrics-scope,gob-locality-scope,gob-queue-scope-pushdown,cross-jurisdiction-outliers-rabies,institutional-scope}` | 7 files, **93 passed** |
| `vitest run __tests__/{maltrato-detail-scope-consistency,maltrato-sql-queue} + panorama/load-layer-features-cached` | 3 files, **55 passed** |

Total: **201 relevant tests green**, both CI authz guards green.

---

## Check 1 — Multi-jurisdiction scope subsumption

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1.1 | Single canonical subsumption predicate for all reads | **PASS** | In-memory `jurisdictionScopeContains` + SQL `jurisdictionPairClause` both branch on `isWholeProvinceLocality`. `lib/domain/jurisdiction-canonical.ts:122-133`, `lib/metrics/scope.ts:44-60` |
| 1.2 | Whole-province scope subsumes all its localities | **PASS** | Whole-province branch matches on `province` alone. `lib/metrics/scope.ts:55-56`; in-memory `jurisdiction-canonical.ts:128-132` |
| 1.3 | **Province-equality fence always kept** (no cross-province leak) | **PASS** | Even the whole-province branch emits `province = j.province`; the narrow branch emits `province=X AND locality=Y`. There is NO branch that omits province equality. `lib/metrics/scope.ts:56-57` |
| 1.4 | Locality scope never sees siblings | **PASS** | Non-whole-province assignments keep the EXACT `(province, locality)` pair. `jurisdiction-canonical.ts:131`, `scope.ts:57` |
| 1.5 | Whole-CABA subsumes all barrios/comunas | **PASS** | `WHOLE_PROVINCE_LOCALITY = { CABA: "Ciudad Autónoma de Buenos Aires" }`; `jurisdiction-canonical.ts:83-104`. Covered by `jurisdiction-subsumption-class.test.ts` |
| 1.6 | Maltrato queue list scoped by report location | **PASS** | `welfareReportsScopeClause` → `jurisdictionPairClause` on `welfareReports.jurisdiction*`; admin→null, govt→pairs or `false`. `govt-dashboards.ts:1172-1184`, `buildMaltratoListConditions` 1300-1379 |
| 1.7 | Maltrato **detail** matches the **list** (no list-vs-detail divergence) | **PASS** | Detail page uses `jurisdictionScopeContains` (not a raw pair), returns `notFound()` out-of-scope. `app/gob/maltrato/[id]/page.tsx:127-134`. This is the exact bug class the subsumption linter armors (commit 4cc1cbd5). |
| 1.8 | Vigilancia (outbreak) queue scoped — defense in depth | **PASS** | `fetchSurveillanceSignals` scopes BOTH the payload snapshot (`outbreakSignalScopeClause`) AND the pet's CURRENT jurisdiction (`petsCurrentJurisdictionClause`), both via `jurisdictionPairClause`. A moved pet cannot leak. `govt-dashboards.ts:104-207` |
| 1.9 | Panorama map layers scoped (admin branch role-gated) | **PASS** | All layer/dot/centroid queries funnel through `jurisdictionColumnsScope`: admin branch fires ONLY on `actor.role === "admin"`; govt→`jurisdictionPairClause ?? sql\`false\``. `src/modules/panorama/infrastructure/repository.ts:154-175` |
| 1.10 | Empty-scope govt fails CLOSED | **PASS** | Every fetcher short-circuits govt-with-zero-assignments to `sql\`false\`` / empty. `scope.ts:93`, `govt-dashboards.ts:1314`, repository `:173` |
| 1.11 | Province canonicalized at write (both sides same format) | **PASS** | `normalizeLocationForWrite` → `canonicalProvinceNameForStorage` (display-name canonical form), matching `govt_assignments.jurisdiction_province`. `lib/domain/location-normalize.ts:96`; CHECK constraint `db/schema.ts:1835-1838` |

### Cache-key = authz boundary (no cross-scope collision)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1.12 | Layer cache key composes the FULL scope | **PASS** | `layerCacheKey` = `role \| sorted(juris) \| layer \| level \| since \| asOf \| basis \| adminP \| adminL \| verified`. `load-layer-features-cached.ts:108-128` |
| 1.13 | KPI cache key composes the FULL scope | **PASS** | `kpiCacheKey` = `role \| sorted(juris) \| since \| until \| adminP \| adminL`. `kpis-cache.ts:80-93` |
| 1.14 | **Province-scoped vs locality-scoped operator can NEVER collide on a key** | **PASS** | Jurisdictions are serialized as `${province} ${locality}` tokens. A whole-CABA operator → `CABA Ciudad Autónoma de Buenos Aires`; a CABA/Palermo operator → `CABA Palermo`. Distinct tokens ⇒ distinct keys. The ` ` / `;` separators cannot appear inside a canonical province/locality name, so two distinct pairs never alias. `role=` also separates admin from govt. Pinned by the scope-isolation unit tests (`load-layer-features-cached.test.ts`, `kpis-cache.test.ts`). |

**No scope widens instead of narrowing. No missing province fence. No cache-key collision across scopes.** The narrowing helper `narrowGovtScope` (`jurisdiction-canonical.ts:157-169`) intersects assignments with the UI filter and can only ever return a subset — a province+locality UI pick outside scope yields `[]`, never a widening.

---

## Check 2 — Cross-role handoff (citizen → government → resolution)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 2.1 | Denuncia routed by REPORT location, not reporter identity | **PASS** | Jurisdiction is derived from the submitted location: `parseLocationFromFormData` → `normalizeLocationForWrite`; `jurisdictionProvince/Locality = normalizedLoc.*`. Reporter's own profile jurisdiction is never consulted. `src/modules/welfare/actions.ts:917-938` |
| 2.2 | Appears in the RIGHT jurisdiction's govt queue | **PASS** | Queue filters `welfareReports.jurisdiction*` via the subsumption clause (1.6). Same columns written at 2.1 ⇒ report surfaces exactly where its location routes it. |
| 2.3 | State transitions are append-only events, not mutations (invariant #2) | **PASS** | Case lifecycle recorded as `case_events` rows (`entry_type`, append-only) + `pet_events` bridge (`abandonment_reported`/`maltreatment_reported`/`symptom_observed`) inside one atomic tx. `create-welfare-report.ts:163-294`. Timeline reads `fetchWelfareTimeline`. (The `welfare_reports` status column is a projection updated alongside the appended event, consistent with invariant #3.) |
| 2.4 | Public reference code resolves to the SAME case the operator sees | **PASS** | Public receipt keys on `welfareReports.referenceCode`; govt detail keys on `welfareReports.id`; both read one row of the same table. `app/(public)/denuncias/codigo/[code]/page.tsx:137-142` vs `app/gob/maltrato/[id]/page.tsx:110-115` |
| 2.5 | PII masked on the public receipt | **PASS** | Contact masked (`maskEmail`/`maskPhone`), location coarsened (`coarsenPoint(...,"approx")`), street address deliberately excluded. `denuncias/codigo/[code]/page.tsx:157-167, 316-326` |
| 2.6 | Every operator mutation re-checks jurisdiction scope | **PASS** | assign/triage/close/derive/MPF/comment all route through `loadInScopeReport` / `loadAndVerifyScope` → `jurisdictionScopeContains`, returning uniform "no encontrada" (no existence oracle) out-of-scope. `welfare/actions.ts:1433-1479` |
| 2.7 | Derivation targets scoped to report jurisdiction (no roster leak) | **PASS** | Derivable orgs filtered by `organizations.jurisdictionProvince = report.jurisdictionProvince`; the old nationwide fallback was removed — empty list is the secure outcome. `maltrato/[id]/page.tsx:193-211` |
| 2.8 | Handoff doesn't drop scope into the wrong province | **PASS** | Report jurisdiction is written once (2.1) and every downstream read/mutation re-derives scope from that stored value with the province fence (1.3). No path re-tags a report to another province. |

---

## CONCERNs (non-blocking) and one operational note

**CONCERN-1 (routing completeness, NOT an authz leak) — non-canonical locality on public denuncias.**
The public anonymous create uses `locality: "soft"` (`welfare/actions.ts:926`), which passes a geocoder locality through even when it is not in the INDEC catalog (`localityCanonical=false`). For a **non-CABA** province — where there is no whole-province scope (see note below) and operators are always locality-scoped — a report whose stored locality string doesn't exactly match any assignment locality matches NO govt pair and stays **admin-only / unrouted to the local operator**. This is fail-CLOSED (it can never leak to the WRONG province; province is always canonical and fenced), so it is not a security gap, but it is a handoff-completeness risk at national scale: legitimate denuncias could sit visible only to national admins. The public receipt's "integration pending" banner partly covers this operationally. Recommend: monitor the rate of `localityCanonical=false` welfare rows post-launch, and consider a coords→INDEC-locality reverse-resolve on create.

**CONCERN-2 (PII-policy interpretation) — reporter contact visible to any in-scope operator.**
The govt detail page renders `reporterContactEmail` / `reporterContactPhone` unmasked for ANY govt operator whose jurisdiction subsumes the report, not only the *assigned* operator (`maltrato/[id]/page.tsx:407-435`, select `:46-48`). The task framing said "visible to the assigned operator only per policy." This is most likely by design (any operator in the jurisdiction can triage/assign/act, and exact-coordinate views are already audited via `logWelfareLocationViewed`), but the divergence from an "assigned-only" reading is worth an explicit PO confirmation before national launch. Not a cross-tenant leak: it never crosses the jurisdiction boundary.

**NOTE (operational, not a bug) — whole-province scope for non-CABA provinces has no first-class representation.**
`govt_assignments.jurisdiction_locality` is `NOT NULL` (`db/schema.ts:1812`) and `WHOLE_PROVINCE_LOCALITY` contains only CABA. So "scope an operator to a whole non-CABA province" today means enumerating every locality as a separate active assignment (each a subsumption pair). That works and stays fenced, but for national rollout of province-level operators it is an operational scaling concern (many rows, and new localities added later are not auto-covered). If province-level operators are a real national need, consider a first-class whole-province assignment sentinel handled by `isWholeProvinceLocality` — a bounded, low-risk extension of the existing model.

---

## Executive verdict

**Is multi-jurisdiction authz sound for national multi-tenant use? YES.**

Every jurisdiction-scoped read and every cross-role mutation funnels through ONE canonical subsumption pair (`jurisdictionScopeContains` / `jurisdictionPairClause`, both gated on `isWholeProvinceLocality`), the province-equality fence is retained on every branch (cross-province leakage is structurally impossible), the two cached authz boundaries (layer + KPI) compose the full scope so a province-scoped and a locality-scoped operator can never collide on a key, and the citizen→govt→resolution handoff routes by the report's own (canonicalized) location with append-only state and a masked public receipt. Both CI authz guards and 201 targeted tests are green. The two CONCERNs are completeness/policy items for PO attention, not authorization breaches; the whole-province note is an operational extension consideration. No blocking fix required.
