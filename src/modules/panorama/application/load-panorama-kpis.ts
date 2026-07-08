// Shared, cached + budgeted loader for the Panorama KPI strip.
//
// WHY THIS EXISTS (staging QA 2026-07-08, finding #1 — "indicators load
// intermittently"): the KPI fan-out had TWO entry points with DIFFERENT
// resilience:
//   - the /api/panorama/kpis route (client refetch on a filter change) wrapped
//     the fan-out in a 20s budget AND a 60s short-TTL cache;
//   - the SERVER page render (app/{admin,gob}/panorama/page.tsx) — the path a
//     browser RELOAD actually re-runs — was UNCACHED with a tighter 9s budget.
// So a funcionario reloading the console re-ran the full ~12-query fan-out under
// the tight budget every time; under concurrent load it tripped the budget and
// the strip fell into the honest "No pudimos cargar los indicadores" degraded
// state — the indicators appeared to VANISH on reload.
//
// This module gives BOTH entry points ONE loader: kpiCacheKey → getCachedPanoramaKpis
// (the same module-level per-lambda cache) wrapping withDbBudget(getPanoramaKpis).
// A reload within the 60s TTL now collapses onto the warm cache instead of
// re-running the fan-out, so the indicators cannot vanish on reload. Degraded
// (budget-exhausted) results are still never cached, so one bad load never
// poisons the next window.

import type { AnalyticsPeriod, DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import { withDbBudget } from "./db-budget";
import { type PanoramaKpis, degradedPanoramaKpis, getPanoramaKpis } from "./get-panorama-kpis";
import { type CachedKpisResult, getCachedPanoramaKpis, kpiCacheKey } from "./kpis-cache";

// Time budget for the KPI fan-out. The fan-out runs on the ANALYTICS pool
// (session pooler — measured ~1.7s worst case: universal scope, 3y window), so
// 20s is generous headroom ABOVE the 15s DB statement_timeout: a genuinely
// stuck query is cancelled server-side first (SQLSTATE 57014 → rejection →
// degraded fallback) and only a pathology the DB can't cancel falls through to
// the budget's degraded result. Shared by the API route AND the server pages so
// a reload gets the same headroom the client refetch already had (previously the
// pages used a tighter 9s budget, which tripped under load — staging QA #1).
export const KPIS_BUDGET_MS = 20_000;

export type LoadCachedPanoramaKpisParams = {
  actor: DashboardActor;
  /** The ALREADY-NARROWED jurisdictions (govt scope enforced upstream). */
  jurisdictions: DashboardJurisdiction[];
  period: AnalyticsPeriod;
  /** Admin drill-down province/locality (undefined for govt). */
  adminProvince?: string;
  adminLocality?: string;
  /** Time budget in ms. Defaults to KPIS_BUDGET_MS. */
  budgetMs?: number;
  /** Short log label, e.g. "GET /api/panorama/kpis" or "gob/panorama kpis". */
  label: string;
};

/**
 * Resolve the headline KPIs for a scope, served from the short-TTL per-lambda
 * cache when a fresh entry exists, otherwise computed under a time budget and
 * cached iff the result is a real (non-degraded) strip.
 *
 * The cache key is derived from the FULL authorization scope — two operators
 * with different scopes can NEVER share an entry (kpis-cache scope-isolation
 * test). On a budget-exhausted (degraded) result the value is returned but NOT
 * cached, so one bad load never freezes the honest error for the next 60s.
 *
 * NEVER-CRASH: a fetcher rejection propagates out of `compute` (before the
 * budget) so an API caller can answer 503; a page caller adds its own `.catch`
 * to degrade instead. A budget timeout resolves the degraded strip.
 */
export function loadCachedPanoramaKpis(
  params: LoadCachedPanoramaKpisParams,
): Promise<CachedKpisResult> {
  const cacheKey = kpiCacheKey({
    role: params.actor.role,
    jurisdictions: params.jurisdictions,
    since: params.period.since,
    until: params.period.until,
    adminProvince: params.adminProvince,
    adminLocality: params.adminLocality,
  });
  return getCachedPanoramaKpis(
    cacheKey,
    () =>
      withDbBudget(
        getPanoramaKpis(
          params.actor,
          params.jurisdictions,
          params.period,
          params.adminProvince,
          params.adminLocality,
        ),
        params.budgetMs ?? KPIS_BUDGET_MS,
        params.label,
        degradedPanoramaKpis(),
      ),
    // Only a real strip (tiles present) is cached — degraded strips carry no
    // tiles (kpis: []), so caching one would freeze the honest error for 60s.
    { shouldCache: (value: PanoramaKpis) => value.kpis.length > 0 },
  );
}
