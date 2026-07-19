// lib/metrics/ — Pattern-B projection foundation barrel.
//
// All aggregate dashboard fetchers (govt-home-kpis, govt-dashboards, admin-metrics)
// import their shared primitives from here. Items 2–4 (new metrics) build their
// fetchers natively on these exports.
//
// Pattern B: population-level SQL aggregates, jurisdiction-scoped, period-aware,
// k-anonymity enforced. See docs/architecture/hexagonal-lite.md §Pattern B.

export type {
  DashboardActor,
  DashboardJurisdiction,
  ProjectionContext,
  ProjectionScope,
} from "./context";
export { buildProjectionContext, ctxKey, isSubProvincialScope } from "./context";

export type { Cell, MetricResult, SuppressedCells } from "./types";

export type { SuppressOpts } from "./anonymity";
export { complementarySuppress, suppressSmallCells, suppressedMetric } from "./anonymity";

export { petsScopeClause, petEventsScopeClause, jurisdictionPairClause } from "./scope";

export { activePetsCondition, dogsInScopeCondition, petEventsInScopeCondition } from "./population";

// Shared rabies-vaccination predicate — single definition of the
// rabies_coverage_dogs_12m numerator for EXISTS-shaped queries (C3).
export {
  RABIES_VACCINE_NAME_REGEX,
  rabiesCurrentlyValidCondition,
  rabiesSignedByMatriculaCondition,
  rabiesVaccinatedExists,
} from "./rabies";

export { cachedActivePetCount, cachedDogCount } from "./cache";

export { resolveAnalyticsPeriod, windows } from "./period";
export type { AnalyticsPeriod, PeriodSearchParams } from "./period";

// Bucketed time-series (trend) projections — D1. Pure transforms live in
// ./timeseries; the DB-bound scope-aware fetchers live in ./trends.
export type {
  BucketGranularity,
  SeriesBucketRow,
  StackedPoint,
  StackedSeries,
} from "./timeseries";
export {
  bucketGranularityFor,
  dateTruncUnit,
  formatBucketLabel,
  isoWeekLabel,
  pivotStackedSeries,
  suppressSmallBuckets,
  suppressSmallStackedCells,
} from "./timeseries";
export type { SingleSeriesTrend, StackedTrend } from "./trends";
export {
  fetchBitesTrend,
  fetchDeathCausesTrend,
  fetchKpiTrend,
  fetchOutbreakSignalsTrend,
  fetchRabiesVaccinationTrend,
} from "./trends";

// Paquete J — pure trend projection (forecast) over flow series.
export type {
  CrossingDirection,
  ForecastMethod,
  ForecastOpts,
  ForecastPoint,
  ForecastResult,
  SeriesPoint,
} from "./forecast";
export { DEFAULT_HORIZON, MIN_POINTS, projectSeries, targetCrossing } from "./forecast";

// Fase 0 additions — targets, tone, delta, freshness.
export { TARGETS, computeDeltaPct, decisionsDeltaPct, enoSlaTone, toneForTarget } from "./targets";
export { lastIngestAt } from "./freshness";

// D4 reunification rate, per administrative unit — feeds the Panorama
// `reunificacion` layer (src/modules/panorama/infrastructure/repository.ts).
export { fetchReunificationByUnit } from "./reunification-rollups";
export type { ReunificationByUnitKpi, ReunificationByUnitRow } from "./reunification-rollups";

// Paquete E — censo poblacional & salud del registro.
export {
  DORMANT_MONTHS_DEFAULT,
  ESTIMATED_DOGS_PER_INHABITANT,
  assertFunnelMonotonic,
  classifyDormant,
  computeCensusCoverage,
  estimateDogPopulation,
  funnelPercents,
  identificationFunnel,
  isIncompleteProfile,
  registryCounts,
  registrationTrend,
  registryByProvince,
} from "./census";
export type { CensusCoverage, FunnelStages, ProvinceRegistryRow, RegistryCounts } from "./census";

// Paquete F — pipeline de custodia & adopción.
export {
  funnelBarWidths,
  returnRate,
  timeInStateNonNegative,
  fetchAdoptionTrend,
  fetchCustodyFunnel,
  fetchFosterPoolUtilization,
  fetchReturnRate,
  fetchShelterOccupancyNational,
  fetchTimeInState,
} from "./custody";
export type {
  CustodyFunnel,
  FosterPoolUtilization,
  FunnelCounts,
  ShelterOccupancy,
  TimeInStateRow,
} from "./custody";

// Paquete H — salud operativa del programa.
export {
  completeness,
  fetchCrossJurisdictionOutliers,
  fetchDataQuality,
  fetchPiiOversight,
  isOutlier,
} from "./program-health";
export type { DataQuality, OutlierMetric, OutlierRow, PiiOversightRow } from "./program-health";

// Paquete H — alert subscriptions (threshold alerts on /admin/programa).
export { evaluateAlertSubscriptions, isBreaching } from "./alert-evaluation";
export type { EvaluatedSubscription } from "./alert-evaluation";

// Paquete G — control poblacional.
export {
  computeNetGrowth,
  coverageRate,
  fetchActivePregnancies,
  fetchNetGrowth,
  fetchReproductiveOutcomes,
  fetchSterilizationCoverage,
  fetchSterilizationNatalidadRatio,
  fetchSterilizationTrend,
  safeRatio,
} from "./population-control";
export type {
  NetGrowthResult,
  ProvinceSterlizationRow,
  ReproductiveOutcomeKey,
  ReproductiveOutcomes,
  SterilizationCoverageResult,
} from "./population-control";

// 26/48 coverage-gap fill — four high-yield events surfaced on existing /gob
// dashboards (deworming coverage · vet-access gap · movement corridors · adoption
// application funnel). Each reads the append-only pet_events spine, jurisdiction-
// scoped via petsScopeClause.
export { fetchDewormingCoverage } from "./deworming";
export type { DewormingCoverageResult, ProvinceDewormingRow } from "./deworming";
export { fetchVetAccessByLocality, perThousand } from "./vet-access";
export type { VetAccessResult, VetAccessRow } from "./vet-access";
export { fetchMovementCorridors } from "./movement";
export type { MovementCorridorsResult } from "./movement";
export { approvalRate, fetchAdoptionApplicationFunnel } from "./adoption-funnel";
export type { AdoptionFunnelResult } from "./adoption-funnel";
