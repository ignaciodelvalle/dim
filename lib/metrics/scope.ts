// Single source of truth for jurisdiction-scope SQL clauses on Pattern-B fetchers.
//
// Previously petsScopeClause and petEventsScopeClause were duplicated between
// lib/govt-dashboards.ts and lib/govt-home-kpis.ts, and the jurisdiction-pair
// predicate was re-derived inline ~14× across fetchers. This module eliminates
// that duplication.
//
// Import note: this file uses @/db (Drizzle) — it lives in infrastructure,
// not domain/. This is Pattern-B territory (aggregate reads, not pure rules).

import { sql } from "drizzle-orm";

import { petEvents, pets } from "@/db";

import type { ProjectionContext } from "./context";

/**
 * Returns a Drizzle SQL clause that restricts a `pets`-based query to the
 * viewer's jurisdiction scope.
 *
 * - admin → null (no restriction; caller omits the WHERE clause)
 * - govt with no assignments → `false` (matches nothing; preserves early-return semantics)
 * - govt with assignments → OR of (province=X AND locality=Y) pairs
 */
export function petsScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") return null;
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
 * - admin → null
 * - govt with no assignments → `false`
 * - govt with assignments → OR of payload province+locality pairs
 */
export function petEventsScopeClause(ctx: ProjectionContext) {
  if (ctx.scope.kind === "global") return null;
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
