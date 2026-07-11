import { describe, expect, it } from "vitest";

import {
  COLOR_DIVERGENT_ABOVE,
  COLOR_DIVERGENT_BELOW,
  COLOR_DIVERGENT_NEUTRAL,
  COLOR_NO_DATA,
  RAMP_BLUE,
  SCALE_BLUE_SEQ,
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

describe("RAMP_BLUE (white-paper light-surface ramp)", () => {
  it("goes bright→dark (low value = near-white, high value = dark navy)", () => {
    // The light-surface rule: low signal is near-white, high signal is dark.
    // v2C's light console uses SCALE_BLUE_SEQ (same orientation); the retired
    // dark skin's inverted blue→cyan ramp is gone.
    expect(relLuminance(RAMP_BLUE[0])).toBeGreaterThan(relLuminance(RAMP_BLUE[1]));
  });
});

describe("COLOR_NO_DATA (light-canvas no-data neutral)", () => {
  // v2C flipped the operator map to the LIGHT canvas (dark skin retired). The
  // active choropleth ramp is now SCALE_BLUE_SEQ (bright→dark). No-data must not
  // be confusable with a real value.
  it("is distinct from the palest data class (empty ≠ low signal)", () => {
    expect(COLOR_NO_DATA.toLowerCase()).not.toBe(SCALE_BLUE_SEQ[0].toLowerCase());
  });

  it("stays lighter than the mid class so empty never reads as high signal", () => {
    // On a light choropleth the confusion inverts vs the old navy canvas: a DARK
    // no-data fill would read as a HIGH value. Keep no-data lighter than the
    // ramp's mid class; the neutral (achromatic) hue separates it from the pale
    // low class.
    expect(relLuminance(COLOR_NO_DATA)).toBeGreaterThan(relLuminance(SCALE_BLUE_SEQ[2]));
  });
});
