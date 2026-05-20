// Integration tests for Fase D4 of the cases system — wiring the
// custody-dispute flow to the cases layer.
//
// The dispute-raising server action isn't wired to a UI yet, so we
// don't drive openDisputeFromEvent end-to-end (it requires a real
// profile FK + raising pet_events row). Instead, we exercise the case
// helpers directly with the same shape openDisputeFromEvent uses.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cases, db, pets } from "@/db";
import { closeCase, openCase } from "@/lib/case-helpers";
import { withMutationOverride } from "./_helpers/db-overrides";

const PET_TOKEN = "DIM-D4-PA1";

let petId: string;
let caseId: string;

beforeAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  });

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "DisputeCaseTest",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`DELETE FROM cases WHERE id = ${caseId}`);
    await tx.execute(sql`DELETE FROM pets WHERE id = ${petId}`);
  });
});

describe("D4: custody_dispute case opens with the dispute flow", () => {
  it("openCase creates a custody_dispute row for the pet", async () => {
    const caseRow = await openCase({
      kind: "custody_dispute",
      primarySubjectKind: "registered_pet",
      primaryPetId: petId,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      openedReason: "Custody dispute raised on pet — fixture",
    });
    caseId = caseRow.id;
    expect(caseRow.status).toBe("open");
    expect(caseRow.caseKind).toBe("custody_dispute");
  });

  it("resolveDisputeAction parity — closeCase('resolved')", async () => {
    const result = await closeCase({ caseId, reason: "resolved" });
    expect(result?.status).toBe("closed");
    expect(result?.closedReason).toBe("resolved");
  });

  it("withdrawDisputeAction parity — opening a 2nd case then closing as cancelled", async () => {
    // The partial unique index on (primary_pet_id, case_kind) only restricts
    // OPEN cases, so we can open a second once the first is closed.
    const second = await openCase({
      kind: "custody_dispute",
      primarySubjectKind: "registered_pet",
      primaryPetId: petId,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      openedReason: "Second custody dispute fixture for withdraw test",
    });
    const closed = await closeCase({ caseId: second.id, reason: "cancelled" });
    expect(closed?.status).toBe("closed");
    expect(closed?.closedReason).toBe("cancelled");
    await db.execute(sql`DELETE FROM cases WHERE id = ${second.id}`);
  });
});
