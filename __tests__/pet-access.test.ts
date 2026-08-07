// Unit tests for the pet-scoped authorization boundary in lib/infra/pet-access.ts.
//
// Focus (Wave E2 — Ley 25.326 art. 16, finding 27-#1 re-audit): a self-erased
// account (profiles.deleted_at set) keeps a valid Supabase JWT until it expires.
// requireUserOrRedirect blocks it at the page layer, but Drizzle bypasses RLS and
// every pet-scoped SERVER ACTION resolves the acting user through requirePetAccess
// / requireAlivePetAccess — NOT through the page guard. Those must therefore reject
// an erased account BEFORE any ownership/membership lookup.
//
// Strategy — pure mock-based, no DB / no Supabase instance:
//   - Mock @/lib/supabase/server so auth.getUser() is controllable.
//   - Mock @/lib/infra/request-cache so getProfileCached returns a deterministic
//     profile row (this is the deleted_at carrier reused from Wave D2).
//   - Mock @/db with a chainable query builder; the erased path must short-circuit
//     before touching it, which the test asserts.
//   - Mock the org capability resolver (only reached on the alive/org path).

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase/server
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSupabaseClient = { auth: { getUser: () => mockGetUser() } };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/infra/request-cache (getProfileCached carries deletedAt)
// ---------------------------------------------------------------------------

const mockGetProfileCached = vi.fn();

vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: (...args: unknown[]) => mockGetProfileCached(...args),
}));

// ---------------------------------------------------------------------------
// Mock: @/db — chainable query builder. Each terminal `.limit()` shifts one
// result array off `dbResults`. `mockSelect` lets us assert the erased path
// never issues a query.
// ---------------------------------------------------------------------------

const { chain, mockSelect, dbState } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[][] };
  const mockSelect = vi.fn();
  const chain: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return chain;
    },
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(dbState.results.shift() ?? []),
  };
  return { chain, mockSelect, dbState };
});

vi.mock("@/db", () => ({
  db: chain,
  pets: {},
  ownerships: {},
  organizations: {},
  organizationMemberships: {},
  profiles: { id: {}, matriculaVerified: {} },
}));

// ---------------------------------------------------------------------------
// Mock: org capability resolver (only reached on the alive/org path)
// ---------------------------------------------------------------------------

const mockGetGrantedCapabilities = vi.fn();

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  getGrantedCapabilities: (...args: unknown[]) => mockGetGrantedCapabilities(...args),
}));

// ---------------------------------------------------------------------------
// Import the boundary AFTER mocks are hoisted
// ---------------------------------------------------------------------------

import { requireAlivePetAccess, requirePetAccess } from "@/lib/infra/pet-access";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userSession(id = "user-001") {
  return { data: { user: { id, email: `${id}@dim-test.local` } }, error: null };
}
function noSession() {
  return { data: { user: null }, error: null };
}
function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-001",
    role: "owner",
    displayName: "Owner",
    accountType: "personal",
    deactivatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.results = [];
  mockGetUser.mockResolvedValue(noSession());
});

// ---------------------------------------------------------------------------
// requirePetAccess — erased-account lockout
// ---------------------------------------------------------------------------

describe("requirePetAccess — right-to-erasure lockout (Wave E2)", () => {
  it("denies an erased account (deletedAt set) BEFORE any ownership lookup", async () => {
    mockGetUser.mockResolvedValue(userSession("user-erased"));
    mockGetProfileCached.mockResolvedValue(
      profile({ id: "user-erased", displayName: "erased:abc", deletedAt: new Date("2026-07-04") }),
    );

    const result = await requirePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Tu cuenta fue eliminada.");
    expect(result.pet).toBeNull();
    // An erased account is a PERMISSION failure, not a no-session one — it must
    // fail closed to notFound() on pages (same as no-ownership), NOT bounce to
    // /login. Only the true no-session branch carries reason "no-session".
    if (!result.ok) expect(result.reason).toBe("not-found-or-forbidden");
    // The boundary must short-circuit before issuing the ownership/org query —
    // no data read for an erased account.
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 'Sesión expirada.' and never loads a profile when there is no session", async () => {
    mockGetUser.mockResolvedValue(noSession());

    const result = await requirePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Sesión expirada.");
    // Structural discriminator (external audit 2026-07): the no-session outcome
    // is distinguishable from a permission denial so a page can redirect to
    // /login (with returnTo) instead of rendering a misleading 404.
    if (!result.ok) expect(result.reason).toBe("no-session");
    expect(mockGetProfileCached).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns reason 'not-found-or-forbidden' for a live account with no ownership/membership", async () => {
    mockGetUser.mockResolvedValue(userSession("user-live"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "user-live", deletedAt: null }));
    // Both the ownership query and the org query return no rows.
    dbState.results = [[], []];

    const result = await requirePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Mascota no encontrada o sin permisos.");
    // A resolvable session that simply lacks access must NOT redirect to login —
    // it stays a notFound() on pages (no information leak). reason marks that.
    if (!result.ok) expect(result.reason).toBe("not-found-or-forbidden");
  });

  it("proceeds to the ownership lookup for a live (non-erased) account", async () => {
    mockGetUser.mockResolvedValue(userSession("user-live"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "user-live", deletedAt: null }));
    // First .limit() (ownership path) returns an owner row.
    dbState.results = [[{ pet: { id: "pet-1", publicToken: "DIM-TEST-0001", status: "active" } }]];

    const result = await requirePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accessPath).toBe("owner");
      expect(result.pet.id).toBe("pet-1");
    }
    expect(mockSelect).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireAlivePetAccess — inherits the erasure lockout from requirePetAccess
// ---------------------------------------------------------------------------

describe("requireAlivePetAccess — inherits erasure lockout", () => {
  it("denies an erased account without reaching the capability resolver", async () => {
    mockGetUser.mockResolvedValue(userSession("user-erased"));
    mockGetProfileCached.mockResolvedValue(
      profile({ id: "user-erased", deletedAt: new Date("2026-07-04") }),
    );

    const result = await requireAlivePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Tu cuenta fue eliminada.");
    if (!result.ok) expect(result.reason).toBe("not-found-or-forbidden");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockGetGrantedCapabilities).not.toHaveBeenCalled();
  });

  it("blocks a deceased pet with reason 'not-found-or-forbidden' (never a login bounce)", async () => {
    mockGetUser.mockResolvedValue(userSession("user-live"));
    mockGetProfileCached.mockResolvedValue(profile({ id: "user-live", deletedAt: null }));
    // Ownership query returns a deceased pet the caller owns.
    dbState.results = [
      [{ pet: { id: "pet-dead", publicToken: "DIM-TEST-0001", status: "deceased" } }],
    ];

    const result = await requireAlivePetAccess("DIM-TEST-0001");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-found-or-forbidden");
  });
});
