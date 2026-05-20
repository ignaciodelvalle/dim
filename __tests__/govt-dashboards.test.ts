// Integration tests for lib/govt-dashboards. Uses ephemeral fixture rows
// (cleaned up after each test) and runs against the dev DB.

import { createClient } from "@supabase/supabase-js";
import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import {
  fetchDiseaseSummary,
  fetchLostPets,
  fetchSurveillanceSignals,
} from "@/lib/govt-dashboards";
import { generatePublicToken } from "@/lib/publicToken";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const adminSdk = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const OWNER_EMAIL = "govt-dash-owner@dim-test.local";
let ownerUserId: string;

const TEST_PET_TOKEN_PREFIX = "GD-TEST-";

async function ensureOwner(): Promise<string> {
  const { data: list } = await adminSdk.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((u) => u.email === OWNER_EMAIL);
  if (existing) {
    // Verify the matching profile row also exists (handle_new_user trigger
    // populates it on user creation). An orphan auth user with no profile
    // breaks the ownership FK on insertFixturePet — rebuild from scratch.
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, existing.id));
    if (profile) return existing.id;
    await adminSdk.auth.admin.deleteUser(existing.id);
  }
  const r = await adminSdk.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: "GovtDashTest_2026!",
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser: ${r.error?.message}`);
  return r.data.user.id;
}

async function cleanupFixtureRows() {
  const fixturePets = await db
    .select({ id: pets.id })
    .from(pets)
    .where(sql`${pets.publicToken} LIKE ${`${TEST_PET_TOKEN_PREFIX}%`}`);
  const ids = fixturePets.map((p) => p.id);
  if (ids.length === 0) return;
  // pet_events has a BEFORE DELETE trigger blocking mutations; the
  // app.allow_event_mutation GUC is the documented escape hatch.
  await withMutationOverride(async (tx) => {
    await tx.delete(petEvents).where(inArray(petEvents.petId, ids));
  });
  await db.delete(ownerships).where(inArray(ownerships.petId, ids));
  await db.delete(pets).where(inArray(pets.id, ids));
}

async function insertFixturePet(input: {
  name: string;
  species: string;
  province: string;
  locality: string;
  status?: "active" | "lost" | "deceased";
}): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: `${TEST_PET_TOKEN_PREFIX}${generatePublicToken().slice(4)}`,
      name: input.name,
      species: input.species,
      jurisdictionProvince: input.province,
      jurisdictionLocality: input.locality,
      status: input.status ?? "active",
    })
    .returning({ id: pets.id });
  await db.insert(ownerships).values({
    petId: row.id,
    ownerUserId,
    role: "owner",
  });
  return row.id;
}

async function emitOutbreakSignal(input: {
  petId: string;
  diseaseCode: string;
  province: string;
  locality: string;
  hoursAgo: number;
}) {
  await db.insert(petEvents).values({
    petId: input.petId,
    eventType: "outbreak_signal",
    occurredAt: new Date(Date.now() - input.hoursAgo * 60 * 60 * 1000),
    payload: {
      payload_version: 1,
      source_symptom_event_id: "00000000-0000-0000-0000-000000000000",
      disease_code: input.diseaseCode,
      disease_label: input.diseaseCode,
      match_strength: {
        high_count: 1,
        medium_count: 0,
        low_count: 0,
        matched_symptom_codes: ["s_test"],
      },
      pet_jurisdiction_country: "AR",
      pet_jurisdiction_province: input.province,
      pet_jurisdiction_locality: input.locality,
      pet_species: "dog",
    },
    authorRole: "system",
    recordedByUserId: null,
  });
}

beforeAll(async () => {
  ownerUserId = await ensureOwner();
  await cleanupFixtureRows();
});

afterEach(cleanupFixtureRows);

describe("fetchSurveillanceSignals", () => {
  it("returns all signals for admin (universal scope)", async () => {
    const petCABA = await insertFixturePet({
      name: "PetCABA",
      species: "dog",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
    });
    const petBA = await insertFixturePet({
      name: "PetBA",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await emitOutbreakSignal({
      petId: petCABA,
      diseaseCode: "rabies_suspected",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
      hoursAgo: 1,
    });
    await emitOutbreakSignal({
      petId: petBA,
      diseaseCode: "leptospirosis_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 2,
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await fetchSurveillanceSignals({ role: "admin" }, [], { since });
    const tokens = new Set(r.map((s) => s.petPublicToken));
    expect(tokens.size).toBeGreaterThanOrEqual(2);
    const diseases = r.map((s) => s.diseaseCode);
    expect(diseases).toContain("rabies_suspected");
    expect(diseases).toContain("leptospirosis_suspected");
  });

  it("filters by govt scope — only signals in assigned localities", async () => {
    const petCABA = await insertFixturePet({
      name: "PetCABA",
      species: "dog",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
    });
    const petLP = await insertFixturePet({
      name: "PetLP",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await emitOutbreakSignal({
      petId: petCABA,
      diseaseCode: "rabies_suspected",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
      hoursAgo: 1,
    });
    await emitOutbreakSignal({
      petId: petLP,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 2,
    });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await fetchSurveillanceSignals(
      { role: "govt" },
      [
        {
          province: "Ciudad Autónoma de Buenos Aires",
          locality: "Ciudad Autónoma de Buenos Aires",
        },
      ],
      { since },
    );
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const s of r) {
      expect(s.province).toBe("Ciudad Autónoma de Buenos Aires");
    }
  });

  it("returns [] for govt with no assignments", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await fetchSurveillanceSignals({ role: "govt" }, [], { since });
    expect(r).toEqual([]);
  });

  it("respects the diseaseCode filter", async () => {
    const pet = await insertFixturePet({
      name: "PetX",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 1,
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "leptospirosis_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 1,
    });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const r = await fetchSurveillanceSignals({ role: "admin" }, [], {
      since,
      diseaseCode: "rabies_suspected",
    });
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const s of r) expect(s.diseaseCode).toBe("rabies_suspected");
  });
});

describe("fetchDiseaseSummary", () => {
  it("aggregates counts into 30d / 7d / 24h buckets", async () => {
    const pet = await insertFixturePet({
      name: "PetSum",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    // 3 signals in the last 24h, 5 in the last 7 days (incl. the 3), 8 in 30 days.
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 1,
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 3,
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 12,
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 48,
    });
    await emitOutbreakSignal({
      petId: pet,
      diseaseCode: "rabies_suspected",
      province: "Buenos Aires",
      locality: "La Plata",
      hoursAgo: 6 * 24,
    });

    const summary = await fetchDiseaseSummary({ role: "admin" }, []);
    const rabies = summary.find((d) => d.diseaseCode === "rabies_suspected");
    expect(rabies).toBeDefined();
    if (!rabies) return;
    expect(rabies.count24h).toBeGreaterThanOrEqual(3);
    expect(rabies.count7d).toBeGreaterThanOrEqual(5);
    expect(rabies.count30d).toBeGreaterThanOrEqual(5);
    expect(rabies.diseaseName).toMatch(/[Rr]abia/);
  });
});

describe("fetchLostPets", () => {
  async function markLost(petId: string, hoursAgo: number) {
    await db.update(pets).set({ status: "lost" }).where(eq(pets.id, petId));
    await db.insert(petEvents).values({
      petId,
      eventType: "status_changed",
      occurredAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      payload: {
        payload_version: 1,
        from_status: "active",
        to_status: "lost",
        location_description: null,
        reason: null,
      },
      authorRole: "owner",
      recordedByUserId: ownerUserId,
      locationLat: "-34.6033",
      locationLng: "-58.3815",
    });
  }

  it("admin sees all lost pets across provinces", async () => {
    const a = await insertFixturePet({
      name: "Lost-CABA",
      species: "dog",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
    });
    const b = await insertFixturePet({
      name: "Lost-LP",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await markLost(a, 1);
    await markLost(b, 2);

    const r = await fetchLostPets({ role: "admin" }, []);
    const names = new Set(r.map((p) => p.petName));
    expect(names.has("Lost-CABA")).toBe(true);
    expect(names.has("Lost-LP")).toBe(true);
  });

  it("govt only sees lost pets in their assigned localities", async () => {
    const a = await insertFixturePet({
      name: "Lost-CABA",
      species: "dog",
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Ciudad Autónoma de Buenos Aires",
    });
    const b = await insertFixturePet({
      name: "Lost-LP",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await markLost(a, 1);
    await markLost(b, 2);

    const r = await fetchLostPets({ role: "govt" }, [
      { province: "Buenos Aires", locality: "La Plata" },
    ]);
    const names = r.map((p) => p.petName);
    expect(names).toContain("Lost-LP");
    expect(names).not.toContain("Lost-CABA");
  });

  it("returns [] for govt with no assignments", async () => {
    const r = await fetchLostPets({ role: "govt" }, []);
    expect(r).toEqual([]);
  });

  it("filters by species", async () => {
    const dog = await insertFixturePet({
      name: "LostDog",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    const cat = await insertFixturePet({
      name: "LostCat",
      species: "cat",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await markLost(dog, 1);
    await markLost(cat, 1);

    const r = await fetchLostPets({ role: "admin" }, [], { species: "cat" });
    const names = r.map((p) => p.petName);
    expect(names).toContain("LostCat");
    expect(names).not.toContain("LostDog");
  });

  it("populates last-seen coords from the status_changed event", async () => {
    const pet = await insertFixturePet({
      name: "LostWithCoords",
      species: "dog",
      province: "Buenos Aires",
      locality: "La Plata",
    });
    await markLost(pet, 1);
    const r = await fetchLostPets({ role: "admin" }, []);
    const row = r.find((p) => p.petName === "LostWithCoords");
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.lastSeenLat).toBeCloseTo(-34.6033, 3);
    expect(row.lastSeenLng).toBeCloseTo(-58.3815, 3);
  });
});
