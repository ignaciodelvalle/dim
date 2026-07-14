// Bivariate palette — LIGHT-canvas CVD + contrast validation (design §8 fork #2).
//
// The design doc gated P3 on re-validating BIVARIATE_PALETTE for color-vision
// deficiency on the light v2C canvas; P3/P4a shipped without it. This file IS
// that validation, measured 2026-07-14 with Machado et al. (2009) severity-1.0
// simulation in linear RGB + CIE76 deltaE:
//
//   CURRENT palette (validated on the RETIRED dark navy canvas):
//     - contrast vs land (#eef1f4): two teal cells at 2.36/2.42 — BELOW the
//       WCAG 1.4.11 3:1 non-text floor; the RISK corner at 2.93.
//     - PROTANOPIA: min all-pairs dE 3.8 — and the confused pair is the RISK
//       corner vs a calm teal, i.e. the alarm/calm distinction the encoding
//       exists to carry. Deuteranopia min 3.9.
//
//   CANDIDATE palette (hill-climbed over Lab targets, hue families preserved:
//   slate→teal coverage axis, dim→hot signal axis, crimson RISK corner):
//     - every cell ≥ 3.19:1 vs land; normal-vision min dE 13.2;
//     - protanopia min 9.4 / deuteranopia min 9.4 (all pairs);
//     - RISK vs the calm teals ≥ 18.9 under both simulations.
//
// The palette swap changes the PO's favorite visualization — it is PO-gated.
// This suite pins BOTH measurements so (a) any accidental edit to the current
// palette surfaces immediately, and (b) on PO approval the swap is a one-line
// constant change with this fence already green. Pure — no DOM, no map.

import { describe, expect, it } from "vitest";

import { BIVARIATE_PALETTE } from "@/components/panorama/bivariate-fill";

/** The PO-pending CVD-safe replacement (see header). Same 3×3 layout/semantics. */
export const BIVARIATE_PALETTE_CANDIDATE: readonly string[] = [
  "#698ba2",
  "#4f8b8b",
  "#4e8771",
  "#905270",
  "#505274",
  "#066461",
  "#8f072e",
  "#551f5e",
  "#0b3578",
] as const;

const LAND = "#eef1f4"; // SituationalMap COLOR_LAND (light v2C)

// --- color math (self-contained, mirrors viz-scales.test idiom) --------------

const hex2rgb = (h: string): number[] =>
  [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relLum = (h: string): number => {
  const [r, g, b] = hex2rgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Machado et al. (2009) severity-1.0 dichromacy matrices (linear RGB). */
const SIM: Record<"protanopia" | "deuteranopia", number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};
const clamp01 = (c: number): number => Math.min(1, Math.max(0, c));
const simulate = (h: string, M: number[][]): number[] => {
  const rgb = hex2rgb(h).map(lin);
  return M.map((row) => clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
};
const linToLab = (rgb: number[]): number[] => {
  const [x, y, z] = [
    0.4124 * rgb[0] + 0.3576 * rgb[1] + 0.1805 * rgb[2],
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2],
    0.0193 * rgb[0] + 0.1192 * rgb[1] + 0.9505 * rgb[2],
  ];
  const ref = [0.95047, 1, 1.08883];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [x / ref[0], y / ref[1], z / ref[2]].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a: number[], b: number[]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function minPairwise(palette: readonly string[], mode?: "protanopia" | "deuteranopia"): number {
  const labs = palette.map((h) => linToLab(mode ? simulate(h, SIM[mode]) : hex2rgb(h).map(lin)));
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) min = Math.min(min, deltaE(labs[i], labs[j]));
  }
  return min;
}

/** Min separation of the RISK corner (index 6) vs the calm teal cells (2, 5, 8). */
function riskVsTeals(palette: readonly string[], mode: "protanopia" | "deuteranopia"): number {
  const labs = palette.map((h) => linToLab(simulate(h, SIM[mode])));
  return Math.min(deltaE(labs[6], labs[2]), deltaE(labs[6], labs[5]), deltaE(labs[6], labs[8]));
}

// --- the CURRENT palette: pinned measurement (known light-canvas gaps) --------

describe("BIVARIATE_PALETTE — light-canvas measurement (fork #2, PO-gated swap pending)", () => {
  it("documents the known contrast gap: not every cell clears 3:1 vs the light land", () => {
    // KNOWN GAP (not a regression fence): #33b0a0 measures 2.36:1 and #54a9ad
    // 2.42:1 vs #eef1f4 — below the WCAG 1.4.11 non-text floor. The dark-canvas
    // validation (≥2.2 vs #161d33) no longer applies. If this test starts
    // FAILING, the palette changed — re-run the full measurement and update the
    // header numbers (or activate the candidate suite below).
    const worst = Math.min(...BIVARIATE_PALETTE.map((c) => contrast(c, LAND)));
    expect(worst).toBeGreaterThan(2.2); // the old dark bar still holds
    expect(worst).toBeLessThan(3); // the light bar does NOT — the documented gap
  });

  it("documents the protanopia calm/alarm collapse (min all-pairs dE ≈ 3.8)", () => {
    const min = minPairwise(BIVARIATE_PALETTE, "protanopia");
    expect(min).toBeGreaterThan(3);
    expect(min).toBeLessThan(5); // the documented gap — RISK vs a calm teal
  });

  it("normal-vision separation is healthy (the palette is fine for trichromats)", () => {
    expect(minPairwise(BIVARIATE_PALETTE)).toBeGreaterThan(14);
  });
});

// --- the CANDIDATE: must clear every gate so the swap is turnkey --------------

describe("BIVARIATE_PALETTE_CANDIDATE — clears every light-canvas gate", () => {
  it("every cell ≥ 3:1 vs the light land (WCAG 1.4.11 non-text)", () => {
    for (const c of BIVARIATE_PALETTE_CANDIDATE) {
      expect(contrast(c, LAND), c).toBeGreaterThanOrEqual(3);
    }
  });

  it("normal-vision min all-pairs dE ≥ 10 (no confusable cells)", () => {
    expect(minPairwise(BIVARIATE_PALETTE_CANDIDATE)).toBeGreaterThanOrEqual(10);
  });

  it("protanopia + deuteranopia min all-pairs dE ≥ 9 (structural, not luck)", () => {
    expect(minPairwise(BIVARIATE_PALETTE_CANDIDATE, "protanopia")).toBeGreaterThanOrEqual(9);
    expect(minPairwise(BIVARIATE_PALETTE_CANDIDATE, "deuteranopia")).toBeGreaterThanOrEqual(9);
  });

  it("the RISK corner stays ALARM vs every calm teal under both simulations (≥ 15)", () => {
    expect(riskVsTeals(BIVARIATE_PALETTE_CANDIDATE, "protanopia")).toBeGreaterThanOrEqual(15);
    expect(riskVsTeals(BIVARIATE_PALETTE_CANDIDATE, "deuteranopia")).toBeGreaterThanOrEqual(15);
  });

  it("keeps the 3×3 layout contract (9 cells, RISK at index 6)", () => {
    expect(BIVARIATE_PALETTE_CANDIDATE).toHaveLength(9);
    expect(BIVARIATE_PALETTE).toHaveLength(9);
  });
});
