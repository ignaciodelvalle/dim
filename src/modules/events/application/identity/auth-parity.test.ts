// Auth-parity tests for WU-3 identity use-cases.
//
// The spec mandates a test proving:
//   1. note action uses requirePetAccess (allows non-alive pets), NOT requireAlivePetAccess.
//   2. microchip and dangerous-breed-attestation actions use requireAlivePetAccess.
//
// These are unit tests over the use-case layer: they verify the use-case does NOT
// gate on pet status (that's the action's responsibility) — the use-case processes
// any pet data passed in.
//
// For the actions layer, auth is now tested directly in this file (the
// old app/actions/events.ts no longer exists — the WU-7 strangler landed
// at src/modules/events/actions.ts) via source-scan assertions on the guard
// each *Action function calls. Here we verify that:
//   - The note use-case accepts a pet with status "deceased" without error.
//   - The microchip use-case accepts a pet with status "deceased" (the use-case
//     itself is auth-agnostic; the requireAlivePetAccess guard would block before
//     reaching the use-case in production).
//   - createNoteAction / createMicrochipAction / createDangerousBreedAttestationAction
//     in src/modules/events/actions.ts call the guard this file's name promises.
//
// This mirrors the parity test pattern used for markMedicationDoseTaken (WU-2).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { EventsRepository } from "../../infrastructure/events-repository";
import { createDangerousBreedAttestation } from "./dangerous-breed-attestation-use-case";
import { createMicrochip } from "./microchip-use-case";
import { createNote } from "./note-use-case";

// Source-scan helper for the guard-label test below: the use-case layer is
// (deliberately, per the file header) auth-agnostic, so the ONLY place that
// proves "note uses requirePetAccess, not requireAlivePetAccess" is the
// actions.ts edge. Extracts one exported function's body by slicing from its
// `export async function <name>` header to the next top-level export.
function extractActionBody(src: string, fnName: string): string {
  const start = src.indexOf(`export async function ${fnName}(`);
  if (start === -1) throw new Error(`${fnName} not found in src/modules/events/actions.ts`);
  const next = src.indexOf("\nexport async function ", start + 1);
  return next === -1 ? src.slice(start) : src.slice(start, next);
}

const ACTIONS_SRC = readFileSync(join(__dirname, "..", "..", "actions.ts"), "utf8");

function noop() {
  return <T>(cb: (tx: unknown) => Promise<T>) => cb({} as unknown);
}

function makeBaseRepo(): Pick<
  EventsRepository,
  | "insertEventIdempotent"
  | "insertEvent"
  | "insertAttachment"
  | "insertIdentification"
  | "markPppReminderRead"
> {
  return {
    insertEventIdempotent: vi.fn().mockResolvedValue({ event: { id: "ev-1" }, wasNoop: false }),
    insertEvent: vi.fn().mockResolvedValue({ id: "ev-1" }),
    insertAttachment: vi.fn().mockResolvedValue(undefined),
    insertIdentification: vi.fn().mockResolvedValue(undefined),
    markPppReminderRead: vi.fn().mockResolvedValue(undefined),
  };
}

const AUTH = { authorRole: "owner", authorOrganizationId: null, authorVerified: false };

// ---------------------------------------------------------------------------
// Note: requirePetAccess (allows non-alive) — use-case must NOT block deceased pets
// ---------------------------------------------------------------------------

describe("note auth-parity", () => {
  it("use-case processes a deceased pet without error (requirePetAccess parity)", async () => {
    const repo = makeBaseRepo();
    // The use-case does not check pet status — it trusts the caller's auth guard.
    // In production, requirePetAccess allows deceased/lost, so a deceased pet
    // CAN reach this use-case.
    const result = await createNote(
      {
        pet: { id: "deceased-pet" },
        user: { id: "user-1" },
        eventAuthorship: AUTH,
        text: "Nota sobre mascota fallecida",
        occurredAt: new Date("2024-01-01"),
        category: null,
        uploadedPath: null,
        uploadedMimeType: null,
        uploadedSize: null,
        clientIdempotencyKey: null,
      },
      { repo, transaction: noop() },
    );

    // Use-case succeeds — auth scope NOT enforced at use-case level
    expect(result.ok).toBe(true);
    expect(repo.insertEventIdempotent).toHaveBeenCalledOnce();
  });

  it("createNoteAction (actions.ts edge) calls requirePetAccess, not requireAlivePetAccess", () => {
    // This used to be `expect(true).toBe(true)` — a placeholder that could never
    // fail, so it caught nothing if the actions.ts guard ever drifted from the
    // use-case's auth-agnostic assumption above. Now it actually reads the
    // source and checks the one edge that decides the parity claim.
    const body = extractActionBody(ACTIONS_SRC, "createNoteAction");
    expect(body).toMatch(/\brequirePetAccess\s*\(/);
    expect(body).not.toMatch(/\brequireAlivePetAccess\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// Microchip: requireAlivePetAccess — use-case itself is auth-agnostic
// ---------------------------------------------------------------------------

describe("microchip auth-parity", () => {
  it("use-case does not enforce alive status (guard is at actions.ts edge)", async () => {
    const repo = makeBaseRepo();
    const result = await createMicrochip(
      {
        pet: { id: "pet-x", petHasCanonicalChip: false },
        user: { id: "user-1" },
        eventAuthorship: AUTH,
        chipNumber: "985121025800002",
        countryCode: null,
        implantedBy: null,
        locationOnBody: null,
        occurredAt: new Date("2024-01-01"),
        notes: null,
        uploadedPath: null,
        uploadedMimeType: null,
        uploadedSize: null,
        clientIdempotencyKey: null,
      },
      { repo, transaction: noop() },
    );

    // Use-case succeeds — requireAlivePetAccess guard is in actions.ts (edge)
    expect(result.ok).toBe(true);
    expect(repo.insertEventIdempotent).toHaveBeenCalledOnce();
  });

  it("createMicrochipAction (actions.ts edge) calls requireAlivePetAccess", () => {
    const body = extractActionBody(ACTIONS_SRC, "createMicrochipAction");
    expect(body).toMatch(/\brequireAlivePetAccess\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// DangerousBreed: requireAlivePetAccess — use-case itself is auth-agnostic
// ---------------------------------------------------------------------------

describe("dangerous-breed auth-parity", () => {
  it("use-case does not enforce alive status (guard is at actions.ts edge)", async () => {
    const repo = makeBaseRepo();
    const result = await createDangerousBreedAttestation(
      {
        pet: { id: "pet-y" },
        user: { id: "user-1" },
        eventAuthorship: AUTH,
        registry: "caba_4078",
        registryId: null,
        attestedAt: new Date("2024-01-01"),
        notes: null,
        uploadedPath: null,
        uploadedMimeType: null,
        uploadedSize: null,
      },
      { repo, transaction: noop() },
    );

    // Use-case succeeds — requireAlivePetAccess guard is in actions.ts (edge)
    expect(result.ok).toBe(true);
    expect(repo.insertEvent).toHaveBeenCalledOnce();
  });

  it("createDangerousBreedAttestationAction (actions.ts edge) calls requireAlivePetAccess", () => {
    const body = extractActionBody(ACTIONS_SRC, "createDangerousBreedAttestationAction");
    expect(body).toMatch(/\brequireAlivePetAccess\s*\(/);
  });
});
