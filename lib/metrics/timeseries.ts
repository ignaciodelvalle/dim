// Pure bucketing + pivot helpers for time-series (trend) projections.
//
// This module is DB-FREE on purpose: every function here is a pure transform
// over already-fetched rows. The DB-bound trend fetchers (lib/metrics/trends.ts)
// run the GROUP BY in SQL and then hand the raw rows to these helpers for
// bucket-granularity selection, stacked pivoting, and k-anonymity suppression.
//
// Keeping the transforms pure means the bucketing logic (the part with real
// branching: granularity choice, pivot, small-cell suppression) is unit-tested
// without a live Postgres — mirroring how computeDiseaseSummary is a pure rollup
// the fetcher delegates to.

import type { AnalyticsPeriod } from "@/lib/analytics/analytics-period";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The natural temporal bucket for a chart x-axis. */
export type BucketGranularity = "week" | "month";

/**
 * Pick the natural bucket granularity for a reporting window.
 *
 * Short/medium windows (≤ ~120 days) read best as ISO weeks; anything longer
 * (the 12-month default, YTD past spring, custom multi-month ranges) is bucketed
 * by calendar month so the x-axis stays legible (no 50+ week ticks).
 *
 * The 120-day cutoff keeps the 7d / 30d / 90d presets on weeks and the 12m
 * default on months. Exported so the fetcher can pass the matching
 * date_trunc() unit to SQL.
 */
export function bucketGranularityFor(period: AnalyticsPeriod): BucketGranularity {
  const spanDays = (period.until.getTime() - period.since.getTime()) / DAY_MS;
  return spanDays <= 120 ? "week" : "month";
}

/** The Postgres date_trunc() unit string for a granularity. */
export function dateTruncUnit(granularity: BucketGranularity): "week" | "month" {
  return granularity;
}

/**
 * A single bucketed, keyed cell: one period bucket + one series key + a count.
 * `bucketStart` is the ISO date of the period start (sort key, never displayed).
 * `bucketLabel` is the pre-formatted es-AR x-axis label.
 */
export type SeriesBucketRow = {
  /** ISO date of the bucket start (sort key). */
  bucketStart: string;
  /** Pre-formatted es-AR x-axis label, e.g. "2026-W03" or "ene." */
  bucketLabel: string;
  /** The series this count belongs to (e.g. a death cause, a disease code). */
  seriesKey: string;
  /** Count for (bucket, series). */
  count: number;
};

/** One row of a stacked chart: a period bucket + a value per series. */
export type StackedPoint = {
  /** x-axis label (es-AR, pre-formatted). */
  x: string;
  /** One numeric value per series key. Missing series default to 0. */
  values: Record<string, number>;
};

/** The shape a stacked time-series chart consumes. */
export type StackedSeries = {
  /** Ordered series keys (raw, not display labels) — define the stack order. */
  seriesKeys: string[];
  /** Chronologically ordered points, one per period bucket. */
  points: StackedPoint[];
};

/**
 * Pivot long-format (bucket × series) rows into a stacked-chart shape.
 *
 * - Buckets are emitted in chronological order (by bucketStart).
 * - Series keys are ordered by total descending (largest band at the bottom of
 *   the stack), so the dominant cause/disease reads first.
 * - Every point carries a value for EVERY series key (0-filled) so the stacked
 *   area chart has no gaps.
 */
export function pivotStackedSeries(rows: SeriesBucketRow[]): StackedSeries {
  if (rows.length === 0) return { seriesKeys: [], points: [] };

  // Aggregate per-series totals (for ordering) and per-bucket maps.
  const seriesTotals = new Map<string, number>();
  const buckets = new Map<string, { start: string; label: string; values: Map<string, number> }>();

  for (const r of rows) {
    seriesTotals.set(r.seriesKey, (seriesTotals.get(r.seriesKey) ?? 0) + r.count);
    const b = buckets.get(r.bucketStart) ?? {
      start: r.bucketStart,
      label: r.bucketLabel,
      values: new Map<string, number>(),
    };
    b.values.set(r.seriesKey, (b.values.get(r.seriesKey) ?? 0) + r.count);
    buckets.set(r.bucketStart, b);
  }

  const seriesKeys = [...seriesTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);

  const points: StackedPoint[] = [...buckets.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => {
      const values: Record<string, number> = {};
      for (const key of seriesKeys) values[key] = b.values.get(key) ?? 0;
      return { x: b.label, values };
    });

  return { seriesKeys, points };
}

/**
 * k-anonymity for a single-series trend.
 *
 * Per-bucket counts below `k` are noise that can re-identify a small cohort
 * (e.g. "1 bite in this barrio this week"). They are suppressed to 0 in the
 * returned series and counted in `suppressedCount` so the UI can disclose
 * "N períodos ocultos (privacidad)".
 *
 * NOTE: 0-counts are NOT suppressed (a genuine zero is a true, non-identifying
 * signal — the operator needs to see the dip). Only 1..k-1 are masked.
 */
export function suppressSmallBuckets(
  points: Array<{ x: string; y: number }>,
  k = 5,
): { points: Array<{ x: string; y: number }>; suppressedCount: number } {
  let suppressedCount = 0;
  const masked = points.map((p) => {
    if (p.y > 0 && p.y < k) {
      suppressedCount += 1;
      return { x: p.x, y: 0 };
    }
    return p;
  });
  return { points: masked, suppressedCount };
}

/**
 * k-anonymity for a stacked (multi-series) trend.
 *
 * Each (bucket, series) cell with a small non-zero count is masked to 0 and
 * tallied. Same rule as the single-series variant, applied per cell.
 */
export function suppressSmallStackedCells(
  series: StackedSeries,
  k = 5,
): { series: StackedSeries; suppressedCount: number } {
  let suppressedCount = 0;
  const points = series.points.map((p) => {
    const values: Record<string, number> = {};
    for (const key of series.seriesKeys) {
      const v = p.values[key] ?? 0;
      if (v > 0 && v < k) {
        suppressedCount += 1;
        values[key] = 0;
      } else {
        values[key] = v;
      }
    }
    return { x: p.x, values };
  });
  return { series: { seriesKeys: series.seriesKeys, points }, suppressedCount };
}

/**
 * Format a bucket-start Date into an es-AR x-axis label for the given granularity.
 *  - week  → ISO week label "IYYY-Www" (stable, sortable, locale-neutral).
 *  - month → "ene 26", "feb 26" … (es-AR short month + 2-digit year: month
 *    granularity only kicks in on >120-day windows, which span calendar years,
 *    so a bare "jul." appears twice on a trailing-12m axis and the operator
 *    cannot tell which year a spike belongs to — dataviz review 2026-07-23;
 *    mirrors the ISO-week label's year-carrying design).
 */
export function formatBucketLabel(start: Date, granularity: BucketGranularity): string {
  if (granularity === "month") {
    // Render in UTC: the bucket start is a UTC instant from date_trunc; using the
    // host TZ could roll a month-start (00:00 UTC) back into the prior month.
    return start.toLocaleString("es-AR", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return isoWeekLabel(start);
}

/** "IYYY-Www" ISO-week label for a date (e.g. 2026-W03). */
export function isoWeekLabel(d: Date): string {
  // Copy and shift to the Thursday of the ISO week (ISO weeks belong to the
  // year of their Thursday). Work in UTC to avoid TZ drift.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Sun=0 → 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
