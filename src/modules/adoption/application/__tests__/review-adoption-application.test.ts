// Unit tests for review adoption application use-cases (approve + reject).
// All DB interactions faked — no real Postgres needed.
// TDD cycle: RED (this file) → GREEN (review-adoption-application.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdoptionRepository } from "../../infrastructure/adoption-repository";
import {
  approveAdoptionApplication,
  rejectAdoptionApplication,
} from "../review-adoption-application";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makePet(overrides: Record<string, unknown> = {}) {
  return {
    id: "pet-1",
    name: "Luna",
    publicToken: "tok-1",
    ...overrides,
  };
}

function makeApplicationEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-app-1",
    petId: "pet-1",
    eventType: "adoption_application_submitted",
    payload: { applicant_user_id: "applicant-user-1" },
    ...overrides,
  };
}

function makeFakeRepo(
  options: {
    reviewResult?:
      | { application: Record<string, unknown>; pet: Record<string, unknown> }
      | { error: string };
  } = {},
): typeof AdoptionRepository {
  const reviewResult = options.reviewResult ?? {
    application: makeApplicationEvent(),
    pet: makePet(),
  };

  return {
    findShelterPet: vi.fn().mockResolvedValue(null),
    findActiveFoster: vi.fn().mockResolvedValue(null),
    findStubAdopterByDni: vi.fn().mockResolvedValue(null),
    setEligibility: vi.fn().mockResolvedValue(undefined),
    setListingStatus: vi.fn().mockResolvedValue(undefined),
    updateListingContent: vi.fn().mockResolvedValue(undefined),
    insertApplication: vi.fn().mockResolvedValue({ eventId: "evt-1" }),
    resolveApplication: vi.fn().mockResolvedValue(undefined),
    findPetForApplication: vi.fn().mockResolvedValue(null),
    findApplicantProfile: vi.fn().mockResolvedValue(null),
    findExistingApplication: vi.fn().mockResolvedValue(null),
    findOrgMembersForNotify: vi.fn().mockResolvedValue([]),
    findApplicationForReview: vi.fn().mockResolvedValue(reviewResult),
    findPendingApplicationsExcluding: vi.fn().mockResolvedValue([]),
  } as unknown as typeof AdoptionRepository;
}

const fakeTransaction = vi
  .fn()
  .mockImplementation(async (cb: (tx: unknown) => unknown) => cb("fake-tx"));

const actor = {
  user: { id: "reviewer-user-1" },
  organization: {
    id: "org-1",
    publicToken: "org-tok",
    verified: true,
    displayName: "Refugio Test",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("approveAdoptionApplication", () => {
  beforeEach(() => {
    fakeTransaction.mockClear();
  });

  // ---- Load failures -------------------------------------------------------

  it("returns error when application not found in org", async () => {
    const repo = makeFakeRepo({
      reviewResult: { error: "Postulación no encontrada o no pertenece a tu organización." },
    });
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-missing", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/no encontrada/i);
  });

  it("returns error when application already resolved", async () => {
    const repo = makeFakeRepo({ reviewResult: { error: "Esta postulación ya fue resuelta." } });
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/resuelta/i);
  });

  it("returns error when pet already adopted", async () => {
    const repo = makeFakeRepo({
      reviewResult: {
        error: "Esta mascota ya fue adoptada — no es posible revisar postulaciones.",
      },
    });
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toMatch(/adoptada/i);
  });

  // ---- Successful approve -------------------------------------------------

  it("emits adoption_application_resolved with outcome=approved", async () => {
    const repo = makeFakeRepo();
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: true });
    expect(repo.resolveApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationEventId: "evt-app-1",
        outcome: "approved",
        reviewerUserId: "reviewer-user-1",
      }),
      "fake-tx",
    );
  });

  it("returns applicant notification in notifications array", async () => {
    const repo = makeFakeRepo();
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    expect(
      r.notifications.some((n) => n.notificationType === "adoption_application_approved"),
    ).toBe(true);
  });

  it("approve notification carries category 'adoption'", async () => {
    const repo = makeFakeRepo();
    const result = await approveAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    const r = result as { ok: true; notifications: { category?: string | null }[] };
    expect(r.notifications.every((n) => n.category === "adoption")).toBe(true);
  });
});

describe("rejectAdoptionApplication", () => {
  beforeEach(() => {
    fakeTransaction.mockClear();
  });

  it("emits adoption_application_resolved with outcome=rejected", async () => {
    const repo = makeFakeRepo();
    const result = await rejectAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: "Not suitable" },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: true });
    expect(repo.resolveApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationEventId: "evt-app-1",
        outcome: "rejected",
        reviewerUserId: "reviewer-user-1",
      }),
      "fake-tx",
    );
  });

  it("returns applicant notification in notifications array on reject", async () => {
    const repo = makeFakeRepo();
    const result = await rejectAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    const r = result as { ok: true; notifications: { notificationType: string }[] };
    expect(
      r.notifications.some((n) => n.notificationType === "adoption_application_rejected"),
    ).toBe(true);
  });

  it("reject notification carries category 'adoption'", async () => {
    const repo = makeFakeRepo();
    const result = await rejectAdoptionApplication(
      { applicationEventId: "evt-app-1", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    const r = result as { ok: true; notifications: { category?: string | null }[] };
    expect(r.notifications.every((n) => n.category === "adoption")).toBe(true);
  });

  it("returns error when application not found", async () => {
    const repo = makeFakeRepo({
      reviewResult: { error: "Postulación no encontrada o no pertenece a tu organización." },
    });
    const result = await rejectAdoptionApplication(
      { applicationEventId: "evt-missing", notes: null },
      { repo, actor, transaction: fakeTransaction },
    );
    expect(result).toMatchObject({ ok: false });
  });
});
