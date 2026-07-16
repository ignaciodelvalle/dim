// findOpenCasesForPetWithCodes — kind-exclusion regression (pet-document-
// redesign privacy fix, REQ-1.1/1.3/1.4).
//
// Positive case: an open bite_incident (and other non-excluded kinds) for
// the fixture pet MUST appear in the result.
// Negative case (the explicitly required pair): an open welfare_denuncia
// case AND an open lost_pet_episode case for the SAME pet MUST both return
// zero matching rows — the generic badge/list query owns neither kind.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pets } from "@/db";
import { openCase } from "@/lib/infra/case-helpers";
import { findOpenCasesForPetWithCodes } from "@/lib/infra/case-queries";
import { withMutationOverride } from "./_helpers/db-overrides";

const PET_TOKEN = "DIM-PDR-S1-PET1";

let petId: string;
const insertedCaseIds: string[] = [];

beforeAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx.execute(sql`
      DELETE FROM cases WHERE primary_pet_id IN (
        SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
      )
    `);
    await tx.execute(sql`DELETE FROM pet_events WHERE pet_id IN (
      SELECT id FROM pets WHERE public_token = ${PET_TOKEN}
    )`);
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  });

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "PDR S1 Pet",
      species: "dog",
      sex: "female",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;

  const biteCase = await openCase({
    kind: "bite_incident",
    primarySubjectKind: "registered_pet",
    primaryPetId: petId,
    openedReason: { code: "bite_reported_owner", victimKind: "human", severity: "moderate" },
  });
  insertedCaseIds.push(biteCase.id);

  const welfareCase = await openCase({
    kind: "welfare_denuncia",
    primarySubjectKind: "registered_pet",
    primaryPetId: petId,
    openedReason: {
      code: "welfare_report_citizen",
      referenceCode: "DEN-PDR-S1",
      kind: "neglect",
      severity: "medium",
    },
  });
  insertedCaseIds.push(welfareCase.id);

  const lostCase = await openCase({
    kind: "lost_pet_episode",
    primarySubjectKind: "registered_pet",
    primaryPetId: petId,
    openedReason: {
      code: "pet_marked_lost",
      petPublicToken: null,
      ownerNote: "episodio de prueba",
    },
  });
  insertedCaseIds.push(lostCase.id);
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of insertedCaseIds) {
      await tx.execute(sql`UPDATE cases SET welfare_report_id = NULL WHERE id = ${id}`);
      await tx.execute(sql`DELETE FROM cases WHERE id = ${id}`);
    }
    await tx.execute(sql`DELETE FROM pets WHERE public_token = ${PET_TOKEN}`);
  });
});

describe("findOpenCasesForPetWithCodes — kind exclusion", () => {
  it("positive: includes the open bite_incident case", async () => {
    const rows = await findOpenCasesForPetWithCodes(petId);
    const kinds = rows.map((r) => r.caseKind);
    expect(kinds).toContain("bite_incident");
  });

  it("negative: excludes the open welfare_denuncia case for the same pet", async () => {
    const rows = await findOpenCasesForPetWithCodes(petId);
    const hasWelfare = rows.some((r) => r.caseKind === "welfare_denuncia");
    expect(hasWelfare).toBe(false);
  });

  it("negative: excludes the open lost_pet_episode case for the same pet (single rendering path)", async () => {
    const rows = await findOpenCasesForPetWithCodes(petId);
    const hasLost = rows.some((r) => r.caseKind === "lost_pet_episode");
    expect(hasLost).toBe(false);
  });

  it("scenario: pet is BOTH lost AND has a hidden welfare case — generic list shows neither", async () => {
    const rows = await findOpenCasesForPetWithCodes(petId);
    expect(
      rows.every((r) => r.caseKind !== "welfare_denuncia" && r.caseKind !== "lost_pet_episode"),
    ).toBe(true);
  });
});
