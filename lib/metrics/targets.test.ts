// Unit tests for lib/metrics/targets.ts — PURE, DB-free.
//
// Covers:
//   1. TARGETS constant values (guard against accidental mutations)
//   2. toneForTarget — higher-is-better and lower-is-better, warn band
//   3. computeDeltaPct — positive, negative, prior=0 guard, current=prior=0

import { describe, expect, it } from "vitest";

import {
  TARGETS,
  computeDeltaPct,
  decisionsDeltaPct,
  enoSlaHeadline,
  enoSlaTone,
  toneForBreachCeiling,
  toneForTarget,
} from "./targets";

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

  it("DORMANT_MONTHS is 12 (Paquete E dormancy threshold)", () => {
    expect(TARGETS.DORMANT_MONTHS).toBe(12);
  });

  it("STERILIZATION_COVERAGE_PCT is 70 (Paquete G — programmatic benchmark, not legal mandate)", () => {
    expect(TARGETS.STERILIZATION_COVERAGE_PCT).toBe(70);
  });

  it("ENO_SLA_PCT is 95 (programmatic benchmark — ENO resolution within SLA window)", () => {
    expect(TARGETS.ENO_SLA_PCT).toBe(95);
  });

  it("ADOPTION_RETURN_RATE_PCT is 10 (programmatic benchmark — programme retention/engagement)", () => {
    expect(TARGETS.ADOPTION_RETURN_RATE_PCT).toBe(10);
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
// toneForBreachCeiling — never "ok"/green for a breach-only ceiling metric
// (screenshot review finding #12: mortality_unknown_disposal_rate rendered
// green at 16,7% against the 25% breach threshold, reading as a false
// success signal for a real data/compliance gap).
// ---------------------------------------------------------------------------

describe("toneForBreachCeiling", () => {
  const ceiling = 25; // DISPOSAL_UNKNOWN_BREACH_PCT

  it("returns 'neutral' (never 'ok') for any value at or under the ceiling", () => {
    expect(toneForBreachCeiling(0, ceiling)).toBe("neutral");
    expect(toneForBreachCeiling(16.7, ceiling)).toBe("neutral");
    expect(toneForBreachCeiling(25, ceiling)).toBe("neutral");
  });

  it("returns 'warn' above the ceiling but within the warn band", () => {
    expect(toneForBreachCeiling(30, ceiling)).toBe("warn");
  });

  it("returns 'danger' beyond the warn band", () => {
    expect(toneForBreachCeiling(100, ceiling)).toBe("danger");
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

// ---------------------------------------------------------------------------
// 5. decisionsDeltaPct — value-pinning (C28 extraction must be behaviour-preserving)
//
// These are the EXACT values produced by the inline logic that previously lived
// in app/admin/page.tsx and app/admin/sistema/page.tsx. The extraction is only
// safe if these numbers remain pinned. Derivation per input:
//   total7d=approved7d+rejected7d, total30d=approved30d+rejected30d,
//   prior23d=total30d-total7d, priorWeek=round(prior23d/23*7),
//   delta=computeDeltaPct(total7d, priorWeek).
// ---------------------------------------------------------------------------

describe("decisionsDeltaPct — value-pinning (C28)", () => {
  it("growth case: {a7:10,r7:4,a30:30,r30:12} → +55.6", () => {
    // total7d=14, total30d=42, prior23d=28, priorWeek=round(28/23*7)=9,
    // delta=computeDeltaPct(14,9)=round((14-9)/9*1000)/10=55.6
    expect(
      decisionsDeltaPct({ approved7d: 10, rejected7d: 4, approved30d: 30, rejected30d: 12 }),
    ).toBe(55.6);
  });

  it("decline case: {a7:2,r7:1,a30:40,r30:20} → -82.4", () => {
    // total7d=3, total30d=60, prior23d=57, priorWeek=round(57/23*7)=17,
    // delta=computeDeltaPct(3,17)=round((3-17)/17*1000)/10=-82.4
    expect(
      decisionsDeltaPct({ approved7d: 2, rejected7d: 1, approved30d: 40, rejected30d: 20 }),
    ).toBe(-82.4);
  });

  it("no baseline (prior23d === 0) → null (KPI omits the deltaV2 chip)", () => {
    // total7d=total30d → prior23d=0 → null
    expect(
      decisionsDeltaPct({ approved7d: 5, rejected7d: 2, approved30d: 5, rejected30d: 2 }),
    ).toBeNull();
  });

  it("negative prior23d (data skew, total7d>total30d) → null", () => {
    // total7d=10, total30d=4 → prior23d=-6 → null (guard is prior23d <= 0)
    expect(
      decisionsDeltaPct({ approved7d: 8, rejected7d: 2, approved30d: 3, rejected30d: 1 }),
    ).toBeNull();
  });

  it("priorWeek rounds to 0 (prior23d positive but tiny) → 0 via computeDeltaPct guard", () => {
    // total7d=10, total30d=11, prior23d=1, priorWeek=round(1/23*7)=0,
    // computeDeltaPct(10,0)=0 (Infinity guard)
    expect(
      decisionsDeltaPct({ approved7d: 10, rejected7d: 0, approved30d: 11, rejected30d: 0 }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// enoSlaTone — open breaches degrade the tile tone (QA 2026-07-03)
// ---------------------------------------------------------------------------

describe("enoSlaTone", () => {
  it("returns the percentage tone when there are no open breaches", () => {
    expect(enoSlaTone({ onTimePct: 100, breachedOpen: 0 })).toBe("ok");
    expect(enoSlaTone({ onTimePct: 60, breachedOpen: 0 })).toBe("warn");
    expect(enoSlaTone({ onTimePct: 10, breachedOpen: 0 })).toBe("danger");
  });

  it("never reads 'ok' while notifications are in active breach", () => {
    // The regression: 100% delivered-on-time rendered "Normal" next to
    // "12 en breach activo".
    expect(enoSlaTone({ onTimePct: 100, breachedOpen: 12 })).toBe("warn");
  });

  it("keeps 'danger' when the percentage tone is already danger", () => {
    expect(enoSlaTone({ onTimePct: 10, breachedOpen: 3 })).toBe("danger");
  });

  it("warns on open breaches even without a percentage", () => {
    expect(enoSlaTone({ onTimePct: null, breachedOpen: 1 })).toBe("warn");
    expect(enoSlaTone({ onTimePct: null, breachedOpen: 0 })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// enoSlaHeadline — coherence fix (qa-triage-2026-07-23, finding #12): the tile
// must lead with the CURRENT breach count, never the historical % that reads
// "100%"/"todo bien" while notifications sit past their SLA. Live regression
// this reproduces: /gob/vigilancia showed "100%" as the headline right next
// to "12 fuera de SLA" in its own sub-line — the exact "100% vs 12 en
// incumplimiento" contradiction the review flagged.
// ---------------------------------------------------------------------------

const pctLabel = (v: number | null) => (v === null ? "—" : `${v}%`);

describe("enoSlaHeadline", () => {
  it("an active breach LEADS with the live count, never the historical %", () => {
    const { value, sub } = enoSlaHeadline(
      { onTimePct: 100, breachedOpen: 12, medianLatencyHours: 4 },
      pctLabel,
    );
    expect(value).toBe("12 vencidas ahora");
    // Path B (red-team-admin-2 #3): with an open breach the historical on-time %
    // is DROPPED entirely (a "100%" beside "12 vencidas" reads as makeup no
    // matter the caption). The sub shows neutral operational context — median
    // delivery latency — never the success %.
    expect(sub).toBe("Mediana de entrega 4 h");
    expect(sub).not.toContain("100%");
  });

  it("an active breach with no latency data falls back to a plain pending note (no %)", () => {
    const { value, sub } = enoSlaHeadline(
      { onTimePct: null, breachedOpen: 3, medianLatencyHours: null },
      pctLabel,
    );
    expect(value).toBe("3 vencidas ahora");
    expect(sub).toBe("Pendientes de reintento");
    expect(sub).not.toContain("%");
  });

  it("no open breach → headlines the historical % (nothing to contradict) with a median-latency sub", () => {
    const { value, sub } = enoSlaHeadline(
      { onTimePct: 95, breachedOpen: 0, medianLatencyHours: 6 },
      pctLabel,
    );
    expect(value).toBe("95%");
    expect(sub).toBe("Mediana 6 h");
  });

  it("no open breach, no deliveries yet → '—' headline with an honest no-data sub", () => {
    const { value, sub } = enoSlaHeadline(
      { onTimePct: null, breachedOpen: 0, medianLatencyHours: null },
      pctLabel,
    );
    expect(value).toBe("—");
    expect(sub).toBe("Sin entregas en el período");
  });
});
