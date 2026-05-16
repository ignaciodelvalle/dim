// Integration test for lib/notifications.ts → runVaccineDueScan.
//
// Runs against the local Postgres directly. Each test provisions its own
// fixture (user via Supabase admin, pet, vaccination event, reminder) and
// tears it down at the end so the file is safe to re-run.

import { createClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, notifications, ownerships, petEvents, pets, reminders } from "@/db";
import { runVaccineDueScan } from "@/lib/notifications";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const EMAIL = "vaccine-cron-test@dim-test.local";
const PASS = "VaccineCronTest_2026!";

let userId: string;
let petId: string;
let eventId: string;
let reminderId: string;

async function provisionFixture() {
  // Make sure no prior leftover exists.
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === EMAIL);
  if (found) {
    const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, found.id));
    // Pet cascade hits the append-only trigger on pet_events; wrap the
    // teardown delete in a tx with the session-local escape hatch set.
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
      publicToken: `VACCRON-${userId.slice(0, 6).toUpperCase()}`,
      name: "Lila",
      species: "dog",
      sex: "female",
      status: "active",
    })
    .returning();
  petId = pet.id;
  await db.insert(ownerships).values({ petId: pet.id, ownerUserId: userId, role: "owner" });

  // Originating vaccination event (matches the shape createVaccinationAction
  // would write).
  const now = new Date();
  const [event] = await db
    .insert(petEvents)
    .values({
      petId: pet.id,
      eventType: "vaccination_administered",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: userId,
      authorRole: "owner",
      payload: { vaccine_name: "Antirrábica", administered_by: null, brand: null },
    })
    .returning();
  eventId = event.id;

  // Reminder due in 3 days, linked to the originating event.
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const [reminder] = await db
    .insert(reminders)
    .values({
      petId: pet.id,
      userId,
      reminderType: "vaccine",
      dueAt: threeDays,
      title: "Refuerzo: Antirrábica",
      description: `Próxima dosis programada para ${pet.name}.`,
      sourceEventId: event.id,
    })
    .returning();
  reminderId = reminder.id;
}

async function teardownFixture() {
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, userId));
  // See provisionFixture cleanup note: cascade hits the append-only trigger.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(userId);
}

beforeAll(async () => {
  await provisionFixture();
});

afterAll(async () => {
  await teardownFixture();
});

describe("runVaccineDueScan", () => {
  it("inserts exactly one notification on the first tick for a reminder due in 3 days", async () => {
    const first = await runVaccineDueScan();
    expect(first.insertedCount).toBe(1);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.notificationType, "vaccine_due")),
      );
    expect(rows.length).toBe(1);
    const n = rows[0];
    expect(n.notificationType).toBe("vaccine_due");
    expect(n.severity).toBe("warning");
    expect(n.relatedEventId).toBe(eventId);
    expect(n.relatedPetId).toBe(petId);
    expect(n.ctaLabel).toBe("Ver mascota");
    expect(n.ctaUrl).toContain("/mis-mascotas/");
    // Body should be the time-aware computed message ("Lila tiene una vacuna
    // programada en 3 días."), NOT the generic reminder description. The
    // computed message reflects the scan moment; the description is
    // creation-time and would be stale.
    expect(n.body).toContain("Lila");
    expect(n.body).toMatch(/3 días|mañana|hoy/);
  });

  it("does NOT duplicate when the cron runs again", async () => {
    const second = await runVaccineDueScan();
    expect(second.insertedCount).toBe(0);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.notificationType, "vaccine_due")),
      );
    expect(rows.length).toBe(1);
  });

  it("stops emitting once the reminder is marked completed_at", async () => {
    await db.update(reminders).set({ completedAt: new Date() }).where(eq(reminders.id, reminderId));

    const third = await runVaccineDueScan();
    expect(third.insertedCount).toBe(0);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.notificationType, "vaccine_due")),
      );
    expect(rows.length).toBe(1);
  });
});
