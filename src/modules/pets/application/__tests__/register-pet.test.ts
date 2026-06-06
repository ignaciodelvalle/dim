// Unit tests for the RegisterPet use-case.
//
// Uses a fake PetsRepository — no DB, no Next.js.
// Covers: success path, PPP notification queue/suppress, atomic write delegation,
// no-op paths (notifications empty on foster_in_transit).
//
// TDD cycle: RED written before register-pet.ts exists.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedPet } from "../../domain/types";
import type { RegisterPetInput } from "../../domain/types";
import type { PetsRepository } from "../../infrastructure/pets-repository";

// ---------------------------------------------------------------------------
// Fake repository
// ---------------------------------------------------------------------------

function makeFakeRepo(overrides?: Partial<typeof PetsRepository>): typeof PetsRepository {
  return {
    generatePublicToken: vi.fn().mockResolvedValue("DIM-TEST-0001"),
    insertPetRegistered: vi
      .fn()
      .mockResolvedValue({ petId: "pet-uuid-1", eventId: "event-uuid-1" }),
    updatePetProfile: vi.fn().mockResolvedValue({ eventId: null }),
    ...overrides,
  } as unknown as typeof PetsRepository;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParsedPet(overrides?: Partial<ParsedPet>): ParsedPet {
  return {
    name: "Luna",
    species: "perro",
    sex: "female",
    breed: "labrador",
    dateOfBirth: "2022-01-01",
    birthDateIsEstimated: false,
    color: "negro",
    microchipId: null,
    microchipCountryCode: null,
    microchipImplantedAt: null,
    microchipImplantedBy: null,
    microchipLocation: null,
    estimatedWeightKg: null,
    favouriteFoods: [],
    knownAllergies: [],
    trainingLevel: null,
    insuranceCompany: null,
    insurancePolicyNumber: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "La Plata",
    acquisitionMethod: "adopted",
    emergencyInfoVisible: false,
    permanentConditions: [],
    permanentConditionsOther: null,
    discloseConditionsPublicly: false,
    custodyKind: "owner",
    ...overrides,
  };
}

function makeInput(overrides?: Partial<RegisterPetInput>): RegisterPetInput {
  return {
    parsed: makeParsedPet(),
    potentiallyDangerousBreed: false,
    uploadedPath: null,
    uploadMimeType: null,
    uploadSize: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerPet", () => {
  // Import lazily so the module doesn't need to exist yet during RED phase.
  let registerPet: typeof import("../register-pet").registerPet;

  beforeEach(async () => {
    const mod = await import("../register-pet");
    registerPet = mod.registerPet;
    vi.clearAllMocks();
  });

  describe("success path", () => {
    it("returns ok:true with petId and eventId on successful registration", async () => {
      const repo = makeFakeRepo();
      const result = await registerPet(makeInput(), {
        repo,
        actor: { user: { id: "user-1" } },
        transaction: async (cb) => await cb({} as never),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.value?.petId).toBe("pet-uuid-1");
      expect(result.value?.eventId).toBe("event-uuid-1");
    });

    it("calls repo.generatePublicToken once", async () => {
      const repo = makeFakeRepo();
      await registerPet(makeInput(), {
        repo,
        actor: { user: { id: "user-1" } },
        transaction: async (cb) => await cb({} as never),
      });

      expect(repo.generatePublicToken).toHaveBeenCalledTimes(1);
    });

    it("calls insertPetRegistered inside the transaction with the generated token", async () => {
      const repo = makeFakeRepo();
      let capturedTx: unknown;

      await registerPet(makeInput(), {
        repo,
        actor: { user: { id: "user-1" } },
        transaction: async (cb) => {
          capturedTx = {};
          return await cb(capturedTx as never);
        },
      });

      expect(repo.insertPetRegistered).toHaveBeenCalledTimes(1);
      const [args, tx] = (repo.insertPetRegistered as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args.publicToken).toBe("DIM-TEST-0001");
      expect(args.userId).toBe("user-1");
      expect(tx).toBe(capturedTx);
    });

    it("returns empty notifications when PPP is false", async () => {
      const repo = makeFakeRepo();
      const result = await registerPet(makeInput({ potentiallyDangerousBreed: false }), {
        repo,
        actor: { user: { id: "user-1" } },
        transaction: async (cb) => await cb({} as never),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.notifications).toHaveLength(0);
    });
  });

  describe("PPP notification", () => {
    it("queues ppp_registration_reminder when PPP=true and custodyKind=owner", async () => {
      const repo = makeFakeRepo();
      const result = await registerPet(
        makeInput({
          potentiallyDangerousBreed: true,
          parsed: makeParsedPet({ custodyKind: "owner", name: "Rex", breed: "pitbull" }),
        }),
        {
          repo,
          actor: { user: { id: "user-1" } },
          transaction: async (cb) => await cb({} as never),
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].notificationType).toBe("ppp_registration_reminder");
      expect(result.notifications[0].userId).toBe("user-1");
      expect(result.notifications[0].relatedPetId).toBe("pet-uuid-1");
      expect(result.notifications[0].relatedEventId).toBe("event-uuid-1");
    });

    it("suppresses PPP notification when custodyKind=foster_in_transit", async () => {
      const repo = makeFakeRepo();
      const result = await registerPet(
        makeInput({
          potentiallyDangerousBreed: true,
          parsed: makeParsedPet({ custodyKind: "foster_in_transit" }),
        }),
        {
          repo,
          actor: { user: { id: "user-1" } },
          transaction: async (cb) => await cb({} as never),
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.notifications).toHaveLength(0);
    });
  });

  describe("error path", () => {
    it("returns ok:false when transaction throws", async () => {
      const repo = makeFakeRepo({
        insertPetRegistered: vi.fn().mockRejectedValue(new Error("DB exploded")),
      });

      const result = await registerPet(makeInput(), {
        repo,
        actor: { user: { id: "user-1" } },
        transaction: async (cb) => await cb({} as never),
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toMatch(/No se pudo crear la mascota/);
    });

    it("does NOT call insertPetRegistered when generatePublicToken throws", async () => {
      const repo = makeFakeRepo({
        generatePublicToken: vi.fn().mockRejectedValue(new Error("token gen failed")),
      });

      await expect(
        registerPet(makeInput(), {
          repo,
          actor: { user: { id: "user-1" } },
          transaction: async (cb) => await cb({} as never),
        }),
      ).rejects.toThrow("token gen failed");

      expect(repo.insertPetRegistered).not.toHaveBeenCalled();
    });
  });
});
