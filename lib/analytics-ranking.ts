// Cross-region ranking projections for /gob/analytics (Item 22).
//
// Provides:
//   rankByField — pure sort + slice + rank assignment (testable without DB)
//   fetchRegionRanking — DB-backed ranking by rabies coverage per province

import { and, count, countDistinct, eq, inArray, sql } from "drizzle-orm";

import { db, petEvents, pets } from "@/db";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  PROVINCE_ISO_MAP,
} from "./govt-dashboards";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export type RankedRow = {
  province: string;
  code: string;
  value: number;
  count: number;
  rank: number;
};

type UnrankedRow = { province: string; code: string; value: number; count: number };

/**
 * Sort `rows` by `field`, take the first `limit`, then assign 1-based rank.
 * `dir: "desc"` = highest first (top performers); `"asc"` = lowest first (worst performers).
 */
export function rankByField(
  rows: UnrankedRow[],
  field: keyof Pick<UnrankedRow, "value" | "count">,
  dir: "asc" | "desc",
  limit: number,
): RankedRow[] {
  const sorted = [...rows].sort((a, b) =>
    dir === "desc" ? b[field] - a[field] : a[field] - b[field],
  );
  return sorted.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---------------------------------------------------------------------------
// DB fetcher
// ---------------------------------------------------------------------------

export type RegionRankingRow = RankedRow & {
  /**
   * Rabies vaccination coverage as a percentage (0-100).
   * Computed as (petsWithRabiesVaccine / totalPets) * 100, rounded to integer.
   * Null if totalPets = 0 for this province.
   */
  coveragePct: number | null;
};

export type RegionRankingResult = {
  /** Top 5 provinces by rabies vaccination coverage (highest first). */
  top: RegionRankingRow[];
  /** Bottom 5 provinces by rabies vaccination coverage (lowest first). */
  bottom: RegionRankingRow[];
};

/**
 * Compute per-province rabies vaccination coverage and return the top / bottom 5.
 *
 * Source:
 *  - Denominator: pets with status 'active' or 'lost' per province.
 *  - Numerator: distinct pet IDs with ≥1 vaccination_administered where
 *    vaccine_name accent-insensitively matches "%rabi%" (same unaccent logic
 *    as fetchAnalyticsMetrics).
 *
 * Scope: admin sees all provinces; govt sees only their assigned provinces.
 * When a province has 0 active/lost pets it is excluded from the ranking
 * (coveragePct would be undefined / divide-by-zero).
 */
export async function fetchRegionRanking(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<RegionRankingResult> {
  if (actor.role === "govt" && jurisdictions.length === 0) {
    return { top: [], bottom: [] };
  }

  // Build scope filter for the pets table.
  const petsScope =
    actor.role === "govt"
      ? sql`(${sql.join(
          jurisdictions.map(
            (j) =>
              sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
          ),
          sql` OR `,
        )})`
      : null;

  // 1. Total active+lost pets per province.
  const totalConditions = [sql`${pets.status} IN ('active', 'lost')`];
  if (petsScope) totalConditions.push(sql`(${petsScope})`);

  const totalRows = await db
    .select({ province: pets.jurisdictionProvince, n: count() })
    .from(pets)
    .where(and(...totalConditions))
    .groupBy(pets.jurisdictionProvince);

  if (totalRows.length === 0) return { top: [], bottom: [] };

  const provinceNames = totalRows
    .filter((r) => r.province !== null)
    .map((r) => r.province as string);

  // 2. Distinct pets with ≥1 rabies vaccination, restricted to provinces we found above.
  const rabiesConditions = [
    eq(petEvents.eventType, "vaccination_administered"),
    sql`unaccent(${petEvents.payload}->>'vaccine_name') ILIKE unaccent(${"%rabi%"})`,
    sql`${pets.status} IN ('active', 'lost')`,
    inArray(pets.jurisdictionProvince, provinceNames),
  ];
  if (petsScope) rabiesConditions.push(sql`(${petsScope})`);

  const rabiesRows = await db
    .select({ province: pets.jurisdictionProvince, n: countDistinct(petEvents.petId) })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...rabiesConditions))
    .groupBy(pets.jurisdictionProvince);

  const rabiesByProvince = new Map<string, number>();
  for (const r of rabiesRows) {
    if (r.province) rabiesByProvince.set(r.province, r.n);
  }

  // 3. Build ranked rows — only provinces with totalPets > 0.
  const unranked: UnrankedRow[] = totalRows
    .filter((r) => r.province !== null && r.n > 0)
    .map((r) => {
      const prov = r.province as string;
      const total = r.n;
      const vaccinated = rabiesByProvince.get(prov) ?? 0;
      const coveragePct = Math.round((vaccinated / total) * 100);
      return {
        province: prov,
        code: PROVINCE_ISO_MAP[prov] ?? "",
        value: coveragePct,
        count: total,
      };
    });

  const topRanked = rankByField(unranked, "value", "desc", 5);
  const bottomRanked = rankByField(unranked, "value", "asc", 5);

  function toResult(rows: RankedRow[]): RegionRankingRow[] {
    return rows.map((r) => ({ ...r, coveragePct: r.value }));
  }

  return { top: toResult(topRanked), bottom: toResult(bottomRanked) };
}
