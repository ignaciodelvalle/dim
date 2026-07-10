import { describe, expect, it } from "vitest";

import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  RAMP_BLUE,
  divergentStops,
  lerpHex,
  sampleStops,
} from "@/lib/analytics/viz-scales";

describe("lerpHex", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("interpolates channels at the midpoint", () => {
    expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps t outside [0,1]", () => {
    expect(lerpHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(lerpHex("#000000", "#ffffff", -1)).toBe("#000000");
  });
});

describe("sampleStops", () => {
  it("clamps to endpoints outside the range", () => {
    const stops: Array<[number, string]> = [
      [0, RAMP_BLUE[0]],
      [100, RAMP_BLUE[1]],
    ];
    expect(sampleStops(stops, -10)).toBe(RAMP_BLUE[0]);
    expect(sampleStops(stops, 200)).toBe(RAMP_BLUE[1]);
  });

  it("evaluates a divergent ramp: below-meta reads warm, above-meta reads cool", () => {
    // CABA-style single-value fill for the inset (#9): a value below the meta must
    // sample the below (amber) side; above the meta, the teal side.
    const stops = divergentStops(80, 0, 100);
    // At the meta it is exactly the neutral midpoint.
    expect(sampleStops(stops, 80)).toBe(COLOR_DIVERGENT_NEUTRAL);
    // Real coverage ~50 sits between below-pole and neutral → not the above pole.
    const below = sampleStops(stops, 50);
    expect(below).not.toBe(COLOR_DIVERGENT_ABOVE);
    // Near the top it trends to the above pole.
    const above = sampleStops(stops, 100);
    expect(above).toBe(COLOR_DIVERGENT_ABOVE);
    expect(COLOR_DIVERGENT_BELOW).toBeTruthy();
  });

  it("returns COLOR_NO_DATA for empty stops", () => {
    expect(sampleStops([], 5)).toBe(COLOR_NO_DATA);
  });
});
