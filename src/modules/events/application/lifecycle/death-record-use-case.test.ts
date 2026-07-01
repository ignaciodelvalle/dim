// Test: createDeathRecord (WU-6 lifecycle — HIGHEST RISK multi-cascade)
//
// TDD RED phase — tests written BEFORE implementation.
// Parity contract: byte-for-byte behavior vs app/actions/events.ts::createDeathRecordAction.
//
// Invariants under test:
//   - IDEMPOTENT insert (insertEventIdempotent). On noop: cascades SKIPPED entirely.
//   - pets projection: status=deceased + deceasedAt.
//   - CASCADE A: auto-end active fosters → foster_ended events + pendingNotifications + close foster_placement case.
//   - CASCADE B: close custody_episode if present.
//   - CASCADE C: wasInObservation → insert rabies_observation_ended + close bite_incident + pets.rabiesObservationStatus=completed_dead.
//   - Post-tx: flushNotifications + signalAuthorityReport (if reportable) + urgent authority fan-out (if rabiesObservationClosed).
//   - Result: { ok: true, rabiesObservationClosed, diseaseCode, insertedEventId }
//   - IDEMPOTENCY NOOP: result.ok=true but no cascades triggered.

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockValidateEventPayload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events/event-schemas", () => ({
  validateEventPayload: mockValidateEventPayload,
}));

const mockCloseCase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/infra/case-helpers", () => ({
  closeCase: mockCloseCase,
  openCase: vi.fn(),
  findOpenCaseForPetAndKind: vi.fn(),
}));

const mockSignalAuthorityReport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain/authority", () => ({
  signalAuthorityReport: mockSignalAuthorityReport,
}));

const mockFindAuthoritiesForJurisdiction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/infra/approval-routing", () => ({
  findAuthoritiesForJurisdiction: mockFindAuthoritiesForJurisdiction,
}));

import type { EventsRepository } from "../../infrastructure/events-repository";
import { createDeathRecord } from "./death-record-use-case";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RepoLike = Pick<
  EventsRepository,
  | "insertEventIdempotent"
  | "insertEvent"
  | "insertAttachment"
  | "updateDeceased"
  | "findActiveFosters"
  | "endFoster"
  | "findLatestRabiesObservationStarted"
  | "updateRabiesObservationStatus"
  | "updateStatusProjection"
>;

function makeRepo(overrides: Partial<RepoLike> = {}): RepoLike {
  return {
    insertEventIdempotent: vi
      .fn()
      .mockResolvedValue({ event: { id: randomUUID() }, wasNoop: false }),
    insertEvent: vi.fn().mockResolvedValue({ id: randomUUID() }),
    insertAttachment: vi.fn().mockResolvedValue(undefined),
    updateDeceased: vi.fn().mockResolvedValue(undefined),
    findActiveFosters: vi.fn().mockResolvedValue([]),
    endFoster: vi.fn().mockResolvedValue(undefined),
    findLatestRabiesObservationStarted: vi.fn().mockResolvedValue(null),
    updateRabiesObservationStatus: vi.fn().mockResolvedValue(undefined),
    updateStatusProjection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTransaction() {
  return vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
}

const petId = randomUUID();
const userId = randomUUID();
const eventId = randomUUID();
const caseId = randomUUID();

const basePet = {
  id: petId,
  name: "Buddy",
  status: "active",
  rabiesObservationStatus: null as string | null,
  jurisdictionProvince: "Buenos Aires",
  jurisdictionLocality: "La Plata",
};

const baseInput = {
  pet: basePet,
  recordedByUserId: userId,
  eventAuthorship: {
    authorRole: "owner" as const,
    authorOrganizationId: null as string | null,
    authorVerified: false,
  },
  cause: "natural",
  causeDetail: null as string | null,
  confirmedByVet: false,
  vetName: null as string | null,
  dispositionMethod: null as string | null,
  facility: null as string | null,
  occurredAt: new Date("2026-06-01T10:00:00Z"),
  notes: null as string | null,
  deathAtClinic: false,
  clinicName: null as string | null,
  vetContactedOwner: null as string | null,
  vetDecidedAlone: false,
  ownerToPrivateCrematorium: false,
  diseaseCode: null as string | null,
  confirmedByLab: false,
  uploadedPath: null as string | null,
  uploadedMimeType: null as string | null,
  uploadedSize: null as number | null,
  clientIdempotencyKey: null as string | null,
  custodyEpisodeCaseId: null as string | null,
  now: new Date("2026-06-01T12:00:00Z"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDeathRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateEventPayload.mockImplementation((_type: string, payload: unknown) => payload);
    mockCloseCase.mockResolvedValue(undefined);
    mockSignalAuthorityReport.mockResolvedValue(undefined);
    mockFindAuthoritiesForJurisdiction.mockResolvedValue([]);
  });

  it("inserts death_recorded event and updates pets.status=deceased", async () => {
    const repo = makeRepo();
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(baseInput, {
      repo,
      transaction: tx,
      flushNotifications: flush,
    });

    expect(result.ok).toBe(true);
    expect(repo.insertEventIdempotent).toHaveBeenCalledTimes(1);
    const [arg] = (repo.insertEventIdempotent as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(arg.eventType).toBe("death_recorded");
    expect(repo.updateDeceased).toHaveBeenCalledWith(
      petId,
      baseInput.occurredAt,
      baseInput.now,
      expect.anything(),
    );
  });

  it("skips all cascades when idempotency noop", async () => {
    const repo = makeRepo({
      insertEventIdempotent: vi.fn().mockResolvedValue({ event: { id: eventId }, wasNoop: true }),
    });
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(baseInput, {
      repo,
      transaction: tx,
      flushNotifications: flush,
    });

    expect(result.ok).toBe(true);
    expect(repo.updateDeceased).not.toHaveBeenCalled();
    expect(repo.findActiveFosters).not.toHaveBeenCalled();
    expect(repo.findLatestRabiesObservationStarted).not.toHaveBeenCalled();
    // flush still called (with empty array)
    expect(flush).toHaveBeenCalled();
  });

  it("CASCADE A: ends active fosters, inserts foster_ended event, and closes foster_placement case", async () => {
    const fosterId = randomUUID();
    const fosterUserId = randomUUID();
    const fosterCaseId = randomUUID();
    const deathEventId = randomUUID();

    const repo = makeRepo({
      insertEventIdempotent: vi
        .fn()
        .mockResolvedValue({ event: { id: deathEventId }, wasNoop: false }),
      findActiveFosters: vi.fn().mockResolvedValue([{ id: fosterId, ownerUserId: fosterUserId }]),
    });
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(
      {
        ...baseInput,
        fosterCaseId,
      },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(result.ok).toBe(true);

    // endFoster called
    expect(repo.endFoster).toHaveBeenCalledWith(fosterId, baseInput.now, expect.anything());

    // foster_ended event inserted
    const insertCalls = (repo.insertEvent as ReturnType<typeof vi.fn>).mock.calls as [
      Record<string, unknown>,
      unknown,
    ][];
    const fosterEndedCall = insertCalls.find(([arg]) => arg.eventType === "foster_ended");
    expect(fosterEndedCall).toBeDefined();
    const fosterEndedPayload = fosterEndedCall![0].payload as Record<string, unknown>;
    expect(fosterEndedPayload.reason).toBe("pet_died");
    expect(fosterEndedPayload.death_event_id).toBe(deathEventId);

    // closeCase for foster_placement
    expect(mockCloseCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: fosterCaseId }),
      expect.anything(),
    );

    // flush called with foster notification
    const flushArg = flush.mock.calls[0][0] as { notificationType: string; userId: string }[];
    const fosterNotif = flushArg.find((n) => n.notificationType === "foster_ended_by_death");
    expect(fosterNotif?.userId).toBe(fosterUserId);
  });

  it("CASCADE B: closes custody_episode when custodyEpisodeCaseId provided", async () => {
    const custodyCaseId = randomUUID();
    const repo = makeRepo();
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    await createDeathRecord(
      { ...baseInput, custodyEpisodeCaseId: custodyCaseId },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(mockCloseCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: custodyCaseId }),
      expect.anything(),
    );
  });

  it("CASCADE B: skips custody close when no custodyEpisodeCaseId", async () => {
    const repo = makeRepo();
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    await createDeathRecord(
      { ...baseInput, custodyEpisodeCaseId: null },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(mockCloseCase).not.toHaveBeenCalled();
  });

  it("CASCADE C: inserts rabies_observation_ended + closes bite_incident + updates rabiesObservationStatus when wasInObservation", async () => {
    const startedEventId = randomUUID();
    const biteCaseId = randomUUID();
    const deathEventId = randomUUID();

    const repo = makeRepo({
      insertEventIdempotent: vi
        .fn()
        .mockResolvedValue({ event: { id: deathEventId }, wasNoop: false }),
      findLatestRabiesObservationStarted: vi.fn().mockResolvedValue({
        id: startedEventId,
        payload: { bite_event_id: randomUUID() },
      }),
    });
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(
      {
        ...baseInput,
        pet: { ...basePet, rabiesObservationStatus: "in_progress" },
        biteCaseId,
      },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rabiesObservationClosed).toBe(true);
    }

    // rabies_observation_ended inserted
    const insertCalls = (repo.insertEvent as ReturnType<typeof vi.fn>).mock.calls as [
      Record<string, unknown>,
      unknown,
    ][];
    const rabiesEndedCall = insertCalls.find(
      ([arg]) => arg.eventType === "rabies_observation_ended",
    );
    expect(rabiesEndedCall).toBeDefined();
    const rabiesPayload = rabiesEndedCall![0].payload as Record<string, unknown>;
    expect(rabiesPayload.outcome).toBe("dead");
    expect(rabiesPayload.closed_by_role).toBe("system");
    expect(rabiesPayload.death_event_id).toBe(deathEventId);

    // bite_incident case closed
    expect(mockCloseCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: biteCaseId }),
      expect.anything(),
    );

    // rabiesObservationStatus updated
    expect(repo.updateRabiesObservationStatus).toHaveBeenCalledWith(
      petId,
      "completed_dead",
      baseInput.now,
      expect.anything(),
    );

    // urgent authority fan-out attempted post-tx
    mockFindAuthoritiesForJurisdiction.mockResolvedValue(["auth-user-1"]);
  });

  it("CASCADE C: skips rabies cascade when not wasInObservation", async () => {
    const repo = makeRepo();
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(
      { ...baseInput, pet: { ...basePet, rabiesObservationStatus: null } },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rabiesObservationClosed).toBe(false);
    }
    expect(repo.findLatestRabiesObservationStarted).not.toHaveBeenCalled();
  });

  it("calls signalAuthorityReport post-tx when disease is reportable", async () => {
    const deathEventId = randomUUID();
    const repo = makeRepo({
      insertEventIdempotent: vi
        .fn()
        .mockResolvedValue({ event: { id: deathEventId }, wasNoop: false }),
    });
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    await createDeathRecord(
      {
        ...baseInput,
        diseaseCode: "rabies_confirmed",
        confirmedByLab: true,
        isReportable: true,
      },
      { repo, transaction: tx, flushNotifications: flush },
    );

    expect(mockSignalAuthorityReport).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: deathEventId, diseaseCode: "rabies_confirmed" }),
    );
  });

  it("returns ok=false when transaction throws", async () => {
    const repo = makeRepo({
      insertEventIdempotent: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const tx = makeTransaction();
    const flush = vi.fn().mockResolvedValue(undefined);

    const result = await createDeathRecord(baseInput, {
      repo,
      transaction: tx,
      flushNotifications: flush,
    });

    expect(result.ok).toBe(false);
  });
});
