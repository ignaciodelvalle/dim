1. `app/(public)/p/[publicToken]/page.tsx:417` · Lost branch always SELECTs `profiles.displayName` even when `discloseFirstNameWhenLost=false` · MED · Project `displayName` as SQL `NULL` unless pref true (same pattern as `:421` phone gate).

2. `app/(public)/p/[publicToken]/page.tsx:494` · `lost_description` free-text (`accessories_when_lost`, `behavior_notes`, `last_seen_context`) shown on Tier-1 public credential with no PII scrub · MED · Scrub phone/email/DNI patterns at write or render.

3. `app/(public)/p/[publicToken]/page.tsx:675` · `permanentConditionsOther` rendered on Tier-0 active credential when `discloseConditionsPublicly` · MED · Sanitize or block contact-like content in that owner-entered field.

4. `app/(public)/p/[publicToken]/Tier2MedicalView.tsx:52` · Tier-2 médico echoes `permanentConditionsOther` verbatim · MED · Same scrub/validation as #3 before public render.

5. `app/(public)/p/[publicToken]/page.tsx:536` · Lost `identityLine` includes ungated `pet.distinguishingFeatures` (owner free-text) · LOW · Sanitize pet free-text fields before Tier-1 display.

6. `app/libreta/compartir/[shareToken]/page.tsx:107` · Tier-2 share fetches full `pet_events` and `LibretaSanitariaView.tsx:304` renders `event.notes` verbatim · MED · Drop/redact `notes` (and other owner free-text) from share projection.

7. `lib/metrics/trends.ts:167` · `fetchBitesTrend` govt-scopes via payload `pet_jurisdiction_*` only; no `pets.jurisdiction_*` guard · HIGH · Join `pets` + add `petsScopeClause(ctx)` (mirror `govt-home-kpis.ts:169-175`).

8. `lib/metrics/trends.ts:210` · `fetchOutbreakSignalsTrend` same payload-only govt scope · HIGH · Add pets-table jurisdiction EXISTS/join.

9. `lib/metrics/trends.ts:261` · `fetchRabiesVaccinationTrend` joins `pets` for species but not current jurisdiction · HIGH · Append `petsScopeClause(ctx)` to WHERE.

10. `lib/metrics/trends.ts:321` · `fetchKpiTrend` payload-only scope, no pets join · HIGH · Join `pets` + `petsScopeClause` for govt viewers.

11. `lib/metrics/population-control.ts:327` · `fetchReproductiveOutcomes` filters with `petEventsScopeClause` only despite `pets` join · HIGH · Add `petsScopeClause(ctx)` alongside payload scope.

12. `lib/metrics/population-control.ts:457` · `fetchNetGrowth` death/birth arms use `evtScope` (payload snapshot) not `pets.jurisdiction_*` · HIGH · Scope both arms on canonical `pets` columns.

13. `lib/metrics/population-control.ts:545` · `fetchSterilizationNatalidadRatio` same payload-only drift · HIGH · Add `petsScopeClause` to sterilization and birth queries.

14. `lib/analytics/govt-dashboards.ts:811` · `fetchCasesPerLocality` returns raw barrio counts to `/gob/vigilancia` choropleth without `suppressSmallCells` · HIGH · Route rows through `lib/metrics/anonymity.ts:48` with `k:5`.

15. `lib/analytics/govt-dashboards.ts:181` · `fetchCasesPerSubregion` emits barrio/department cells with `count` 1–4 to map (`vigilancia/page.tsx:181` filters `>0`, not `≥5`) · HIGH · Suppress/rollup subregion cells below k=5 before choropleth.

16. `lib/analytics/campaign-metrics.ts:249` · `fetchGeoReach` groups locality attendance without k-anon · MED · `suppressSmallCells` on locality `attendedCount`.

17. `src/modules/panorama/infrastructure/repository.ts:1053` · `loadPerdidasByUnit` aggregates on payload `province`/`locality` via `petEventsScope`, not `pets.jurisdiction_*` · HIGH · Add pets-current-jurisdiction guard per `govt-dashboards.ts:133-142`.

**clean**

- `lib/utils/dni-hash.ts` (requested `lib/dni-hash.ts` — actual path): no plaintext DNI storage/logging; prod pepper gate OK.
- `lib/metrics/anonymity.ts`: helper correct; gaps are uncalled callers (#14–16).
- `lib/projections/*`: no public-tier consumers in scoped routes.
- Tier-0 `/p` active credential: no owner name/phone/email/DNI/exact coords in render path (`page.tsx:607-894`, `opengraph-image.tsx:57-67`).
- Tier-1 disclosure gating for phone/location/coords: render gates at `page.tsx:576-586` match prefs (displayName fetch is the gap in #1).
- Tier-2 público (`page.tsx:273-344`): curated medical rollup only; no owner contact fields in `Tier2MedicalView`.
- DNI in adoption/auth writers: hash + last4 only (`adoption-repository.ts:829`, `verify-dni.ts:78-79`).
- Scan privacy contract on `/p`: `log-scan.ts:96-128` — no raw IP, scanner `recorded_by_user_id` null, coords only when lost + client grant.
