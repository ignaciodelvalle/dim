// Integration tests for Lost & Found Fase 4 — enriched description for unchipped pets.
//
// Structure:
//   1. Writer with enriched fields → pets row updated + event payload has lost_description
//   2. Writer without enriched fields → event payload has no lost_description
//   3. Writer for a chipped pet that submits enriched fields → fields still persist (server lenient)
//   4. Retroactive microchip: writer with microchipId on a pet with no chip →
//      pets.microchipId updated + microchip_implanted event inserted
//   5. Retroactive microchip with duplicate microchipId → fails (uniqueness), tx rolls back

import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type DisclosurePrefsInput,
  type EnrichedLostDescriptionInput,
  setPetLostWriter,
} from "@/app/actions/events";
import { db, ownerships, petEvents, pets, profiles } from "@/db";
import { withMutationOverride } from "./_helpers/db-overrides";
import { generatePublicToken } from "@/lib/publicToken";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "enriched-desc-owner@dim-test.local";
const PASS = "EnrichedDesc_2026!";

let ownerUserId: string;

// Pet IDs inserted during tests — tracked for afterAll cleanup.
const insertedPetIds: string[] = [];

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function purgeUserByEmail(email: string) {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  for (const uid of ids) {
    // Cases system (Fase D3): cases.opened_by_user_id and
    // closed_by_user_id reference profiles with RESTRICT semantics in
    // migration 0033 — null them out before deleting the profile.
    await withMutationOverride(async (tx) => {
      await tx.execute(
        sql`UPDATE pet_events SET recorded_by_user_id = NULL WHERE recorded_by_user_id = ${uid}`,
      );
      await tx.execute(
        sql`UPDATE cases SET opened_by_user_id = NULL WHERE opened_by_user_id = ${uid}`,
      );
      await tx.execute(
        sql`UPDATE cases SET closed_by_user_id = NULL WHERE closed_by_user_id = ${uid}`,
      );
    });
    await db.delete(profiles).where(eq(profiles.id, uid));
  }
  if (found) await supabase.auth.admin.deleteUser(found.id);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// Hardcoded microchips this suite asserts against. Listed up front so the
// pre-run cleanup can purge any leftover pets from a previously crashed run
// that would otherwise hit pets_microchip_unique_when_present.
const TEST_MICROCHIPS = [
  "982000411111111",
  "982000422222222",
  "982000433333333",
  "982000444444444",
  "982000499999999",
];

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);

  // Defensive: drop any leftover pet that owns one of the test microchips.
  // The unique-when-present constraint will otherwise reject re-inserts on
  // every retry.
  const stale = await db
    .select({ id: pets.id })
    .from(pets)
    .where(inArray(pets.microchipId, TEST_MICROCHIPS));
  for (const { id } of stale) {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${id}`);
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${id}`);
      await tx.delete(pets).where(eq(pets.id, id));
    });
  }

  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;
});

afterAll(async () => {
  for (const petId of insertedPetIds) {
    await withMutationOverride(async (tx) => {
      // Cases system (Fase D3): setPetLostWriter opens a lost_pet_episode
      // case. pet_events.case_id RESTRICTs cases deletion → wipe events
      // first, then the case row, then the pet.
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${petId}`);
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${petId}`);
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  await purgeUserByEmail(OWNER_EMAIL);
});

// ---------------------------------------------------------------------------
// Helper: insert an active pet with owner ownership.
// ---------------------------------------------------------------------------

async function insertActivePet(
  suffix: string,
  overrides: { microchipId?: string } = {},
): Promise<{ petId: string; publicToken: string }> {
  const token = generatePublicToken();
  const now = new Date();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `TestPet-${suffix}`,
      species: "dog",
      sex: "unknown",
      status: "active",
      potentiallyDangerousBreed: false,
      ...(overrides.microchipId ? { microchipId: overrides.microchipId } : {}),
    })
    .returning();

  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId,
    role: "owner",
    startedAt: now,
  });

  insertedPetIds.push(pet.id);
  return { petId: pet.id, publicToken: token };
}

// Default disclosure prefs.
const defaultPrefs: DisclosurePrefsInput = {
  discloseFirstNameWhenLost: true,
  disclosePhoneWhenLost: true,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: true,
  allowFinderFormWhenLost: true,
};

// ---------------------------------------------------------------------------
// Helper to fetch the latest lost status_changed event for a pet.
// ---------------------------------------------------------------------------

async function getLatestLostEvent(petId: string) {
  const [event] = await db
    .select({ payload: petEvents.payload })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, petId),
        eq(petEvents.eventType, "status_changed"),
        sql`${petEvents.payload}->>'to_status' = 'lost'`,
      ),
    )
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);
  return event;
}

// ---------------------------------------------------------------------------
// 1. Writer with enriched fields → pets row updated + event has lost_description
// ---------------------------------------------------------------------------

describe("setPetLostWriter — with enriched description", () => {
  it("persists identity fields (color, distinguishingFeatures) to pets row", async () => {
    const { petId } = await insertActivePet("enriched-identity");

    const enriched: EnrichedLostDescriptionInput = {
      color: "marrón con manchas blancas",
      distinguishingFeatures: "mancha negra en la oreja derecha",
      accessoriesWhenLost: "collar rojo con placa",
      behaviorNotes: "huidiza con extraños",
      lastSeenContext: "salió del jardín por Cerviño",
      microchipId: null,
    };

    const result = await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    expect(result.error).toBeNull();

    const [updated] = await db.select().from(pets).where(eq(pets.id, petId));
    expect(updated.status).toBe("lost");
    expect(updated.color).toBe("marrón con manchas blancas");
    expect(updated.distinguishingFeatures).toBe("mancha negra en la oreja derecha");
  });

  it("embeds lost_description in the status_changed event payload", async () => {
    const { petId } = await insertActivePet("enriched-payload");

    const enriched: EnrichedLostDescriptionInput = {
      color: "negro",
      distinguishingFeatures: null,
      accessoriesWhenLost: "collar negro con chapita roja",
      behaviorNotes: "sociable, responde a su nombre",
      lastSeenContext: "estaba en el parque cuando se asustó",
      microchipId: null,
    };

    await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: "Parque Centenario",
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    const event = await getLatestLostEvent(petId);
    expect(event).toBeDefined();

    const payload = event.payload as Record<string, unknown>;
    expect(payload.to_status).toBe("lost");

    const desc = payload.lost_description as Record<string, string | null>;
    expect(desc).toBeDefined();
    expect(desc.accessories_when_lost).toBe("collar negro con chapita roja");
    expect(desc.behavior_notes).toBe("sociable, responde a su nombre");
    expect(desc.last_seen_context).toBe("estaba en el parque cuando se asustó");
  });
});

// ---------------------------------------------------------------------------
// 2. Writer without enriched fields → no lost_description in event payload
// ---------------------------------------------------------------------------

describe("setPetLostWriter — without enriched description", () => {
  it("omits lost_description from event payload when enrichedDescription is null", async () => {
    const { petId } = await insertActivePet("no-enriched");

    await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: null,
    });

    const event = await getLatestLostEvent(petId);
    expect(event).toBeDefined();

    const payload = event.payload as Record<string, unknown>;
    // lost_description must be absent (not even an empty object).
    expect(payload.lost_description).toBeUndefined();
  });

  it("omits lost_description when all incident snapshot fields are empty strings", async () => {
    const { petId } = await insertActivePet("empty-enriched");

    const enriched: EnrichedLostDescriptionInput = {
      color: "negro",
      distinguishingFeatures: null,
      // All incident snapshot fields empty → no lost_description
      accessoriesWhenLost: null,
      behaviorNotes: null,
      lastSeenContext: null,
      microchipId: null,
    };

    await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    const event = await getLatestLostEvent(petId);
    const payload = event.payload as Record<string, unknown>;
    expect(payload.lost_description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Chipped pet that submits enriched fields → fields still persist (server lenient)
// ---------------------------------------------------------------------------

describe("setPetLostWriter — enriched fields on a chipped pet", () => {
  it("persists identity fields even when the pet already has a microchip", async () => {
    const { petId } = await insertActivePet("chipped-enriched", {
      microchipId: "982000411111111",
    });

    const enriched: EnrichedLostDescriptionInput = {
      color: "blanco con manchas negras",
      distinguishingFeatures: "cicatriz en la pata delantera izquierda",
      accessoriesWhenLost: "collar azul",
      behaviorNotes: "muy activo",
      lastSeenContext: "escapó por el jardín",
      microchipId: null,
    };

    const result = await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: "982000411111111",
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    expect(result.error).toBeNull();

    const [updated] = await db.select().from(pets).where(eq(pets.id, petId));
    expect(updated.status).toBe("lost");
    // Identity fields persisted regardless of chip presence.
    expect(updated.color).toBe("blanco con manchas negras");
    expect(updated.distinguishingFeatures).toBe("cicatriz en la pata delantera izquierda");
    // Chip was not overwritten (pet already had one, enrichedDescription.microchipId = null).
    expect(updated.microchipId).toBe("982000411111111");
  });
});

// ---------------------------------------------------------------------------
// 4. Retroactive microchip: writer with microchipId on pet with no chip
// ---------------------------------------------------------------------------

describe("setPetLostWriter — retroactive microchip capture", () => {
  it("updates pets.microchipId and inserts microchip_implanted event", async () => {
    const { petId } = await insertActivePet("retro-chip");

    const enriched: EnrichedLostDescriptionInput = {
      color: null,
      distinguishingFeatures: null,
      accessoriesWhenLost: null,
      behaviorNotes: null,
      lastSeenContext: null,
      microchipId: "982000422222222",
    };

    const result = await setPetLostWriter({
      petId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    expect(result.error).toBeNull();

    const [updated] = await db.select().from(pets).where(eq(pets.id, petId));
    expect(updated.status).toBe("lost");
    expect(updated.microchipId).toBe("982000422222222");

    // A microchip_implanted event must have been inserted.
    const [chipEvent] = await db
      .select({ payload: petEvents.payload })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "microchip_implanted")))
      .limit(1);

    expect(chipEvent).toBeDefined();
    const chipPayload = chipEvent.payload as Record<string, unknown>;
    expect(chipPayload.chip_number).toBe("982000422222222");
  });

  it("does NOT insert microchip_implanted event when pet already has a chip", async () => {
    const { petId } = await insertActivePet("retro-chip-already-has-chip", {
      microchipId: "982000433333333",
    });

    const enriched: EnrichedLostDescriptionInput = {
      color: null,
      distinguishingFeatures: null,
      accessoriesWhenLost: null,
      behaviorNotes: null,
      lastSeenContext: null,
      // Owner types a chip number but the pet already has one — server ignores the new value.
      microchipId: "982000444444444",
    };

    const result = await setPetLostWriter({
      petId,
      petStatus: "active",
      // Pass the existing chip so the writer knows to skip retroactive capture.
      petMicrochipId: "982000433333333",
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    expect(result.error).toBeNull();

    const [updated] = await db.select().from(pets).where(eq(pets.id, petId));
    // Original chip preserved — new value ignored.
    expect(updated.microchipId).toBe("982000433333333");

    // No microchip_implanted event inserted.
    const chipEvents = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "microchip_implanted")));
    expect(chipEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Retroactive microchip with duplicate microchipId → uniqueness violation
// ---------------------------------------------------------------------------

describe("setPetLostWriter — retroactive microchip uniqueness", () => {
  it("returns an error and rolls back the transaction when microchipId is already taken", async () => {
    // First pet — will own the chip number.
    const { petId: existingPetId } = await insertActivePet("chip-owner");
    await db.update(pets).set({ microchipId: "982000499999999" }).where(eq(pets.id, existingPetId));

    // Second pet — unchipped, will try to retroactively claim the same chip.
    const { petId: newPetId } = await insertActivePet("chip-collision");

    const enriched: EnrichedLostDescriptionInput = {
      color: null,
      distinguishingFeatures: null,
      accessoriesWhenLost: null,
      behaviorNotes: null,
      lastSeenContext: null,
      microchipId: "982000499999999", // duplicate
    };

    const result = await setPetLostWriter({
      petId: newPetId,
      petStatus: "active",
      petMicrochipId: null,
      fromStatus: "active",
      recordedByUserId: ownerUserId,
      eventAuthorship: { authorRole: "owner" },
      locationDescription: null,
      locationLat: null,
      locationLng: null,
      reason: null,
      disclosurePrefs: defaultPrefs,
      enrichedDescription: enriched,
    });

    // Must return an error, not throw.
    expect(result.error).not.toBeNull();

    // Transaction must have rolled back — pet status must still be 'active'.
    const [newPet] = await db.select().from(pets).where(eq(pets.id, newPetId));
    expect(newPet.status).toBe("active");
    expect(newPet.microchipId).toBeNull();

    // No status_changed event must have been inserted.
    const lostEvents = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, newPetId),
          eq(petEvents.eventType, "status_changed"),
          sql`${petEvents.payload}->>'to_status' = 'lost'`,
        ),
      );
    expect(lostEvents).toHaveLength(0);
  });
});
