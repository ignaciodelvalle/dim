import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatCount,
  formatDateTime,
  formatDateTimeLegal,
  formatDelta,
  formatPercent,
  formatRate,
  relativeDaysShort,
} from "./format";

// Regression coverage for the outreach "hace 20624d" bug: never-vaccinated pets
// carry an epoch-sentinel date (new Date(0)), and a 56-year "days ago" value is
// nonsense. relativeDaysShort must keep real overdue counts legible while
// refusing to print an absurd relative figure. (Exec E2E gate.)
describe("relativeDaysShort", () => {
  afterEach(() => vi.useRealTimers());

  const fixedNow = new Date("2026-06-20T12:00:00.000Z");

  function daysAgo(n: number): Date {
    return new Date(fixedNow.getTime() - n * 86_400_000);
  }

  it("returns the empty marker for null/undefined", () => {
    expect(relativeDaysShort(null)).toBe("—");
    expect(relativeDaysShort(undefined)).toBe("—");
  });

  it("treats the epoch sentinel (new Date(0)) as 'no record', not 56 years", () => {
    expect(relativeDaysShort(new Date(0))).toBe("—");
  });

  it("returns the empty marker for an unparseable date", () => {
    expect(relativeDaysShort("not-a-date")).toBe("—");
  });

  it("returns 'hoy' for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(fixedNow)).toBe("hoy");
  });

  it("keeps a legible day count for real overdue values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(daysAgo(400))).toBe("hace 400d");
    expect(relativeDaysShort(daysAgo(900))).toBe("hace 900d");
  });

  it("stays relative right up to the ~10-year threshold, then switches to absolute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    expect(relativeDaysShort(daysAgo(3650))).toBe("hace 3650d");
    expect(relativeDaysShort(daysAgo(3651))).not.toMatch(/hace \d+d/);
  });

  it("never prints an absurd 'hace 20624d' — falls back to an absolute date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const out = relativeDaysShort(daysAgo(20624));
    expect(out).not.toMatch(/hace \d+d/);
    expect(out).not.toContain("20624");
  });
});

// ---------------------------------------------------------------------------
// Numeric KPI / metric formatters (es-AR) — KPI precision audit 2026-07-07
// ---------------------------------------------------------------------------
//
// Pins the es-AR locale contract: COMMA decimal separator, DOT thousands
// separator. A regression here means dashboards render "41.3%" (wrong locale)
// or drop the decimal a fetcher worked to preserve.

describe("formatCount", () => {
  it("uses the es-AR thousands separator (dot)", () => {
    expect(formatCount(1982)).toBe("1.982");
    expect(formatCount(12345)).toBe("12.345");
    expect(formatCount(0)).toBe("0");
  });

  it("never fabricates a decimal — rounds to an integer", () => {
    expect(formatCount(41.9)).toBe("42");
    expect(formatCount(41.4)).toBe("41");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
    expect(formatCount(Number.NaN)).toBe("—");
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("shows one decimal with an es-AR comma", () => {
    expect(formatPercent(41.3)).toBe("41,3%");
    expect(formatPercent(72)).toBe("72,0%");
    expect(formatPercent(66.666)).toBe("66,7%"); // rounds to 1 decimal
    expect(formatPercent(0.4)).toBe("0,4%"); // a tiny non-zero survives
  });

  it("renders exactly 0 and 100 clean (no trailing decimal)", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("honours a custom decimals option", () => {
    expect(formatPercent(41.34, { decimals: 2 })).toBe("41,34%");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("formatRate", () => {
  it("shows one decimal with an es-AR comma and no unit", () => {
    expect(formatRate(3.5)).toBe("3,5");
    expect(formatRate(3)).toBe("3,0");
    expect(formatRate(12.34)).toBe("12,3");
  });

  it("uses the es-AR thousands separator for large rates", () => {
    expect(formatRate(1234.5)).toBe("1.234,5");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("prefixes an explicit sign and uses an es-AR comma", () => {
    expect(formatDelta(2.4)).toBe("+2,4");
    expect(formatDelta(-1)).toBe("-1,0");
    expect(formatDelta(0)).toBe("0,0"); // zero carries no sign
  });

  it("appends a unit suffix when given", () => {
    expect(formatDelta(2.4, { unit: "pp" })).toBe("+2,4pp");
    expect(formatDelta(-3, { unit: "%", decimals: 0 })).toBe("-3%");
  });

  it("returns the empty marker for null/undefined/non-finite", () => {
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(Number.NaN)).toBe("—");
  });
});

// Legal-document timestamps (MPF/PPP/travel PDF exports — staging validation
// 2026-07-04, bug 4): the exported PDF printed the server's UTC clock
// ("generado 06:27:41" for a ~17:47 ART generation) with no timezone label.
describe("formatDateTimeLegal", () => {
  it("pins to Argentina time regardless of the ambient/server zone", () => {
    // 2026-07-04T20:47:41Z is 17:47:41 in America/Argentina/Buenos_Aires (UTC-3).
    const out = formatDateTimeLegal(new Date("2026-07-04T20:47:41Z"));
    expect(out).toContain("17:47:41");
    expect(out).not.toContain("20:47:41");
  });

  it("carries an explicit '(hora de Argentina)' label and seconds precision", () => {
    const out = formatDateTimeLegal("2026-07-04T20:47:41Z");
    expect(out).toMatch(/\(hora de Argentina\)$/);
    expect(out).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(out).toContain("04/07/2026");
  });

  it("returns the empty marker for null/invalid input", () => {
    expect(formatDateTimeLegal(null)).toBe("—");
    expect(formatDateTimeLegal("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("pins to Argentina time (UTC-3) — never the ambient zone", () => {
    // 2026-07-04T10:59:41Z → 07:59 ART. The postulación page previously
    // rendered the raw UTC clock via a bare toLocaleString.
    const out = formatDateTime(new Date("2026-07-04T10:59:41Z"));
    expect(out).toContain("07:59");
    expect(out).toContain("4 de julio de 2026");
  });
});
