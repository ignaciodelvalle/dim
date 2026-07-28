// Parity tests for src/modules/pets/actions.ts thin controllers.
//
// These are module-level unit tests — they mock Next.js, Supabase, and the
// use-cases so we can verify the action's orchestration logic without a DB:
//   - Auth guard fires first (createPet: getUser; updatePet: requirePetAccess)
//   - Pre-tx chip cross-check 3-way: lost→redirect / active→warn+forceToken / deceased→error
//   - Jurisdiction error propagated from resolveCanonicalJurisdiction
//   - Use-case error propagated to caller
//   - Notifications are flushed post-tx (db.insert called after use-case ok)
//
// TDD cycle: RED written before src/modules/pets/actions.ts exists.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (must be at top level before imports)
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { digest: `NEXT_REDIRECT:${url}` });
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}));

vi.mock("@/lib/infra/pet-access", () => ({
  requirePetAccess: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: "user-1" },
    supabase: {
      storage: { from: vi.fn().mockReturnValue({ remove: vi.fn() }) },
    },
    pet: {
      id: "pet-existing",
      name: "Luna",
      species: "perro",
      sex: "female",
      breed: "labrador",
      dateOfBirth: "2022-01-01",
      color: "negro",
      // ARCH-S: microchipId / microchipCountryCode / microchipImplantedAt /
      // microchipImplantedBy / microchipLocation columns dropped from pets table.
      estimatedWeightKg: null,
      favouriteFoods: null,
      knownAllergies: null,
      trainingLevel: null,
      potentiallyDangerousBreed: false,
      insuranceCompany: null,
      insurancePolicyNumber: null,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      acquisitionMethod: "adopted",
      emergencyInfoVisible: false,
      permanentConditions: [],
      permanentConditionsOther: null,
      discloseConditionsPublicly: false,
    },
    eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
    accessPath: "owner",
  }),
}));

vi.mock("@/lib/infra/uploads", () => ({
  uploadAttachmentIfPresent: vi.fn().mockResolvedValue({
    uploadedPath: null,
    mimeType: null,
    size: null,
    error: null,
  }),
}));

vi.mock("@/lib/infra/jurisdiction-validation", () => ({
  JurisdictionValidationError: class JurisdictionValidationError extends Error {},
  resolveCanonicalJurisdiction: vi.fn().mockResolvedValue({
    province: { name: "Buenos Aires" },
    locality: { localityName: "La Plata" },
  }),
}));

vi.mock("@/lib/domain/microchip-validation", () => ({
  validateMicrochipId: vi.fn().mockReturnValue({ ok: true, normalized: "724123456789012" }),
}));

vi.mock("@/lib/infra/chip-lookup", () => ({
  lookupByChip: vi.fn().mockResolvedValue(null),
}));

// Soft same-owner dedupe (gate P2) — orchestration tests default to "no
// duplicate" so createPetAction proceeds to registerPet, same posture as the
// chip-lookup mock above.
vi.mock("@/lib/infra/owner-pet-dedupe", () => ({
  findSameOwnerDuplicatePet: vi.fn().mockResolvedValue(null),
}));

// ARCH-S: updatePetAction now calls fetchActiveIdentifications to get canonical chip presence.
vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: vi.fn().mockResolvedValue({ microchip: null, tattoo: null }),
}));

vi.mock("@/lib/infra/microchip-force-token", () => ({
  generateForceToken: vi.fn().mockReturnValue("force-tok-abc"),
  validateForceToken: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/infra/breeds-server", () => ({
  isPotentiallyDangerousBreedForJurisdiction: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({})),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  notifications: { $inferInsert: {} },
}));

vi.mock("@/src/modules/pets/application/register-pet", () => ({
  registerPet: vi.fn().mockResolvedValue({
    ok: true,
    value: { petId: "new-pet-id", eventId: "new-event-id" },
    notifications: [],
  }),
}));

vi.mock("@/src/modules/pets/application/update-pet", () => ({
  updatePet: vi.fn().mockResolvedValue({
    ok: true,
    notifications: [],
  }),
}));

vi.mock("@/src/modules/pets/infrastructure/pets-repository", () => ({
  PetsRepository: {
    generatePublicToken: vi.fn(),
    insertPetRegistered: vi.fn(),
    updatePetProfile: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCreateFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append("name", "Luna");
  fd.append("species", "perro");
  fd.append("sex", "female");
  fd.append("localityName", "La Plata");
  fd.append("provinceCode", "AR-B");
  for (const [k, v] of Object.entries(overrides ?? {})) {
    fd.set(k, v);
  }
  return fd;
}

function makeUpdateFormData(overrides?: Record<string, string>): FormData {
  return makeCreateFormData(overrides);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createPetAction", () => {
  let createPetAction: typeof import("../actions").createPetAction;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../actions");
    createPetAction = mod.createPetAction;

    vi.clearAllMocks();
    // Reset mocks to defaults
    (await import("@/lib/supabase/server")).createClient = vi.fn().mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
      storage: {
        from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) }),
      },
    });
    (await import("@/lib/infra/chip-lookup")).lookupByChip = vi.fn().mockResolvedValue(null);
    (await import("@/lib/infra/jurisdiction-validation")).resolveCanonicalJurisdiction = vi
      .fn()
      .mockResolvedValue({
        province: { name: "Buenos Aires" },
        locality: { localityName: "La Plata" },
      });
    (await import("@/src/modules/pets/application/register-pet")).registerPet = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        value: { petId: "new-pet-id", eventId: "new-event-id", publicToken: "DIM-TEST-0001" },
        notifications: [],
      });
  });

  describe("auth guard", () => {
    it("returns error when no Supabase session", async () => {
      const supaClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        storage: { from: vi.fn() },
      };
      const { createClient } = await import("@/lib/supabase/server");
      (createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(supaClient);

      const result = (await createPetAction({ error: null }, makeCreateFormData())) as {
        error: string;
      };
      expect(result.error).toMatch(/Sesión expirada/);
    });
  });

  describe("chip cross-check (found_stray)", () => {
    it("redirects to match page when chip match status=lost", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { status: "lost", publicToken: "DIM-LOST-0001" },
      });

      // N3 (B.2 migration): the action RETURNS the match page rather than
      // redirect()ing to it. The old comment defending this call — "request-edge:
      // redirect stays here" — never said why it would be immune to a defect
      // that hits every other one.
      const state = await createPetAction(
        { error: null },
        makeCreateFormData({ acquisitionMethod: "found_stray", microchipId: "724123456789012" }),
      );
      expect(state.redirectTo).toBe("/mis-mascotas/nueva/match/DIM-LOST-0001");
    });

    it("returns CHIP_MATCH_ACTIVE warning when match status=active and no forceToken", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { status: "active", publicToken: "DIM-ACTIVE-0001" },
      });

      const result = (await createPetAction(
        { error: null },
        makeCreateFormData({ acquisitionMethod: "found_stray", microchipId: "724123456789012" }),
      )) as { warning: string; matchedPetToken: string; forceToken: string };

      expect(result.warning).toBe("CHIP_MATCH_ACTIVE");
      expect(result.matchedPetToken).toBe("DIM-ACTIVE-0001");
      expect(result.forceToken).toBeDefined();
    });

    it("falls through to registerPet when match status=active and forceToken is valid", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { status: "active", publicToken: "DIM-ACTIVE-0001" },
      });

      const { validateForceToken } = await import("@/lib/infra/microchip-force-token");
      (validateForceToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

      const { registerPet } = await import("@/src/modules/pets/application/register-pet");

      // The action should NOT return a warning/error state — it falls through to
      // registerPet and returns redirectTo (N3 contract).
      const result = (await createPetAction(
        { error: null },
        makeCreateFormData({
          acquisitionMethod: "found_stray",
          microchipId: "724123456789012",
          forceToken: "valid-force-token",
        }),
      )) as { error: null; redirectTo: string };

      expect(result.redirectTo).toBe("/mis-mascotas/nueva/DIM-TEST-0001/credencial");
      expect(registerPet).toHaveBeenCalledOnce();
    });

    it("returns deceased chip error when match status=deceased", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { status: "deceased", publicToken: "DIM-DEAD-0001" },
      });

      const result = (await createPetAction(
        { error: null },
        makeCreateFormData({ acquisitionMethod: "found_stray", microchipId: "724123456789012" }),
      )) as { error: string };

      expect(result.error).toMatch(/fallecida/);
    });
  });

  describe("success", () => {
    it("returns redirectTo to credencial aha page on successful register", async () => {
      const result = (await createPetAction({ error: null }, makeCreateFormData())) as {
        error: null;
        redirectTo: string;
      };
      expect(result.error).toBeNull();
      expect(result.redirectTo).toBe("/mis-mascotas/nueva/DIM-TEST-0001/credencial");
    });
  });

  describe("error propagation", () => {
    it("propagates use-case error to caller", async () => {
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");
      (registerPet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: "No se pudo crear la mascota: DB failure",
      });

      const result = (await createPetAction({ error: null }, makeCreateFormData())) as {
        error: string;
      };
      expect(result.error).toMatch(/No se pudo crear la mascota/);
    });
  });

  describe("data-quality gates", () => {
    it("P1: threads clientIdempotencyKey to registerPet", async () => {
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");
      await createPetAction(
        { error: null },
        makeCreateFormData({ clientIdempotencyKey: "11111111-1111-4111-8111-111111111111" }),
      );
      expect(registerPet).toHaveBeenCalledWith(
        expect.objectContaining({
          clientIdempotencyKey: "11111111-1111-4111-8111-111111111111",
        }),
        expect.anything(),
      );
    });

    it("P1: resolves a double-submit to the existing pet without re-flushing", async () => {
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");
      (registerPet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        value: { petId: "", eventId: "", publicToken: "DIM-DUPE-0001", wasDuplicate: true },
        notifications: [],
      });

      const result = (await createPetAction({ error: null }, makeCreateFormData())) as {
        error: null;
        redirectTo: string;
      };
      expect(result.redirectTo).toBe("/mis-mascotas/nueva/DIM-DUPE-0001/credencial");
    });

    it("P2: returns a duplicatePrompt and skips registerPet on a same-owner match", async () => {
      const { findSameOwnerDuplicatePet } = await import("@/lib/infra/owner-pet-dedupe");
      (findSameOwnerDuplicatePet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        publicToken: "DIM-MINE-0001",
        name: "Luna",
        species: "perro",
        sex: "female",
      });
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");

      const result = (await createPetAction({ error: null }, makeCreateFormData())) as {
        error: null;
        duplicatePrompt: { publicToken: string; name: string };
      };
      expect(result.duplicatePrompt.publicToken).toBe("DIM-MINE-0001");
      expect(registerPet).not.toHaveBeenCalled();
    });

    it("P2: duplicateOverride=1 skips the dedupe check and proceeds", async () => {
      const { findSameOwnerDuplicatePet } = await import("@/lib/infra/owner-pet-dedupe");
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");

      const result = (await createPetAction(
        { error: null },
        makeCreateFormData({ duplicateOverride: "1" }),
      )) as { redirectTo: string };
      expect(findSameOwnerDuplicatePet).not.toHaveBeenCalled();
      expect(registerPet).toHaveBeenCalledOnce();
      expect(result.redirectTo).toBe("/mis-mascotas/nueva/DIM-TEST-0001/credencial");
    });

    it("P3: blocks a non-found_stray chip already registered elsewhere", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { id: "other-pet", status: "active", publicToken: "DIM-OTHER-0001" },
      });
      const { registerPet } = await import("@/src/modules/pets/application/register-pet");

      const result = (await createPetAction(
        { error: null },
        makeCreateFormData({ acquisitionMethod: "adopted", microchipId: "724123456789012" }),
      )) as { error: string };
      expect(result.error).toMatch(/ya figura registrado/i);
      expect(registerPet).not.toHaveBeenCalled();
    });
  });
});

describe("updatePetAction", () => {
  let updatePetAction: typeof import("../actions").updatePetAction;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("../actions");
    updatePetAction = mod.updatePetAction;
    vi.clearAllMocks();

    (await import("@/lib/infra/pet-access")).requirePetAccess = vi.fn().mockResolvedValue({
      ok: true,
      user: { id: "user-1" },
      supabase: { storage: { from: vi.fn().mockReturnValue({ remove: vi.fn() }) } },
      pet: {
        id: "pet-existing",
        name: "Luna",
        species: "perro",
        sex: "female",
        breed: "labrador",
        dateOfBirth: "2022-01-01",
        color: "negro",
        // ARCH-S: microchipId / microchipCountryCode / microchipImplantedAt /
        // microchipImplantedBy / microchipLocation columns dropped from pets table.
        estimatedWeightKg: null,
        favouriteFoods: null,
        knownAllergies: null,
        trainingLevel: null,
        potentiallyDangerousBreed: false,
        insuranceCompany: null,
        insurancePolicyNumber: null,
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
        acquisitionMethod: "adopted",
        emergencyInfoVisible: false,
        permanentConditions: [],
        permanentConditionsOther: null,
        discloseConditionsPublicly: false,
      },
      eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
      accessPath: "owner",
    });
    (await import("@/lib/infra/jurisdiction-validation")).resolveCanonicalJurisdiction = vi
      .fn()
      .mockResolvedValue({
        province: { name: "Buenos Aires" },
        locality: { localityName: "La Plata" },
      });
    (await import("@/src/modules/pets/application/update-pet")).updatePet = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        notifications: [],
      });
  });

  describe("auth guard", () => {
    it("returns error when requirePetAccess fails", async () => {
      const { requirePetAccess } = await import("@/lib/infra/pet-access");
      (requirePetAccess as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: "Acceso denegado.",
      });

      const result = (await updatePetAction(
        "DIM-TEST-0001",
        { error: null },
        makeUpdateFormData(),
      )) as { error: string };
      expect(result.error).toBe("Acceso denegado.");
    });
  });

  describe("error propagation", () => {
    it("propagates use-case error to caller", async () => {
      const { updatePet } = await import("@/src/modules/pets/application/update-pet");
      (updatePet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        error: "No se pudo actualizar: constraint",
      });

      const result = (await updatePetAction(
        "DIM-TEST-0001",
        { error: null },
        makeUpdateFormData(),
      )) as { error: string };
      expect(result.error).toMatch(/No se pudo actualizar/);
    });
  });

  describe("data-quality gate P3 (edit path)", () => {
    it("blocks adding a chip already registered on another pet", async () => {
      const { lookupByChip } = await import("@/lib/infra/chip-lookup");
      (lookupByChip as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        pet: { id: "other-pet", status: "active", publicToken: "DIM-OTHER-0001" },
      });
      const { updatePet } = await import("@/src/modules/pets/application/update-pet");

      const result = (await updatePetAction(
        "DIM-TEST-0001",
        { error: null },
        makeUpdateFormData({ microchipId: "724123456789012" }),
      )) as { error: string };
      expect(result.error).toMatch(/ya figura registrado/i);
      expect(updatePet).not.toHaveBeenCalled();
    });
  });

  describe("notifications flush", () => {
    it("calls db.insert with notifications when use-case returns them", async () => {
      const { updatePet } = await import("@/src/modules/pets/application/update-pet");
      (updatePet as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        notifications: [
          {
            userId: "user-1",
            notificationType: "ppp_registration_reminder",
            title: "PPP reminder",
            body: "Register your pet",
            severity: "warning",
          },
        ],
      });

      const { db } = await import("@/db");
      const insertSpy = db.insert as ReturnType<typeof vi.fn>;

      // updatePetAction succeeds and RETURNS its destination (N3) — the
      // notifications must already be flushed by then.
      const state = await updatePetAction("DIM-TEST-0001", { error: null }, makeUpdateFormData());
      expect(state.redirectTo).toBe("/mis-mascotas/DIM-TEST-0001");

      expect(insertSpy).toHaveBeenCalled();
    });
  });
});
