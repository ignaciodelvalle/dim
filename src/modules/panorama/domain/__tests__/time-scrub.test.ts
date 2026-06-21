// Unit tests for the F4 temporal-reproduction primitives (pure domain).
// No DB, no DOM — just date arithmetic over a fixed [since, until] window.

import { describe, expect, it } from "vitest";

import {
  buildScrubWindow,
  clampAsOf,
  dateToDayIndex,
  dayIndexToDate,
  formatAsOfLabel,
  nextPlayIndex,
  parseAsOf,
} from "@/src/modules/panorama/domain/time-scrub";

const d = (iso: string) => new Date(iso);

describe("buildScrubWindow", () => {
  it("counts whole UTC days from start-of-since to until", () => {
    // 12-day cluster window (the Salta rabies demo moment).
    const win = buildScrubWindow(d("2026-06-01T09:30:00Z"), d("2026-06-13T18:00:00Z"));
    // since floored to 2026-06-01T00:00Z; until floored to 2026-06-13T00:00Z → 12 days.
    expect(win.steps).toBe(12);
    expect(win.since.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("collapses an inverted or single-instant window to zero steps", () => {
    expect(buildScrubWindow(d("2026-06-10T00:00:00Z"), d("2026-06-10T00:00:00Z")).steps).toBe(0);
    expect(buildScrubWindow(d("2026-06-10T00:00:00Z"), d("2026-06-01T00:00:00Z")).steps).toBe(0);
  });
});

describe("dayIndexToDate / dateToDayIndex", () => {
  const win = buildScrubWindow(d("2026-06-01T00:00:00Z"), d("2026-06-13T00:00:00Z"));

  it("maps index 0 to since and the last index to until", () => {
    expect(dayIndexToDate(win, 0).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(dayIndexToDate(win, win.steps).toISOString()).toBe(win.until.toISOString());
  });

  it("maps an interior index to since + n days", () => {
    expect(dayIndexToDate(win, 5).toISOString()).toBe("2026-06-06T00:00:00.000Z");
  });

  it("clamps out-of-range indices into [0, steps]", () => {
    expect(dayIndexToDate(win, -3).toISOString()).toBe(win.since.toISOString());
    expect(dayIndexToDate(win, 999).toISOString()).toBe(win.until.toISOString());
  });

  it("round-trips a date back to its index", () => {
    expect(dateToDayIndex(win, d("2026-06-06T00:00:00Z"))).toBe(5);
    expect(dateToDayIndex(win, d("2026-05-01T00:00:00Z"))).toBe(0); // clamped low
    expect(dateToDayIndex(win, d("2027-01-01T00:00:00Z"))).toBe(win.steps); // clamped high
  });
});

describe("nextPlayIndex", () => {
  const win = buildScrubWindow(d("2026-06-01T00:00:00Z"), d("2026-06-04T00:00:00Z")); // 3 steps

  it("advances one day per tick", () => {
    expect(nextPlayIndex(win, 0)).toBe(1);
    expect(nextPlayIndex(win, 1)).toBe(2);
  });

  it("returns null at the live edge so the loop stops", () => {
    expect(nextPlayIndex(win, win.steps)).toBeNull();
    expect(nextPlayIndex(win, 999)).toBeNull();
  });
});

describe("clampAsOf", () => {
  const since = d("2026-06-01T00:00:00Z");
  const until = d("2026-06-13T00:00:00Z");

  it("returns null for absent or invalid input (treated as live)", () => {
    expect(clampAsOf(null, since, until)).toBeNull();
    expect(clampAsOf(new Date("nope"), since, until)).toBeNull();
  });

  it("clamps below since up to since (cannot widen the window)", () => {
    expect(clampAsOf(d("2026-05-01T00:00:00Z"), since, until)?.toISOString()).toBe(
      since.toISOString(),
    );
  });

  it("clamps above until down to until (cannot exceed the live edge)", () => {
    expect(clampAsOf(d("2026-12-31T00:00:00Z"), since, until)?.toISOString()).toBe(
      until.toISOString(),
    );
  });

  it("passes an in-range as-of through unchanged", () => {
    const at = d("2026-06-06T12:00:00Z");
    expect(clampAsOf(at, since, until)?.toISOString()).toBe(at.toISOString());
  });
});

describe("parseAsOf", () => {
  it("parses a valid ISO string", () => {
    expect(parseAsOf("2026-06-06T00:00:00Z")?.toISOString()).toBe("2026-06-06T00:00:00.000Z");
  });
  it("returns null for absent or malformed input", () => {
    expect(parseAsOf(null)).toBeNull();
    expect(parseAsOf(undefined)).toBeNull();
    expect(parseAsOf("")).toBeNull();
    expect(parseAsOf("not-a-date")).toBeNull();
  });
});

describe("formatAsOfLabel", () => {
  it("renders a stable es-AR UTC day label", () => {
    const label = formatAsOfLabel(d("2026-06-06T15:00:00Z"));
    // Day matches the UTC date (06), not a local-tz shifted day.
    expect(label).toContain("06");
    expect(label).toContain("2026");
  });
});
