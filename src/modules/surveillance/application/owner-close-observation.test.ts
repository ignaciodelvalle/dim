// Unit tests for application/owner-close-observation.ts (spec §C)
// Strict TDD — tests written BEFORE implementation.

import { describe, expect, it, vi } from "vitest";

import type { PetEvent } from "@/db/schema";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import { type OwnerCloseObservationInput, ownerCloseObservation } from "./owner-close-observation";

type FakeRepo = Partial<Record<keyof SurveillanceRepository, ReturnType<typeof vi.fn>>>;

const OBSERVATION_UNTIL_PAST = new Date(Date.now() - 1000 * 60 * 60 * 24); // yesterday
const OBSERVATION_UNTIL_FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days from now

const FAKE_BITE_ID = "a0000000-0000-4000-8000-000000000001";
const FAKE_STARTED_ID = "a0000000-0000-4000-8000-000000000002";

function makeStartedEvent(observationUntil: Date): PetEvent {
  return {
    id: FAKE_STARTED_ID,
    petId: "pet-1",
    eventType: "rabies_observation_started",
    occurredAt: new Date("2024-06-01"),
    recordedAt: new Date("2024-06-01"),
    recordedByUserId: "user-1",
    authorRole: "owner",
    authorOrganizationId: null,
    authorVerified: false,
    payload: {
      bite_event_id: FAKE_BITE_ID,
      observation_until: observationUntil.toISOString(),
      location: "in_situ",
      official_site_organization_id: null,
    },
    caseId: "case-1",
    clientIdempotencyKey: null,
    createdAt: new Date("2024-06-01"),
  } as unknown as PetEvent;
}

function makeRepo(overrides: FakeRepo = {}): SurveillanceRepository {
  return {
    findLatestObservationStarted: vi
      .fn()
      .mockResolvedValue(makeStartedEvent(OBSERVATION_UNTIL_PAST)),
    findEscalatingSymptom: vi.fn().mockResolvedValue(null),
    findOpenBiteCase: vi.fn().mockResolvedValue({ id: "case-1" }),
    insertObservationEnded: vi.fn().mockResolvedValue(undefined),
    setObservationStatus: vi.fn().mockResolvedValue(undefined),
    findActiveOwnership: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as SurveillanceRepository;
}

function makeDeps(repoOverrides: FakeRepo = {}) {
  const repo = makeRepo(repoOverrides);
  const closeCase = vi.fn().mockResolvedValue(undefined);
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  return { repo, closeCase, transaction };
}

const BASE_INPUT: OwnerCloseObservationInput = {
  pet: {
    id: "pet-1",
    publicToken: "tok-1",
    name: "Firulais",
    rabiesObservationStatus: "in_progress",
  },
  user: { id: "user-1" },
  eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("ownerCloseObservation", () => {
  it("returns ok=true when observation is due and no escalating symptoms", async () => {
    const deps = makeDeps();
    const result = await ownerCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it("inserts rabies_observation_ended event with outcome=negative", async () => {
    const deps = makeDeps();
    await ownerCloseObservation(BASE_INPUT, deps);
    const call = (deps.repo.insertObservationEnded as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.outcome).toBe("negative");
    expect(call.payload.closed_by_role).toBe("owner");
  });

  it("sets pet status to completed_negative", async () => {
    const deps = makeDeps();
    await ownerCloseObservation(BASE_INPUT, deps);
    expect(deps.repo.setObservationStatus).toHaveBeenCalledWith(
      "pet-1",
      "completed_negative",
      expect.any(Date),
      "fake-tx",
    );
  });

  it("closes bite case with reason=resolved when bite case exists", async () => {
    const deps = makeDeps();
    await ownerCloseObservation(BASE_INPUT, deps);
    expect(deps.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "resolved" }),
      "fake-tx",
    );
  });

  it("skips closeCase when no open bite case exists", async () => {
    const deps = makeDeps({
      findOpenBiteCase: vi.fn().mockResolvedValue(null),
    });
    await ownerCloseObservation(BASE_INPUT, deps);
    expect(deps.closeCase).not.toHaveBeenCalled();
  });

  it("includes owner notification in result", async () => {
    const deps = makeDeps({
      findActiveOwnership: vi.fn().mockResolvedValue({ ownerUserId: "user-1" }),
    });
    const result = await ownerCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notif = result.notifications.find(
      (n) => n.notificationType === "rabies_observation_completed_negative_owner",
    );
    expect(notif).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Negative paths (spec §C)
// ---------------------------------------------------------------------------

describe("ownerCloseObservation — error paths", () => {
  it("returns error when rabiesObservationStatus is not in_progress", async () => {
    const deps = makeDeps();
    const result = await ownerCloseObservation(
      { ...BASE_INPUT, pet: { ...BASE_INPUT.pet, rabiesObservationStatus: "completed_negative" } },
      deps,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no hay observación activa/i);
  });

  it("returns error when no started event found", async () => {
    const deps = makeDeps({
      findLatestObservationStarted: vi.fn().mockResolvedValue(null),
    });
    const result = await ownerCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/inconsistencia interna/i);
  });

  it("returns error when observation_until is in the future (10 days not yet passed)", async () => {
    const deps = makeDeps({
      findLatestObservationStarted: vi
        .fn()
        .mockResolvedValue(makeStartedEvent(OBSERVATION_UNTIL_FUTURE)),
    });
    const result = await ownerCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/aún no se cumplieron los 10 días/i);
  });

  it("returns error when escalating symptom exists", async () => {
    const deps = makeDeps({
      findEscalatingSymptom: vi.fn().mockResolvedValue({ id: "symptom-event-1" }),
    });
    const result = await ownerCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/síntomas compatibles con rabia/i);
  });
});

// ---------------------------------------------------------------------------
// Audit log parity (spec §C AUDIT_LOG: NONE)
// ---------------------------------------------------------------------------

describe("ownerCloseObservation — audit_log absence", () => {
  it("does NOT call any insertAudit method", async () => {
    const deps = makeDeps();
    // insertAudit not defined on repo — verify no audit call leaks in
    const insertAuditSpy = vi.fn();
    (deps.repo as unknown as Record<string, unknown>).insertAudit = insertAuditSpy;
    await ownerCloseObservation(BASE_INPUT, deps);
    expect(insertAuditSpy).not.toHaveBeenCalled();
  });
});
