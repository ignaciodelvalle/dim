// Race condition integration test for bookSlotWriter (Fase 4).
//
// Fires two concurrent bookings against a capacity-1 slot via Promise.all.
// Exactly one should succeed (ok: true) and the other should return the
// "Sin cupo disponible." error. The advisory lock + DB CHECK constraint
// must guarantee this — neither booking can silently overbook.
//
// This test exercises D10 from the spec:
//   Advisory lock → re-read capacity → insert → increment
//   DB CHECK (bookings_count <= capacity) is the final safety net.

import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  appointments,
  db,
  notifications,
  ownerships,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { generateOfferingToken, generatePublicToken } from "@/lib/infra/publicToken";
import { bookSlotWriter } from "@/src/modules/events/application/booking/book-slot";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const OWNER_A_EMAIL = "race-owner-a@dim-test.local";
const OWNER_B_EMAIL = "race-owner-b@dim-test.local";
const PROVIDER_EMAIL = "race-provider@dim-test.local";
const PASS = "RaceTest_2026!";

let ownerAUserId: string;
let ownerBUserId: string;
let providerUserId: string;

let petAId: string;
let petBId: string;
let offeringId: string;
let raceSlotId: string;

const insertedAppointmentTokens: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
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
    await db.delete(notifications).where(eq(notifications.userId, uid));
    await db.delete(profiles).where(eq(profiles.id, uid));
  }
  if (found) await supabase.auth.admin.deleteUser(found.id);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await purgeUserByEmail(OWNER_A_EMAIL);
  await purgeUserByEmail(OWNER_B_EMAIL);
  await purgeUserByEmail(PROVIDER_EMAIL);

  const a = await supabase.auth.admin.createUser({
    email: OWNER_A_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (a.error || !a.data.user) throw new Error(`createUser A: ${a.error?.message}`);
  ownerAUserId = a.data.user.id;

  const b = await supabase.auth.admin.createUser({
    email: OWNER_B_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (b.error || !b.data.user) throw new Error(`createUser B: ${b.error?.message}`);
  ownerBUserId = b.data.user.id;

  const p = await supabase.auth.admin.createUser({
    email: PROVIDER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (p.error || !p.data.user) throw new Error(`createUser provider: ${p.error?.message}`);
  providerUserId = p.data.user.id;

  // Seed two pets, one per owner.
  const [petA] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      species: "dog",
      name: "Race Dog A",
    })
    .returning();
  petAId = petA.id;
  await db.insert(ownerships).values({ petId: petAId, ownerUserId: ownerAUserId, role: "owner" });

  const [petB] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      species: "cat",
      name: "Race Cat B",
    })
    .returning();
  petBId = petB.id;
  await db.insert(ownerships).values({ petId: petBId, ownerUserId: ownerBUserId, role: "owner" });

  // Seed a capacity-1 offering and slot.
  const [offering] = await db
    .insert(serviceOfferings)
    .values({
      publicToken: generateOfferingToken(),
      providerUserId,
      serviceKind: "general_checkup",
      displayName: "Race Test Offering",
      durationMinutes: 15,
      slotCapacity: 1,
      status: "approved",
    })
    .returning();
  offeringId = offering.id;

  const [slot] = await db
    .insert(timeSlots)
    .values({
      serviceOfferingId: offeringId,
      startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // +5 days
      endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      capacity: 1, // CAPACITY 1 — only one booking allowed
      bookingsCount: 0,
      status: "open",
    })
    .returning();
  raceSlotId = slot.id;
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  for (const token of insertedAppointmentTokens) {
    await db.delete(appointments).where(eq(appointments.publicToken, token));
  }

  await db.delete(timeSlots).where(eq(timeSlots.serviceOfferingId, offeringId));
  await db.delete(serviceOfferings).where(eq(serviceOfferings.id, offeringId));
  await db.delete(ownerships).where(eq(ownerships.petId, petAId));
  await db.delete(ownerships).where(eq(ownerships.petId, petBId));
  await db.execute(sql`DELETE FROM pets WHERE id = ${petAId}`);
  await db.execute(sql`DELETE FROM pets WHERE id = ${petBId}`);

  await purgeUserByEmail(OWNER_A_EMAIL);
  await purgeUserByEmail(OWNER_B_EMAIL);
  await purgeUserByEmail(PROVIDER_EMAIL);
});

// ---------------------------------------------------------------------------
// Race condition test
// ---------------------------------------------------------------------------

describe("bookSlotWriter — race condition", () => {
  it("exactly one booking wins when two owners race for a capacity-1 slot", async () => {
    const [resultA, resultB] = await Promise.all([
      bookSlotWriter(raceSlotId, petAId, ownerAUserId),
      bookSlotWriter(raceSlotId, petBId, ownerBUserId),
    ]);

    // Collect successful tokens for cleanup.
    if ("ok" in resultA) insertedAppointmentTokens.push(resultA.appointmentToken);
    if ("ok" in resultB) insertedAppointmentTokens.push(resultB.appointmentToken);

    const successes = [resultA, resultB].filter((r) => "ok" in r);
    const failures = [resultA, resultB].filter((r) => "error" in r);

    // EXACTLY one should win.
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The failure must be a friendly capacity error (not an unhandled exception).
    expect(failures[0]).toEqual({ error: "Sin cupo disponible." });

    // bookings_count must be exactly 1 — never 2.
    const [slot] = await db
      .select({ bookingsCount: timeSlots.bookingsCount })
      .from(timeSlots)
      .where(eq(timeSlots.id, raceSlotId))
      .limit(1);

    expect(slot!.bookingsCount).toBe(1);
  });
});
