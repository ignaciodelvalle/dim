// lib/ui/map-bounds.ts — Framework-agnostic, CLIENT-SAFE map-bounds helpers
// (map-QOL P0 primitive). No React and — critically — no server imports here:
// this module is imported by client map components (SituationalMap,
// StaticFirstMap hosts), so it must never pull in lib/infra/gov-scope.ts
// (DB-bound via db/index.ts — a webpack build error in any client bundle).
// The server-side bridge to jurisdictionBounds lives in
// lib/ui/map-bounds.server.ts.
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
