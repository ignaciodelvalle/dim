import { describe, expect, it } from "vitest";

import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  RAMP_BLUE,
  RAMP_BLUE_DARK,
  SCALE_BLUE_DARK_SEQ,
  divergentStops,
  lerpHex,
  sampleStops,
} from "@/lib/analytics/viz-scales";

/** WCAG relative-luminance of an `#rrggbb` color (0..1). */
function relLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = chan((n >> 16) & 0xff);
  const g = chan((n >> 8) & 0xff);
  const b = chan(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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

/** WCAG contrast ratio between two `#rrggbb` colors. */
function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("COLOR_DIVERGENT_ABOVE (CVD margin fix)", () => {
  // Night-1 dataviz audit: teal-600 (#0d9488) measured ΔE 10.7 vs the neutral
  // slate under deuteranopia simulation — inside the marginal 8-12 band. The
  // fix (validated with dataviz's validate_palette.js) clears ΔE 18.3 while
  // holding contrast against the navy map canvas. This test locks the navy
  // contrast half of that guarantee so a future edit can't silently regress
  // it back below WCAG's 3:1 non-text floor; re-run validate_palette.js for
  // the CVD half whenever this constant changes.
  const NAVY_MAP_CANVAS = "#0b1020";

  it("holds at least 3:1 contrast against the navy map canvas", () => {
    expect(contrastRatio(COLOR_DIVERGENT_ABOVE, NAVY_MAP_CANVAS)).toBeGreaterThanOrEqual(3);
  });

  it("is not the pre-fix teal-600 that measured ΔE 10.7 (marginal CVD band)", () => {
    expect(COLOR_DIVERGENT_ABOVE.toLowerCase()).not.toBe("#0d9488");
  });
});

describe("RAMP_BLUE_DARK (dark situation-room map ramp)", () => {
  it("increases luminance from low to high value (bright = high signal)", () => {
    // The dark-map rule: the strongest signal must be the BRIGHTEST cell, so
    // relative luminance must strictly increase across the 5-stop scale. The old
    // white-paper RAMP_BLUE did the opposite (light = low), sinking hot cells
    // into the navy canvas.
    const lums = SCALE_BLUE_DARK_SEQ.map(relLuminance);
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeGreaterThan(lums[i - 1]);
    }
    // The two-stop ramp shares the scale's endpoints.
    expect(RAMP_BLUE_DARK[0]).toBe(SCALE_BLUE_DARK_SEQ[0]);
    expect(RAMP_BLUE_DARK[1]).toBe(SCALE_BLUE_DARK_SEQ[SCALE_BLUE_DARK_SEQ.length - 1]);
  });

  it("keeps the low anchor brighter than the no-data slate (low signal ≠ empty)", () => {
    // A "low signal" cell must not read as darker than a genuine no-data cell,
    // or the operator would misread it as less-than-nothing.
    expect(relLuminance(RAMP_BLUE_DARK[0])).toBeGreaterThan(relLuminance(COLOR_NO_DATA));
  });

  it("inverts the white-paper RAMP_BLUE's luminance order", () => {
    // Sanity: the light-surface ramp still goes bright→dark (unchanged), while
    // the dark-surface ramp goes dark→bright.
    expect(relLuminance(RAMP_BLUE[0])).toBeGreaterThan(relLuminance(RAMP_BLUE[1]));
    expect(relLuminance(RAMP_BLUE_DARK[0])).toBeLessThan(relLuminance(RAMP_BLUE_DARK[1]));
  });
});
