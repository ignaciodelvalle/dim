// DB-backed tests for the P3 location column convergence — Phase B (canonical-only).
//
// Validates:
//   (a) cases canonical-only write — openCase with coordinates set writes ONLY
//       location_lat / location_lng (canonical); primary_location_* is NOT written.
//   (b) cases canonical read — getCaseDetailByPublicCode reads location_lat/lng
//       directly; primary_location_* column value is irrelevant (COALESCE removed).

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db } from "@/db";
import { getCaseDetailByPublicCode } from "@/lib/case-queries";
import { CasesRepository } from "@/src/modules/cases/infrastructure/cases-repository";
import { withMutationOverride } from "./_helpers/db-overrides";

const repo = new CasesRepository();
const insertedCaseIds: string[] = [];

beforeAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM cases WHERE public_code LIKE 'CAS-P3L-%'`);
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of insertedCaseIds) {
      await tx.execute(sql`DELETE FROM case_events WHERE case_id = ${id}`);
      await tx.execute(sql`DELETE FROM cases WHERE id = ${id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// (a) cases canonical-only write via openCase
// ---------------------------------------------------------------------------

// NOTE: cases_subject_location_consistency CHECK (added in migration 0033) still
// references primary_location_lat/lng. Until Phase C drops that constraint alongside
// the legacy columns, openCase mirrors canonical → legacy so the constraint is
// satisfied. Callers pass locationLat/Lng; the repository handles the mirror.
describe("cases canonical write (openCase) — Phase B", () => {
  it("writes location_lat/lng from locationLat/locationLng input (canonical-first)", async () => {
    const row = await repo.openCase({
      kind: "bite_incident",
      primarySubjectKind: "location",
      locationLat: "-34.6083000",
      locationLng: "-58.3712000",
      openedReason: "P3 Phase B canonical-write test -- bite incident at location",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    });
    insertedCaseIds.push(row.id);

    // Canonical columns must be set from the input
    expect(row.locationLat).toBe("-34.6083000");
    expect(row.locationLng).toBe("-58.3712000");
    // Legacy columns are mirrored from canonical to satisfy cases_subject_location_consistency
    // CHECK (0033); will be null-allowed again only when Phase C drops the constraint.
    expect(row.primaryLocationLat).toBe("-34.6083000");
    expect(row.primaryLocationLng).toBe("-58.3712000");

    // Re-select to confirm persistence
    const [reloaded] = await db.select().from(cases).where(eq(cases.id, row.id)).limit(1);
    expect(reloaded.locationLat).toBe("-34.6083000");
    expect(reloaded.locationLng).toBe("-58.3712000");
  });

  it("writes null to both column families when no coordinates are provided", async () => {
    const row = await repo.openCase({
      kind: "welfare_denuncia",
      primarySubjectKind: "unowned_animal",
      openedReason: "P3 Phase B canonical-write test -- no coordinates",
    });
    insertedCaseIds.push(row.id);

    expect(row.locationLat).toBeNull();
    expect(row.locationLng).toBeNull();
    expect(row.primaryLocationLat).toBeNull();
    expect(row.primaryLocationLng).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) cases canonical read via getCaseDetailByPublicCode
// ---------------------------------------------------------------------------

describe("cases canonical read (getCaseDetailByPublicCode)", () => {
  it("projects coordinates from canonical location_lat/lng columns (Phase B — direct canonical read)", async () => {
    // primary_location_* must also be set to satisfy cases_subject_location_consistency CHECK.
    // The read side sources from location_lat/lng directly (no COALESCE since Phase B).
    const [raw] = await db
      .insert(cases)
      .values({
        publicCode: "CAS-P3L-NEW1",
        caseKind: "bite_incident",
        status: "open",
        primarySubjectKind: "location",
        locationLat: "-34.6000000",
        locationLng: "-58.2000000",
        primaryLocationLat: "-34.6000000",
        primaryLocationLng: "-58.2000000",
        openedReason: "P3 Phase B canonical-read test -- canonical columns sourced directly",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      })
      .returning();
    insertedCaseIds.push(raw.id);

    const detail = await getCaseDetailByPublicCode("CAS-P3L-NEW1");
    expect(detail).not.toBeNull();
    expect(detail?.primaryLocationLat).toBe("-34.6000000");
    expect(detail?.primaryLocationLng).toBe("-58.2000000");
  });

  it("projects null when canonical columns are null", async () => {
    const [raw] = await db
      .insert(cases)
      .values({
        publicCode: "CAS-P3L-NUL1",
        caseKind: "welfare_denuncia",
        status: "open",
        primarySubjectKind: "unowned_animal",
        openedReason: "P3 Phase B canonical-read test -- no coordinates",
      })
      .returning();
    insertedCaseIds.push(raw.id);

    const detail = await getCaseDetailByPublicCode("CAS-P3L-NUL1");
    expect(detail).not.toBeNull();
    expect(detail?.primaryLocationLat).toBeNull();
    expect(detail?.primaryLocationLng).toBeNull();
  });
});
