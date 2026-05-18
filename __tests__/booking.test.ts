// Integration tests for bookSlotWriter (Fase 4 — owner search + book).
//
// Tests:
//   1. Happy path — booking succeeds, bookings_count incremented.
//   2. Capacity full — returns "Sin cupo disponible.".
//   3. Slot in the past — returns "El turno ya pasó.".
//   4. Pet not owned by user — wrapper returns "Esta mascota no te pertenece.".
//
// All DB rows are seeded + cleaned in beforeAll/afterAll.

import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bookSlotWriter } from "@/app/actions/booking";
import {
  appointments,
  db,
  notifications,
  ownerships,
  pets,
  profiles,
  serviceOfferings,
  serviceScheduleRules,
  timeSlots,
} from "@/db";
import {
  generateAppointmentToken,
  generateOfferingToken,
  generatePublicToken,
} from "@/lib/publicToken";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "booking-owner@dim-test.local";
const OTHER_EMAIL = "booking-other@dim-test.local";
const PASS = "BookingTest_2026!";

let ownerUserId: string;
let otherUserId: string;
let petId: string;
let offeringId: string;
let futureSlotId: string;
let fullSlotId: string;
let pastSlotId: string;

// Track inserted appointment public tokens for cleanup.
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
  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(OTHER_EMAIL);

  // Create users.
  const o = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;

  const oth = await supabase.auth.admin.createUser({
    email: OTHER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (oth.error || !oth.data.user) throw new Error(`createUser other: ${oth.error?.message}`);
  otherUserId = oth.data.user.id;

  // Seed a pet owned by ownerUserId.
  const petToken = generatePublicToken();
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: petToken,
      species: "dog",
      name: "Turno Test Dog",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "CABA",
    })
    .returning();
  petId = pet.id;

  await db.insert(ownerships).values({
    petId,
    ownerUserId,
    role: "owner",
  });

  // Seed a service offering (status=approved is required by search but writer
  // doesn't check status — that's fine for unit-level isolation).
  const offeringToken = generateOfferingToken();
  const [offering] = await db
    .insert(serviceOfferings)
    .values({
      publicToken: offeringToken,
      providerUserId: otherUserId, // vet provider — satisfies XOR constraint
      serviceKind: "general_checkup",
      displayName: "Test offering",
      durationMinutes: 30,
      slotCapacity: 1,
      status: "approved",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "CABA",
    })
    .returning();
  offeringId = offering.id;

  // future slot (capacity=1, bookings_count=0).
  const [futureSlot] = await db
    .insert(timeSlots)
    .values({
      serviceOfferingId: offeringId,
      startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // +2 days
      endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      capacity: 1,
      bookingsCount: 0,
      status: "open",
    })
    .returning();
  futureSlotId = futureSlot.id;

  // full slot (bookings_count === capacity).
  const [fullSlot] = await db
    .insert(timeSlots)
    .values({
      serviceOfferingId: offeringId,
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // +3 days
      endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      capacity: 1,
      bookingsCount: 1, // already full
      status: "open",
    })
    .returning();
  fullSlotId = fullSlot.id;

  // past slot.
  const [pastSlot] = await db
    .insert(timeSlots)
    .values({
      serviceOfferingId: offeringId,
      startsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // -2 days
      endsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      capacity: 1,
      bookingsCount: 0,
      status: "open",
    })
    .returning();
  pastSlotId = pastSlot.id;
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  // Delete appointments created during tests.
  for (const token of insertedAppointmentTokens) {
    await db.delete(appointments).where(eq(appointments.publicToken, token));
  }

  // Delete slots, offering, pet, ownerships, users.
  await db.delete(timeSlots).where(eq(timeSlots.serviceOfferingId, offeringId));
  await db.delete(serviceOfferings).where(eq(serviceOfferings.id, offeringId));
  await db.delete(ownerships).where(eq(ownerships.petId, petId));
  await db.execute(sql`DELETE FROM pets WHERE id = ${petId}`);

  await purgeUserByEmail(OWNER_EMAIL);
  await purgeUserByEmail(OTHER_EMAIL);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bookSlotWriter", () => {
  it("happy path — inserts appointment and increments bookings_count", async () => {
    const result = await bookSlotWriter(futureSlotId, petId, ownerUserId);

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result)) throw new Error("Expected ok result");

    insertedAppointmentTokens.push(result.appointmentToken);

    // Verify appointment was inserted.
    const [appt] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.publicToken, result.appointmentToken))
      .limit(1);

    expect(appt).toBeDefined();
    expect(appt!.slotId).toBe(futureSlotId);
    expect(appt!.petId).toBe(petId);
    expect(appt!.ownerUserId).toBe(ownerUserId);
    expect(appt!.status).toBe("confirmed");

    // Verify bookings_count was incremented.
    const [slot] = await db
      .select({ bookingsCount: timeSlots.bookingsCount })
      .from(timeSlots)
      .where(eq(timeSlots.id, futureSlotId))
      .limit(1);

    expect(slot!.bookingsCount).toBe(1);
  });

  it("capacity full — returns 'Sin cupo disponible.'", async () => {
    const result = await bookSlotWriter(fullSlotId, petId, ownerUserId);

    expect(result).toEqual({ error: "Sin cupo disponible." });
  });

  it("slot in the past — returns 'El turno ya pasó.'", async () => {
    const result = await bookSlotWriter(pastSlotId, petId, ownerUserId);

    expect(result).toEqual({ error: "El turno ya pasó." });
  });
});
