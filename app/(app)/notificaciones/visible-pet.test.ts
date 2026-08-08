// The "Ver {nombre}" button on a notification must not outlive the ownership.
//
// S6-F02 (2026-08-08): after a transfer, the notification telling the SENDER
// "la mascota ya no figura a tu nombre" still rendered a button to
// /mis-mascotas/{token} — a page that correctly answered "No encontramos esta
// página". The 404 was the access check working; the button was a second query
// that never asked.
//
// This exercises the REAL predicate the page joins on (petVisibleToReader),
// not a re-declared copy. The sibling bug in this same batch (S3-F02) survived
// its own suite precisely because every test checked the database directly
// instead of the thing the code actually produced.

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, notifications, ownerships, pets } from "@/db";
import { generatePublicToken } from "@/lib/infra/publicToken";

import { petVisibleToReader } from "./visible-pet";

const admin = createClient("http://127.0.0.1:54321", "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz", {
  auth: { persistSession: false },
});

let senderId: string;
let receiverId: string;
let petId: string;
let notificationId: string;

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

/** Runs the page's join for one reader and reports whether the pet came back. */
async function petIsLinkedFor(readerUserId: string): Promise<boolean> {
  const rows = await db
    .select({ pet: pets })
    .from(notifications)
    .leftJoin(pets, petVisibleToReader(notifications.relatedPetId, readerUserId))
    .where(eq(notifications.id, notificationId));
  return rows[0]?.pet !== null && rows[0]?.pet !== undefined;
}

beforeAll(async () => {
  const stamp = Date.now();
  senderId = await createUser(`visible-pet-sender-${stamp}@example.test`);
  receiverId = await createUser(`visible-pet-receiver-${stamp}@example.test`);

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      name: "Transferida",
      species: "dog",
      sex: "female",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;

  // The transfer already happened: the sender's ownership is closed, the
  // receiver's is live. This is the exact state Cowork was in at 12:07.
  await db.insert(ownerships).values({
    petId,
    ownerUserId: senderId,
    role: "owner",
    startedAt: new Date(Date.now() - 86_400_000),
    endedAt: new Date(),
  });
  await db.insert(ownerships).values({
    petId,
    ownerUserId: receiverId,
    role: "owner",
    startedAt: new Date(),
  });

  // The notification the sender receives, pointing at the pet they handed over.
  const [n] = await db
    .insert(notifications)
    .values({
      userId: senderId,
      notificationType: "pet_transfer_accepted",
      title: "Transferencia aceptada",
      body: "El receptor aceptó la propuesta. La mascota ya no figura a tu nombre.",
      relatedPetId: petId,
      category: "custody",
    })
    .returning();
  notificationId = n.id;
});

afterAll(async () => {
  await db.delete(notifications).where(eq(notifications.relatedPetId, petId));
  await db.delete(ownerships).where(eq(ownerships.petId, petId));
  await db.delete(pets).where(eq(pets.id, petId));
  await admin.auth.admin.deleteUser(senderId);
  await admin.auth.admin.deleteUser(receiverId);
});

describe("petVisibleToReader", () => {
  it("does not link the pet for a former owner", async () => {
    expect(
      await petIsLinkedFor(senderId),
      "the sender still gets a 'Ver …' button to a page they can no longer open",
    ).toBe(false);
  });

  it("still links the pet for the current owner", async () => {
    // Non-vacuity: a predicate that returned nothing for everyone would pass
    // the case above and silently strip every pet link in the product.
    expect(await petIsLinkedFor(receiverId)).toBe(true);
  });

  it("does not link the pet for an unrelated user", async () => {
    const strangerId = await createUser(`visible-pet-stranger-${Date.now()}@example.test`);
    try {
      expect(await petIsLinkedFor(strangerId)).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(strangerId);
    }
  });

  it("ignores an ownership that has ended even when no newer one exists", async () => {
    // The transfer case always leaves a live successor row. A pet whose only
    // ownership is closed (a returned foster, a reversed adoption mid-flight)
    // must not fall back to "nobody owns it, so show it to the last holder".
    await db
      .delete(ownerships)
      .where(and(eq(ownerships.petId, petId), eq(ownerships.ownerUserId, receiverId)));
    expect(await petIsLinkedFor(senderId)).toBe(false);
  });
});
