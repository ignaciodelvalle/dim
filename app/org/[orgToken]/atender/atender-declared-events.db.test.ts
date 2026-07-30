// Integration test: the "already signed" rule, against the REAL event spine.
//
// Why a DB test and not another mock. The rule under test is a statement about
// how APPEND-ONLY ROWS RELATE TO EACH OTHER: a vet's signature cannot mutate
// the owner's declaration, it appends a sibling row. A mock lets you hand the
// query any row set you like — including one the query could never return —
// which is exactly how the original defect shipped green: the sibling test file
// fed an `authorRole = 'owner'` query a vet row, "proving" an exit condition
// that was unreachable in production. Here the rows are written to Postgres and
// read back through the untouched production query.
//
// Fixtures are pet-scoped and torn down in afterAll; pet_events is append-only
// at the DB level, so the cascading delete runs under withMutationOverride.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withMutationOverride } from "@/__tests__/_helpers/db-overrides";
import { db, petEvents, pets } from "@/db";

import {
  type SignableEventType,
  fetchPendingDeclaredEvents,
  rejectIfAlreadySigned,
} from "./atender-declared-events";

const CHIP_A = "985141004321456";
const CHIP_B = "985141009999999";

const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
const petIds: string[] = [];

// The declaration/signature ids each scenario needs to assert on.
const ids: Record<string, string> = {};
const pet: Record<string, string> = {};

async function makePet(label: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: `SIGNRULE-${suffix}-${label}`,
      name: `Firma ${label}`,
      species: "dog",
      sex: "unknown",
      status: "active",
    })
    .returning({ id: pets.id });
  petIds.push(row.id);
  return row.id;
}

/** Writes a row the way production writes it: owner declarations are
 * self_reported, vet signatures are a SEPARATE professional_verified row. The
 * owner row is never touched. */
async function writeEvent(input: {
  petId: string;
  eventType: SignableEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
  as: "owner" | "vet";
}): Promise<string> {
  const [row] = await db
    .insert(petEvents)
    .values({
      petId: input.petId,
      eventType: input.eventType,
      occurredAt: new Date(input.occurredAt),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: input.as,
      authorVerified: input.as === "vet",
      authorOrganizationId: null,
      payload: { payload_version: 1, ...input.payload },
    })
    .returning({ id: petEvents.id });
  return row.id;
}

const chip = (n: string) => ({
  chip_number: n,
  country_code: null,
  implanted_by: null,
  location_on_body: null,
});
const sterilization = { procedure: "castration", performed_by: null, clinic: null };

beforeAll(async () => {
  // A — a chip declaration nobody has signed yet.
  pet.pending = await makePet("A");
  ids.pendingChip = await writeEvent({
    petId: pet.pending,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });

  // B — THE DEFECT: the owner declared, then a vet signed. Two rows.
  pet.signed = await makePet("B");
  ids.signedChipDeclaration = await writeEvent({
    petId: pet.signed,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });
  await writeEvent({
    petId: pet.signed,
    eventType: "microchip_implanted",
    occurredAt: "2026-06-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "vet",
  });

  // C — one-shot act: sterilization signed (on a DIFFERENT date, as a vet
  // correcting the owner's guess would), then re-declared a year later.
  pet.oneShot = await makePet("C");
  await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2025-01-01T12:00:00Z",
    payload: sterilization,
    as: "owner",
  });
  await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2025-01-05T12:00:00Z",
    payload: sterilization,
    as: "vet",
  });
  ids.oneShotRedeclaration = await writeEvent({
    petId: pet.oneShot,
    eventType: "sterilization_performed",
    occurredAt: "2026-01-10T12:00:00Z",
    payload: sterilization,
    as: "owner",
  });

  // D — repeatable act: chip A signed a year ago, chip B declared today.
  pet.recurring = await makePet("D");
  ids.recurringOldDeclaration = await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2025-01-01T12:00:00Z",
    payload: chip(CHIP_A),
    as: "owner",
  });
  await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2025-01-05T12:00:00Z",
    payload: chip(CHIP_A),
    as: "vet",
  });
  ids.recurringNewDeclaration = await writeEvent({
    petId: pet.recurring,
    eventType: "microchip_implanted",
    occurredAt: "2026-01-10T12:00:00Z",
    payload: chip(CHIP_B),
    as: "owner",
  });
});

afterAll(async () => {
  if (petIds.length === 0) return;
  await withMutationOverride(async (tx) => {
    await tx.delete(pets).where(inArray(pets.id, petIds));
  });
});

describe("fetchPendingDeclaredEvents — against the real spine", () => {
  it("fixtures landed as append-only siblings (the vet row did NOT mutate the owner row)", async () => {
    const rows = await db
      .select({ id: petEvents.id, authorRole: petEvents.authorRole })
      .from(petEvents)
      .where(eq(petEvents.petId, pet.signed));
    expect(rows).toHaveLength(2);
    const declaration = rows.find((r) => r.id === ids.signedChipDeclaration);
    expect(declaration?.authorRole).toBe("owner");
    expect(rows.filter((r) => r.authorRole === "vet")).toHaveLength(1);
  });

  it("surfaces an owner declaration nobody has signed", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.pending);
    expect(pending.map((p) => p.id)).toEqual([ids.pendingChip]);
    expect(pending[0].summary).toBe(`Microchip ${CHIP_A}`);
  });

  it("DROPS the declaration once a vet has signed it (the reported defect)", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.signed);
    expect(pending).toEqual([]);
  });

  it("never re-surfaces a ONE-SHOT act, even re-declared a year later", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.oneShot);
    expect(pending).toEqual([]);
  });

  it("DOES surface a RECURRING act's genuinely new declaration a year later", async () => {
    const pending = await fetchPendingDeclaredEvents(pet.recurring);
    expect(pending.map((p) => p.id)).toEqual([ids.recurringNewDeclaration]);
    expect(pending[0].prefill.chipNumber).toBe(CHIP_B);
  });
});

describe("rejectIfAlreadySigned — agrees with the card, row for row", () => {
  it("allows signing a still-pending declaration", async () => {
    const result = await rejectIfAlreadySigned(pet.pending, "microchip_implanted", ids.pendingChip);
    expect(result).toBeNull();
  });

  it("rejects a second signature on a declaration a vet already signed", async () => {
    const result = await rejectIfAlreadySigned(
      pet.signed,
      "microchip_implanted",
      ids.signedChipDeclaration,
    );
    expect(result?.error).toMatch(/ya fue firmado/i);
  });

  it("rejects re-signing a ONE-SHOT act via a later duplicate declaration", async () => {
    const result = await rejectIfAlreadySigned(
      pet.oneShot,
      "sterilization_performed",
      ids.oneShotRedeclaration,
    );
    expect(result?.error).toMatch(/ya fue firmado/i);
  });

  it("allows signing a RECURRING act's new occurrence, and still blocks the old one", async () => {
    await expect(
      rejectIfAlreadySigned(pet.recurring, "microchip_implanted", ids.recurringNewDeclaration),
    ).resolves.toBeNull();
    const old = await rejectIfAlreadySigned(
      pet.recurring,
      "microchip_implanted",
      ids.recurringOldDeclaration,
    );
    expect(old?.error).toMatch(/ya fue firmado/i);
  });

  it("card and guard never disagree: pending ⟺ guard returns null", async () => {
    // The whole class of bug this fixes is the two answering differently.
    const cases: Array<[string, SignableEventType, string]> = [
      [pet.pending, "microchip_implanted", ids.pendingChip],
      [pet.signed, "microchip_implanted", ids.signedChipDeclaration],
      [pet.oneShot, "sterilization_performed", ids.oneShotRedeclaration],
      [pet.recurring, "microchip_implanted", ids.recurringNewDeclaration],
      [pet.recurring, "microchip_implanted", ids.recurringOldDeclaration],
    ];
    for (const [petId, eventType, eventId] of cases) {
      const pending = await fetchPendingDeclaredEvents(petId);
      const onCard = pending.some((p) => p.id === eventId);
      const guardAllows = (await rejectIfAlreadySigned(petId, eventType, eventId)) === null;
      expect({ eventId, onCard, guardAllows }).toEqual({
        eventId,
        onCard: guardAllows,
        guardAllows,
      });
    }
  });
});
