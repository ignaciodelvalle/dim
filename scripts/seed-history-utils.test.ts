import { describe, expect, it } from "vitest";

import { dateInYear, makeMulberry32, pickRegisteredYear } from "./seed-history-utils";

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
