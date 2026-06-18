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
export { buildProjectionContext, ctxKey } from "./context";

export type { Cell, MetricResult, SuppressedCells } from "./types";

export type { SuppressOpts } from "./anonymity";
export { suppressSmallCells, suppressedMetric } from "./anonymity";

export { petsScopeClause, petEventsScopeClause } from "./scope";

export { activePetsCondition, dogsInScopeCondition, petEventsInScopeCondition } from "./population";

export { cachedActivePetCount, cachedDogCount } from "./cache";

export { resolveAnalyticsPeriod, windows } from "./period";
export type { AnalyticsPeriod, PeriodSearchParams } from "./period";
