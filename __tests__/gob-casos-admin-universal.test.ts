// Regression: admin viewing /gob/casos must see UNIVERSAL results, not an
// empty list, and the govt scope must stay jurisdiction-fenced (2026-07-21,
// "stop /gob/casos from bouncing an admin to /admin/casos").
//
// THE BUG this guards against: app/gob/casos/page.tsx used to
// `redirect("/admin/casos")` for an admin viewer. A naive removal of that
// redirect (keep everything else) would route the admin through
// listCasesForGovt(session.jurisdictions, …) — but session.jurisdictions is
// ALWAYS [] for an admin profile (lib/infra/auth-guards.ts only populates
// jurisdictions for role="govt"), and listCasesForGovt fails CLOSED to []
// for an empty jurisdictions array. The admin would see an EMPTY case queue
// inside the /gob shell.
//
// THE FIX (loadCasosForViewer in app/gob/casos/page.tsx): branch on viewer
// role — admin uses listCasesForAdmin/countCasesForAdmin (the SAME universal
// functions /admin/casos calls, no jurisdiction predicate at all); govt keeps
// listCasesForGovt/countCasesForGovt UNCHANGED (still fenced to
// session.jurisdictions, still fails closed on empty). This test proves both
// halves with real Postgres — no mocks (mirrors
// gob-pet-subview-jurisdiction-fence.test.ts).

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pets } from "@/db";
import { openCase } from "@/lib/infra/case-helpers";
import {
  countCasesForAdmin,
  countCasesForGovt,
  listCasesForAdmin,
  listCasesForGovt,
} from "@/lib/infra/case-queries";
import { withMutationOverride } from "./_helpers/db-overrides";

const PET_TOKEN = "DIM-GOBCASOS-59-PET";

// A single pet carries two OPEN cases of DIFFERENT kinds (the partial unique
// index cases_open_per_pet_kind_idx forbids two open cases of the SAME kind
// for one pet) in DIFFERENT jurisdictions — jurisdiction lives on the CASE
// row, not the pet, so one pet fixture is enough (mirrors the fence test).
const CABA_PALERMO = { province: "CABA", locality: "Palermo" };
const SALTA = { province: "Salta", locality: "Salta" };

let petId: string;
let caseCabaId: string;
let caseSaltaId: string;

async function scrub() {
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
}

beforeAll(async () => {
  await scrub();

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "Gob Casos Fixture",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "CABA",
      jurisdictionLocality: "Palermo",
    })
    .returning();
  petId = pet.id;

  const cabaCase = await openCase({
    kind: "bite_incident",
    primarySubjectKind: "registered_pet",
    primaryPetId: petId,
    jurisdictionProvince: CABA_PALERMO.province,
    jurisdictionLocality: CABA_PALERMO.locality,
    openedReason: { code: "bite_reported_owner", victimKind: "human", severity: "moderate" },
  });
  caseCabaId = cabaCase.id;

  const saltaCase = await openCase({
    kind: "outbreak_investigation",
    primarySubjectKind: "registered_pet",
    primaryPetId: petId,
    jurisdictionProvince: SALTA.province,
    jurisdictionLocality: SALTA.locality,
    openedReason: {
      code: "outbreak_investigation_manual",
      diseaseCode: "rabia",
      note: "fixture gob-casos-admin-universal",
    },
  });
  caseSaltaId = saltaCase.id;
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    for (const id of [caseCabaId, caseSaltaId]) {
      await tx.execute(sql`UPDATE cases SET welfare_report_id = NULL WHERE id = ${id}`);
      await tx.execute(sql`DELETE FROM cases WHERE id = ${id}`);
    }
  });
  await scrub();
});

describe("gob/casos — admin universal scope, govt stays fenced (2026-07-21)", () => {
  it("govt (CABA/Palermo): sees ITS OWN case, does NOT see the Salta case", async () => {
    const items = await listCasesForGovt([CABA_PALERMO], { limit: 500 });
    const ids = items.map((c) => c.id);
    expect(ids).toContain(caseCabaId);
    expect(ids).not.toContain(caseSaltaId);
  });

  it("govt (Salta): sees ITS OWN case, does NOT see the CABA/Palermo case", async () => {
    const items = await listCasesForGovt([SALTA], { limit: 500 });
    const ids = items.map((c) => c.id);
    expect(ids).toContain(caseSaltaId);
    expect(ids).not.toContain(caseCabaId);
  });

  it("THE BUG (documented): listCasesForGovt with an admin's actual (empty) " +
    "jurisdictions array returns [] / count 0 — this is why the admin " +
    "branch must NOT reuse the govt query path", async () => {
    const items = await listCasesForGovt([], { limit: 500 });
    expect(items).toEqual([]);
    await expect(countCasesForGovt([], {})).resolves.toBe(0);
  });

  it("THE FIX: admin (listCasesForAdmin, universal) sees BOTH cases across BOTH jurisdictions", async () => {
    const items = await listCasesForAdmin({ limit: 500 });
    const ids = items.map((c) => c.id);
    expect(ids).toContain(caseCabaId);
    expect(ids).toContain(caseSaltaId);
  });

  it("admin (countCasesForAdmin) count is non-zero and unaffected by jurisdiction", async () => {
    const count = await countCasesForAdmin({});
    expect(count).toBeGreaterThan(0);
  });
});
