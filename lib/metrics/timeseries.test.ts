// Unit tests for the pure time-series bucketing helpers (D1) — DB-FREE.
//
// These cover the branching parts of the trend projection: granularity choice,
// stacked pivot (ordering + 0-fill), and per-cell k-anonymity. The DB-bound
// fetchers in trends.ts delegate to these, so testing the transforms here gives
// the bucketing/scope/k-anon coverage the task requires without a live Postgres.

import { describe, expect, it } from "vitest";

import type { AnalyticsPeriod } from "@/lib/analytics/analytics-period";
import {
  type SeriesBucketRow,
  bucketGranularityFor,
  dateTruncUnit,
  formatBucketLabel,
  isoWeekLabel,
  pivotStackedSeries,
  suppressSmallBuckets,
  suppressSmallStackedCells,
} from "./timeseries";

const DAY_MS = 24 * 60 * 60 * 1000;
const period = (spanDays: number): AnalyticsPeriod => {
  const until = new Date("2026-06-20T00:00:00Z");
  return { since: new Date(until.getTime() - spanDays * DAY_MS), until };
};

describe("bucketGranularityFor", () => {
  it("uses weeks for short/medium windows (7d, 30d, 90d)", () => {
    expect(bucketGranularityFor(period(7))).toBe("week");
    expect(bucketGranularityFor(period(30))).toBe("week");
    expect(bucketGranularityFor(period(90))).toBe("week");
  });

  it("keeps weeks at the 120-day boundary (inclusive)", () => {
    expect(bucketGranularityFor(period(120))).toBe("week");
  });

  it("switches to months past the boundary (121d, 12m default)", () => {
    expect(bucketGranularityFor(period(121))).toBe("month");
    expect(bucketGranularityFor(period(365))).toBe("month");
  });

  it("dateTruncUnit echoes the granularity (drives SQL date_trunc)", () => {
    expect(dateTruncUnit("week")).toBe("week");
    expect(dateTruncUnit("month")).toBe("month");
  });
});

describe("isoWeekLabel / formatBucketLabel", () => {
  it("formats a known date to its ISO-week label", () => {
    // 2026-01-15 is in ISO week 03 of 2026.
    expect(isoWeekLabel(new Date("2026-01-15T00:00:00Z"))).toBe("2026-W03");
  });

  it("rolls early-January dates into the prior ISO year when appropriate", () => {
    // 2027-01-01 is a Friday → ISO week 53 of 2026.
    expect(isoWeekLabel(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });

  it("month granularity uses the es-AR short month label", () => {
    const label = formatBucketLabel(new Date("2026-03-01T00:00:00Z"), "month");
    // es-AR short month for March is "mar." (locale-dependent but stable family).
    expect(label.toLowerCase()).toContain("mar");
  });

  it("week granularity returns the ISO-week label", () => {
    expect(formatBucketLabel(new Date("2026-01-15T00:00:00Z"), "week")).toBe("2026-W03");
  });
});

describe("pivotStackedSeries", () => {
  const rows: SeriesBucketRow[] = [
    { bucketStart: "2026-01-05", bucketLabel: "2026-W02", seriesKey: "natural", count: 8 },
    { bucketStart: "2026-01-05", bucketLabel: "2026-W02", seriesKey: "disease", count: 3 },
    { bucketStart: "2026-01-12", bucketLabel: "2026-W03", seriesKey: "natural", count: 5 },
    // disease absent in W03 → must be 0-filled.
  ];

  it("orders buckets chronologically by bucketStart", () => {
    const { points } = pivotStackedSeries(rows);
    expect(points.map((p) => p.x)).toEqual(["2026-W02", "2026-W03"]);
  });

  it("orders series keys by total descending (dominant band first)", () => {
    const { seriesKeys } = pivotStackedSeries(rows);
    // natural total 13 > disease total 3
    expect(seriesKeys).toEqual(["natural", "disease"]);
  });

  it("0-fills missing series so the stack has no gaps", () => {
    const { points } = pivotStackedSeries(rows);
    const w3 = points.find((p) => p.x === "2026-W03");
    expect(w3?.values).toEqual({ natural: 5, disease: 0 });
  });

  it("returns empty shape for an empty window", () => {
    expect(pivotStackedSeries([])).toEqual({ seriesKeys: [], points: [] });
  });
});

describe("suppressSmallBuckets (single-series k-anon)", () => {
  it("masks non-zero counts below k=5 and tallies them", () => {
    const { points, suppressedCount } = suppressSmallBuckets([
      { x: "W01", y: 9 },
      { x: "W02", y: 3 }, // suppressed
      { x: "W03", y: 1 }, // suppressed
    ]);
    expect(points).toEqual([
      { x: "W01", y: 9 },
      { x: "W02", y: 0 },
      { x: "W03", y: 0 },
    ]);
    expect(suppressedCount).toBe(2);
  });

  it("keeps the boundary value k=5 visible", () => {
    const { points, suppressedCount } = suppressSmallBuckets([{ x: "W01", y: 5 }]);
    expect(points[0]?.y).toBe(5);
    expect(suppressedCount).toBe(0);
  });

  it("never masks a genuine zero (true non-identifying dip)", () => {
    const { points, suppressedCount } = suppressSmallBuckets([{ x: "W01", y: 0 }]);
    expect(points[0]?.y).toBe(0);
    expect(suppressedCount).toBe(0);
  });

  it("respects a custom k", () => {
    const { points, suppressedCount } = suppressSmallBuckets([{ x: "W01", y: 2 }], 3);
    expect(points[0]?.y).toBe(0);
    expect(suppressedCount).toBe(1);
  });

  it("handles an empty series", () => {
    expect(suppressSmallBuckets([])).toEqual({ points: [], suppressedCount: 0 });
  });
});

describe("suppressSmallStackedCells (multi-series k-anon)", () => {
  it("masks small non-zero cells per (bucket, series) and counts them", () => {
    const pivoted = pivotStackedSeries([
      { bucketStart: "2026-01-05", bucketLabel: "W02", seriesKey: "natural", count: 10 },
      { bucketStart: "2026-01-05", bucketLabel: "W02", seriesKey: "disease", count: 2 }, // suppressed
      { bucketStart: "2026-01-12", bucketLabel: "W03", seriesKey: "natural", count: 1 }, // suppressed
      { bucketStart: "2026-01-12", bucketLabel: "W03", seriesKey: "disease", count: 7 },
    ]);
    const { series, suppressedCount } = suppressSmallStackedCells(pivoted, 5);
    expect(suppressedCount).toBe(2);
    const w2 = series.points.find((p) => p.x === "W02");
    const w3 = series.points.find((p) => p.x === "W03");
    expect(w2?.values).toEqual({ natural: 10, disease: 0 });
    expect(w3?.values).toEqual({ natural: 0, disease: 7 });
  });

  it("leaves all cells intact when every cell meets k", () => {
    const pivoted = pivotStackedSeries([
      { bucketStart: "2026-01-05", bucketLabel: "W02", seriesKey: "natural", count: 10 },
      { bucketStart: "2026-01-05", bucketLabel: "W02", seriesKey: "disease", count: 6 },
    ]);
    const { suppressedCount } = suppressSmallStackedCells(pivoted, 5);
    expect(suppressedCount).toBe(0);
  });

  it("handles an empty stacked series", () => {
    const { series, suppressedCount } = suppressSmallStackedCells({ seriesKeys: [], points: [] });
    expect(series).toEqual({ seriesKeys: [], points: [] });
    expect(suppressedCount).toBe(0);
  });
});
