// Panorama regional camera frames (task #36 fix 5 addendum).
//
// The scroll-navigation chain gains an intermediate level between nación and
// provincia: localidad → provincia → REGIÓN → nación. A "region" here is a
// CAMERA FRAME ONLY — never a data/authorization scope. The jurisdiction fence
// stays province/locality-based; scrolling IN from a region picks the province
// at the viewport centre and THAT commits the data scope as usual. A region view
// simply frames the camera over a group of provinces while the committed data
// scope is unchanged (national for admin).
//
// Taxonomy is PO-indicative (flagged for post-hoc ratification): four regions
// covering all 24 jurisdictions (23 provinces + CABA). Pure — no map, no DOM —
// so the bbox math is unit-testable.

import { type Bbox, bboxesIntersect } from "@/components/panorama/situational-map-utils";
import type { ProvinceBbox } from "@/components/panorama/situational-map-utils";

export type RegionId = "norte" | "cuyo" | "centro" | "patagonia";

export type RegionDef = {
  id: RegionId;
  label: string;
  /** ISO 3166-2:AR province codes that make up the region. */
  provinces: readonly string[];
};

// The four regions. Every one of the 24 jurisdictions appears in exactly one.
export const PANORAMA_REGIONS: readonly RegionDef[] = [
  {
    id: "norte",
    label: "Norte",
    // NOA + NEA.
    provinces: [
      "AR-Y", // Jujuy
      "AR-A", // Salta
      "AR-T", // Tucumán
      "AR-K", // Catamarca
      "AR-G", // Santiago del Estero
      "AR-F", // La Rioja
      "AR-P", // Formosa
      "AR-H", // Chaco
      "AR-W", // Corrientes
      "AR-N", // Misiones
    ],
  },
  {
    id: "cuyo",
    label: "Cuyo",
    provinces: [
      "AR-M", // Mendoza
      "AR-J", // San Juan
      "AR-D", // San Luis
    ],
  },
  {
    id: "centro",
    label: "Centro",
    provinces: [
      "AR-X", // Córdoba
      "AR-S", // Santa Fe
      "AR-E", // Entre Ríos
      "AR-L", // La Pampa
      "AR-B", // Buenos Aires
      "AR-C", // CABA
    ],
  },
  {
    id: "patagonia",
    label: "Patagonia",
    // AR-V (Tierra del Fuego) carries the Malvinas / South Atlantic claim rings
    // (Ley 26.651), so a bbox union over member provinces' full geometries covers
    // Malvinas automatically — verify the frame visually.
    provinces: [
      "AR-Q", // Neuquén
      "AR-R", // Río Negro
      "AR-U", // Chubut
      "AR-Z", // Santa Cruz
      "AR-V", // Tierra del Fuego (incl. Malvinas)
    ],
  },
] as const;

const REGION_BY_PROVINCE: ReadonlyMap<string, RegionId> = new Map(
  PANORAMA_REGIONS.flatMap((r) => r.provinces.map((p) => [p, r.id] as const)),
);

/** The region a province belongs to, or null when the code is unknown. */
export function regionForProvince(provinceCode: string | null): RegionId | null {
  if (provinceCode === null) return null;
  return REGION_BY_PROVINCE.get(provinceCode) ?? null;
}

/** The region definition for an id, or null. */
export function regionById(id: RegionId | null): RegionDef | null {
  if (id === null) return null;
  return PANORAMA_REGIONS.find((r) => r.id === id) ?? null;
}

/**
 * The bounding box that frames a region: the union of its member provinces'
 * bboxes. Returns null when no member province bbox is available yet (basemap
 * not loaded). Members missing from `provinceBboxes` are skipped — the union
 * over whatever IS present still frames the region reasonably.
 */
export function regionBboxUnion(
  region: RegionId,
  provinceBboxes: readonly ProvinceBbox[],
): Bbox | null {
  const members = new Set(regionById(region)?.provinces ?? []);
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let seen = false;
  for (const p of provinceBboxes) {
    if (!members.has(p.code)) continue;
    const [[wLng, sLat], [eLng, nLat]] = p.bbox;
    if (wLng < minLng) minLng = wLng;
    if (sLat < minLat) minLat = sLat;
    if (eLng > maxLng) maxLng = eLng;
    if (nLat > maxLat) maxLat = nLat;
    seen = true;
  }
  if (!seen) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

// MED 9 (adversarial QA 2026-07-11): provinces whose polygon bbox carries a
// FAR-EAST insular claim ring. Tierra del Fuego (AR-V) includes the Malvinas /
// South Atlantic islands (Ley 26.651), which sit ~5° of open ocean east of the
// continental Patagonian coast. That extent is CORRECT for hit-testing and MUST
// stay rendered on the map — but folding it into the region CAMERA frame stretches
// the shot east over empty water, pushing the mainland off-centre and making
// Patagonia read almost national. So the frame (and ONLY the frame) caps its east
// edge to the continental members; the claim geometry is never clipped from the map.
const CLAIM_RING_PROVINCES: ReadonlySet<string> = new Set(["AR-V"]);

/**
 * The CAMERA frame bbox for a region — the member union, but with its eastern
 * longitude capped at the continental (non-claim-ring) members so a far-east
 * insular claim (Malvinas via AR-V) does not unbalance the shot. Identical to
 * `regionBboxUnion` for every region with no claim-ring member. Ley 26.651: the
 * claim stays VISIBLE on the map — only the camera framing is tuned. Returns null
 * when no member bbox is loaded yet (same contract as `regionBboxUnion`).
 */
export function regionFrameBbox(
  region: RegionId,
  provinceBboxes: readonly ProvinceBbox[],
): Bbox | null {
  const full = regionBboxUnion(region, provinceBboxes);
  if (full === null) return full;
  const members = new Set(regionById(region)?.provinces ?? []);
  // The easternmost edge among CONTINENTAL members (claim-ring provinces excluded).
  let continentalEast = Number.NEGATIVE_INFINITY;
  for (const p of provinceBboxes) {
    if (!members.has(p.code) || CLAIM_RING_PROVINCES.has(p.code)) continue;
    const east = p.bbox[1][0];
    if (east > continentalEast) continentalEast = east;
  }
  // No continental member loaded (never for the current taxonomy — Patagonia has
  // four) → keep the full union rather than collapse the frame to nothing.
  if (!Number.isFinite(continentalEast)) return full;
  const [[wLng, sLat], [eLng, nLat]] = full;
  return [
    [wLng, sLat],
    [Math.min(eLng, continentalEast), nLat],
  ];
}

/**
 * The region whose framed bbox contains a point (lng/lat) — used to pick the
 * region under the viewport centre when scrolling IN from the national view.
 * Falls back to the region of the NEAREST member province (by bbox-centroid
 * distance) when no union contains the point — this keeps zoom-in responsive at
 * the edges and, critically, when the viewport centre lands in water (e.g. a
 * wide Patagonia∪Malvinas frame whose geometric centre falls in the South
 * Atlantic — MED 8: the previous null-return wedged wheel-IN there). Returns
 * null ONLY when no province bboxes are loaded yet (basemap still fetching).
 */
export function regionAtPoint(
  point: [number, number],
  provinceBboxes: readonly ProvinceBbox[],
): RegionId | null {
  const [lng, lat] = point;
  const pointBbox: Bbox = [
    [lng, lat],
    [lng, lat],
  ];
  for (const region of PANORAMA_REGIONS) {
    const union = regionBboxUnion(region.id, provinceBboxes);
    if (union && bboxesIntersect(union, pointBbox)) return region.id;
  }
  // Nearest-member fallback (doc promise, now honoured): pick the region of the
  // province whose bbox centroid is closest to the point. Squared Euclidean in
  // lng/lat is fine here — we only compare distances, never report one.
  let nearestRegion: RegionId | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const p of provinceBboxes) {
    const region = regionForProvince(p.code);
    if (region === null) continue;
    const [[wLng, sLat], [eLng, nLat]] = p.bbox;
    const cLng = (wLng + eLng) / 2;
    const cLat = (sLat + nLat) / 2;
    const dLng = cLng - lng;
    const dLat = cLat - lat;
    const dist = dLng * dLng + dLat * dLat;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestRegion = region;
    }
  }
  return nearestRegion;
}

// ---------------------------------------------------------------------------
// Semantic scroll navigation — the 4-level hierarchy chain (task #36 fix 5)
// ---------------------------------------------------------------------------
//
// Wheel/pinch becomes hierarchy navigation with snap, replacing freeform zoom:
//   OUT:  localidad → provincia → REGIÓN → nación
//   IN:   nación → REGIÓN → provincia
// Each committed level snaps the camera to its canonical framed view ("una vista
// fija que se vea perfecta"). Region focus is CAMERA-ONLY (national data scope);
// province/locality are the real data scopes. Pure state machine — the component
// executes the transition (commitScopeDrill + fitBounds).

export type NavState = {
  /** Committed province data scope, or null (national). */
  province: string | null;
  /** Committed locality data scope, or null. */
  locality: string | null;
  /** Region CAMERA focus — only meaningful at national data scope (province null). */
  region: RegionId | null;
};

/**
 * The next nav state for a scroll step, or null when the scroll is a no-op
 * (already at the top going out, already at a data scope going in, or nothing to
 * pick under the viewport centre). The component diffs the result against the
 * current state: a province/locality change is committed via commitScopeDrill; a
 * region change is a camera focus only; then the camera snaps to `frameForNavState`.
 *
 * @param provinceAtCenter  province code under the viewport centre (component
 *   hit-tests provinceBboxes) — consumed only on a région→provincia zoom-in.
 * @param regionAtCenter    region under the viewport centre — consumed only on a
 *   nación→región zoom-in.
 */
export function resolveScrollNav(params: {
  current: NavState;
  direction: "in" | "out";
  provinceAtCenter: string | null;
  regionAtCenter: RegionId | null;
}): NavState | null {
  const { current, direction, provinceAtCenter, regionAtCenter } = params;

  if (direction === "out") {
    // localidad → provincia (drop the locality, keep the province scope).
    if (current.locality != null) {
      return { province: current.province, locality: null, region: null };
    }
    // provincia → región (return to national data, focus the province's region).
    if (current.province != null) {
      return { province: null, locality: null, region: regionForProvince(current.province) };
    }
    // región → nación.
    if (current.region != null) {
      return { province: null, locality: null, region: null };
    }
    return null; // already national, nothing above.
  }

  // direction === "in"
  // A committed province does NOT auto-commit a locality on zoom-in (localities
  // are click-drilled); free zoom handles divisions/labels below.
  if (current.province != null) return null;
  // región → provincia: commit the province under the viewport centre.
  if (current.region != null) {
    if (provinceAtCenter == null) return null;
    return { province: provinceAtCenter, locality: null, region: null };
  }
  // nación → región: focus the region under the viewport centre.
  if (regionAtCenter == null) return null;
  return { province: null, locality: null, region: regionAtCenter };
}

/**
 * The canonical camera bbox for a nav state: locality is framed by the component
 * (centroid), so this covers province → its bbox, region → its member union,
 * national → the national bbox. Falls back to the national bbox when a
 * province/region bbox is not yet available.
 */
export function frameForNavState(
  state: NavState,
  provinceBboxes: readonly ProvinceBbox[],
  nationalBbox: Bbox,
): Bbox {
  if (state.province != null) {
    return provinceBboxes.find((p) => p.code === state.province)?.bbox ?? nationalBbox;
  }
  if (state.region != null) {
    // MED 9: the CAMERA frame caps far-east insular claims (Malvinas via AR-V) so
    // Patagonia frames tight over the continent — the claim stays on the map.
    return regionFrameBbox(state.region, provinceBboxes) ?? nationalBbox;
  }
  return nationalBbox;
}
