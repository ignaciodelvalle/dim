// Unit-style tests for the form-action wrappers around replaceMicrochipForUser.
//
// These assert that each wrapper correctly:
//   1. Rejects reasons outside its actor's allowed set.
//   2. Passes the correct actorContext.kind to the inner writer.
//
// The full allowed-reasons matrix and all writer side-effects (event insert,
// case opening, notifications, audit log) are already covered by
// microchip-replaced.test.ts.  We mock replaceMicrochipForUser here so these
// tests run without a live DB and complete in milliseconds.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stable fixture values
// ---------------------------------------------------------------------------

const OWNER_USER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const PET_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const PET_TOKEN = "test-pet-token";
const CHIP = "985141000000001";
const VET_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const ORG_ID = "cccccccc-0000-0000-0000-000000000001";
const ORG_TOKEN = "test-org-token";
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Mock: inner writer
// ---------------------------------------------------------------------------

const mockReplaceMicrochipForUser = vi.fn();
vi.mock("@/src/modules/pets/application/microchip/replace-microchip", () => ({
  replaceMicrochipForUser: (...args: unknown[]) => mockReplaceMicrochipForUser(...args),
}));

// ---------------------------------------------------------------------------
// Mock: owner-path session
// ---------------------------------------------------------------------------

vi.mock("@/lib/infra/pets", () => ({
  requireOwnedPetByToken: vi.fn(async () => ({
    user: { id: OWNER_USER_ID },
    pet: { id: PET_ID, publicToken: PET_TOKEN, microchipId: CHIP },
    accessPath: "owner" as const,
    organization: null,
  })),
}));

// ---------------------------------------------------------------------------
// Mock: org + admin auth guards + capabilities
// ---------------------------------------------------------------------------

vi.mock("@/lib/infra/auth-guards", () => ({
  requireOrgAccessByToken: vi.fn(async () => ({
    user: { id: VET_USER_ID },
    organization: { id: ORG_ID, displayName: "Clinica Test" },
    membership: { id: "mem-001", role: "vet_individual" },
    supabase: {},
  })),
  requireAdminOrRedirect: vi.fn(async () => ({
    user: { id: "admin-user-id" },
    profile: {
      id: "admin-user-id",
      role: "admin",
      accountType: "institutional",
      deactivatedAt: null,
    },
    supabase: {},
  })),
}));

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  getGrantedCapabilities: vi.fn(async () => new Set(["event.write", "pet.read_held"])),
}));

// ---------------------------------------------------------------------------
// Mock: DB queries
// Vet path queries: pets + ownerships join (custody check)
// Admin path query: pets only (by publicToken)
// Both return the same pet fixture — callers can't distinguish the shape.
// ---------------------------------------------------------------------------

const PET_FIXTURE = { id: PET_ID, publicToken: PET_TOKEN, microchipId: CHIP, name: "Test" };
// Vet action uses: db.select({ pet: pets, role: ownerships.role }).from(...).innerJoin(...).where(...).limit(1)
// → first element of the result array is { pet: ..., role: ... }
const VET_ROW = { pet: PET_FIXTURE, role: "shelter_custody" };

// DB mock returns the vet-shaped row by default (used by vet + admin paths).
// Admin action destructures the array directly: const [pet] = await db...
// so it receives VET_ROW as `pet`. Admin action then accesses `pet.microchipId`
// which resolves via VET_ROW.microchipId (undefined). To handle both actors with
// one mock, we put PET_FIXTURE fields directly on VET_ROW so both access paths work:
//   vet: const { pet } = petRow  → needs petRow.pet
//   admin: const [pet] = ...      → needs pet.microchipId, pet.id, etc.
// Solution: make the returned object work for both by attaching pet fields AND a pet sub-key.
const DUAL_ROW = Object.assign(Object.create(PET_FIXTURE), {
  pet: PET_FIXTURE,
  role: "shelter_custody",
});

vi.mock("@/db", () => {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(async () => [DUAL_ROW]),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);

  return {
    db: chain,
    ownerships: {},
    pets: {},
    petIdentifications: {},
  };
});

// ARCH-S: form actions now call fetchActiveIdentifications to get the current chip.
// Mock it to return a pre-existing chip so the "accepts" tests reach replaceMicrochipForUser.
vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: vi.fn(async () => ({
    microchip: {
      code: CHIP,
      isoCountryCode: "985",
      recordedAt: null,
      recordedByLabel: null,
      implantationSite: null,
    },
    tattoo: null,
  })),
}));

// ---------------------------------------------------------------------------
// Mock: format helpers + navigation
// ---------------------------------------------------------------------------

vi.mock("@/lib/utils/format", () => ({
  parseDateInput: vi.fn((s: string) => (s ? new Date(s) : null)),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

// ---------------------------------------------------------------------------
// Owner action
// ---------------------------------------------------------------------------

describe("replaceMicrochipOwnerAction — reason validation", () => {
  beforeEach(() => mockReplaceMicrochipForUser.mockReset());

  it("rejects fraud_detected (not in owner reason set)", async () => {
    const { replaceMicrochipOwnerAction } = await import(
      "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/microchip-reemplazo/action"
    );

    const fd = makeFormData({
      reason: "fraud_detected",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });
    const result = await replaceMicrochipOwnerAction(PET_TOKEN, { error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(mockReplaceMicrochipForUser).not.toHaveBeenCalled();
  });

  it("rejects duplicate_detected (not in owner reason set)", async () => {
    const { replaceMicrochipOwnerAction } = await import(
      "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/microchip-reemplazo/action"
    );

    const fd = makeFormData({
      reason: "duplicate_detected",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });
    const result = await replaceMicrochipOwnerAction(PET_TOKEN, { error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(mockReplaceMicrochipForUser).not.toHaveBeenCalled();
  });

  it("accepts damaged + new chip and passes actorContext=owner", async () => {
    mockReplaceMicrochipForUser.mockResolvedValue({ ok: true, eventId: "evt-1", caseId: null });

    const { replaceMicrochipOwnerAction } = await import(
      "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/microchip-reemplazo/action"
    );

    const fd = makeFormData({
      reason: "damaged",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });

    await expect(replaceMicrochipOwnerAction(PET_TOKEN, { error: null }, fd)).rejects.toThrow(
      "REDIRECT",
    );

    expect(mockReplaceMicrochipForUser).toHaveBeenCalledOnce();
    const [, input] = mockReplaceMicrochipForUser.mock.calls[0] as [
      string,
      { actorContext: { kind: string }; reason: string; newChipNumber: string | null },
    ];
    expect(input.actorContext.kind).toBe("owner");
    expect(input.reason).toBe("damaged");
    expect(input.newChipNumber).toBe("985141000000099");
  });

  it("rejects empty newChipNumber when reason is damaged (not a revocation reason)", async () => {
    const { replaceMicrochipOwnerAction } = await import(
      "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/microchip-reemplazo/action"
    );

    const fd = makeFormData({ reason: "damaged", newChipNumber: "", replacedAt: TODAY });
    const result = await replaceMicrochipOwnerAction(PET_TOKEN, { error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(mockReplaceMicrochipForUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Vet action
// ---------------------------------------------------------------------------

describe("replaceMicrochipVetAction — reason validation", () => {
  beforeEach(() => mockReplaceMicrochipForUser.mockReset());

  it("accepts duplicate_detected and passes actorContext=vet_in_org", async () => {
    mockReplaceMicrochipForUser.mockResolvedValue({ ok: true, eventId: "evt-2", caseId: "case-1" });

    const { replaceMicrochipVetAction } = await import(
      "@/app/org/[orgToken]/mascotas/[publicToken]/microchip/reemplazar/action"
    );

    const fd = makeFormData({
      reason: "duplicate_detected",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });

    await expect(
      replaceMicrochipVetAction(ORG_TOKEN, PET_TOKEN, { error: null }, fd),
    ).rejects.toThrow("REDIRECT");

    expect(mockReplaceMicrochipForUser).toHaveBeenCalledOnce();
    const [, input] = mockReplaceMicrochipForUser.mock.calls[0] as [
      string,
      { actorContext: { kind: string; organizationId: string } },
    ];
    expect(input.actorContext.kind).toBe("vet_in_org");
    expect(input.actorContext.organizationId).toBe(ORG_ID);
  });

  it("rejects fraud_detected (not in vet reason set)", async () => {
    const { replaceMicrochipVetAction } = await import(
      "@/app/org/[orgToken]/mascotas/[publicToken]/microchip/reemplazar/action"
    );

    const fd = makeFormData({
      reason: "fraud_detected",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });
    const result = await replaceMicrochipVetAction(ORG_TOKEN, PET_TOKEN, { error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(mockReplaceMicrochipForUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin action
// ---------------------------------------------------------------------------

describe("replaceMicrochipAdminAction — reason validation", () => {
  beforeEach(() => mockReplaceMicrochipForUser.mockReset());

  it("accepts fraud_detected with notes and passes actorContext=admin", async () => {
    mockReplaceMicrochipForUser.mockResolvedValue({ ok: true, eventId: "evt-3", caseId: "case-2" });

    const { replaceMicrochipAdminAction } = await import(
      "@/app/admin/observaciones/[publicToken]/microchip/reemplazar/action"
    );

    const fd = makeFormData({
      reason: "fraud_detected",
      newChipNumber: "",
      replacedAt: TODAY,
      notes: "Chip fraudulento — expediente policial 12345.",
    });

    await expect(replaceMicrochipAdminAction(PET_TOKEN, { error: null }, fd)).rejects.toThrow(
      "REDIRECT",
    );

    expect(mockReplaceMicrochipForUser).toHaveBeenCalledOnce();
    const [, input] = mockReplaceMicrochipForUser.mock.calls[0] as [
      string,
      { actorContext: { kind: string }; reason: string },
    ];
    expect(input.actorContext.kind).toBe("admin");
    expect(input.reason).toBe("fraud_detected");
  });

  it("rejects fraud_detected without notes (mandatory audit trail)", async () => {
    const { replaceMicrochipAdminAction } = await import(
      "@/app/admin/observaciones/[publicToken]/microchip/reemplazar/action"
    );

    const fd = makeFormData({
      reason: "fraud_detected",
      newChipNumber: "",
      replacedAt: TODAY,
      notes: "",
    });
    const result = await replaceMicrochipAdminAction(PET_TOKEN, { error: null }, fd);

    expect(result.error).toBeTruthy();
    expect(mockReplaceMicrochipForUser).not.toHaveBeenCalled();
  });

  it("accepts all owner-compatible reasons (e.g. damaged)", async () => {
    mockReplaceMicrochipForUser.mockResolvedValue({ ok: true, eventId: "evt-4", caseId: null });

    const { replaceMicrochipAdminAction } = await import(
      "@/app/admin/observaciones/[publicToken]/microchip/reemplazar/action"
    );

    const fd = makeFormData({
      reason: "damaged",
      newChipNumber: "985141000000099",
      replacedAt: TODAY,
    });

    await expect(replaceMicrochipAdminAction(PET_TOKEN, { error: null }, fd)).rejects.toThrow(
      "REDIRECT",
    );

    expect(mockReplaceMicrochipForUser).toHaveBeenCalledOnce();
  });
});
