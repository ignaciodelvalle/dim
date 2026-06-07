// Test: setPetFound (WU-6 lifecycle)
//
// TDD RED phase — tests written BEFORE implementation.
// Parity contract: byte-for-byte behavior vs app/actions/events.ts::setPetFoundAction.
//
// Invariants under test:
//   - status=deceased → throw with "fallecida".
//   - status≠lost → idempotent early return { ok: true, alreadyActive: true } (NO write).
//   - Normal path: insert status_changed(lost→active) + update pets.status=active + closeCase.
//   - closeCase called when a lostCase is found.
//   - Result: { ok: true, alreadyActive: false } on actual write.

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockOpenCase = vi.hoisted(() => vi.fn());
const mockCloseCase = vi.hoisted(() => vi.fn());
const mockFindOpenCaseForPetAndKind = vi.hoisted(() => vi.fn());
vi.mock("@/lib/case-helpers", () => ({
  openCase: mockOpenCase,
  closeCase: mockCloseCase,
  findOpenCaseForPetAndKind: mockFindOpenCaseForPetAndKind,
}));

const mockValidateEventPayload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/event-schemas", () => ({
  validateEventPayload: mockValidateEventPayload,
}));

import type { EventsRepository } from "../../infrastructure/events-repository";
import { setPetFound } from "./set-pet-found-use-case";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo() {
  return {
    insertEvent: vi.fn().mockResolvedValue({ id: randomUUID() }),
    updateStatusProjection: vi.fn().mockResolvedValue(undefined),
  };
}

function makeTransaction() {
  return vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
}

const petId = randomUUID();
const userId = randomUUID();
const caseId = randomUUID();

const baseParams = {
  petId,
  petStatus: "lost",
  petPublicToken: "abc123",
  recordedByUserId: userId,
  eventAuthorship: {
    authorRole: "owner" as const,
    authorOrganizationId: null,
    authorVerified: false,
  },
  now: new Date("2026-06-01T12:00:00Z"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setPetFound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateEventPayload.mockImplementation((_type: string, payload: unknown) => payload);
    mockCloseCase.mockResolvedValue(undefined);
    mockFindOpenCaseForPetAndKind.mockResolvedValue(null);
  });

  it("throws when pet is deceased", async () => {
    const repo = makeRepo();
    const tx = makeTransaction();
    await expect(
      setPetFound(
        { ...baseParams, petStatus: "deceased" },
        {
          repo: repo as unknown as Pick<EventsRepository, "insertEvent" | "updateStatusProjection">,
          transaction: tx,
        },
      ),
    ).rejects.toThrow("fallecida");
  });

  it("returns alreadyActive=true without write when pet is not lost", async () => {
    const repo = makeRepo();
    const tx = makeTransaction();
    const result = await setPetFound(
      { ...baseParams, petStatus: "active" },
      {
        repo: repo as unknown as Pick<EventsRepository, "insertEvent" | "updateStatusProjection">,
        transaction: tx,
      },
    );
    expect(result).toEqual({ ok: true, alreadyActive: true });
    expect(repo.insertEvent).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });

  it("inserts status_changed(lost→active), updates pets.status, and closes case when case found", async () => {
    mockFindOpenCaseForPetAndKind.mockResolvedValue({ id: caseId });

    const repo = makeRepo();
    const tx = makeTransaction();
    const result = await setPetFound(baseParams, {
      repo: repo as unknown as Pick<EventsRepository, "insertEvent" | "updateStatusProjection">,
      transaction: tx,
    });

    expect(result).toEqual({ ok: true, alreadyActive: false });

    // status_changed inserted once
    expect(repo.insertEvent).toHaveBeenCalledTimes(1);
    const [insertArg] = repo.insertEvent.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(insertArg.eventType).toBe("status_changed");
    expect(insertArg.caseId).toBe(caseId);

    // pets.status updated to active
    expect(repo.updateStatusProjection).toHaveBeenCalledWith(
      petId,
      "active",
      baseParams.now,
      expect.anything(),
    );

    // case closed
    expect(mockCloseCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId, reason: "resolved" }),
      expect.anything(),
    );
  });

  it("inserts status_changed without caseId when no case found", async () => {
    mockFindOpenCaseForPetAndKind.mockResolvedValue(null);

    const repo = makeRepo();
    const tx = makeTransaction();
    await setPetFound(baseParams, {
      repo: repo as unknown as Pick<EventsRepository, "insertEvent" | "updateStatusProjection">,
      transaction: tx,
    });

    const [insertArg] = repo.insertEvent.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(insertArg.caseId).toBeNull();
    expect(mockCloseCase).not.toHaveBeenCalled();
  });
});
