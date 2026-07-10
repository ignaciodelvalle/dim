// Pure binning for the TimeScrubber signal histogram (task #65, kepler pattern).
//
// Scrubbing was blind: the operator dragged the time slider with no idea WHERE
// the activity peaks are. This bins the per-event timestamps of the active
// temporal layers into a small histogram drawn UNDER the scrubber track, so an
// operator can jump straight to a peak.
//
// PRIVACY: the bins are SCOPE-AGGREGATE counts (a bin is a total across the whole
// visible scope), never per-unit — so the histogram can no more reveal a k-anon
// suppressed cell than a national event total can. It is fed ONLY from timestamps
// that already reached the client (the real-event dots the operator is cleared to
// see in points mode); a suppressed aggregate cell carries no per-event timestamp,
// so it never enters the bins.
//
// Kept pure (no React, no maplibre) so the binning is unit-testable. It reuses the
// existing numeric bucketer from legend-histogram.ts.

import { valueHistogram } from "@/components/panorama/legend-histogram";

/**
 * Bin event timestamps into `binCount` equal-width buckets over [sinceMs, untilMs],
 * returning the per-bin COUNT array (bin 0 = oldest). Accepts ISO strings or epoch
 * millis; unparseable entries are skipped. Values outside the window are clamped
 * into the edge bins by the underlying bucketer (events are server-filtered to the
 * window, so this only guards a boundary rounding). Returns an empty array for a
 * degenerate window (since ≥ until) or a non-positive binCount.
 *
 * Default 48 bins — within the kepler-style 40–60 range and a clean divisor of a
 * typical track width.
 */
export function binTimestamps(
  times: ReadonlyArray<string | number>,
  sinceMs: number,
  untilMs: number,
  binCount = 48,
): number[] {
  const ms: number[] = [];
  for (const t of times) {
    const v = typeof t === "number" ? t : Date.parse(t);
    if (Number.isFinite(v)) ms.push(v);
  }
  return valueHistogram(ms, sinceMs, untilMs, binCount).map((b) => b.count);
}
