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

import { type SQL, and, countDistinct, eq, gte, isNotNull, sql } from "drizzle-orm";

import { arLocalities, cases, db, organizations, petEvents, pets, welfareReports } from "@/db";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
  petEventsScopeClause as metricsPetEventsScopeClause,
  petsScopeClause as metricsPetsScopeClause,
  suppressSmallCells,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

import type {
  BiteRow,
  ChoroplethCell,
  DecomisoRow,
  DenunciaCentroidRow,
  OutbreakRow,
  ShelterRow,
} from "@/src/modules/panorama/application/build-features";

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

/** pets-table scope (province/locality columns). admin → null. */
function petsScope(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  return metricsPetsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m()),
  );
}

/** pet_events scope (JSONB payload jurisdiction). admin → null. */
function petEventsScope(actor: DashboardActor, jurisdictions: DashboardJurisdiction[]) {
  return metricsPetEventsScopeClause(
    buildProjectionContext(actor, jurisdictions, windows.trailing12m()),
  );
}

/** welfare_reports / cases / organizations share the same (province name, locality
 * name) jurisdiction columns. Build an OR of pair-matches against the given
 * province/locality columns. admin → null (no restriction); govt with no
 * assignments → false (match nothing). */
function jurisdictionColumnsScope(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  provinceCol: SQL | ReturnType<typeof sql.raw>,
  localityCol: SQL | ReturnType<typeof sql.raw>,
): SQL | null {
  if (actor.role === "admin") return null;
  if (jurisdictions.length === 0) return sql`false`;
  const pairs = jurisdictions.map(
    (j) => sql`(${provinceCol} = ${j.province} AND ${localityCol} = ${j.locality})`,
  );
  return sql.join(pairs, sql` OR `);
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
): Promise<LayerRows<BiteRow>> {
  const conditions = [
    eq(petEvents.eventType, "incident_reported"),
    // bite_inflicted | bite_suffered are the two bite variants (event-schemas.ts).
    sql`(${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered')`,
    gte(petEvents.occurredAt, since),
    // Located events only — a point layer never plots a null coordinate.
    isNotNull(petEvents.locationLat),
  ];
  const scope = petEventsScope(actor, jurisdictions);
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
): Promise<LayerRows<DenunciaCentroidRow>> {
  const conditions = [
    gte(welfareReports.createdAt, since),
    // Hide moderation-flagged-not-resolved rows (same rule as /gob/maltrato).
    sql`(${welfareReports.flaggedAt} IS NULL OR ${welfareReports.moderationResolvedAt} IS NOT NULL)`,
    isNotNull(welfareReports.jurisdictionLocality),
  ];
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${welfareReports.jurisdictionProvince}`,
    sql`${welfareReports.jurisdictionLocality}`,
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
): Promise<LayerRows<OutbreakRow>> {
  const conditions = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(petEvents.occurredAt, since),
    isNotNull(petEvents.locationLat),
  ];
  // outbreak_signal stores its own jurisdiction keys; reuse the payload scope.
  const scope = petEventsScope(actor, jurisdictions);
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
      diseaseLabel: r.diseaseLabel,
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
// cases:decomiso (decomisos) — custody_episode cases with coords.
//
// The decomiso (Ley 14.346 seizure) case_kind is 'custody_episode' (see
// app/gob/decomisos). Only located cases plot.
// ---------------------------------------------------------------------------

export async function loadDecomisos(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
): Promise<LayerRows<DecomisoRow>> {
  const conditions = [
    eq(cases.caseKind, "custody_episode"),
    gte(cases.openedAt, since),
    isNotNull(cases.locationLat),
  ];
  const scope = jurisdictionColumnsScope(
    actor,
    jurisdictions,
    sql`${cases.jurisdictionProvince}`,
    sql`${cases.jurisdictionLocality}`,
  );
  if (scope) conditions.push(sql`(${scope})`);

  const rows = await db
    .select({
      id: cases.id,
      publicCode: cases.publicCode,
      status: cases.status,
      locationLat: cases.locationLat,
      locationLng: cases.locationLng,
      openedAt: cases.openedAt,
    })
    .from(cases)
    .where(and(...conditions))
    .limit(PER_LAYER_CAP);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      publicCode: r.publicCode,
      status: r.status,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
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

/** Result envelope for a choropleth loader. */
export type ChoroplethRows = {
  cells: ChoroplethCell[];
  suppressedCount: number;
  truncated: boolean;
};

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

// metrics:rabies-coverage (cobertura) — per-locality count of pets in scope that
// have a valid rabies vaccination. The numerator is the suppressed, plotted
// value; we surface the raw vaccinated count as a graduated symbol per locality.
export async function loadRabiesCoverage(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ChoroplethRows> {
  // Pets in scope with at least one rabies vaccination event (vaccine_name
  // accent-insensitively matches rabia/rabies/antirrábica). Mirrors the
  // welfare-metrics rabies match.
  const vaccinated = sql`EXISTS (
    SELECT 1 FROM ${petEvents} pe_rabies
    WHERE pe_rabies.pet_id = ${pets.id}
      AND pe_rabies.event_type = 'vaccination_administered'
      AND unaccent(lower(coalesce(pe_rabies.payload->>'vaccine_name', ''))) LIKE '%rabi%'
  )`;
  const scope = petsScope(actor, jurisdictions);
  const rollup = await rollupPetsPerLocality([vaccinated as SQL], scope);
  const { cells, suppressedCount } = toChoroplethCells(rollup);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// metrics:mortality (mortalidad) — per-locality count of pets in scope currently
// in status='deceased'. The death disposition surface is rendered as a graduated
// centroid symbol; the count is the suppressed, plotted value.
export async function loadMortality(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions);
  const rollup = await rollupPetsPerLocality([eq(pets.status, "deceased")], scope);
  const { cells, suppressedCount } = toChoroplethCells(rollup);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}
