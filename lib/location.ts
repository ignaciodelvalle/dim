// Location accessor layer.
//
// App code MUST NOT read pet_events.locationLat / pet_events.locationLng or
// welfare_reports.locationLat / welfare_reports.locationLng directly. Use the
// helpers in this file. This is the single swap point for the future PostGIS
// migration: today readPoint pulls two `numeric(10,7)` columns; the day we
// add `location_point geography(Point, 4326)` and drop the lat/lng pair, the
// signature stays the same and only the body changes.
//
// Why numeric and not float8?
//   - `numeric(10,7)` gives exact decimal storage to 7 decimal places (~1cm
//     resolution), comfortably enough for "where did I last see my pet?"
//     and "vet visit GPS pin".
//   - Drizzle returns `numeric` columns as JS `string` so reads need a
//     deliberate Number() conversion. Doing it in one place catches the
//     well-known traps: `Number(null) === 0`, `Number("") === 0`,
//     `Number("not a number") === NaN`. None of those should ever look like
//     a real coordinate.

export type Point = { lat: number; lng: number };

// ---------------------------------------------------------------------------
// Column mapping — used by readPoint/writePoint to support alternate column
// families during the P3 convergence window. The default mapping targets the
// canonical columns (location_lat / location_lng). Pass a custom mapping when
// reading/writing the legacy families while they're still in use.
// ---------------------------------------------------------------------------

export type ColumnMapping = {
  lat: string;
  lng: string;
};

/** Default canonical columns (location_lat / location_lng). */
const DEFAULT_COLUMNS: ColumnMapping = { lat: "locationLat", lng: "locationLng" } as const;

/** Legacy cases columns (primary_location_lat / primary_location_lng). */
export const CASE_PRIMARY_COLUMNS = {
  lat: "primaryLocationLat",
  lng: "primaryLocationLng",
} as const;

/** Legacy organizations columns (latitude / longitude). */
export const ORG_LEGACY_COLUMNS = {
  lat: "latitude",
  lng: "longitude",
} as const;

/**
 * Read a {@link Point} from a row, using the given column mapping (defaults
 * to the canonical `locationLat`/`locationLng` columns). The source values
 * may be `null`, a numeric string (e.g. `"-34.6083000"`), or a number. Any
 * NaN, Infinity, or empty-string value returns `null` rather than silently
 * pretending to be `0,0` (which would map to the middle of the Atlantic).
 *
 * One-arg form (`readPoint(row)`) is unchanged from before — all existing
 * callers continue to work without modification.
 */
export function readPoint(row: Record<string, unknown>, columns?: ColumnMapping): Point | null {
  const { lat: latKey, lng: lngKey } = columns ?? DEFAULT_COLUMNS;
  const lat = coerce(row[latKey]);
  const lng = coerce(row[lngKey]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

/**
 * Convert a {@link Point} (or `null`) to the shape Drizzle expects when
 * writing into `numeric(10,7)` columns. Numeric values must be passed as
 * strings to avoid silent precision loss; the `toFixed(7)` truncation keeps
 * the value within the column's declared scale.
 *
 * Pass `null` to clear both columns (e.g. when erasing a previously stored
 * point). Pass a column mapping to target an alternate column family during
 * the convergence window; defaults to the canonical `locationLat`/`locationLng`.
 *
 * One-arg form (`writePoint(point)`) preserves the original return type
 * `{ locationLat: string | null; locationLng: string | null }` so all
 * existing callers that destructure those keys are unchanged.
 */
export function writePoint(point: Point | null): {
  locationLat: string | null;
  locationLng: string | null;
};
export function writePoint(
  point: Point | null,
  columns: ColumnMapping,
): Record<string, string | null>;
export function writePoint(
  point: Point | null,
  columns?: ColumnMapping,
): { locationLat: string | null; locationLng: string | null } | Record<string, string | null> {
  const { lat: latKey, lng: lngKey } = columns ?? DEFAULT_COLUMNS;
  if (!point) return { [latKey]: null, [lngKey]: null };
  // Guard against NaN / Infinity — Postgres would reject "NaN" with an
  // invalid_text_representation error far from the call site. Caller-side
  // validation is the first line of defense; this is defense in depth so
  // every future caller doesn't have to remember the precondition.
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error(
      `writePoint requires finite coordinates, got lat=${point.lat}, lng=${point.lng}`,
    );
  }
  return {
    [latKey]: point.lat.toFixed(7),
    [lngKey]: point.lng.toFixed(7),
  };
}

export function coerce(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  // Reject empty strings explicitly — Number("") is 0, which would otherwise
  // pass the isFinite check and look like a valid coordinate.
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
