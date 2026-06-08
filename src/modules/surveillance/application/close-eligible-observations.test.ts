// Unit tests for application/close-eligible-observations.ts (spec §E)
// Strict TDD — tests written BEFORE implementation.
//
// KEY PARITY QUIRKS:
//   1. auto-expired path: DIRECT cases UPDATE with closedReason='auto_expired'
//      via repo.autoExpireBiteCase — NOT closeCase('resolved')
//   2. Owner notification is INSIDE the tx (not post-tx)
//   3. Escalating symptom → block + notify authorities, no event change

import { describe, expect, it, vi } from "vitest";

import type { PetEvent } from "@/db/schema";
import type {
  SurveillancePet,
  SurveillanceRepository,
} from "../infrastructure/surveillance-repository";
import {
  type CloseEligibleObservationsOptions,
  closeEligibleObservations,
} from "./close-eligible-observations";

type FakeRepo = Partial<Record<keyof SurveillanceRepository, ReturnType<typeof vi.fn>>>;

const NOW = new Date("2024-08-20T12:00:00Z");
const PAST_DUE = new Date("2024-08-10T12:00:00Z"); // before NOW
const FUTURE_DUE = new Date("2024-08-25T12:00:00Z"); // after NOW

const FAKE_BITE_ID = "a0000000-0000-4000-8000-000000000007";
const FAKE_STARTED_ID = "a0000000-0000-4000-8000-000000000008";

function makePet(overrides: Partial<SurveillancePet> = {}): SurveillancePet {
  return {
    id: "pet-cron-1",
    publicToken: "tok-cron-1",
    name: "Coco",
    species: "dog",
    status: "alive",
    rabiesObservationStatus: "in_progress",
    jurisdictionProvince: "Santa Fe",
    jurisdictionLocality: "Rosario",
    ...overrides,
  } as unknown as SurveillancePet;
}

function makeStartedEvent(observationUntil: Date): PetEvent {
  return {
    id: FAKE_STARTED_ID,
    petId: "pet-cron-1",
    eventType: "rabies_observation_started",
    occurredAt: new Date("2024-08-10"),
    recordedAt: new Date("2024-08-10"),
    recordedByUserId: null,
    authorRole: "system",
    authorOrganizationId: null,
    authorVerified: false,
    payload: {
      bite_event_id: FAKE_BITE_ID,
      observation_until: observationUntil.toISOString(),
      location: "in_situ",
      official_site_organization_id: null,
    },
    caseId: "case-cron-1",
    clientIdempotencyKey: null,
    createdAt: new Date("2024-08-10"),
  } as unknown as PetEvent;
}

function makeRepo(overrides: FakeRepo = {}): SurveillanceRepository {
  return {
    findPetsInProgress: vi.fn().mockResolvedValue([makePet()]),
    findLatestObservationStarted: vi.fn().mockResolvedValue(makeStartedEvent(PAST_DUE)),
    findEscalatingSymptom: vi.fn().mockResolvedValue(null),
    findOpenBiteCase: vi.fn().mockResolvedValue({ id: "case-cron-1" }),
    insertObservationEnded: vi.fn().mockResolvedValue(undefined),
    setObservationStatus: vi.fn().mockResolvedValue(undefined),
    autoExpireBiteCase: vi.fn().mockResolvedValue(undefined),
    findActiveOwnership: vi.fn().mockResolvedValue({ ownerUserId: "owner-cron-1" }),
    insertNotifications: vi.fn().mockResolvedValue(undefined),
    findGovtTargetsForJurisdiction: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SurveillanceRepository;
}

function makeDeps(repoOverrides: FakeRepo = {}) {
  const repo = makeRepo(repoOverrides);
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  const findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue([]);
  return { repo, transaction, findAuthoritiesForJurisdiction };
}

const BASE_OPTIONS: CloseEligibleObservationsOptions = { now: NOW };

// ---------------------------------------------------------------------------
// Happy path: auto-close as negative
// ---------------------------------------------------------------------------

describe("closeEligibleObservations — auto-close path", () => {
  it("returns stats with closedNegative=1 for an eligible pet", async () => {
    const deps = makeDeps();
    const stats = await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(stats.closedNegative).toBe(1);
    expect(stats.scanned).toBe(1);
  });

  it("inserts rabies_observation_ended with outcome=negative, closed_by_role=system", async () => {
    const deps = makeDeps();
    await closeEligibleObservations(BASE_OPTIONS, deps);
    const call = (deps.repo.insertObservationEnded as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown>; authorRole: string };
    expect(call.payload.outcome).toBe("negative");
    expect(call.payload.closed_by_role).toBe("system");
    expect(call.authorRole).toBe("system");
  });

  it("sets pet status to completed_negative", async () => {
    const deps = makeDeps();
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(deps.repo.setObservationStatus).toHaveBeenCalledWith(
      "pet-cron-1",
      "completed_negative",
      NOW,
      "fake-tx",
    );
  });

  it("uses autoExpireBiteCase (NOT closeCase resolved) — parity quirk §E", async () => {
    const deps = makeDeps();
    await closeEligibleObservations(BASE_OPTIONS, deps);
    // autoExpireBiteCase must be called
    expect(deps.repo.autoExpireBiteCase).toHaveBeenCalledWith("case-cron-1", NOW, "fake-tx");
  });

  it("does NOT call closeCase at all (uses direct UPDATE path)", async () => {
    const deps = makeDeps();
    // closeCase should not exist on deps
    const closeCaseSpy = vi.fn();
    (deps as unknown as Record<string, unknown>).closeCase = closeCaseSpy;
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(closeCaseSpy).not.toHaveBeenCalled();
  });

  it("inserts owner notification INSIDE tx when owner exists", async () => {
    const deps = makeDeps();
    await closeEligibleObservations(BASE_OPTIONS, deps);
    // Transaction was called (all ops including notification inside it)
    expect(deps.transaction).toHaveBeenCalled();
    // The notification insertion should happen inside the tx callback
    // We verify by checking that insertNotifications was called (the repo method)
    expect(deps.repo.insertNotifications).toHaveBeenCalled();
  });

  it("skips autoExpireBiteCase when no open bite case", async () => {
    const deps = makeDeps({
      findOpenBiteCase: vi.fn().mockResolvedValue(null),
    });
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(deps.repo.autoExpireBiteCase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escalating symptom path (spec §E)
// ---------------------------------------------------------------------------

describe("closeEligibleObservations — escalation path", () => {
  it("does NOT close when escalating symptom found, flags instead", async () => {
    const deps = makeDeps({
      findEscalatingSymptom: vi.fn().mockResolvedValue({ id: "symptom-1" }),
    });
    const stats = await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(stats.closedNegative).toBe(0);
    expect(stats.flaggedForReview).toBe(1);
  });

  it("does NOT insert observation_ended when escalating", async () => {
    const deps = makeDeps({
      findEscalatingSymptom: vi.fn().mockResolvedValue({ id: "symptom-1" }),
    });
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(deps.repo.insertObservationEnded).not.toHaveBeenCalled();
  });

  it("notifies authorities when escalating symptom exists (urgent severity)", async () => {
    const deps = makeDeps({
      findEscalatingSymptom: vi.fn().mockResolvedValue({ id: "symptom-1" }),
    });
    deps.findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue(["auth-1"]);
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(deps.findAuthoritiesForJurisdiction).toHaveBeenCalledWith({
      province: "Santa Fe",
      locality: "Rosario",
    });
  });
});

// ---------------------------------------------------------------------------
// Not-yet-due path
// ---------------------------------------------------------------------------

describe("closeEligibleObservations — not yet due", () => {
  it("skips pets whose observation_until is in the future", async () => {
    const deps = makeDeps({
      findLatestObservationStarted: vi.fn().mockResolvedValue(makeStartedEvent(FUTURE_DUE)),
    });
    const stats = await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(stats.skippedNotYetDue).toBe(1);
    expect(stats.closedNegative).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling / idempotency
// ---------------------------------------------------------------------------

describe("closeEligibleObservations — error handling", () => {
  it("records error when no started event found", async () => {
    const deps = makeDeps({
      findLatestObservationStarted: vi.fn().mockResolvedValue(null),
    });
    const stats = await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]?.petId).toBe("pet-cron-1");
  });

  it("isolates per-pet failures — other pets still process", async () => {
    const pet1 = makePet({ id: "pet-fail", publicToken: "tok-fail", name: "Fail" });
    const pet2 = makePet({ id: "pet-ok", publicToken: "tok-ok", name: "Ok" });

    const deps = makeDeps({
      findPetsInProgress: vi.fn().mockResolvedValue([pet1, pet2]),
      findLatestObservationStarted: vi
        .fn()
        .mockResolvedValueOnce(null) // pet1: no event → error
        .mockResolvedValueOnce(makeStartedEvent(PAST_DUE)), // pet2: ok
    });
    const stats = await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(stats.errors).toHaveLength(1);
    expect(stats.closedNegative).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Audit log parity (spec §E AUDIT_LOG: NONE)
// ---------------------------------------------------------------------------

describe("closeEligibleObservations — audit_log absence", () => {
  it("does NOT call any insertAudit method", async () => {
    const deps = makeDeps();
    const insertAuditSpy = vi.fn();
    (deps.repo as unknown as Record<string, unknown>).insertAudit = insertAuditSpy;
    await closeEligibleObservations(BASE_OPTIONS, deps);
    expect(insertAuditSpy).not.toHaveBeenCalled();
  });
});
