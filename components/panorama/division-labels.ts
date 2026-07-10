// Pure helper for the drill-level place labels (task #64).
//
// At department/barrio drill there was not a single place NAME on the map — the
// operator could orient only by hovering. This computes a representative label
// anchor (the geometry's bounding-box center) per division polygon so the map can
// render a subtle NAME at each division.
//
// WHY a bbox center + HTML markers rather than a MapLibre `symbol`/`text-field`
// layer: SituationalMap ships NO glyph server (a deliberate privacy-architecture
// constraint — see the file's top docblock: "we ship no glyph server, map layers
// carry NO on-canvas text; counts and details are surfaced via HTML"). A symbol
// layer's `text-field` renders NOTHING without glyphs, so the honest in-repo path
// is HTML text anchored to a lng/lat (maplibregl.Marker auto-repositions it). This
// helper stays PURE (no maplibre, no DOM) so the anchor math is unit-testable; the
// map wires the markers.

/** A place-label anchor: the division code, its display name, and a lng/lat. */
export type DivisionLabelAnchor = { code: string; name: string; lng: number; lat: number };

/** Minimal division feature shape (raw GeoJSON from the departments/barrios files).
 * `geometry` is typed `unknown` because it comes from untyped GeoJSON — bboxCenter
 * narrows it at runtime. */
type MinimalFeature = {
  geometry?: unknown;
  properties?: { code?: unknown; name?: unknown } | null;
};

/**
 * The bounding-box CENTER of a polygon/multipolygon geometry, or null when the
 * geometry is absent, an unsupported type, or has no finite coordinates. A bbox
 * center is cheap and stable; for the compact, mostly-convex administrative
 * divisions it lands inside (or very near) the shape, which is all a subtle label
 * needs — it is an anchor, not a centroid guarantee.
 */
export function bboxCenter(geometry: unknown): [number, number] | null {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let seen = false;

  const visit = (pt: unknown): void => {
    if (!Array.isArray(pt)) return;
    const lng = pt[0];
    const lat = pt[1];
    if (typeof lng !== "number" || typeof lat !== "number") return;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
    seen = true;
  };

  if (typeof geometry !== "object" || geometry === null) return null;
  const g = geometry as { type?: unknown; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    for (const ring of g.coordinates as number[][][]) for (const pt of ring) visit(pt);
  } else if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    for (const poly of g.coordinates as number[][][][])
      for (const ring of poly) for (const pt of ring) visit(pt);
  } else {
    return null;
  }
  if (!seen) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Build label anchors for the division features that carry BOTH a `code` and a
 * `name`. Features with no resolvable center, code, or name are skipped (no label
 * rather than a mispositioned one).
 */
export function divisionLabelAnchors(features: readonly MinimalFeature[]): DivisionLabelAnchor[] {
  const out: DivisionLabelAnchor[] = [];
  for (const f of features) {
    const code = f.properties?.code;
    const name = f.properties?.name;
    if (typeof code !== "string" || code.length === 0) continue;
    if (typeof name !== "string" || name.length === 0) continue;
    const center = bboxCenter(f.geometry);
    if (center === null) continue;
    out.push({ code, name, lng: center[0], lat: center[1] });
  }
  return out;
}
