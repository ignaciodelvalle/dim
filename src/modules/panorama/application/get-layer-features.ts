// Panorama application use-case: resolve a layer's GeoJSON FeatureCollection.
//
// Slice 1 (F1) implemented ONLY "perdidas" by REUSING the tested, scope-aware
// lib/govt-dashboards.fetchLostPets. Slice 2 (F2) adds the remaining 7 layers,
// each backed by a scope-aware reader in infrastructure/repository.ts. The
// (actor, jurisdictions) pair is resolved at the action/route boundary (auth);
// this use-case never widens scope.
//
// Return shape carries an envelope ({ truncated, suppressedCount }) so the
// LayerPanel can surface the per-layer 2.000 cap and k-anon suppression count.

import { type LostPetRow, fetchLostPets } from "@/lib/govt-dashboards";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import {
  type ChoroplethRows,
  type LayerRows,
  loadBiteEvents,
  loadDecomisos,
  loadDenunciaCentroids,
  loadMortality,
  loadOutbreakSignals,
  loadRabiesCoverage,
  loadShelters,
} from "@/src/modules/panorama/infrastructure/repository";

import type { FeatureCollection, LayerId } from "@/src/modules/panorama/domain/types";
import {
  type LostPointRow,
  buildChoroplethFeatures,
  buildDecomisosFeatures,
  buildDenunciasFeatures,
  buildMordedurasFeatures,
  buildPerdidasFeatures,
  buildRefugiosFeatures,
  buildZoonosisFeatures,
} from "./build-features";

/**
 * The active period plus an optional `asOf` upper bound (F4 temporal reproduction).
 * When `asOf` is set, event-windowable layers filter `occurred_at/created_at/
 * opened_at <= asOf` (in addition to `>= since`) so the operator can scrub the
 * situation back in time. Non-temporal layers (refugios + the current-state
 * choropleths) ignore `asOf` — the console dims them while a scrub is active.
 */
export type LayerPeriod = { since: Date; asOf?: Date };

/**
 * The use-case result. `features` is the GeoJSON the map plots; the envelope
 * fields are surfaced by the LayerPanel:
 *  - `truncated`       — the per-layer 2.000 cap clipped the result.
 *  - `suppressedCount` — choropleth cells hidden by k-anon (k=5); 0 otherwise.
 */
export type LayerFeaturesResult = {
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
};

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

const empty = (): LayerFeaturesResult => ({
  features: { type: "FeatureCollection", features: [] },
  truncated: false,
  suppressedCount: 0,
});

/** Wrap a point-layer reader result into the use-case envelope. */
function pointResult<Row>(rows: LayerRows<Row>, features: FeatureCollection): LayerFeaturesResult {
  return { features, truncated: rows.truncated, suppressedCount: 0 };
}

/** Wrap a choropleth reader result into the use-case envelope. */
function choroplethResult(rows: ChoroplethRows): LayerFeaturesResult {
  return {
    features: buildChoroplethFeatures(rows.cells),
    truncated: rows.truncated,
    suppressedCount: rows.suppressedCount,
  };
}

export async function getLayerFeatures(
  layer: LayerId,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: LayerPeriod,
): Promise<LayerFeaturesResult> {
  switch (layer) {
    case "perdidas": {
      // Scope + period enforced inside fetchLostPets (tested). status="lost"
      // matches the perdidas layer's intent (active lost episodes).
      const rows = await fetchLostPets(actor, jurisdictions, {
        since: period.since,
        status: "lost",
      });
      // F4: fetchLostPets only supports a `since` lower bound, so apply the
      // `asOf` upper bound here post-fetch by dropping pets whose most-recent
      // "became lost" event (markedLostAt → lastSeenAt) is after `asOf`. Rows
      // with no markedLostAt have no time anchor and are dropped under a scrub.
      const asOfMs = period.asOf?.getTime();
      const pointRows = rows.map(lostPetToPointRow);
      const windowed =
        asOfMs === undefined
          ? pointRows
          : pointRows.filter(
              (r) => r.lastSeenAt !== null && new Date(r.lastSeenAt).getTime() <= asOfMs,
            );
      return {
        features: buildPerdidasFeatures(windowed),
        truncated: false,
        suppressedCount: 0,
      };
    }
    case "mordeduras": {
      const r = await loadBiteEvents(actor, jurisdictions, period.since, period.asOf);
      return pointResult(r, buildMordedurasFeatures(r.rows));
    }
    case "denuncias": {
      const r = await loadDenunciaCentroids(actor, jurisdictions, period.since, period.asOf);
      return pointResult(r, buildDenunciasFeatures(r.rows));
    }
    case "zoonosis": {
      const r = await loadOutbreakSignals(actor, jurisdictions, period.since, period.asOf);
      return pointResult(r, buildZoonosisFeatures(r.rows));
    }
    case "refugios": {
      // Shelters have no time dimension — period/asOf are not applied. The
      // console dims this layer while a scrub is active (not reproducible in time).
      const r = await loadShelters(actor, jurisdictions);
      return pointResult(r, buildRefugiosFeatures(r.rows));
    }
    case "decomisos": {
      const r = await loadDecomisos(actor, jurisdictions, period.since, period.asOf);
      return pointResult(r, buildDecomisosFeatures(r.rows));
    }
    case "cobertura": {
      // Current-state rollup (EXISTS rabies vaccination) — not event-windowed in
      // v1, so `asOf` is intentionally ignored; the console dims it under a scrub.
      const r = await loadRabiesCoverage(actor, jurisdictions);
      return choroplethResult(r);
    }
    case "mortalidad": {
      // Current-state rollup (pets.status='deceased') — not event-windowed in v1;
      // `asOf` is intentionally ignored; the console dims it under a scrub.
      const r = await loadMortality(actor, jurisdictions);
      return choroplethResult(r);
    }
    default:
      return empty();
  }
}
