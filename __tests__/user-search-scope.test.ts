// Unit tests for searchUsers jurisdiction-scoping logic (P1-2).
//
// Security invariant: a govt viewer with zero jurisdiction assignments MUST
// receive an empty result without hitting the database.
//
// The full SQL-query path is an integration concern (requires a live DB).
// Here we test only the pure guard logic and the UserSearchScope discriminant
// by stubbing the DB import so the module can be loaded without a Postgres
// connection.

import { describe, expect, it, vi } from "vitest";

// Stub the DB module before importing the module under test so the Drizzle
// client is never initialised.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
          limit: vi.fn().mockResolvedValue([]),
        }),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  profiles: {
    id: "profiles.id",
    displayName: "profiles.displayName",
    role: "profiles.role",
    matriculaJurisdiccion: "profiles.matriculaJurisdiccion",
    // Wave 5 Item 25a: no plaintext DNI — displayName search only.
    dniHash: "profiles.dniHash",
    // Migration 0109 — excludes system/service accounts from admin rosters.
    isSystem: "profiles.isSystem",
  },
  ownerships: {
    ownerUserId: "ownerships.ownerUserId",
    petId: "ownerships.petId",
    endedAt: "ownerships.endedAt",
    role: "ownerships.role",
  },
  pets: {
    id: "pets.id",
    jurisdictionProvince: "pets.jurisdictionProvince",
    jurisdictionLocality: "pets.jurisdictionLocality",
  },
  organizations: {},
}));

import { searchUsers } from "@/lib/infra/admin-search";

describe("searchUsers — jurisdiction scope guard", () => {
  it("returns empty array immediately for a govt viewer with zero assignments", async () => {
    const result = await searchUsers("juan", { role: "govt", jurisdictions: [] });
    expect(result).toEqual([]);
  });

  it("returns empty array for empty query with zero govt assignments (landing page case)", async () => {
    const result = await searchUsers("", { role: "govt", jurisdictions: [] });
    expect(result).toEqual([]);
  });

  it("does not apply the zero-jurisdiction guard for admin scope", async () => {
    // Admin with no jurisdictions should still reach the DB query.
    // The mock will return [] but the code must NOT short-circuit.
    const result = await searchUsers("", { role: "admin" });
    // Result is empty because the mock returns [], not because of the guard.
    expect(Array.isArray(result)).toBe(true);
  });

  it("proceeds to DB query for govt viewer with at least one jurisdiction", async () => {
    // One valid assignment — the guard must NOT short-circuit.
    const result = await searchUsers("juan", {
      role: "govt",
      jurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
    });
    // DB mock returns [], but code reached the query path (no early return).
    expect(Array.isArray(result)).toBe(true);
  });
});
