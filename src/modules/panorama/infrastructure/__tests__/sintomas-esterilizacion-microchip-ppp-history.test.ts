// NIGHT-3 item #5 — loadUnitHistory must return real history for the four layers
// that previously fell through its switch to the empty `default` (sintomas +
// the current-state esterilizacion/microchip/ppp choropleths). Before the fix a
// drill on a POPULATED cell of any of these opened a drawer with an empty
// "Historia de la unidad". This inserts one underlying event per layer and
// asserts the events list + trend are populated, at province level (no k-anon
// guard) — the same integration pattern as perdidas-mordeduras-real-events.
//
// Integration test — local Supabase + Postgres. Govt scope to a SYNTHETIC
// locality so only this test's pet is in scope (the national seed fills every
// real province).

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, petEvents, petIdentifications, pets } from "@/db";
import type { EventType } from "@/db/schema";
import type { DashboardActor, DashboardJurisdiction } from "@/lib/metrics";

import { withMutationOverride } from "../../../../../__tests__/_helpers/db-overrides";
import { loadUnitHistory } from "../repository";

const PROVINCE = "Santa Fe";
const LOCALITY = "PANORAMA-SEMP-ISO"; // synthetic — no seed collision
const GOVT: DashboardActor = { role: "govt" };
const JURS: DashboardJurisdiction[] = [{ province: PROVINCE, locality: LOCALITY }];
const SINCE = new Date(Date.now() - 24 * 60 * 60 * 1000);

let petId = "";

async function insertEvent(eventType: EventType): Promise<void> {
  await db.insert(petEvents).values({
    petId,
    eventType,
    occurredAt: new Date(),
    payload: { payload_version: 1 },
    authorRole: "system",
    recordedByUserId: null,
  });
}

async function cleanup(): Promise<void> {
  if (!petId) return;
  await withMutationOverride(async (tx) => {
    await tx.delete(petEvents).where(inArray(petEvents.petId, [petId]));
  });
  await db.delete(petIdentifications).where(inArray(petIdentifications.petId, [petId]));
  await db.delete(pets).where(inArray(pets.id, [petId]));
  petId = "";
}

beforeAll(async () => {
  await cleanup();
  const [row] = await db
    .insert(pets)
    .values({
      publicToken: "DIM-PANO-SEMP-TEST",
      name: "PANO-SEMP-Test",
      species: "dog",
      sex: "male",
      status: "active",
      potentiallyDangerousBreed: true,
      jurisdictionProvince: PROVINCE,
      jurisdictionLocality: LOCALITY,
    })
    .returning({ id: pets.id });
  petId = row.id;

  await insertEvent("symptom_observed");
  await insertEvent("sterilization_performed");
  await insertEvent("dangerous_breed_attested");
  // microchip is backed by pet_identifications, not pet_events.
  await db.insert(petIdentifications).values({
    petId,
    kind: "microchip_iso",
    status: "active",
    recordedAt: new Date().toISOString().slice(0, 10),
    // chip_requires_iso_fields CHECK: a microchip_iso row must carry its ISO parts.
    code: "900123456789012",
    isoCountryCode: "900",
    isoManufacturerCode: "1234",
    isoNationalId: "56789012",
    isoCompliant: true,
  });
});

afterAll(cleanup);

describe("loadUnitHistory — sintomas / esterilizacion / microchip / ppp (item #5)", () => {
  it("sintomas returns the symptom event + a populated trend", async () => {
    const hist = await loadUnitHistory({
      layer: "sintomas",
      province: PROVINCE,
      locality: null,
      since: SINCE,
      until: new Date(),
      actor: GOVT,
      jurisdictions: JURS,
    });
    expect(hist.events.map((e) => e.type)).toContain("symptom_observed");
    expect(hist.trend.reduce((s, b) => s + b.count, 0)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("esterilizacion returns the sterilization event + a populated trend", async () => {
    const hist = await loadUnitHistory({
      layer: "esterilizacion",
      province: PROVINCE,
      locality: null,
      since: SINCE,
      until: new Date(),
      actor: GOVT,
      jurisdictions: JURS,
    });
    expect(hist.events.map((e) => e.type)).toContain("sterilization_performed");
    expect(hist.trend.reduce((s, b) => s + b.count, 0)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("ppp returns the attestation event + a populated trend", async () => {
    const hist = await loadUnitHistory({
      layer: "ppp",
      province: PROVINCE,
      locality: null,
      since: SINCE,
      until: new Date(),
      actor: GOVT,
      jurisdictions: JURS,
    });
    expect(hist.events.map((e) => e.type)).toContain("dangerous_breed_attested");
    expect(hist.trend.reduce((s, b) => s + b.count, 0)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("microchip returns the identification + a populated trend", async () => {
    const hist = await loadUnitHistory({
      layer: "microchip",
      province: PROVINCE,
      locality: null,
      since: SINCE,
      until: new Date(),
      actor: GOVT,
      jurisdictions: JURS,
    });
    expect(hist.events.map((e) => e.type)).toContain("microchip_iso");
    expect(hist.trend.reduce((s, b) => s + b.count, 0)).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
