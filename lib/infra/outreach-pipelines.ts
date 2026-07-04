// lib/outreach-pipelines.ts — Actionable outreach pipelines for /gob/outreach.
//
// Item 21 — "del dato a la acción": converts KPIs into target lists that
// government operators can export for contact campaigns.
//
// Three pipelines (v1):
//   (a) fetchOverdueRabiesVaccine   — pets with overdue antirrábica, by jurisdiction
//   (b) fetchStrayDensityAreas      — barrios with rising stray-scan density
//   (c) fetchSterilizationVetRanking — vets by sterilization throughput (recognition)
//
// PII contract (MANDATORY per spec):
//   Every call to the three fetch functions logs a pii_queried audit row via
//   logOutreachPiiQuery. These lists are OPERATIONAL (jurisdiction-scoped PII),
//   NOT k-anonymized public aggregates — distinct from Item 0–4 KPIs.
//   The export route also calls logOutreachPiiQuery with the export context.
//
// Scope model (identical to Pattern-B fetchers):
//   admin  → global (no WHERE restriction)
//   govt   → jurisdiction-scoped (province + locality pairs from govt_assignments)
//
// Note on SQL scope clauses: these fetchers use raw SQL with aliased tables
// (e.g. `pets p`). We build raw SQL scope clauses directly rather than using
// petsScopeClause() from lib/metrics/scope, which generates Drizzle qualified
// column references (e.g. "pets"."jurisdiction_province") that Postgres rejects
// when the table is aliased in raw SQL context.
//
// No schema changes — pure projection over existing events + pets tables.

import { sql } from "drizzle-orm";

import { auditLog, db } from "@/db";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import type { ProjectionContext } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// PII audit log helper
// ---------------------------------------------------------------------------

/**
 * Write a mandatory pii_queried audit row on every outreach-pipeline list view.
 * surface is always "outreach_pipeline"; pipeline identifies which of the three
 * fetchers was called. Fire-and-forget — callers do not need to await.
 */
export async function logOutreachPiiQuery(
  actorUserId: string,
  pipeline: "overdue_rabies" | "stray_density" | "sterilization_ranking",
  resultCount: number,
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId,
    action: "pii_queried",
    payload: {
      surface: "outreach_pipeline",
      pipeline,
      result_count: resultCount,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Number of days after which a rabies vaccine is considered overdue. */
const RABIES_OVERDUE_DAYS = 365;

function overdueVaccineCutoff(): Date {
  return new Date(Date.now() - RABIES_OVERDUE_DAYS * 86400_000);
}

/**
 * Build a raw SQL jurisdiction scope clause for use in raw-SQL queries that
 * alias the pets table as `p`. Returns null for admin (no restriction) and
 * a false-literal fragment when there are no assigned jurisdictions (empty result).
 *
 * NOTE: We cannot reuse petsScopeClause() from lib/metrics because it generates
 * Drizzle ORM qualified column references ("pets"."jurisdiction_province") that
 * Postgres rejects when the table appears under a different alias.
 */
function rawPetsScopeClause(ctx: ProjectionContext): ReturnType<typeof sql> | null | false {
  if (ctx.scope.kind === "global") return null;
  const { jurisdictions } = ctx.scope;
  if (jurisdictions.length === 0) return false;
  const pairs = jurisdictions.map(
    (j) =>
      sql`(p.jurisdiction_province = ${j.province} AND p.jurisdiction_locality = ${j.locality})`,
  );
  // Join pairs with OR.
  let combined = pairs[0];
  for (let i = 1; i < pairs.length; i++) {
    combined = sql`${combined} OR ${pairs[i]}`;
  }
  return combined;
}

// ---------------------------------------------------------------------------
// (a) Overdue antirrábica — pipeline
// ---------------------------------------------------------------------------

export type OverdueRabiesPet = {
  petId: string;
  petName: string;
  species: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  /** Date of the most recent antirrábica vaccination event. */
  lastVaccineAt: Date;
};

export type OverdueRabiesResult = {
  pets: OverdueRabiesPet[];
  /** True when no pets matched the criterion in the operator's jurisdiction. */
  empty: boolean;
};

/**
 * Fetch the list of active pets in scope whose most recent antirrábica
 * vaccination occurred more than RABIES_OVERDUE_DAYS days ago.
 *
 * Query strategy: CTE finds the latest vaccination_administered event per pet
 * where vaccine_name contains "antirr" (case-insensitive). Pets LEFT JOIN the
 * CTE — those with no matching vaccine row (never vaccinated) or whose latest
 * vaccine predates the cutoff are returned as overdue.
 *
 * The caller must write a pii_queried audit row via logOutreachPiiQuery.
 */
export async function fetchOverdueRabiesVaccine(
  ctx: ProjectionContext,
): Promise<OverdueRabiesResult> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { pets: [], empty: true };
  }

  const scopeClause = rawPetsScopeClause(ctx);
  if (scopeClause === false) return { pets: [], empty: true };

  // Pass dates as ISO strings — db.execute raw SQL uses postgres.js which
  // requires typed serialization; Date objects in raw tagged-template positions
  // must be pre-serialized when `prepare: false` is active.
  const cutoff = overdueVaccineCutoff().toISOString();

  const rows = await db.execute<{
    pet_id: string;
    pet_name: string;
    species: string;
    jurisdiction_province: string | null;
    jurisdiction_locality: string | null;
    last_vaccine_at: string | null;
  }>(sql`
    WITH latest_rabies AS (
      SELECT
        pe.pet_id,
        MAX(pe.occurred_at) AS last_vaccine_at
      FROM pet_events pe
      WHERE
        pe.event_type = 'vaccination_administered'
        AND lower(${amendedPayloadText("vaccine_name", { id: sql`pe.id`, payload: sql`pe.payload` })}) LIKE '%antirr%'
      GROUP BY pe.pet_id
    )
    SELECT
      p.id               AS pet_id,
      p.name             AS pet_name,
      p.species,
      p.jurisdiction_province,
      p.jurisdiction_locality,
      lr.last_vaccine_at
    FROM pets p
    LEFT JOIN latest_rabies lr ON lr.pet_id = p.id
    WHERE
      p.status = 'active'
      ${scopeClause ? sql`AND (${scopeClause})` : sql``}
      AND (
        lr.last_vaccine_at IS NULL
        OR lr.last_vaccine_at < ${cutoff}
      )
    ORDER BY lr.last_vaccine_at ASC NULLS FIRST, p.name ASC
    LIMIT 500
  `);

  const petsResult: OverdueRabiesPet[] = rows.map((r) => ({
    petId: r.pet_id,
    petName: r.pet_name,
    species: r.species,
    jurisdictionProvince: r.jurisdiction_province,
    jurisdictionLocality: r.jurisdiction_locality,
    lastVaccineAt: r.last_vaccine_at ? new Date(r.last_vaccine_at) : new Date(0),
  }));

  return { pets: petsResult, empty: petsResult.length === 0 };
}

// ---------------------------------------------------------------------------
// (b) Stray-scan density by locality — pipeline
// ---------------------------------------------------------------------------

export type StrayDensityArea = {
  /** Locality name (pets.jurisdiction_locality). */
  locality: string;
  province: string | null;
  /** Number of credential_scanned events from non-self-scans in the period. */
  scanCount: number;
};

export type StrayDensityResult = {
  areas: StrayDensityArea[];
  empty: boolean;
};

/**
 * Fetch localities with elevated stray-scan density.
 *
 * "Stray" scan proxy: credential_scanned events where
 *   payload->>'is_self_scan' = 'false'
 * grouped by the scanned pet's jurisdiction_locality.
 *
 * The period from the ProjectionContext is used as the scan window.
 * Jurisdiction scope narrows to the operator's assigned pairs.
 *
 * The caller must write a pii_queried audit row via logOutreachPiiQuery.
 */
export async function fetchStrayDensityAreas(ctx: ProjectionContext): Promise<StrayDensityResult> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { areas: [], empty: true };
  }

  const scopeClause = rawPetsScopeClause(ctx);
  if (scopeClause === false) return { areas: [], empty: true };

  const rows = await db.execute<{
    locality: string | null;
    province: string | null;
    scan_count: string;
  }>(sql`
    SELECT
      p.jurisdiction_locality AS locality,
      p.jurisdiction_province AS province,
      COUNT(*)                AS scan_count
    FROM pet_events pe
    JOIN pets p ON p.id = pe.pet_id
    WHERE
      pe.event_type = 'credential_scanned'
      AND (pe.payload->>'is_self_scan')::boolean = false
      AND pe.occurred_at >= ${ctx.period.since.toISOString()}
      AND pe.occurred_at <= ${ctx.period.until.toISOString()}
      ${scopeClause ? sql`AND (${scopeClause})` : sql``}
    GROUP BY p.jurisdiction_locality, p.jurisdiction_province
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC
    LIMIT 100
  `);

  const areas: StrayDensityArea[] = rows
    .filter((r) => r.locality !== null)
    .map((r) => ({
      locality: r.locality as string,
      province: r.province,
      scanCount: Number(r.scan_count),
    }));

  return { areas, empty: areas.length === 0 };
}

// ---------------------------------------------------------------------------
// (c) Sterilization throughput ranking by vet — pipeline
// ---------------------------------------------------------------------------

export type SterilizationVetRank = {
  /** Vet label from sterilization_performed payload.performed_by (nullable). */
  vetLabel: string;
  /** Clinic from payload.clinic (nullable). */
  clinic: string | null;
  /** Count of sterilization events attributed to this vet in scope+period. */
  count: number;
};

export type SterilizationVetRankingResult = {
  vets: SterilizationVetRank[];
  empty: boolean;
};

/**
 * Rank vets by sterilization throughput (recognition pipeline).
 *
 * Groups sterilization_performed events by payload->>'performed_by' and
 * payload->>'clinic', scoped to the operator's jurisdiction and the period.
 * Rows with no performed_by are grouped under "(sin registrar)".
 *
 * The caller must write a pii_queried audit row via logOutreachPiiQuery.
 */
export async function fetchSterilizationVetRanking(
  ctx: ProjectionContext,
): Promise<SterilizationVetRankingResult> {
  if (ctx.scope.kind === "jurisdictions" && ctx.scope.jurisdictions.length === 0) {
    return { vets: [], empty: true };
  }

  const scopeClause = rawPetsScopeClause(ctx);
  if (scopeClause === false) return { vets: [], empty: true };

  const rows = await db.execute<{
    vet_label: string | null;
    clinic: string | null;
    event_count: string;
  }>(sql`
    SELECT
      COALESCE(pe.payload->>'performed_by', '(sin registrar)') AS vet_label,
      pe.payload->>'clinic'                                     AS clinic,
      COUNT(*)                                                   AS event_count
    FROM pet_events pe
    JOIN pets p ON p.id = pe.pet_id
    WHERE
      pe.event_type = 'sterilization_performed'
      AND pe.occurred_at >= ${ctx.period.since.toISOString()}
      AND pe.occurred_at <= ${ctx.period.until.toISOString()}
      ${scopeClause ? sql`AND (${scopeClause})` : sql``}
    GROUP BY vet_label, clinic
    ORDER BY event_count DESC
    LIMIT 50
  `);

  const vets: SterilizationVetRank[] = rows.map((r) => ({
    vetLabel: r.vet_label ?? "(sin registrar)",
    clinic: r.clinic ?? null,
    count: Number(r.event_count),
  }));

  return { vets, empty: vets.length === 0 };
}
