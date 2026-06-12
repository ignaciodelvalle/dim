// Unit tests for submitAdoptionApplication use-case.
// All DB interactions faked — no real Postgres needed.
// TDD cycle: RED (this file) → GREEN (submit-adoption-application.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdoptionRepository } from "../../infrastructure/adoption-repository";
import { submitAdoptionApplication } from "../submit-adoption-application";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeListablePet(overrides: Record<string, unknown> = {}) {
  return {
    id: "pet-1",
    name: "Mochi",
    publicToken: "tok-1",
    adoptionListedAt: new Date("2024-01-01"),
    adoptionListingPausedAt: null,
    status: "active",
    adoptionEligible: true,
    inCustodyDispute: false,
    rabiesObservationStatus: null,
    custodyOwnershipId: "own-1",
    ...overrides,
  };
}

function makeOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    publicToken: "org-tok",
    verified: true,
    orgType: "shelter",
    displayName: "Refugio Test",
    ...overrides,
  };
}

// Fake repo with embedded findPetForApplication (pet + org snapshot).
function makeFakeRepo(
  options: {
    petRow?: Record<string, unknown> | null;
    orgRow?: Record<string, unknown> | null;
    applicantProfile?: Record<string, unknown> | null;
    existingApplication?: Record<string, unknown> | null;
    eventId?: string;
  } = {},
): typeof AdoptionRepository & {
  findPetForApplication: (
    petPublicToken: string,
  ) => Promise<{ pet: Record<string, unknown>; org: Record<string, unknown> } | null>;
  findApplicantProfile: (userId: string) => Promise<Record<string, unknown> | null>;
  findExistingApplication: (
    petId: string,
    userId: string,
  ) => Promise<Record<string, unknown> | null>;
  findOrgMembersForNotify: (orgId: string) => Promise<{ userId: string }[]>;
} {
  return {
    findShelterPet: vi.fn().mockResolvedValue(options.petRow ?? makeListablePet()),
    findActiveFoster: vi.fn().mockResolvedValue(null),
    findStubAdopterByDni: vi.fn().mockResolvedValue(null),
    setEligibility: vi.fn().mockResolvedValue(undefined),
    setListingStatus: vi.fn().mockResolvedValue(undefined),
    updateListingContent: vi.fn().mockResolvedValue(undefined),
    insertApplication: vi.fn().mockResolvedValue({ eventId: options.eventId ?? "evt-app-1" }),
    resolveApplication: vi.fn().mockResolvedValue(undefined),
    // Extra methods specific to submit flow:
    findPetForApplication: vi.fn().mockResolvedValue(
      options.petRow === null
        ? null
        : {
            pet: options.petRow ?? makeListablePet(),
            org: options.orgRow ?? makeOrg(),
          },
    ),
    findApplicantProfile: vi
      .fn()
      .mockResolvedValue(
        options.applicantProfile !== undefined
          ? options.applicantProfile
          : { accountType: "personal" },
      ),
    findExistingApplication: vi.fn().mockResolvedValue(options.existingApplication ?? null),
    findOrgMembersForNotify: vi.fn().mockResolvedValue([{ userId: "member-1" }]),
  } as unknown as ReturnType<typeof makeFakeRepo>;
}

const fakeTransaction = vi
  .fn()
  .mockImplementation(async (cb: (tx: unknown) => unknown) => cb("fake-tx"));

const validInput = {
  petPublicToken: "tok-1",
  housingType: "casa_con_patio" as const,
  otherPets: null,
  dailyRoutine: null,
  notes: null,
  profileSharingConsent: true,
  motivation: "Quiero adoptar a esta mascota y darle un hogar lleno de amor y cuidado.",
  priorPets: "yes_before" as const,
};

const applicant = {
  userId: "user-applicant",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("submitAdoptionApplication", () => {
  beforeEach(() => {
    fakeTransaction.mockClear();
  });

  // ---- Auth / profile checks --------------------------------------------

  it("returns error when user has no active session", async () => {
    const repo = makeFakeRepo();
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant: null,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/sesión/i);
  });

  it("returns error when institutional account tries to apply", async () => {
    const repo = makeFakeRepo({ applicantProfile: { accountType: "institutional" } });
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/institucional/i);
  });

  // ---- Listability checks -----------------------------------------------

  it("returns error when pet is not listable (not published)", async () => {
    const repo = makeFakeRepo({
      petRow: makeListablePet({ adoptionListedAt: null }),
    });
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/disponible/i);
  });

  it("returns error when pet not found", async () => {
    const repo = makeFakeRepo({ petRow: null });
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
  });

  // ---- Duplicate pending ------------------------------------------------

  it("returns error when applicant already has a pending application", async () => {
    const repo = makeFakeRepo({ existingApplication: { id: "evt-existing" } });
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/ya postulaste/i);
  });

  // ---- Profile sharing consent -----------------------------------------

  it("returns error when profileSharingConsent is false", async () => {
    const repo = makeFakeRepo();
    const result = await submitAdoptionApplication(
      { ...validInput, profileSharingConsent: false },
      { repo, applicant, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/consentimiento/i);
  });

  // ---- Successful insert + notification payload -------------------------

  it("inserts application inside a transaction on valid input", async () => {
    const repo = makeFakeRepo();
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    expect(fakeTransaction).toHaveBeenCalledOnce();
    expect(repo.insertApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        petId: "pet-1",
        userId: "user-applicant",
        housingType: "casa_con_patio",
      }),
      "fake-tx",
    );
  });

  it("returns notification payload in result (not flushed inside use-case)", async () => {
    const repo = makeFakeRepo();
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    expect(result).toMatchObject({ ok: true });
    const r = result as {
      ok: true;
      value: { eventId: string };
      notifications: { notificationType: string; category?: string | null }[];
    };
    expect(r.notifications.length).toBeGreaterThan(0);
    // Org-member fan-out notifications carry the adoption category (UI-6) so
    // they surface in the /notificaciones adoption tab.
    expect(r.notifications.every((n) => n.category === "adoption")).toBe(true);
    expect(
      r.notifications.every((n) => n.notificationType === "adoption_application_received"),
    ).toBe(true);
    // Notifications are returned, not flushed (best-effort is action's job).
    expect(repo.insertApplication).toHaveBeenCalledOnce();
  });

  it("returns the applicationEventId in value", async () => {
    const repo = makeFakeRepo({ eventId: "evt-app-42" });
    const result = await submitAdoptionApplication(validInput, {
      repo,
      applicant,
      transaction: fakeTransaction,
    });
    const r = result as { ok: true; value: { eventId: string }; notifications: unknown[] };
    expect(r.value.eventId).toBe("evt-app-42");
  });
});
