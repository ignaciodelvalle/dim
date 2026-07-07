// Pure transforms: repository rows → typed GeoJSON FeatureCollections, per layer.
//
// Kept separate from the infrastructure repository (the DB layer) so the
// error-prone GeoJSON shaping is unit-testable WITHOUT a database. The
// repository's only job is to SELECT the row shapes these functions consume;
// all coordinate/null/property handling lives here on top of the domain
// geojson helpers.

import { featureCollection, pointFeature } from "@/src/modules/panorama/domain/geojson";
import type { FeatureCollection } from "@/src/modules/panorama/domain/types";

// --- perdidas (lost / sighting point layer) ---------------------------------

/** Row shape the repository must produce for the perdidas layer. lat/lng arrive
 * as strings from postgres numeric(10,7); either may be null. */
export type LostPointRow = {
  publicToken: string;
  name: string;
  species: string;
  status: string;
  locationLat: string | null;
  locationLng: string | null;
  lastSeenAt: string | null;
};

/** GeoJSON feature properties for a perdidas point (no PII beyond the public
 * token + the owner-opt-in last-seen; privacy=none per spec §8). */
export type LostPointProps = {
  token: string;
  name: string;
  species: string;
  status: string;
  lastSeenAt: string | null;
};

/**
 * Build the perdidas FeatureCollection from repository rows. Non-located rows
 * (missing coordinate pair) are dropped — a point layer never emits null
 * geometry. Coordinate order + parsing is handled by the domain pointFeature.
 */
export function buildPerdidasFeatures(
  rows: readonly LostPointRow[],
): FeatureCollection<LostPointProps> {
  const features = rows
    .map((r) =>
      pointFeature<LostPointProps>(r.locationLat, r.locationLng, {
        token: r.publicToken,
        name: r.name,
        species: r.species,
        status: r.status,
        lastSeenAt: r.lastSeenAt,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- mordeduras (bite incident point layer) ---------------------------------

/** Row shape the repository produces for the mordeduras layer. */
export type BiteRow = {
  id: string;
  locationLat: string | null;
  locationLng: string | null;
  /** bite_inflicted | bite_suffered (incident_reported payload). */
  incidentType: string;
  severity: string | null;
  occurredAt: string | null;
};

export type BiteProps = {
  id: string;
  incidentType: string;
  severity: string | null;
  occurredAt: string | null;
};

export function buildMordedurasFeatures(rows: readonly BiteRow[]): FeatureCollection<BiteProps> {
  const features = rows
    .map((r) =>
      pointFeature<BiteProps>(r.locationLat, r.locationLng, {
        id: r.id,
        incidentType: r.incidentType,
        severity: r.severity,
        occurredAt: r.occurredAt,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- denuncias (welfare reports, COARSE locality-centroid) -------------------

/** Row shape the repository produces for the denuncias layer. The coordinate is
 * ALREADY the locality centroid — the exact report coord never reaches here
 * (privacy=coarse, spec §8). */
export type DenunciaCentroidRow = {
  centroidLat: string | null;
  centroidLng: string | null;
  province: string | null;
  locality: string | null;
  severity: string | null;
  kind: string | null;
  createdAt: string | null;
};

export type DenunciaProps = {
  /** Coarse marker — always true; signals the popup must NOT imply a precise spot. */
  coarse: true;
  province: string | null;
  locality: string | null;
  severity: string | null;
  kind: string | null;
  createdAt: string | null;
};

export function buildDenunciasFeatures(
  rows: readonly DenunciaCentroidRow[],
): FeatureCollection<DenunciaProps> {
  const features = rows
    .map((r) =>
      pointFeature<DenunciaProps>(r.centroidLat, r.centroidLng, {
        coarse: true,
        province: r.province,
        locality: r.locality,
        severity: r.severity,
        kind: r.kind,
        createdAt: r.createdAt,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- zoonosis (outbreak_signal point layer) ---------------------------------

export type OutbreakRow = {
  id: string;
  locationLat: string | null;
  locationLng: string | null;
  diseaseCode: string | null;
  diseaseLabel: string | null;
  occurredAt: string | null;
};

export type OutbreakProps = {
  id: string;
  diseaseCode: string | null;
  diseaseLabel: string | null;
  occurredAt: string | null;
};

export function buildZoonosisFeatures(
  rows: readonly OutbreakRow[],
): FeatureCollection<OutbreakProps> {
  const features = rows
    .map((r) =>
      pointFeature<OutbreakProps>(r.locationLat, r.locationLng, {
        id: r.id,
        diseaseCode: r.diseaseCode,
        diseaseLabel: r.diseaseLabel,
        occurredAt: r.occurredAt,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- refugios (shelter organizations point layer) ---------------------------

export type ShelterRow = {
  id: string;
  publicToken: string;
  displayName: string;
  locationLat: string | null;
  locationLng: string | null;
  verified: boolean;
};

export type ShelterProps = {
  token: string;
  name: string;
  verified: boolean;
};

export function buildRefugiosFeatures(
  rows: readonly ShelterRow[],
): FeatureCollection<ShelterProps> {
  const features = rows
    .map((r) =>
      pointFeature<ShelterProps>(r.locationLat, r.locationLng, {
        token: r.publicToken,
        name: r.displayName,
        verified: r.verified,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- decomisos (custody_episode cases point layer) --------------------------

// A case row carries NO point: cases_subject_location_consistency forbids a
// lat/lng on a registered-pet case. So a decomiso plots at its locality
// CENTROID (resolved in the repository from the case jurisdiction) — coarse,
// like denuncias, surfaced as such in the drawer.
export type DecomisoRow = {
  id: string;
  publicCode: string;
  status: string;
  centroidLat: string | null;
  centroidLng: string | null;
  openedAt: string | null;
};

export type DecomisoProps = {
  code: string;
  status: string;
  openedAt: string | null;
  /** Plotted at the locality centroid (the case carries no exact point). */
  coarse: true;
};

export function buildDecomisosFeatures(
  rows: readonly DecomisoRow[],
): FeatureCollection<DecomisoProps> {
  const features = rows
    .map((r) =>
      pointFeature<DecomisoProps>(r.centroidLat, r.centroidLng, {
        code: r.publicCode,
        status: r.status,
        openedAt: r.openedAt,
        coarse: true,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- choropleth (graduated-symbol centroid) layers --------------------------

/**
 * A k-anon-suppressed per-locality rollup cell.
 *
 * The map now HAS division polygons for a single-province scope (CABA barrios in
 * caba-barrios.geojson; departamentos in ar-departments.geojson), so a locality
 * choropleth cell is joined to its division and rendered as a POLYGON FILL when a
 * match exists. The centroid circle is retained ONLY as a fallback for a cell
 * whose locality has no polygon match (e.g. a non-CABA locality with no
 * `departmentCode`, or a name that matched no ar_localities row). `value` is null
 * for suppressed cells (count < k=5) — the real count NEVER leaves the repository
 * for those; a suppressed cell renders as an OUTLINE-only division (no fill) or a
 * muted "suprimido" dot when it falls back to the centroid.
 */
export type ChoroplethCell = {
  key: string;
  province: string;
  locality: string;
  centroidLat: string | null;
  centroidLng: string | null;
  /** INDEC 5-digit department code (ar_localities) — the departamento roll-up
   * join key. Null when the locality had no ar_localities match. Ignored for
   * CABA, where the barrio slug is derived client-side from `locality`. */
  departmentCode: string | null;
  /** Department display name for the division popup/legend (null when unmatched). */
  departmentName: string | null;
  /** The plotted value, or null when the cell is suppressed. */
  value: number | null;
  suppressed: boolean;
};

export type ChoroplethProps = {
  province: string;
  locality: string;
  /** Department roll-up join key (see ChoroplethCell.departmentCode). */
  departmentCode: string | null;
  /** Department display name (null when the locality had no ar_localities match). */
  departmentName: string | null;
  /** Real value for visible cells; null for suppressed ones. */
  value: number | null;
  suppressed: boolean;
};

/**
 * Build a locality-choropleth FeatureCollection. Each cell carries its centroid
 * (the polygon-fill fallback), its department code/name (the departamento
 * roll-up key), and its value/suppressed flag. Cells with no resolvable centroid
 * are dropped (a fully-unlocatable cell can neither fill a polygon nor plot a
 * dot). The map joins these cells to the active province's division polygons —
 * barrios for CABA, departamentos elsewhere — and falls back to the centroid
 * circle for any cell without a polygon match.
 */
export function buildChoroplethFeatures(
  cells: readonly ChoroplethCell[],
): FeatureCollection<ChoroplethProps> {
  const features = cells
    .map((c) =>
      pointFeature<ChoroplethProps>(c.centroidLat, c.centroidLng, {
        province: c.province,
        locality: c.locality,
        departmentCode: c.departmentCode,
        departmentName: c.departmentName,
        value: c.suppressed ? null : c.value,
        suppressed: c.suppressed,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- F1 aggregated point layer (one graduated symbol per administrative unit) -

/**
 * A per-unit aggregation cell for a density or signal point layer (F1).
 *
 * The repository produces one row per (province) or (province, locality) group
 * by executing COUNT(*) over the relevant event table. The centroid resolves
 * from ar_localities for locality-level cells; province-level cells carry the
 * province centroid (or null when no centroid is available for that province).
 *
 * `count` is ALWAYS the real event count — suppression at k=5 is applied before
 * the row reaches this transform for locality-level cells (matching the choropleth
 * path). Province-level cells carry the real count without suppression (province
 * cells are large; same asymmetry as the choropleth province path).
 */
export type AggregatedPointCell = {
  /** Composite key: `"${province}"` at province level, `"${province}|${locality}"` at locality. */
  key: string;
  province: string;
  locality?: string | null;
  /** Latitude of the centroid (province or locality). */
  centroidLat: string | null;
  /** Longitude of the centroid. */
  centroidLng: string | null;
  /** Event count for this unit. For suppressed locality cells this is null
   * (the real count never leaves the repository for k-anon). */
  count: number | null;
  /** True for suppressed locality cells (count < k=5). Province cells are never
   * suppressed. Suppressed cells render muted; their popup says "suprimido". */
  suppressed: boolean;
};

export type AggregatedPointProps = {
  /** The administrative unit label (locality + province, or province alone). */
  place: string;
  province: string;
  locality: string | null;
  /** "province" or "locality" — lets the popup and legend know the aggregation level. */
  level: "province" | "locality";
  /** Event count for this unit; null for k-anon suppressed cells. */
  count: number | null;
  suppressed: boolean;
};

/**
 * Build a graduated-symbol FeatureCollection from per-unit aggregation cells
 * (F1 density+signal layers). One Point feature per unit at its centroid;
 * cells without a resolvable centroid are dropped. Suppressed locality cells keep
 * their location but carry count=null so the map renders them muted.
 *
 * This is the pure-function counterpart to `buildChoroplethFeatures`: identical
 * in shape but driven by event counts rather than pet-state rollups.
 */
export function buildAggregatedPointFeatures(
  cells: readonly AggregatedPointCell[],
): FeatureCollection<AggregatedPointProps> {
  const features = cells
    .map((c) => {
      const level: "province" | "locality" = c.locality != null ? "locality" : "province";
      const place = c.locality != null ? `${c.locality}, ${c.province}` : c.province;
      return pointFeature<AggregatedPointProps>(c.centroidLat, c.centroidLng, {
        place,
        province: c.province,
        locality: c.locality ?? null,
        level,
        count: c.suppressed ? null : c.count,
        suppressed: c.suppressed,
      });
    })
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}

// --- province choropleth (U5: filled polygons, no centroid geometry) ---------

/**
 * A per-PROVINCE rollup cell (U5 aggregation level = province). Unlike the
 * locality cell it carries NO centroid: the map data-joins this to the LOCAL
 * ar-provinces basemap polygons by `provinceCode` and fills them by `value`.
 * Province cells are large, so there is NO k-anon suppression here (spec §U5).
 */
export type ProvinceChoroplethCell = {
  /** ISO 3166-2:AR code, the join key against the basemap polygon `code`. */
  provinceCode: string;
  /** Canonical province display name (popup label). */
  label: string;
  value: number;
};

/**
 * Properties for a province choropleth feature. The geometry is NULL (the fill
 * comes from the basemap polygon, matched by `provinceCode`); this feature is a
 * pure value carrier the SituationalMap reads to build the polygon fill+popup.
 */
export type ProvinceChoroplethProps = {
  provinceCode: string;
  province: string;
  value: number;
  /** Always false at province level (no k-anon); kept for a uniform popup path. */
  suppressed: false;
};

/**
 * Build a province choropleth FeatureCollection. Each cell becomes a feature
 * with NULL geometry — the map colors the matching ar-provinces polygon by
 * `value` (data-join on provinceCode), it does NOT plot a point. Cells with no
 * provinceCode (unmappable province name) are dropped.
 */
export function buildProvinceChoroplethFeatures(
  cells: readonly ProvinceChoroplethCell[],
): FeatureCollection<ProvinceChoroplethProps> {
  const features = cells
    .filter((c) => c.provinceCode.length > 0)
    .map((c) => ({
      type: "Feature" as const,
      geometry: null,
      properties: {
        provinceCode: c.provinceCode,
        province: c.label,
        value: c.value,
        suppressed: false as const,
      },
    }));
  return featureCollection(features);
}
