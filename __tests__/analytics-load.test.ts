// WP4 / D2 — loadWithTimeout: bounded loading for admin analytics pages.

import { describe, expect, it, vi } from "vitest";

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

  it("returns reason 'timeout' + a correlation id when the deadline wins", async () => {
    // A promise that resolves AFTER the deadline → timeout wins.
    const res = await loadWithTimeout(tick(200, "late"), 20);
    expect(res).toMatchObject({ ok: false, reason: "timeout" });
    if (!res.ok) expect(res.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("returns reason 'error' + a correlation id when the promise rejects", async () => {
    const res = await loadWithTimeout(Promise.reject(new Error("boom")), 1000);
    expect(res).toMatchObject({ ok: false, reason: "error" });
    if (!res.ok) expect(res.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("logs the real error server-side tagged with the SAME id the caller gets (QA fix 6)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await loadWithTimeout(Promise.reject(new Error("boom-real")), 1000);
      expect(res.ok).toBe(false);
      const id = res.ok ? undefined : res.id;
      const call = spy.mock.calls.find((c) => c[0] === "[reportError]");
      expect(call).toBeDefined();
      const payload = call?.[1] as { message: string; correlationId: string; source: string };
      expect(payload.message).toBe("boom-real");
      expect(payload.correlationId).toBe(id);
      expect(payload.source).toBe("loadWithTimeout");
    } finally {
      spy.mockRestore();
    }
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
