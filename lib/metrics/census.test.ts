// lib/metrics/census.test.ts — Pure unit tests for Paquete E census predicates.
//
// All tests here are DB-FREE. They cover:
//   1. isIncompleteProfile — truth table
//   2. classifyDormant — recent activity → not dormant; old activity → dormant;
//                        null → dormant; exact boundary
//   3. assertFunnelMonotonic — passes when monotonic; throws on each violation
//   4. funnelPercents — correct percentage calculation including zero-total guard
//
// DB-bound shape tests (registryCounts / registrationTrend / identificationFunnel)
// are described at the bottom as tsc-verified-only stubs (they match the real
// DB-bound trend test pattern in trends.test.ts and run only with a live Postgres).

import { describe, expect, it } from "vitest";

import {
  assertFunnelMonotonic,
  classifyDormant,
  funnelPercents,
  isIncompleteProfile,
} from "./census";

// ---------------------------------------------------------------------------
// 1. isIncompleteProfile — truth table
// ---------------------------------------------------------------------------

describe("isIncompleteProfile", () => {
  it("complete profile → false", () => {
    expect(isIncompleteProfile({ hasChip: true, sex: "female", hasLocality: true })).toBe(false);
  });

  it("missing chip → true", () => {
    expect(isIncompleteProfile({ hasChip: false, sex: "female", hasLocality: true })).toBe(true);
  });

  it("unknown sex → true", () => {
    expect(isIncompleteProfile({ hasChip: true, sex: "unknown", hasLocality: true })).toBe(true);
  });

  it("missing locality → true", () => {
    expect(isIncompleteProfile({ hasChip: true, sex: "male", hasLocality: false })).toBe(true);
  });

  it("all three missing → true", () => {
    expect(isIncompleteProfile({ hasChip: false, sex: "unknown", hasLocality: false })).toBe(true);
  });

  it("chip + sex missing, locality present → true", () => {
    expect(isIncompleteProfile({ hasChip: false, sex: "unknown", hasLocality: true })).toBe(true);
  });

  it("chip present, sex known (male), locality missing → true", () => {
    expect(isIncompleteProfile({ hasChip: true, sex: "male", hasLocality: false })).toBe(true);
  });

  it("all present with sex=male → false", () => {
    expect(isIncompleteProfile({ hasChip: true, sex: "male", hasLocality: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. classifyDormant
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-21T12:00:00Z");
const MONTHS = 12;

describe("classifyDormant", () => {
  it("recent activity (1 month ago) → not dormant", () => {
    const lastEvent = new Date("2026-05-21T12:00:00Z"); // 1 month before NOW
    expect(classifyDormant(lastEvent, NOW, MONTHS)).toBe(false);
  });

  it("activity exactly at cutoff boundary → not dormant (>= cutoff is still active)", () => {
    // cutoff = 2025-06-21T12:00:00Z; activity exactly on cutoff is NOT dormant
    // classifyDormant returns true only when lastOwnerEventAt < cutoff
    const cutoff = new Date(NOW);
    cutoff.setMonth(cutoff.getMonth() - MONTHS);
    // Exactly at the cutoff: lastEvent === cutoff → NOT dormant (< is false)
    expect(classifyDormant(new Date(cutoff.getTime()), NOW, MONTHS)).toBe(false);
  });

  it("activity 1ms before cutoff → dormant", () => {
    const cutoff = new Date(NOW);
    cutoff.setMonth(cutoff.getMonth() - MONTHS);
    const lastEvent = new Date(cutoff.getTime() - 1);
    expect(classifyDormant(lastEvent, NOW, MONTHS)).toBe(true);
  });

  it("old activity (2 years ago) → dormant", () => {
    const lastEvent = new Date("2024-06-21T12:00:00Z");
    expect(classifyDormant(lastEvent, NOW, MONTHS)).toBe(true);
  });

  it("null lastOwnerEventAt (no events ever) → dormant", () => {
    expect(classifyDormant(null, NOW, MONTHS)).toBe(true);
  });

  it("respects the months parameter (3-month threshold)", () => {
    const recentEnough = new Date("2026-04-21T12:00:00Z"); // 2 months ago, threshold=3
    expect(classifyDormant(recentEnough, NOW, 3)).toBe(false);

    const tooOld = new Date("2026-02-20T12:00:00Z"); // ~4 months ago, threshold=3
    expect(classifyDormant(tooOld, NOW, 3)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. assertFunnelMonotonic
// ---------------------------------------------------------------------------

describe("assertFunnelMonotonic", () => {
  it("passes for perfectly monotonic stages", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 100, chipped: 80, isoValid: 60, scanned: 20 }),
    ).not.toThrow();
  });

  it("passes when stages are equal (equality is allowed)", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 50, chipped: 50, isoValid: 50, scanned: 50 }),
    ).not.toThrow();
  });

  it("passes when all stages are zero", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 0, chipped: 0, isoValid: 0, scanned: 0 }),
    ).not.toThrow();
  });

  it("throws when total < chipped", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 70, chipped: 80, isoValid: 60, scanned: 20 }),
    ).toThrow(/total.*chipped/i);
  });

  it("throws when chipped < isoValid", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 100, chipped: 50, isoValid: 60, scanned: 20 }),
    ).toThrow(/chipped.*isoValid/i);
  });

  it("throws when isoValid < scanned", () => {
    expect(() =>
      assertFunnelMonotonic({ total: 100, chipped: 80, isoValid: 30, scanned: 40 }),
    ).toThrow(/isoValid.*scanned/i);
  });
});

// ---------------------------------------------------------------------------
// 4. funnelPercents
// ---------------------------------------------------------------------------

describe("funnelPercents", () => {
  it("total is always 100%", () => {
    const pct = funnelPercents({ total: 200, chipped: 160, isoValid: 100, scanned: 40 });
    expect(pct.total).toBe(100);
  });

  it("computes chipped % of total correctly", () => {
    const pct = funnelPercents({ total: 200, chipped: 160, isoValid: 100, scanned: 40 });
    expect(pct.chipped).toBe(80); // 160/200 = 80%
  });

  it("computes isoValid % of total correctly", () => {
    const pct = funnelPercents({ total: 200, chipped: 160, isoValid: 100, scanned: 40 });
    expect(pct.isoValid).toBe(50); // 100/200 = 50%
  });

  it("computes scanned % of total correctly", () => {
    const pct = funnelPercents({ total: 200, chipped: 160, isoValid: 100, scanned: 40 });
    expect(pct.scanned).toBe(20); // 40/200 = 20%
  });

  it("returns 0 for all stages when total is 0 (no division by zero)", () => {
    const pct = funnelPercents({ total: 0, chipped: 0, isoValid: 0, scanned: 0 });
    expect(pct.total).toBe(100);
    expect(pct.chipped).toBe(0);
    expect(pct.isoValid).toBe(0);
    expect(pct.scanned).toBe(0);
  });

  it("rounds to one decimal place", () => {
    // 1/3 ≈ 33.3%
    const pct = funnelPercents({ total: 300, chipped: 100, isoValid: 0, scanned: 0 });
    expect(pct.chipped).toBe(33.3);
  });
});
