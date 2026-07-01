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
