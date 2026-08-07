// Integration tests for fetchPetWeightHistory (lib/owner-dashboard.ts — Chunk J).
//
// Verifies:
//   T1 — returns weight events within the last 12 months, ascending by date.
//   T2 — excludes weight events older than 12 months.
//   T3 — returns empty array when pet has no weight events.
//   T4 — normalises payload.kg from both string and number forms.

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets } from "@/db";
import { fetchPetWeightHistory } from "@/lib/analytics/owner-dashboard";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function ensureUserDeleted(email: string) {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (!found) return;
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, found.id));
  await withMutationOverride(async (tx) => {
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(found.id);
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "PetWeight_2026!",
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function createPet(userId: string, tokenSuffix: string) {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: `AR-WGT-${tokenSuffix}`,
      name: `Pet_WGT_${tokenSuffix}`,
      species: "dog",
      sex: "unknown",
      status: "active",
    })
    .returning();
  await db.insert(ownerships).values({ petId: pet.id, ownerUserId: userId, role: "owner" });
  return pet;
}

async function insertWeightEvent(
  petId: string,
  userId: string,
  occurredAt: Date,
  kg: number | string,
) {
  const [ev] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType: "weight_recorded",
      occurredAt,
      recordedAt: occurredAt,
      recordedByUserId: userId,
      authorRole: "owner",
      payload: { payload_version: 1, kg },
    })
    .returning();
  return ev;
}

async function cleanupUser(userId: string) {
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, userId));
  await withMutationOverride(async (tx) => {
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// T1 — returns weight events within the last 12 months, ascending
// ---------------------------------------------------------------------------

describe("fetchPetWeightHistory — returns recent events ascending", () => {
  const EMAIL = "wgh-t1@dim-test.local";
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL);
    const pet = await createPet(userId, `T1-${userId.slice(0, 4)}`);
    petId = pet.id;

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Insert in reverse order to confirm the helper sorts ascending.
    await insertWeightEvent(petId, userId, now, "4.5");
    await insertWeightEvent(petId, userId, threeMonthsAgo, "4.3");
    await insertWeightEvent(petId, userId, sixMonthsAgo, "4.1");
  });

  afterAll(() => cleanupUser(userId));

  it("returns all three events", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result).toHaveLength(3);
  });

  it("events are ordered ascending by date", async () => {
    const result = await fetchPetWeightHistory(petId);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date.getTime()).toBeGreaterThanOrEqual(result[i - 1].date.getTime());
    }
  });

  it("kg values are numbers", async () => {
    const result = await fetchPetWeightHistory(petId);
    for (const s of result) {
      expect(typeof s.kg).toBe("number");
      expect(Number.isFinite(s.kg)).toBe(true);
    }
  });

  it("most recent sample has kg=4.5", async () => {
    const result = await fetchPetWeightHistory(petId);
    const last = result[result.length - 1];
    expect(last.kg).toBeCloseTo(4.5);
  });
});

// ---------------------------------------------------------------------------
// T2 — excludes weight events older than 12 months
// ---------------------------------------------------------------------------

describe("fetchPetWeightHistory — excludes events older than 12 months", () => {
  const EMAIL = "wgh-t2@dim-test.local";
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL);
    const pet = await createPet(userId, `T2-${userId.slice(0, 4)}`);
    petId = pet.id;

    const now = new Date();
    const thirteenMonthsAgo = new Date(now);
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    await insertWeightEvent(petId, userId, thirteenMonthsAgo, "3.8"); // should be excluded
    await insertWeightEvent(petId, userId, twoMonthsAgo, "4.2"); // should be included
  });

  afterAll(() => cleanupUser(userId));

  it("returns only the event within 12 months", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result).toHaveLength(1);
    expect(result[0].kg).toBeCloseTo(4.2);
  });
});

// ---------------------------------------------------------------------------
// T3 — returns empty array when pet has no weight events
// ---------------------------------------------------------------------------

describe("fetchPetWeightHistory — empty when no weight events", () => {
  const EMAIL = "wgh-t3@dim-test.local";
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL);
    const pet = await createPet(userId, `T3-${userId.slice(0, 4)}`);
    petId = pet.id;
    // No weight events inserted.
  });

  afterAll(() => cleanupUser(userId));

  it("returns an empty array", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T4 — normalises kg from both string and number payload forms
// ---------------------------------------------------------------------------

describe("fetchPetWeightHistory — normalises kg from string and number payloads", () => {
  const EMAIL = "wgh-t4@dim-test.local";
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL);
    const pet = await createPet(userId, `T4-${userId.slice(0, 4)}`);
    petId = pet.id;

    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // String form (old recording path).
    await insertWeightEvent(petId, userId, oneMonthAgo, "12.50");
    // Number form (newer recording paths).
    await insertWeightEvent(petId, userId, now, 13);
  });

  afterAll(() => cleanupUser(userId));

  it("both events are returned as finite numbers", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result).toHaveLength(2);
    for (const s of result) {
      expect(typeof s.kg).toBe("number");
      expect(Number.isFinite(s.kg)).toBe(true);
    }
  });

  it("string form normalises to 12.5", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result[0].kg).toBeCloseTo(12.5);
  });

  it("number form normalises to 13", async () => {
    const result = await fetchPetWeightHistory(petId);
    expect(result[1].kg).toBeCloseTo(13);
  });
});
