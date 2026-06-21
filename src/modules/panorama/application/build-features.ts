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
 * A k-anon-suppressed per-locality rollup cell. We have NO locality polygons, so
 * the "choropleth" renders as a graduated/colored centroid circle. `value` is
 * null for suppressed cells (count < k=5) — the real count NEVER leaves the
 * repository for those; the map renders them in a muted "suprimido" style.
 */
export type ChoroplethCell = {
  key: string;
  province: string;
  locality: string;
  centroidLat: string | null;
  centroidLng: string | null;
  /** The plotted value, or null when the cell is suppressed. */
  value: number | null;
  suppressed: boolean;
};

export type ChoroplethProps = {
  province: string;
  locality: string;
  /** Real value for visible cells; null for suppressed ones. */
  value: number | null;
  suppressed: boolean;
};

/**
 * Build a graduated-symbol FeatureCollection from suppressed rollup cells. Cells
 * without a resolvable centroid are dropped (no coordinate to plot). Suppressed
 * cells keep their location but carry value=null + suppressed=true so the map
 * renders them muted and the popup shows "suprimido" instead of a count.
 */
export function buildChoroplethFeatures(
  cells: readonly ChoroplethCell[],
): FeatureCollection<ChoroplethProps> {
  const features = cells
    .map((c) =>
      pointFeature<ChoroplethProps>(c.centroidLat, c.centroidLng, {
        province: c.province,
        locality: c.locality,
        value: c.suppressed ? null : c.value,
        suppressed: c.suppressed,
      }),
    )
    .filter((f) => f.geometry !== null);
  return featureCollection(features);
}
