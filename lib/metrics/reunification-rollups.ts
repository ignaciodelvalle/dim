// Server-only: this module queries the DB. A client import is a hard build error.
import "server-only";

// lib/metrics/reunification-rollups.ts — D4 reunification rate, PER ADMINISTRATIVE
// UNIT (province or locality), feeding the Panorama `reunificacion` layer.
//
// Episode logic mirrors fetchReunificationRate in lib/analytics/compliance-metrics.ts
// EXACTLY (same lost/recovered definition — a single source of truth for the
// numerator/denominator semantics), but groups by the pet's home jurisdiction
// (province, or province+locality) instead of collapsing to one national number.
//
//   lost episode = a `status_changed` event to_status='lost' in scope + period.
//   recovered    = that pet's FIRST status transition strictly after the lost
//                   event is to_status='active'. Deceased excluded (not counted
//                   as recovered, same as the national fetcher).
//
// PRIVACY (k-anonymity): at the LOCALITY level, a unit's ratePct is a signal
// over a population as small as ONE pet — suppression MUST key off the
// DENOMINATOR (lostEpisodes), never off ratePct itself. A unit with 2 lost
// episodes and a 100% reunification rate is exactly as re-identifiable as one
// with 2 lost episodes and a 0% rate; a unit with 500 lost episodes and a 3%
// rate is not re-identifiable at all. Suppressing on ratePct (a stash bug this
// module deliberately does NOT reproduce) would get both of those backwards.
// PROVINCE level cells are large enough that no suppression applies (mirrors
// every other U5 province rollup in src/modules/panorama/infrastructure/repository.ts).

import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

// Heavy read-only analytics — routed through the ANALYTICS pool (matches the
// Panorama repository + lib/metrics/population-control.ts precedent).
import { analyticsDb as db, petEvents, pets } from "@/db";

import { suppressSmallCells } from "./anonymity";
import type { ProjectionContext } from "./context";
import { petsScopeClause } from "./scope";

/** True when a govt actor has zero assigned jurisdictions → return zero shapes, no DB hit. */
function govtWithoutScope(ctx: ProjectionContext): boolean {
  return ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0;
}

/** Fraction → 0–100 percentage, one-decimal precision (matches
 * lib/analytics/compliance-metrics.ts pct — the shared convention across
 * every compliance/reunification rate in the codebase). */
function pct(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

export type ReunificationByUnitRow = {
  province: string;
  /** null at the PROVINCE aggregation level; the locality name at LOCALITY level. */
  locality: string | null;
  /** % of lost episodes in this unit that returned to active. */
  ratePct: number;
};

export type ReunificationByUnitKpi = {
  /** Visible units only — locality-level cells suppressed by k-anon are DROPPED
   * here, not included with a null/zeroed ratePct (matches the choropleth
   * suppressed-cell contract: the real value never leaves this module). */
  byUnit: ReunificationByUnitRow[];
  /** Count of locality units suppressed below k=5 lostEpisodes. Always 0 at
   * province level (no suppression — province cells are large). */
  suppressedCount: number;
};

/**
 * Per-unit reunification rate (D4), grouped by province or by (province,
 * locality). Feeds the Panorama `reunificacion` signal-point layer.
 *
 * Scope: govtWithoutScope(ctx) short-circuits to the empty shape (no DB hit).
 * Otherwise petsScopeClause(ctx) narrows the lost-episode query to the
 * viewer's jurisdiction (admin → universal; govt → intersect with assignments).
 */
export async function fetchReunificationByUnit(
  ctx: ProjectionContext,
  level: "province" | "locality",
): Promise<ReunificationByUnitKpi> {
  const empty: ReunificationByUnitKpi = { byUnit: [], suppressedCount: 0 };
  if (govtWithoutScope(ctx)) return empty;

  const scope = petsScopeClause(ctx);

  // All lost episodes in scope + period, attributed to the pet's HOME
  // jurisdiction (status_changed payloads carry no jurisdiction of their own —
  // same attribution rule the Panorama per-unit loaders use).
  const lostConditions: SQL[] = [
    eq(petEvents.eventType, "status_changed"),
    sql`(${petEvents.payload}->>'to_status') = 'lost'`,
    gte(petEvents.occurredAt, ctx.period.since),
    lte(petEvents.occurredAt, ctx.period.until),
    isNotNull(pets.jurisdictionProvince),
  ];
  if (level === "locality") lostConditions.push(isNotNull(pets.jurisdictionLocality));
  if (scope) lostConditions.push(sql`(${scope})`);

  const lostEvents = await db
    .select({
      petId: petEvents.petId,
      lostAt: petEvents.occurredAt,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .where(and(...lostConditions))
    .orderBy(petEvents.occurredAt);

  if (lostEvents.length === 0) return empty;

  // For each lost episode, find the FIRST status transition strictly after the
  // lost event for that pet — same recovery rule as fetchReunificationRate.
  const petIds = [...new Set(lostEvents.map((e) => e.petId))];
  const transitions = await db
    .select({
      petId: petEvents.petId,
      toStatus: sql<string>`(${petEvents.payload}->>'to_status')`,
      at: petEvents.occurredAt,
    })
    .from(petEvents)
    .where(and(eq(petEvents.eventType, "status_changed"), inArray(petEvents.petId, petIds)))
    .orderBy(petEvents.occurredAt);

  const transitionsByPet = new Map<string, Array<{ toStatus: string; at: Date }>>();
  for (const t of transitions) {
    const arr = transitionsByPet.get(t.petId) ?? [];
    arr.push({ toStatus: t.toStatus, at: t.at });
    transitionsByPet.set(t.petId, arr);
  }

  type UnitAgg = {
    province: string;
    locality: string | null;
    lostEpisodes: number;
    recovered: number;
  };
  const unitByKey = new Map<string, UnitAgg>();

  for (const episode of lostEvents) {
    const province = episode.province as string;
    const locality = level === "locality" ? (episode.locality as string) : null;
    const key = level === "locality" ? `${province}|${locality}` : province;
    let agg = unitByKey.get(key);
    if (!agg) {
      agg = { province, locality, lostEpisodes: 0, recovered: 0 };
      unitByKey.set(key, agg);
    }
    agg.lostEpisodes += 1;

    const after = (transitionsByPet.get(episode.petId) ?? []).filter(
      (t) => t.at.getTime() > episode.lostAt.getTime(),
    );
    const next = after[0];
    if (next && next.toStatus === "active") agg.recovered += 1;
  }

  const units = [...unitByKey.values()];

  if (level === "province") {
    // No k-anon — province cells are large (U5 asymmetry, matches every other
    // choropleth/aggregated-point province loader).
    return {
      byUnit: units.map((u) => ({
        province: u.province,
        locality: u.locality,
        ratePct: pct(u.recovered, u.lostEpisodes),
      })),
      suppressedCount: 0,
    };
  }

  // Locality level — k-anon on the DENOMINATOR (lostEpisodes), never on ratePct.
  const { visible, suppressedCount } = suppressSmallCells(units, {
    count: (u) => u.lostEpisodes,
    key: (u) => `${u.province}|${u.locality}`,
    k: 5,
  });
  const byUnit = (visible as unknown as UnitAgg[]).map((u) => ({
    province: u.province,
    locality: u.locality,
    ratePct: pct(u.recovered, u.lostEpisodes),
  }));
  return { byUnit, suppressedCount };
}
