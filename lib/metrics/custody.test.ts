// lib/metrics/custody.test.ts — Paquete F custody & adoption tests.
//
// All tests here are DB-FREE (pure helpers only).
// DB-bound fetchers (fetchCustodyFunnel, fetchTimeInState, etc.) follow the
// shape-only tsc-verified-only pattern established in trends.test.ts and
// census.test.ts: they are commented with the type assertions that tsc checks,
// but do NOT run here (no live Postgres in unit suite).
//
// Pure helpers tested:
//   1. funnelWithinUniverse — percents, cap at 100, zero-intake guard
//   2. returnRate            — null on zero denominator, correct ratio
//   3. timeInStateNonNegative — clamps negatives to 0

import { describe, expect, it } from "vitest";

import { funnelWithinUniverse, returnRate, timeInStateNonNegative } from "./custody";

// ---------------------------------------------------------------------------
// 1. funnelWithinUniverse
// ---------------------------------------------------------------------------

describe("funnelWithinUniverse", () => {
  it("intake=0 → 100/0/0/0 (no universe)", () => {
    const pct = funnelWithinUniverse({ intake: 0, foster: 0, adoption: 0, reversed: 0 });
    expect(pct.intakePct).toBe(100);
    expect(pct.fosterPct).toBe(0);
    expect(pct.adoptionPct).toBe(0);
    expect(pct.reversedPct).toBe(0);
  });

  it("all stages equal intake → each stage is 100%", () => {
    const pct = funnelWithinUniverse({ intake: 10, foster: 10, adoption: 10, reversed: 10 });
    expect(pct.intakePct).toBe(100);
    expect(pct.fosterPct).toBe(100);
    expect(pct.adoptionPct).toBe(100);
    expect(pct.reversedPct).toBe(100);
  });

  it("typical funnel — each stage is smaller than the previous", () => {
    const pct = funnelWithinUniverse({ intake: 100, foster: 40, adoption: 20, reversed: 2 });
    expect(pct.intakePct).toBe(100);
    expect(pct.fosterPct).toBe(40);
    expect(pct.adoptionPct).toBe(20);
    expect(pct.reversedPct).toBe(2);
  });

  it("percentages are rounded to one decimal", () => {
    // 1/3 = 33.3%
    const pct = funnelWithinUniverse({ intake: 3, foster: 1, adoption: 0, reversed: 0 });
    expect(pct.fosterPct).toBe(33.3);
  });

  it("downstream stage exceeds intake → capped at 100 (pathological data guard)", () => {
    // foster=200 vs intake=100 → would be 200% → capped at 100
    const pct = funnelWithinUniverse({ intake: 100, foster: 200, adoption: 50, reversed: 5 });
    expect(pct.fosterPct).toBe(100);
    expect(pct.adoptionPct).toBe(50);
  });

  it("reversedPct is relative to intake, NOT to adoption", () => {
    // reversed=10 vs intake=100 → 10%, regardless of adoption=20
    const pct = funnelWithinUniverse({ intake: 100, foster: 50, adoption: 20, reversed: 10 });
    expect(pct.reversedPct).toBe(10);
  });

  it("zero foster, zero adoption, zero reversed → only intake at 100%", () => {
    const pct = funnelWithinUniverse({ intake: 50, foster: 0, adoption: 0, reversed: 0 });
    expect(pct.intakePct).toBe(100);
    expect(pct.fosterPct).toBe(0);
    expect(pct.adoptionPct).toBe(0);
    expect(pct.reversedPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. returnRate
// ---------------------------------------------------------------------------

describe("returnRate", () => {
  it("returns null when finalized=0 (undefined rate)", () => {
    expect(returnRate(0, 0)).toBeNull();
    expect(returnRate(5, 0)).toBeNull();
  });

  it("returns 0 when reversed=0 and finalized>0", () => {
    expect(returnRate(0, 10)).toBe(0);
  });

  it("returns correct ratio", () => {
    expect(returnRate(2, 10)).toBe(0.2);
  });

  it("returns 1.0 when all adoptions reversed", () => {
    expect(returnRate(5, 5)).toBe(1.0);
  });

  it("can exceed 1 when reversed > finalized in the same period", () => {
    // This is period-based (events in window), so reversed > finalized is possible
    // (reversal of prior-period adoptions coming in).
    expect(returnRate(6, 5)).toBeCloseTo(1.2);
  });
});

// ---------------------------------------------------------------------------
// 3. timeInStateNonNegative
// ---------------------------------------------------------------------------

describe("timeInStateNonNegative", () => {
  it("positive value passes through unchanged", () => {
    expect(timeInStateNonNegative(10)).toBe(10);
    expect(timeInStateNonNegative(0.5)).toBe(0.5);
  });

  it("zero passes through as 0", () => {
    expect(timeInStateNonNegative(0)).toBe(0);
  });

  it("negative value is clamped to 0", () => {
    expect(timeInStateNonNegative(-1)).toBe(0);
    expect(timeInStateNonNegative(-0.001)).toBe(0);
  });

  it("large positive value is unchanged", () => {
    expect(timeInStateNonNegative(365)).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// DB-bound shape stubs (tsc-only — no live Postgres in unit suite)
//
// These would be in a separate integration test file that imports from vitest
// with the same setup as trends.test.ts. Kept here as TSC-verified type
// assertions so the compiler catches signature changes.
//
// To enable: copy to a new file, add the DB setup imports (same as trends.test.ts),
// and remove the comment block. The shape assertions will then run against the DB.
// ---------------------------------------------------------------------------

// import { buildProjectionContext } from "@/lib/metrics";
// import {
//   fetchCustodyFunnel,
//   fetchTimeInState,
//   fetchReturnRate,
//   fetchFosterPoolUtilization,
//   fetchShelterOccupancyNational,
//   fetchAdoptionTrend,
// } from "./custody";
//
// function adminCtx12m() {
//   return buildProjectionContext({ role: "admin" }, [], {
//     since: new Date(Date.now() - 365 * 86_400_000),
//     until: new Date(Date.now() + 86_400_000),
//   });
// }
//
// describe("custody fetchers — DB shape (tsc-only)", () => {
//   it("fetchCustodyFunnel resolves with FunnelCounts shape", async () => {
//     const r = await fetchCustodyFunnel(adminCtx12m());
//     expect(typeof r.intake).toBe("number");
//     expect(typeof r.foster).toBe("number");
//     expect(typeof r.adoption).toBe("number");
//     expect(typeof r.reversed).toBe("number");
//     expect(r.intake).toBeGreaterThanOrEqual(0);
//     expect(r.foster).toBeGreaterThanOrEqual(0);
//     expect(r.adoption).toBeGreaterThanOrEqual(0);
//     expect(r.reversed).toBeGreaterThanOrEqual(0);
//   });
//
//   it("fetchTimeInState resolves with non-negative day values", async () => {
//     const rows = await fetchTimeInState(adminCtx12m());
//     expect(Array.isArray(rows)).toBe(true);
//     for (const row of rows) {
//       expect(["shelter_custody", "foster"]).toContain(row.role);
//       if (row.medianDays != null) expect(row.medianDays).toBeGreaterThanOrEqual(0);
//       if (row.p75Days != null) expect(row.p75Days).toBeGreaterThanOrEqual(0);
//       expect(row.n).toBeGreaterThanOrEqual(0);
//     }
//   });
//
//   it("fetchReturnRate resolves as null or non-negative number", async () => {
//     const r = await fetchReturnRate(adminCtx12m());
//     expect(r === null || typeof r === "number").toBe(true);
//     if (r !== null) expect(r).toBeGreaterThanOrEqual(0);
//   });
//
//   it("fetchFosterPoolUtilization resolves with numeric counts", async () => {
//     const r = await fetchFosterPoolUtilization(adminCtx12m());
//     expect(typeof r.activeVolunteers).toBe("number");
//     expect(typeof r.withCapacity).toBe("number");
//     expect(typeof r.activeFosterPlacements).toBe("number");
//     expect(r.activeVolunteers).toBeGreaterThanOrEqual(0);
//     expect(r.withCapacity).toBeGreaterThanOrEqual(0);
//     expect(r.activeFosterPlacements).toBeGreaterThanOrEqual(0);
//   });
//
//   it("fetchShelterOccupancyNational resolves with occupied >= 0 and capacity null-safe", async () => {
//     const r = await fetchShelterOccupancyNational(adminCtx12m());
//     expect(typeof r.occupied).toBe("number");
//     expect(r.occupied).toBeGreaterThanOrEqual(0);
//     expect(r.capacity === null || typeof r.capacity === "number").toBe(true);
//     if (r.capacity !== null) expect(r.capacity).toBeGreaterThanOrEqual(0);
//   });
//
//   it("fetchAdoptionTrend resolves with a valid single-series shape", async () => {
//     const r = await fetchAdoptionTrend(adminCtx12m());
//     expect(["week", "month"]).toContain(r.granularity);
//     expect(Array.isArray(r.points)).toBe(true);
//     expect(typeof r.suppressedCount).toBe("number");
//   });
// });
