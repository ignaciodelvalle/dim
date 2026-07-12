/**
 * Canonical jurisdiction-scope resolver for /gob dashboard pages and export routes.
 *
 * The jurisdiction half of the `(events, filters) → view` projection — the exact
 * sibling of the period half (`resolveAnalyticsPeriod`, which resolves
 * `(period searchParams) → {since, until}`). The period half got its shared
 * resolver long ago; the jurisdiction half never did. This adds it.
 *
 * THE JURISDICTIONAL FENCE IS SACRED. This function IS the fence's server-side
 * resolution. It takes the operator's assignment set plus the raw ?province /
 * ?locality searchParams and returns everything a gob screen needs to render its
 * jurisdiction filters — most importantly `filteredJurisdictions`, the narrowed
 * assignment set the data fetchers scope by.
 *
 * It does NOT re-implement the narrowing. The fence-critical narrowing lives in
 * the already-tested pure core `resolveScopedJurisdictions` (lib/infra/gov-scope.ts);
 * this function is the async orchestrator that does the I/O (ISO→Province,
 * slug→Locality, localities fetch) and derivation (allowedProvinces, admin-drill
 * names) around it, then DELEGATES the narrowing to that core. We wrap the proven
 * fence once and route every call site through the wrapper.
 *
 * Security guarantees (see docs/plans/jurisdiction-scope-primitive.md §2, §4):
 *   - Admin ⇒ filteredJurisdictions returned unchanged (empty = universal; SQL
 *     scope clauses short-circuit on role === "admin"). Narrowing is a no-op.
 *   - Govt ⇒ narrowing only ever intersects DOWN against the server-held
 *     assignment set. A crafted ?province/?locality can never widen: selecting a
 *     locality the operator is not assigned yields an EMPTY list, not a broader one.
 *   - The client's selection is re-resolved server-side on every request through
 *     provinceByCode / localityByName; it is an INPUT to resolution, never a
 *     trusted scope.
 *   - Fail-closed: an invalid ISO code, or a lone ?locality with no ?province,
 *     degrades to "no narrowing within the already-fenced set" — never fail-open.
 *   - allowedProvinces is derived from the operator's ORIGINAL assignments (or the
 *     static 24 for admin), never from the narrowed set or any attacker value.
 *   - adminSelectedProvince/Locality (the admin SQL-drill names) are gated on
 *     role === "admin". Govt callers get null and MUST NOT pass them — for a govt
 *     user the scope is already enforced by filteredJurisdictions, so name-based
 *     drilling would be a widening vector.
 */

import { GOB_ALL_PROVINCES, PROVINCE_ISO_MAP } from "@/lib/analytics/govt-dashboards";
import {
  type Locality,
  type LocalityOption,
  listLocalitiesByProvince,
  localityByName,
} from "@/lib/infra/ar-localidades";
import { resolveScopedJurisdictions } from "@/lib/infra/gov-scope";
import type { DashboardJurisdiction } from "@/lib/metrics";
import { type Province, type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";

/** The raw ?province / ?locality searchParams, source-shape-agnostic. */
export type JurisdictionScopeParams = {
  /** ?province — ISO 3166-2:AR code, e.g. "AR-B". Absent/empty = national. */
  province?: string | null;
  /** ?locality — locality slug, e.g. "la-plata". Absent = province-level (or national). */
  locality?: string | null;
};

export type JurisdictionScopeInput = {
  /** From requireAdminOrGovtOrRedirect(). "admin" ⇒ universal, empty jurisdictions. */
  role: "admin" | "govt";
  /** The operator's assignment set. Admin gets [] by contract (= universal). */
  jurisdictions: DashboardJurisdiction[];
  /** The raw ?province / ?locality searchParams (ISO code + slug). */
  params: JurisdictionScopeParams;
};

export type ResolvedJurisdictionScope = {
  /** ?province resolved (canonical name + ISO + slug), or null for national scope. */
  selectedProvince: Province | null;

  /** ?locality resolved to its catalog row (canonical localityName + slug), or null. */
  selectedLocality: Locality | null;

  /** Localities of selectedProvince, for the <JurisdictionSwitcher> dropdown. [] when national. */
  localities: LocalityOption[];

  /**
   * THE FENCE. The operator's jurisdictions narrowed by the selection.
   * Delegates to resolveScopedJurisdictions — NEVER widens beyond assignments.
   * Admin ⇒ returned unchanged (empty = universal; SQL scope short-circuits on role).
   */
  filteredJurisdictions: DashboardJurisdiction[];

  /**
   * The provinces the switcher may offer.
   * Admin ⇒ GOB_ALL_PROVINCES (all 24). Govt ⇒ derived from ORIGINAL assignments
   * (NOT filteredJurisdictions — a switcher derived from the narrowed set would
   * shrink to one province after a selection and trap the operator).
   */
  allowedProvinces: Array<{ code: string; name: string }>;

  /**
   * ADMIN-ONLY drill-down names, to push into a SQL WHERE for tables the admin
   * queries universally (admin has no assignments to narrow, so the URL selection
   * is applied as an explicit predicate instead). Both null for govt — a govt's
   * scope is ALREADY enforced by filteredJurisdictions, and passing these for govt
   * would be a widening vector.
   */
  adminSelectedProvince: string | null;
  adminSelectedLocality: string | null;
};

/**
 * Resolve `(role, jurisdictions, {province, locality} searchParams)` into the full
 * jurisdiction-scope value a gob screen needs. See the module header for the fence
 * guarantees and docs/plans/jurisdiction-scope-primitive.md for the branch table.
 */
export async function resolveJurisdictionScope(
  input: JurisdictionScopeInput,
): Promise<ResolvedJurisdictionScope> {
  const { role, jurisdictions, params } = input;

  const selectedProvince = params.province ? provinceByCode(params.province) : null;

  const localities = selectedProvince
    ? await listLocalitiesByProvince(selectedProvince.code as ProvinceCode)
    : [];

  const selectedLocality =
    selectedProvince && params.locality
      ? await localityByName(selectedProvince.code as ProvinceCode, params.locality)
      : null;

  // THE FENCE — delegated to the already-tested pure core.
  const filteredJurisdictions = resolveScopedJurisdictions({
    jurisdictions,
    role,
    selectedProvinceName: selectedProvince?.name ?? null,
    selectedLocalityName: selectedLocality?.localityName ?? null,
  });

  const allowedProvinces =
    role === "admin"
      ? GOB_ALL_PROVINCES
      : Array.from(new Set(jurisdictions.map((j) => j.province)))
          .map((name) => ({ code: PROVINCE_ISO_MAP[name] ?? "", name }))
          .filter((p) => p.code !== "");

  const adminSelectedProvince = role === "admin" ? (selectedProvince?.name ?? null) : null;
  const adminSelectedLocality = role === "admin" ? (selectedLocality?.localityName ?? null) : null;

  return {
    selectedProvince,
    selectedLocality,
    localities,
    filteredJurisdictions,
    allowedProvinces,
    adminSelectedProvince,
    adminSelectedLocality,
  };
}
