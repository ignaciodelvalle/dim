// /admin/sistema crash canary — clickthrough audit 2026-07-03 (digest
// 1282362471, confirmed by two independent browser passes).
//
// The page's data fetchers all resolved, but the RENDER crashed:
// fetchGovtActivity declared lastActionAt as Date while the raw-sql
// MAX() aggregate arrives as a string at runtime, and
// sortGovtActivityByActivity called .getTime() on it. A fetch-only test
// cannot catch that class, so this canary runs the page's exact data path
// INCLUDING the sort, and pins the runtime shape of the declared types.

import { describe, expect, it } from "vitest";

import {
  fetchCronRuns,
  fetchDecisionsMetrics,
  fetchFailedCronNames,
  fetchGovtActivity,
  fetchQueueHealth,
  fetchUserMetrics,
  sortGovtActivityByActivity,
} from "@/lib/analytics/admin-metrics";
import { fetchEnoSla } from "@/lib/analytics/surveillance-metrics";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";

describe("/admin/sistema data path", () => {
  it("all six page fetchers resolve", async () => {
    const adminCtx = buildProjectionContext({ role: "admin" }, [], windows.trailing12m());
    const results = await Promise.allSettled([
      fetchUserMetrics(),
      fetchQueueHealth(),
      fetchDecisionsMetrics(),
      fetchGovtActivity(),
      fetchCronRuns(),
      fetchEnoSla(adminCtx),
    ]);
    const names = [
      "fetchUserMetrics",
      "fetchQueueHealth",
      "fetchDecisionsMetrics",
      "fetchGovtActivity",
      "fetchCronRuns",
      "fetchEnoSla",
    ];
    const failures = results
      .map((r, i) => ({ name: names[i], r }))
      .filter((x) => x.r.status === "rejected")
      .map((x) => `${x.name}: ${(x.r as PromiseRejectedResult).reason}`);
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("govt activity rows carry REAL Dates and survive the page's sort", async () => {
    const rows = await fetchGovtActivity();
    for (const row of rows) {
      expect(
        row.lastActionAt === null || row.lastActionAt instanceof Date,
        `${row.displayName}: lastActionAt must be Date|null, got ${typeof row.lastActionAt}`,
      ).toBe(true);
    }
    // The exact call that crashed the page — must not throw.
    expect(() => sortGovtActivityByActivity(rows)).not.toThrow();
  });

  // Crons-down banner data path (operator-trust T3). The DISTINCT ON query runs
  // against the shared local DB; pin that it resolves to a string[] whose
  // members are a subset of the cron names fetchCronRuns reports as failed.
  it("fetchFailedCronNames returns the latest-failed cron names", async () => {
    const [failed, all] = await Promise.all([fetchFailedCronNames(), fetchCronRuns()]);
    expect(Array.isArray(failed)).toBe(true);
    for (const name of failed) {
      expect(typeof name).toBe("string");
    }
    const failedFromRuns = new Set(
      all.filter((c) => c.lastStatus === "failed").map((c) => c.cronName),
    );
    expect(new Set(failed)).toEqual(failedFromRuns);
  });
});
