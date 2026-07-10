// Pure, dependency-light predicate for the province-as-locality overlap.
//
// Lives in lib/reference (NOT lib/infra) on purpose: it must stay free of any
// `@/db` / `server-only` import so it can be reused from three places that run
// in very different environments — the runtime dropdown belt (server), the
// INDEC importer (tsx script), and the CI guard scripts/check-locality-integrity
// (plain tsx, no server context). It depends only on the pure province catalog.

import { provinceByName } from "@/lib/reference/ar-provincias";

/**
 * True when a locality row is really the *whole-province aggregate* — a phantom
 * "locality" that spans its entire province rather than a real subdivision.
 *
 * The canonical offender is CABA's "Ciudad Autónoma de Buenos Aires"
 * (indec_id 02000010, category 'componente'): INDEC ships the city as a single
 * locality that coexists with the 48 barrios tiling the same city, so selecting
 * it in a Localidad dropdown double-counts every barrio it contains.
 *
 * A row qualifies only when BOTH hold:
 *   1. its canonical name resolves to its OWN province — province==locality
 *      identity (provinceByName tolerates the "Ciudad Autónoma…" alias → AR-C), and
 *   2. it has no departamento (`departmentCode` null) — i.e. it is the province
 *      itself, not a subdivision.
 *
 * Why BOTH conditions (verified against the live INDEC catalog):
 *   - Name-equality alone would wrongly drop real capital cities that share
 *     their province's name (Córdoba, Mendoza, Salta, Paraná…) — but every
 *     capital sits inside a departamento, so condition (2) spares them.
 *   - department-null alone would wrongly drop the 48 CABA barrios (also
 *     department-less) — but their names ("Palermo", "Recoleta"…) do not
 *     resolve to AR-C, so condition (1) spares them.
 * Only CABA's whole-city row satisfies both. It is the sole department-less row
 * whose name resolves to its province across the entire catalog.
 */
export function isWholeProvinceAggregate(row: {
  provinceCode: string;
  localityName: string;
  departmentCode: string | null;
}): boolean {
  if (row.departmentCode != null) return false;
  return provinceByName(row.localityName)?.code === row.provinceCode;
}
