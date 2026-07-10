// Tests for the TimeScrubber signal-histogram binning (task #65).

import { describe, expect, it } from "vitest";

import { binTimestamps } from "@/components/panorama/signal-histogram";

const DAY = 86_400_000;
const since = Date.UTC(2026, 0, 1);
const until = since + 10 * DAY;

describe("binTimestamps", () => {
  it("counts events into equal-width bins over the window", () => {
    // Two events in the first tenth, one in the last tenth.
    const bins = binTimestamps(
      [
        new Date(since + 0.1 * DAY).toISOString(),
        new Date(since + 0.2 * DAY).toISOString(),
        new Date(since + 9.5 * DAY).toISOString(),
      ],
      since,
      until,
      10,
    );
    expect(bins).toHaveLength(10);
    expect(bins[0]).toBe(2);
    expect(bins[9]).toBe(1);
    expect(bins.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("accepts epoch millis as well as ISO strings", () => {
    const bins = binTimestamps([since + 5 * DAY], since, until, 10);
    expect(bins[5]).toBe(1);
  });

  it("skips unparseable timestamps", () => {
    const bins = binTimestamps(["not-a-date", ""], since, until, 10);
    expect(bins.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("returns an empty array for a degenerate window", () => {
    expect(binTimestamps([since], until, since, 10)).toEqual([]);
    expect(binTimestamps([since], since, until, 0)).toEqual([]);
  });
});
