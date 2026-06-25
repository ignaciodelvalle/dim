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
  /**
   * Admin province drill-down (Panorama console). Only set when
   * actor.role === "admin" and a specific province was selected via the URL
   * (?province=AR-X). Never set for govt actors — their scope is already
   * enforced by the jurisdiction pairs in scope.jurisdictions.
   *
   * When set, petsScopeClause / petEventsScopeClause append an ADDITIONAL
   * province (and optionally locality) predicate that narrows from universal
   * scope to the selected area.
   */
  adminProvince?: string;
  /**
   * Admin locality drill-down. Only meaningful when adminProvince is also set.
   * Never set for govt actors.
   */
  adminLocality?: string;
};

/**
 * Build a ProjectionContext from the three values already available at any
 * dashboard page boundary:
 *  - actor       — from requireAdminOrGovtOrRedirect
 *  - jurisdictions — from getJurisdictionsCached (empty for admin)
 *  - period      — from resolveAnalyticsPeriod(searchParams)
 *
 * The optional `opts` argument accepts an `adminProvince` / `adminLocality`
 * pair for the Panorama admin drill-down. These are silently ignored for govt
 * actors (scope.kind is "jurisdictions" so the admin branch never fires in
 * the scope helpers). Never pass them from govt page code.
 */
export function buildProjectionContext(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: AnalyticsPeriod,
  opts?: { adminProvince?: string; adminLocality?: string },
): ProjectionContext {
  const scope: ProjectionScope =
    actor.role === "admin" ? { kind: "global" } : { kind: "jurisdictions", jurisdictions };

  return {
    actor,
    scope,
    period,
    // adminProvince/adminLocality are only meaningful for admin actors; the
    // scope helpers already gate on scope.kind === "global" before reading them.
    adminProvince: opts?.adminProvince,
    adminLocality: opts?.adminLocality,
  };
}

/**
 * A stable string key for a ProjectionContext, suitable as a React.cache
 * surrogate key. Two contexts with the same scope+period+adminProvince produce
 * the same key. Admin drill-down (adminProvince) extends the key so that a
 * national admin ctx and a province-scoped admin ctx never collide in cache.
 */
export function ctxKey(ctx: ProjectionContext): string {
  const scopePart =
    ctx.scope.kind === "global"
      ? "global"
      : ctx.scope.jurisdictions
          .map((j) => `${j.province}:${j.locality}`)
          .sort()
          .join(",");
  const adminPart = ctx.adminProvince
    ? `|admin:${ctx.adminProvince}${ctx.adminLocality ? `:${ctx.adminLocality}` : ""}`
    : "";
  return `${scopePart}${adminPart}|${ctx.period.since.toISOString()}|${ctx.period.until.toISOString()}`;
}
