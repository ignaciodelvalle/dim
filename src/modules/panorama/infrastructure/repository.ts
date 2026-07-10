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

// Heavy read-only analytics — routed through the ANALYTICS pool (session
// pooler in production; see db/index.ts, task #74 dual-pool split).
import {
  arLocalities,
  cases,
  analyticsDb as db,
  organizations,
  petEvents,
  pets,
  welfareReports,
} from "@/db";
import {
  fetchMicrochipPenetrationByProvince,
  fetchPppComplianceByProvince,
} from "@/lib/analytics/compliance-metrics";
import { fetchRabiesCoverageByProvince } from "@/lib/analytics/govt-home-kpis";
import { amendedPayloadText } from "@/lib/infra/amendment-sql";
import {
  type DashboardActor,
  type DashboardJurisdiction,
  buildProjectionContext,
  complementarySuppress,
  fetchReunificationByUnit,
  jurisdictionPairClause,
  petEventsScopeClause as metricsPetEventsScopeClause,
  petsScopeClause as metricsPetsScopeClause,
  rabiesVaccinatedExists,
  suppressSmallCells,
} from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { fetchSterilizationCoverage } from "@/lib/metrics/population-control";
import { findDisease } from "@/lib/reference/diseases";

import {
  type AggregatedPointCell,
  type BiteRow,
  type ChoroplethCell,
  type DecomisoRow,
  type DenunciaCentroidRow,
  type LostPointRow,
  type OutbreakRow,
  type ProvinceChoroplethCell,
  type ShelterRow,
  aggregateCellsToDepartment,
} from "@/src/modules/panorama/application/build-features";
import type { TimeBasis } from "@/src/modules/panorama/domain/time-scrub";
import type { AggregationLevel } from "@/src/modules/panorama/domain/types";

// Per-layer hard cap. Each loader limits at this; when the row count equals the
// cap the result is (potentially) truncated and the envelope says so.
export const PER_LAYER_CAP = 2000;

/**
 * task #77 bitemporal — the pet_events window column for a replay basis.
 *   - "valid"       → occurred_at (when the fact happened). DEFAULT.
 *   - "transaction" → recorded_at (when the State/system learned it).
 * The gap between the two surfaces reporting lag / territorial-presence blind
 * spots. Only the pet_events-backed temporal layers (perdidas, mordeduras,
 * zoonosis) carry a true bitemporal pair; denuncias (welfare_reports.created_at =
 * intake time) and decomisos (cases) have no distinct recorded_at, so they ignore
 * the basis and replay by their single timestamp in both modes.
 *
 * PERF: recorded_at is NOT indexed (only occurred_at is —
 * pet_events_pet_id_occurred_at_idx + pet_events_event_type_occurred_at_idx), so a
 * transaction-basis replay is an unindexed range scan. Acceptable at pilot scale;
 * a future migration should add a recorded_at index if this path gets hot. No
 * migration is added in this lane by design.
 */
function eventWindowCol(basis: TimeBasis) {
  return basis === "transaction" ? petEvents.recordedAt : petEvents.occurredAt;
}

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
// pet_events:lost (perdidas) — production event predicate + attribution.
//
// The perdidas layer surfaces lost-and-found activity. Production writes TWO
// distinct events — NOT a payload 'kind' discriminator (no writer emits one;
// the note_added zod enum never even had a 'pet_found_sighting' value):
//   - a pet marked lost   → status_changed with payload.to_status = 'lost'
//                           (set-pet-lost-use-case.ts)
//   - a sighting reported → note_added with payload.kind = 'sighting'
//                           (app/actions/pet-sighting.ts; updateLostLastSeen)
// Neither carries jurisdiction in its payload — geography is attributed by the
// JOIN to pets (pets.jurisdiction_province/locality), the pet's home unit, which
// is also the correct product semantics. This replaced the demo-only
// `payload->>'kind' IN ('pet_lost','pet_found_sighting')` predicate that ONLY the
// raw-insert seed produced (the event-schema-drift pre-pilot blocker: real
// lost/sighting events were invisible on the map + unit history).
function perdidasEventPredicate(): SQL {
  return sql`(
    (${petEvents.eventType} = 'status_changed' AND (${petEvents.payload}->>'to_status') = 'lost')
    OR (${petEvents.eventType} = 'note_added' AND (${petEvents.payload}->>'kind') = 'sighting')
  )`;
}

// panorama-event-points Slice 1 — SIGHTINGS-ONLY predicate (review A3).
//
// The near-zoom real-dot loader (loadPerdidasEvents) is deliberately NARROWER
// than perdidasEventPredicate (which also matches status_changed→lost). It
// matches ONLY `note_added` with payload kind='sighting' — an anonymous finder's
// report, ~100% coord coverage (report-pet-sighting.ts writes with
// requireCoords:true). The lost-MARK coordinate is the owner's last-seen governed
// by discloseLastLocationWhenLost — NOT unconditionally public — so it is EXCLUDED
// from Slice 1 dots (deferred until the disclosure-pref interplay is designed).
// Keeping the dot source to public-by-consent sightings makes the k-anon-bypass
// justification (an individual dot on a k-suppressed cell) uniformly airtight.
function sightingEventPredicate(): SQL {
  return sql`(${petEvents.eventType} = 'note_added' AND (${petEvents.payload}->>'kind') = 'sighting')`;
}

// Synthetic type discriminator for the event-detail list: reproduce the old
// pet_lost / pet_found_sighting types from the REAL event type without a payload
// 'kind' field. note_added ⇒ pet_found_sighting (Avistaje); a status_changed
// to_status='lost' ⇒ pet_lost (Mascota perdida).
function perdidasKindExpr(): SQL<string> {
  return sql<string>`CASE WHEN ${petEvents.eventType} = 'note_added' THEN 'pet_found_sighting' ELSE 'pet_lost' END`;
}

// Bite incidents — the incident_type discriminator IS real (event-schemas.ts
// incidentReported); only the geography attribution needed fixing (the demo
// keyed on flat payload province/locality the schema never writes). Attribution
// is via the JOIN to pets, same as perdidas.
function mordedurasEventPredicate(): SQL {
  return sql`(${petEvents.eventType} = 'incident_reported' AND (${petEvents.payload}->>'incident_type') IN ('bite_inflicted', 'bite_suffered'))`;
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
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<LayerRows<BiteRow> & { noCoordCount: number }> {
  // task #77: the replay-basis window column (occurred_at vs recorded_at).
  const tcol = eventWindowCol(basis);
  // Base scope+period predicate shared by the dot query and the residual COUNT.
  const base: SQL[] = [
    // bite_inflicted | bite_suffered are the two bite variants (event-schemas.ts).
    mordedurasEventPredicate(),
    gte(tcol, since),
  ];
  // F4 temporal reproduction: upper-bound the event window so the layer can be
  // reconstructed "as of t" while the TimeScrubber plays.
  if (asOf) base.push(lte(tcol, asOf));
  // incident_reported carries NO jurisdiction in its payload (only outbreak_signal
  // snapshots pet_jurisdiction_* — see petEventsScopeClause jsdoc), so scope by the
  // pet's home jurisdiction via the JOIN to pets, exactly like loadMordedurassByUnit.
  // The old petEventsScope filtered out every real bite for scoped govt users.
  // PRIVACY (Slice 2): this scope binding is the operator-jurisdiction gate — a govt
  // user physically cannot fetch a bite outside their scope; admins must have drilled
  // into a province (server-authoritative points gate in get-layer-features/route).
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  if (scope) base.push(sql`(${scope})`);

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
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    // Located events only — a point layer never plots a null coordinate.
    .where(and(...base, isNotNull(petEvents.locationLat)))
    // Most-recent-first (by the active basis) so a capped result keeps the
    // freshest incidents — most-recently-recorded under transaction basis.
    .orderBy(sql`${tcol} DESC`)
    .limit(PER_LAYER_CAP);

  // Residual: in-scope bites with NO columnar coordinate (older events written
  // before Slice 2's map-pin capture). Surfaced as an honest "sin ubicación
  // exacta" count — never plotted as a fake centroid dot (fallback honesty, §5).
  const [residual] = await db
    .select({ n: count() })
    .from(petEvents)
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    .where(and(...base, sql`${petEvents.locationLat} IS NULL`));

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
    noCoordCount: residual?.n ?? 0,
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
// Choropleth: per-locality rollups → division polygon fill (scoped) or centroid.
//
// For a single-province scope the map now HAS division polygons (CABA barrios;
// departamentos elsewhere) and fills them by joining these cells to the divisions
// (see components/panorama/division-fill.ts). The centroid circle is retained as
// the fallback for a cell with no polygon match (and for the national view, where
// no divisions are loaded). Each rollup is grouped by (province, locality), joined
// to the ar_localities centroid + department code, then routed through
// suppressSmallCells (k=5).
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
  /** INDEC 5-digit department code (from ar_localities) for the departamento
   * roll-up on the map. Null when the locality has no matching ar_localities row
   * (the cell then falls back to its centroid circle, never a polygon fill).
   * OPTIONAL: only the locality-CHOROPLETH rollup carries it; the aggregated
   * point rollups (perdidas/mordeduras/…) share this row shape and omit it
   * (they render as centroid circles, never a division fill). */
  departmentCode?: string | null;
  /** Department display name for the division popup/legend (choropleth only). */
  departmentName?: string | null;
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
  const primary = suppressSmallCells(rollup, {
    count: (r) => r.count,
    key: (r) => r.key,
    k: 5,
  });
  // Complementary suppression (differencing-attack defense): the province total
  // (§U5) is published unsuppressed, so a province with exactly ONE suppressed
  // department leaks it by subtraction. Also suppress the next-smallest visible
  // department in that province so no lone hidden cell survives. Grouped by
  // province — the published unsuppressed aggregate.
  const { visible, suppressed } = complementarySuppress(
    primary.visible as unknown as readonly RollupRow[],
    primary.suppressed,
    { group: (r) => r.province, count: (r) => r.count },
  );
  const suppressedCount = suppressed.length;

  const cells: ChoroplethCell[] = [];
  // Visible cells carry the real value. The rows are RollupRow objects that
  // suppressSmallCells / complementarySuppress partitioned.
  for (const r of visible) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode ?? null,
      departmentName: r.departmentName ?? null,
      value: r.count,
      suppressed: false,
    });
  }
  // Suppressed cells: keep the location AND the department code so the division
  // can still render an OUTLINE (never a fill) for a suppressed departamento;
  // the value is null — the real count never leaves the repository for these.
  for (const r of suppressed) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode ?? null,
      departmentName: r.departmentName ?? null,
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
export type ChoroplethMetric =
  | "rabies-coverage"
  | "sterilization-coverage"
  | "microchip-penetration"
  | "ppp-compliance"
  | "mortality";

/** Build the metric-specific pets predicate for LOCALITY-level loaders.
 * Defined ONCE so province and locality rollups can NEVER drift apart on the
 * numerator definition (U5).
 * For RATE metrics at LOCALITY level (count-density, v1 limitation) this is the
 * numerator predicate. For DENSITY metrics (mortality) this IS the full predicate.
 * Province-level RATE metrics delegate to the canonical fetchers instead of using
 * this predicate — see loadRabiesCoverageByProvince and
 * loadSterilizationCoverageByProvince. */
function metricPredicate(metric: ChoroplethMetric, signedOnly = false): SQL {
  if (metric === "rabies-coverage") {
    // DOGS in scope with at least one qualifying rabies vaccination in the
    // trailing-12-month window. Uses the SHARED rabiesVaccinatedExists predicate
    // (lib/metrics/rabies.ts) so the locality numerator is the SAME definition as
    // the national KPI, the province breakdown, and the /admin panel (C3).
    // Before C3 this was `ILIKE '%rabi%'` (accent-SENSITIVE → silently missed the
    // canonical form "Antirrábica"), over ALL species and ALL time — three ways
    // adrift from the canonical rabies_coverage_dogs_12m numerator.
    // `signedOnly` (task #78 Part 3) narrows the numerator to vet-signed doses via
    // the same rabiesVaccinatedExists option the KPI uses — one definition.
    const win = windows.trailing12m();
    return sql`(${pets.species} = 'dog' AND ${rabiesVaccinatedExists(sql`${pets.id}`, win, { signedOnly })})`;
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
  if (metric === "microchip-penetration") {
    // Active pets with an ACTIVE microchip_iso identification — same numerator
    // as fetchMicrochipPenetration (lib/analytics/compliance-metrics.ts, C1).
    return sql`EXISTS (
      SELECT 1 FROM pet_identifications pi
      WHERE pi.pet_id = ${pets.id}
        AND pi.kind = 'microchip_iso'
        AND pi.status = 'active'
    )`;
  }
  if (metric === "ppp-compliance") {
    // PPP-flagged pets with a dangerous_breed_attested event — same numerator
    // as fetchDangerousBreedCompliance (C7). Graceful 0% until the attestation
    // writer-form exists (umbrella §7).
    return sql`${pets.potentiallyDangerousBreed} = true AND EXISTS (
      SELECT 1 FROM ${petEvents} pe_ppp
      WHERE pe_ppp.pet_id = ${pets.id}
        AND pe_ppp.event_type = 'dangerous_breed_attested'
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
      // Deterministic department pick (MIN), same discipline as the centroid: an
      // ambiguous (province, locality-name) pair can match several ar_localities
      // rows, so we pin ONE department code/name per cell for the map roll-up.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
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
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
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
  // task #78 Part 3: narrow the numerator to vet-signed doses (panorama toggle).
  verifiedOnly = false,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const predicate = metricPredicate("rabies-coverage", verifiedOnly);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([predicate], scope),
    countPetsNoLocality([predicate], scope),
  ]);
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the
  // department — the barrio for CABA — so the DATA + k-anon unit matches the
  // division polygon the map actually draws. k=5 then applies at the department,
  // which clears the threshold far more often than the near-always-suppressed
  // locality cells did. `truncated` still reflects the LOCALITY query cap (the
  // fold only reduces the cell count).
  const { cells, suppressedCount } = toChoroplethCells(aggregateCellsToDepartment(rollup));
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
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the
  // department — the barrio for CABA — so the DATA + k-anon unit matches the
  // division polygon the map actually draws. k=5 then applies at the department,
  // which clears the threshold far more often than the near-always-suppressed
  // locality cells did. `truncated` still reflects the LOCALITY query cap (the
  // fold only reduces the cell count).
  const { cells, suppressedCount } = toChoroplethCells(aggregateCellsToDepartment(rollup));
  return { cells, suppressedCount, noLocalityCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// metrics:microchip-penetration (microchip) — count of chipped pets at the
// LOCALITY level (centroid graduated symbols, k-anon). Same v1 count-density
// limitation as rabies/sterilization above (rate-by-locality deferred).
export async function loadMicrochipCoverage(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([metricPredicate("microchip-penetration")], scope),
    countPetsNoLocality([metricPredicate("microchip-penetration")], scope),
  ]);
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the
  // department — the barrio for CABA — so the DATA + k-anon unit matches the
  // division polygon the map actually draws. k=5 then applies at the department,
  // which clears the threshold far more often than the near-always-suppressed
  // locality cells did. `truncated` still reflects the LOCALITY query cap (the
  // fold only reduces the cell count).
  const { cells, suppressedCount } = toChoroplethCells(aggregateCellsToDepartment(rollup));
  return { cells, suppressedCount, noLocalityCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// metrics:ppp-compliance (ppp) — count of attested PPP-flagged pets at the
// LOCALITY level (centroid graduated symbols, k-anon). Same v1 count-density
// limitation as rabies/sterilization above (rate-by-locality deferred).
export async function loadPppCompliance(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ChoroplethRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const [rollup, noLocalityCount] = await Promise.all([
    rollupPetsPerLocality([metricPredicate("ppp-compliance")], scope),
    countPetsNoLocality([metricPredicate("ppp-compliance")], scope),
  ]);
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the
  // department — the barrio for CABA — so the DATA + k-anon unit matches the
  // division polygon the map actually draws. k=5 then applies at the department,
  // which clears the threshold far more often than the near-always-suppressed
  // locality cells did. `truncated` still reflects the LOCALITY query cap (the
  // fold only reduces the cell count).
  const { cells, suppressedCount } = toChoroplethCells(aggregateCellsToDepartment(rollup));
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
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the
  // department — the barrio for CABA — so the DATA + k-anon unit matches the
  // division polygon the map actually draws. k=5 then applies at the department,
  // which clears the threshold far more often than the near-always-suppressed
  // locality cells did. `truncated` still reflects the LOCALITY query cap (the
  // fold only reduces the cell count).
  const { cells, suppressedCount } = toChoroplethCells(aggregateCellsToDepartment(rollup));
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
  // task #78 Part 3: narrow the numerator to vet-signed doses (panorama toggle).
  verifiedOnly = false,
): Promise<ProvinceChoroplethRows> {
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
    verifiedOnly,
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

// metrics:microchip-penetration (microchip) — per-province microchip rate via
// the canonical fetcher. Delegates to fetchMicrochipPenetrationByProvince
// (lib/analytics/compliance-metrics). value = ratePct (active-pets denominator,
// matching the C1 KPI). Parity guaranteed by reuse.
export async function loadMicrochipCoverageByProvince(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows> {
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
  });
  const byProvince = await fetchMicrochipPenetrationByProvince(ctx);
  const cells: ProvinceChoroplethCell[] = [];
  for (const r of byProvince) {
    const code = PROVINCE_ISO[r.province];
    if (!code) continue;
    cells.push({ provinceCode: code, label: r.province, value: r.ratePct });
  }
  return { cells, truncated: byProvince.length >= PER_LAYER_CAP };
}

// metrics:ppp-compliance (ppp) — per-province PPP registry compliance via the
// canonical fetcher. Delegates to fetchPppComplianceByProvince
// (lib/analytics/compliance-metrics). value = ratePct (PPP-flagged-pets
// denominator, matching the C7 KPI). Parity guaranteed by reuse.
export async function loadPppComplianceByProvince(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<ProvinceChoroplethRows> {
  const ctx = buildProjectionContext(actor, jurisdictions, windows.trailing12m(), {
    adminProvince,
    adminLocality,
  });
  const byProvince = await fetchPppComplianceByProvince(ctx);
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
  verifiedOnly?: boolean,
): Promise<ProvinceChoroplethRows>;
export function loadChoroplethByLevel(
  metric: ChoroplethMetric,
  level: "locality",
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
  verifiedOnly?: boolean,
): Promise<ChoroplethRows>;
export function loadChoroplethByLevel(
  metric: ChoroplethMetric,
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
  // task #78 Part 3: "solo firmado por matrícula" numerator narrowing. Honored
  // ONLY by the rabies-coverage metric (the toggle is rabies-specific); the
  // sterilization/mortality loaders ignore it.
  verifiedOnly = false,
): Promise<ChoroplethRows | ProvinceChoroplethRows> {
  if (level === "province") {
    if (metric === "rabies-coverage")
      return loadRabiesCoverageByProvince(
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
        verifiedOnly,
      );
    if (metric === "sterilization-coverage")
      return loadSterilizationCoverageByProvince(
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      );
    if (metric === "microchip-penetration")
      return loadMicrochipCoverageByProvince(actor, jurisdictions, adminProvince, adminLocality);
    if (metric === "ppp-compliance")
      return loadPppComplianceByProvince(actor, jurisdictions, adminProvince, adminLocality);
    return loadMortalityByProvince(actor, jurisdictions, adminProvince, adminLocality);
  }
  // Locality level.
  if (metric === "rabies-coverage")
    return loadRabiesCoverage(actor, jurisdictions, adminProvince, adminLocality, verifiedOnly);
  if (metric === "sterilization-coverage")
    return loadSterilizationCoverage(actor, jurisdictions, adminProvince, adminLocality);
  if (metric === "microchip-penetration")
    return loadMicrochipCoverage(actor, jurisdictions, adminProvince, adminLocality);
  if (metric === "ppp-compliance")
    return loadPppCompliance(actor, jurisdictions, adminProvince, adminLocality);
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
        departmentCode: r.departmentCode ?? null,
        centroidLat: r.centroidLat,
        centroidLng: r.centroidLng,
        count: r.count,
        suppressed: false,
      })),
      suppressedCount: 0,
    };
  }
  // Locality level — route through suppressSmallCells (k=5).
  const primary = suppressSmallCells(rollup, {
    count: (r) => r.count,
    key: (r) => r.key,
    k: 5,
  });
  // Complementary suppression: same differencing-attack defense as the
  // choropleth path — a province with a lone suppressed folded cell also
  // suppresses its next-smallest visible sibling (grouped by province).
  const { visible, suppressed } = complementarySuppress(
    primary.visible as unknown as readonly RollupRow[],
    primary.suppressed,
    { group: (r) => r.province, count: (r) => r.count },
  );
  const suppressedCount = suppressed.length;
  const cells: AggregatedPointCell[] = [];
  for (const r of visible) {
    cells.push({
      key: r.key,
      province: r.province,
      locality: r.locality !== "" ? r.locality : null,
      departmentCode: r.departmentCode ?? null,
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
      departmentCode: r.departmentCode ?? null,
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
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<AggregatedPointRows> {
  // pets-table scope + pets-JOIN attribution: lost/sighting events carry NO
  // jurisdiction in their payload, so the pet's home jurisdiction is the unit.
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const tcol = eventWindowCol(basis);
  const conditions: SQL[] = [
    perdidasEventPredicate(),
    gte(tcol, since),
    isNotNull(pets.jurisdictionProvince),
  ];
  if (asOf) conditions.push(lte(tcol, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: pets.jurisdictionProvince,
        // AVG (not MIN): MIN over every locality in the province is the SW corner
        // of the bbox, not a centroid. AVG is the unweighted locality centroid.
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .innerJoin(pets, eq(petEvents.petId, pets.id))
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(pets.jurisdictionProvince)
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

  // Locality level: group by (province, locality), left-join ar_localities for centroid.
  const rows = await db
    .select({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // Department roll-up keys (PO "Option A") — pinned deterministically via MIN,
      // same discipline as the centroid, so the fold matches the choropleth path.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`${pets.jurisdictionLocality}`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(pets.jurisdictionLocality)))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province as string,
      locality: r.locality as string,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
      count: r.n,
    }));
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the department
  // (barrio for CABA) BEFORE k-anon, so the DATA + k=5 unit matches the division the
  // map draws. `truncated` still reflects the LOCALITY query cap (the fold only shrinks).
  const { cells, suppressedCount } = toAggregatedCells(aggregateCellsToDepartment(rollup), true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// pet_events:lost (perdidas) — REAL sighting DOTS (panorama-event-points Slice 1).
//
// The near-zoom counterpart to loadPerdidasByUnit: instead of one graduated
// bubble per administrative unit, it returns individual sighting coordinates as
// dots. Used ONLY when the server has authorized points mode (mode=points AND a
// province is resolved — see get-layer-features/route). Governance:
//   - SIGHTINGS ONLY (A3): sightingEventPredicate, NOT perdidasEventPredicate —
//     lost-mark coords are out of Slice 1.
//   - located rows only: isNotNull(locationLat); non-located sightings are counted
//     into the `noCoordCount` residual ("N avistajes sin ubicación exacta"),
//     never plotted as a fake centroid dot (fallback honesty, §5).
//   - SCOPE (A2): petsScope — attribution by the pet's HOME jurisdiction (JOIN
//     pets), the SAME scope as loadPerdidasByUnit. Dots are the operator's OWN
//     cases; a pet homed in province X but sighted in Y plots physically in Y and
//     is visible to the X operator (not a breach — it is X's case). NOT
//     petEventsScope (incident payloads carry no jurisdiction; sightings none).
//   - CAP (A8): PER_LAYER_CAP, ordered occurredAt DESC so a capped result keeps
//     the N MOST RECENT sightings ("mostrando los N más recientes"); scope + cap +
//     client-side MapLibre clustering is the mitigation — no viewport culling.
// ---------------------------------------------------------------------------

/** Result envelope for the real-sighting-dots loader (Slice 1). */
export type PointEventsRows = {
  rows: LostPointRow[];
  /** True when PER_LAYER_CAP clipped the result (the N most recent are kept). */
  truncated: boolean;
  /**
   * Sightings matching scope+period whose columnar coordinate is NULL — surfaced
   * as an honest "sin ubicación exacta" residual, never plotted. ~0 in practice
   * (sightings are written requireCoords:true) but counted for honesty.
   */
  noCoordCount: number;
};

export async function loadPerdidasEvents(
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<PointEventsRows> {
  // Same pets-table scope + pets-JOIN attribution as loadPerdidasByUnit (A2).
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const tcol = eventWindowCol(basis);
  const base: SQL[] = [sightingEventPredicate(), gte(tcol, since)];
  if (asOf) base.push(lte(tcol, asOf));
  if (scope) base.push(sql`(${scope})`);

  const rows = await db
    .select({
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      status: pets.status,
      locationLat: petEvents.locationLat,
      locationLng: petEvents.locationLng,
      occurredAt: petEvents.occurredAt,
      locationSource: sql<string | null>`(${petEvents.payload}->>'location_source')`,
    })
    .from(petEvents)
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    .where(and(...base, isNotNull(petEvents.locationLat)))
    // Most-recent-first (by the active basis) so a capped result keeps the
    // freshest sightings — most-recently-recorded under transaction basis.
    .orderBy(sql`${tcol} DESC`)
    .limit(PER_LAYER_CAP);

  // Residual: in-scope sightings with NO columnar coordinate (honest "sin
  // ubicación exacta" count — never a fake dot). Separate cheap COUNT.
  const [residual] = await db
    .select({ n: count() })
    .from(petEvents)
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    .where(and(...base, sql`${petEvents.locationLat} IS NULL`));

  return {
    rows: rows.map((r) => ({
      publicToken: r.publicToken,
      name: r.name,
      species: r.species,
      status: r.status,
      locationLat: r.locationLat,
      locationLng: r.locationLng,
      lastSeenAt: r.occurredAt ? r.occurredAt.toISOString() : null,
      locationSource: r.locationSource,
    })),
    truncated: rows.length >= PER_LAYER_CAP,
    noCoordCount: residual?.n ?? 0,
  };
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
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<AggregatedPointRows> {
  // pets-table scope + pets-JOIN attribution (same rationale as perdidas): the
  // incident payload never carries flat province/locality, so the pet's home
  // jurisdiction is the map unit.
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const tcol = eventWindowCol(basis);
  const conditions: SQL[] = [
    mordedurasEventPredicate(),
    gte(tcol, since),
    isNotNull(pets.jurisdictionProvince),
  ];
  if (asOf) conditions.push(lte(tcol, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: pets.jurisdictionProvince,
        // AVG (not MIN): unweighted locality centroid, not the province SW corner.
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .innerJoin(pets, eq(petEvents.petId, pets.id))
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(pets.jurisdictionProvince)
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
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // Department roll-up keys (PO "Option A") — pinned deterministically via MIN,
      // same discipline as the centroid, so the fold matches the choropleth path.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .innerJoin(pets, eq(petEvents.petId, pets.id))
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`${pets.jurisdictionLocality}`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(pets.jurisdictionLocality)))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province as string,
      locality: r.locality as string,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
      count: r.n,
    }));
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the department
  // (barrio for CABA) BEFORE k-anon, so the DATA + k=5 unit matches the division the
  // map draws. `truncated` still reflects the LOCALITY query cap (the fold only shrinks).
  const { cells, suppressedCount } = toAggregatedCells(aggregateCellsToDepartment(rollup), true);
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
        // AVG (not MIN): unweighted locality centroid, not the province SW corner.
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
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
      // Department roll-up keys (PO "Option A") — pinned deterministically via MIN.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
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
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
      count: r.n,
    }));
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the department
  // (barrio for CABA) BEFORE k-anon, so the DATA + k=5 unit matches the division the
  // map draws. `truncated` still reflects the LOCALITY query cap (the fold only shrinks).
  const { cells, suppressedCount } = toAggregatedCells(aggregateCellsToDepartment(rollup), true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// outbreak_signals (zoonosis) — per-unit aggregation (SIGNAL).
//
// Counts outbreak_signal pet_events grouped by the payload jurisdiction SNAPSHOT
// (pet_jurisdiction_province / pet_jurisdiction_locality) — the ONLY event type
// that legitimately carries jurisdiction in its payload (see petEventsScopeClause
// jsdoc; the schema snapshots it at signal time so surveillance aggregates hold
// even if the pet later moves). Previously grouped by flat payload province/locality
// that no outbreak_signal writer emits — only the raw-insert seed produced them, so
// real signals were invisible on the choropleth. Joins ar_localities for the unit
// centroid. Mirrors loadOutbreakSignals in scope + period clauses.
// ---------------------------------------------------------------------------

export async function loadZoonosisByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<AggregatedPointRows> {
  const scope = petEventsScope(actor, jurisdictions, adminProvince, adminLocality);
  const tcol = eventWindowCol(basis);
  const conditions: SQL[] = [
    eq(petEvents.eventType, "outbreak_signal"),
    gte(tcol, since),
    isNotNull(sql`(${petEvents.payload}->>'pet_jurisdiction_province')`),
  ];
  if (asOf) conditions.push(lte(tcol, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: sql<string>`(${petEvents.payload}->>'pet_jurisdiction_province')`,
        // AVG (not MIN): unweighted locality centroid, not the province SW corner.
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'pet_jurisdiction_province')`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(sql`(${petEvents.payload}->>'pet_jurisdiction_province')`)
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
      province: sql<string>`(${petEvents.payload}->>'pet_jurisdiction_province')`,
      locality: sql<string>`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // Department roll-up keys (PO "Option A") — pinned deterministically via MIN.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`(${petEvents.payload}->>'pet_jurisdiction_province')`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`)))
    .groupBy(
      sql`(${petEvents.payload}->>'pet_jurisdiction_province')`,
      sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`,
    )
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province,
      locality: r.locality,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
      count: r.n,
    }));
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the department
  // (barrio for CABA) BEFORE k-anon, so the DATA + k=5 unit matches the division the
  // map draws. `truncated` still reflects the LOCALITY query cap (the fold only shrinks).
  const { cells, suppressedCount } = toAggregatedCells(aggregateCellsToDepartment(rollup), true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// pet_events:symptom (sintomas) — per-unit aggregation (DENSITY).
// Groups symptom_observed by the pet's home jurisdiction (pets table) —
// symptom_observed carries no flat jurisdiction of its own in its payload,
// same attribution rule as perdidas/mordeduras.
// ---------------------------------------------------------------------------

export async function loadSintomasByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
  // task #77 bitemporal: "valid" (occurred_at, default) or "transaction" (recorded_at).
  basis: TimeBasis = "valid",
): Promise<AggregatedPointRows> {
  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const tcol = eventWindowCol(basis);
  const conditions: SQL[] = [
    eq(petEvents.eventType, "symptom_observed"),
    gte(tcol, since),
    isNotNull(pets.jurisdictionProvince),
  ];
  if (asOf) conditions.push(lte(tcol, asOf));
  if (scope) conditions.push(sql`(${scope})`);

  if (level === "province") {
    const rows = await db
      .select({
        province: pets.jurisdictionProvince,
        // AVG (not MIN): unweighted locality centroid, not the province SW corner.
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
        n: countDistinct(petEvents.id),
      })
      .from(petEvents)
      .innerJoin(pets, eq(pets.id, petEvents.petId))
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(...conditions))
      .groupBy(pets.jurisdictionProvince)
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
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
      centroidLat: sql<string | null>`MIN(${arLocalities.latitude})`,
      centroidLng: sql<string | null>`MIN(${arLocalities.longitude})`,
      // Department roll-up keys (PO "Option A") — pinned deterministically via MIN.
      departmentCode: sql<string | null>`MIN(${arLocalities.departmentCode})`,
      departmentName: sql<string | null>`MIN(${arLocalities.departmentName})`,
      n: countDistinct(petEvents.id),
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .leftJoin(
      arLocalities,
      and(
        sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
        sql`${normNameSql(sql`${arLocalities.localityName}`)} = ${normNameSql(sql`${pets.jurisdictionLocality}`)}`,
        sql`${arLocalities.removedAt} IS NULL`,
      ),
    )
    .where(and(...conditions, isNotNull(pets.jurisdictionLocality)))
    .groupBy(pets.jurisdictionProvince, pets.jurisdictionLocality)
    .limit(PER_LAYER_CAP);
  const rollup: RollupRow[] = rows
    .filter((r) => r.province && r.locality)
    .map((r) => ({
      key: `${r.province}|${r.locality}`,
      province: r.province as string,
      locality: r.locality as string,
      centroidLat: r.centroidLat,
      centroidLng: r.centroidLng,
      departmentCode: r.departmentCode,
      departmentName: r.departmentName,
      count: r.n,
    }));
  // Detail tier (PO "Option A"): fold the per-locality rollup up to the department
  // (barrio for CABA) BEFORE k-anon, so the DATA + k=5 unit matches the division the
  // map draws. `truncated` still reflects the LOCALITY query cap (the fold only shrinks).
  const { cells, suppressedCount } = toAggregatedCells(aggregateCellsToDepartment(rollup), true);
  return { cells, suppressedCount, truncated: rollup.length >= PER_LAYER_CAP };
}

// ---------------------------------------------------------------------------
// metrics:reunification (reunificacion) — per-unit aggregation (SIGNAL).
// Graduated-symbol count encodes the reunification ratePct (0–100) per unit.
// The k-anon suppression happens INSIDE fetchReunificationByUnit (lib/metrics/
// reunification-rollups.ts), keyed on the lostEpisodes DENOMINATOR — never on
// ratePct (the bug this port deliberately does not reproduce). This loader
// does NOT re-suppress; it only resolves centroids for the already-visible
// units, via the SAME shared leftJoin-arLocalities pattern every other
// per-unit loader in this file uses (one grouped query, not an N+1 per-unit
// centroid loop).
// ---------------------------------------------------------------------------

export async function loadReunificacionByUnit(
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  since: Date,
  asOf?: Date,
  adminProvince?: string,
  adminLocality?: string,
): Promise<AggregatedPointRows> {
  const ctx = buildProjectionContext(
    actor,
    jurisdictions,
    { since, until: asOf ?? new Date() },
    { adminProvince, adminLocality },
  );
  const { byUnit, suppressedCount } = await fetchReunificationByUnit(ctx, level);
  if (byUnit.length === 0) {
    return { cells: [], suppressedCount, truncated: false };
  }

  const scope = petsScope(actor, jurisdictions, adminProvince, adminLocality);
  const centroidByKey = new Map<string, { lat: string | null; lng: string | null }>();

  if (level === "province") {
    const rows = await db
      .select({
        province: pets.jurisdictionProvince,
        centroidLat: sql<string | null>`AVG(${arLocalities.latitude})`,
        centroidLng: sql<string | null>`AVG(${arLocalities.longitude})`,
      })
      .from(pets)
      .leftJoin(
        arLocalities,
        and(
          sql`${arLocalities.provinceCode} = ${provinceIsoMapSql(sql`${pets.jurisdictionProvince}`)}`,
          sql`${arLocalities.removedAt} IS NULL`,
        ),
      )
      .where(and(isNotNull(pets.jurisdictionProvince), ...(scope ? [sql`(${scope})`] : [])))
      .groupBy(pets.jurisdictionProvince);
    for (const r of rows) {
      if (r.province) centroidByKey.set(r.province, { lat: r.centroidLat, lng: r.centroidLng });
    }
  } else {
    // rollupPetsPerLocality already resolves the locality centroid via the
    // shared MIN(arLocalities.*) leftJoin — an empty whereExtra means every
    // pet in scope counts toward centroid resolution (no metric predicate).
    const rollup = await rollupPetsPerLocality([], scope);
    for (const r of rollup) {
      centroidByKey.set(r.key, { lat: r.centroidLat, lng: r.centroidLng });
    }
  }

  const rollup: RollupRow[] = byUnit.map((u) => {
    const key = level === "province" ? u.province : `${u.province}|${u.locality}`;
    const centroid = centroidByKey.get(key);
    return {
      key,
      province: u.province,
      locality: u.locality ?? "",
      centroidLat: centroid?.lat ?? null,
      centroidLng: centroid?.lng ?? null,
      // The value plotted IS the ratePct — the graduated symbol encodes the
      // reunification rate, not an event count (spec: dataType "signal").
      count: u.ratePct,
    };
  });

  const { cells } = toAggregatedCells(rollup, false);
  return { cells, suppressedCount, truncated: false };
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
  /** Locality name (display name). Optional — when absent, scope is province-wide.
   * For a folded DETAIL cell this carries the DEPARTMENT (or barrio) label. */
  locality?: string | null;
  /** INDEC department code of the folded cell (the fold's MIN(department_code) group
   * key). When present, department membership is resolved by CODE — not the
   * ambiguous department NAME — so a locality merely named like another department
   * is never pulled into the guard set (WARNING 3). Null for CABA barrios / cells
   * that resolved no department (they match by the direct locality-name arm). */
  departmentCode?: string | null;
  /** task #78 Part 3: mirror the cobertura map's "solo firmado" numerator narrowing
   * in the k-anon guard so it suppresses the SAME cells the map does (WARNING 2). */
  verifiedOnly?: boolean;
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
  const {
    layer,
    province,
    locality,
    departmentCode = null,
    verifiedOnly = false,
    since,
    until,
    actor,
    jurisdictions,
  } = params;

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
  // Department-aware unit resolution (PO "Option A").
  //
  // The detail tier now aggregates at the DEPARTMENT (barrio in CABA), so a
  // clicked map cell/bubble carries the DEPARTMENT NAME as `locality`. Resolve it
  // back to the member localities the folded cell counted, so the history — and
  // its k-anon guard — aggregate over the SAME set the map showed. Without this a
  // department click filters `jurisdiction_locality = <department name>`, matches
  // no pet, and "Historia de la unidad" is always empty. A row's locality column
  // matches when it either:
  //   - equals the label directly (CABA barrio, or a locality that resolved no
  //     department and kept its own name as the fold label), OR
  //   - belongs to the department named `locality` in this province, via the same
  //     ar_localities.department_name join the fold pinned (accent/case-normalised).
  // Uses `province`/`locality` from the enclosing closure — only ever built under
  // `if (locality)`, where the label is non-null.
  // ---------------------------------------------------------------------------
  function unitLocalityFilter(localityCol: SQL): SQL {
    // Department drill (code present): match EXACTLY the member localities the fold
    // counted — pets whose (province, locality) join ar_localities under this
    // department CODE (the fold's MIN(department_code) group key). NO direct-label
    // arm here: a locality merely NAMED like the department but sitting in a
    // DIFFERENT department must NOT be pulled in (WARNING 3). The code-membership
    // arm already covers a genuine seat locality that shares the department's name
    // (its ar_localities row carries this code), so nothing legitimate is lost.
    if (departmentCode) {
      return sql`EXISTS (
        SELECT 1 FROM ar_localities al
        WHERE al.province_code = ${provinceIsoMapSql(sql`${province}`)}
          AND al.removed_at IS NULL
          AND al.department_code = ${departmentCode}
          AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(localityCol)}
      )`;
    }
    // No department code — a CABA barrio, a locality that resolved no department
    // (fold label = its own name), or a stale client that sent no code. Match the
    // label directly, plus a name-based department fallback so a legacy department
    // drill still resolves its members (accepts the name-ambiguity WARNING 3 flags,
    // which the code path above eliminates whenever the client sends the code).
    return sql`(
      ${normNameSql(localityCol)} = ${normNameSql(sql`${locality}`)}
      OR EXISTS (
        SELECT 1 FROM ar_localities al
        WHERE al.province_code = ${provinceIsoMapSql(sql`${province}`)}
          AND al.removed_at IS NULL
          AND ${normNameSql(sql`al.department_name`)} = ${normNameSql(sql`${locality}`)}
          AND ${normNameSql(sql`al.locality_name`)} = ${normNameSql(localityCol)}
      )
    )`;
  }

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
        // Mirror the choropleth exactly: pets-JOIN attribution + distinct-event
        // count (countDistinct(petEvents.id)) so this k-anon guard suppresses
        // the SAME cells the map does.
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(petEvents.id) })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
          .where(and(...conditions));
        totalCount = row?.n ?? 0;
        break;
      }
      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const [row] = await db
          .select({ n: countDistinct(petEvents.id) })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
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
          unitLocalityFilter(sql`${welfareReports.jurisdictionLocality}`),
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
          // outbreak_signal snapshots the pet's jurisdiction into the payload at
          // signal time (pet_jurisdiction_*, the ONLY event that legitimately does
          // — see petEventsScopeClause jsdoc); it never writes flat province/locality.
          sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
          unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`),
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
        // Mirror the map numerator EXACTLY via metricPredicate('rabies-coverage'):
        // DOGS in scope with a qualifying rabies dose in the trailing-12-month
        // window, narrowed to vet-signed when verifiedOnly (WARNING 2). The prior
        // guard counted ALL doses matching LIKE '%rabi%' over the SCRUBBER window
        // [since, until] — two ways adrift from the map, so with "solo firmado" ON
        // a map-suppressed department could clear k=5 here and be re-identified.
        // The rabies map is trailing-12m regardless of the scrubber, so the window
        // lives INSIDE the predicate; the guard applies no [since, until] clause.
        const conditions: SQL[] = [
          metricPredicate("rabies-coverage", verifiedOnly),
          sql`${pets.jurisdictionProvince} = ${province}`,
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        // countDistinct(pet): the choropleth counts DISTINCT PETS, so one dog with
        // several boosters must not clear k=5 for a cell the map suppressed.
        const [row] = await db
          .select({ n: countDistinct(pets.id) })
          .from(pets)
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
          unitLocalityFilter(sql`${pets.jurisdictionLocality}`),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        // countDistinct(pet): mortality choropleth counts distinct deceased pets.
        const [row] = await db
          .select({ n: countDistinct(petEvents.petId) })
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
    // Build province+locality filter for the outbreak_signal (zoonosis) layer,
    // which snapshots the pet's jurisdiction into pet_jurisdiction_* at signal
    // time (the ONLY event type that legitimately carries these payload keys —
    // see petEventsScopeClause jsdoc). Perdidas/mordeduras use petsJurisdictionFilter.
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
      ];
      if (locality)
        filters.push(unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`));
      return filters;
    }

    // Build province+locality filter for jurisdiction-column based tables
    // (welfare_reports, cases).
    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(localityCol));
      return filters;
    }

    // Build province+locality filter for the pets table.
    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(sql`${pets.jurisdictionLocality}`));
      return filters;
    }

    switch (layer) {
      case "perdidas": {
        // pets-JOIN attribution (payload carries no jurisdiction); synthetic
        // kind reproduces the pet_lost / pet_found_sighting labels from the real
        // event type (status_changed lost vs note_added sighting).
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            kind: perdidasKindExpr(),
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
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
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
          gte(petEvents.occurredAt, since),
          lte(petEvents.occurredAt, until),
          ...petsJurisdictionFilter(),
        ];
        if (scope) conditions.push(sql`(${scope})`);
        const rows = await db
          .select({
            occurredAt: petEvents.occurredAt,
            incidentType: sql<string>`(${petEvents.payload}->>'incident_type')`,
          })
          .from(petEvents)
          .innerJoin(pets, eq(petEvents.petId, pets.id))
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

    // outbreak_signal (zoonosis) snapshots the pet's jurisdiction into
    // pet_jurisdiction_* at signal time — see the queryEvents copy above.
    function payloadJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [
        sql`(${petEvents.payload}->>'pet_jurisdiction_province') = ${province}`,
      ];
      if (locality)
        filters.push(unitLocalityFilter(sql`(${petEvents.payload}->>'pet_jurisdiction_locality')`));
      return filters;
    }

    function columnJurisdictionFilter(provinceCol: SQL, localityCol: SQL): SQL[] {
      const filters: SQL[] = [sql`${provinceCol} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(localityCol));
      return filters;
    }

    function petsJurisdictionFilter(): SQL[] {
      const filters: SQL[] = [sql`${pets.jurisdictionProvince} = ${province}`];
      if (locality) filters.push(unitLocalityFilter(sql`${pets.jurisdictionLocality}`));
      return filters;
    }

    let rows: Array<{ day: string; n: number }> = [];

    switch (layer) {
      case "perdidas": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          perdidasEventPredicate(),
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

      case "mordeduras": {
        const scope = petsScope(actor, jurisdictions);
        const conditions: SQL[] = [
          mordedurasEventPredicate(),
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
