// lib/metrics/vet-access.test.ts — integration tests for fetchVetAccessByLocality.
//
// Seeds synthetic pets + vet_visit_logged events across three localities with
// different access densities (and one below the k=5 threshold) to assert the
// per-1k computation, ascending "care-desert-first" ordering, and k-anon
// suppression. Plus a DB-free pure-helper test for perThousand.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petEvents, pets } from "@/db";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { withMutationOverride } from "../../__tests__/_helpers/db-overrides";
import { fetchVetAccessByLocality, perThousand } from "./vet-access";

const TEST_PROVINCE = "Córdoba";
const LOC_HIGH = "HighAccessVille";
const LOC_LOW = "LowAccessVille";
const LOC_TINY = "TinyHiddenVille";
const TOKEN_PREFIX = "VET-ACC-TST";

const DAY_MS = 24 * 60 * 60 * 1000;
let seq = 0;

async function cleanup() {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`
      DELETE FROM pet_events
      WHERE pet_id IN (SELECT id FROM pets WHERE public_token LIKE ${`${TOKEN_PREFIX}-%`})
    `);
    await tx.execute(sql`
      DELETE FROM pets WHERE public_token LIKE ${`${TOKEN_PREFIX}-%`}
    `);
  });
}

async function seedPetsIn(locality: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    seq += 1;
    const [pet] = await db
      .insert(pets)
      .values({
        publicToken: `${TOKEN_PREFIX}-${seq}`,
        name: `VetPet-${seq}`,
        species: "dog",
        status: "active",
        jurisdictionProvince: TEST_PROVINCE,
        jurisdictionLocality: locality,
      })
      .returning({ id: pets.id });
    ids.push(pet.id);
  }
  return ids;
}

async function seedVisits(petId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await db.insert(petEvents).values({
      petId,
      eventType: "vet_visit_logged",
      occurredAt: new Date(Date.now() - 10 * DAY_MS),
      payload: { payload_version: 1, reason: "control" },
      authorRole: "owner",
      recordedByUserId: null,
    });
  }
}

beforeAll(async () => {
  await cleanup();
  // High access: 5 active pets, 10 visits → 2000 / 1.000.
  const high = await seedPetsIn(LOC_HIGH, 5);
  await seedVisits(high[0], 10);
  // Low access: 5 active pets, 1 visit → 200 / 1.000 (a care desert).
  const low = await seedPetsIn(LOC_LOW, 5);
  await seedVisits(low[0], 1);
  // Tiny: 3 active pets (below k=5) → suppressed even though it has visits.
  const tiny = await seedPetsIn(LOC_TINY, 3);
  await seedVisits(tiny[0], 2);
});

afterAll(cleanup);

describe("perThousand", () => {
  it("returns 0 when there is no active population", () => {
    expect(perThousand(5, 0)).toBe(0);
  });

  it("computes visits per 1.000 active pets, one decimal", () => {
    expect(perThousand(10, 5)).toBe(2000);
    expect(perThousand(1, 5)).toBe(200);
    expect(perThousand(1, 3)).toBe(333.3);
  });
});

describe("fetchVetAccessByLocality", () => {
  const ctx = buildProjectionContext(
    { role: "govt" },
    [
      { province: TEST_PROVINCE, locality: LOC_HIGH },
      { province: TEST_PROVINCE, locality: LOC_LOW },
      { province: TEST_PROVINCE, locality: LOC_TINY },
    ],
    windows.trailing12m(),
  );

  it("suppresses localities below the k=5 active-pet threshold", async () => {
    const result = await fetchVetAccessByLocality(ctx);
    expect(result.suppressedCount).toBe(1);
    const localities = result.localities.map((r) => r.locality);
    expect(localities).toContain(LOC_HIGH);
    expect(localities).toContain(LOC_LOW);
    expect(localities).not.toContain(LOC_TINY);
  });

  it("orders care deserts (lowest per1k) first and computes the rate", async () => {
    const result = await fetchVetAccessByLocality(ctx);
    expect(result.localities[0].locality).toBe(LOC_LOW);
    expect(result.localities[0].per1k).toBe(200);
    expect(result.localities[0].visits).toBe(1);
    expect(result.localities[0].activePets).toBe(5);

    const high = result.localities.find((r) => r.locality === LOC_HIGH);
    expect(high?.per1k).toBe(2000);
  });
});
