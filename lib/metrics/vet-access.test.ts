// lib/metrics/vet-access.test.ts — integration tests for fetchVetAccessByLocality.
//
// Seeds synthetic pets + veterinary-act events across localities with different
// access densities (and one below the k=5 threshold) to assert the per-1k
// computation, ascending "care-desert-first" ordering, and k-anon suppression.
// Plus one locality PER MEMBER of VET_ACTIVITY_EVENT_TYPES, each a copy of
// LOC_LOW with only the event type changed, so the numerator's width is pinned
// act by act. Plus a DB-free pure-helper test for perThousand.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petEvents, pets } from "@/db";
import { buildProjectionContext } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { withMutationOverride } from "../../__tests__/_helpers/db-overrides";
import { VET_ACTIVITY_EVENT_TYPES, fetchVetAccessByLocality, perThousand } from "./vet-access";

const TEST_PROVINCE = "Córdoba";
const LOC_HIGH = "HighAccessVille";
const LOC_LOW = "LowAccessVille";
const LOC_TINY = "TinyHiddenVille";
// Predicate-width fixtures. Each is LOC_LOW with EXACTLY ONE axis changed —
// the event type — so a passing assertion can only be explained by that axis:
// same 5 active pets, same single event, same date, same author role.
const LOC_VAX = "VaxOnlyVille"; // vaccination_administered instead of a visit
const LOC_STERIL = "SterilOnlyVille"; // sterilization_performed
const LOC_CHIP = "ChipOnlyVille"; // microchip_implanted
const LOC_CLINICAL = "ClinicalOnlyVille"; // clinical_info_logged
const LOC_DEWORM = "DewormOnlyVille"; // deworming_administered — must NOT count
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

/** Minimal valid payloads per veterinary event type (schema-checked writers). */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  vet_visit_logged: { payload_version: 1, reason: "control" },
  vaccination_administered: {
    payload_version: 1,
    vaccine_name: "Antirrábica",
    brand: null,
    batch: null,
    next_due_at: null,
  },
  sterilization_performed: { payload_version: 1, method: "surgical", performed_by: null },
  microchip_implanted: { payload_version: 1, code: "900000000000001", implanted_by: null },
  clinical_info_logged: { payload_version: 1, kind: "lab", summary: "hemograma" },
  deworming_administered: {
    payload_version: 1,
    product: "Antiparasitario",
    type: "internal",
    next_due_at: null,
  },
};

async function seedActs(petId: string, n: number, eventType = "vet_visit_logged") {
  for (let i = 0; i < n; i++) {
    await db.insert(petEvents).values({
      petId,
      eventType: eventType as never,
      occurredAt: new Date(Date.now() - 10 * DAY_MS),
      payload: PAYLOADS[eventType],
      authorRole: "owner",
      recordedByUserId: null,
    });
  }
}

const seedVisits = seedActs;

/** LOC_LOW's exact shape (5 active pets, ONE event) with a different act type. */
async function seedOneActVille(locality: string, eventType: string) {
  const ids = await seedPetsIn(locality, 5);
  await seedActs(ids[0], 1, eventType);
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
  // One-axis variants of LOC_LOW — only the event type differs.
  await seedOneActVille(LOC_VAX, "vaccination_administered");
  await seedOneActVille(LOC_STERIL, "sterilization_performed");
  await seedOneActVille(LOC_CHIP, "microchip_implanted");
  await seedOneActVille(LOC_CLINICAL, "clinical_info_logged");
  await seedOneActVille(LOC_DEWORM, "deworming_administered");
}, 60_000);

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

// ---------------------------------------------------------------------------
// Numerator width (2026-07-26). The numerator was `vet_visit_logged` ALONE,
// which is 85 rows in the whole database against 29.123 vaccinations, 19.742
// microchip implants and 17.817 sterilizations — so the layer read 0,0 in 23 of
// 24 provinces and only CABA had a value. A vaccination IS veterinary access.
// ---------------------------------------------------------------------------

describe("fetchVetAccessByLocality — the numerator counts every veterinary act", () => {
  const ctxFor = (locality: string) =>
    buildProjectionContext(
      { role: "govt" },
      [{ province: TEST_PROVINCE, locality }],
      windows.trailing12m(),
    );

  const rateIn = async (locality: string): Promise<number> => {
    const result = await fetchVetAccessByLocality(ctxFor(locality));
    const row = result.localities.find((r) => r.locality === locality);
    expect(row, `${locality} must survive k-anon (5 active pets)`).toBeDefined();
    return (row as { per1k: number }).per1k;
  };

  it.each([
    ["a vaccination", LOC_VAX],
    ["a sterilization", LOC_STERIL],
    ["a microchip implant", LOC_CHIP],
    ["a clinical record", LOC_CLINICAL],
  ])(
    "counts %s exactly like a logged visit (only the event type differs)",
    async (_label, loc) => {
      // Same 5 active pets, same single event, same date, same author role as
      // LOC_LOW — so an equal rate can only be explained by the event type.
      expect(await rateIn(loc)).toBe(200);
    },
    30_000,
  );

  it("does NOT count a deworming — antiparasitics are over-the-counter", async () => {
    // Including them would measure owner diligence, not access to a service.
    expect(await rateIn(LOC_DEWORM)).toBe(0);
  }, 30_000);

  it("declares the veterinary-act event set explicitly (shared with the desert layer)", () => {
    expect([...VET_ACTIVITY_EVENT_TYPES].sort()).toEqual(
      [
        "clinical_info_logged",
        "microchip_implanted",
        "sterilization_performed",
        "vaccination_administered",
        "vet_visit_logged",
      ].sort(),
    );
    // author_role names the REPORTER, not the performer (28.979 of 29.123
    // seeded vaccinations are owner-logged), so it is deliberately NOT a filter.
    expect(VET_ACTIVITY_EVENT_TYPES).not.toContain("deworming_administered");
  });
});
