// Unit tests for lib/metrics/presentation-guards.ts — PURE, DB-free.
//
// Each describe block pins ONE red-team-verified dishonest-rendering class
// (docs/reviews/results/2026-07-22-plan-maestro-integridad.md, C1) to the
// guard function that fences it.

import { describe, expect, it } from "vitest";

import type { KpiDefinition } from "./kpi-catalog";
import {
  UNSTABLE_DELTA_BASE_NOTE,
  ZERO_DENOMINATOR_DASH,
  guardRatioTone,
  resolveSemaphoreTone,
  shouldSuppressDelta,
  smallNGate,
  smallNNote,
  zeroDenominatorGate,
} from "./presentation-guards";

type Descriptor = Pick<KpiDefinition, "guards" | "semaphore">;

const withZeroDenominatorGuard: Descriptor = { guards: { zeroDenominator: "dash" } };
const withSmallNGuard: Descriptor = { guards: { smallN: { min: 5 } } };
const withBothGuards: Descriptor = {
  guards: { zeroDenominator: "dash", smallN: { min: 5 } },
};
const withUnstableDeltaGuard: Descriptor = { guards: { unstableDeltaBase: { minPriorBase: 5 } } };
const noGuards: Descriptor = {};

describe("zeroDenominatorGate — the '0/0 → 0%' class", () => {
  it("fires when the guard is declared AND n is 0", () => {
    expect(zeroDenominatorGate(withZeroDenominatorGuard, 0)).toBe(true);
  });

  it("does not fire when n > 0", () => {
    expect(zeroDenominatorGate(withZeroDenominatorGuard, 1)).toBe(false);
  });

  it("does not fire when the descriptor has no zeroDenominator guard declared", () => {
    expect(zeroDenominatorGate(noGuards, 0)).toBe(false);
  });
});

describe("smallNGate — the '100% con N=2' class", () => {
  it("fires for a positive n strictly below `min`", () => {
    expect(smallNGate(withSmallNGuard, 2)).toBe(true);
  });

  it("does not fire at or above `min`", () => {
    expect(smallNGate(withSmallNGuard, 5)).toBe(false);
    expect(smallNGate(withSmallNGuard, 10)).toBe(false);
  });

  it("does not fire at n=0 — that is the zero-denominator state, not a small sample", () => {
    expect(smallNGate(withSmallNGuard, 0)).toBe(false);
  });

  it("does not fire when the descriptor has no smallN guard declared", () => {
    expect(smallNGate(noGuards, 2)).toBe(false);
  });
});

describe("guardRatioTone — composed value/tone/note for a rate tile", () => {
  it("n=0 with the zero-denominator guard renders the dash, neutral tone, no note", () => {
    const result = guardRatioTone(withBothGuards, {
      n: 0,
      computedTone: "danger",
      formattedValue: "0,0%",
    });
    expect(result).toEqual({ value: ZERO_DENOMINATOR_DASH, tone: "neutral" });
  });

  it("small N (reunificación 100% · 2 de 2) keeps the real value, forces neutral, adds a note", () => {
    const result = guardRatioTone(withBothGuards, {
      n: 2,
      computedTone: "ok",
      formattedValue: "100,0%",
    });
    expect(result.value).toBe("100,0%");
    expect(result.tone).toBe("neutral");
    expect(result.note).toBe(smallNNote(5));
  });

  it("n at/above the smallN floor passes the computed tone through unchanged", () => {
    const result = guardRatioTone(withBothGuards, {
      n: 68,
      computedTone: "ok",
      formattedValue: "41,3%",
    });
    expect(result).toEqual({ value: "41,3%", tone: "ok" });
  });

  it("a descriptor with no guards at all is a no-op passthrough", () => {
    const result = guardRatioTone(noGuards, {
      n: 1,
      computedTone: "danger",
      formattedValue: "5,0%",
    });
    expect(result).toEqual({ value: "5,0%", tone: "danger" });
  });
});

describe("shouldSuppressDelta — the '−95% MoM sobre base inestable' class", () => {
  it("suppresses when the prior base is below the floor", () => {
    expect(shouldSuppressDelta(withUnstableDeltaGuard, 1)).toBe(true);
  });

  it("does not suppress at or above the floor", () => {
    expect(shouldSuppressDelta(withUnstableDeltaGuard, 5)).toBe(false);
    expect(shouldSuppressDelta(withUnstableDeltaGuard, 20)).toBe(false);
  });

  it("does not suppress when the descriptor declares no unstableDeltaBase guard", () => {
    expect(shouldSuppressDelta(noGuards, 0)).toBe(false);
  });

  it("exposes a stable, non-empty note for the suppressed state", () => {
    expect(UNSTABLE_DELTA_BASE_NOTE.length).toBeGreaterThan(0);
  });
});

describe("resolveSemaphoreTone — the 'semáforo como veredicto legal' class", () => {
  it("paintAgainst 'none' NEVER returns the computed judgment tone — even 'danger'", () => {
    const descriptor: Descriptor = { semaphore: { paintAgainst: "none" } };
    expect(resolveSemaphoreTone(descriptor, "danger")).not.toBe("danger");
    expect(resolveSemaphoreTone(descriptor, "danger")).toBe("blue");
  });

  it("paintAgainst 'none' respects a caller-supplied fallback tone", () => {
    const descriptor: Descriptor = { semaphore: { paintAgainst: "none" } };
    expect(resolveSemaphoreTone(descriptor, "ok", "neutral")).toBe("neutral");
  });

  it("paintAgainst 'target' passes the computed tone through unchanged", () => {
    const descriptor: Descriptor = { semaphore: { paintAgainst: "target" } };
    expect(resolveSemaphoreTone(descriptor, "danger")).toBe("danger");
    expect(resolveSemaphoreTone(descriptor, "ok")).toBe("ok");
  });

  it("an absent semaphore policy (uncatalogued/legacy KPI) is backward-compat passthrough", () => {
    expect(resolveSemaphoreTone(noGuards, "warn")).toBe("warn");
  });
});
