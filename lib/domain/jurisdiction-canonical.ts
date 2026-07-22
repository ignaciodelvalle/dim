// Canonical jurisdiction_province storage helper (handoff P6 / critique §Bug 2).
//
// Decision (2026-05-28): the canonical storage format for jurisdiction_province
// is the **display name** as it appears in lib/ar-provincias.ts → PROVINCES.
// Example: "Buenos Aires", "CABA", "Mendoza".
//
// The wire format from LocationFields is the ISO code (`provinceCode=AR-B`).
// This helper bridges the two: every server action that writes
// jurisdiction_province pipes its input through canonicalProvinceNameForStorage
// so the column stays in a single format.
//
// Reasons for display-name over ISO:
//   - Existing code (pets.ts, welfare.ts, govt dashboards) already reads and
//     filters by display name.
//   - K-anonymity rollups in govt dashboards group on this column.
//   - ISO codes are great as keys but ugly when surfaced in error messages
//     or audit logs — display names need no UI translation.
//
// Migration 0055 backfills the 11 tables holding this column to display name
// and adds a CHECK constraint enforcing the 24-value enum.

import { PROVINCES, provinceByCode, provinceByName } from "@/lib/reference/ar-provincias";

/**
 * Normalize any province input — ISO code, exact display name, alias (e.g.
 * "Capital Federal", "Bs As"), case variant, INDEC long form — into the
 * canonical display name suitable for storage in `jurisdiction_province`.
 *
 * Returns `null` for empty input or unresolvable strings. Callers that
 * have a NOT NULL column should validate the result before writing.
 */
export function canonicalProvinceNameForStorage(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ISO code path — fastest and unambiguous.
  if (/^AR-[A-Z]$/.test(trimmed)) {
    return provinceByCode(trimmed)?.name ?? null;
  }

  // Alias-tolerant resolver handles case, diacritics, and known aliases
  // ("Ciudad Autónoma de Buenos Aires" → "CABA", "Bs As" → "Buenos Aires").
  return provinceByName(trimmed)?.name ?? null;
}

/**
 * Set of valid display names, frozen at module load. Used by the runtime
 * validation guard and as the source of truth for the SQL CHECK constraint
 * in migration 0055.
 */
export const CANONICAL_PROVINCE_NAMES: ReadonlySet<string> = new Set(PROVINCES.map((p) => p.name));

export function isCanonicalProvinceName(value: string | null | undefined): boolean {
  if (!value) return false;
  return CANONICAL_PROVINCE_NAMES.has(value);
}

// ---------------------------------------------------------------------------
// Whole-province localities (two-tier CABA jurisdiction model)
// ---------------------------------------------------------------------------

// Some provinces are modeled by INDEC as a SINGLE locality equal to the whole
// province. CABA is the canonical case: the INDEC localities catalog holds ONE
// CABA entry ("Ciudad Autónoma de Buenos Aires"), while the 48 barrios
// (Ley CABA 1.777) are a FINER overlay imported separately (category 'barrio',
// province_code AR-C). See
// docs/superpowers/plans/archive/2026-05-19-caba-barrios-import-execution.md.
//
// Consequence: a CABA row's jurisdiction_locality can be EITHER the whole-city
// entry (legacy rows + INDEC-only seeds, e.g. seed-demo-scenario's FOCAL_LOCALITY)
// OR a specific barrio (Palermo, Almagro, …) when the address was geocoded to a
// barrio. Backfilling legacy whole-city rows to barrios was explicitly declined
// (out of scope) — the two tiers coexist by design.
//
// For jurisdiction scoping this means a govt assignment on the whole-province
// locality governs the ENTIRE province and MUST subsume every locality/barrio in
// it. An exact (province, locality) pair match cannot bridge the two tiers, so a
// whole-CABA operator would otherwise never see a barrio-tagged denuncia (and
// vice-versa). See jurisdictionPairClause in lib/metrics/scope.ts.
//
// Map: canonical province display name → its whole-province INDEC locality name.
export const WHOLE_PROVINCE_LOCALITY: Readonly<Record<string, string>> = {
  CABA: "Ciudad Autónoma de Buenos Aires",
};

/**
 * True when `(province, locality)` is the whole-province INDEC single-entry
 * locality — i.e. jurisdiction at PROVINCE granularity rather than a specific
 * sub-locality/barrio. Jurisdiction scope clauses use this so a whole-province
 * govt assignment matches every locality in that province instead of only the
 * exact whole-province string.
 *
 * Deliberately narrow: only the whole-province catch-all subsumes sub-localities.
 * A barrio-specific assignment (e.g. `CABA / Palermo`) stays exact-match, so it
 * never widens beyond its barrio and other provinces stay invisible.
 */
export function isWholeProvinceLocality(
  province: string | null | undefined,
  locality: string | null | undefined,
): boolean {
  if (!province || !locality) return false;
  return WHOLE_PROVINCE_LOCALITY[province] === locality;
}

/**
 * True for a WHOLE-PROVINCE govt assignment in EITHER stored form: the
 * generic `locality === ""` sentinel (used by most provinces) or the two-tier
 * INDEC canonical form above (CABA's whole-city entry, a non-empty locality
 * NAME). `lib/metrics/context.ts` (`isSubProvincialScope`,
 * `censusEligibleProvince`) and `lib/ui/scope-chrome.ts` (`describeMandate`)
 * both need this exact subsumption — the WORDING an operator reads and the
 * QUERY semantics that scope their data must never disagree about what counts
 * as "the whole province" (C3, plan-maestro-integridad).
 */
export function isWholeProvinceAssignment(j: {
  province: string;
  locality: string;
}): boolean {
  return j.locality === "" || isWholeProvinceLocality(j.province, j.locality);
}

/**
 * In-memory counterpart of `jurisdictionPairClause` (lib/metrics/scope.ts):
 * does a govt actor's assigned jurisdiction set contain the target
 * `(province, locality)`?
 *
 * Same subsumption semantics as the SQL clause, so a scoping decision made in
 * application code matches what the dashboards' WHERE clauses would filter:
 *   - a WHOLE-PROVINCE assignment (e.g. CABA / "Ciudad Autónoma de Buenos Aires")
 *     matches on PROVINCE alone — it subsumes every locality/barrio in that
 *     province (a whole-CABA operator governs any CABA barrio).
 *   - a barrio/locality-specific assignment (e.g. CABA / Palermo) requires the
 *     EXACT pair — it never widens beyond its own barrio.
 *
 * Fail-closed: a target with no province is in nobody's scope (returns false),
 * mirroring how a null jurisdiction row is never selected by the SQL clause.
 */
export function jurisdictionScopeContains(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  targetProvince: string | null | undefined,
  targetLocality: string | null | undefined,
): boolean {
  if (!targetProvince) return false;
  return jurisdictions.some((j) =>
    isWholeProvinceLocality(j.province, j.locality)
      ? j.province === targetProvince
      : j.province === targetProvince && j.locality === targetLocality,
  );
}

/**
 * Narrow a govt actor's assigned jurisdictions by an optional (province, locality)
 * UI filter, WITH whole-province subsumption. The result is the effective scope
 * the scoped loaders receive — it NEVER widens beyond the actor's assignments:
 *
 *   - no province selected            → the full assignment list (unchanged).
 *   - province only                   → assignments in that province.
 *   - province + locality selected    → the SINGLE selected unit, but only if
 *     it is within scope (jurisdictionScopeContains applies whole-province
 *     subsumption, so a whole-province assignment NARROWS to the picked locality
 *     instead of being emptied by an exact-locality mismatch); otherwise `[]`.
 *
 * Bug this fixes (critique of PR #762): the previous inline intersection filtered
 * assignments by EXACT locality equality, so a whole-province assignment (e.g.
 * whole-CABA / "Ciudad Autónoma de Buenos Aires") disappeared the moment a barrio
 * locality filter was applied → scoped=[] → the loaders emitted `sql\`false\`` →
 * empty results for data the operator legitimately governs. Subsumption narrows
 * to the selected locality instead of emptying.
 *
 * Admin actors must NOT be routed through this helper — their drill-down uses the
 * explicit adminProvince/adminLocality predicates, not scope narrowing.
 */
export function narrowGovtScope(
  jurisdictions: ReadonlyArray<{ province: string; locality: string }>,
  selectedProvince: string | null | undefined,
  selectedLocality: string | null | undefined,
): { province: string; locality: string }[] {
  if (!selectedProvince) return jurisdictions.map((j) => ({ ...j }));
  if (!selectedLocality) {
    return jurisdictions.filter((j) => j.province === selectedProvince).map((j) => ({ ...j }));
  }
  return jurisdictionScopeContains(jurisdictions, selectedProvince, selectedLocality)
    ? [{ province: selectedProvince, locality: selectedLocality }]
    : [];
}
