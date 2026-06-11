// Use-case test: createMicrochip
//
// RED → GREEN TDD. Tests cover:
//   - Happy path: idempotent insert + canonical insertIdentification when pet has no chip.
//   - Replay / noop: wasNoop=true → insertIdentification NOT called, attachment skipped.
//   - Canonical skip: petHasCanonicalChip=true → insertIdentification NOT called.
//   - Attachment: uploaded path triggers insertAttachment.
//   - Auth parity: requireAlivePetAccess is the guard (tested in actions layer;
//     use-case itself is auth-agnostic by design).
//   - ARCH-R: updateMicrochipBackfill removed; legacy pets.microchipId no longer written.
//   - ARCH-S: pet.microchipId field replaced by petHasCanonicalChip: boolean.

import { describe, expect, it, vi } from "vitest";
import type { EventsRepository } from "../../infrastructure/events-repository";
import { createMicrochip } from "./microchip-use-case";

// ---------------------------------------------------------------------------
// Minimal mock factory
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<EventsRepository> = {},
): Pick<EventsRepository, "insertEventIdempotent" | "insertAttachment" | "insertIdentification"> {
  return {
    insertEventIdempotent: vi.fn().mockResolvedValue({
      event: { id: "ev-1" },
      wasNoop: false,
    }),
    insertAttachment: vi.fn().mockResolvedValue(undefined),
    insertIdentification: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTx() {
  return <T>(cb: (tx: unknown) => Promise<T>) => cb({} as unknown);
}

const BASE_INPUT = {
  // ARCH-S: microchipId replaced by petHasCanonicalChip (pre-resolved from pet_identifications).
  pet: { id: "pet-1", petHasCanonicalChip: false },
  user: { id: "user-1" },
  eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
  chipNumber: "985121025800001",
  countryCode: "AR",
  implantedBy: "Dr. García",
  locationOnBody: "interscapular",
  occurredAt: new Date("2024-01-15"),
  notes: null,
  uploadedPath: null,
  uploadedMimeType: null,
  uploadedSize: null,
  clientIdempotencyKey: "key-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMicrochip", () => {
  it("inserts the event and writes canonical identification when pet has no chip", async () => {
    const repo = makeRepo();
    const result = await createMicrochip(BASE_INPUT, { repo, transaction: makeTx() });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.value.eventId).toBe("ev-1");

    expect(repo.insertEventIdempotent).toHaveBeenCalledOnce();
    const [insertArg] = (repo.insertEventIdempotent as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(insertArg.eventType).toBe("microchip_implanted");
    expect(insertArg.petId).toBe("pet-1");
    expect(insertArg.clientIdempotencyKey).toBe("key-1");

    // Canonical row inserted because petHasCanonicalChip=false (ARCH-S).
    expect(repo.insertIdentification).toHaveBeenCalledOnce();
    const [identArg] = (repo.insertIdentification as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(identArg.petId).toBe("pet-1");
    expect(identArg.kind).toBe("microchip_iso");
    expect(identArg.code).toBe("985121025800001");
    expect(identArg.isoCompliant).toBe(true);
  });

  it("skips canonical write when pet already has a canonical chip (petHasCanonicalChip=true)", async () => {
    const repo = makeRepo();
    const result = await createMicrochip(
      // ARCH-S: petHasCanonicalChip=true signals the pet already has an active chip row.
      { ...BASE_INPUT, pet: { id: "pet-1", petHasCanonicalChip: true } },
      { repo, transaction: makeTx() },
    );

    expect(result.ok).toBe(true);
    // Event still inserted (idempotent insert)
    expect(repo.insertEventIdempotent).toHaveBeenCalledOnce();
    // Canonical write MUST NOT be called (pet already has a chip)
    expect(repo.insertIdentification).not.toHaveBeenCalled();
  });

  it("skips all side-effects on noop replay (wasNoop=true)", async () => {
    const repo = makeRepo({
      insertEventIdempotent: vi.fn().mockResolvedValue({
        event: { id: "ev-1" },
        wasNoop: true,
      }),
    });

    const result = await createMicrochip(BASE_INPUT, { repo, transaction: makeTx() });

    expect(result.ok).toBe(true);
    expect(repo.insertAttachment).not.toHaveBeenCalled();
    expect(repo.insertIdentification).not.toHaveBeenCalled();
  });

  it("inserts attachment when uploadedPath is provided", async () => {
    const repo = makeRepo();
    const result = await createMicrochip(
      {
        ...BASE_INPUT,
        uploadedPath: "path/to/file.jpg",
        uploadedMimeType: "image/jpeg",
        uploadedSize: 1024,
      },
      { repo, transaction: makeTx() },
    );

    expect(result.ok).toBe(true);
    expect(repo.insertAttachment).toHaveBeenCalledOnce();
    const [att] = (repo.insertAttachment as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(att.storagePath).toBe("path/to/file.jpg");
    expect(att.petId).toBe("pet-1");
    expect(att.eventId).toBe("ev-1");
  });

  it("does not insert attachment when uploadedPath is null", async () => {
    const repo = makeRepo();
    await createMicrochip(BASE_INPUT, { repo, transaction: makeTx() });
    expect(repo.insertAttachment).not.toHaveBeenCalled();
  });

  it("returns ok:true with notifications:[] on success", async () => {
    const repo = makeRepo();
    const result = await createMicrochip(BASE_INPUT, { repo, transaction: makeTx() });
    expect(result).toMatchObject({ ok: true, notifications: [] });
  });
});
