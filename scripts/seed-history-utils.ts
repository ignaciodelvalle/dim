/**
 * Pure date / trend helpers for the multi-year panorama history seed
 * (seedModelProvinceHistory in seed-panorama.ts).
 *
 * These are intentionally isolated from seed-panorama.ts so they are importable
 * by a unit test WITHOUT pulling in the seed's deferred db imports / local-only
 * guard. Every helper takes an injected `rng: () => number` (a mulberry32 draw
 * in [0,1)) so the seed can pass its single global PRNG and keep the whole run
 * deterministic. NEVER use Math.random here.
 */

/**
 * mulberry32 PRNG factory — re-exported here so the unit test can construct an
 * isolated, seeded stream without importing the seed script. This is the SAME
 * algorithm seed-panorama.ts uses for its global `rng`.
 */
export function makeMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 0x100000000;
  };
}

/**
 * Return a Date uniformly within a given calendar year (UTC), optionally bounded
 * to a [minMonth, maxMonth] window (0-indexed months, inclusive).
 *
 * The history seed needs ABSOLUTE dates spread across 2024–2026 — the seed's
 * `randomWindowDate` is anchored to a single 2026 date and is unsuitable. The
 * panorama scrubber filters with `lte(pet_events.occurred_at, asOf)`, so dating
 * a coverage event inside year Y means it only counts once `asOf` reaches Y,
 * which is exactly how the year-over-year trend climbs (CABA) or stagnates
 * (Salta).
 *
 * Bounds: result is always within [Y-01-01T00:00:00.000Z, Y-12-31T23:59:59.999Z]
 * (or the month-bounded sub-range). Uses one rng draw.
 */
export function dateInYear(year: number, rng: () => number, minMonth = 0, maxMonth = 11): Date {
  const lo = Date.UTC(year, minMonth, 1, 0, 0, 0, 0);
  // Day 0 of (maxMonth + 1) is the LAST day of maxMonth; +1 day minus 1ms gives
  // the inclusive end-of-month instant without overflowing into the next month.
  const hiExclusive = Date.UTC(year, maxMonth + 1, 1, 0, 0, 0, 0);
  const hi = hiExclusive - 1; // last representable ms inside the window
  const span = hi - lo;
  return new Date(lo + Math.floor(rng() * (span + 1)));
}

/**
 * Pick a registration year from a list, spread (roughly uniform) across the
 * provided years so every year is represented. Uses one rng draw. Determinism
 * is inherited from the injected rng.
 */
export function pickRegisteredYear<T extends number>(rng: () => number, years: readonly T[]): T {
  return years[Math.floor(rng() * years.length)];
}

// ---------------------------------------------------------------------------
// Province trend profiles
// ---------------------------------------------------------------------------

export type TrendArchetype = "improving" | "worsening" | "uniform";
export type HistoryYear = 2024 | 2025 | 2026;

type ProvinceProfile = {
  archetype: TrendArchetype;
  coverageByYear: Record<HistoryYear, { vacc: number; ster: number }>;
  zoonosisByYear: Record<HistoryYear, number>;
};

/** Córdoba: vaccination + sterilisation coverage rises, zoonosis declines. */
const CORDOBA_COVERAGE: Record<HistoryYear, { vacc: number; ster: number }> = {
  2024: { vacc: 0.3, ster: 0.25 },
  2025: { vacc: 0.43, ster: 0.35 },
  2026: { vacc: 0.55, ster: 0.44 },
};
const CORDOBA_ZOONOSIS: Record<HistoryYear, number> = { 2024: 0.6, 2025: 0.3, 2026: 0.1 };

/** Salta: coverage low and declining, zoonosis rises. */
const SALTA_COVERAGE: Record<HistoryYear, { vacc: number; ster: number }> = {
  2024: { vacc: 0.28, ster: 0.2 },
  2025: { vacc: 0.21, ster: 0.16 },
  2026: { vacc: 0.16, ster: 0.12 },
};
const SALTA_ZOONOSIS: Record<HistoryYear, number> = { 2024: 0.5, 2025: 1.1, 2026: 1.8 };

/** All other provinces: mild upward vacc/ster trend, flat-ish zoonosis. */
const UNIFORM_COVERAGE: Record<HistoryYear, { vacc: number; ster: number }> = {
  2024: { vacc: 0.32, ster: 0.26 },
  2025: { vacc: 0.4, ster: 0.32 },
  2026: { vacc: 0.48, ster: 0.38 },
};
const UNIFORM_ZOONOSIS: Record<HistoryYear, number> = { 2024: 0.4, 2025: 0.4, 2026: 0.45 };

// ---------------------------------------------------------------------------
// Monthly-rate model helpers
// ---------------------------------------------------------------------------

/**
 * Months elapsed since January 2024 (month is 0-indexed, so 0 = January).
 * Example: monthIndex(2026, 5) === 29 (June 2026).
 */
export function monthIndex(year: number, month: number): number {
  return (year - 2024) * 12 + month;
}

/**
 * Seasonal multiplier for a given 0-indexed month.
 * Peaks in January (month 0) at ~1.25, troughs in July (month 6) at ~0.75.
 * Bounded to approximately [0.75, 1.25].
 */
export function seasonalFactor(month: number): number {
  return 1 + 0.25 * Math.cos((2 * Math.PI * month) / 12);
}

/**
 * Trend multiplier based on archetype and how many months have elapsed.
 * - "uniform"   → mild upward drift: 1 + 0.01 * monthIndex
 * - "improving" → stronger upward drift: 1 + 0.025 * monthIndex
 * - "worsening" → downward drift, floored at 0.2: max(0.2, 1 − 0.02 * monthIndex)
 */
export function trendFactor(archetype: TrendArchetype, mi: number): number {
  switch (archetype) {
    case "uniform":
      return 1 + 0.01 * mi;
    case "improving":
      return 1 + 0.025 * mi;
    case "worsening":
      return Math.max(0.2, 1 - 0.02 * mi);
  }
}

/**
 * Realise the expected monthly count as a non-negative integer.
 * Expected = baseRate × trendFactor × seasonalFactor.
 * Uses one `rng()` draw for the fractional part (stochastic rounding).
 * When baseRate === 0 the result is always 0 (no rng draw).
 */
export function monthlyEventCount(
  baseRate: number,
  archetype: TrendArchetype,
  year: number,
  month: number,
  rng: () => number,
): number {
  if (baseRate === 0) return 0;
  const expected =
    baseRate * trendFactor(archetype, monthIndex(year, month)) * seasonalFactor(month);
  return Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
}

/** Default anchor: the latest date we consider "now" for the seed window. */
const DEFAULT_ANCHOR = new Date("2026-06-20T00:00:00Z");

/**
 * Pick a uniformly random day + hour within the given UTC month.
 * Uses two rng draws (one for day, one for hour).
 * If the resulting date is after `anchor` (default 2026-06-20T00:00:00Z),
 * the result is clamped to the anchor.
 */
export function pickDateInMonth(
  year: number,
  month: number,
  rng: () => number,
  anchor: Date = DEFAULT_ANCHOR,
): Date {
  const monthStart = Date.UTC(year, month, 1);
  const monthEndExclusive = Date.UTC(year, month + 1, 1);
  const daysInMonth = (monthEndExclusive - monthStart) / 86_400_000;

  const day = Math.floor(rng() * daysInMonth); // 0-indexed day within month
  const hour = Math.floor(rng() * 24);

  const ts = Date.UTC(year, month, 1 + day, hour, 0, 0, 0);
  const result = new Date(Math.min(ts, anchor.getTime()));
  return result;
}

/**
 * Return the trend archetype and per-year coverage/zoonosis numbers for any
 * Argentine province name. Pure and deterministic — no rng or Date.now() calls.
 *
 * - `"Córdoba"` → improving (coverage rises, zoonosis declines)
 * - `"Salta"`   → worsening (coverage falls, zoonosis rises)
 * - any other   → uniform (mild upward vacc/ster, flat-ish zoonosis)
 */
export function provinceProfile(provinceName: string): ProvinceProfile {
  if (provinceName === "Córdoba") {
    return {
      archetype: "improving",
      coverageByYear: CORDOBA_COVERAGE,
      zoonosisByYear: CORDOBA_ZOONOSIS,
    };
  }
  if (provinceName === "Salta") {
    return {
      archetype: "worsening",
      coverageByYear: SALTA_COVERAGE,
      zoonosisByYear: SALTA_ZOONOSIS,
    };
  }
  return {
    archetype: "uniform",
    coverageByYear: UNIFORM_COVERAGE,
    zoonosisByYear: UNIFORM_ZOONOSIS,
  };
}
