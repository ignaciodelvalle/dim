// Unit tests for reportFinderInPossessionAction (P0e).
//
// Tests verify:
//   1. Anon happy path → petEvents (kind=finder_in_possession) + notification created.
//   2. Logged-in path → recordedByUserId set, authorVerified=true.
//   3. Pet not lost → ok:false.
//   4. Rate limit → ok:false.
//   5. Idempotency guard → ok:true without second insert.
//   6. Photo upload failure → non-fatal (ok:true + warning).
//   7. Missing name → ok:false.
//   8. Missing both phone and email → ok:false.
//   9. Missing location → ok:false.
//  10. Notification severity=urgent, category=perdidas.
//  11. Vet-urgent condition sets urgent body copy in notification.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_TOKEN = "DIM-P0E-TEST-001";
const PET_ID = "pet-p0e0-0000-0000-000000000001";
const OWNER_USER_ID = "user-p0e0-0000-0000-000000000001";
const FINDER_USER_ID = "user-p0e0-0000-0000-000000000002";
const CASE_ID = "case-p0e0-0000-0000-000000000001";
const PREVIOUS_STATE = { ok: false as const, error: null };

const BASE_FIELDS = {
  finderName: "Ana González",
  finderPhone: "11-5555-0001",
  localityName: "La Plata",
  petCondition: "bien",
};

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    // x-real-ip is the trusted edge IP — callerIp() prefers it over XFF.
    get: (key: string) => (key === "x-real-ip" ? "10.0.0.1" : null),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase/admin
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/uploads
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();
vi.mock("@/lib/uploads", () => ({
  uploadAttachmentIfPresent: (supabase: unknown, file: unknown, bucket: unknown) =>
    mockUpload(supabase, file, bucket),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — allow by default; tests override per case.
// The action now uses the persistent DB-backed enforceRateLimit (not
// makeMemoryRateLimiter), so we mock enforceRateLimit directly.
// vi.hoisted is used so MockRateLimitError is available both in the vi.mock
// factory (which is hoisted) and in test bodies that need to throw it.
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
// Mock: @/lib/supabase/server — no logged-in user by default.
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn(async () => ({
  data: { user: null as { id: string; email?: string } | null },
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

// ---------------------------------------------------------------------------
// Mock: @/db
// ---------------------------------------------------------------------------

let capturedPetEventInsert: Record<string, unknown> | null = null;
let capturedNotificationInsert: Record<string, unknown> | null = null;
let capturedAttachmentInsert: Record<string, unknown> | null = null;

const INSERTED_EVENT_ID = "evt-p0e-0000-0000-000000000001";

// Controls whether the idempotency query returns an existing event.
let idempotencyReturnEvent = false;

function buildMockDb(petStatus = "lost") {
  let selectCallCount = 0;

  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
    leftJoin: vi.fn(() => selectChain),
    limit: vi.fn(async () => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // pet query
        return [{ id: PET_ID, name: "Luna", status: petStatus }];
      }
      if (selectCallCount === 2) {
        // owner query
        return [{ userId: OWNER_USER_ID }];
      }
      if (selectCallCount === 3) {
        // idempotency query
        return idempotencyReturnEvent ? [{ id: "existing-event-id" }] : [];
      }
      // open case query
      return [{ id: CASE_ID }];
    }),
  };

  // insertChain supports .values().returning() (petEvents) and .values() alone
  // (notifications, attachments).
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

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@/db", () => ({
  db: mockDb,
  pets: {},
  ownerships: {},
  petEvents: {},
  notifications: {},
  cases: {},
  profiles: {},
  attachments: {},
}));

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reportFinderInPossessionAction — P0e", () => {
  beforeEach(() => {
    capturedPetEventInsert = null;
    capturedNotificationInsert = null;
    capturedAttachmentInsert = null;
    idempotencyReturnEvent = false;
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockUpload.mockReset();
    mockUpload.mockResolvedValue({
      uploadedPath: "finder-photo-abc.jpg",
      mimeType: "image/jpeg",
      size: 4000,
      error: null,
    });
    buildMockDb("lost");
  });

  // --- Happy paths ---

  it("anon happy path: inserts petEvent (kind=finder_in_possession) and notification", async () => {
    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    // petEvent was inserted.
    expect(capturedPetEventInsert).not.toBeNull();
    const payload = capturedPetEventInsert?.payload as Record<string, unknown>;
    expect(payload.kind).toBe("finder_in_possession");
    expect(payload.finderName).toBe("Ana González");
    expect(payload.finderContact).toBe("11-5555-0001");
    expect(capturedPetEventInsert?.authorRole).toBe("finder");
    expect(capturedPetEventInsert?.recordedByUserId).toBeNull();
    expect(capturedPetEventInsert?.authorVerified).toBe(false);

    // Full possession-specific fields must be present in the persisted payload
    // (guards against the validate-then-discard bypass re-emerging).
    expect(payload.location).toEqual({
      localityName: "La Plata",
      provinceCode: null,
      provinceName: null,
    });
    expect(payload.petCondition).toBe("bien");
    expect(payload.canKeepIndefinite).toBe(true);
    expect(payload.canKeepUntil).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(payload, "message")).toBe(true);

    // notification was inserted.
    expect(capturedNotificationInsert).not.toBeNull();
    expect(capturedNotificationInsert?.notificationType).toBe("pet_in_possession");
    expect(capturedNotificationInsert?.severity).toBe("urgent");
    expect(capturedNotificationInsert?.category).toBe("perdidas");
  });

  it("includes photoStoragePath in payload when photo upload succeeds", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockUpload.mockResolvedValue({
      uploadedPath: "finder-photo-xyz.jpg",
      mimeType: "image/jpeg",
      size: 3000,
      error: null,
    });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const photo = new File(["fake-image-bytes"], "luna-now.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true", photoNow: photo });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    const payload = capturedPetEventInsert?.payload as Record<string, unknown>;
    expect(payload.photoStoragePath).toBe("finder-photo-xyz.jpg");
  });

  it("photo upload failure is non-fatal: ok:true + warning set, no photoStoragePath", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockUpload.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: "network error",
    });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const photo = new File(["bytes"], "fail.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true", photoNow: photo });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.warning).toBeTruthy();
    const payload = capturedPetEventInsert?.payload as Record<string, unknown>;
    expect(payload.photoStoragePath == null).toBe(true);
  });

  // --- Logged-in path ---

  it("logged-in user: sets recordedByUserId and authorVerified=true", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockGetUser.mockResolvedValue({
      data: { user: { id: FINDER_USER_ID, email: "ana@test.com" } },
      error: null,
    });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(capturedPetEventInsert?.recordedByUserId).toBe(FINDER_USER_ID);
    expect(capturedPetEventInsert?.authorVerified).toBe(true);
  });

  // --- Validation failures ---

  it("returns ok:false when pet is not lost", async () => {
    vi.resetModules();
    buildMockDb("active");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(capturedPetEventInsert).toBeNull();
  });

  it("returns ok:false when finderName is missing", async () => {
    vi.resetModules();
    buildMockDb("lost");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const { finderName: _dropped, ...noName } = BASE_FIELDS;
    const fd = makeFormData({ ...noName, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("nombre");
  });

  it("returns ok:false when both phone and email are missing", async () => {
    vi.resetModules();
    buildMockDb("lost");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const { finderPhone: _dropped, ...noPhone } = BASE_FIELDS;
    const fd = makeFormData({
      finderName: "Ana",
      localityName: "La Plata",
      petCondition: "bien",
      canKeepIndefinite: "true",
    });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("contacto");
  });

  it("returns ok:false when locality is missing", async () => {
    vi.resetModules();
    buildMockDb("lost");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({
      finderName: "Ana",
      finderPhone: "1111",
      petCondition: "bien",
      canKeepIndefinite: "true",
    });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("dónde");
  });

  it("returns ok:false when neither canKeepUntil nor canKeepIndefinite is set", async () => {
    vi.resetModules();
    buildMockDb("lost");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({
      finderName: "Ana",
      finderPhone: "1111",
      localityName: "La Plata",
      petCondition: "bien",
      // no canKeepIndefinite or canKeepUntil
    });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("cuándo");
  });

  // --- Rate limiting (persistent DB-backed enforceRateLimit) ---

  it("returns ok:false when rate limit is exceeded (enforceRateLimit throws RateLimitError)", async () => {
    vi.resetModules();
    buildMockDb("lost");
    // Simulate the persistent limiter throwing a RateLimitError.
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(
        new Date(Date.now() + 60_000),
        "finder_possession:DIM-P0E-TEST-001:10.0.0.1:minute",
      ),
    );

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("poco");
    expect(capturedPetEventInsert).toBeNull();
  });

  // --- Idempotency ---

  it("returns ok:true without a second insert when an identical event exists in the last 5 min", async () => {
    vi.resetModules();
    idempotencyReturnEvent = true;
    buildMockDb("lost");

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    // No new insert should have been captured.
    expect(capturedPetEventInsert).toBeNull();
    expect(capturedNotificationInsert).toBeNull();
  });

  // --- Notification copy for vet-urgent condition ---

  it("notification title contains URGENTE when petCondition is 'necesita vet urgente'", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({
      finderName: "Carlos",
      finderPhone: "9999",
      localityName: "Rosario",
      petCondition: "necesita_vet_urgente",
      canKeepIndefinite: "true",
    });

    await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(capturedNotificationInsert?.title as string).toContain("URGENTE");
  });

  // --- caseId association ---

  it("sets caseId on the petEvent when an open lost case exists", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(capturedPetEventInsert?.caseId).toBe(CASE_ID);
  });

  // --- P0g: attachments table integration ---

  it("P0g: inserts an attachments row linked to the event when photo upload succeeds", async () => {
    vi.resetModules();
    buildMockDb("lost");
    capturedAttachmentInsert = null;
    mockUpload.mockResolvedValue({
      uploadedPath: "finder-photo-abc.jpg",
      mimeType: "image/jpeg",
      size: 4000,
      error: null,
    });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const photo = new File(["fake-image-bytes"], "luna-now.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true", photoNow: photo });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(capturedAttachmentInsert).not.toBeNull();
    const att = capturedAttachmentInsert as unknown as Record<string, unknown>;
    expect(att.eventId).toBe(INSERTED_EVENT_ID);
    expect(att.petId).toBe(PET_ID);
    expect(att.storagePath).toBe("finder-photo-abc.jpg");
    // Anonymous (no logged-in user): uploadedByUserId must be null.
    expect(att.uploadedByUserId).toBeNull();
  });

  it("P0g: sets uploadedByUserId on attachment when finder is logged in", async () => {
    vi.resetModules();
    buildMockDb("lost");
    capturedAttachmentInsert = null;
    mockGetUser.mockResolvedValue({
      data: { user: { id: FINDER_USER_ID, email: "ana@test.com" } },
      error: null,
    });
    mockUpload.mockResolvedValue({
      uploadedPath: "finder-photo-loggedin.jpg",
      mimeType: "image/jpeg",
      size: 3000,
      error: null,
    });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const photo = new File(["fake-image-bytes"], "now.jpg", { type: "image/jpeg" });
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true", photoNow: photo });

    await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect((capturedAttachmentInsert as unknown as Record<string, unknown>).uploadedByUserId).toBe(
      FINDER_USER_ID,
    );
  });

  it("P0g: does NOT insert an attachments row when no photo is provided", async () => {
    vi.resetModules();
    buildMockDb("lost");
    capturedAttachmentInsert = null;
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({ ...BASE_FIELDS, canKeepIndefinite: "true" });

    const result = await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(capturedAttachmentInsert).toBeNull();
  });

  // --- Contact concatenation ---

  it("concatenates phone and email in finderContact when both provided", async () => {
    vi.resetModules();
    buildMockDb("lost");
    mockUpload.mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null });

    const { reportFinderInPossessionAction } = await import(
      "@/app/p/[publicToken]/encontre/action"
    );
    const fd = makeFormData({
      finderName: "María",
      finderPhone: "11-1111-2222",
      finderEmail: "maria@test.com",
      localityName: "La Plata",
      petCondition: "bien",
      canKeepIndefinite: "true",
    });

    await reportFinderInPossessionAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    const payload = capturedPetEventInsert?.payload as Record<string, unknown>;
    expect(payload.finderContact as string).toContain("11-1111-2222");
    expect(payload.finderContact as string).toContain("maria@test.com");
  });
});
