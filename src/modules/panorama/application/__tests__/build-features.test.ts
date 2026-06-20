// Unit tests for the pure perdidas feature transform (no DB).

import { describe, expect, it } from "vitest";

import { type LostPointRow, buildPerdidasFeatures } from "../build-features";

const row = (over: Partial<LostPointRow> = {}): LostPointRow => ({
  publicToken: "DIM-AAAA-1111",
  name: "Firulai",
  species: "dog",
  status: "lost",
  locationLat: "-34.6037000",
  locationLng: "-58.3816000",
  lastSeenAt: "2026-06-19T12:00:00.000Z",
  ...over,
});

describe("buildPerdidasFeatures", () => {
  it("wraps rows into a typed FeatureCollection with [lng, lat] points", () => {
    const fc = buildPerdidasFeatures([row()]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry?.coordinates).toEqual([-58.3816, -34.6037]);
  });

  it("carries the public properties (token/name/species/status/lastSeenAt)", () => {
    const fc = buildPerdidasFeatures([row({ publicToken: "DIM-BBBB-2222", name: "Mishi" })]);
    expect(fc.features[0].properties).toEqual({
      token: "DIM-BBBB-2222",
      name: "Mishi",
      species: "dog",
      status: "lost",
      lastSeenAt: "2026-06-19T12:00:00.000Z",
    });
  });

  it("drops non-located rows (missing coordinate pair) from the point layer", () => {
    const fc = buildPerdidasFeatures([
      row({ publicToken: "ok" }),
      row({ publicToken: "no-lat", locationLat: null }),
      row({ publicToken: "no-lng", locationLng: null }),
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.token).toBe("ok");
  });

  it("returns an empty collection for no rows", () => {
    expect(buildPerdidasFeatures([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
