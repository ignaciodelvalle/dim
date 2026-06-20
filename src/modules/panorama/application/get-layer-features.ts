// Panorama application use-case: resolve a layer's GeoJSON FeatureCollection.
//
// F1 implements the "perdidas" layer by REUSING the existing tested, scope-aware
// lib/govt-dashboards.fetchLostPets — the jurisdiction scope guard is INHERITED
// from tested code, not re-implemented here. The (actor, jurisdictions) pair is
// resolved at the action/route boundary (auth); this use-case never widens
// scope. Other v1 layers (declared in the domain registry) return an empty
// collection until their F2 loaders land, keeping the API uniform.

import { type LostPetRow, fetchLostPets } from "@/lib/govt-dashboards";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import type { FeatureCollection, LayerId } from "@/src/modules/panorama/domain/types";
import { type LostPointRow, buildPerdidasFeatures } from "./build-features";

export type LayerPeriod = { since: Date };

/** Adapt a scoped LostPetRow to the pure transform's row contract. */
function lostPetToPointRow(p: LostPetRow): LostPointRow {
  return {
    publicToken: p.petPublicToken,
    name: p.petName,
    species: p.species,
    status: p.petStatus,
    locationLat: p.lastSeenLat === null ? null : String(p.lastSeenLat),
    locationLng: p.lastSeenLng === null ? null : String(p.lastSeenLng),
    lastSeenAt: p.markedLostAt ? p.markedLostAt.toISOString() : null,
  };
}

export async function getLayerFeatures(
  layer: LayerId,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: LayerPeriod,
): Promise<FeatureCollection> {
  switch (layer) {
    case "perdidas": {
      // Scope + period enforced inside fetchLostPets (tested). status="lost"
      // matches the perdidas layer's intent (active lost episodes).
      const rows = await fetchLostPets(actor, jurisdictions, {
        since: period.since,
        status: "lost",
      });
      return buildPerdidasFeatures(rows.map(lostPetToPointRow));
    }
    default:
      // F2 layers (mordeduras, denuncias, zoonosis, refugios, decomisos,
      // cobertura, mortalidad) are declared in the registry but not yet loaded.
      return { type: "FeatureCollection", features: [] };
  }
}
