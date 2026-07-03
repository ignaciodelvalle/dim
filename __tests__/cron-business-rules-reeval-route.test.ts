// Unit tests for GET /api/cron/business-rules-reeval.
//
// Branches:
//   1. Auth failure → 401
//   2. Auth success + db query returns rows + reEvaluatePppClassificationChange succeeds → 200
//   3. Auth success + handler throws → 500
//
// Both db (@/db) and reEvaluatePppClassificationChange
// (@/lib/infra/business-rules-reeval) are mocked so the test stays pure (no
// DB access). NOTE: the mock path was previously "@/lib/business-rules-
// reeval" (stale — the module lives at "@/lib/infra/business-rules-reeval"),
// so vi.doMock never intercepted the real import and this suite silently ran
// against the REAL (unmocked) implementation. Fixed alongside the
// admin-rules-console reeval generalization.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("GET /api/cron/business-rules-reeval", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/infra/business-rules-reeval");
    vi.doUnmock("@/lib/infra/case-cron");
    vi.doUnmock("@/db");
  });

  function mockDeps(
    rows: { country: string; province: string | null; locality: string | null }[],
    reEvalResult: {
      scanned: number;
      flippedToPpp: number;
      flippedToNonPpp: number;
      notified: number;
    },
  ) {
    // Mock the drizzle chain: db.select().from().where() → rows
    const whereMock = vi.fn().mockResolvedValue(rows);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    const dbMock = { select: selectMock };

    vi.doMock("@/db", () => ({
      db: dbMock,
      govtBusinessRules: {},
    }));

    const reEvalMock = vi.fn().mockResolvedValue(reEvalResult);
    vi.doMock("@/lib/infra/business-rules-reeval", () => ({
      reEvaluatePppClassificationChange: reEvalMock,
    }));

    // Telemetry wrapper (fleet telemetry, 2026-07-03): passthrough so the
    // pure route test doesn't need a cron_runs-capable db mock.
    vi.doMock("@/lib/infra/case-cron", () => ({
      withCronRun: (_name: string, fn: () => Promise<unknown>) => fn(),
    }));

    return { reEvalMock };
  }

  async function callRoute(headers: Record<string, string>) {
    const { GET } = await import("@/app/api/cron/business-rules-reeval/route");
    const req = new Request("http://test.local/api/cron/business-rules-reeval", { headers });
    return GET(req as unknown as Parameters<typeof GET>[0]);
  }

  it("returns 401 when no auth header is provided", async () => {
    mockDeps([], { scanned: 0, flippedToPpp: 0, flippedToNonPpp: 0, notified: 0 });
    const res = await callRoute({});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 when x-cron-secret does not match", async () => {
    mockDeps([], { scanned: 0, flippedToPpp: 0, flippedToNonPpp: 0, notified: 0 });
    const res = await callRoute({ "x-cron-secret": "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with aggregated stats when auth passes and no extra jurisdiction rows", async () => {
    // No extra rows → only the default AR scope is processed.
    const { reEvalMock } = mockDeps([], {
      scanned: 10,
      flippedToPpp: 2,
      flippedToNonPpp: 1,
      notified: 3,
    });
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      scopes: 1,
      scanned: 10,
      flippedToPpp: 2,
      flippedToNonPpp: 1,
      notified: 3,
    });
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    // One call for the default AR scope.
    expect(reEvalMock).toHaveBeenCalledTimes(1);
    expect(reEvalMock).toHaveBeenCalledWith({ country: "AR", province: null, locality: null });
  });

  it("returns 200 and processes multiple jurisdiction scopes when db rows are returned", async () => {
    const extraRows = [
      { country: "AR", province: "Buenos Aires", locality: null },
      { country: "AR", province: "Buenos Aires", locality: "Mar del Plata" },
    ];
    const { reEvalMock } = mockDeps(extraRows, {
      scanned: 5,
      flippedToPpp: 0,
      flippedToNonPpp: 0,
      notified: 0,
    });
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    // 1 default AR + 2 extra rows = 3 scopes total
    expect(body.scopes).toBe(3);
    expect(body.scanned).toBe(15); // 3 × 5
    // reEvalMock called once per scope
    expect(reEvalMock).toHaveBeenCalledTimes(3);
  });

  it("returns 200 when auth matches via Authorization: Bearer", async () => {
    mockDeps([], { scanned: 0, flippedToPpp: 0, flippedToNonPpp: 0, notified: 0 });
    const res = await callRoute({ authorization: "Bearer test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 500 when db query throws", async () => {
    // Override db mock to throw during the select
    const whereMock = vi.fn().mockRejectedValue(new Error("db query failed"));
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });
    vi.doMock("@/db", () => ({
      db: { select: selectMock },
      govtBusinessRules: {},
    }));
    vi.doMock("@/lib/infra/business-rules-reeval", () => ({
      reEvaluatePppClassificationChange: vi.fn(),
    }));
    // This case builds its own mocks (doesn't go through mockDeps), so the
    // telemetry-wrapper passthrough must be re-declared here too.
    vi.doMock("@/lib/infra/case-cron", () => ({
      withCronRun: (_name: string, fn: () => Promise<unknown>) => fn(),
    }));
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "db query failed" });
  });
});
