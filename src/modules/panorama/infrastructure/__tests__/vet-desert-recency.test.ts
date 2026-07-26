// desierto-veterinario loader — vet-activity RECENCY per province.
//
// Contract (see loadVetDesertByProvince):
//   value = min(windowDays, days since the last vet_visit_logged in scope)
//         = windowDays when NO vet visit is registered (the desert cap).
//   k-anon: the ACTIVE-PET UNIVERSE is the protected dimension — a scoped
//   province universe with < 5 pets gets NO cell and is counted in
//   suppressedCount (suppressSmallCells; never a value that could
//   characterize a handful of identifiable pets).
//
// Deterministic against the national seed: govt actors scoped to SYNTHETIC
// localities (no seed collision), so the pets universe within scope is exactly
// the fixture — the assertions pin the loader's contract, not seed volume.
//
// Integration test — local Supabase + Postgres.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petEvents, pets } from "@/db";
import type { EventType } from "@/db/schema";
import { validateEventPayload } from "@/lib/events/event-schemas";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import { withMutationOverride } from "../../../../../__tests__/_helpers/db-overrides";
import { loadVetDesertByProvince } from "../repository";

const PROVINCE = "Santa Fe";
const PROVINCE_CODE = "AR-S";
// Three disjoint synthetic localities → three disjoint scoped universes.
const LOC_VISIBLE = "PANORAMA-VD-VISIBLE"; // 6 pets, one visit 10 days ago
const LOC_DESERT = "PANORAMA-VD-DESERT"; // 5 pets, no vet activity at all
const LOC_SUBK = "PANORAMA-VD-SUBK"; // 2 pets (< k=5) → suppressed
// 6 pets whose ONLY veterinary contact is a vaccination 10 days ago. A layer
// that counts only `vet_visit_logged` reads this as a desert (the cap) even
// though a professional attended every one of them.
const LOC_VAX = "PANORAMA-VD-VAX";

const GOVT: DashboardActor = { role: "govt" };
const jurs = (locality: string): DashboardJurisdiction[] => [{ province: PROVINCE, locality }];

const DAY_MS = 86_400_000;
const SINCE = new Date(Date.now() - 30 * DAY_MS); // 30-day window → windowDays = 30
const VISIT_AT = new Date(Date.now() - 10 * DAY_MS);

const petIds: string[] = [];

async function makePet(token: string, locality: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: token,
      species: "dog",
      sex: "male",
      status: "active",
      jurisdictionProvince: PROVINCE,
      jurisdictionLocality: locality,
    })
    .returning({ id: pets.id });
  petIds.push(row.id);
  return row.id;
}

async function cleanup(): Promise<void> {
  if (petIds.length === 0) return;
  await withMutationOverride(async (tx) => {
    await tx.delete(petEvents).where(inArray(petEvents.petId, petIds));
  });
  await db.delete(pets).where(inArray(pets.id, petIds));
  petIds.length = 0;
}

beforeAll(async () => {
  // Visible universe: 6 pets (≥ k), last vet visit 10 days ago.
  let visitPetId = "";
  for (let i = 0; i < 6; i++) {
    const id = await makePet(`DIM-VDV-000${i}`, LOC_VISIBLE);
    if (i === 0) visitPetId = id;
  }
  await db.insert(petEvents).values({
    petId: visitPetId,
    eventType: "vet_visit_logged" as EventType,
    occurredAt: VISIT_AT,
    payload: validateEventPayload("vet_visit_logged", {
      reason: "control",
      diagnosis: null,
      vet_name: null,
      clinic: null,
    }) as Record<string, unknown>,
    authorRole: "vet",
    recordedByUserId: null,
  });

  // Desert universe: 5 pets (≥ k), NO vet activity → value = windowDays cap.
  for (let i = 0; i < 5; i++) {
    await makePet(`DIM-VDD-000${i}`, LOC_DESERT);
  }

  // Sub-k universe: 2 pets (< k) → suppressed, no cell.
  for (let i = 0; i < 2; i++) {
    await makePet(`DIM-VDS-000${i}`, LOC_SUBK);
  }

  // Vaccination-only universe: 6 pets (≥ k), one vaccination 10 days ago and
  // NO vet_visit_logged. Vaccinating is a veterinary act, so this is not a
  // desert — the recency must read 10, not the cap.
  let vaxPetId = "";
  for (let i = 0; i < 6; i++) {
    const id = await makePet(`DIM-VDX-000${i}`, LOC_VAX);
    if (i === 0) vaxPetId = id;
  }
  await db.insert(petEvents).values({
    petId: vaxPetId,
    eventType: "vaccination_administered" as EventType,
    occurredAt: VISIT_AT,
    payload: validateEventPayload("vaccination_administered", {
      vaccine_name: "Antirrábica",
      brand: null,
      batch: null,
      administered_by: null,
      next_due_at: null,
    }) as Record<string, unknown>,
    authorRole: "vet",
    recordedByUserId: null,
  });
});

afterAll(cleanup);

describe("loadVetDesertByProvince — recency value", () => {
  it("reports days since the last vet visit (10) for a ≥k universe with activity", async () => {
    const res = await loadVetDesertByProvince(GOVT, jurs(LOC_VISIBLE), SINCE);
    expect(res.cells).toHaveLength(1);
    expect(res.cells[0].provinceCode).toBe(PROVINCE_CODE);
    expect(res.cells[0].value).toBe(10);
    expect(res.suppressedCount).toBe(0);
  }, 30_000);

  it("caps a no-activity universe at the window length (the desert reading)", async () => {
    const res = await loadVetDesertByProvince(GOVT, jurs(LOC_DESERT), SINCE);
    expect(res.cells).toHaveLength(1);
    // windowDays = ceil(30d / 1d) = 30 — "sin actividad en todo el período".
    expect(res.cells[0].value).toBe(30);
  }, 30_000);

  it("counts a vaccination as veterinary activity (not a desert at the cap)", async () => {
    const res = await loadVetDesertByProvince(GOVT, jurs(LOC_VAX), SINCE);
    expect(res.cells).toHaveLength(1);
    // A professional vaccinated these pets 10 days ago. Reading the 30-day cap
    // here would claim "sin actividad veterinaria en todo el período" about a
    // province that was actively attended.
    expect(res.cells[0].value).toBe(10);
  }, 30_000);

  it("replays the recency as of t (asOf 5 days ago → the visit was 5 days back)", async () => {
    const asOf = new Date(Date.now() - 5 * DAY_MS);
    const res = await loadVetDesertByProvince(GOVT, jurs(LOC_VISIBLE), SINCE, asOf);
    expect(res.cells).toHaveLength(1);
    // until = asOf: the 10-days-ago visit sits 5 days before it.
    expect(res.cells[0].value).toBe(5);
  }, 30_000);
});

describe("loadVetDesertByProvince — k-anon on the pet universe", () => {
  it("suppresses a sub-k universe entirely (no cell, disclosed via suppressedCount)", async () => {
    const res = await loadVetDesertByProvince(GOVT, jurs(LOC_SUBK), SINCE);
    expect(res.cells).toHaveLength(0);
    expect(res.suppressedCount).toBe(1);
  }, 30_000);
});
