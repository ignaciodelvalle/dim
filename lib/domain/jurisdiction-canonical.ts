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
