import { describe, expect, it } from "vitest";

import {
  dateInYear,
  makeMulberry32,
  monthIndex,
  monthlyEventCount,
  pickDateInMonth,
  pickRegisteredYear,
  provinceProfile,
  seasonalFactor,
  trendFactor,
} from "./seed-history-utils";

// These are PURE helpers for the multi-year panorama history seed. They take an
// injected rng (so the seed can pass its global mulberry32 and keep the run
// deterministic) and must NEVER call Math.random. The tests below pin the date
// bounds and the determinism contract the seed relies on.

describe("dateInYear", () => {
  it("returns a Date within [year-01-01T00:00:00Z, year-12-31T23:59:59.999Z]", () => {
    const rng = makeMulberry32(0x1234);
    for (let i = 0; i < 500; i++) {
      const year = 2024 + (i % 3);
      const d = dateInYear(year, rng);
      const lo = Date.UTC(year, 0, 1, 0, 0, 0, 0);
      const hi = Date.UTC(year, 11, 31, 23, 59, 59, 999);
      expect(d.getTime()).toBeGreaterThanOrEqual(lo);
      expect(d.getTime()).toBeLessThanOrEqual(hi);
      expect(d.getUTCFullYear()).toBe(year);
    }
  });

  it("hits both the low and high edges of the year range across many draws", () => {
    const rng = makeMulberry32(0x9999);
    let sawEarly = false;
    let sawLate = false;
    for (let i = 0; i < 2000; i++) {
      const d = dateInYear(2025, rng);
      if (d.getUTCMonth() <= 0) sawEarly = true; // January
      if (d.getUTCMonth() >= 11) sawLate = true; // December
    }
    expect(sawEarly).toBe(true);
    expect(sawLate).toBe(true);
  });

  it("is deterministic: same seed → identical sequence", () => {
    const a = makeMulberry32(42);
    const b = makeMulberry32(42);
    for (let i = 0; i < 50; i++) {
      expect(dateInYear(2024, a).getTime()).toBe(dateInYear(2024, b).getTime());
    }
  });

  it("respects an optional month window [minMonth, maxMonth]", () => {
    const rng = makeMulberry32(0x5151);
    for (let i = 0; i < 500; i++) {
      const d = dateInYear(2026, rng, 2, 4); // March..May (0-indexed)
      expect(d.getUTCMonth()).toBeGreaterThanOrEqual(2);
      expect(d.getUTCMonth()).toBeLessThanOrEqual(4);
      expect(d.getUTCFullYear()).toBe(2026);
    }
  });
});

describe("provinceProfile", () => {
  it("Córdoba improving, Salta worsening, others uniform", () => {
    expect(provinceProfile("Córdoba").archetype).toBe("improving");
    expect(provinceProfile("Salta").archetype).toBe("worsening");
    expect(provinceProfile("Mendoza").archetype).toBe("uniform");
  });
  it("improving coverage rises, worsening falls", () => {
    const c = provinceProfile("Córdoba").coverageByYear;
    expect(c[2026].vacc).toBeGreaterThan(c[2024].vacc);
    const s = provinceProfile("Salta").coverageByYear;
    expect(s[2026].vacc).toBeLessThan(s[2024].vacc);
  });
  it("uniform province has all three years populated", () => {
    const u = provinceProfile("Mendoza");
    expect(u.coverageByYear[2024].vacc).toBeGreaterThan(0);
    expect(u.coverageByYear[2026].vacc).toBeGreaterThan(0);
    expect(u.zoonosisByYear[2025]).toBeGreaterThanOrEqual(0);
  });
});

function testRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rate model", () => {
  it("monthIndex counts months since Jan 2024", () => {
    expect(monthIndex(2024, 0)).toBe(0);
    expect(monthIndex(2025, 0)).toBe(12);
    expect(monthIndex(2026, 5)).toBe(29);
  });
  it("seasonalFactor bounded", () => {
    for (let m = 0; m < 12; m++) {
      const f = seasonalFactor(m);
      expect(f).toBeGreaterThan(0.5);
      expect(f).toBeLessThan(1.6);
    }
  });
  it("trendFactor: improving rises, worsening falls, uniform mild", () => {
    expect(trendFactor("improving", 24)).toBeGreaterThan(trendFactor("improving", 0));
    expect(trendFactor("worsening", 24)).toBeLessThan(trendFactor("worsening", 0));
    expect(trendFactor("worsening", 1000)).toBeGreaterThanOrEqual(0.2);
  });
  it("monthlyEventCount deterministic + non-negative + zero base", () => {
    expect(monthlyEventCount(10, "uniform", 2025, 5, testRng(1))).toBe(
      monthlyEventCount(10, "uniform", 2025, 5, testRng(1)),
    );
    expect(monthlyEventCount(0, "uniform", 2025, 5, testRng(1))).toBe(0);
    expect(monthlyEventCount(10, "uniform", 2025, 5, testRng(2))).toBeGreaterThanOrEqual(0);
  });
  it("pickDateInMonth stays within month and never after anchor", () => {
    const d = pickDateInMonth(2025, 2, testRng(3)); // March 2025
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(2);
    const future = pickDateInMonth(2026, 11, testRng(4)); // Dec 2026 — after anchor
    expect(future.getTime()).toBeLessThanOrEqual(new Date("2026-06-20T00:00:00Z").getTime());
  });
});

describe("pickRegisteredYear", () => {
  it("only returns years from the provided list", () => {
    const rng = makeMulberry32(7);
    const years = [2024, 2025, 2026] as const;
    for (let i = 0; i < 500; i++) {
      expect(years).toContain(pickRegisteredYear(rng, years));
    }
  });

  it("covers every year in the list across many draws (spread, not stuck)", () => {
    const rng = makeMulberry32(0xabc);
    const years = [2024, 2025, 2026] as const;
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(pickRegisteredYear(rng, years));
    for (const y of years) expect(seen.has(y)).toBe(true);
  });

  it("is deterministic: same seed → identical sequence", () => {
    const a = makeMulberry32(99);
    const b = makeMulberry32(99);
    const years = [2024, 2025, 2026] as const;
    for (let i = 0; i < 50; i++) {
      expect(pickRegisteredYear(a, years)).toBe(pickRegisteredYear(b, years));
    }
  });
});
