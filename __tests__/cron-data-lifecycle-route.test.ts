// Unit tests for the HTTP layer of GET /api/cron/data-lifecycle.
//
// SCOPE, and why this is a second file. __tests__/cron-data-lifecycle.test.ts
// calls the lib functions directly against the local DB on purpose — its own
// header says so — so the purge SQL is exercised for real there. What that file
// cannot see is what the ROUTE does with the result, and the finding this file
// exists for is exactly that: a run that drained only part of a table returned
// `ok: true` with a 200 and logged NOTHING, so the `backlogged` flags were
// visible only to someone already reading the JSON.
//
// Both @/db and @/lib/infra/data-lifecycle are mocked — same harness as
// cron-purge-scan-events-route.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DataLifecycleResult } from "@/lib/infra/data-lifecycle";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const FAKE_RUN_ID = "fake-run-id-data-lifecycle";

const DRAINED: DataLifecycleResult = {
  notificationsDeleted: 3,
  rateLimitBucketsDeleted: 7,
  cronRunsDeleted: 1,
  backlogged: { notifications: false, rateLimitBuckets: false, cronRuns: false },
};

describe("GET /api/cron/data-lifecycle — backlog reporting", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/infra/data-lifecycle");
    vi.doUnmock("@/db");
  });

  function mockDeps(purge: () => Promise<DataLifecycleResult>) {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    const updateMock = vi.fn().mockReturnValue({ set: setMock });
    const returningMock = vi.fn().mockResolvedValue([{ id: FAKE_RUN_ID }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

    vi.doMock("@/db", () => ({
      db: { insert: insertMock, update: updateMock },
      cronRuns: { id: "id" },
    }));

    vi.doMock("@/lib/infra/data-lifecycle", () => ({
      runDataLifecyclePurge: vi.fn().mockImplementation(purge),
    }));
  }

  async function callRoute() {
    const { GET } = await import("@/app/api/cron/data-lifecycle/route");
    const req = new Request("http://test.local/api/cron/data-lifecycle", {
      headers: { "x-cron-secret": "test-secret" },
    });
    return GET(req as unknown as Parameters<typeof GET>[0]);
  }

  /** Every string console.warn was called with, joined. */
  function warnings(): string {
    return warnSpy.mock.calls.map((args: unknown[]) => args.join(" ")).join("\n");
  }

  it("warns and NAMES the tables when a purge stopped short", async () => {
    mockDeps(async () => ({
      ...DRAINED,
      backlogged: { notifications: true, rateLimitBuckets: true, cronRuns: false },
    }));

    const res = await callRoute();

    // The run itself succeeded — this is a backlog, not a failure. The point is
    // that a 200 no longer hides it.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    const logged = warnings();
    expect(logged).toContain("backlog remains");
    expect(logged).toContain("notifications");
    expect(logged).toContain("rate_limit_buckets");
    // NON-VACUITY: a warning that names every table on every backlog says
    // nothing about WHICH one is behind. cron_runs drained, so it must not
    // appear — and `notifications` above must not be satisfied by the substring
    // inside some other word.
    expect(logged).not.toContain("cron_runs");
  });

  it("says nothing when all three targets drained", async () => {
    mockDeps(async () => DRAINED);

    const res = await callRoute();

    expect(res.status).toBe(200);
    expect(warnings()).not.toContain("backlog remains");
  });

  it("does NOT report a backlog on a failed run — nothing ran, which is a different fact", async () => {
    // The route seeds `counts` with all three flags TRUE so a failed run cannot
    // claim three drained tables. That initial shape must not be re-reported as
    // a backlog: the failure already logs an error and pages a human, and
    // "three tables are behind" would be a fabricated measurement.
    mockDeps(async () => {
      throw new Error("pooler down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await callRoute();

    expect(res.status).toBe(500);
    expect(warnings()).not.toContain("backlog remains");
  });
});
