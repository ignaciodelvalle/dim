// Unit tests for GET /api/cron/drain-notification-dead-letter.
//
// The drainer replays unresolved notification_dead_letter rows through
// createNotification() and stamps resolved_at. Branches:
//   1. Auth failure → 401
//   2. No unresolved rows → 200 { ok: true, scanned: 0, resolved: 0 }
//   3. Row replays successfully (inserted) → resolved, resolved_at stamped
//   4. Row already present (duplicate) → resolved (idempotent)
//   5. Row still fails (dead_lettered again) → stillFailing, original resolved (bounded)
//   6. Malformed payload → invalid, row resolved so it stops blocking the scan
//   7. Global failure (select throws) → ok:false + HTTP 500
//
// Mocks @/db (cronRuns, notificationDeadLetter, db) + @/lib/infra/notification-service.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const FAKE_RUN_ID = "dl-run-id-9999";

describe("GET /api/cron/drain-notification-dead-letter", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
    vi.doUnmock("@/db");
    vi.doUnmock("@/lib/infra/notification-service");
  });

  type Row = { id: string; payload: unknown };

  function buildDbMock(rows: Row[], selectThrows = false) {
    const cronInsertReturningMock = vi.fn().mockResolvedValue([{ id: FAKE_RUN_ID }]);
    const cronInsertValuesMock = vi.fn().mockReturnValue({ returning: cronInsertReturningMock });
    const insertMock = vi.fn().mockReturnValue({ values: cronInsertValuesMock });

    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

    // db.select().from().where().orderBy().limit()
    const limitMock = selectThrows
      ? vi.fn().mockRejectedValue(new Error("db down"))
      : vi.fn().mockResolvedValue(rows);
    const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
    const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    const selectMock = vi.fn().mockReturnValue({ from: fromMock });

    const dbMock = {
      insert: insertMock,
      update: updateMock,
      select: selectMock,
    };
    return { dbMock, updateSetMock };
  }

  function mockDeps(
    rows: Row[],
    createResults: Array<{ status: "inserted" | "duplicate" | "dead_lettered" }>,
    selectThrows = false,
  ) {
    const { dbMock, updateSetMock } = buildDbMock(rows, selectThrows);
    vi.doMock("@/db", () => ({
      db: dbMock,
      cronRuns: {},
      notificationDeadLetter: {
        resolvedAt: {},
        createdAt: {},
        id: {},
        payload: {},
      },
    }));

    let i = 0;
    const createMock = vi.fn().mockImplementation(() => {
      const r = createResults[i] ?? { status: "inserted" };
      i += 1;
      return Promise.resolve({ ...r, id: r.status === "inserted" ? "n1" : null });
    });
    vi.doMock("@/lib/infra/notification-service", () => ({
      createNotification: createMock,
    }));

    return { createMock, updateSetMock };
  }

  const validPayload = {
    userId: "u1",
    notificationType: "test_notif",
    title: "Hola",
    dedupeKey: "k1",
    body: "cuerpo",
    severity: "info",
  };

  async function callRoute(headers: Record<string, string>) {
    const { GET } = await import("@/app/api/cron/drain-notification-dead-letter/route");
    const req = new Request("http://test.local/api/cron/drain-notification-dead-letter", {
      headers,
    });
    return GET(req as unknown as Parameters<typeof GET>[0]);
  }

  it("returns 401 when no auth header is provided", async () => {
    mockDeps([], []);
    const res = await callRoute({});
    expect(res.status).toBe(401);
  });

  it("returns 200 with zero counts when there are no unresolved rows", async () => {
    mockDeps([], []);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 0, resolved: 0, stillFailing: 0, invalid: 0 });
  });

  it("resolves a row that replays successfully", async () => {
    const { createMock } = mockDeps(
      [{ id: "dl-1", payload: validPayload }],
      [{ status: "inserted" }],
    );
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, resolved: 1, stillFailing: 0 });
    expect(createMock).toHaveBeenCalledOnce();
  });

  it("resolves a duplicate (idempotent) row", async () => {
    mockDeps([{ id: "dl-2", payload: validPayload }], [{ status: "duplicate" }]);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, resolved: 1, stillFailing: 0 });
  });

  it("counts a re-dead-lettered row as stillFailing but keeps it bounded (resolves original)", async () => {
    const { updateSetMock } = mockDeps(
      [{ id: "dl-3", payload: validPayload }],
      [{ status: "dead_lettered" }],
    );
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, resolved: 0, stillFailing: 1 });
    // resolved_at IS stamped on the original even when re-dead-lettered (bounded).
    const stampedResolved = updateSetMock.mock.calls.some(
      (c) => (c[0] as { resolvedAt?: unknown }).resolvedAt instanceof Date,
    );
    expect(stampedResolved).toBe(true);
  });

  it("marks a malformed payload as invalid and resolves it", async () => {
    const { createMock } = mockDeps([{ id: "dl-4", payload: { userId: "u1" } }], []);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 1, invalid: 1, resolved: 0 });
    // Never attempted a replay for an unreplayable payload.
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns ok:false + HTTP 500 when the scan throws", async () => {
    mockDeps([], [], true);
    const res = await callRoute({ "x-cron-secret": "test-secret" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
