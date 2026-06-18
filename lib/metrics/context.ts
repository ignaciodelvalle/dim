// ProjectionContext — the single argument shape for every aggregate dashboard fetcher.
//
// Both DashboardActor and DashboardJurisdiction were previously duplicated in
// lib/govt-dashboards.ts and lib/govt-home-kpis.ts. This is now the single source
// of truth. Both files import from here; their local declarations are removed.
//
// Usage:
//   const ctx = buildProjectionContext(actor, jurisdictions, period);
//   const kpi  = await fetchRabiesCoverage(ctx);

import type { AnalyticsPeriod } from "@/lib/analytics-period";

/** Who is asking: admin (universal scope) or govt (jurisdiction-scoped). */
export type DashboardActor = { role: "admin" | "govt" };

/** A single jurisdiction pair as stored in govt_assignments. */
export type DashboardJurisdiction = { province: string; locality: string };

/** The scope dimension of a ProjectionContext. */
export type ProjectionScope =
  | { kind: "global" } // admin — no WHERE restriction
  | { kind: "jurisdictions"; jurisdictions: DashboardJurisdiction[] }; // govt

/**
 * The single context object every aggregate fetcher accepts.
 * Construct it ONCE at the page boundary and pass it to all tile fetchers.
 * This unlocks React.cache dedup: every fetcher that derives the same base
 * population hits the memoized result instead of re-querying.
 */
export type ProjectionContext = {
  actor: DashboardActor;
  scope: ProjectionScope;
  /** The resolved time window from resolveAnalyticsPeriod (carries {since, until}). */
  period: AnalyticsPeriod;
};

/**
 * Build a ProjectionContext from the three values already available at any
 * dashboard page boundary:
 *  - actor       — from requireAdminOrGovtOrRedirect
 *  - jurisdictions — from getJurisdictionsCached (empty for admin)
 *  - period      — from resolveAnalyticsPeriod(searchParams)
 */
export function buildProjectionContext(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: AnalyticsPeriod,
): ProjectionContext {
  const scope: ProjectionScope =
    actor.role === "admin" ? { kind: "global" } : { kind: "jurisdictions", jurisdictions };

  return { actor, scope, period };
}

/**
 * A stable string key for a ProjectionContext, suitable as a React.cache
 * surrogate key. Two contexts with the same scope+period produce the same key.
 */
export function ctxKey(ctx: ProjectionContext): string {
  const scopePart =
    ctx.scope.kind === "global"
      ? "global"
      : ctx.scope.jurisdictions
          .map((j) => `${j.province}:${j.locality}`)
          .sort()
          .join(",");
  return `${scopePart}|${ctx.period.since.toISOString()}|${ctx.period.until.toISOString()}`;
}
