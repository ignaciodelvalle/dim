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
import { isWholeProvinceLocality } from "@/lib/domain/jurisdiction-canonical";

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
  const pairs = jurisdictions.map((j) =>
    // Whole-province assignment (e.g. CABA / "Ciudad Autónoma de Buenos Aires")
    // subsumes every locality/barrio in that province — match on province alone.
    // Province equality is always kept, so other provinces stay invisible.
    // A barrio-specific assignment (CABA / Palermo) keeps the exact pair.
    //
    // NULL-locality rows (residual/legacy welfare_reports where the point could
    // not be reverse-geocoded to a locality — see FIX #3A/#3B, QA 2026-07-10):
    // the whole-province branch tests province ONLY, so it also matches rows with
    // jurisdiction_locality IS NULL — those reach the broad-jurisdiction operators
    // exactly as the PO decided. The specific-locality branch compares
    // `locality = Y`, which is UNKNOWN (never true) for a NULL locality, so a
    // barrio/locality-scoped operator is deliberately NOT widened by them. This is
    // the intended subsumption — no separate `IS NULL` disjunction is needed.
    isWholeProvinceLocality(j.province, j.locality)
      ? sql`(${provinceExpr} = ${j.province})`
      : sql`(${provinceExpr} = ${j.province} AND ${localityExpr} = ${j.locality})`,
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
  return jurisdictionPairClause(
    jurisdictions,
    sql`${pets.jurisdictionProvince}`,
    sql`${pets.jurisdictionLocality}`,
  );
}

/**
 * Returns a Drizzle SQL clause that restricts a `pet_events`-based query to the
 * viewer's jurisdiction scope, using the JSONB payload fields
 * `pet_jurisdiction_province` / `pet_jurisdiction_locality`.
 *
 * ⚠️ VALID ONLY FOR outbreak_signal-family QUERIES. Those payload keys are a
 * jurisdiction SNAPSHOT that EXACTLY ONE event type writes: `outbreak_signal`
 * (emitted by symptom-observed-use-case and record-disease-diagnosis-use-case;
 * the schema keeps the snapshot so surveillance aggregates hold even if the pet
 * later moves). NO other event type carries these keys — the insert path enriches
 * the outbox, not the payload. Applying this clause to a query over any OTHER
 * event type (vaccination_administered, incident_reported, sterilization_performed,
 * death_recorded, disease_reported, …) silently evaluates to `false` for every
 * real row of a scoped govt actor, returning ZERO results (admin/national is
 * unaffected because the clause resolves to `null`). This is the "ghost-payload"
 * bug class. For those event types, scope by the pet's home jurisdiction instead:
 * `petsScopeClause(ctx)` against `.innerJoin(pets, eq(pets.id, petEvents.petId))`
 * (that join is many-events→one-pet, so it never fans out).
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
  return jurisdictionPairClause(
    jurisdictions,
    sql`(${petEvents.payload}->>'pet_jurisdiction_province')`,
    sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
  );
}
