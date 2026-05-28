// Cron invariants test — close-rabies-observations handler (P7-1).
//
// Three invariants per the handoff:
//  1. Runtime window — only obs whose period elapsed get closed; future obs stay in_progress.
//  2. Idempotency — second run on closed pets is a no-op (scanned=0).
//  3. Recovery — bad payload (missing observation_until) is recorded as an error but does
//     not abort the batch.
//
// Mirrors the fixture pattern of foster-proposal-expirer.test.ts.

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, notifications, ownerships, petEvents, pets, profiles } from "@/db";
import { generatePublicToken } from "@/lib/publicToken";
import { closeEligibleRabiesObservations } from "@/lib/rabies-observation-closer";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const OWNER_EMAIL = "rabies-cron-owner@dim-test.local";
const PASS = "RabCron_2026!";

let ownerUserId: string;
const createdPetIds: string[] = [];

async function purgeUserByEmail(email: string) {
  const { data } = await supabase.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  if (!found) return;
  await db.delete(notifications).where(eq(notifications.userId, found.id));
  await db.delete(profiles).where(eq(profiles.id, found.id));
  await supabase.auth.admin.deleteUser(found.id);
}

beforeAll(async () => {
  await purgeUserByEmail(OWNER_EMAIL);
  const { data, error } = await supabase.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser owner: ${error?.message}`);
  ownerUserId = data.user.id;
});

afterAll(async () => {
  if (createdPetIds.length > 0) {
    await db
      .delete(notifications)
      .where(and(...createdPetIds.map((id) => eq(notifications.relatedPetId, id))))
      .catch(() => {});
    await withMutationOverride(async (tx) => {
      for (const id of createdPetIds) {
        await tx.delete(petEvents).where(eq(petEvents.petId, id));
        await tx.delete(ownerships).where(eq(ownerships.petId, id));
        await tx.delete(pets).where(eq(pets.id, id));
      }
    });
  }
  await purgeUserByEmail(OWNER_EMAIL);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeRabiesPet(opts: {
  observationUntil: Date | null | "missing";
  status?: "in_progress" | "completed_negative";
}): Promise<{ id: string; publicToken: string }> {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      name: "RabiesTestPet",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      rabiesObservationStatus: opts.status ?? "in_progress",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "Mar del Plata",
    })
    .returning();
  createdPetIds.push(pet.id);

  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId,
    role: "owner",
    startedAt: new Date(),
  });

  // Insert the rabies_observation_started event. authorRole=govt because the
  // event-schema requires that or admin/vet; the closer just reads
  // observation_until from the payload.
  const occurredAt = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000); // 11d ago
  const payload: Record<string, unknown> = {
    payload_version: 1,
    bite_event_id: crypto.randomUUID(),
    incident_severity: "low",
    observation_started_role: "govt",
    closure_target_role: "vet",
  };
  if (opts.observationUntil !== "missing" && opts.observationUntil !== null) {
    payload.observation_until = opts.observationUntil.toISOString();
  }

  await withMutationOverride(async (tx) => {
    await tx.insert(petEvents).values({
      petId: pet.id,
      eventType: "rabies_observation_started",
      occurredAt,
      recordedAt: occurredAt,
      recordedByUserId: ownerUserId,
      authorRole: "govt",
      payload,
    });
  });

  return { id: pet.id, publicToken: pet.publicToken };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("closeEligibleRabiesObservations", () => {
  it("runtime window — pets past observation_until are closed; future pets are skipped", async () => {
    const stale = await makeRabiesPet({
      observationUntil: new Date(Date.now() - 60 * 1000), // expired 1m ago
    });
    const fresh = await makeRabiesPet({
      observationUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    });

    const stats = await closeEligibleRabiesObservations();

    expect(stats.scanned).toBeGreaterThanOrEqual(2);
    expect(stats.closedNegative).toBeGreaterThanOrEqual(1);
    expect(stats.skippedNotYetDue).toBeGreaterThanOrEqual(1);

    const [staleRow] = await db
      .select({ status: pets.rabiesObservationStatus })
      .from(pets)
      .where(eq(pets.id, stale.id));
    expect(staleRow.status).toBe("completed_negative");

    const [freshRow] = await db
      .select({ status: pets.rabiesObservationStatus })
      .from(pets)
      .where(eq(pets.id, fresh.id));
    expect(freshRow.status).toBe("in_progress");
  });

  it("idempotency — second run on the same closed pet is a no-op", async () => {
    const pet = await makeRabiesPet({
      observationUntil: new Date(Date.now() - 5 * 60 * 1000),
    });

    const first = await closeEligibleRabiesObservations();
    expect(first.closedNegative).toBeGreaterThanOrEqual(1);

    const second = await closeEligibleRabiesObservations();
    // The pet is now completed_negative; the scanner only picks in_progress.
    const [row] = await db
      .select({ status: pets.rabiesObservationStatus })
      .from(pets)
      .where(eq(pets.id, pet.id));
    expect(row.status).toBe("completed_negative");
    // Stats from the second run: the closed pet must not appear in scanned.
    // (Other in_progress pets may, so we only assert this pet stayed terminal.)
    expect(second.closedNegative).toBe(0);
  });

  it("recovery — bad payload (missing observation_until) is recorded as an error, batch survives", async () => {
    const bad = await makeRabiesPet({ observationUntil: "missing" });
    const good = await makeRabiesPet({
      observationUntil: new Date(Date.now() - 5 * 60 * 1000),
    });

    const stats = await closeEligibleRabiesObservations();
    expect(stats.errors.some((e) => e.petId === bad.id)).toBe(true);
    // The good pet still got closed despite the bad row in the same batch.
    const [goodRow] = await db
      .select({ status: pets.rabiesObservationStatus })
      .from(pets)
      .where(eq(pets.id, good.id));
    expect(goodRow.status).toBe("completed_negative");
  });
});
