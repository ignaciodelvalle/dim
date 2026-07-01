// Unit tests for notifyOwnerOfFoundPetAction (app/actions/public.ts).
//
// Tests verify:
//   1. Happy path: notification row inserted for active owner.
//   2. Rate limit exceeded (enforceRateLimit throws RateLimitError) → ok:false.
//   3. enforceRateLimit is called with the correct endpoint + IP key.
//   4. Pet not found → ok:false.
//   5. Missing finderName → ok:false.
//   6. Missing finderContact → ok:false.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUBLIC_TOKEN = "DIM-PUBLIC-NOTIFY-001";
const PET_ID = "pet-pub-0000-0000-000000000001";
const OWNER_USER_ID = "user-pub-0000-0000-000000000001";
const PREVIOUS_STATE = { ok: false as const, error: null };

// ---------------------------------------------------------------------------
// Mock: next/headers
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    // x-real-ip is the trusted edge IP — callerIp() prefers it over XFF.
    get: (key: string) => (key === "x-real-ip" ? "203.0.113.42" : null),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit — allow by default; tests override per case.
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
  const actual = await importOriginal<typeof import("@/lib/infra/rate-limit")>();
  return {
    ...actual,
    enforceRateLimit: (endpoint: string, id: string, cfg: unknown) =>
      mockEnforceRateLimit(endpoint, id, cfg),
    RateLimitError: MockRateLimitError,
  };
});

// ---------------------------------------------------------------------------
// Mock: @/db
// ---------------------------------------------------------------------------

let capturedNotificationInsert: Record<string, unknown> | null = null;

function buildMockDb(petFound = true) {
  let selectCallCount = 0;

  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(async () => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // pet query
        return petFound
          ? [{ id: PET_ID, name: "Pochi", status: "active", publicToken: PUBLIC_TOKEN }]
          : [];
      }
      // owner query
      return [{ userId: OWNER_USER_ID }];
    }),
  };

  const insertChain = {
    values: vi.fn((data: Record<string, unknown>) => {
      capturedNotificationInsert = data;
      return insertChain;
    }),
    returning: vi.fn(async () => []),
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
  notifications: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const BASE_FIELDS = {
  finderName: "Roberto Sánchez",
  finderContact: "11-9999-8888",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("notifyOwnerOfFoundPetAction — persistent rate-limit migration", () => {
  beforeEach(() => {
    capturedNotificationInsert = null;
    mockEnforceRateLimit.mockResolvedValue(undefined);
    buildMockDb(true);
  });

  it("happy path: inserts notification row when finder provides valid data", async () => {
    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData(BASE_FIELDS);

    const result = await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(capturedNotificationInsert).not.toBeNull();
    expect(capturedNotificationInsert?.notificationType).toBe("pet_found_report");
    expect(capturedNotificationInsert?.severity).toBe("urgent");
    expect(capturedNotificationInsert?.userId).toBe(OWNER_USER_ID);
  });

  it("calls enforceRateLimit with the IP from x-forwarded-for", async () => {
    vi.resetModules();
    buildMockDb(true);

    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData(BASE_FIELDS);

    await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("found_notify"),
      "203.0.113.42",
      expect.objectContaining({ maxPerMinute: 1, maxPerHour: 10 }),
    );
  });

  it("returns ok:false when enforceRateLimit throws RateLimitError", async () => {
    vi.resetModules();
    buildMockDb(true);
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(
        new Date(Date.now() + 60_000),
        `found_notify:${PUBLIC_TOKEN}:203.0.113.42:minute`,
      ),
    );

    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData(BASE_FIELDS);

    const result = await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("poco");
    expect(capturedNotificationInsert).toBeNull();
  });

  it("returns ok:false when pet is not found", async () => {
    vi.resetModules();
    buildMockDb(false);

    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData(BASE_FIELDS);

    const result = await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no encontrada");
  });

  it("returns ok:false when finderName is missing", async () => {
    vi.resetModules();
    buildMockDb(true);

    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData({ finderContact: "1111" }); // no name

    const result = await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("nombre");
  });

  it("returns ok:false when finderContact is missing", async () => {
    vi.resetModules();
    buildMockDb(true);

    const { notifyOwnerOfFoundPetAction } = await import("@/app/actions/public");
    const fd = makeFormData({ finderName: "Ana" }); // no contact

    const result = await notifyOwnerOfFoundPetAction(PUBLIC_TOKEN, PREVIOUS_STATE, fd);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("contacto");
  });
});
