// Single source of truth for jurisdiction-scope SQL clauses on Pattern-B fetchers.
//
// Previously petsScopeClause and petEventsScopeClause were duplicated between
// lib/govt-dashboards.ts and lib/govt-home-kpis.ts, and the jurisdiction-pair
// predicate was re-derived inline ~14× across fetchers. This module eliminates
// that duplication.
//
// Import note: this file uses @/db (Drizzle) — it lives in infrastructure,
// not domain/. This is Pattern-B territory (aggregate reads, not pure rules).

import { type SQL, and, eq, sql } from "drizzle-orm";

import { petEvents, pets } from "@/db";

import type { DashboardJurisdiction } from "./context";
import type { ProjectionContext } from "./context";

/**
 * Builds the OR-of-(province=X AND locality=Y) disjunction for a list of
 * jurisdiction assignments. Parameterized by SQL expressions so callers can
 * pass any table column or JSONB extraction as the province/locality operands.
 *
 * Returns `null` when `jurisdictions` is empty — callers that need `sql\`false\``
 * for the empty case must handle it themselves (see govtJurisdictionClause for
 * a wrapper that does so automatically).
 *
 * IMPORTANT: this function never emits the admin branch. Call it only when
 * you have already established that the actor is govt (or you need the raw
 * pairs regardless of role).
 *
 * @example
 * // pets table columns
 * jurisdictionPairClause(jurisdictions,
 *   sql`${pets.jurisdictionProvince}`,
 *   sql`${pets.jurisdictionLocality}`)
 *
 * @example
 * // JSONB payload fields
 * jurisdictionPairClause(jurisdictions,
 *   sql`(${petEvents.payload}->>'pet_jurisdiction_province')`,
 *   sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`)
 */
export function jurisdictionPairClause(
  jurisdictions: DashboardJurisdiction[],
  provinceExpr: SQL,
  localityExpr: SQL,
): SQL | null {
  if (jurisdictions.length === 0) return null;
  const pairs = jurisdictions.map(
    (j) => sql`(${provinceExpr} = ${j.province} AND ${localityExpr} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

/**
 * Returns a Drizzle SQL clause that restricts a `pets`-based query to the
 * viewer's jurisdiction scope.
 *
 * - admin, no province selected → null (no restriction; caller omits the WHERE clause)
 * - admin + province selected  → province (and optionally locality) predicate
 *   (Panorama admin drill-down only — scope.kind is still "global" but we
 *   append an ADDITIONAL narrowing predicate; see ProjectionContext.adminProvince)
 * - govt with no assignments   → `false` (matches nothing; preserves early-return semantics)
 * - govt with assignments      → OR of (province=X AND locality=Y) pairs
 *
 * SECURITY: the admin province branch fires ONLY when scope.kind === "global"
 * (i.e. actor.role === "admin"). Govt actors always have scope.kind ===
 * "jurisdictions" so they never reach this branch and adminProvince has zero
 * effect on their clause.
 */
export function petsScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") {
    // Admin province drill-down: narrow from universal to the selected province.
    // Govt users must NOT pass these fields — their scope is enforced by
    // the jurisdiction pairs below (same invariant as buildMaltratoListConditions).
    if (!ctx.adminProvince) return null;
    if (ctx.adminLocality) {
      return and(
        eq(pets.jurisdictionProvince, ctx.adminProvince),
        eq(pets.jurisdictionLocality, ctx.adminLocality),
      );
    }
    return eq(pets.jurisdictionProvince, ctx.adminProvince);
  }
  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(${pets.jurisdictionProvince} = ${j.province} AND ${pets.jurisdictionLocality} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
}

/**
 * Returns a Drizzle SQL clause that restricts a `pet_events`-based query to the
 * viewer's jurisdiction scope, using the JSONB payload fields that event types
 * such as vaccination_administered and incident_reported carry.
 *
 * - admin, no province → null
 * - admin + province   → payload province (and optionally locality) predicate
 * - govt with no assignments → `false`
 * - govt with assignments    → OR of payload province+locality pairs
 *
 * SECURITY: same guarantee as petsScopeClause — the admin branch only fires
 * when scope.kind === "global".
 */
export function petEventsScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") {
    if (!ctx.adminProvince) return null;
    if (ctx.adminLocality) {
      return and(
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${ctx.adminProvince}`,
        sql`(${petEvents.payload}->>'pet_jurisdiction_locality') = ${ctx.adminLocality}`,
      );
    }
    return sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${ctx.adminProvince}`;
  }
  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) => sql`(
      (${petEvents.payload}->>'pet_jurisdiction_province') = ${j.province}
      AND (${petEvents.payload}->>'pet_jurisdiction_locality') = ${j.locality}
    )`,
  );
  return sql.join(pairs, sql` OR `);
}
