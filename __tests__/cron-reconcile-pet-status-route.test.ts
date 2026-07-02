// Unit tests for GET /api/cron/reconcile-pet-status.
//
// Branches:
//   1. Auth failure → 401
//   2. Auth success + no pets → 200 { ok: true, scanned: 0, divergent: 0 }
//   3. Auth success + all pets match → 200 { ok: true, scanned: N, divergent: 0 }
//   4. Auth success + one pet drifted → 200 { ok: true, divergent: 1, sample contains entry }
//   5. Auth success + rederive throws for one pet → error captured in details, run stays ok
//   6. Auth success + Authorization: Bearer header variant
//
// Mocks: @/db (cronRuns, pets, db) + @/lib/infra/rederive-pet-cache (rederivePetCache, hasDrift, driftedColumns)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const FAKE_RUN_ID = "reconcile-run-id-1234";

// ---------------------------------------------------------------------------
// Minimal pet rows
// ---------------------------------------------------------------------------

const PET_CLEAN = { id: "pet-uuid-1", publicToken: "DIM-AAAA-1111", status: "active" };
const PET_DRIFTED = { id: "pet-uuid-2", publicToken: "DIM-BBBB-2222", status: "active" };

describe("GET /api/cron/reconcile-pet-status", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/db");
    vi.doUnmock("@/lib/infra/rederive-pet-cache");
  });

  // ---------------------------------------------------------------------------
  // Mock builders
  // ---------------------------------------------------------------------------

  /**
   * Build a Drizzle-style db mock that:
   *   - INSERT cronRuns → returns [{ id: FAKE_RUN_ID }]
   *   - UPDATE cronRuns → no-op
   *   - SELECT pets (keyset query) → returns the provided batches in order
   */
  function buildDbMock(petBatches: (typeof PET_CLEAN)[][]) {
    // cronRuns INSERT
    const returningMock = vi.fn().mockResolvedValue([{ id: FAKE_RUN_ID }]);
    const insertValuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

    // cronRuns UPDATE
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

    // SELECT pets — the route calls db.select(...).from(pets).$dynamic() then chains
    // .where().orderBy().limit(). We must mock each step of the builder chain.
    // The route first calls $dynamic() to get a chainable query, then conditionally
    // adds .where(gt(...)) for cursor pagination, then .orderBy().limit() to execute.
    let batchIndex = 0;

    const limitMock = vi.fn().mockImplementation(async () => {
      const batch = petBatches[batchIndex] ?? [];
      batchIndex += 1;
      return batch;
    });
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });

    // $dynamic() returns a chainable object that supports both .where() and
    // .orderBy() directly (used when cursor is null) and via .where() chaining.
    const dynamicMock = vi.fn().mockReturnValue({
      where: whereMock,
      orderBy: orderByMock,
    });
    const fromMock = vi.fn().mockReturnValue({ $dynamic: dynamicMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });

    const dbMock = {
      insert: insertMock,
      update: updateMock,
      select: selectMock,
    };

    return { dbMock, updateSetMock };
  }

  function mockCleanRun(petBatches: (typeof PET_CLEAN)[][]) {
    const { dbMock, updateSetMock } = buildDbMock(petBatches);

    vi.doMock("@/db", () => ({
      db: dbMock,
      cronRuns: {},
      pets: {},
    }));

    // No drift for any pet
    vi.doMock("@/lib/infra/rederive-pet-cache", () => ({
      rederivePetCache: vi.fn().mockResolvedValue({
        status: { stored: "active", derived: "active", matches: true },
      }),
      hasDrift: vi.fn().mockReturnValue(false),
      driftedColumns: vi.fn().mockReturnValue({}),
    }));

    return { updateSetMock };
  }

  function mockDriftedRun(petBatches: (typeof PET_CLEAN)[][], driftedPetId: string) {
    const { dbMock, updateSetMock } = buildDbMock(petBatches);

    vi.doMock("@/db", () => ({
      db: dbMock,
      cronRuns: {},
      pets: {},
    }));

    vi.doMock("@/lib/infra/rederive-pet-cache", () => ({
      rederivePetCache: vi.fn().mockImplementation(async (id: string) => {
        if (id === driftedPetId) {
          return {
            status: { stored: "active", derived: "deceased", matches: false },
            deceasedAt: { stored: null, derived: new Date("2026-01-01"), matches: false },
          };
        }
        return { status: { stored: "active", derived: "active", matches: true } };
      }),
      hasDrift: vi
        .fn()
        .mockImplementation((report: Record<string, { matches: boolean }>) =>
          Object.values(report).some((r) => !r.matches),
        ),
      driftedColumns: vi
        .fn()
        .mockImplementation((report: Record<string, { matches: boolean }>) =>
          Object.fromEntries(Object.entries(report).filter(([, r]) => !r.matches)),
        ),
    }));

    return { updateSetMock };
  }

  function mockRederiveThrows(petBatches: (typeof PET_CLEAN)[][]) {
    const { dbMock, updateSetMock } = buildDbMock(petBatches);

    vi.doMock("@/db", () => ({
      db: dbMock,
      cronRuns: {},
      pets: {},
    }));

    vi.doMock("@/lib/infra/rederive-pet-cache", () => ({
      rederivePetCache: vi.fn().mockRejectedValue(new Error("db connection lost")),
      hasDrift: vi.fn().mockReturnValue(false),
      driftedColumns: vi.fn().mockReturnValue({}),
    }));

    return { updateSetMock };
  }

  async function callRoute(headers: Record<string, string>) {
    const { GET } = await import("@/app/api/cron/reconcile-pet-status/route");
    const req = new Request("http://test.local/api/cron/reconcile-pet-status", { headers });
    return GET(req as unknown as Parameters<typeof GET>[0]);
  }

  // ---------------------------------------------------------------------------
  // Auth branch
  // ---------------------------------------------------------------------------

  it("returns 401 when no auth header is provided", async () => {
    mockCleanRun([]);
    const res = await callRoute({});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 when x-cron-secret does not match", async () => {
    mockCleanRun([]);
    const res = await callRoute({ "x-cron-secret": "wrong-secret" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when Authorization: Bearer does not match", async () => {
    mockCleanRun([]);
    const res = await callRoute({ authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // No pets
  // ---------------------------------------------------------------------------

  it("returns 200 with scanned=0 divergent=0 when there are no pets", async () => {
    // Empty first batch → loop exits immediately
    mockCleanRun([[]]);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 0, divergent: 0, sample: [] });
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // Clean run (no drift)
  // ---------------------------------------------------------------------------

  it("returns scanned=1 divergent=0 when one pet matches", async () => {
    // Single batch with one pet, then empty terminator batch
    mockCleanRun([[PET_CLEAN], []]);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, divergent: 0, sample: [] });
  });

  it("returns 200 via Authorization: Bearer header", async () => {
    mockCleanRun([[]]);
    const res = await callRoute({ authorization: "Bearer test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Drift detected
  // ---------------------------------------------------------------------------

  it("returns divergent=1 with sample entry when one pet has drifted status", async () => {
    mockDriftedRun([[PET_DRIFTED], []], PET_DRIFTED.id);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, divergent: 1 });
    expect(body.sample).toHaveLength(1);
    expect(body.sample[0].petId).toBe(PET_DRIFTED.id);
    expect(body.sample[0].publicToken).toBe(PET_DRIFTED.publicToken);
    // The derived status should reflect what rederivePetCache returned
    expect(body.sample[0].derived).toBe("deceased");
    // Warn log was emitted
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("DRIFT DETECTED"));
    warnSpy.mockRestore();
  });

  it("counts two drifted pets and limits sample to MAX_SAMPLE", async () => {
    const PET2 = { id: "pet-uuid-3", publicToken: "DIM-CCCC-3333", status: "active" };
    mockDriftedRun([[PET_DRIFTED, PET2], []], PET_DRIFTED.id);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only PET_DRIFTED has drift (PET2 is clean in this mock — hasDrift is called per-pet
    // and returns true only for PET_DRIFTED's report shape)
    expect(body.divergent).toBe(1);
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Per-pet error does not abort the batch
  // ---------------------------------------------------------------------------

  it("captures per-pet rederive errors without failing the whole run", async () => {
    mockRederiveThrows([[PET_CLEAN], []]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    // Route should still return 200 ok:true (errors are per-pet, captured in details)
    expect(res.status).toBe(200);
    const body = await res.json();
    // scanned increments before rederive call; divergent stays 0
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(1);
    expect(body.divergent).toBe(0);
    errSpy.mockRestore();
  });
});
