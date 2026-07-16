import type { AdminOrGovtJurisdiction } from "@/lib/infra/auth-guards";

/**
 * Concise es-AR scope label for the panorama masthead + footer, derived from the
 * operator's assigned jurisdictions.
 *
 * SHARED between /gob/panorama and /admin/panorama: both routes admit a govt-role
 * session (an admin may view /gob; a govt operator may reach /admin/panorama — the
 * Q12 designed-for case), so both must render the SAME honest scope string. It was
 * previously inlined only in the gob page, which let /admin keep a hardcoded
 * "Nacional · todas las provincias" that lied for a bounded govt operator landing
 * there (Cursor QA 2026-07-16). One source of truth prevents that drift.
 *
 * Admin (universal) or a zero-jurisdiction account → national. A bounded operator
 * → their real jurisdiction(s).
 */
export function panoramaScopeLabel(role: string, jurisdictions: AdminOrGovtJurisdiction[]): string {
  if (role === "admin" || jurisdictions.length === 0) return "Nacional · todas las provincias";
  const provinces = [...new Set(jurisdictions.map((j) => j.province))];
  if (provinces.length === 1) {
    const localities = jurisdictions.map((j) => j.locality);
    return localities.length <= 2 ? `${provinces[0]} · ${localities.join(", ")}` : provinces[0];
  }
  return provinces.length <= 3 ? provinces.join(", ") : `${provinces.length} provincias`;
}
