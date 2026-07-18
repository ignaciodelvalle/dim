// Unit tests: declared-by-owner chip/esterilización sign-off surface (#3).
//
// Strategy — pure mock-based, no DB (mirrors ./atender-access.test.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";

// Chainable @/db mock. Each terminal call (.orderBy() for the list query,
// .limit() for the single-row guard query) shifts one result array off
// dbState.results (FIFO).
const { chain, dbState } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[][] };
  const terminal = () => Promise.resolve(dbState.results.shift() ?? []);
  const chain: Record<string, unknown> = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => terminal(),
    limit: () => terminal(),
  };
  return { chain, dbState };
});

vi.mock("@/db", () => ({
  db: chain,
  petEvents: {
    id: "id",
    petId: "pet_id",
    eventType: "event_type",
    occurredAt: "occurred_at",
    payload: "payload",
    authorRole: "author_role",
    authorVerified: "author_verified",
    authorOrganizationId: "author_organization_id",
  },
}));

import { fetchPendingDeclaredEvents, rejectIfAlreadySigned } from "./atender-declared-events";

function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    petId: "pet-1",
    eventType: "microchip_implanted",
    occurredAt: new Date("2026-06-01T12:00:00Z"),
    payload: { chip_number: "985141004321456" },
    authorRole: "owner",
    authorVerified: false,
    authorOrganizationId: null,
    ...overrides,
  };
}

function queue(...rows: unknown[][]) {
  dbState.results = rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.results = [];
});

describe("fetchPendingDeclaredEvents", () => {
  it("surfaces an owner-declared, unverified chip event", async () => {
    queue([ownerRow()]);
    const pending = await fetchPendingDeclaredEvents("pet-1");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: "evt-1",
      eventType: "microchip_implanted",
      summary: "Microchip 985141004321456",
    });
    expect(pending[0].prefill.chipNumber).toBe("985141004321456");
  });

  it("surfaces an owner-declared, unverified sterilization event", async () => {
    queue([
      ownerRow({
        id: "evt-2",
        eventType: "sterilization_performed",
        payload: { procedure: "castration" },
      }),
    ]);
    const pending = await fetchPendingDeclaredEvents("pet-1");
    expect(pending).toEqual([
      expect.objectContaining({
        id: "evt-2",
        eventType: "sterilization_performed",
        summary: "Castración",
      }),
    ]);
  });

  it("excludes an already professional_verified event (authorRole=vet, verified)", async () => {
    queue([ownerRow({ authorRole: "vet", authorVerified: true })]);
    const pending = await fetchPendingDeclaredEvents("pet-1");
    expect(pending).toEqual([]);
  });

  it("ignores event types outside the signable set", async () => {
    queue([
      ownerRow({ eventType: "vaccination_administered", payload: { vaccine_name: "Antirrábica" } }),
    ]);
    const pending = await fetchPendingDeclaredEvents("pet-1");
    expect(pending).toEqual([]);
  });

  it("keeps only the latest row per type", async () => {
    queue([
      ownerRow({ id: "evt-newest", occurredAt: new Date("2026-07-01T00:00:00Z") }),
      ownerRow({ id: "evt-older", occurredAt: new Date("2026-01-01T00:00:00Z") }),
    ]);
    const pending = await fetchPendingDeclaredEvents("pet-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("evt-newest");
  });
});

describe("rejectIfAlreadySigned — append-only sign-off guard", () => {
  it("returns null (safe to sign) for a still-pending declared event", async () => {
    queue([ownerRow()]);
    const result = await rejectIfAlreadySigned("pet-1", "microchip_implanted", "evt-1");
    expect(result).toBeNull();
  });

  it("rejects (no-op) an already professional_verified event", async () => {
    queue([ownerRow({ authorRole: "vet", authorVerified: true })]);
    const result = await rejectIfAlreadySigned("pet-1", "microchip_implanted", "evt-1");
    expect(result?.error).toMatch(/ya fue firmado/i);
  });

  it("rejects when the target event belongs to a different pet", async () => {
    queue([ownerRow({ petId: "other-pet" })]);
    const result = await rejectIfAlreadySigned("pet-1", "microchip_implanted", "evt-1");
    expect(result?.error).toMatch(/ya no está disponible/i);
  });

  it("rejects when the target event is a different event type", async () => {
    queue([ownerRow({ eventType: "sterilization_performed" })]);
    const result = await rejectIfAlreadySigned("pet-1", "microchip_implanted", "evt-1");
    expect(result?.error).toMatch(/ya no está disponible/i);
  });

  it("rejects when the target event no longer exists", async () => {
    queue([]);
    const result = await rejectIfAlreadySigned("pet-1", "microchip_implanted", "evt-missing");
    expect(result?.error).toMatch(/ya no está disponible/i);
  });
});
