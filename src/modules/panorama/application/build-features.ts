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
