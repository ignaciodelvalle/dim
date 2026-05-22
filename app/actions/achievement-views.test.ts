// Unit tests for markAchievementSeenAction.
//
// Uses vi.hoisted + vi.mock to isolate DB writes and requirePetAccess.
// No live DB required.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockInsert, mockRequirePetAccess, mockRevalidatePath } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockRequirePetAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  return {
    ...actual,
    db: {
      insert: mockInsert,
    },
  };
});

vi.mock("@/lib/pet-access", () => ({
  requirePetAccess: mockRequirePetAccess,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Import AFTER mocks are registered.
import { markAchievementSeenAction } from "./achievement-views";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInsertChain(error?: Error) {
  const chain: Record<string, unknown> = {};
  const promise = error ? Promise.reject(error) : Promise.resolve([{ id: "view-1" }]);
  chain.values = vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockReturnValue(promise),
  });
  return chain;
}

function makeOwnerAccess(pet?: Partial<{ id: string; publicToken: string }>) {
  return {
    ok: true as const,
    user: { id: "user-1" },
    pet: { id: pet?.id ?? "pet-1", publicToken: pet?.publicToken ?? "tok-abc" },
    accessPath: "owner" as const,
    supabase: {},
    organization: null,
  };
}

function makeOrgAccess() {
  return {
    ok: true as const,
    user: { id: "user-1" },
    pet: { id: "pet-1", publicToken: "tok-abc" },
    accessPath: "org" as const,
    supabase: {},
    organization: { id: "org-1", displayName: "Org", publicToken: "org-tok" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("markAchievementSeenAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: inserts a view row and revalidates the profile path", async () => {
    mockRequirePetAccess.mockResolvedValue(makeOwnerAccess());
    mockInsert.mockReturnValue(makeInsertChain());

    const result = await markAchievementSeenAction("tok-abc", "i_was_adopted");

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining("tok-abc"),
    );
  });

  it("idempotency: second call with same args returns ok (onConflictDoNothing absorbs duplicate)", async () => {
    mockRequirePetAccess.mockResolvedValue(makeOwnerAccess());
    // onConflictDoNothing resolves with [] on duplicate (no rows returned)
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    });
    mockInsert.mockReturnValue(chain);

    const result = await markAchievementSeenAction("tok-abc", "i_was_adopted");

    expect(result).toEqual({ ok: true });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("unauthorized: accessPath='org' returns error without inserting", async () => {
    mockRequirePetAccess.mockResolvedValue(makeOrgAccess());

    const result = await markAchievementSeenAction("tok-abc", "i_was_adopted");

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("access denied: requirePetAccess returns ok=false, returns error", async () => {
    mockRequirePetAccess.mockResolvedValue({ ok: false as const, error: "Not found" });

    const result = await markAchievementSeenAction("tok-abc", "i_was_adopted");

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("invalid achievementId: returns error without inserting", async () => {
    mockRequirePetAccess.mockResolvedValue(makeOwnerAccess());

    const result = await markAchievementSeenAction("tok-abc", "not_a_real_achievement" as never);

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("missing publicToken: returns error without inserting", async () => {
    mockRequirePetAccess.mockResolvedValue(makeOwnerAccess());

    const result = await markAchievementSeenAction("", "i_was_adopted");

    expect(result).toMatchObject({ error: expect.any(String) });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
