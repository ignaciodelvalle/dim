Adversarial review — metrics/KPI/analytics (code-verified):

1. `lib/metrics/program-health.ts:326` · `fetchCrossJurisdictionOutliers` rabies EXISTS has no `occurred_at` window but doc claims it matches `rabies_coverage_dogs_12m` (12m) · **HIGH** · Add `AND pe.occurred_at >= ${ctx.period.since}` inside `hasRabiesVax`.
2. `lib/analytics/territorial-index.ts:95` · Composite index inherits all-time rabies from #1, so province scores diverge from Panel/Panorama 12m KPI · **HIGH** · Fix upstream outlier fetcher first (same 12m predicate).
3. `src/modules/panorama/infrastructure/repository.ts:622` · Locality `rabies-coverage` predicate is all-time `ILIKE '%rabi%'` on all species, not dogs/12m/anchored-regex like `fetchRabiesCoverage` · **HIGH** · Reuse same EXISTS as `govt-home-kpis` (dog, 12m, `~* '(antirr[áa]bica|rabies)'`).
4. `lib/analytics/govt-home-kpis.ts:164` · Rabies numerator filters `petEventsScopeClause` (payload snapshot) while denominator uses `pets.jurisdiction_*`; no `petsCurrentJurisdictionGuard` used elsewhere · **MED** · Scope numerator via `innerJoin pets` + `petsScopeClause` only (drop payload scope), matching `fetchBitesPer10k`.
5. `lib/metrics/population-control.ts:457` · `fetchNetGrowth` deaths/births apply `petEventsScopeClause` only; joined `pets` never gets `petsScopeClause` · **HIGH** · `AND (${petsScopeClause(ctx)})` on the pets side of both event queries.
6. `lib/metrics/population-control.ts:327` · `fetchReproductiveOutcomes` same payload-only scope on joined query · **MED** · Add `petsScopeClause(ctx)` to the pets join filter.
7. `lib/metrics/population-control.ts:545` · `fetchSterilizationNatalidadRatio` same payload-only scope · **MED** · Same fix as #6.
8. `lib/metrics/trends.ts:167` · `fetchBitesTrend` uses payload scope with no `pets` join/guard (unlike `fetchBitesPer10k`) · **MED** · `innerJoin pets` + `petsScopeClause` or `petsCurrentJurisdictionGuard`.
9. `lib/metrics/trends.ts:210` · `fetchOutbreakSignalsTrend` payload-only, no pets guard · **MED** · Same pattern as #8.
10. `lib/metrics/trends.ts:321` · `fetchKpiTrend` payload-only for all sparkline event types · **MED** · Join pets + apply `petsScopeClause` for govt-scoped queries.
11. `lib/metrics/trends.ts:261` · `fetchRabiesVaccinationTrend` joins pets for species but scopes events via payload only · **MED** · Replace `petEventsScopeClause` with `petsScopeClause` on the join.
12. `lib/analytics/govt-home-kpis.ts:634` · `fetchActiveZoonosis` `deltaWeek` counts `rabies_observation_started` with `eventsScope` only, no pets guard · **MED** · Add `petsCurrentJurisdictionGuard(ctx)` like lepto/hidat arms.
13. `lib/analytics/govt-home-kpis.ts:299` · `fetchRabiesCoverageByProvince` emits `ratePct` for provinces with `total` as low as 1 · **MED** · Skip rows where `total < 5` (mirror `K_ANON_MIN` in program-health).
14. `lib/metrics/population-control.ts:201` · `fetchSterilizationCoverage.byProvince` exposes rates for provinces with `total < 5` · **MED** · Omit provinces below k=5 or mark suppressed.
15. `lib/analytics/compliance-metrics.ts:140` · Headline `ratePct` returned unsuppressed; narrow govt scope can be `<5` active pets · **MED** · Return `null`/“insufficient data” when `active < 5`.
16. `lib/analytics/mortality-metrics.ts:183` · `reportableByCode` returned raw; rare codes can be count 1–4 · **MED** · Route through `suppressSmallCells` on `count`.
17. `lib/analytics/mortality-metrics.ts:162` · `byCauseWeek` has no per-(week,cause) k-anon (unlike `fetchDeathCausesTrend`) · **MED** · Reuse `suppressSmallStackedCells` or drop raw table from client payload.
18. `lib/analytics/govt-dashboards.ts:2047` · `fetchDeathCauses` returns top-10 cause counts without k-anon · **MED** · Suppress rows with `n < 5` or roll into “otros”.
19. `lib/analytics/govt-dashboards.ts:1994` · `fetchAcquisitionTrend` returns monthly `(method, n)` without bucket suppression · **LOW** · Apply `suppressSmallBuckets` per month or cap display.
20. `lib/analytics/surveillance-metrics.ts:557` · `totalReportable`/`labConfirmationPct` headline unsuppressed; narrow scope can total 1–4 · **LOW** · Hide headline rate when `totalReportable < 5`.
21. `lib/analytics/compliance-metrics.ts:346` · `fetchReunificationRate` loads all `status_changed` rows for episode petIds (unbounded history) · **MED** · Restrict second query to transitions after each episode’s `lostAt` (or cap look-forward window).
22. `lib/metrics/census.ts:243` · Dormant count uses correlated `NOT EXISTS` over `pet_events` per scoped pet row · **MED** · Add/use `(pet_id, occurred_at)` index or denormalized `last_owner_activity_at`.
23. `src/modules/panorama/infrastructure/repository.ts:674` · Locality rollups scan all scoped pets with EXISTS subqueries on `pet_events`, capped at 2000 only after sort · **MED** · Partial index on `(event_type, pet_id)` + consider pre-aggregated rollups at scale.

**Dimension notes (no issue rows):**
- **Division-by-zero:** clean — `pct()`, `safeRatio`, `returnRate`, census guards, `fetchEnoSla`/`fetchRabiesObservationCompliance` use null-or-zero patterns consistently.
- **KPI catalog / 42% vs 54% disambiguation:** clean — two rabies KPIs are documented and labeled distinctly; remaining drift is in fetchers (#1, #3), not the catalog.
- **Panorama province choropleth parity:** clean — `loadRabiesCoverageByProvince` delegates to `fetchRabiesCoverageByProvince` (dogs, 12m).
- **Policy-outcome / territorial-data-quality:** clean — both apply k=5 and scope via `pets.jurisdiction_*`.
