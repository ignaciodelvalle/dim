// Argentine provinces + CABA. ISO 3166-2:AR codes are the canonical identifier;
// names and slugs are for display and routing. The 24 entries match the
// authoritative ISO list (https://en.wikipedia.org/wiki/ISO_3166-2:AR).
//
// Why codes: free-text province names ("CABA" / "Ciudad Autónoma de Buenos
// Aires" / "C.A.B.A.") would all aggregate as separate keys and silently
// break k-anonymity rollups (AGENTS.md → Aggregation & privacy policy).
// Stable codes solve that at the data layer. `provinceByName` is the
// alias-tolerant import-time resolver — useful when we migrate existing
// rows or accept free-text input from older form posts.
//
// The legacy `PROVINCIAS` export (flat `readonly string[]` of names) is
// preserved as a derived alias so the existing form call sites
// (PetForm.tsx, WelfareReportForm.tsx) keep compiling unchanged. They
// migrate to consume `PROVINCES` directly when PR D refactors them through
// the shared `<LocationFields>` component.

export type Province = {
  /** ISO 3166-2:AR code, e.g. "AR-C" for CABA. The canonical identifier. */
  readonly code: string;
  /** Display name in Spanish (Rioplatense usage), e.g. "Buenos Aires". */
  readonly name: string;
  /** URL-safe slug derived from the name, e.g. "buenos-aires". */
  readonly slug: string;
};

export const PROVINCES = [
  { code: "AR-B", name: "Buenos Aires", slug: "buenos-aires" },
  { code: "AR-C", name: "CABA", slug: "caba" },
  { code: "AR-K", name: "Catamarca", slug: "catamarca" },
  { code: "AR-H", name: "Chaco", slug: "chaco" },
  { code: "AR-U", name: "Chubut", slug: "chubut" },
  { code: "AR-X", name: "Córdoba", slug: "cordoba" },
  { code: "AR-W", name: "Corrientes", slug: "corrientes" },
  { code: "AR-E", name: "Entre Ríos", slug: "entre-rios" },
  { code: "AR-P", name: "Formosa", slug: "formosa" },
  { code: "AR-Y", name: "Jujuy", slug: "jujuy" },
  { code: "AR-L", name: "La Pampa", slug: "la-pampa" },
  { code: "AR-F", name: "La Rioja", slug: "la-rioja" },
  { code: "AR-M", name: "Mendoza", slug: "mendoza" },
  { code: "AR-N", name: "Misiones", slug: "misiones" },
  { code: "AR-Q", name: "Neuquén", slug: "neuquen" },
  { code: "AR-R", name: "Río Negro", slug: "rio-negro" },
  { code: "AR-A", name: "Salta", slug: "salta" },
  { code: "AR-J", name: "San Juan", slug: "san-juan" },
  { code: "AR-D", name: "San Luis", slug: "san-luis" },
  { code: "AR-Z", name: "Santa Cruz", slug: "santa-cruz" },
  { code: "AR-S", name: "Santa Fe", slug: "santa-fe" },
  { code: "AR-G", name: "Santiago del Estero", slug: "santiago-del-estero" },
  { code: "AR-V", name: "Tierra del Fuego", slug: "tierra-del-fuego" },
  { code: "AR-T", name: "Tucumán", slug: "tucuman" },
] as const satisfies readonly Province[];

export type ProvinceCode = (typeof PROVINCES)[number]["code"];

/**
 * Legacy export: flat list of province names. Preserved for back-compat
 * with PetForm and WelfareReportForm until PR D refactors them through
 * the shared `<LocationFields>` component. New code should import
 * `PROVINCES` instead.
 *
 * @deprecated Use `PROVINCES` with `code`/`name`/`slug` fields.
 */
export const PROVINCIAS: readonly string[] = PROVINCES.map((p) => p.name);

// Common informal abbreviations and formal phrasings that won't match a
// province name even after normalization. Hoisted to module scope so the
// object isn't reconstructed on every provinceByName call.
const ALIAS_TO_CODE: Record<string, ProvinceCode> = {
  // CABA variants
  cabba: "AR-C", // common typo
  capital: "AR-C",
  "capital federal": "AR-C",
  "ciudad autonoma de buenos aires": "AR-C",
  "ciudad de buenos aires": "AR-C",
  // Buenos Aires (provincia) variants
  "bs as": "AR-B", // common Argentine postal/journalistic abbreviation
  "bs aires": "AR-B",
  "provincia de buenos aires": "AR-B",
};

/**
 * Look up a province by its ISO 3166-2:AR code (e.g. "AR-C").
 * Returns `null` for unknown codes.
 */
export function provinceByCode(code: string | null | undefined): Province | null {
  if (!code) return null;
  return PROVINCES.find((p) => p.code === code) ?? null;
}

/**
 * Look up a province by display name with tolerance for whitespace, case,
 * diacritics, and common aliases (especially for CABA). Returns `null` for
 * unknown names. Use this when normalizing user input or existing free-text
 * rows during migration.
 *
 * Examples:
 *   provinceByName("CABA")                              → AR-C
 *   provinceByName("C.A.B.A.")                          → AR-C
 *   provinceByName("Ciudad Autónoma de Buenos Aires")   → AR-C
 *   provinceByName("Capital Federal")                   → AR-C
 *   provinceByName("cordoba")                           → AR-X
 *   provinceByName("Tucuman")                           → AR-T
 *   provinceByName("Río Negro")                         → AR-R
 *   provinceByName("rio negro")                         → AR-R
 *   provinceByName("Patagonia")                         → null
 */
export function provinceByName(name: string | null | undefined): Province | null {
  if (!name) return null;
  const normalized = normalize(name);
  if (!normalized) return null;

  const aliased = ALIAS_TO_CODE[normalized];
  if (aliased) return provinceByCode(aliased);

  // Match against normalized province names + slugs.
  for (const p of PROVINCES) {
    if (normalize(p.name) === normalized) return p;
    if (p.slug === normalized) return p;
  }
  return null;
}

/**
 * Normalize a string for case-insensitive, diacritic-insensitive lookup.
 * Trim, casefold, NFD-decompose, strip combining marks via the Unicode
 * Mark property `\p{M}` (requires the `u` flag), collapse internal
 * whitespace, and remove dots (so "C.A.B.A." normalizes to "caba").
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}
