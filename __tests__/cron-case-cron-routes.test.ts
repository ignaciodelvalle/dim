// Unit tests for the case-cron route family.
//
// Routes under test:
//   GET /api/cron/close-followup-expired-adoptions
//   GET /api/cron/close-stale-lost-episodes
//   GET /api/cron/escalate-stale-disputes
//   GET /api/cron/escalate-stale-welfare-cases
//   GET /api/cron/expire-cross-org-transfers
//
// All five share the same shape: checkCronSecret(req) → auth guard, then
// runCaseCron({...}) → JSON response. We mock @/lib/case-cron so both the
// auth helper and the runner are under our control, keeping tests pure (no DB).
//
// Branch coverage targets per route:
//   - Missing secret → 401
//   - Wrong secret → 401
//   - Happy path (authorized, runCaseCron returns ok) → 200
//   - runCaseCron returns failed status → 200 (the route always returns 200 for cron status)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

// ---------------------------------------------------------------------------
// Helper: build the checkCronSecret mock behavior (auth pass or fail)
// ---------------------------------------------------------------------------

function makeAuthFail(error = "Unauthorized"): { ok: false; error: string; status: number } {
  return { ok: false, error, status: 401 };
}

function makeRunResult(
  overrides: Partial<{ runId: string; status: "ok" | "failed"; itemsProcessed: number }> = {},
): { runId: string; status: "ok" | "failed"; itemsProcessed: number; errors: unknown[] } {
  return {
    runId: "run-uuid-1234",
    status: "ok",
    itemsProcessed: 0,
    errors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// close-followup-expired-adoptions
// ---------------------------------------------------------------------------

describe("GET /api/cron/close-followup-expired-adoptions", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/case-cron");
    vi.doUnmock("@/lib/case-closers/close-followup-expired-adoptions");
  });

  async function callRoute(authResult: ReturnType<typeof makeAuthFail> | null) {
    const runCaseCronMock = vi.fn().mockResolvedValue(makeRunResult({ itemsProcessed: 2 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(authResult),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/lib/case-closers/close-followup-expired-adoptions", () => ({
      findFollowupExpiredAdoptions: vi.fn(),
      closeFollowupExpiredAdoption: vi.fn(),
    }));
    const { GET } = await import("@/app/api/cron/close-followup-expired-adoptions/route");
    const req = new Request("http://test.local/api/cron/close-followup-expired-adoptions", {
      headers: {},
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    return { res, runCaseCronMock };
  }

  it("returns 401 when auth fails", async () => {
    const { res } = await callRoute(makeAuthFail());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 200 with runCaseCron result when auth passes", async () => {
    const { res, runCaseCronMock } = await callRoute(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      itemsProcessed: 2,
      runId: "run-uuid-1234",
    });
    expect(runCaseCronMock).toHaveBeenCalledOnce();
  });

  it("returns 200 even when runCaseCron status is failed", async () => {
    const runCaseCronMock = vi
      .fn()
      .mockResolvedValue(makeRunResult({ status: "failed", itemsProcessed: 0 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(null),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/lib/case-closers/close-followup-expired-adoptions", () => ({
      findFollowupExpiredAdoptions: vi.fn(),
      closeFollowupExpiredAdoption: vi.fn(),
    }));
    const { GET } = await import("@/app/api/cron/close-followup-expired-adoptions/route");
    const req = new Request("http://test.local/api/cron/close-followup-expired-adoptions", {
      headers: {},
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// close-stale-lost-episodes
// ---------------------------------------------------------------------------

describe("GET /api/cron/close-stale-lost-episodes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/case-cron");
    vi.doUnmock("@/lib/case-closers/close-stale-lost-episodes");
  });

  async function callRoute(authResult: ReturnType<typeof makeAuthFail> | null) {
    const runCaseCronMock = vi.fn().mockResolvedValue(makeRunResult({ itemsProcessed: 1 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(authResult),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/lib/case-closers/close-stale-lost-episodes", () => ({
      findStaleLostEpisodes: vi.fn(),
      closeStaleLostEpisode: vi.fn(),
    }));
    const { GET } = await import("@/app/api/cron/close-stale-lost-episodes/route");
    const req = new Request("http://test.local/api/cron/close-stale-lost-episodes", {
      headers: {},
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    return { res, runCaseCronMock };
  }

  it("returns 401 when auth fails", async () => {
    const { res } = await callRoute(makeAuthFail());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 200 with runCaseCron result when auth passes", async () => {
    const { res, runCaseCronMock } = await callRoute(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      itemsProcessed: 1,
      runId: "run-uuid-1234",
    });
    expect(runCaseCronMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// escalate-stale-disputes
// ---------------------------------------------------------------------------

describe("GET /api/cron/escalate-stale-disputes", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/case-cron");
    vi.doUnmock("@/lib/case-closers/escalate-stale-disputes");
  });

  async function callRoute(authResult: ReturnType<typeof makeAuthFail> | null) {
    const runCaseCronMock = vi.fn().mockResolvedValue(makeRunResult({ itemsProcessed: 3 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(authResult),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/lib/case-closers/escalate-stale-disputes", () => ({
      findStaleDisputes: vi.fn(),
      escalateStaleDispute: vi.fn(),
    }));
    const { GET } = await import("@/app/api/cron/escalate-stale-disputes/route");
    const req = new Request("http://test.local/api/cron/escalate-stale-disputes", { headers: {} });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    return { res, runCaseCronMock };
  }

  it("returns 401 when auth fails", async () => {
    const { res } = await callRoute(makeAuthFail());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 200 with runCaseCron result when auth passes", async () => {
    const { res, runCaseCronMock } = await callRoute(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      itemsProcessed: 3,
      runId: "run-uuid-1234",
    });
    expect(runCaseCronMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// escalate-stale-welfare-cases
// ---------------------------------------------------------------------------

describe("GET /api/cron/escalate-stale-welfare-cases", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/case-cron");
    vi.doUnmock("@/lib/case-closers/escalate-stale-welfare-cases");
  });

  async function callRoute(authResult: ReturnType<typeof makeAuthFail> | null) {
    const runCaseCronMock = vi.fn().mockResolvedValue(makeRunResult({ itemsProcessed: 0 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(authResult),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/lib/case-closers/escalate-stale-welfare-cases", () => ({
      findStaleWelfareCases: vi.fn(),
      escalateStaleWelfareCase: vi.fn(),
    }));
    const { GET } = await import("@/app/api/cron/escalate-stale-welfare-cases/route");
    const req = new Request("http://test.local/api/cron/escalate-stale-welfare-cases", {
      headers: {},
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    return { res, runCaseCronMock };
  }

  it("returns 401 when auth fails", async () => {
    const { res } = await callRoute(makeAuthFail());
    expect(res.status).toBe(401);
  });

  it("returns 200 with runCaseCron result when auth passes", async () => {
    const { res, runCaseCronMock } = await callRoute(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", itemsProcessed: 0, runId: "run-uuid-1234" });
    expect(runCaseCronMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// expire-cross-org-transfers
// ---------------------------------------------------------------------------

describe("GET /api/cron/expire-cross-org-transfers", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/case-cron");
    vi.doUnmock("@/src/modules/transfers/infrastructure/transfers-repository");
  });

  async function callRoute(authResult: ReturnType<typeof makeAuthFail> | null) {
    const runCaseCronMock = vi.fn().mockResolvedValue(makeRunResult({ itemsProcessed: 5 }));
    vi.doMock("@/lib/case-cron", () => ({
      checkCronSecret: vi.fn().mockReturnValue(authResult),
      runCaseCron: runCaseCronMock,
    }));
    vi.doMock("@/src/modules/transfers/infrastructure/transfers-repository", () => ({
      TransfersRepository: {
        findExpirableCrossOrgCases: vi.fn().mockResolvedValue([]),
        expireOneCrossOrgCase: vi.fn().mockResolvedValue(undefined),
      },
    }));
    const { GET } = await import("@/app/api/cron/expire-cross-org-transfers/route");
    const req = new Request("http://test.local/api/cron/expire-cross-org-transfers", {
      headers: {},
    });
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    return { res, runCaseCronMock };
  }

  it("returns 401 when auth fails", async () => {
    const { res } = await callRoute(makeAuthFail());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 200 with runCaseCron result when auth passes", async () => {
    const { res, runCaseCronMock } = await callRoute(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "ok",
      itemsProcessed: 5,
      runId: "run-uuid-1234",
    });
    expect(runCaseCronMock).toHaveBeenCalledOnce();
  });
});
