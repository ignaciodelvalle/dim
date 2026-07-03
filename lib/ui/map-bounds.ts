// lib/ui/map-bounds.ts — Framework-agnostic map-bounds helpers (map-QOL P0
// primitive). No React import here on purpose: these helpers are consumed by
// both plain MapLibre-mounting effects (components/maps/StaticFirstMap.tsx)
// and, in a later map-QOL commit, PanoramaConsole's map wiring.
//
// AR_BBOX — Argentina's national bounding box, in the SAME
// [[minLng,minLat],[maxLng,maxLat]] order lib/infra/gov-scope.ts's
// jurisdictionBounds/computeBounds already return (MapLibre `fitBounds`
// bbox order) — so callers never need to reorder coordinates between the two
// modules.
//
// fitBoundsOptions — generalizes the padding/maxZoom pair
// components/charts/MapChoropleth.tsx's auto-fitBounds call already hardcodes
// (`{ padding: 24, animate: false, maxZoom: 9 }`) into one reusable, tuned
// default so later map-QOL callers don't re-guess these numbers per component.
//
// boundsForScope — bridges lib/infra/gov-scope.ts's DB-bound
// `jurisdictionBounds` with a national fallback: callers always get a usable
// bbox, even for admin's universal scope (empty jurisdictions → null) or a
// govt viewer whose assignments resolve to no centroids.

import { type DashboardJurisdiction, jurisdictionBounds } from "@/lib/infra/gov-scope";

/** A MapLibre-style bounding box: [[minLng,minLat],[maxLng,maxLat]]. */
export type Bbox = [[number, number], [number, number]];

/**
 * Argentina's national bounding box (continental + islands), MapLibre bbox
 * order. Widely-cited extremes: SW ≈ (-73.6, -55.1), NE ≈ (-53.6, -21.8)
 * (https://en.wikipedia.org/wiki/Argentina — Extreme points).
 */
export const AR_BBOX: Bbox = [
  [-73.6, -55.1],
  [-53.6, -21.8],
];

export type FitBoundsOptions = {
  padding: number;
  maxZoom: number;
  animate: boolean;
};

/**
 * Builds a consistent MapLibre `map.fitBounds(bbox, options)` options object.
 * Defaults mirror MapChoropleth.tsx's existing auto-fitBounds call (padding:
 * 24, maxZoom: 9, animate: false) — pass a partial override for a caller that
 * needs a different value, everything else stays on the shared default.
 */
export function fitBoundsOptions(opts?: Partial<FitBoundsOptions>): FitBoundsOptions {
  return {
    padding: opts?.padding ?? 24,
    maxZoom: opts?.maxZoom ?? 9,
    animate: opts?.animate ?? false,
  };
}

/**
 * Resolves a MapLibre bbox to fit for the given jurisdictions, falling back
 * to AR_BBOX when jurisdictionBounds returns null (admin universal scope, or
 * a govt viewer whose assignments have no resolvable centroids) — callers
 * always get a usable bbox, never null.
 */
export async function boundsForScope(jurisdictions: DashboardJurisdiction[]): Promise<Bbox> {
  const bounds = await jurisdictionBounds(jurisdictions);
  return bounds ?? AR_BBOX;
}
