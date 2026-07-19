// Shared scope-clause helpers for the /gob dashboards (Fase 11 split,
// engram refactor/govt-dashboards-split).
//
// These helpers build Drizzle WHERE-clause fragments that enforce the
// viewer's jurisdiction scope (admin: universal / optional province
// drill-down; govt: OR of assigned jurisdiction pairs). They are used by
// MULTIPLE domain modules under lib/analytics/dashboards/ — keep this file
// free of imports from any of those domain modules to avoid circular
// imports (this module sits BELOW them in the dependency graph).

import { type SQL, and, eq, sql } from "drizzle-orm";

import { cases, custodyDisputes, pets } from "@/db";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
  jurisdictionPairClause,
  petsScopeClause as metricsPetsScopeClause,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

export const DAY_MS = 24 * 60 * 60 * 1000;

// Scope-security review 2026-07-04 (Part A1/A2): the payload's
// pet_jurisdiction_* fields are a snapshot taken at event time. When a pet
// moves (or seed data drifts), the payload and the pet's CURRENT
// pets.jurisdiction_* diverge, and a payload-only scope lets a govt viewer see
// out-of-jurisdiction pets. Govt fetchers must ALSO require the pet's current
// jurisdiction to be inside the viewer's scope. Admin keeps universal scope
// (returns null; the payload-based drill-down behavior is unchanged).
export function petsCurrentJurisdictionClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): SQL | null {
  if (actor.role === "admin") {
    // Admin province drill-down (Panorama-style) — narrows the CURRENT-jurisdiction
    // guard the same way petsScopeClause does. Backward-compat: no adminProvince →
    // null, exactly as before.
    if (!adminProvince) return null;
    if (adminLocality) {
      // `and()`'s general signature returns `SQL | undefined`; with two concrete
      // (non-undefined) conditions it always yields a defined SQL — cast to match
      // this function's `SQL | null` contract.
      return and(
        eq(pets.jurisdictionProvince, adminProvince),
        eq(pets.jurisdictionLocality, adminLocality),
      ) as SQL;
    }
    return eq(pets.jurisdictionProvince, adminProvince);
  }
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${pets.jurisdictionProvince}`,
      sql`${pets.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Build a scope clause for the `cases` table.
// - admin, no province selected → null (no restriction)
// - admin + province selected   → province (+ optional locality) predicate
//   (Panorama-style admin drill-down; additive-only, mirrors petsScopeClause)
// - govt: OR of (jurisdictionProvince=X AND jurisdictionLocality=Y) pairs.
export function casesScopeClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
) {
  if (actor.role === "admin") {
    // Backward-compat: no adminProvince → unrestricted, exactly as before.
    if (!adminProvince) return null;
    if (adminLocality) {
      return and(
        eq(cases.jurisdictionProvince, adminProvince),
        eq(cases.jurisdictionLocality, adminLocality),
      );
    }
    return eq(cases.jurisdictionProvince, adminProvince);
  }
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${cases.jurisdictionProvince}`,
      sql`${cases.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Build a scope clause for the `custody_disputes` table — the domain aggregate
// that the /gob/disputas queue lists. Admin: null (no restriction). Govt: OR of
// (jurisdictionProvince=X AND jurisdictionLocality=Y) pairs; govt with no
// assignments → sql`false` (matches nothing).
//
// Exported so /gob/disputas builds its queue scope with the IDENTICAL predicate
// the analytics "Disputas de custodia" KPI counts — that shared predicate is
// what guarantees the KPI number reconciles with the queue (count↔queue parity).
export function custodyDisputesScopeClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): SQL | null {
  if (actor.role === "admin") return null;
  return (
    jurisdictionPairClause(
      jurisdictions,
      sql`${custodyDisputes.jurisdictionProvince}`,
      sql`${custodyDisputes.jurisdictionLocality}`,
    ) ?? sql`false`
  );
}

// Thin adapters for the two scope helpers now canonical in lib/metrics/.
// The period is not relevant for scope-only use — trailing12m is a valid placeholder.
// adminProvince/adminLocality are forwarded into buildProjectionContext's opts,
// which metricsPetsScopeClause already honors (lib/metrics/scope.ts petsScopeClause) —
// backward-compat: omitted → ctx.adminProvince is undefined → unrestricted, same as before.
export function petsScopeClause(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
) {
  return metricsPetsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
      adminProvince,
      adminLocality,
    }),
  );
}
