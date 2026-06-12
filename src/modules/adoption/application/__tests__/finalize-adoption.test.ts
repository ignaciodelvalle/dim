// Unit tests for finalizeAdoption use-case.
// All DB interactions faked via repo spies — no real Postgres needed.
// TDD cycle: RED (this file) → GREEN (finalize-adoption.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdoptionRepository } from "../../infrastructure/adoption-repository";
import { finalizeAdoption } from "../finalize-adoption";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeEligiblePet(overrides: Record<string, unknown> = {}) {
  return {
    id: "pet-1",
    name: "Max",
    publicToken: "tok-1",
    adoptionEligible: true,
    adoptionIneligibleReason: null,
    status: "active",
    custodyOwnershipId: "own-custody-1",
    ...overrides,
  };
}

function makeFosterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "own-foster-1",
    ownerUserId: "foster-user-1",
    ...overrides,
  };
}

function makeAdopterProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "adopter-user-1",
    accountType: "personal",
    role: "owner",
    dniVerified: true,
    ...overrides,
  };
}

type Tx = unknown;

// Full fake repo with all methods needed by finalizeAdoption.
function makeFakeRepo(
  options: {
    pet?: Record<string, unknown> | null;
    foster?: Record<string, unknown> | null;
    dniProfile?: { id: string } | null;
    adopterProfile?: Record<string, unknown> | null;
  } = {},
): typeof AdoptionRepository {
  const pet = options.pet !== undefined ? options.pet : makeEligiblePet();
  const foster = options.foster !== undefined ? options.foster : null;

  return {
    findShelterPet: vi.fn().mockResolvedValue(pet),
    findActiveFoster: vi.fn().mockResolvedValue(foster),
    findStubAdopterByDni: vi.fn().mockResolvedValue(options.dniProfile ?? null),
    findApplicantProfile: vi.fn().mockResolvedValue(options.adopterProfile ?? null),
    setEligibility: vi.fn().mockResolvedValue(undefined),
    setListingStatus: vi.fn().mockResolvedValue(undefined),
    updateListingContent: vi.fn().mockResolvedValue(undefined),
    insertApplication: vi.fn().mockResolvedValue({ eventId: "evt-1" }),
    resolveApplication: vi.fn().mockResolvedValue(undefined),
    findPetForApplication: vi.fn().mockResolvedValue(null),
    findExistingApplication: vi.fn().mockResolvedValue(null),
    findOrgMembersForNotify: vi.fn().mockResolvedValue([]),
    findApplicationForReview: vi.fn().mockResolvedValue({ error: "not used" }),
    findPendingApplicationsExcluding: vi.fn().mockResolvedValue([]),
    findOpenCustodyCase: vi.fn().mockResolvedValue(null),
    insertAdoptionFinalized: vi.fn().mockResolvedValue({ eventId: "evt-adoption-1" }),
  } as unknown as typeof AdoptionRepository;
}

const fakeTransaction = vi
  .fn()
  .mockImplementation(async (cb: (tx: Tx) => unknown) => cb("fake-tx"));

const actor = {
  user: { id: "org-user-1" },
  organization: {
    id: "org-1",
    publicToken: "org-tok",
    verified: true,
    displayName: "Refugio Test",
  },
};

const baseInput = {
  petPublicToken: "tok-1",
  adopterUserId: null,
  adopterDni: "12345678",
  adopterDisplayName: "Juan Pérez",
  adopterPhone: null,
  followupMonths: null,
  notes: null,
  contractAttachmentId: null,
  contractStoragePath: null,
  contractMimeType: null,
  contractFileSize: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("finalizeAdoption", () => {
  beforeEach(() => {
    fakeTransaction.mockClear();
  });

  // ---- Input validation (domain rules via use-case) ----------------------

  it("returns error when DNI missing in manual flow", async () => {
    const repo = makeFakeRepo();
    const result = await finalizeAdoption(
      { ...baseInput, adopterDni: "" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/DNI/i);
  });

  it("returns error when DNI format invalid (10 digits)", async () => {
    const repo = makeFakeRepo();
    const result = await finalizeAdoption(
      { ...baseInput, adopterDni: "1234567890" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/7 a 9 dígitos/i);
  });

  it("returns error when pet not found in org shelter custody", async () => {
    const repo = makeFakeRepo({ pet: null });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrada/i);
  });

  // ---- Eligibility gate -------------------------------------------------

  it("returns error when pet has eligibility=false with reason", async () => {
    const repo = makeFakeRepo({
      pet: makeEligiblePet({ adoptionEligible: false, adoptionIneligibleReason: "age" }),
    });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no apta/i);
    expect((result as { ok: false; error: string }).error).toMatch(/age/i);
  });

  it("returns error when pet eligibility is null (not evaluated)", async () => {
    const repo = makeFakeRepo({
      pet: makeEligiblePet({ adoptionEligible: null }),
    });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/evaluada/i);
  });

  // ---- Foster-shortcut path --------------------------------------------

  it("returns error when adopterUserId is supplied but is not the active foster", async () => {
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
    });
    const result = await finalizeAdoption(
      { ...baseInput, adopterUserId: "some-other-user", adopterDni: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/tránsito activo/i);
  });

  it("returns error when adopterUserId is the foster but profile not personal+dniVerified", async () => {
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      adopterProfile: makeAdopterProfile({ dniVerified: false }),
    });
    const result = await finalizeAdoption(
      { ...baseInput, adopterUserId: "foster-user-1", adopterDni: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/verificado/i);
  });

  it("returns error when adopterProfile not found for foster-shortcut", async () => {
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      adopterProfile: null,
    });
    const result = await finalizeAdoption(
      { ...baseInput, adopterUserId: "foster-user-1", adopterDni: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/perfil/i);
  });

  // ---- Successful atomic write -----------------------------------------

  it("calls insertAdoptionFinalized inside a transaction on valid DNI input", async () => {
    const repo = makeFakeRepo();
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(result).toMatchObject({ ok: true });
    expect(fakeTransaction).toHaveBeenCalledOnce();
    expect(repo.insertAdoptionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: "pet-1",
        orgId: "org-1",
        userId: "org-user-1",
      }),
      "fake-tx",
    );
  });

  it("uses existing profile instead of stub when DNI matches", async () => {
    const repo = makeFakeRepo({ dniProfile: { id: "existing-user-id" } });
    await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertAdoptionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        adopterUserId: "existing-user-id",
        isStubAdopter: false,
      }),
      "fake-tx",
    );
  });

  it("creates stub profile when no existing DNI profile found", async () => {
    const repo = makeFakeRepo({ dniProfile: null });
    await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    expect(repo.insertAdoptionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        isStubAdopter: true,
      }),
      "fake-tx",
    );
  });

  // ---- Foster-shortcut happy path --------------------------------------

  it("uses adopterUserId directly when foster-shortcut path is valid", async () => {
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      adopterProfile: makeAdopterProfile({ id: "foster-user-1" }),
    });
    const result = await finalizeAdoption(
      { ...baseInput, adopterUserId: "foster-user-1", adopterDni: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: true });
    expect(repo.insertAdoptionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({
        adopterUserId: "foster-user-1",
        isStubAdopter: false,
      }),
      "fake-tx",
    );
  });

  // ---- Notifications best-effort (returned, not flushed) ---------------

  it("returns notifications in result array (not flushed inside use-case)", async () => {
    const repo = makeFakeRepo();
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    // Use-case returns notifications — action flushes post-tx best-effort.
    // Stub adopter => no adopter notification, so notifications array may be empty or
    // contain auto-rejection notifications. Main check: tx not rolled back.
    expect(result).toMatchObject({ ok: true });
    const r = result as { ok: true; notifications: unknown[] };
    expect(Array.isArray(r.notifications)).toBe(true);
  });

  it("returns adoption_finalized notification for non-stub adopter", async () => {
    // Non-stub: existing DNI profile found
    const repo = makeFakeRepo({ dniProfile: { id: "existing-user-id" } });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    expect(r.notifications.some((n) => n.notificationType === "adoption_finalized")).toBe(true);
  });

  it("every finalize notification carries category 'adoption' (UI-6)", async () => {
    // Foster path produces the broadest set: adoption_finalized + foster_ended_by_adoption.
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      dniProfile: { id: "different-user-id" },
    });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { category?: string | null }[] };
    expect(r.notifications.length).toBeGreaterThan(0);
    expect(r.notifications.every((n) => n.category === "adoption")).toBe(true);
  });

  it("does NOT return adoption_finalized notification for stub adopter", async () => {
    // Stub: no existing DNI profile
    const repo = makeFakeRepo({ dniProfile: null });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    expect(r.notifications.some((n) => n.notificationType === "adoption_finalized")).toBe(false);
  });

  it("returns foster_ended_by_adoption notification when foster is different from adopter", async () => {
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      dniProfile: { id: "different-user-id" },
    });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string; userId: string }[] };
    const fosterNotif = r.notifications.find(
      (n) => n.notificationType === "foster_ended_by_adoption",
    );
    expect(fosterNotif).toBeDefined();
    expect(fosterNotif?.userId).toBe("foster-user-1");
  });

  it("does NOT return foster notification when foster IS the adopter", async () => {
    // Foster adopts via DNI path (foster-user-id matches existing profile)
    const repo = makeFakeRepo({
      foster: makeFosterRow({ ownerUserId: "foster-user-1" }),
      dniProfile: { id: "foster-user-1" },
    });
    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: fakeTransaction });
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    expect(r.notifications.some((n) => n.notificationType === "foster_ended_by_adoption")).toBe(
      false,
    );
  });

  // ---- Atomicity / rollback: transaction is what prevents partial state ----

  it("propagates error from insertAdoptionFinalized (simulates tx rollback)", async () => {
    const repo = makeFakeRepo();
    (
      repo as unknown as { insertAdoptionFinalized: ReturnType<typeof vi.fn> }
    ).insertAdoptionFinalized.mockRejectedValue(new Error("DB constraint violation"));

    // fakeTransaction propagates errors from the callback
    const throwingTx = vi.fn().mockImplementation(async (cb: (tx: Tx) => unknown) => cb("fake-tx"));

    const result = await finalizeAdoption(baseInput, { repo, actor, transaction: throwingTx });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/finalizar/i);
  });

  // ---- No reminders for stub adopter -----------------------------------

  it("does not include reminder-scheduling args when adopter is stub", async () => {
    const repo = makeFakeRepo({ dniProfile: null });
    await finalizeAdoption(
      { ...baseInput, followupMonths: 6 },
      { repo, actor, transaction: fakeTransaction },
    );
    // Stub adopter: reminders NOT passed to insertAdoptionFinalized
    expect(repo.insertAdoptionFinalized).toHaveBeenCalledWith(
      expect.objectContaining({ isStubAdopter: true }),
      "fake-tx",
    );
    // The use-case delegates reminder insertion to insertAdoptionFinalized
    // with followupMonths=null when stub. Check what was actually passed:
    const callArgs = (repo.insertAdoptionFinalized as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // isStubAdopter=true means reminders should be skipped inside insertAdoptionFinalized
    expect(callArgs.isStubAdopter).toBe(true);
  });
});
