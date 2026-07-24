// Integration tests for the denormalized-pets-cache refresh on amendment
// (F4 re-audit, review 22/1d). An amendment that corrects a cache-bearing
// event (weight / jurisdiction / pregnancy) MUST re-derive the corresponding
// pets.* column in the SAME transaction — Invariant #3: a correction supersedes
// in every consumer, including the dual-write caches, not only the projection
// read boundaries.
//
// Runs against the local Postgres (vitest setup forces 127.0.0.1:54322).

import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// amendEvent calls revalidatePath (Next request-scoped) after the write commits;
// stub it so the use-case runs outside a request context.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { db, ownerships, petEvents, pets, profiles, reminders } from "@/db";
import type { EventType } from "@/db/schema";
import { amendEvent } from "@/src/modules/events/application/amendment/amend-event";
import { withMutationOverride } from "../../../../../../__tests__/_helpers/db-overrides";

const ACTOR_ID = "22222222-3333-4444-8555-777777777777";
const insertedPetIds: string[] = [];

const ownerAuthorship = {
  authorRole: "owner" as const,
  authorOrganizationId: null,
  authorVerified: false,
};

async function insertTestPet(suffix: string) {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: `AMENDCACHE-${suffix}-${Date.now()}`,
      name: `AmendPet${suffix}`,
      species: "dog",
      sex: "female",
      status: "active",
      jurisdictionCountry: "AR",
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  await db.insert(ownerships).values({ petId: pet.id, ownerUserId: ACTOR_ID, role: "owner" });
  insertedPetIds.push(pet.id);
  return pet;
}

async function insertEvent(
  petId: string,
  eventType: EventType,
  payload: Record<string, unknown>,
  occurredAt: Date,
) {
  const [event] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType,
      occurredAt,
      recordedAt: occurredAt,
      recordedByUserId: ACTOR_ID,
      ...ownerAuthorship,
      payload,
    })
    .returning({ id: petEvents.id });
  return event.id;
}

async function fetchPet(petId: string) {
  const [row] = await db
    .select({
      estimatedWeightKg: pets.estimatedWeightKg,
      pregnancyStatus: pets.pregnancyStatus,
      jurisdictionCountry: pets.jurisdictionCountry,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);
  return row;
}

beforeAll(async () => {
  await db.execute(sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role)
    values (${ACTOR_ID}::uuid, 'amend-cache-actor@dim-test.local',
      'fake', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
    on conflict (id) do nothing
  `);
  await db
    .insert(profiles)
    .values({
      id: ACTOR_ID,
      role: "owner",
      accountType: "personal",
      displayName: "amend-cache-actor",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  for (const petId of insertedPetIds) {
    await withMutationOverride(async (tx) => {
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
});

describe("amendEvent — pets cache refresh (Invariant #3)", () => {
  it("an amended weight_recorded flips pets.estimatedWeightKg", async () => {
    const pet = await insertTestPet("W");
    // Seed the current (pre-correction) cache to the original measurement.
    await db.update(pets).set({ estimatedWeightKg: "10" }).where(eq(pets.id, pet.id));
    const targetEventId = await insertEvent(
      pet.id,
      "weight_recorded",
      { payload_version: 1, kg: "10" },
      new Date(),
    );

    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId,
        reason: null,
        changes: [{ field: "kg", old: "10", new: "20" }],
      },
    );

    expect(result.ok).toBe(true);
    const after = await fetchPet(pet.id);
    expect(Number(after.estimatedWeightKg)).toBe(20);
  });

  it("an amended movement_recorded (jurisdiction_changed) flips pets.jurisdiction*", async () => {
    const pet = await insertTestPet("J");
    // A real jurisdiction move + its dual-written cache (La Plata).
    await db
      .update(pets)
      .set({
        jurisdictionCountry: "AR",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      })
      .where(eq(pets.id, pet.id));
    const targetEventId = await insertEvent(
      pet.id,
      "movement_recorded",
      {
        payload_version: 1,
        sub_kind: "jurisdiction_changed",
        from_country: "AR",
        from_province: "CABA",
        from_locality: "Palermo",
        to_country: "AR",
        to_province: "Buenos Aires",
        to_locality: "La Plata",
        effective_date: "2026-07-01",
        reason: null,
      },
      new Date(),
    );

    // Correct the destination locality to Quilmes (same province).
    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId,
        reason: null,
        changes: [{ field: "to_locality", old: "La Plata", new: "Quilmes" }],
      },
    );

    expect(result.ok).toBe(true);
    const after = await fetchPet(pet.id);
    expect(after.jurisdictionProvince).toBe("Buenos Aires");
    expect(after.jurisdictionLocality).toBe("Quilmes");
  });

  it("an amended clinical_info_logged (pregnancy) flips pets.pregnancyStatus", async () => {
    const pet = await insertTestPet("P");
    const t0 = new Date(Date.now() - 60_000);
    const t1 = new Date();
    // started → ended(live_birth); cache reflects completed_live_birth.
    await insertEvent(
      pet.id,
      "clinical_info_logged",
      {
        payload_version: 1,
        sub_kind: "pregnancy",
        title: "Preñez",
        details: null,
        performed_by: null,
        pregnancy_phase: "started",
      },
      t0,
    );
    const endedEventId = await insertEvent(
      pet.id,
      "clinical_info_logged",
      {
        payload_version: 1,
        sub_kind: "pregnancy",
        title: "Fin de preñez",
        details: null,
        performed_by: null,
        pregnancy_phase: "ended",
        outcome: "live_birth",
      },
      t1,
    );
    await db
      .update(pets)
      .set({ pregnancyStatus: "completed_live_birth" })
      .where(eq(pets.id, pet.id));

    // Correct the outcome to miscarriage.
    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId: endedEventId,
        reason: null,
        changes: [{ field: "outcome", old: "live_birth", new: "miscarriage" }],
      },
    );

    expect(result.ok).toBe(true);
    const after = await fetchPet(pet.id);
    expect(after.pregnancyStatus).toBe("completed_miscarriage");
  });

  it("an amended vaccination_administered (next_due_at) flips the linked OPEN reminder's dueAt (K5)", async () => {
    const pet = await insertTestPet("V");
    const originalDueAt = new Date("2026-08-01T00:00:00Z");
    const correctedDueAt = new Date("2026-09-15T00:00:00Z");
    const targetEventId = await insertEvent(
      pet.id,
      "vaccination_administered",
      {
        payload_version: 1,
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: originalDueAt.toISOString(),
      },
      new Date(),
    );
    const [reminder] = await db
      .insert(reminders)
      .values({
        petId: pet.id,
        userId: ACTOR_ID,
        reminderType: "vaccine",
        dueAt: originalDueAt,
        title: "Refuerzo: Antirrábica",
        description: "Próxima dosis programada.",
        sourceEventId: targetEventId,
      })
      .returning({ id: reminders.id });

    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId,
        reason: null,
        changes: [
          {
            field: "next_due_at",
            old: originalDueAt.toISOString(),
            new: correctedDueAt.toISOString(),
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    const [after] = await db
      .select({ dueAt: reminders.dueAt })
      .from(reminders)
      .where(eq(reminders.id, reminder.id));
    expect(after.dueAt.toISOString()).toBe(correctedDueAt.toISOString());
  });

  it("an amended vaccination_administered leaves an already-COMPLETED reminder untouched (K5)", async () => {
    const pet = await insertTestPet("VC");
    const originalDueAt = new Date("2026-08-01T00:00:00Z");
    const completedDueAt = new Date("2026-08-01T00:00:00Z");
    const targetEventId = await insertEvent(
      pet.id,
      "vaccination_administered",
      {
        payload_version: 1,
        vaccine_name: "Antirrábica",
        brand: null,
        batch: null,
        administered_by: null,
        next_due_at: originalDueAt.toISOString(),
      },
      new Date(),
    );
    const [reminder] = await db
      .insert(reminders)
      .values({
        petId: pet.id,
        userId: ACTOR_ID,
        reminderType: "vaccine",
        dueAt: completedDueAt,
        title: "Refuerzo: Antirrábica",
        description: "Próxima dosis programada.",
        sourceEventId: targetEventId,
        completedAt: new Date(),
      })
      .returning({ id: reminders.id });

    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId,
        reason: null,
        changes: [
          {
            field: "next_due_at",
            old: originalDueAt.toISOString(),
            new: "2026-09-15T00:00:00.000Z",
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    const [after] = await db
      .select({ dueAt: reminders.dueAt })
      .from(reminders)
      .where(eq(reminders.id, reminder.id));
    // Completed reminder must NOT be revived/moved by a later correction.
    expect(after.dueAt.toISOString()).toBe(completedDueAt.toISOString());
  });

  it("a non-cache-bearing amendment (note_added) leaves the caches untouched", async () => {
    const pet = await insertTestPet("N");
    await db.update(pets).set({ estimatedWeightKg: "12" }).where(eq(pets.id, pet.id));
    const targetEventId = await insertEvent(
      pet.id,
      "note_added",
      { payload_version: 1, category: "otro", text: "hola" },
      new Date(),
    );

    const result = await amendEvent(
      { id: ACTOR_ID },
      { id: pet.id, name: pet.name, publicToken: pet.publicToken },
      ownerAuthorship,
      {
        publicToken: pet.publicToken,
        targetEventId,
        reason: null,
        changes: [{ field: "text", old: "hola", new: "chau" }],
      },
    );

    expect(result.ok).toBe(true);
    const after = await fetchPet(pet.id);
    // No weight event exists → the weight refresher never runs for note_added;
    // the seeded cache is preserved.
    expect(Number(after.estimatedWeightKg)).toBe(12);
    // The amendment row was still written.
    const amendments = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "event_amended")));
    expect(amendments).toHaveLength(1);
  });
});
