// Use-case test: createDangerousBreedAttestation
//
// RED → GREEN TDD. Tests cover:
//   - Happy path: plain insert (NOT idempotent) + markPppReminderRead.
//   - Attachment inserted when uploadedPath provided.
//   - No clientIdempotencyKey — PARITY QUIRK: this is a non-idempotent plain insert.
//   - markPppReminderRead always called (spec: mark unread reminder as read).
//   - Auth parity: requireAlivePetAccess at edge.

import { describe, expect, it, vi } from "vitest";
import type { EventsRepository } from "../../infrastructure/events-repository";
import { createDangerousBreedAttestation } from "./dangerous-breed-attestation-use-case";

// ---------------------------------------------------------------------------
// Minimal mock factory
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<EventsRepository> = {},
): Pick<EventsRepository, "insertEvent" | "insertAttachment" | "markPppReminderRead"> {
  return {
    insertEvent: vi.fn().mockResolvedValue({ id: "ev-1" }),
    insertAttachment: vi.fn().mockResolvedValue(undefined),
    markPppReminderRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTx() {
  return <T>(cb: (tx: unknown) => Promise<T>) => cb({} as unknown);
}

const BASE_INPUT = {
  pet: { id: "pet-1" },
  user: { id: "user-1" },
  eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
  registry: "caba_4078" as const,
  registryId: "REG-001",
  attestedAt: new Date("2024-03-20"),
  notes: "Certificado vigente",
  uploadedPath: null,
  uploadedMimeType: null,
  uploadedSize: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDangerousBreedAttestation", () => {
  it("inserts event with plain insertEvent (not idempotent) and marks ppp reminder read", async () => {
    const repo = makeRepo();
    const result = await createDangerousBreedAttestation(BASE_INPUT, {
      repo,
      transaction: makeTx(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.eventId).toBe("ev-1");

    // Must use plain insertEvent, NOT insertEventIdempotent
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    const [values] = (repo.insertEvent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(values.eventType).toBe("dangerous_breed_attested");
    expect(values.petId).toBe("pet-1");
    // No clientIdempotencyKey — plain insert
    expect(values.clientIdempotencyKey).toBeUndefined();

    // ppp reminder read always called
    expect(repo.markPppReminderRead).toHaveBeenCalledOnce();
    const [userId, petId] = (repo.markPppReminderRead as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(petId).toBe("pet-1");
  });

  it("inserts attachment when uploadedPath is provided", async () => {
    const repo = makeRepo();
    const result = await createDangerousBreedAttestation(
      {
        ...BASE_INPUT,
        uploadedPath: "path/cert.pdf",
        uploadedMimeType: "application/pdf",
        uploadedSize: 2048,
      },
      { repo, transaction: makeTx() },
    );

    expect(result.ok).toBe(true);
    expect(repo.insertAttachment).toHaveBeenCalledOnce();
    const [att] = (repo.insertAttachment as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(att.storagePath).toBe("path/cert.pdf");
    expect(att.petId).toBe("pet-1");
    expect(att.eventId).toBe("ev-1");
  });

  it("does not insert attachment when uploadedPath is null", async () => {
    const repo = makeRepo();
    await createDangerousBreedAttestation(BASE_INPUT, { repo, transaction: makeTx() });
    expect(repo.insertAttachment).not.toHaveBeenCalled();
  });

  it("payload includes registry, registry_id, attested_at in correct format", async () => {
    const repo = makeRepo();
    await createDangerousBreedAttestation(BASE_INPUT, { repo, transaction: makeTx() });

    const [values] = (repo.insertEvent as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = values.payload as Record<string, unknown>;
    // attestedAt is sliced to yyyy-mm-dd
    expect(payload.attested_at).toBe("2024-03-20");
    expect(payload.registry).toBe("caba_4078");
    expect(payload.registry_id).toBe("REG-001");
  });

  it("returns ok:true with notifications:[] on success", async () => {
    const repo = makeRepo();
    const result = await createDangerousBreedAttestation(BASE_INPUT, {
      repo,
      transaction: makeTx(),
    });
    expect(result).toMatchObject({ ok: true, notifications: [] });
  });
});
