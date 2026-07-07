// Panorama application use-case: resolve a layer's GeoJSON FeatureCollection.
//
// F1 Panorama v2: density+signal point layers (perdidas, mordeduras, denuncias,
// zoonosis) are now routed through per-unit aggregation loaders that COUNT(*)
// GROUP BY province or locality. Reference layers (refugios, decomisos) keep
// their discrete-pin path. The toggle axis (level) now drives BOTH choropleth
// layers AND the aggregated point layers.
//
// Return shape carries an envelope ({ truncated, suppressedCount, level }) so
// the LayerPanel can surface the per-layer 2.000 cap and k-anon suppression
// count, and the map knows which render mode to apply.

import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import {
  type AggregatedPointRows,
  type ChoroplethMetric,
  type ChoroplethRows,
  type LayerRows,
  type ProvinceChoroplethRows,
  loadChoroplethByLevel,
  loadDecomisos,
  loadDenunciasByUnit,
  loadMordedurassByUnit,
  loadPerdidasByUnit,
  loadShelters,
  loadZoonosisByUnit,
} from "@/src/modules/panorama/infrastructure/repository";

import type {
  AggregationLevel,
  FeatureCollection,
  LayerId,
} from "@/src/modules/panorama/domain/types";
import {
  buildAggregatedPointFeatures,
  buildChoroplethFeatures,
  buildDecomisosFeatures,
  buildProvinceChoroplethFeatures,
  buildRefugiosFeatures,
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
 * Aggregation axis. Controls both choropleth layers AND the density+signal point
 * layers (F1 Panorama v2). Defaults to "locality". Reference layers ignore it.
 */
export type { AggregationLevel };

/**
 * The use-case result. `features` is the GeoJSON the map plots; the envelope
 * fields are surfaced by the LayerPanel:
 *  - `truncated`       — the per-layer 2.000 cap clipped the result.
 *  - `suppressedCount` — choropleth cells hidden by k-anon (k=5); 0 otherwise.
 *  - `level`           — the aggregation level the features were built at, so
 *                        the map knows whether to fill polygons (province) or
 *                        plot centroids (locality / point layers).
 */
export type LayerFeaturesResult = {
  features: FeatureCollection;
  truncated: boolean;
  suppressedCount: number;
  noLocalityCount: number;
  /** "province" only for a choropleth layer aggregated by province; else "locality". */
  level: AggregationLevel;
};

const empty = (): LayerFeaturesResult => ({
  features: { type: "FeatureCollection", features: [] },
  truncated: false,
  suppressedCount: 0,
  noLocalityCount: 0,
  level: "locality",
});

/**
 * Degraded/empty layer result — an empty FeatureCollection. Used as the
 * withDbBudget fallback on the page + API paths (task #74) so a slow or failing
 * layer fetch renders an empty map instead of hanging the response.
 */
export const emptyLayerFeatures = empty;

/** Wrap a point-layer reader result into the use-case envelope. */
function pointResult<Row>(rows: LayerRows<Row>, features: FeatureCollection): LayerFeaturesResult {
  return {
    features,
    truncated: rows.truncated,
    suppressedCount: 0,
    noLocalityCount: 0,
    level: "locality",
  };
}

/**
 * Wrap an F1 per-unit aggregated point result into the use-case envelope.
 * The `level` carried in the result reflects whether the loader used province
 * or locality grouping so the map knows which renderMode to apply.
 */
function aggregatedPointResult(
  result: AggregatedPointRows,
  level: AggregationLevel,
): LayerFeaturesResult {
  return {
    features: buildAggregatedPointFeatures(result.cells),
    truncated: result.truncated,
    suppressedCount: result.suppressedCount,
    // Point layers aggregate by event coords, not jurisdiction — no residual.
    noLocalityCount: 0,
    level,
  };
}

/** Wrap a LOCALITY choropleth reader result (centroid symbols, k-anon). */
function localityChoroplethResult(rows: ChoroplethRows): LayerFeaturesResult {
  return {
    features: buildChoroplethFeatures(rows.cells),
    truncated: rows.truncated,
    suppressedCount: rows.suppressedCount,
    noLocalityCount: rows.noLocalityCount,
    level: "locality",
  };
}

/** Wrap a PROVINCE choropleth reader result (filled polygons, no k-anon; U5). */
function provinceChoroplethResult(rows: ProvinceChoroplethRows): LayerFeaturesResult {
  return {
    features: buildProvinceChoroplethFeatures(rows.cells),
    truncated: rows.truncated,
    suppressedCount: 0,
    // Province level counts every pet in the province — nothing is invisible.
    noLocalityCount: 0,
    level: "province",
  };
}

/** Resolve a choropleth layer at the requested aggregation level (U5). The
 * metric is fixed per layer id; the level selects province vs locality. */
async function choroplethResult(
  metric: ChoroplethMetric,
  level: AggregationLevel,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerFeaturesResult> {
  if (level === "province") {
    return provinceChoroplethResult(
      await loadChoroplethByLevel(
        metric,
        "province",
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      ),
    );
  }
  return localityChoroplethResult(
    await loadChoroplethByLevel(
      metric,
      "locality",
      actor,
      jurisdictions,
      adminProvince,
      adminLocality,
    ),
  );
}

export async function getLayerFeatures(
  layer: LayerId,
  actor: DashboardActor,
  jurisdictions: DashboardJurisdiction[],
  period: LayerPeriod,
  /**
   * Aggregation axis. For choropleth layers (cobertura, mortalidad): selects
   * province (filled polygons) vs locality (centroid symbols). For density+signal
   * point layers (F1 Panorama v2): selects the GROUP BY granularity for per-unit
   * aggregation. Reference layers (refugios, decomisos) ignore this entirely.
   * Defaults to "locality" (historical / pre-U5 behavior).
   */
  level: AggregationLevel = "locality",
  /**
   * Admin province drill-down (Panorama only). When an ADMIN selects a province
   * via JurisdictionSwitcher, this narrows all layer loaders to that province
   * (and optionally locality). Only applied when actor.role === "admin".
   * Govt actors must NOT pass these — their scope is already enforced by
   * filteredJurisdictions.
   */
  adminProvince?: string,
  adminLocality?: string,
): Promise<LayerFeaturesResult> {
  switch (layer) {
    // -----------------------------------------------------------------------
    // F1: DENSITY point layers — per-unit aggregated (province or locality).
    // The toggle axis now drives the GROUP BY granularity; reference layers keep
    // their discrete-pin path below. Province level has no k-anon; locality
    // level applies suppressSmallCells (k=5).
    // -----------------------------------------------------------------------
    case "perdidas": {
      const r = await loadPerdidasByUnit(
        level,
        actor,
        jurisdictions,
        period.since,
        period.asOf,
        adminProvince,
        adminLocality,
      );
      return aggregatedPointResult(r, level);
    }
    case "mordeduras": {
      const r = await loadMordedurassByUnit(
        level,
        actor,
        jurisdictions,
        period.since,
        period.asOf,
        adminProvince,
        adminLocality,
      );
      return aggregatedPointResult(r, level);
    }
    case "denuncias": {
      // Still COARSE at any level: the exact coordinate never leaves the DB.
      // At locality level, each unit's centroid represents all reports in that
      // locality (no individual coordinates). At province level, the province
      // centroid is used. k-anon applies at locality level only.
      const r = await loadDenunciasByUnit(
        level,
        actor,
        jurisdictions,
        period.since,
        period.asOf,
        adminProvince,
        adminLocality,
      );
      return aggregatedPointResult(r, level);
    }
    // -----------------------------------------------------------------------
    // F1: SIGNAL point layer — per-unit aggregated.
    // -----------------------------------------------------------------------
    case "zoonosis": {
      const r = await loadZoonosisByUnit(
        level,
        actor,
        jurisdictions,
        period.since,
        period.asOf,
        adminProvince,
        adminLocality,
      );
      return aggregatedPointResult(r, level);
    }
    // -----------------------------------------------------------------------
    // REFERENCE layers — discrete pins, unchanged by the toggle axis.
    // Each represents an individual shelter / expediente — aggregating would
    // destroy the identity of each entity.
    // -----------------------------------------------------------------------
    case "refugios": {
      // Shelters have no time dimension — period/asOf are not applied. The
      // console dims this layer while a scrub is active (not reproducible in time).
      const r = await loadShelters(actor, jurisdictions, adminProvince, adminLocality);
      return pointResult(r, buildRefugiosFeatures(r.rows));
    }
    case "decomisos": {
      const r = await loadDecomisos(
        actor,
        jurisdictions,
        period.since,
        period.asOf,
        adminProvince,
        adminLocality,
      );
      return pointResult(r, buildDecomisosFeatures(r.rows));
    }
    // -----------------------------------------------------------------------
    // CHOROPLETH layers (rate/density via lib/metrics rollups).
    // -----------------------------------------------------------------------
    case "cobertura": {
      // Current-state rollup (EXISTS rabies vaccination) — not event-windowed in
      // v1, so `asOf` is intentionally ignored; the console dims it under a scrub.
      // U5: the level selects province (filled polygons, ratePct) vs locality (centroids, count).
      return choroplethResult(
        "rabies-coverage",
        level,
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      );
    }
    case "esterilizacion": {
      // Current-state rollup (EXISTS sterilization_performed) — not event-windowed in
      // v1, so `asOf` is intentionally ignored; the console dims it under a scrub.
      // Province level: ratePct (true percentage, divergent at complianceTarget:70).
      // Locality level: count-density (v1 limitation; rate-by-locality deferred).
      return choroplethResult(
        "sterilization-coverage",
        level,
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      );
    }
    case "mortalidad": {
      // Current-state rollup (pets.status='deceased') — not event-windowed in v1;
      // `asOf` is intentionally ignored; the console dims it under a scrub.
      // U5: the level selects province (filled polygons) vs locality (centroids).
      return choroplethResult(
        "mortality",
        level,
        actor,
        jurisdictions,
        adminProvince,
        adminLocality,
      );
    }
    default:
      return empty();
  }
}
