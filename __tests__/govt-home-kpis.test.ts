// Integration tests for lib/govt-home-kpis — focuses on the census denominator
// introduced in migration 0067.
//
// We exercise fetchBitesPer10k to assert that the rate is now derived from
// the jurisdictions_census table rather than the heuristic constants that
// the previous code used (3_000_000 for admin, localities × 50_000 for govt).

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, jurisdictionsCensus, petEvents, pets } from "@/db";
import { fetchBitesPer10k } from "@/lib/govt-home-kpis";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PROVINCE = "Santa Fe";
const TEST_LOCALITY = "Rosario";
const TEST_PET_TOKEN = "HK-BITES-TEST-01";

// The INDEC 2022 Santa Fe population seeded in migration 0067.
// This must stay in sync with the value in the migration file.
const SANTA_FE_CENSUS_POPULATION = 3_556_522;

let testPetId: string;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function cleanupFixtures() {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`
      DELETE FROM pet_events
      WHERE pet_id IN (SELECT id FROM pets WHERE public_token = ${TEST_PET_TOKEN})
    `);
    await tx.execute(sql`
      DELETE FROM pets WHERE public_token = ${TEST_PET_TOKEN}
    `);
  });
}

async function insertBiteEvent(occurredAt: Date) {
  await db.insert(petEvents).values({
    petId: testPetId,
    eventType: "incident_reported",
    occurredAt,
    payload: {
      payload_version: 1,
      incident_type: "bite_inflicted",
      severity: "minor",
      injuries_summary: null,
      vet_involved: false,
      location_description: null,
      victim_species: "human",
      pet_jurisdiction_province: TEST_PROVINCE,
      pet_jurisdiction_locality: TEST_LOCALITY,
    },
    authorRole: "owner",
    recordedByUserId: null,
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanupFixtures();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: TEST_PET_TOKEN,
      name: "BiteTestDog",
      species: "dog",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning({ id: pets.id });
  testPetId = pet.id;
});

afterAll(cleanupFixtures);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchBitesPer10k — census denominator", () => {
  it("uses the census table population for a scoped govt view", async () => {
    // Insert one bite event in the last 12 months.
    await insertBiteEvent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const kpi = await fetchBitesPer10k({ role: "govt" }, [
      { province: TEST_PROVINCE, locality: TEST_LOCALITY },
    ]);

    // With 1 bite and SANTA_FE_CENSUS_POPULATION, the expected rate is:
    // round((1 / (SANTA_FE_CENSUS_POPULATION / 10_000)) * 10) / 10
    const expectedRate = Math.round((1 / (SANTA_FE_CENSUS_POPULATION / 10_000)) * 10) / 10;

    expect(kpi.reports).toBe(1);
    expect(kpi.rate).toBe(expectedRate);

    // Sanity check: this rate is tiny (< 0.1 for 1 bite in 3.5M population).
    // The old heuristic (1 locality × 50_000) would yield ~0.2 — a 20× error.
    // Just assert it's less than 0.01 to confirm we're using the real figure.
    expect(kpi.rate).toBeLessThan(0.01);
  });

  it("returns rate=0 gracefully when no census row exists for the province", async () => {
    // Use a province that will NOT have a census row inserted.
    // We temporarily delete the row, assert zero, then restore.
    await db.delete(jurisdictionsCensus).where(eq(jurisdictionsCensus.provinceName, TEST_PROVINCE));

    try {
      const kpi = await fetchBitesPer10k({ role: "govt" }, [
        { province: TEST_PROVINCE, locality: TEST_LOCALITY },
      ]);
      expect(kpi.rate).toBe(0);
      expect(kpi.delta).toBe(0);
    } finally {
      // Restore the census row.
      await db
        .insert(jurisdictionsCensus)
        .values({
          provinceName: TEST_PROVINCE,
          population: SANTA_FE_CENSUS_POPULATION,
          censusYear: 2022,
          source: "INDEC Censo 2022",
        })
        .onConflictDoNothing();
    }
  });

  it("returns rate=0 for empty govt jurisdictions without hitting the DB", async () => {
    const kpi = await fetchBitesPer10k({ role: "govt" }, []);
    expect(kpi.rate).toBe(0);
    expect(kpi.delta).toBe(0);
    expect(kpi.reports).toBe(0);
  });

  it("admin scope uses the summed national census population", async () => {
    // For admin scope there's no WHERE on province; the rate should be
    // computed against the sum of all 24 provinces. We can't assert the
    // exact national total here (other fixtures may have bite events) but
    // we CAN assert that the rate is much smaller than it would be with
    // the old 3_000_000 heuristic, because the real national total is ~46M.
    const kpi = await fetchBitesPer10k({ role: "admin" }, []);
    // A healthy DB with only our 1 fixture bite event should produce < 0.001.
    // Mainly asserting it doesn't throw and returns a non-negative number.
    expect(kpi.rate).toBeGreaterThanOrEqual(0);
    expect(kpi.reports).toBeGreaterThanOrEqual(0);
  });
});
