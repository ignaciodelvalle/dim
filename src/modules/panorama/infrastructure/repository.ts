// Panorama infrastructure repository — the SINGLE @/db module of the module.
//
// Hexagonal-lite: every scope-aware SELECT for the F2 layers lives here. The
// pure GeoJSON shaping is in application/build-features.ts; the use-case
// (get-layer-features.ts) wires the two. The domain stays free of @/db.
//
// Privacy / k-anon / cap invariants enforced here (spec §8, §13):
//   - denuncias (welfare_reports) are COARSE: each report is snapped to its
//     locality CENTROID via a join to ar_localities. The exact lat/lng NEVER
//     leaves this module — it is not even SELECTed into the returned rows.
//   - the two choropleth layers (rabies-coverage, mortality) are per-locality
//     rollups passed through suppressSmallCells (k=5); suppressed cells carry a
//     `suppressed` flag and NO real value so the map renders them muted.
//   - every loader caps at PER_LAYER_CAP rows and sets `truncated` in the
//     envelope when the cap is hit (no silent caps — the LayerPanel surfaces it).
//
// Scope: every loader threads (actor, jurisdictions). admin → universal;
// govt → intersection with its assignments. The scope clauses are the SAME
// tested helpers the /gob dashboards use.

import { type SQL, and, count, countDistinct, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { arLocalities, cases, db, organizations, petEvents, pets, welfareReports } from "@/db";
import { fetchRabiesCoverageByProvince } from "@/lib/analytics/govt-home-kpis";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
  jurisdictionPairClause,
  petEventsScopeClause as metricsPetEventsScopeClause,
  petsScopeClause as metricsPetsScopeClause,
  rabiesVaccinatedExists,
  suppressSmallCells,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { findDisease } from "@/lib/reference/diseases";

import type {
  AggregatedPointCell,
  BiteRow,
  ChoroplethCell,
  DecomisoRow,
  DenunciaCentroidRow,
  OutbreakRow,
  ProvinceChoroplethCell,
  ShelterRow,
} from "@/src/modules/panorama/application/build-features";
import type { AggregationLevel } from "@/src/modules/panorama/domain/types";

// Per-layer hard cap. Each loader limits at this; when the row count equals the
// cap the result is (potentially) truncated and the envelope says so.
export const PER_LAYER_CAP = 2000;

/** Every loader returns its rows plus whether the cap clipped the result. */
export type LayerRows<Row> = {
  rows: Row[];
  /** True when the query hit PER_LAYER_CAP (more rows may exist server-side). */
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// Scope clauses — reuse the canonical lib/metrics helpers (tested).
// ---------------------------------------------------------------------------

/** pets-table scope (province/locality columns).
 * admin → null (national) OR province predicate when adminProvince is set.
 * See ProjectionContext.adminProvince for the security invariant. */
function petsScope(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): SQL | null {
  // Drizzle's `and()` has a declared return type of SQL | undefined (even with
  // non-null args). Normalize to SQL | null to match rollupPetsPerLocality/Province.
  return (
    metricsPetsScopeClause(
      buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
        adminProvince,
        adminLocality,
      }),
    ) ?? null
  );
}

/** pet_events scope (JSONB payload jurisdiction).
 * admin → null (national) OR payload province predicate when adminProvince is set. */
function petEventsScope(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
) {
  return metricsPetEventsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
      adminProvince,
      adminLocality,
    }),
  );
}

/** welfare_reports / cases / organizations share the same (province name, locality
 * name) jurisdiction columns. Build an OR of pair-matches against the given
 * province/locality columns.
 *
 * - admin, no province → null (no restriction)
 * - admin + province   → province (and optionally locality) predicate
 * - govt, no assignments → false (match nothing)
 * - govt, with assignments → OR of (province=X AND locality=Y) pairs
 *
 * SECURITY: the admin province branch fires ONLY when actor.role === "admin".
 * Govt users must NOT pass adminProvince — their scope is enforced by
 * the jurisdictions pairs (same invariant as buildMaltratoListConditions).
 */
function jurisdictionColumnsScope(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  provinceCol: SQL | ReturnType<typeof sql.raw>,
  localityCol: SQL | ReturnType<typeof sql.raw>,
  adminProvince?: string,
  adminLocality?: string,
): SQL | null {
  if (actor.role === "admin") {
    if (!adminProvince) return null;
    if (adminLocality) {
      return and(
        sql`${provinceCol} = ${adminProvince}`,
        sql`${localityCol} = ${adminLocality}`,
      ) as SQL;
    }
    return sql`${provinceCol} = ${adminProvince}`;
  }
  return (
    jurisdictionPairClause(jurisdictions, sql`${provinceCol}`, sql`${localityCol}`) ?? sql`false`
  );
}

// Normalize a name column the same way lib/ar-localidades.ts normalize() does
// (NFD-strip accents, lowercase, drop dots, collapse whitespace) so the
// jurisdiction free-text locality on the source table buckets identically to
// ar_localities.locality_name when we join for the centroid.
function normNameSql(col: SQL): SQL {
  return sql`btrim(regexp_replace(lower(translate(unaccent(${col}), '.', '')), '\\s+', ' ', 'g'))`;
}

// ---------------------------------------------------------------------------
// pet_events:bite (mordeduras) — individual bite incident_reported events.
// ---------------------------------------------------------------------------

export async function loadBiteEvents(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerRows<BiteRow>> {
  const conditions = [
    eq(petEvents.eventType, "incident_reported"),
    // bite_inflicted | bite_suffered are the two bite variants (event-schemas.ts).
    sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
    gte(petEvents.occurredAt, since),
    // Located events only — a point layer never plots a null coordinate.
    isNotNull(petEvents.locationLat),
  ];
  // F4 temporal reproduction: upper-bound the event window so the layer can be
  // reconstructed "as of t" while the TimeScrubber plays.
  if (asOf) conditions.push(lte(petEvents.occurredAt, asOf));
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      id: petEvents.id,
      locationLat: petEvents.locationLat,
      locationLng: petEvents.locationLng,
      incidentType: sql<string>`(${petEvents.payload}->>'incident_type')`,
      severity: sql<string | null>`(${petEvents.payload}->>'severity')`,
      occurredAt: petEvents.occurredAt,
    })
    .from(petEvents)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      incidentType: r.incidentType,
      severity: r.severity,
      occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
    })),
    truncated: rows.length >= PER_LAYER_CAP,
  };
}

// ---------------------------------------------------------------------------
// welfare_reports (denuncias) — COARSE: snap to the locality centroid.
//
// The exact welfare_reports.location_lat/lng is NEVER SELECTed. We resolve the
// centroid from ar_localities by matching the report's jurisdiction
// (province name → ISO code, normalized locality name). Reports whose locality
// cannot be matched to a centroid are dropped (no coordinate to coarsen to).
// ---------------------------------------------------------------------------

export async function loadDenunciaCentroids(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerRows<DenunciaCentroidRow>> {
  const conditions = [
    gte(welfareReports.createdAt, since),
    // Hide moderation-flagged-not-resolved rows (same rule as /gob/maltrato).
    sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
    isNotNull(welfareReports.jurisdictionLocality),
  ];
  // F4: upper-bound the report window for temporal reproduction.
  if (asOf) conditions.push(lte(welfareReports.createdAt, asOf));
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${welfareReports.jurisdictionProvince}`,
    sql`${welfareReports.jurisdictionLocality}`,
    adminProvince,
    adminLocality,
  );
  if (scope) conditions.push(sql`(${scope})`);

  // Resolve the locality centroid via SCALAR correlated subqueries (MIN over the
  // matching ar_localities rows) rather than a JOIN — a join fans out when an
  // INDEC (province, name) pair is ambiguous, which would over-plot a report.
  // The subquery yields exactly ONE centroid per report (deterministic via MIN).
  // The exact welfare_reports.location_lat/lng is NEVER selected.
  const centroidLat = sql<string | null>`(
    SELECT MIN(al.latitude) FROM ar_localities al
    WHERE al.province_code = ${provinceIsoMapSql(sql`${welfareReports.jurisdictionProvince}`)}
      AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(sql`${welfareReports.jurisdictionLocality}`)}
      AND al.removed_at IS NULL
  )`;
  const centroidLng = sql<string | null>`(
    SELECT MIN(al.longitude) FROM ar_localities al
    WHERE al.province_code = ${provinceIsoMapSql(sql`${welfareReports.jurisdictionProvince}`)}
      AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(sql`${welfareReports.jurisdictionLocality}`)}
      AND al.removed_at IS NULL
  )`;

  const rows = await db
    .select({
      reportLat: centroidLat,
      reportLng: centroidLng,
      province: welfareReports.jurisdictionProvince,
      locality: welfareReports.jurisdictionLocality,
      severity: welfareReports.severity,
      kind: welfareReports.kind,
      createdAt: welfareReports.createdAt,
    })
    .from(welfareReports)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    // Drop reports whose locality could not be matched to a centroid (the pure
    // build-features transform also drops null-geometry, but filter early so the
    // count reflects plottable reports).
    rows: rows
      .filter((r) => r.reportLat !== null && r.reportLng !== null)
      .map((r) => ({
        // Snapped centroid only — never the exact report coordinate.
        centroidLat: r.reportLat,
        centroidLng: r.reportLng,
        province: r.province,
        locality: r.locality,
        severity: r.severity,
        kind: r.kind,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      })),
    truncated: rows.length >= PER_LAYER_CAP,
  };
}

// ---------------------------------------------------------------------------
// outbreak_signals (zoonosis) — outbreak_signal pet_events with coords.
// ---------------------------------------------------------------------------

export async function loadOutbreakSignals(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerRows<OutbreakRow>> {
  const conditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, since),
    isNotNull(petEvents.locationLat),
  ];
  // F4: upper-bound the outbreak-signal window for temporal reproduction.
  if (asOf) conditions.push(lte(petEvents.occurredAt, asOf));
  // outbreak_signal stores its own jurisdiction keys; reuse the payload scope.
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      id: petEvents.id,
      locationLat: petEvents.locationLat,
      locationLng: petEvents.locationLng,
      diseaseCode: sql<string | null>`(${petEvents.payload}->>'disease_code')`,
      diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
      occurredAt: petEvents.occurredAt,
    })
    .from(petEvents)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      diseaseCode: r.diseaseCode,
      diseaseLabel: r.diseaseLabel ?? findDisease(r.diseaseCode)?.label ?? null,
      occurredAt: r.occurredAt ? r.occurredAt.toISOString() : null,
    })),
    truncated: rows.length >= PER_LAYER_CAP,
  };
}

// ---------------------------------------------------------------------------
// organizations:shelter (refugios) — shelter orgs with coords.
// ---------------------------------------------------------------------------

export async function loadShelters(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerRows<ShelterRow>> {
  const conditions = [
    eq(organizations.orgType, "shelter"),
    eq(organizations.status, "active"),
    isNotNull(organizations.locationLat),
  ];
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${organizations.jurisdictionProvince}`,
    sql`${organizations.jurisdictionLocality}`,
    adminProvince,
    adminLocality,
  );
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      id: organizations.id,
      publicToken: organizations.publicToken,
      displayName: organizations.displayName,
      locationLat: organizations.locationLat,
      locationLng: organizations.locationLng,
      verified: organizations.verified,
    })
    .from(organizations)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      publicToken: r.publicToken,
      displayName: r.displayName,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      verified: r.verified,
    })),
    truncated: rows.length >= PER_LAYER_CAP,
  };
}

// ---------------------------------------------------------------------------
// cases:decomiso (decomisos) — custody_episode cases at their locality centroid.
//
// The decomiso (Ley 14.346 seizure) case_kind is 'custody_episode' (see
// app/gob/decomisos). A registered-pet case stores NO point
// (cases_subject_location_consistency biconditional), so each case plots at the
// centroid of its jurisdiction locality — coarse, resolved like loadDenunciaCentroids.
// ---------------------------------------------------------------------------

export async function loadDecomisos(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerRows<DecomisoRow>> {
  const conditions = [
    eq(cases.caseKind, "custody_episode"),
    gte(cases.openedAt, since),
    isNotNull(cases.jurisdictionLocality),
  ];
  // F4: upper-bound the decomiso (custody_episode) window for temporal reproduction.
  if (asOf) conditions.push(lte(cases.openedAt, asOf));
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${cases.jurisdictionProvince}`,
    sql`${cases.jurisdictionLocality}`,
    adminProvince,
    adminLocality,
  );
  if (scope) conditions.push(sql`(${scope})`);

  // One centroid per case (scalar MIN subqueries), same pattern as denuncias.
  const centroidLat = sql<string | null>`(
    SELECT MIN(al.latitude) FROM ar_localities al
    WHERE al.province_code = ${provinceIsoMapSql(sql`${cases.jurisdictionProvince}`)}
      AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(sql`${cases.jurisdictionLocality}`)}
      AND al.removed_at IS NULL
  )`;
  const centroidLng = sql<string | null>`(
    SELECT MIN(al.longitude) FROM ar_localities al
    WHERE al.province_code = ${provinceIsoMapSql(sql`${cases.jurisdictionProvince}`)}
      AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(sql`${cases.jurisdictionLocality}`)}
      AND al.removed_at IS NULL
  )`;

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      status: cases.status,
      centroidLat,
      centroidLng,
      openedAt: cases.openedAt,
    })
    .from(cases)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    rows: rows
      .filter((r) => r.centroidLat !== null && r.centroidLng !== null)
      .map((r) => ({
        id: r.id,
        publicCode: r.publicCode,
        status: r.status,
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        openedAt: r.openedAt ? r.openedAt.toISOString() : null,
      })),
    truncated: rows.length >= PER_LAYER_CAP,
  };
}

// ---------------------------------------------------------------------------
// Choropleth: per-locality rollups → locality-CENTROID graduated symbols.
//
// We have NO locality polygons, so a "choropleth" renders as graduated/colored
// centroid circles. Each rollup is grouped by (province, locality), joined to
// the ar_localities centroid, then routed through suppressSmallCells (k=5).
// Suppressed cells are emitted WITH a flag and WITHOUT the real value so the map
// can render them muted. Visible cells carry the real value.
// ---------------------------------------------------------------------------

/** Internal raw rollup row before suppression. */
type RollupRow = {
  key: string;
  province: string;
  locality: string;
  centroidLat: string | null;
  centroidLng: string | null;
  count: number;
};

/** Map a canonical province NAME column to its ISO code via a CASE expression.
 * ar_localities stores the ISO code; welfare/cases/pets store the display name. */
function provinceIsoMapSql(provinceCol: SQL): SQL {
  const pairs = Object.entries(PROVINCE_ISO).map(
    ([name, code]) => sql`WHEN ${provinceCol} = ${name} THEN ${code}`,
  );
  return sql`(CASE ${sql.join(pairs, sql` `)} ELSE '' END)`;
}

// Canonical province display name → ISO 3166-2:AR code (mirrors the map in
// lib/govt-dashboards.ts; duplicated locally to keep this module self-contained
// and free of a govt-dashboards import cycle).
const PROVINCE_ISO: Record<string, string> = {
  "Buenos Aires": "AR-B",
  CABA: "AR-C",
  Catamarca: "AR-K",
  Chaco: "AR-H",
  Chubut: "AR-U",
  Córdoba: "AR-X",
  Corrientes: "AR-W",
  "Entre Ríos": "AR-E",
  Formosa: "AR-P",
  Jujuy: "AR-Y",
  "La Pampa": "AR-L",
  "La Rioja": "AR-F",
  Mendoza: "AR-M",
  Misiones: "AR-N",
  Neuquén: "AR-Q",
  "Río Negro": "AR-R",
  Salta: "AR-A",
  "San Juan": "AR-J",
  "San Luis": "AR-D",
  "Santa Cruz": "AR-Z",
  "Santa Fe": "AR-S",
  "Santiago del Estero": "AR-G",
  "Tierra del Fuego": "AR-V",
  Tucumán: "AR-T",
};

/** Shared rollup → suppressed ChoroplethCell[] transform. The numerator counts
 * are passed through suppressSmallCells(k=5): cells with count < 5 are emitted
 * suppressed (no value), the rest carry the real value. */
function toChoroplethCells(rollup: RollupRow[]): {
  cells: ChoroplethCell[];
  suppressedCount: number;
} {
  const { visible, suppressed, suppressedCount } = suppressSmallCells(rollup, {
    count: (r) => r.count,
    key: (r) => r.key,
    k: 5,
  });

  const cells: ChoroplethCell[] = [];
  // Visible cells carry the real value. `visible` is branded SuppressedCells
  // (readonly Cell[]); we know the underlying rows are RollupRow (same objects
  // suppressSmallCells partitioned), so we re-narrow via unknown.
  for (const r of visible as unknown as readonly RollupRow[]) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      value: r.count,
      suppressed: false,
    });
  }
  // Suppressed cells: keep the location so the muted dot still renders, but the
  // value is null — the real count never leaves the repository for these.
  for (const r of suppressed) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      value: null,
      suppressed: true,
    });
  }
  return { cells, suppressedCount };
}

/** Result envelope for a LOCALITY choropleth loader (centroid graduated symbols). */
export type ChoroplethRows = {
  cells: ChoroplethCell[];
  suppressedCount: number;
  /**
   * Pets matching the metric that have a province but NO locality — counted
   * at province level, invisible at locality level (the rollup filters
   * jurisdiction_locality IS NOT NULL because it can only paint geocodable
   * cells). Surfaced so the UI can disclose the residual instead of letting
   * the two aggregation levels silently disagree (task #44; found when the
   * 2026-07-04 reconciliation pushed deceased counts past the visible layer).
   */
  noLocalityCount: number;
  truncated: boolean;
};

/** Result envelope for a PROVINCE choropleth loader (filled polygons; U5). No
 * k-anon (province cells are large), so there is no suppressedCount. */
export type ProvinceChoroplethRows = {
  cells: ProvinceChoroplethCell[];
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// U5 — ONE rollup, parametrized by aggregation LEVEL (province | locality).
//
// Both levels share the SAME metric predicate (the `whereExtra` SQL) and the
// SAME scope clause, differing ONLY in the GROUP BY and (for locality) the
// ar_localities centroid join. This is what GUARANTEES the consistency
// invariant the spec asserts: a province total is exactly the sum of its
// localities, because both count the identical set of pets — just grouped
// coarser. Both count COUNT(DISTINCT pets.id) so the locality centroid
// leftJoin fan-out can never make the two disagree.
// ---------------------------------------------------------------------------

/** The supported choropleth metrics.
 *  RATE metrics (rabies-coverage, sterilization-coverage): value = ratePct (0-100).
 *  DENSITY metrics (mortality): value = raw count.
 *  The distinction matters for the divergent choropleth scale: rate layers anchor
 *  at complianceTarget (a percentage), so value MUST be a percentage too. */
export type ChoroplethMetric = "rabies-coverage" | "sterilization-coverage" | "mortality";

/** Build the metric-specific pets predicate for LOCALITY-level loaders.
 * Defined ONCE so province and locality rollups can NEVER drift apart on the
 * numerator definition (U5).
 * For RATE metrics at LOCALITY level (count-density, v1 limitation) this is the
 * numerator predicate. For DENSITY metrics (mortality) this IS the full predicate.
 * Province-level RATE metrics delegate to the canonical fetchers instead of using
 * this predicate — see loadRabiesCoverageByProvince and
 * loadSterilizationCoverageByProvince. */
function metricPredicate(metric: ChoroplethMetric): SQL {
  if (metric === "rabies-coverage") {
    // DOGS in scope with at least one qualifying rabies vaccination in the
    // trailing-12-month window. Uses the SHARED rabiesVaccinatedExists predicate
    // (lib/metrics/rabies.ts) so the locality numerator is the SAME definition as
    // the national KPI, the province breakdown, and the /admin panel (C3).
    // Before C3 this was `ILIKE '%rabi%'` (accent-SENSITIVE → silently missed the
    // canonical form "Antirrábica"), over ALL species and ALL time — three ways
    // adrift from the canonical rabies_coverage_dogs_12m numerator.
    const win = windows.trailing12m();
    return sql`(${pets.species} = 'dog' AND ${rabiesVaccinatedExists(sql`${pets.id}`, win)})`;
  }
  if (metric === "sterilization-coverage") {
    // Pets in scope with at least one sterilization_performed event.
    // Mirrors fetchSterilizationCoverage in lib/metrics/population-control.ts EXACTLY
    // (same EXISTS pattern, same event_type) to guarantee parity between the
    // Panorama choropleth and the /gob/poblacion dashboard number.
    // sterilization_performed is a real event type (confirmed in db/schema.ts +
    // app/actions/pregnancy.ts in the Paquete G implementation).
    return sql`EXISTS (
      SELECT 1 FROM ${petEvents} pe_steril
      WHERE pe_steril.pet_id = ${pets.id}
        AND pe_steril.event_type = 'sterilization_performed'
    )`;
  }
  // mortality — pets currently in status='deceased'.
  return sql`${pets.status} = 'deceased'`;
}

/** Count metric-matching pets that are invisible to the locality rollup:
 * province set, locality NULL. Same predicate + scope as the rollup so the
 * two numbers reconcile exactly (see choropleth-by-level.test.ts). */
async function countPetsNoLocality(whereExtra: SQL[], scopeClause: SQL | null): Promise<number> {
  const conditions = [
    ...whereExtra,
    isNotNull(pets.jurisdictionProvince),
    sql`${pets.jurisdictionLocality} IS NULL`,
  ];
  if (scopeClause) conditions.push(sql`(${scopeClause})`);
  const [row] = await db
    .select({ n: countDistinct(pets.id) })
    .from(pets)
    .where(and(...conditions));
  return row?.n ?? 0;
}

// Build the per-locality rollup join. `whereExtra` adds the metric-specific
// predicate (e.g. rabies vaccination). `scopeClause` is the pets-scope clause.
async function rollupPetsPerLocality(
  whereExtra: SQL[],
  scopeClause: SQL | null,
): Promise<RollupRow[]> {
  const provinceCol = sql`${pets.jurisdictionProvince}`;
  const localityCol = sql`${pets.jurisdictionLocality}`;
  const conditions = [...whereExtra, isNotNull(pets.jurisdictionLocality)];
  if (scopeClause) conditions.push(sql`(${scopeClause})`);

  const rows = await db
    .select({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // COUNT(DISTINCT pets.id), not COUNT(*): the leftJoin to ar_localities can
      // fan out when an INDEC (province, name) pair is ambiguous, so counting
      // rows would double-count a pet. We count distinct pets.
      n: countDistinct(pets.id),
    })
    .from(pets)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(provinceCol)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(localityCol)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality)
    .limit(PER_LAYER_CAP);

  return rows
    .filter((r) => r.province !== null && r.locality !== null)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province as string,
      locality: r.locality as string,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.n,
    }));
}

/** A raw per-province rollup row before mapping to a ProvinceChoroplethCell. */
type ProvinceRollupRow = {
  province: string;
  count: number;
};

// Build the per-PROVINCE rollup. NO ar_localities join (provinces need no
// centroid — the basemap polygon is the geometry), NO locality requirement, and
// NO k-anon. Same metric predicate + scope as the locality rollup, grouped by
// province only — so the province total equals the sum of its localities.
async function rollupPetsPerProvince(
  whereExtra: SQL[],
  scopeClause: SQL | null,
): Promise<ProvinceRollupRow[]> {
  const conditions = [...whereExtra, isNotNull(pets.jurisdictionProvince)];
  if (scopeClause) conditions.push(sql`(${scopeClause})`);

  const rows = await db
    .select({
      province: pets.jurisdictionProvince,
      // COUNT(DISTINCT pets.id) to mirror the locality rollup exactly (no join
      // here, but keeping DISTINCT makes the two provably identical in count).
      n: countDistinct(pets.id),
    })
    .from(pets)
    .where(and(...conditions))
    .groupBy(pets.jurisdictionProvince)
    .limit(PER_LAYER_CAP);

  return rows
    .filter((r) => r.province !== null)
    .map((r) => ({ province: r.province as string, count: r.n }));
}

/** Map a raw province density rollup to ProvinceChoroplethCell[] (resolve ISO
 * code + label). Provinces whose name has no ISO code are dropped — the basemap
 * can only fill a polygon it can join by code. */
function toProvinceChoroplethCells(rollup: ProvinceRollupRow[]): ProvinceChoroplethCell[] {
  const cells: ProvinceChoroplethCell[] = [];
  for (const r of rollup) {
    const code = PROVINCE_ISO[r.province];
    if (!code) continue;
    cells.push({ provinceCode: code, label: r.province, value: r.count });
  }
  return cells;
}

// metrics:rabies-coverage (cobertura) — count of pets in scope with a valid
// rabies vaccination, at the LOCALITY level (centroid graduated symbols, k-anon).
// V1 LIMITATION: locality level uses count-density (not ratePct) because rate-by-
// locality needs k-anonymised num/den (both arms exposed → privacy leakage risk when
// suppressed). The divergent-vs-meta rendering is PROVINCE-ONLY (province choropleth
// renders ratePct; locality renders count). This is a known v1 limitation; a future
// version should provide k-anon'd num+den at locality level for rate rendering.
export async function loadRabiesCoverage(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([metricPredicate("rabies-coverage")], scope),
    countPetsNoLocality([metricPredicate("rabies-coverage")], scope),
  ]);
  const { cells, suppressedCount } = toChoroplethCells(rollup);
  return { cells, suppressedCount, noLocalityCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// metrics:sterilization-coverage (esterilizacion) — count of sterilized pets at the
// LOCALITY level (centroid graduated symbols, k-anon).
// V1 LIMITATION: locality level uses count-density (not ratePct) — same reason as
// loadRabiesCoverage above. The divergent-vs-meta rendering is PROVINCE-ONLY in v1;
// rate-by-locality (k-anon'd num/den) is deferred. See loadSterilizationCoverageByProvince
// for the correct rate rendering at province level.
export async function loadSterilizationCoverage(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([metricPredicate("sterilization-coverage")], scope),
    countPetsNoLocality([metricPredicate("sterilization-coverage")], scope),
  ]);
  const { cells, suppressedCount } = toChoroplethCells(rollup);
  return { cells, suppressedCount, noLocalityCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// metrics:mortality (mortalidad) — count of pets in scope currently in
// status='deceased', at the LOCALITY level (centroid graduated symbols, k-anon).
export async function loadMortality(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([metricPredicate("mortality")], scope),
    countPetsNoLocality([metricPredicate("mortality")], scope),
  ]);
  const { cells, suppressedCount } = toChoroplethCells(rollup);
  return { cells, suppressedCount, noLocalityCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// U5: PROVINCE-level loaders. Used when the aggregation toggle is on "Provincia".
//
// RATE METRICS (rabies-coverage, sterilization-coverage): delegate to the canonical
// dashboard fetchers so the choropleth uses THE SAME denominator as the KPI tiles:
//   - sterilization: fetchSterilizationCoverage.byProvince → denominator = active pets
//     (activePetsCondition from lib/metrics/population). Numerator = active pets with
//     EXISTS sterilization_performed.
//   - rabies: fetchRabiesCoverageByProvince → denominator = DOGS only (species='dog').
//     Numerator = distinct dogs with a qualifying rabies vaccination event.
//
// The generic all-pets rollup (rollupRatePerProvince, previously used here) was
// rejected: it used COUNT(*) = ALL pets as the denominator, diverging from the
// canonical metrics (off by deceased pets for sterilization; off by all non-dog
// species for rabies). Parity is now guaranteed by reuse, not by local approximation.
//
// DENSITY metrics (mortality): keep raw count rollup (density, not a rate).

// metrics:rabies-coverage (cobertura) — per-province rabies rate via the canonical
// dogs-based fetcher. Delegates to fetchRabiesCoverageByProvince (lib/govt-home-kpis).
// value = ratePct (dogs-based %, matching the national KPI definition).
export async function loadRabiesCoverageByProvince(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows> {
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
  });
  const byProvince = await fetchRabiesCoverageByProvince(ctx);
  const cells: ProvinceChoroplethCell[] = [];
  for (const r of byProvince) {
    const code = PROVINCE_ISO[r.province];
    if (!code) continue;
    cells.push({ provinceCode: code, label: r.province, value: r.ratePct });
  }
  return { cells, truncated: byProvince.length >= PER_LAYER_CAP };
}

// metrics:sterilization-coverage (esterilizacion) — per-province sterilization rate
// via the canonical active-pets-based fetcher. Delegates to fetchSterilizationCoverage
// (lib/metrics/population-control). value = ratePct (active-pets denominator, matching
// /gob/poblacion). Parity guaranteed by reuse.
// V1 NOTE: locality-level sterilization coverage uses count-density (see
// loadSterilizationCoverage below) — rate-by-locality needs k-anonymised num/den
// which is deferred to v2.
export async function loadSterilizationCoverageByProvince(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows> {
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
  });
  const { byProvince } = await fetchSterilizationCoverage(ctx);
  const cells: ProvinceChoroplethCell[] = [];
  for (const r of byProvince) {
    const code = PROVINCE_ISO[r.province];
    if (!code) continue;
    cells.push({ provinceCode: code, label: r.province, value: r.ratePct });
  }
  return { cells, truncated: byProvince.length >= PER_LAYER_CAP };
}

export async function loadMortalityByProvince(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const rollup = await rollupPetsPerProvince([metricPredicate("mortality")], scope);
  return { cells: toProvinceChoroplethCells(rollup), truncated: rollup.length >= PER_LAYER_CAP };
}

/**
 * U5 single entry point: rollup a choropleth metric at the requested LEVEL.
 * Reused by the Panorama use-case AND available to the dashboard distribution
 * widgets so both share ONE source of numbers (spec §U5.4). Province returns
 * filled-polygon cells (no k-anon); locality returns centroid cells (k-anon).
 *
 * RATE vs DENSITY routing:
 *  - RATE metrics (rabies-coverage, sterilization-coverage): province level emits
 *    ratePct values (0-100) by delegating to the canonical dashboard fetchers
 *    (fetchRabiesCoverageByProvince / fetchSterilizationCoverage.byProvince).
 *    This guarantees parity with the KPI tiles — dogs-based denominator for
 *    rabies, active-pets denominator for sterilization.
 *    Locality level emits count-density (v1 limitation — rate-by-locality deferred).
 *  - DENSITY metrics (mortality): both levels emit raw count.
 */
export function loadChoroplethByLevel(
  metric: ChoroplethMetric,
  level: "province",
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows>;
export function loadChoroplethByLevel(
  metric: ChoroplethMetric,
  level: "locality",
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows>;
export function loadChoroplethByLevel(
  metric: ChoroplethMetric,
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows | ProvinceChoroplethRows> {
  if (level === "province") {
    if (metric === "rabies-coverage")
      return loadRabiesCoverageByProvince(actor, jurisdictions, adminProvince, adminLocality);
    if (metric === "sterilization-coverage")
      return loadSterilizationCoverageByProvince(
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      );
    return loadMortalityByProvince(actor, jurisdictions, adminProvince, adminLocality);
  }
  // Locality level.
  if (metric === "rabies-coverage")
    return loadRabiesCoverage(actor, jurisdictions, adminProvince, adminLocality);
  if (metric === "sterilization-coverage")
    return loadSterilizationCoverage(actor, jurisdictions, adminProvince, adminLocality);
  return loadMortality(actor, jurisdictions, adminProvince, adminLocality);
}

// ---------------------------------------------------------------------------
// F1 Panorama v2 — per-unit aggregation loaders for DENSITY + SIGNAL layers.
//
// For each density/signal point layer, instead of fetching one row per event
// (which then gets cluster-merged client-side via MapLibre), these loaders
// COUNT(*) GROUP BY (province) or (province, locality) server-side, joining
// ar_localities for the centroid, and apply suppressSmallCells (k=5) at the
// locality level (same privacy invariant as the choropleth loaders).
//
// Result shape: AggregatedPointCell[] — consumed by buildAggregatedPointFeatures.
// Province level: no k-anon (matching choropleth asymmetry); no centroid join
// (the province centroid is approximated from ar_localities as a MIN across
// localities within that province to avoid embedding a separate centroids table).
// Locality level: left-join ar_localities for centroid; k-anon k=5.
//
// These loaders are NOT unit-testable without a DB (they depend on @/db). The
// pure build-features transform (buildAggregatedPointFeatures) is fully unit-
// tested in build-features-aggregated.test.ts.
// ---------------------------------------------------------------------------

/** Result envelope for a per-unit aggregated point layer loader (F1). */
export type AggregatedPointRows = {
  cells: AggregatedPointCell[];
  suppressedCount: number;
  truncated: boolean;
};

/**
 * Convert a raw event-count rollup to AggregatedPointCell[] applying k-anon
 * suppression at k=5 (locality level only — `applyKAnon` controls this).
 */
function toAggregatedCells(
  rollup: RollupRow[],
  applyKAnon: boolean,
): { cells: AggregatedPointCell[]; suppressedCount: number } {
  if (!applyKAnon) {
    // Province level — no suppression, carry the real count.
    return {
      cells: rollup.map((r) => ({
        key: r.key,
        province: r.province,
        locality: r.locality !== "" ? r.locality : null,
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.count,
        suppressed: false,
      })),
      suppressedCount: 0,
    };
  }
  // Locality level — route through suppressSmallCells (k=5).
  const { visible, suppressed, suppressedCount } = suppressSmallCells(rollup, {
    count: (r) => r.count,
    key: (r) => r.key,
    k: 5,
  });
  const cells: AggregatedPointCell[] = [];
  for (const r of visible as unknown as readonly RollupRow[]) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality !== "" ? r.locality : null,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.count,
      suppressed: false,
    });
  }
  for (const r of suppressed) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality !== "" ? r.locality : null,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: null,
      suppressed: true,
    });
  }
  return { cells, suppressedCount };
}

// ---------------------------------------------------------------------------
// pet_events:lost (perdidas) — per-unit aggregation.
//
// Counts lost/sighting events (pet_events where kind in
// 'pet_lost'/'pet_found_sighting') grouped by (province) or (province, locality).
// Applies the SAME scope + period clauses as loadBiteEvents (petEventsScope).
// ---------------------------------------------------------------------------

export async function loadPerdidasByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<AggregatedPointRows> {
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  const conditions: SQL[] = [
    // lost/sighting pet events (F1 — matches the per-event perdidas loader logic).
    sql`(${petEvents.payload}->>'kind') IN ('pet_lost', 'pet_found_sighting')`,
    gte(petEvents.occurredAt, since),
    isNotNull(sql`(${petEvents.payload}->>'province')`),
  ];
  if (asOf) conditions.push(lte(petEvents.occurredAt, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: sql<string>`(${petEvents.payload}->>'province')`,
        centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(sql`(${petEvents.payload}->>'province')`)
      .limit(PER_LAYER_CAP);
    const rollup: RollupRow[] = rows
      .filter((r) => r.province)
      .map((r) => ({
        key: r.province,
        province: r.province,
        locality: "",
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.n,
      }));
    const { cells, suppressedCount } = toAggregatedCells(rollup, false);
    return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
  }

  // Locality level: group by (province, locality), left-join ar_localities for centroid.
  const rows = await db
    .select({
      province: sql<string>`(${petEvents.payload}->>'province')`,
      locality: sql<string>`(${petEvents.payload}->>'locality')`,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`(${petEvents.payload}->>'locality')`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(sql`(${petEvents.payload}->>'locality')`)))
    .groupBy(sql`(${petEvents.payload}->>'province')`, sql`(${petEvents.payload}->>'locality')`)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.n,
    }));
  const { cells, suppressedCount } = toAggregatedCells(rollup, true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// pet_events:bite (mordeduras) — per-unit aggregation.
//
// Counts bite incident events grouped by (province) or (province, locality).
// Mirrors loadBiteEvents in predicate; the aggregation groups rather than fetches
// individual events.
// ---------------------------------------------------------------------------

export async function loadMordedurassByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<AggregatedPointRows> {
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  const conditions: SQL[] = [
    eq(petEvents.eventType, "incident_reported"),
    sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
    gte(petEvents.occurredAt, since),
    isNotNull(sql`(${petEvents.payload}->>'province')`),
  ];
  if (asOf) conditions.push(lte(petEvents.occurredAt, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: sql<string>`(${petEvents.payload}->>'province')`,
        centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(sql`(${petEvents.payload}->>'province')`)
      .limit(PER_LAYER_CAP);
    const rollup: RollupRow[] = rows
      .filter((r) => r.province)
      .map((r) => ({
        key: r.province,
        province: r.province,
        locality: "",
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.n,
      }));
    const { cells, suppressedCount } = toAggregatedCells(rollup, false);
    return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
  }

  const rows = await db
    .select({
      province: sql<string>`(${petEvents.payload}->>'province')`,
      locality: sql<string>`(${petEvents.payload}->>'locality')`,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`(${petEvents.payload}->>'locality')`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(sql`(${petEvents.payload}->>'locality')`)))
    .groupBy(sql`(${petEvents.payload}->>'province')`, sql`(${petEvents.payload}->>'locality')`)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.n,
    }));
  const { cells, suppressedCount } = toAggregatedCells(rollup, true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// welfare_reports (denuncias) — per-unit aggregation (COARSE).
//
// Counts welfare reports grouped by (province) or (province, locality), joining
// ar_localities for the unit centroid. The exact report coordinate is NEVER used
// here — the entire loader uses jurisdiction columns (not lat/lng) for grouping.
// Mirrors loadDenunciaCentroids in scope + moderation filter.
// ---------------------------------------------------------------------------

export async function loadDenunciasByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<AggregatedPointRows> {
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${welfareReports.jurisdictionProvince}`,
    sql`${welfareReports.jurisdictionLocality}`,
    adminProvince,
    adminLocality,
  );
  const conditions: SQL[] = [
    gte(welfareReports.createdAt, since),
    // Same moderation filter as loadDenunciaCentroids.
    sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
    isNotNull(welfareReports.jurisdictionProvince),
  ];
  if (asOf) conditions.push(lte(welfareReports.createdAt, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: welfareReports.jurisdictionProvince,
        centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
        // countDistinct: the arLocalities LEFT JOIN fans out (one report ×
        // matching localities), so a plain count() multiplies by the join.
        n: countDistinct(welfareReports.id),
      })
      .from(welfareReports)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${welfareReports.jurisdictionProvince}`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(welfareReports.jurisdictionProvince)
      .limit(PER_LAYER_CAP);
    const rollup: RollupRow[] = rows
      .filter((r) => r.province)
      .map((r) => ({
        key: r.province as string,
        province: r.province as string,
        locality: "",
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.n,
      }));
    const { cells, suppressedCount } = toAggregatedCells(rollup, false);
    return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
  }

  const rows = await db
    .select({
      province: welfareReports.jurisdictionProvince,
      locality: welfareReports.jurisdictionLocality,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // countDistinct: homonymous localities (same normalized name within a
      // province) make the arLocalities join fan out, so count() over-counts.
      n: countDistinct(welfareReports.id),
    })
    .from(welfareReports)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${welfareReports.jurisdictionProvince}`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`${welfareReports.jurisdictionLocality}`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(welfareReports.jurisdictionLocality)))
    .groupBy(welfareReports.jurisdictionProvince, welfareReports.jurisdictionLocality)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province as string}|${r.locality as string}`,
      province: r.province as string,
      locality: r.locality as string,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.n,
    }));
  const { cells, suppressedCount } = toAggregatedCells(rollup, true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// outbreak_signals (zoonosis) — per-unit aggregation (SIGNAL).
//
// Counts outbreak_signal pet_events grouped by (province) or (province, locality),
// joining ar_localities for the unit centroid. Mirrors loadOutbreakSignals in
// scope + period clauses.
// ---------------------------------------------------------------------------

export async function loadZoonosisByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<AggregatedPointRows> {
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  const conditions: SQL[] = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, since),
    isNotNull(sql`(${petEvents.payload}->>'province')`),
  ];
  if (asOf) conditions.push(lte(petEvents.occurredAt, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: sql<string>`(${petEvents.payload}->>'province')`,
        centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(sql`(${petEvents.payload}->>'province')`)
      .limit(PER_LAYER_CAP);
    const rollup: RollupRow[] = rows
      .filter((r) => r.province)
      .map((r) => ({
        key: r.province,
        province: r.province,
        locality: "",
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.n,
      }));
    const { cells, suppressedCount } = toAggregatedCells(rollup, false);
    return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
  }

  const rows = await db
    .select({
      province: sql<string>`(${petEvents.payload}->>'province')`,
      locality: sql<string>`(${petEvents.payload}->>'locality')`,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'province')`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`(${petEvents.payload}->>'locality')`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(sql`(${petEvents.payload}->>'locality')`)))
    .groupBy(sql`(${petEvents.payload}->>'province')`, sql`(${petEvents.payload}->>'locality')`)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      count: r.n,
    }));
  const { cells, suppressedCount } = toAggregatedCells(rollup, true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// F4 Unit history — per-(province[, locality]) catalogued event list + trend.
//
// Returns the most recent events for a SINGLE administrative unit, the daily
// trend over the window (for the sparkline), and a count breakdown by sub-type.
//
// Privacy invariants (same as the per-unit loaders above):
//   - denuncias: no exact coordinates; only jurisdiction name + kind/severity.
//   - scope enforced: govt ALWAYS intersects with its govt_assignments via the
//     same scope-clause helpers; admin gets universal access.
//   - No PII (exact welfare report ids, precise coordinates) is returned.
//
// NOTE: This function is DB-backed via @/db (Drizzle). It cannot be unit-tested
// in this Windows/Docker environment. Type-check only via tsc --noEmit.
// ---------------------------------------------------------------------------

/** A single catalogued event entry in the unit-history list. */
export type UnitHistoryEvent = {
  /** ISO 8601 timestamp string. */
  date: string;
  /** Sub-type label key (e.g. "bite_inflicted", "neglect", "custody_episode"). */
  type: string;
  /** Short human-readable description (e.g. the case public code or event type). */
  label: string;
};

/** One bucket in the trend series (for the sparkline). */
export type TrendBucket = {
  /** ISO date string for the bucket start (YYYY-MM-DD). */
  date: string;
  count: number;
};

/** The full result of a unit-history query. */
export type UnitHistoryResult = {
  /**
   * True when the locality's total event count is below the k-anon threshold
   * (k=5). The client must not render counts or event lists when this is true.
   * Always false at province level (no suppression for coarse cells).
   */
  suppressed?: boolean;
  /** Most recent events for this unit (newest first), up to 20 entries. */
  events: UnitHistoryEvent[];
  /** Daily buckets over the requested window (for the sparkline). */
  trend: TrendBucket[];
  /** Count breakdown by event sub-type. */
  byType: Record<string, number>;
};

/** Parameters for the unit-history loader. */
export type LoadUnitHistoryParams = {
  /** The active Panorama layer id — drives which event source is queried. */
  layer: string;
  /** Province name (display name, e.g. "Buenos Aires"). Always required. */
  province: string;
  /** Locality name (display name). Optional — when absent, scope is province-wide. */
  locality?: string | null;
  /** Window start (inclusive). */
  since: Date;
  /** Window end (inclusive). */
  until: Date;
  /** Auth actor (admin → universal; govt → intersect with jurisdictions). */
  actor: DashboardActor;
  /** The viewer's assigned jurisdictions (empty for admin). */
  jurisdictions: DashboardJurisdiction[];
};

/**
 * Load catalogued history for a single administrative unit (province or
 * province+locality) for the requested layer + period.
 *
 * Returns:
 *  - `events`: most recent 20 events, newest first.
 *  - `trend`: daily counts over [since, until] for the sparkline.
 *  - `byType`: event sub-type breakdown as { typeKey: count }.
 *
 * Scope is ALWAYS enforced via the same helpers as the per-unit loaders:
 *  - govt actors: must match an assigned jurisdiction (province+locality pair);
 *    an out-of-scope request returns empty results (never an error — the caller
 *    validates scope before reaching here via the API route).
 *  - admin actors: universal (no restriction).
 *
 * DB-backed; not unit-testable without a live Postgres connection.
 */
export async function loadUnitHistory(params: LoadUnitHistoryParams): Promise<UnitHistoryResult> {
  const { layer, province, locality, since, until, actor, jurisdictions } = params;

  // --- verify scope for govt actors -----------------------------------------
  // A govt actor must have at least one assignment that covers the requested
  // unit. If the jurisdiction check fails we return empty (silently) — the
  // API route's scope guard is the authoritative gate; this is a second fence.
  if (actor.role === "govt") {
    const inScope = jurisdictions.some((j) => {
      if (j.province !== province) return false;
      if (locality) return j.locality === locality;
      return true; // province-wide request: any assignment in the province
    });
    if (!inScope) {
      return { events: [], trend: [], byType: {} };
    }
  }

  const EVENT_LIMIT = 20;
  // k-anon threshold (mirrors suppressSmallCells k=5 used by the per-unit loaders).
  const K_ANON = 5;

  // ---------------------------------------------------------------------------
  // W1 — k-anon guard for locality-level history.
  //
  // When the caller is drilling into a LOCALITY (locality is set), we count the
  // total events for this unit over [since, until] before returning any detail.
  // If the count is < K_ANON we return a suppressed result — the same cell that
  // was suppressed on the map must not be re-identified via the history panel.
  // Province-level requests are exempt (no suppression, matching the loaders).
  // ---------------------------------------------------------------------------
  if (locality) {
    // Each layer stores its events in a different table / column. We mirror the
    // predicates from queryEvents() below (same WHERE clause, just COUNT(*)).
    let totalCount = 0;

    switch (layer) {
      case "perdidas": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          sql`(${petEvents.payload}->>'kind') IN ('pet_lost', 'pet_found_sighting')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`(${petEvents.payload}->>'province') = ${province}`,
          sql`(${petEvents.payload}->>'locality') = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "mordeduras": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "incident_reported"),
          sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`(${petEvents.payload}->>'province') = ${province}`,
          sql`(${petEvents.payload}->>'locality') = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "denuncias": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          sql`${welfareReports.jurisdictionProvince} = ${province}`,
          sql`${welfareReports.jurisdictionLocality} = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(welfareReports)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`(${petEvents.payload}->>'province') = ${province}`,
          sql`(${petEvents.payload}->>'locality') = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          sql`${cases.jurisdictionProvince} = ${province}`,
          sql`${cases.jurisdictionLocality} = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(cases)
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "cobertura": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          // Amendment overlay (audit A2): count by the CURRENT vaccine name.
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          sql`${pets.jurisdictionLocality} = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "mortalidad": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          sql`${pets.jurisdictionLocality} = ${locality}`,
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      default:
        totalCount = K_ANON; // Unknown layers are exempt from suppression.
    }

    if (totalCount < K_ANON) {
      return { suppressed: true, events: [], trend: [], byType: {} };
    }
  }

  // ---------------------------------------------------------------------------
  // Route by layer source to the correct event table + predicate.
  // Each branch mirrors the predicate used in the corresponding per-unit loader.
  // ---------------------------------------------------------------------------

  type RawEvent = { date: Date | null; type: string; label: string };

  async function queryEvents(): Promise<RawEvent[]> {
    // Build province+locality filter for pet_events JSONB-payload layers.
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`(${petEvents.payload}->>'province') = ${province}`];
      if (locality) filters.push(sql`(${petEvents.payload}->>'locality') = ${locality}`);
      return filters;
    }

    // Build province+locality filter for jurisdiction-column based tables
    // (welfare_reports, cases).
    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(sql`${localityCol} = ${locality}`);
      return filters;
    }

    // Build province+locality filter for the pets table.
    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(sql`${pets.jurisdictionLocality} = ${locality}`);
      return filters;
    }

    switch (layer) {
      case "perdidas": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          sql`(${petEvents.payload}->>'kind') IN ('pet_lost', 'pet_found_sighting')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            kind: sql<string>`(${petEvents.payload}->>'kind')`,
          })
          .from(petEvents)
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.kind ?? "pet_lost",
          label: r.kind === "pet_found_sighting" ? "Avistaje" : "Mascota perdida",
        }));
      }

      case "mordeduras": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "incident_reported"),
          sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            incidentType: sql<string>`(${petEvents.payload}->>'incident_type')`,
          })
          .from(petEvents)
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.incidentType ?? "bite_inflicted",
          label: r.incidentType === "bite_suffered" ? "Mordedura recibida" : "Mordedura infligida",
        }));
      }

      case "denuncias": {
        // COARSE: never exact coordinates — only kind/severity/jurisdiction.
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          ...columnJurisdictionFilter(
            sql`${welfareReports.jurisdictionProvince}`,
            sql`${welfareReports.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            createdAt: welfareReports.createdAt,
            kind: welfareReports.kind,
            severity: welfareReports.severity,
          })
          .from(welfareReports)
          .where(and(...conditions))
          .orderBy(sql`${welfareReports.createdAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.createdAt,
          type: r.kind ?? "other",
          label: r.severity ? `Denuncia (${r.severity})` : "Denuncia",
        }));
      }

      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            diseaseCode: sql<string | null>`(${petEvents.payload}->>'disease_code')`,
            diseaseLabel: sql<string | null>`(${petEvents.payload}->>'disease_label')`,
          })
          .from(petEvents)
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: r.diseaseCode ?? "outbreak_signal",
          label: r.diseaseLabel ?? findDisease(r.diseaseCode)?.label ?? "Señal de brote",
        }));
      }

      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          ...columnJurisdictionFilter(
            sql`${cases.jurisdictionProvince}`,
            sql`${cases.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            openedAt: cases.openedAt,
            publicCode: cases.publicCode,
            status: cases.status,
          })
          .from(cases)
          .where(and(...conditions))
          .orderBy(sql`${cases.openedAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.openedAt,
          type: "custody_episode",
          label: r.publicCode ?? "Expediente",
        }));
      }

      case "cobertura": {
        // Rabies-coverage events — rabies vaccinations on pets in the unit.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          // Amendment overlay (audit A2): select AND label by the CURRENT name.
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            vaccineName: sql<string | null>`(${amendedPayloadText("vaccine_name")})`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: "vaccination_administered",
          label: r.vaccineName ?? "Vacuna antirrábica",
        }));
      }

      case "mortalidad": {
        // Mortality events — deaths recorded for pets in the unit.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            dispositionMethod: sql<string | null>`(${petEvents.payload}->>'disposition_method')`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .orderBy(sql`${petEvents.occurredAt} DESC`)
          .limit(EVENT_LIMIT);
        return rows.map((r) => ({
          date: r.occurredAt,
          type: "death_recorded",
          label: r.dispositionMethod ?? "Fallecimiento registrado",
        }));
      }

      default:
        return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Daily-bucket trend query — same predicate as the events query but grouped
  // by day and without the LIMIT, so the sparkline covers the full window.
  // A second query here (simpler SQL) because the event list and the trend
  // have different LIMIT semantics.
  // ---------------------------------------------------------------------------

  async function queryTrend(): Promise<TrendBucket[]> {
    const dayBucket = (tsCol: SQL) =>
      sql<string>`to_char(date_trunc('day', ${tsCol}), 'YYYY-MM-DD')`;

    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`(${petEvents.payload}->>'province') = ${province}`];
      if (locality) filters.push(sql`(${petEvents.payload}->>'locality') = ${locality}`);
      return filters;
    }

    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(sql`${localityCol} = ${locality}`);
      return filters;
    }

    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(sql`${pets.jurisdictionLocality} = ${locality}`);
      return filters;
    }

    let rows: Array<{ day: string; n: number }> = [];

    switch (layer) {
      case "perdidas": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          sql`(${petEvents.payload}->>'kind') IN ('pet_lost', 'pet_found_sighting')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "mordeduras": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "incident_reported"),
          sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "denuncias": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${welfareReports.jurisdictionProvince}`,
          sql`${welfareReports.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          gte(welfareReports.createdAt, since),
          lte(welfareReports.createdAt, until),
          sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
          ...columnJurisdictionFilter(
            sql`${welfareReports.jurisdictionProvince}`,
            sql`${welfareReports.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${welfareReports.createdAt}`), n: count() })
          .from(welfareReports)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${welfareReports.createdAt}`))
          .orderBy(dayBucket(sql`${welfareReports.createdAt}`));
        break;
      }

      case "zoonosis": {
        const scope = petEventsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "outbreak_signal"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...payloadJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "decomisos": {
        const scope = jurisdictionColumnsScope(
          actor,
          jurisdictions,
          sql`${cases.jurisdictionProvince}`,
          sql`${cases.jurisdictionLocality}`,
        );
        const conditions: SQL[] = [
          eq(cases.caseKind, "custody_episode"),
          gte(cases.openedAt, since),
          lte(cases.openedAt, until),
          ...columnJurisdictionFilter(
            sql`${cases.jurisdictionProvince}`,
            sql`${cases.jurisdictionLocality}`,
          ),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${cases.openedAt}`), n: count() })
          .from(cases)
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${cases.openedAt}`))
          .orderBy(dayBucket(sql`${cases.openedAt}`));
        break;
      }

      case "cobertura": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "vaccination_administered"),
          // Amendment overlay (audit A2): bucket by the CURRENT vaccine name.
          sql`unaccent(lower(coalesce(${amendedPayloadText("vaccine_name")}, ''))) LIKE '%rabi%'`,
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      case "mortalidad": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          eq(petEvents.eventType, "death_recorded"),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        rows = await db
          .select({ day: dayBucket(sql`${petEvents.occurredAt}`), n: count() })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions))
          .groupBy(dayBucket(sql`${petEvents.occurredAt}`))
          .orderBy(dayBucket(sql`${petEvents.occurredAt}`));
        break;
      }

      default:
        return [];
    }

    return rows.map((r) => ({ date: r.day, count: r.n }));
  }

  // ---------------------------------------------------------------------------
  // Execute both queries, then compute byType from the events list.
  // ---------------------------------------------------------------------------

  const [rawEvents, trend] = await Promise.all([queryEvents(), queryTrend()]);

  const events: UnitHistoryEvent[] = rawEvents.map((e) => ({
    date: e.date ? e.date.toISOString() : new Date().toISOString(),
    type: e.type,
    label: e.label,
  }));

  // byType: tally from the full event list (capped at EVENT_LIMIT, which is
  // representative; a separate count query is not worth the extra round-trip
  // given the 20-event cap and the "recent context" framing).
  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  return { events, trend, byType };
}
