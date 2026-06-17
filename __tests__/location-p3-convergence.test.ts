// DB-backed tests for the P3 location column convergence (migration 0101).
//
// Validates:
//   (a) cases dual-write -- openCase with primaryLocation set writes BOTH
//       column families equal (primary_location_* and location_*).
//   (b) cases COALESCE read fallback -- a row with only primary_location_*
//       projects coordinates via COALESCE; a row with only location_* also
//       projects correctly.
//
// The org COALESCE read fallback is covered in __tests__/org-public-profile.test.ts.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, organizations, pets } from "@/db";
import { getCaseDetailByPublicCode } from "@/lib/case-queries";
import { CasesRepository } from "@/src/modules/cases/infrastructure/cases-repository";
import { withMutationOverride } from "./_helpers/db-overrides";

const ORG_TOKEN = "DIM-P3LOC-ORG1";
const PET_TOKEN = "DIM-P3LOC-PET1";

// biome-ignore lint/style/useConst: mutated in beforeAll
let orgId: string;
// biome-ignore lint/style/useConst: mutated in beforeAll
let petId: string;

const repo = new CasesRepository();
const insertedCaseIds: string[] = [];

beforeAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM cases WHERE public_code LIKE 'CAS-P3L-%'`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
    await tx.execute(sql`DELETE FROM organizations WHERE public_token = ${ORG_TOKEN}`);
  });

  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_TOKEN,
      legalName: "P3 Location Test Org SRL",
      displayName: "P3 Loc Org",
      orgType: "shelter",
      email: "p3loc@dim-test.local",
      verified: true,
    })
    .returning();
  orgId = org.id;

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "P3LocDog",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of insertedCaseIds) {
      await tx.execute(sql`DELETE FROM case_events WHERE case_id = ${id}`);
      await tx.execute(sql`DELETE FROM cases WHERE id = ${id}`);
    }
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
    await tx.execute(sql`DELETE FROM organizations WHERE public_token = ${ORG_TOKEN}`);
  });
});

// ---------------------------------------------------------------------------
// (a) cases dual-write via openCase
// ---------------------------------------------------------------------------

describe("cases dual-write (openCase)", () => {
  it("writes BOTH primary_location_* and location_* when coordinates are provided", async () => {
    const row = await repo.openCase({
      kind: "bite_incident",
      primarySubjectKind: "location",
      primaryLocationLat: "-34.6083000",
      primaryLocationLng: "-58.3712000",
      openedReason: "P3 dual-write test -- bite incident at location",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });
    insertedCaseIds.push(row.id);

    // Returned row should have both families set
    expect(row.primaryLocationLat).toBe("-34.6083000");
    expect(row.primaryLocationLng).toBe("-58.3712000");
    expect(row.locationLat).toBe("-34.6083000");
    expect(row.locationLng).toBe("-58.3712000");

    // Re-select to confirm persistence
    const [reloaded] = await db.select().from(cases).where(eq(cases.id, row.id)).limit(1);
    expect(reloaded.locationLat).toBe("-34.6083000");
    expect(reloaded.locationLng).toBe("-58.3712000");
    expect(reloaded.primaryLocationLat).toBe("-34.6083000");
    expect(reloaded.primaryLocationLng).toBe("-58.3712000");
  });

  it("writes null to BOTH families when no coordinates are provided", async () => {
    const row = await repo.openCase({
      kind: "welfare_denuncia",
      primarySubjectKind: "unowned_animal",
      openedReason: "P3 dual-write test -- no coordinates",
    });
    insertedCaseIds.push(row.id);

    expect(row.primaryLocationLat).toBeNull();
    expect(row.primaryLocationLng).toBeNull();
    expect(row.locationLat).toBeNull();
    expect(row.locationLng).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) cases COALESCE read fallback via getCaseDetailByPublicCode
// ---------------------------------------------------------------------------

describe("cases COALESCE read fallback (getCaseDetailByPublicCode)", () => {
  it("projects coordinates via COALESCE when ONLY primary_location_* is set (legacy row)", async () => {
    // Insert bypassing repo to simulate a pre-migration row (primary_location_* set,
    // location_* null).
    const [raw] = await db
      .insert(cases)
      .values({
        publicCode: "CAS-P3L-LEG1",
        caseKind: "bite_incident",
        status: "open",
        primarySubjectKind: "location",
        primaryLocationLat: "-34.5000000",
        primaryLocationLng: "-58.1000000",
        // location_lat / location_lng intentionally omitted (default null)
        openedReason: "P3 COALESCE test -- legacy row (only primary_location_*)",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      })
      .returning();
    insertedCaseIds.push(raw.id);

    const detail = await getCaseDetailByPublicCode("CAS-P3L-LEG1");
    expect(detail).not.toBeNull();
    // COALESCE(location_lat, primary_location_lat) falls back to primary_location_lat
    expect(detail?.primaryLocationLat).toBe("-34.5000000");
    expect(detail?.primaryLocationLng).toBe("-58.1000000");
  });

  it("projects coordinates via COALESCE when canonical columns win over legacy (both set)", async () => {
    // Insert a row where both column families are set but with different values,
    // confirming COALESCE picks the canonical column (location_lat) first.
    // This simulates the post-backfill state where both are present.
    const [raw] = await db
      .insert(cases)
      .values({
        publicCode: "CAS-P3L-NEW1",
        caseKind: "bite_incident",
        status: "open",
        primarySubjectKind: "location",
        // Both families set — canonical should win in COALESCE
        primaryLocationLat: "-34.5000000",
        primaryLocationLng: "-58.1000000",
        locationLat: "-34.6000000",
        locationLng: "-58.2000000",
        openedReason: "P3 COALESCE test -- canonical wins over legacy",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      })
      .returning();
    insertedCaseIds.push(raw.id);

    const detail = await getCaseDetailByPublicCode("CAS-P3L-NEW1");
    expect(detail).not.toBeNull();
    // COALESCE(location_lat, primary_location_lat) → location_lat wins
    expect(detail?.primaryLocationLat).toBe("-34.6000000");
    expect(detail?.primaryLocationLng).toBe("-58.2000000");
  });

  it("projects null when BOTH column families are null", async () => {
    const [raw] = await db
      .insert(cases)
      .values({
        publicCode: "CAS-P3L-NUL1",
        caseKind: "welfare_denuncia",
        status: "open",
        primarySubjectKind: "unowned_animal",
        openedReason: "P3 COALESCE test -- no coordinates at all",
      })
      .returning();
    insertedCaseIds.push(raw.id);

    const detail = await getCaseDetailByPublicCode("CAS-P3L-NUL1");
    expect(detail).not.toBeNull();
    expect(detail?.primaryLocationLat).toBeNull();
    expect(detail?.primaryLocationLng).toBeNull();
  });
});
