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
import { replayPetWeight } from "@/lib/projections/pet-weight";
import type { ProjectionEvent } from "@/lib/projections/types";
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

// updateWeightProjection re-derives from the spine rather than writing the
// value it is handed (cowork audit finding #4, 2026-08-12). The old
// write-through agreed with replayPetWeight — which is latest-by-occurredAt —
// only when the incoming event also happened to be the newest by date of the
// fact. The weight form exposes occurredAt as a free date input, so logging a
// FORGOTTEN weighing pointed the cache at an old measurement while the event
// log said otherwise, and nothing repaired it (repair-pet-cache-drift.ts covers
// only status/deceasedAt).
//
// WHAT WOULD HAVE TO BREAK FOR THESE TO FAIL: the re-derivation. They insert
// real weight_recorded rows and read the real pets column.
describe("updateWeightProjection", () => {
  async function insertWeighing(kg: string, occurredAt: Date) {
    await db.insert(petEvents).values({
      petId,
      eventType: "weight_recorded",
      occurredAt,
      recordedAt: new Date(),
      payload: { payload_version: 1, kg },
      authorRole: "owner",
      recordedByUserId: null,
    });
  }

  async function cachedWeight(): Promise<string | null> {
    const [row] = await db
      .select({ estimatedWeightKg: pets.estimatedWeightKg })
      .from(pets)
      .where(eq(pets.id, petId));
    return row.estimatedWeightKg;
  }

  it("projects the most recent weighing", async () => {
    await insertWeighing("12.50", new Date("2026-08-10T12:00:00Z"));
    await repo.updateWeightProjection(petId);

    expect(await cachedWeight()).toBe("12.50");
  });

  it("keeps the newest weighing when an OLDER one is recorded afterwards", async () => {
    // The bug, exactly: a forgotten weighing of 9 kg dated two months back,
    // entered after the 12,5 kg one above. The pre-fix write-through set the
    // cache to 9,00 while replayPetWeight — and the weight-history chart —
    // still said 12,50.
    await insertWeighing("9.00", new Date("2026-06-01T12:00:00Z"));
    await repo.updateWeightProjection(petId);

    expect(await cachedWeight()).toBe("12.50");
  });

  it("moves to a newer weighing when one is actually newer", async () => {
    await insertWeighing("14.00", new Date("2026-08-12T12:00:00Z"));
    await repo.updateWeightProjection(petId);

    expect(await cachedWeight()).toBe("14.00");
  });

  it("agrees with replayPetWeight over the same events — cache never contradicts the spine", async () => {
    // The invariant itself, not one instance of it: whatever the projection
    // says, the cache says.
    const events = await db
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        recordedAt: petEvents.recordedAt,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(eq(petEvents.petId, petId))
      .orderBy(petEvents.occurredAt, petEvents.recordedAt, petEvents.id);

    const projected = replayPetWeight(events as ProjectionEvent[]).estimatedWeightKg;

    expect(Number(await cachedWeight())).toBe(Number(projected));
  });
});

// updateMicrochipBackfill removed in ARCH-R — legacy pets.microchipId column
// no longer written by the application layer. Tests deleted accordingly.

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
