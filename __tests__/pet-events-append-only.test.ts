// Integration test for the pet_events append-only trigger.
// Runs against the local Postgres directly via Drizzle (bypassing RLS,
// which is exactly the surface the trigger has to close).

import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets } from "@/db";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const EMAIL = "append-only-trigger-test@dim-test.local";
const PASS = "AppendOnlyTrigger_2026!";

let userId: string;
let petId: string;
let eventId: string;

beforeAll(async () => {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === EMAIL);
  if (found) {
    const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, found.id));
    // Same reason as afterAll: pet cascade hits the append-only trigger.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
      for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
    });
    await admin.auth.admin.deleteUser(found.id);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  userId = data.user.id;

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: `APPEND-ONLY-${userId.slice(0, 6).toUpperCase()}`,
      name: "Trigger",
      species: "dog",
      sex: "unknown",
      status: "active",
    })
    .returning();
  petId = pet.id;
  await db.insert(ownerships).values({ petId, ownerUserId: userId, role: "owner" });

  const now = new Date();
  const [event] = await db
    .insert(petEvents)
    .values({
      petId,
      eventType: "note_added",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: userId,
      authorRole: "owner",
      payload: { body: "smoke probe for the append-only trigger" },
    })
    .returning();
  eventId = event.id;
});

afterAll(async () => {
  // Pet cleanup cascades to pet_events; the append-only trigger blocks that
  // delete unless the escape hatch is set. Wrap in a tx with SET LOCAL so the
  // exception (the test fixture teardown) is explicitly opted in.
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, userId));
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(userId);
});

describe("pet_events append-only trigger", () => {
  it("rejects db.update(petEvents) from a normal Drizzle path", async () => {
    await expect(
      db.update(petEvents).set({ notes: "should not stick" }).where(eq(petEvents.id, eventId)),
    ).rejects.toThrow(/append-only/i);
  });

  it("rejects db.delete(petEvents) from a normal Drizzle path", async () => {
    await expect(db.delete(petEvents).where(eq(petEvents.id, eventId))).rejects.toThrow(
      /append-only/i,
    );
  });

  it("event row is unchanged after the rejected mutations", async () => {
    const [row] = await db.select().from(petEvents).where(eq(petEvents.id, eventId));
    expect(row).toBeDefined();
    expect(row.notes).toBe(null);
  });

  it("allows mutation when the session-local escape hatch is set", async () => {
    // Run the entire update inside one transaction with SET LOCAL so the
    // escape hatch is scoped to this tx only and reverts on commit.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
      await tx
        .update(petEvents)
        .set({ notes: "audited correction via escape hatch" })
        .where(eq(petEvents.id, eventId));
    });
    const [row] = await db.select().from(petEvents).where(eq(petEvents.id, eventId));
    expect(row.notes).toBe("audited correction via escape hatch");
  });

  it("blocks future mutations again once the tx with the escape hatch ends", async () => {
    await expect(
      db
        .update(petEvents)
        .set({ notes: "should not stick either" })
        .where(eq(petEvents.id, eventId)),
    ).rejects.toThrow(/append-only/i);
  });
});
