// Unit test — public credential page (/p/[publicToken]) per-IP rate limiting.
//
// The page is a large server component with ~20 DB queries, so we mock the
// full DB + auth surface and verify only the rate-limit behavior:
//   1. When enforceRateLimit resolves, the page proceeds to fetch pet data.
//   2. When enforceRateLimit throws RateLimitError, the page returns early
//      (ThrottleNotice rendered — no DB pet query is issued).
//   3. enforceRateLimit is keyed with "public_token_page" and the caller IP.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: next/headers — provides x-forwarded-for
// ---------------------------------------------------------------------------

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    // x-real-ip is the trusted edge IP — callerIp() prefers it over XFF.
    get: (key: string) => (key === "x-real-ip" ? "198.51.100.7" : null),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: next/navigation
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/rate-limit
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
// Mock: @/db — minimal; select chain returns empty / notFound path
// ---------------------------------------------------------------------------

const mockDbSelect = vi.fn();
const mockDb = { select: mockDbSelect };

vi.mock("@/db", () => ({
  db: mockDb,
  pets: {},
  attachments: {},
  ownerships: {},
  petEvents: {},
  petServiceDog: {},
  cases: {},
  organizations: {},
  profiles: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return actual as object;
});

// ---------------------------------------------------------------------------
// Mock: heavy lib deps (not under test)
// ---------------------------------------------------------------------------

vi.mock("@/lib/event-confidence", () => ({
  computeConfidence: vi.fn(() => "self_reported"),
  isAtLeast: vi.fn(() => false),
}));
vi.mock("@/lib/format", () => ({
  sexLabel: vi.fn(() => ""),
  speciesLabel: vi.fn(() => "perro"),
  statusLabel: vi.fn(() => "activo"),
}));
vi.mock("@/lib/location", () => ({ readPoint: vi.fn(() => null) }));
vi.mock("@/lib/origin-org", () => ({
  resolveOriginOrg: vi.fn(async () => null),
  shouldShowOriginOrgBadge: vi.fn(() => false),
}));
vi.mock("@/lib/permanent-conditions", () => ({
  isPermanentCondition: vi.fn(() => false),
  permanentConditionShortLabel: vi.fn(() => ""),
}));
vi.mock("@/lib/pet-identifiers", () => ({
  fetchActiveIdentifications: vi.fn(async () => ({ microchip: null, tattoo: null })),
}));
vi.mock("@/lib/storage", () => ({ petPhotoUrl: vi.fn(() => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/components/PppPublicBadge", () => ({ PppPublicBadge: vi.fn(() => null) }));
vi.mock("@/components/event/ConfidenceBadge", () => ({ ConfidenceBadge: vi.fn(() => null) }));
vi.mock("@/components/pet-profile/LostPublicCredential", () => ({
  LostPublicCredential: vi.fn(() => null),
}));
vi.mock("@/app/(public)/p/[publicToken]/FoundPetForm", () => ({ FoundPetForm: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/ScanLogger", () => ({ ScanLogger: vi.fn(() => null) }));
vi.mock("@/app/(public)/p/[publicToken]/Tier2MedicalView", () => ({
  Tier2MedicalView: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSelectChain(firstResult: unknown[] = []) {
  let callCount = 0;
  const chain = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => {
      callCount++;
      return callCount === 1 ? firstResult : [];
    }),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PublicCredentialPage — per-IP rate limiting (V1-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockDbSelect.mockImplementation(() => buildSelectChain([]));
  });

  it("calls enforceRateLimit with 'public_token_page' and caller IP", async () => {
    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    // Pet not found path — notFound() will throw. We only care that enforceRateLimit
    // was called with the right arguments.
    await PublicCredentialPage({ params: Promise.resolve({ publicToken: "DIM-AAAA-BBBB" }) }).catch(
      () => {},
    );

    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      "public_token_page",
      "198.51.100.7",
      expect.objectContaining({ maxPerMinute: 60, maxPerHour: 400 }),
    );
  });

  it("returns ThrottleNotice (no DB queries) when enforceRateLimit throws RateLimitError", async () => {
    mockDbSelect.mockImplementation(() => buildSelectChain([]));
    mockEnforceRateLimit.mockRejectedValue(
      new MockRateLimitError(
        new Date(Date.now() + 60_000),
        "public_token_page:198.51.100.7:minute",
      ),
    );

    const { default: PublicCredentialPage } = await import("@/app/(public)/p/[publicToken]/page");

    const result = await PublicCredentialPage({
      params: Promise.resolve({ publicToken: "DIM-AAAA-BBBB" }),
    });

    // The page should return a React element (ThrottleNotice) without throwing.
    expect(result).toBeTruthy();
    // No DB queries should have been issued.
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
