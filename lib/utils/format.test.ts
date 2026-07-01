import { afterEach, describe, expect, it, vi } from "vitest";

import { relativeDaysShort } from "./format";

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
