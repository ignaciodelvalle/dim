import { describe, expect, it } from "vitest";

import {
  CHOROPLETH_FADE_MS,
  DIVISION_FADE_MS,
  fillPaintTransition,
} from "./situational-map-config";

/**
 * B1 (map plan) — the choropleth paint transition and its reduced-motion floor.
 *
 * The floor is the part worth locking in a test: "reduced motion" must mean NO
 * interpolation (duration 0), not "a quicker animation". A future tweak that
 * lowers the animated duration must not be able to quietly satisfy this by
 * making both branches small-but-nonzero.
 */
describe("fillPaintTransition", () => {
  it("interpolates over the map's shared fade cadence by default", () => {
    expect(fillPaintTransition(false)).toEqual({ duration: CHOROPLETH_FADE_MS, delay: 0 });
    expect(CHOROPLETH_FADE_MS).toBeGreaterThan(0);
  });

  it("collapses to an instant repaint under reduced motion", () => {
    expect(fillPaintTransition(true)).toEqual({ duration: 0, delay: 0 });
  });

  it("keeps ONE motion vocabulary — data fades match the chrome fade", () => {
    // The division outlines already fade over DIVISION_FADE_MS. A choropleth
    // that fades on a different clock would read as two unrelated animations on
    // the same map.
    expect(CHOROPLETH_FADE_MS).toBe(DIVISION_FADE_MS);
  });
});
