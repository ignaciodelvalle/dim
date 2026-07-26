// lib/metrics/vet-access.ts — access-to-care signal: veterinary acts per 1k
// active pets by zone.
//
// Surfaces the veterinary event spine as a locality-level access-to-care
// projection on /gob/analytics AND as the panorama `acceso-veterinario`
// choropleth: veterinary acts per 1,000 active pets, grouped by the pet's home
// locality. Low per-1k localities mark care deserts (the CABA vs periphery
// inequity the PO wants visible).
//
// NUMERATOR WIDTH (2026-07-26). The numerator was `vet_visit_logged` ALONE —
// 85 rows in the entire database, against 29.123 vaccinations, 19.742 microchip
// implants and 17.817 sterilizations. Measured on that predicate the province
// choropleth returned exactly 0,0 for 23 of the 24 provinces and 14 for CABA:
// two values, no discrimination, and a flat map that reads as "no hay acceso en
// ninguna parte". Counting every act that REQUIRED A VETERINARY PROFESSIONAL
// (VET_ACTIVITY_EVENT_TYPES) moves it to 690,9 (Salta) → 1.997,9 (Mendoza)
// across all 24 provinces, with the same geography the desert layer shows.
//
// LOCALITY-GROUPED → k-ANONYMITY (k=5) IS MANDATORY. The denominator (active pets
// per locality) is the k-anon dimension: a locality with <5 active pets is
// suppressed so the row can never re-identify a household. Routed through
// suppressSmallCells (lib/metrics/anonymity.ts).
//
// SCOPE: vet_visit_logged carries a per-event jurisdiction snapshot in payload,
// but for consistency with every other non-outbreak fetcher (and to keep the
// numerator locality dimension identical to the denominator's) we scope AND group
// by the pet's HOME jurisdiction via petsScopeClause against the pets table.

import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { analyticsDb as db, petEvents, pets } from "@/db";

import { suppressSmallCells } from "./anonymity";
import type { ProjectionContext } from "./context";
import { activePetsCondition } from "./population";
import { petsScopeClause } from "./scope";

/**
 * The event types that constitute a VETERINARY ACT.
 *
 * Shared by BOTH access-to-care surfaces so they can never drift apart on the
 * definition: this fetcher (/gob/analytics + the `acceso-veterinario`
 * choropleth) and the panorama `desierto-veterinario` loader
 * (repository-choropleth.ts), which measures the complement — the share of pets
 * that received NONE of these.
 *
 * The rule is "did this act require a veterinary professional?", NOT "who typed
 * it in". `author_role` is the REPORTER, not the performer: 28.979 of the
 * 29.123 seeded vaccinations are owner-logged, so filtering on author_role='vet'
 * would measure vet-app adoption rather than veterinary activity. Justification
 * per member:
 *
 *   vet_visit_logged         — the clinical consult itself.
 *   vaccination_administered — the antirrábica must be applied by a licensed vet
 *                              (Ley 22.953); the act is veterinary whoever logs it.
 *   sterilization_performed  — surgery under anaesthesia; not owner-performable.
 *   microchip_implanted      — subcutaneous implant; a professional procedure.
 *   clinical_info_logged     — lab work / imaging / surgery / diagnosis records.
 *
 * DELIBERATELY EXCLUDED:
 *   deworming_administered — antiparasitics are sold over the counter and are
 *     routinely applied by the owner at home, so counting them would measure
 *     owner diligence, not access to professional service.
 *   weight_recorded, note_added — owner self-reports; measuring them would make
 *     the signal a proxy for registry engagement instead of veterinary access.
 */
export const VET_ACTIVITY_EVENT_TYPES = [
  "vet_visit_logged",
  "vaccination_administered",
  "sterilization_performed",
  "microchip_implanted",
  "clinical_info_logged",
] as const;

/** True when a govt actor has no assigned jurisdictions — queries return empty. */
function isEmptyScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

/**
 * Veterinary acts per 1,000 active pets. Returns 0 when there is no active
 * population (an empty locality has no access signal, not an infinite one).
 * One-decimal precision, matching the rate convention across lib/metrics.
 */
export function perThousand(visits: number, activePets: number): number {
  if (activePets === 0) return 0;
  return Math.round((visits / activePets) * 1000 * 10) / 10;
}

export type VetAccessRow = {
  /** Province name (pets.jurisdiction_province). */
  province: string;
  /** Locality name (pets.jurisdiction_locality). */
  locality: string;
  /**
   * VET_ACTIVITY_EVENT_TYPES events in the period whose pet is homed in this
   * locality. Named `visits` for the field's history; it counts every
   * veterinary ACT since 2026-07-26, not only logged consults.
   */
  visits: number;
  /** Active/lost pets homed in this locality (denominator + k-anon dimension). */
  activePets: number;
  /** Veterinary acts per 1,000 active pets, one decimal. */
  per1k: number;
};

export type VetAccessResult = {
  /**
   * Localities visible after k-anon suppression, sorted ASCENDING by per1k so
   * the lowest-access zones (care deserts) surface first.
   */
  localities: VetAccessRow[];
  /** Count of localities suppressed for having <5 active pets (privacy). */
  suppressedCount: number;
};

/**
 * KPI: vet_access_per_1k_locality (see lib/metrics/kpi-catalog.ts)
 *
 * NUMERATOR:   COUNT veterinary-act events (VET_ACTIVITY_EVENT_TYPES) in
 *              ctx.period whose pet is homed in the locality.
 * DENOMINATOR: COUNT active/lost pets homed in the locality, / 1,000.
 * SOURCE:      pets, pet_events (VET_ACTIVITY_EVENT_TYPES).
 * CADENCE:     matches the caller's ProjectionContext period.
 * SUPPRESSION: k-anon (k=5) on the per-locality active-pet population — a
 *              locality with <5 active pets is dropped.
 *
 * @param ctx - ProjectionContext (actor + scope + period).
 */
export async function fetchVetAccessByLocality(ctx: ProjectionContext): Promise<VetAccessResult> {
  const empty: VetAccessResult = { localities: [], suppressedCount: 0 };
  if (isEmptyScope(ctx)) return empty;

  const activeCond = activePetsCondition(ctx);
  const scope = petsScopeClause(ctx);

  // Denominator: active pets per (province, locality).
  const popRows = await db
    .select({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      n: count(),
    })
    .from(pets)
    .where(and(activeCond, sql`${pets.jurisdictionLocality} IS NOT NULL`))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality);

  // Numerator: veterinary-act events in the period, grouped by the pet's home
  // locality. Scoped by the pet JOIN + petsScopeClause (deworming-class scope).
  const visitConditions = [
    inArray(petEvents.eventType, VET_ACTIVITY_EVENT_TYPES),
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
    sql`${pets.jurisdictionLocality} IS NOT NULL`,
  ];
  if (scope) visitConditions.push(sql`(${scope})`);

  const visitRows = await db
    .select({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      n: count(),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...visitConditions))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality);

  const keyOf = (province: string, locality: string) => `${province}::${locality}`;
  const visitsByKey = new Map<string, number>();
  for (const r of visitRows) {
    if (r.province === null || r.locality === null) continue;
    visitsByKey.set(keyOf(r.province, r.locality), r.n);
  }

  // Build one row per locality that has an active population — that population is
  // the k-anon dimension. A locality with visits but 0 active pets (a stale
  // move) contributes no denominator and is intentionally not surfaced.
  const rows: VetAccessRow[] = popRows
    .filter(
      (r): r is typeof r & { province: string; locality: string } =>
        r.province !== null && r.locality !== null,
    )
    .map((r) => {
      const visits = visitsByKey.get(keyOf(r.province, r.locality)) ?? 0;
      return {
        province: r.province,
        locality: r.locality,
        visits,
        activePets: r.n,
        per1k: perThousand(visits, r.n),
      };
    });

  // k-anon on the active-pet population — suppress localities with <5 pets.
  const { visible, suppressedCount } = suppressSmallCells(rows, {
    count: (r) => r.activePets,
    key: (r) => keyOf(r.province, r.locality),
  });

  const localities = (visible as unknown as VetAccessRow[])
    .slice()
    .sort((a, b) => a.per1k - b.per1k);

  return { localities, suppressedCount };
}
