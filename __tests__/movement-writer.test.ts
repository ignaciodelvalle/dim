// Integration tests for recordMovementWriter (movilidad-jurisdiccional
// Fase 1, Capability 6 — Fork 4, highest blast radius).
//
// S10: cvi_issued / transport_recorded MUST NOT touch pets.jurisdiction*
//      (every resolveBusinessRule call site keys off those columns — a travel
//      event shifting them would retroactively change domestic compliance,
//      the PPP gate, and every jurisdiction-keyed read path).
// S11: jurisdiction_changed commits event row + denormalized columns in ONE
//      transaction — both or neither (microchipHeroTag divergence class).
// S4:  corrections are event_amended rows referencing the original; the
//      original row stays byte-identical.

import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { recordMovementWriter } from "@/src/modules/pets/application/movement/record-movement";
import { withMutationOverride } from "./_helpers/db-overrides";

// Stable test actor referenced by FK on recorded_by_user_id.
const ACTOR_ID = "22222222-3333-4444-8555-666666666666";
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
      publicToken: `MOVTEST-${suffix}-${Date.now()}`,
      name: `MovPet${suffix}`,
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

async function fetchJurisdiction(petId: string) {
  const [row] = await db
    .select({
      country: pets.jurisdictionCountry,
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);
  return row;
}

function baseParams(pet: Awaited<ReturnType<typeof insertTestPet>>) {
  return {
    pet,
    recordedByUserId: ACTOR_ID,
    eventAuthorship: ownerAuthorship,
    occurredAt: new Date(),
    notes: null,
  };
}

beforeAll(async () => {
  await db.execute(sql`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role)
    values (${ACTOR_ID}::uuid, 'movement-writer-actor@dim-test.local',
      'fake', now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
    on conflict (id) do nothing
  `);
  await db
    .insert(profiles)
    .values({
      id: ACTOR_ID,
      role: "owner",
      accountType: "personal",
      displayName: "movement-writer-actor",
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

describe("recordMovementWriter — jurisdiction_changed (S11, R6.1)", () => {
  it("commits the event row AND the pets.jurisdiction* update atomically", async () => {
    const pet = await insertTestPet("JC");
    const result = await recordMovementWriter({
      ...baseParams(pet),
      movement: {
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [event] = await db
      .select()
      .from(petEvents)
      .where(eq(petEvents.id, result.eventId))
      .limit(1);
    expect(event).toBeDefined();
    expect(event.eventType).toBe("movement_recorded");

    const jurisdiction = await fetchJurisdiction(pet.id);
    expect(jurisdiction).toEqual({
      country: "AR",
      province: "Buenos Aires",
      locality: "La Plata",
    });
  });

  it("an invalid payload (no-op move) writes NOTHING — no event, no denormalization", async () => {
    const pet = await insertTestPet("NOOP");
    const before = await fetchJurisdiction(pet.id);

    const result = await recordMovementWriter({
      ...baseParams(pet),
      movement: {
        sub_kind: "jurisdiction_changed",
        from_country: "AR",
        from_province: "CABA",
        from_locality: "Palermo",
        to_country: "AR",
        to_province: "CABA",
        to_locality: "Palermo",
        effective_date: "2026-07-01",
        reason: null,
      },
    });

    expect(result.ok).toBe(false);

    const events = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "movement_recorded")));
    expect(events).toHaveLength(0);
    expect(await fetchJurisdiction(pet.id)).toEqual(before);
  });
});

describe("recordMovementWriter — divergence regression (S10, R6.2/R6.3)", () => {
  it("cvi_issued leaves pets.jurisdictionCountry/Province/Locality byte-identical", async () => {
    const pet = await insertTestPet("CVI");
    const before = await fetchJurisdiction(pet.id);

    const result = await recordMovementWriter({
      ...baseParams(pet),
      movement: {
        sub_kind: "cvi_issued",
        origin_country: "UY",
        cvi_number: "CVI-2026-000777",
        issuing_authority: "MGAP Uruguay",
        issued_date: "2026-06-20",
        chip_iso_country_code: null,
      },
    });

    expect(result.ok).toBe(true);
    expect(await fetchJurisdiction(pet.id)).toEqual(before);
  });

  it("transport_recorded leaves pets.jurisdictionCountry/Province/Locality byte-identical", async () => {
    const pet = await insertTestPet("TR");
    const before = await fetchJurisdiction(pet.id);

    const result = await recordMovementWriter({
      ...baseParams(pet),
      movement: {
        sub_kind: "transport_recorded",
        corridor_id: "chile",
        direction: "outbound_from_ar",
        travel_date: "2026-08-15",
        mode: "land",
        purpose: null,
      },
    });

    expect(result.ok).toBe(true);
    expect(await fetchJurisdiction(pet.id)).toEqual(before);
  });
});

describe("movement_recorded — correction by amendment (S4, R1.3/R1.5)", () => {
  it("event_amended references the original; the original row stays byte-identical", async () => {
    const pet = await insertTestPet("AMEND");
    const result = await recordMovementWriter({
      ...baseParams(pet),
      movement: {
        sub_kind: "transport_recorded",
        corridor_id: "uruguay",
        direction: "outbound_from_ar",
        travel_date: "2026-08-15",
        mode: "air",
        purpose: null,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [originalBefore] = await db
      .select()
      .from(petEvents)
      .where(eq(petEvents.id, result.eventId))
      .limit(1);

    // Correction: a NEW event_amended row targeting the original (never an
    // UPDATE — the append-only trigger would reject it anyway).
    await db.insert(petEvents).values({
      petId: pet.id,
      eventType: "event_amended",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId: ACTOR_ID,
      ...ownerAuthorship,
      payload: {
        payload_version: 1,
        target_event_id: result.eventId,
        reason: "Fecha de viaje corregida",
        changes: [{ field: "travel_date", old: "2026-08-15", new: "2026-08-22" }],
        actor_role: "owner",
      },
      notes: null,
    });

    const [originalAfter] = await db
      .select()
      .from(petEvents)
      .where(eq(petEvents.id, result.eventId))
      .limit(1);
    expect(originalAfter).toEqual(originalBefore);

    const amendments = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "event_amended")));
    expect(amendments).toHaveLength(1);
    expect((amendments[0].payload as { target_event_id: string }).target_event_id).toBe(
      result.eventId,
    );
  });
});
