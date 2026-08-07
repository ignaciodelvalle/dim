// WP4 / D2 — loadWithTimeout: bounded loading for admin analytics pages.

import { describe, expect, it } from "vitest";

import {
  type AnalyticsLoad,
  analyticsRetryHref,
  loadWithTimeout,
} from "@/lib/analytics/analytics-load";

const tick = (ms: number, value: unknown) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe("loadWithTimeout()", () => {
  it("returns the value when the promise settles before the deadline", async () => {
    const res = await loadWithTimeout(Promise.resolve(42), 1000);
    expect(res).toEqual<AnalyticsLoad<number>>({ ok: true, value: 42 });
  });

  it("returns reason 'timeout' when the deadline wins", async () => {
    // A promise that resolves AFTER the deadline → timeout wins.
    const res = await loadWithTimeout(tick(200, "late"), 20);
    expect(res).toEqual({ ok: false, reason: "timeout" });
  });

  it("returns reason 'error' when the promise rejects", async () => {
    const res = await loadWithTimeout(Promise.reject(new Error("boom")), 1000);
    expect(res).toEqual({ ok: false, reason: "error" });
  });

  it("does not reject — a rejecting promise never throws out of the helper", async () => {
    await expect(loadWithTimeout(Promise.reject(new Error("x")), 1000)).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("analyticsRetryHref()", () => {
  it("returns the bare path when there are no params", () => {
    expect(analyticsRetryHref("/admin/programa", {})).toBe("/admin/programa");
  });

  it("keeps the period filter on retry", () => {
    expect(analyticsRetryHref("/admin/censo", { period: "90d" })).toBe("/admin/censo?period=90d");
  });

  it("drops undefined/empty params", () => {
    expect(
      analyticsRetryHref("/admin/poblacion", { period: undefined, from: "", to: "2026-01-01" }),
    ).toBe("/admin/poblacion?to=2026-01-01");
  });
});
