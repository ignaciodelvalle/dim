// Unit tests for lib/metrics/targets.ts — PURE, DB-free.
//
// Covers:
//   1. TARGETS constant values (guard against accidental mutations)
//   2. toneForTarget — higher-is-better and lower-is-better, warn band
//   3. computeDeltaPct — positive, negative, prior=0 guard, current=prior=0

import { describe, expect, it } from "vitest";

import { TARGETS, computeDeltaPct, toneForTarget } from "./targets";

// ---------------------------------------------------------------------------
// 1. TARGETS constant
// ---------------------------------------------------------------------------

describe("TARGETS constant values", () => {
  it("RABIES_COVERAGE_PCT is 80", () => {
    expect(TARGETS.RABIES_COVERAGE_PCT).toBe(80);
  });

  it("MICROCHIP_PENETRATION_PCT is 80", () => {
    expect(TARGETS.MICROCHIP_PENETRATION_PCT).toBe(80);
  });

  it("ADOPTION_RATE_PCT is 20", () => {
    expect(TARGETS.ADOPTION_RATE_PCT).toBe(20);
  });

  it("REUNIFICATION_PCT is 39", () => {
    expect(TARGETS.REUNIFICATION_PCT).toBe(39);
  });

  it("CAMPAIGN_COMPLETION_PCT is 70", () => {
    expect(TARGETS.CAMPAIGN_COMPLETION_PCT).toBe(70);
  });

  it("DISPOSAL_TRACEABILITY_PCT is 75", () => {
    expect(TARGETS.DISPOSAL_TRACEABILITY_PCT).toBe(75);
  });

  it("DISPOSAL_UNKNOWN_BREACH_PCT is 25", () => {
    expect(TARGETS.DISPOSAL_UNKNOWN_BREACH_PCT).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// 2. toneForTarget — higher-is-better (default)
// ---------------------------------------------------------------------------

describe("toneForTarget — higherIsBetter (default)", () => {
  it("returns 'ok' when value meets the target exactly", () => {
    expect(toneForTarget(80, 80)).toBe("ok");
  });

  it("returns 'ok' when value exceeds the target", () => {
    expect(toneForTarget(95, 80)).toBe("ok");
  });

  it("returns 'warn' when value is within the default warnBand (50% of target)", () => {
    // Default warnBand=0.5: warn zone is [80*0.5, 80) = [40, 80).
    expect(toneForTarget(60, 80)).toBe("warn");
    expect(toneForTarget(40, 80)).toBe("warn"); // boundary: target*(1-0.5)=40
  });

  it("returns 'danger' when value is below the warn band floor", () => {
    expect(toneForTarget(39, 80)).toBe("danger");
    expect(toneForTarget(0, 80)).toBe("danger");
  });

  it("respects a custom warnBand (e.g. 0.2 → warn zone is [64, 80))", () => {
    expect(toneForTarget(70, 80, { warnBand: 0.2 })).toBe("warn");
    expect(toneForTarget(63, 80, { warnBand: 0.2 })).toBe("danger");
  });
});

// ---------------------------------------------------------------------------
// 3. toneForTarget — lower-is-better (higherIsBetter: false)
// ---------------------------------------------------------------------------

describe("toneForTarget — higherIsBetter: false", () => {
  // DISPOSAL_UNKNOWN_BREACH_PCT = 25: values above 25 are bad.
  const target = 25;
  const opts = { higherIsBetter: false } as const;

  it("returns 'ok' when value is at or below target", () => {
    expect(toneForTarget(25, target, opts)).toBe("ok");
    expect(toneForTarget(10, target, opts)).toBe("ok");
    expect(toneForTarget(0, target, opts)).toBe("ok");
  });

  it("returns 'warn' when value is above target but within default warnBand", () => {
    // Warn zone: (25, 25*(1+0.5)] = (25, 37.5].
    expect(toneForTarget(30, target, opts)).toBe("warn");
    expect(toneForTarget(37, target, opts)).toBe("warn");
  });

  it("returns 'danger' when value exceeds target*(1+warnBand)", () => {
    // target*(1+0.5) = 37.5; 38 > 37.5 → danger.
    expect(toneForTarget(38, target, opts)).toBe("danger");
    expect(toneForTarget(100, target, opts)).toBe("danger");
  });

  it("respects a custom warnBand with lower-is-better", () => {
    // warnBand=0.1 → warn zone is (25, 27.5].
    expect(toneForTarget(26, target, { ...opts, warnBand: 0.1 })).toBe("warn");
    expect(toneForTarget(28, target, { ...opts, warnBand: 0.1 })).toBe("danger");
  });
});

// ---------------------------------------------------------------------------
// 4. computeDeltaPct
// ---------------------------------------------------------------------------

describe("computeDeltaPct", () => {
  it("returns a positive delta for growth", () => {
    // (110 - 100) / 100 * 100 = 10%
    expect(computeDeltaPct(110, 100)).toBe(10);
  });

  it("returns a negative delta for decline", () => {
    // (80 - 100) / 100 * 100 = -20%
    expect(computeDeltaPct(80, 100)).toBe(-20);
  });

  it("returns 0 when current equals prior (no change)", () => {
    expect(computeDeltaPct(50, 50)).toBe(0);
  });

  it("returns 0 when prior is 0 and current is also 0 (no change from zero baseline)", () => {
    expect(computeDeltaPct(0, 0)).toBe(0);
  });

  it("returns 0 when prior is 0 and current is non-zero (Infinity guard)", () => {
    // Returning Infinity or NaN would corrupt charts and formatters.
    expect(computeDeltaPct(42, 0)).toBe(0);
  });

  it("rounds to one decimal place", () => {
    // (1 - 3) / 3 * 100 = -66.666… → -66.7
    expect(computeDeltaPct(1, 3)).toBe(-66.7);
  });

  it("handles fractional values correctly", () => {
    // (1.5 - 1.0) / 1.0 * 100 = 50.0
    expect(computeDeltaPct(1.5, 1.0)).toBe(50);
  });
});
