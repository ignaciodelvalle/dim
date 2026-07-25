import { describe, expect, it } from "vitest";

import {
  CHOROPLETH_FADE_MS,
  DIVISION_FADE_MS,
  fillPaintTransition,
} from "./situational-map-config";

/**
 * B1 (map plan) — the choropleth paint transition and its reduced-motion floor.
 *
 * SCOPE OF THESE TESTS: they lock the transition OBJECT and the reduced-motion
 * floor, NOT that the map visibly interpolates. It does not — maplibre snaps
 * data-driven paint, so fill-color-transition is inert for these layers (see
 * the note above CHOROPLETH_FADE_MS). A green suite here must never be read as
 * "the choropleth fades".
 *
 * The floor is the part worth locking in a test: "reduced motion" must mean NO
 * interpolation (duration 0), not "a quicker animation". A future tweak that
 * lowers the animated duration must not be able to quietly satisfy this by
 * making both branches small-but-nonzero.
 */
describe("fillPaintTransition", () => {
  it("interpolates over a perceptible, sub-second window by default", () => {
    // Asserting against CHOROPLETH_FADE_MS would restate the implementation and
    // could never fail (correctness review 2026-07-25). Assert the PROPERTIES
    // that matter instead: long enough for the eye to follow the change, short
    // enough not to lag the operator, and never zero when motion is welcome.
    const { duration, delay } = fillPaintTransition(false);
    expect(duration).toBeGreaterThanOrEqual(150);
    expect(duration).toBeLessThanOrEqual(600);
    expect(delay).toBe(0);
  });

  it("collapses to an instant repaint under reduced motion", () => {
    expect(fillPaintTransition(true)).toEqual({ duration: 0, delay: 0 });
  });

  it("keeps ONE motion vocabulary — data fades match the chrome fade", () => {
    // The division outlines already fade over DIVISION_FADE_MS. A choropleth
    // that fades on a different clock would read as two unrelated animations on
    // the same map. (Definitional today — CHOROPLETH_FADE_MS is DEFINED as
    // DIVISION_FADE_MS — so this locks the DEFINITION against a future edit
    // that gives the fills their own number.)
    expect(CHOROPLETH_FADE_MS).toBe(DIVISION_FADE_MS);
    expect(fillPaintTransition(false).duration).toBe(DIVISION_FADE_MS);
  });
});
