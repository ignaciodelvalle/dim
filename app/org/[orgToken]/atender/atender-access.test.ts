// Unit tests for the walk-in clinical-signing authorization boundary
// (app/org/[orgToken]/atender/atender-access.ts) and the code-entry action.
//
// Focus:
//   - The surface requires event.write on the org (no custody needed).
//   - A self-erased account (profiles.deleted_at) is rejected (Ley 25.326).
//   - #43 provenance: a validated matrícula signs as verified_professional
//     (authorRole "vet", authorVerified true); everyone else signs as
//     org_registered (authorRole "shelter", authorVerified false).
//   - The code-entry action resolves a DIM code and returns the redirect.
//
// Strategy — pure mock-based, no DB / no Supabase instance (mirrors
// __tests__/pet-access.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockSupabaseClient = { auth: { getUser: () => mockGetUser() } };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}));

// Chainable @/db mock. Each terminal `.limit()` shifts one result array off
// dbState.results (FIFO): [membershipRow], [signerProfile], [petRow].
const { chain, dbState } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[][] };
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(dbState.results.shift() ?? []),
  };
  return { chain, dbState };
});

vi.mock("@/db", () => ({
  db: chain,
  pets: {},
  organizations: {},
  organizationMemberships: {},
  profiles: {},
}));

const mockGetGrantedCapabilities = vi.fn();
vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  getGrantedCapabilities: (...args: unknown[]) => mockGetGrantedCapabilities(...args),
}));

import { lookupAtenderPetAction } from "./actions";
import { resolveAtenderContext, resolveAtenderPet } from "./atender-access";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function session(id = "user-001") {
  return { data: { user: { id, email: `${id}@dim-test.local` } }, error: null };
}
function noSession() {
  return { data: { user: null }, error: null };
}
function membership(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-001",
    organizationName: "Clínica San Roque",
    membershipId: "mem-001",
    membershipRole: "vet_individual",
    ...overrides,
  };
}
function signerProfile(overrides: Record<string, unknown> = {}) {
  return {
    matriculaNumber: null,
    matriculaVerified: false,
    deletedAt: null,
    ...overrides,
  };
}
function pet(overrides: Record<string, unknown> = {}) {
  return {
    id: "pet-001",
    publicToken: "DIM-ABCD-1234",
    name: "Firulais",
    species: "dog",
    status: "active",
    ...overrides,
  };
}

/** Load the FIFO db result queue. */
function queue(...rows: unknown[][]) {
  dbState.results = rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.results = [];
  mockGetUser.mockResolvedValue(session());
  mockGetGrantedCapabilities.mockResolvedValue(new Set(["event.write"]));
});

// ---------------------------------------------------------------------------
// resolveAtenderContext — authorization gate
// ---------------------------------------------------------------------------

describe("resolveAtenderContext — authorization", () => {
  it("denies an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue(noSession());
    const result = await resolveAtenderContext("ORG-TOKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Sesión expirada.");
  });

  it("denies a non-member of the org", async () => {
    queue([]); // membership lookup returns nothing
    const result = await resolveAtenderContext("ORG-TOKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("No pertenecés a esta organización.");
  });

  it("denies a self-erased account before granting", async () => {
    queue([membership()], [signerProfile({ deletedAt: new Date("2026-07-05") })]);
    const result = await resolveAtenderContext("ORG-TOKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Tu cuenta fue eliminada.");
  });

  it("denies a member without event.write", async () => {
    queue([membership()], [signerProfile()]);
    mockGetGrantedCapabilities.mockResolvedValue(new Set()); // no caps
    const result = await resolveAtenderContext("ORG-TOKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("event.write");
  });
});

// ---------------------------------------------------------------------------
// #43 provenance tier — bound to the SIGNER's validated matrícula
// ---------------------------------------------------------------------------

describe("resolveAtenderPet — #43 provenance", () => {
  it("a non-matriculado signs as org_registered (shelter / unverified)", async () => {
    queue([membership()], [signerProfile({ matriculaVerified: false })], [pet()]);
    const result = await resolveAtenderPet("ORG-TOKEN", "DIM-ABCD-1234");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventAuthorship).toEqual({
        authorRole: "shelter",
        authorOrganizationId: "org-001",
        authorVerified: false,
      });
      expect(result.signer.matriculaVerified).toBe(false);
      expect(result.signer.label).toBe("Clínica San Roque");
    }
  });

  it("a matriculado signs as verified_professional (vet / verified)", async () => {
    queue(
      [membership()],
      [signerProfile({ matriculaVerified: true, matriculaNumber: "MP-4821" })],
      [pet()],
    );
    const result = await resolveAtenderPet("ORG-TOKEN", "DIM-ABCD-1234");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventAuthorship).toEqual({
        authorRole: "vet",
        authorOrganizationId: "org-001",
        authorVerified: true,
      });
      expect(result.signer.matriculaVerified).toBe(true);
      expect(result.signer.label).toBe("matrícula MP-4821");
    }
  });

  it("rejects a deceased pet", async () => {
    queue([membership()], [signerProfile()], [pet({ status: "deceased" })]);
    const result = await resolveAtenderPet("ORG-TOKEN", "DIM-ABCD-1234");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("fallecida");
  });

  it("rejects a malformed DIM code without hitting the pet query", async () => {
    queue([membership()], [signerProfile()]);
    const result = await resolveAtenderPet("ORG-TOKEN", "NOT-A-TOKEN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("DIM-XXXX-XXXX");
  });

  it("reports an unknown code", async () => {
    queue([membership()], [signerProfile()], []); // pet lookup empty
    const result = await resolveAtenderPet("ORG-TOKEN", "DIM-ZZZZ-9999");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No se encontró");
  });
});

// ---------------------------------------------------------------------------
// lookupAtenderPetAction — code entry resolves + redirects
// ---------------------------------------------------------------------------

describe("lookupAtenderPetAction — code entry", () => {
  it("resolves a valid code and returns the signing-surface redirect", async () => {
    queue([membership()], [signerProfile()], [pet({ publicToken: "DIM-ABCD-1234" })]);
    const form = new FormData();
    form.set("code", "dim-abcd-1234"); // lower-case — must be normalized
    const result = await lookupAtenderPetAction("ORG-TOKEN", { error: null }, form);
    expect(result.error).toBeNull();
    expect(result.ok).toBe(true);
    expect(result.redirectTo).toBe("/org/ORG-TOKEN/atender/DIM-ABCD-1234");
  });

  it("rejects a malformed code before any lookup", async () => {
    const form = new FormData();
    form.set("code", "hello");
    const result = await lookupAtenderPetAction("ORG-TOKEN", { error: null }, form);
    expect(result.error).toContain("DIM-XXXX-XXXX");
    expect(result.redirectTo).toBeUndefined();
  });

  it("surfaces an authorization failure (no event.write)", async () => {
    queue([membership()], [signerProfile()]);
    mockGetGrantedCapabilities.mockResolvedValue(new Set());
    const form = new FormData();
    form.set("code", "DIM-ABCD-1234");
    const result = await lookupAtenderPetAction("ORG-TOKEN", { error: null }, form);
    expect(result.ok).toBeUndefined();
    expect(result.error).toContain("event.write");
  });
});
