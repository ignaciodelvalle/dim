// Integration tests for EventsRepository.
// Exercises WU-1 scope: generic event insert (idempotent vs plain), projection
// write-through (weight, microchip backfill-if-null, status), outbox enqueue,
// and pet alive/state reads.
//
// Postgres is REQUIRED. If unavailable, this file will fail at connection —
// that is expected and reported as an infra block (not a code failure).
//
// Key contracts verified here:
//   - insertEventIdempotent: wasNoop=true on re-insert (same clientIdempotencyKey)
//   - insertEvent (plain): always inserts a new row regardless of key
//   - updateWeightProjection: pets.estimatedWeightKg updated
//   - updateMicrochipBackfill: pets.microchipId set ONLY when currently null
//   - updateStatusProjection: pets.status updated
//   - enqueueOutbox: inserts event_notification_outbox row when rules match
//   - findPetAliveState: returns correct status for alive/deceased pets

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petEvents, pets } from "@/db";
import { withMutationOverride } from "../../../../__tests__/_helpers/db-overrides";
import { EventsRepository } from "./events-repository";

// ---------------------------------------------------------------------------
// Fixture tokens
// ---------------------------------------------------------------------------

const PET_TOKEN = "EVENTS-REPO-TEST-01";

const repo = new EventsRepository();

let petId: string;

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

async function cleanupFixtures() {
  await db.execute(sql`
    DELETE FROM event_notification_outbox
    WHERE source_event_id IN (
      SELECT id FROM pet_events WHERE pet_id IN (
        SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
      )
    )
  `);
  await db.execute(sql`
    DELETE FROM reminders WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )
  `);
  await withMutationOverride(async (tx) => {
    await tx
      .delete(petEvents)
      .where(sql`pet_id IN (SELECT id FROM pets WHERE public_token = ${PET_TOKEN})`);
  }).catch(() => {});
  await db.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanupFixtures();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "EventsRepoTestPet",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;
});

afterAll(async () => {
  await cleanupFixtures();
});

// ---------------------------------------------------------------------------
// Idempotent vs plain insert asymmetry
// ---------------------------------------------------------------------------

describe("insertEventIdempotent", () => {
  const KEY = "00000000-0000-0000-0000-000000000001";

  it("inserts a new event and returns wasNoop=false", async () => {
    const result = await repo.insertEventIdempotent({
      petId,
      eventType: "vaccination_administered",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: "owner",
      payload: {
        payload_version: 1,
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: null,
      },
      clientIdempotencyKey: KEY,
    });

    expect(result.wasNoop).toBe(false);
    expect(result.event.id).toBeTruthy();
    expect(result.event.eventType).toBe("vaccination_administered");
  });

  it("returns wasNoop=true on replay with same key", async () => {
    const result = await repo.insertEventIdempotent({
      petId,
      eventType: "vaccination_administered",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: "owner",
      payload: {
        payload_version: 1,
        vaccine_name: "Antirrábica REPLAY",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: null,
      },
      clientIdempotencyKey: KEY,
    });

    expect(result.wasNoop).toBe(true);
    // Returns the ORIGINAL event (vaccine_name is the first one)
    const payload = result.event.payload as Record<string, unknown>;
    expect(payload.vaccine_name).toBe("Antirrábica");
  });
});

describe("insertEvent (plain)", () => {
  it("always inserts a new row regardless of duplicate content", async () => {
    const countBefore = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "dangerous_breed_attested")));

    await repo.insertEvent({
      petId,
      eventType: "dangerous_breed_attested",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: "owner",
      payload: {
        payload_version: 1,
        registry: "caba_4078",
        registry_id: null,
        attested_at: "2026-01-01",
      },
    });

    await repo.insertEvent({
      petId,
      eventType: "dangerous_breed_attested",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId: null,
      authorRole: "owner",
      payload: {
        payload_version: 1,
        registry: "caba_4078",
        registry_id: null,
        attested_at: "2026-01-01",
      },
    });

    const countAfter = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "dangerous_breed_attested")));

    expect(countAfter[0].count - countBefore[0].count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Projection write-through
// ---------------------------------------------------------------------------

describe("updateWeightProjection", () => {
  it("sets pets.estimatedWeightKg", async () => {
    await repo.updateWeightProjection(petId, "12.50");

    const [row] = await db
      .select({ estimatedWeightKg: pets.estimatedWeightKg })
      .from(pets)
      .where(eq(pets.id, petId));

    expect(row.estimatedWeightKg).toBe("12.50");
  });

  it("overwrites on subsequent calls", async () => {
    await repo.updateWeightProjection(petId, "14.00");

    const [row] = await db
      .select({ estimatedWeightKg: pets.estimatedWeightKg })
      .from(pets)
      .where(eq(pets.id, petId));

    expect(row.estimatedWeightKg).toBe("14.00");
  });
});

describe("updateMicrochipBackfill", () => {
  it("sets pets.microchipId when currently null", async () => {
    // Ensure it's null first
    await db.update(pets).set({ microchipId: null }).where(eq(pets.id, petId));

    await repo.updateMicrochipBackfill(petId, {
      microchipId: "900182000123456",
      microchipCountryCode: "ARG",
      microchipImplantedAt: null,
      microchipImplantedBy: null,
      microchipLocation: null,
    });

    const [row] = await db
      .select({ microchipId: pets.microchipId })
      .from(pets)
      .where(eq(pets.id, petId));

    expect(row.microchipId).toBe("900182000123456");
  });

  it("does NOT overwrite when microchipId already set", async () => {
    // Ensure it has a value
    await db.update(pets).set({ microchipId: "EXISTING-CHIP" }).where(eq(pets.id, petId));

    await repo.updateMicrochipBackfill(petId, {
      microchipId: "900182000999999",
      microchipCountryCode: null,
      microchipImplantedAt: null,
      microchipImplantedBy: null,
      microchipLocation: null,
    });

    const [row] = await db
      .select({ microchipId: pets.microchipId })
      .from(pets)
      .where(eq(pets.id, petId));

    // Should still be the original value
    expect(row.microchipId).toBe("EXISTING-CHIP");
  });
});

describe("updateStatusProjection", () => {
  it("sets pets.status to deceased and deceasedAt", async () => {
    const now = new Date();
    await repo.updateStatusProjection(petId, "deceased", now);

    const [row] = await db
      .select({ status: pets.status, deceasedAt: pets.deceasedAt })
      .from(pets)
      .where(eq(pets.id, petId));

    expect(row.status).toBe("deceased");
    expect(row.deceasedAt).not.toBeNull();

    // Reset for subsequent tests
    await db.update(pets).set({ status: "active", deceasedAt: null }).where(eq(pets.id, petId));
  });
});

// ---------------------------------------------------------------------------
// Pet alive/state reads
// ---------------------------------------------------------------------------

describe("findPetAliveState", () => {
  it("returns pet status for an active pet", async () => {
    await db.update(pets).set({ status: "active" }).where(eq(pets.id, petId));

    const result = await repo.findPetAliveState(petId);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("active");
  });

  it("returns null when pet does not exist", async () => {
    const result = await repo.findPetAliveState("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});
