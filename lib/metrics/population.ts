// Single-source-of-truth denominator definitions for Pattern-B aggregate fetchers.
//
// These functions return composable Drizzle SQL fragments, not full queries.
// Fetchers build their numerators on top of these base-population clauses,
// guaranteeing that rates computed against different numerators share the same
// denominator definition.
//
// D7 (spec invariant): Pattern B reads pets.status / pets.species (denormalized
// columns) rather than replaying events per pet. This is correct and intentional
// at population scale — the per-pet event replay (Pattern A) is too slow for
// dashboard aggregates. The lag risk is owned, not accidental.

import { and, eq, sql } from "drizzle-orm";

import { petEvents, pets } from "@/db";

import type { ProjectionContext } from "./context";
import { petEventsScopeClause, petsScopeClause } from "./scope";

/**
 * Base condition: pets in scope with status 'active' or 'lost' (excludes deceased).
 * Reads pets.status — denormalized, authoritative for aggregates (D7).
 *
 * Returns a Drizzle SQL expression suitable for use in .where(and(...conditions)).
 */
export function activePetsCondition(ctx: ProjectionContext) {
  const scope = petsScopeClause(ctx);
  const base = sql`${pets.status} IN ('active', 'lost')`;
  return scope ? and(base, sql`(${scope})`) : base;
}

/**
 * Base condition: dogs in scope (activePets + species='dog').
 * Reads pets.species — denormalized, authoritative for aggregates (D7).
 */
export function dogsInScopeCondition(ctx: ProjectionContext) {
  const scope = petsScopeClause(ctx);
  const base = and(sql`${pets.status} IN ('active', 'lost')`, eq(pets.species, "dog"));
  return scope ? and(base, sql`(${scope})`) : base;
}

/**
 * Base condition for pet_events queries: scope to the ctx jurisdiction.
 * Optionally narrows to a specific eventType and/or a time window.
 *
 * @param eventType - If provided, adds `eventType = ?` to the conditions.
 * @param window    - If provided, adds `occurredAt >= window.since` to the conditions.
 */
export function petEventsInScopeCondition(
  ctx: ProjectionContext,
  opts: {
    eventType?: string;
    window?: { since: Date; until?: Date };
  } = {},
) {
  const scope = petEventsScopeClause(ctx);
  const parts = [];
  if (opts.eventType) parts.push(eq(petEvents.eventType, opts.eventType));
  if (opts.window) {
    // Bind dates as ISO strings — a raw JS Date interpolated into sql`` crashes
    // postgres-js (prepare:false) with ERR_INVALID_ARG_TYPE. The comparison
    // casts the ISO string to timestamptz.
    parts.push(sql`${petEvents.occurredAt} >= ${opts.window.since.toISOString()}`);
    if (opts.window.until) {
      parts.push(sql`${petEvents.occurredAt} <= ${opts.window.until.toISOString()}`);
    }
  }
  if (scope) parts.push(sql`(${scope})`);
  return parts.length === 0 ? undefined : and(...parts);
}
