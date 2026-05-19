// Integration tests for performed_by autocomplete search
// (spec 2026-05-19-performed-by-autocomplete-design §4.2).

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, organizations, profiles } from "@/db";
import { searchVetsAndClinics } from "@/lib/performed-by-search";

const SUFFIX = "PB-TEST";

let orgClinicCabaId: string;
let orgClinicBaId: string;
let orgUnverifiedId: string;
let vetVerifiedId: string;
let vetUnverifiedId: string;

beforeAll(async () => {
  // Cleanup any leftover fixtures from prior runs.
  await db.execute(sql`DELETE FROM organizations WHERE display_name LIKE ${`%${SUFFIX}%`}`);
  await db.execute(sql`DELETE FROM profiles WHERE display_name LIKE ${`%${SUFFIX}%`}`);

  const [orgCaba] = await db
    .insert(organizations)
    .values({
      publicToken: "DIM-PB-CABA",
      legalName: `Clínica San Pablo ${SUFFIX} SRL`,
      displayName: `San Pablo ${SUFFIX}`,
      orgType: "clinic",
      email: "san-pablo-pb@dim-test.local",
      verified: true,
      jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  orgClinicCabaId = orgCaba.id;

  const [orgBa] = await db
    .insert(organizations)
    .values({
      publicToken: "DIM-PB-BA",
      legalName: `Clínica San Pedro ${SUFFIX} SRL`,
      displayName: `San Pedro ${SUFFIX}`,
      orgType: "clinic",
      email: "san-pedro-pb@dim-test.local",
      verified: true,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    })
    .returning();
  orgClinicBaId = orgBa.id;

  const [orgUnverified] = await db
    .insert(organizations)
    .values({
      publicToken: "DIM-PB-UNV",
      legalName: `Clínica San Lucas ${SUFFIX} SRL`,
      displayName: `San Lucas ${SUFFIX}`,
      orgType: "clinic",
      email: "san-lucas-pb@dim-test.local",
      verified: false,
      jurisdictionProvince: "Ciudad Autónoma de Buenos Aires",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  orgUnverifiedId = orgUnverified.id;

  vetVerifiedId = "00000000-0000-0000-0000-00000000ab01";
  await db
    .insert(profiles)
    .values({
      id: vetVerifiedId,
      displayName: `Dr. Juan Perez ${SUFFIX}`,
      role: "vet",
      matriculaVerified: true,
      matriculaJurisdiccion: "M.N. 12345",
    })
    .onConflictDoNothing({ target: profiles.id });

  vetUnverifiedId = "00000000-0000-0000-0000-00000000ab02";
  await db
    .insert(profiles)
    .values({
      id: vetUnverifiedId,
      displayName: `Dra. Sofia Perez ${SUFFIX}`,
      role: "vet",
      matriculaVerified: false,
    })
    .onConflictDoNothing({ target: profiles.id });
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM organizations WHERE id IN (
    ${orgClinicCabaId}::uuid, ${orgClinicBaId}::uuid, ${orgUnverifiedId}::uuid
  )`);
  await db.execute(sql`DELETE FROM profiles WHERE id IN (
    ${vetVerifiedId}::uuid, ${vetUnverifiedId}::uuid
  )`);
});

describe("searchVetsAndClinics", () => {
  it("returns [] for queries shorter than 2 chars", async () => {
    expect(await searchVetsAndClinics("")).toEqual([]);
    expect(await searchVetsAndClinics("a")).toEqual([]);
  });

  it("finds the verified CABA + BA clinics by substring match", async () => {
    const results = await searchVetsAndClinics(SUFFIX);
    const orgIds = results.filter((r) => r.kind === "organization").map((r) => r.id);
    expect(orgIds).toContain(orgClinicCabaId);
    expect(orgIds).toContain(orgClinicBaId);
  });

  it("excludes unverified organizations", async () => {
    const results = await searchVetsAndClinics(`San Lucas ${SUFFIX}`);
    const orgIds = results.filter((r) => r.kind === "organization").map((r) => r.id);
    expect(orgIds).not.toContain(orgUnverifiedId);
  });

  it("excludes unverified vet profiles", async () => {
    const results = await searchVetsAndClinics(`Perez ${SUFFIX}`);
    const profIds = results.filter((r) => r.kind === "profile").map((r) => r.id);
    expect(profIds).toContain(vetVerifiedId);
    expect(profIds).not.toContain(vetUnverifiedId);
  });

  it("boosts jurisdiction-matching organizations to the top", async () => {
    const cabaFirst = await searchVetsAndClinics(SUFFIX, {
      province: "Ciudad Autónoma de Buenos Aires",
      locality: "Palermo",
    });
    const firstOrg = cabaFirst.find((r) => r.kind === "organization");
    expect(firstOrg?.id).toBe(orgClinicCabaId);

    const baFirst = await searchVetsAndClinics(SUFFIX, {
      province: "Buenos Aires",
      locality: "La Plata",
    });
    const firstOrgBa = baFirst.find((r) => r.kind === "organization");
    expect(firstOrgBa?.id).toBe(orgClinicBaId);
  });

  it("returns organizations + profiles mixed (verified vets included)", async () => {
    const results = await searchVetsAndClinics(SUFFIX);
    const kinds = new Set(results.map((r) => r.kind));
    expect(kinds.has("organization")).toBe(true);
    expect(kinds.has("profile")).toBe(true);
  });
});
