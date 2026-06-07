// Unit tests for application/medical/deworming-use-case.ts
// Spec scenarios: MEDICAL / createDeworming
// Strict TDD — tests written BEFORE implementation.
//
// Auth contract: requireAlivePetAccess.
// Idempotency: insertEventIdempotent — replay skips ALL side-effects incl. reminder.
// No outbox. No audit_log.

import { describe, expect, it, vi } from "vitest";

import type { EventsRepository } from "../../infrastructure/events-repository";
import { type CreateDewormingInput, createDeworming } from "./deworming-use-case";

type FakeRepo = {
  [K in keyof EventsRepository]?: ReturnType<typeof vi.fn>;
};

const FAKE_EVENT_ID = "e0000000-0000-4000-8000-000000000003";

function makeRepo(overrides: FakeRepo = {}): EventsRepository {
  return {
    insertEventIdempotent: vi.fn().mockResolvedValue({
      event: { id: FAKE_EVENT_ID },
      wasNoop: false,
    }),
    insertAttachment: vi.fn().mockResolvedValue(undefined),
    insertReminders: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EventsRepository;
}

function makeDeps(repoOverrides: FakeRepo = {}) {
  const repo = makeRepo(repoOverrides);
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  return { repo, transaction };
}

const BASE_INPUT: CreateDewormingInput = {
  pet: { id: "pet-1", name: "Firulais" },
  user: { id: "user-1" },
  eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
  product: "Frontline",
  type: "external",
  occurredAt: new Date("2024-06-01T10:00:00Z"),
  nextDueAt: null,
  notes: null,
  uploadedPath: null,
  uploadedMimeType: null,
  uploadedSize: null,
  clientIdempotencyKey: "key-dew-001",
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("createDeworming", () => {
  it("returns ok=true and eventId on success", async () => {
    const { repo, transaction } = makeDeps();
    const result = await createDeworming(BASE_INPUT, { repo, transaction });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventId).toBe(FAKE_EVENT_ID);
    }
  });

  it("calls insertEventIdempotent with deworming_administered eventType", async () => {
    const { repo, transaction } = makeDeps();
    await createDeworming(BASE_INPUT, { repo, transaction });
    expect(repo.insertEventIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "deworming_administered" }),
      "fake-tx",
    );
  });

  it("inserts deworming reminder when nextDueAt provided", async () => {
    const { repo, transaction } = makeDeps();
    const nextDueAt = new Date("2024-09-01T10:00:00Z");
    await createDeworming({ ...BASE_INPUT, nextDueAt }, { repo, transaction });
    expect(repo.insertReminders).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ reminderType: "deworming", dueAt: nextDueAt }),
      ]),
      "fake-tx",
    );
  });

  it("does NOT insert reminder when nextDueAt is null", async () => {
    const { repo, transaction } = makeDeps();
    await createDeworming(BASE_INPUT, { repo, transaction });
    expect(repo.insertReminders).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("createDeworming idempotency", () => {
  it("skips attachment and reminder on noop replay", async () => {
    const { repo, transaction } = makeDeps({
      insertEventIdempotent: vi.fn().mockResolvedValue({
        event: { id: FAKE_EVENT_ID },
        wasNoop: true,
      }),
    });
    const result = await createDeworming(
      {
        ...BASE_INPUT,
        uploadedPath: "a.jpg",
        uploadedMimeType: "image/jpeg",
        uploadedSize: 100,
        nextDueAt: new Date(),
      },
      { repo, transaction },
    );
    expect(result.ok).toBe(true);
    expect(repo.insertAttachment).not.toHaveBeenCalled();
    expect(repo.insertReminders).not.toHaveBeenCalled();
  });
});
