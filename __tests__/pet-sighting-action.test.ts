// Unit tests for reportPetSightingAction (P0d additions).
//
// Tests verify:
//   1. finderName / finderContact / photoStoragePath land in the note_added
//      payload when provided.
//   2. Those fields are absent (or null) when not provided (back-compat).
//   3. A photo upload failure is non-fatal — ok:true still returned.
//   4. Existing validation (missing location) still returns ok:false.
//
// DB and Supabase are fully mocked so no local stack is required.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_TOKEN = "DIM-TEST-SIGHTING-001";
const PET_ID = "pet-0000-0000-0000-000000000001";
const OWNER_USER_ID = "user-0000-0000-0000-000000000001";
const CASE_ID = "case-0000-0000-0000-000000000001";
const PREVIOUS_STATE = { ok: false as const, error: null };

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    // x-real-ip is the trusted edge IP — callerIp() prefers it over XFF.
    get: (key: string) => (key === "x-real-ip" ? "1.2.3.4" : null),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase/admin — the action uses the service-role admin client
// for photo uploads so anonymous finders can bypass the authenticated-RLS
// policy on the event-attachments bucket.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/uploads — uploadAttachmentIfPresent
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();
vi.mock("@/lib/uploads", () => ({
  uploadAttachmentIfPresent: (...args: unknown[]) => mockUpload(...args),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — allow by default.
// The action now uses the persistent DB-backed enforceRateLimit.
// ---------------------------------------------------------------------------

const { MockRateLimitError, mockEnforceRateLimit } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    resetAt: Date;
    reason: string;
    constructor(resetAt: Date, reason: string) {
      super(`Rate limit exceeded: ${reason}`);
      this.name = "RateLimitError";
      this.resetAt = resetAt;
      this.reason = reason;
    }
  }
  return {
    MockRateLimitError,
    mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (endpoint: string, id: string, cfg: unknown) =>
      mockEnforceRateLimit(endpoint, id, cfg),
    RateLimitError: MockRateLimitError,
  };
});

// ---------------------------------------------------------------------------
// Mock: @/db — pet + owner + case queries + inserts
// ---------------------------------------------------------------------------

// Captured insert calls so tests can inspect the payload.
let capturedPetEventInsert: Record<string, unknown> | null = null;
let capturedNotificationInsert: Record<string, unknown> | null = null;
let capturedAttachmentInsert: Record<string, unknown> | null = null;

const INSERTED_EVENT_ID = "evt-0000-0000-0000-000000000001";

// We need the DB to return:
//   - pet (status=lost, id, name)
//   - owner (userId)
//   - openCase (id)
//   - insert petEvents (with .returning())
//   - insert notifications
//   - insert attachments

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

// Rebuild mock DB state before each test.
function buildMockDb() {
  let selectCallCount = 0;

  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
    limit: vi.fn(async () => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // pet query
        return [{ id: PET_ID, name: "Luna", status: "lost" }];
      }
      if (selectCallCount === 2) {
        // owner query
        return [{ userId: OWNER_USER_ID }];
      }
      // open case query
      return [{ id: CASE_ID }];
    }),
  };

  // insertChain supports both .values().returning() (petEvents) and
  // .values() alone (notifications, attachments).
  const insertChain = {
    values: vi.fn((data: Record<string, unknown>) => {
      if ("payload" in data) {
        capturedPetEventInsert = data;
      } else if ("storagePath" in data) {
        capturedAttachmentInsert = data;
      } else {
        capturedNotificationInsert = data;
      }
      return insertChain;
    }),
    returning: vi.fn(async () => [{ id: INSERTED_EVENT_ID }]),
  };

  mockDb.select = vi.fn(() => selectChain);
  mockDb.insert = vi.fn(() => insertChain);
}

vi.mock("@/db", () => ({
  db: mockDb,
  pets: {},
  ownerships: {},
  petEvents: {},
  notifications: {},
  cases: {},
  attachments: {},
}));

// Silence drizzle-orm helpers — the action uses `and`, `eq`, `isNull`.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const BASE_LOCATION = { locationLat: "-34.9214", locationLng: "-57.9545" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reportPetSightingAction — P0d payload fields", () => {
  beforeEach(() => {
    capturedPetEventInsert = null;
    capturedNotificationInsert = null;
    capturedAttachmentInsert = null;
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockUpload.mockReset();
    mockUpload.mockResolvedValue({
      uploadedPath: "abc123.jpg",
      mimeType: "image/jpeg",
      size: 5000,
      error: null,
    });
    buildMockDb();
  });

  it("includes finderName, finderContact, photoStoragePath in the payload when all provided", async () => {
    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const photo = new File(["fake-image-bytes"], "luna.jpg", { type: "image/jpeg" });
    const fd = makeFormData({
      ...BASE_LOCATION,
      finderName: "María García",
      finderContact: "11-1234-5678",
      photo,
    });

    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    const payload = capturedPetEventInsert?.payload as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload?.finderName).toBe("María García");
    expect(payload?.finderContact).toBe("11-1234-5678");
    expect(payload?.photoStoragePath).toBe("abc123.jpg");
    expect(payload?.kind).toBe("sighting");
  });

  it("omits finderName/finderContact/photoStoragePath when none provided (back-compat)", async () => {
    // Re-import fresh module instance for isolation.
    vi.resetModules();
    buildMockDb();
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const fd = makeFormData({ ...BASE_LOCATION });
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    const payload = capturedPetEventInsert?.payload as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    // Fields must be absent or undefined/null — no contact noise in payload.
    expect(payload?.finderName == null).toBe(true);
    expect(payload?.finderContact == null).toBe(true);
    expect(payload?.photoStoragePath == null).toBe(true);
  });

  it("returns ok:true even when photo upload fails (non-fatal)", async () => {
    vi.resetModules();
    buildMockDb();
    mockUpload.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "No se pudo subir la imagen: network error",
    });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const photo = new File(["bytes"], "test.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_LOCATION, photo });
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
    // photoStoragePath should be absent from the payload.
    const payload = capturedPetEventInsert?.payload as Record<string, unknown> | undefined;
    expect(payload?.photoStoragePath == null).toBe(true);
  });

  it("returns ok:false when location is missing (existing validation unchanged)", async () => {
    vi.resetModules();
    buildMockDb();

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const fd = makeFormData({}); // no locationLat/Lng
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  // --- Rate limiting (persistent DB-backed enforceRateLimit) ---

  it("returns ok:false when enforceRateLimit throws RateLimitError", async () => {
    vi.resetModules();
    buildMockDb();
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(
        new Date(Date.now() + 60_000),
        "sighting:DIM-TEST-SIGHTING-001:1.2.3.4:minute",
      ),
    );

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const fd = makeFormData({ ...BASE_LOCATION });
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("poco");
    expect(capturedPetEventInsert).toBeNull();
  });

  it("includes finder contact in notification body when finderName + finderContact set", async () => {
    vi.resetModules();
    buildMockDb();
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const fd = makeFormData({
      ...BASE_LOCATION,
      finderName: "Juan",
      finderContact: "juan@ejemplo.com",
    });
    await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    const notifBody = capturedNotificationInsert?.body as string | undefined;
    expect(notifBody).toBeDefined();
    expect(notifBody).toContain("Juan");
    expect(notifBody).toContain("juan@ejemplo.com");
  });

  it("sanitizes finderName and finderContact to their max lengths", async () => {
    vi.resetModules();
    buildMockDb();
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const longName = "A".repeat(200);
    const longContact = "B".repeat(200);
    const fd = makeFormData({
      ...BASE_LOCATION,
      finderName: longName,
      finderContact: longContact,
    });
    await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    const payload = capturedPetEventInsert?.payload as Record<string, unknown> | undefined;
    expect((payload?.finderName as string).length).toBeLessThanOrEqual(80);
    expect((payload?.finderContact as string).length).toBeLessThanOrEqual(120);
  });

  // P0g: attachments table integration.

  it("P0g: inserts an attachments row linked to the event when photo upload succeeds", async () => {
    vi.resetModules();
    buildMockDb();
    capturedAttachmentInsert = null;
    mockUpload.mockResolvedValue({
      uploadedPath: "abc123.jpg",
      mimeType: "image/jpeg",
      size: 5000,
      error: null,
    });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const photo = new File(["fake-image-bytes"], "luna.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_LOCATION, photo });
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    // An attachment row must have been inserted.
    expect(capturedAttachmentInsert).not.toBeNull();
    const att = capturedAttachmentInsert as unknown as Record<string, unknown>;
    expect(att.eventId).toBe(INSERTED_EVENT_ID);
    expect(att.petId).toBe(PET_ID);
    expect(att.storagePath).toBe("abc123.jpg");
    // Anonymous sighting: uploadedByUserId must be null.
    expect(att.uploadedByUserId).toBeNull();
  });

  it("P0g: does NOT insert an attachments row when no photo is provided", async () => {
    vi.resetModules();
    buildMockDb();
    capturedAttachmentInsert = null;
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportPetSightingAction } = await import("@/app/actions/pet-sighting");

    const fd = makeFormData({ ...BASE_LOCATION });
    const result = await reportPetSightingAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(capturedAttachmentInsert).toBeNull();
  });
});
