// Armed fence for the ONE-LIVE-SHELTER-CUSTODY-PER-PET index
// (rehome-by-titular, WU3 — design ADR-1, task 3.8).
//
// THE RACE THIS INDEX CLOSES
// ---------------------------------------------------------------------------
// `ownerships_one_active_owner_per_pet` covers `role='owner'` only. Before 0195
// the only shelter_custody index was PER (pet, org) — so two orgs could both
// hold live custody of one animal at once, which is exactly what two concurrent
// accepts of the same rehome request would produce, permanently, with nothing
// to detect it. The accept transaction takes `SELECT ... FOR UPDATE` on the
// case (mitigation 1); this index is mitigation 2, and it is the one that holds
// when the lock is bypassed by a path nobody wrote yet.
//
// WHY THIS HITS REAL POSTGRES (the `db` vitest project, serial)
// ---------------------------------------------------------------------------
// The invariant IS a partial unique index. A mocked repository has no index; a
// mocked test passes against a database that lost it. Same reasoning as
// __tests__/rehome-finalize-ownership.test.ts's armed-fence control.
//
// TEST ORDER IS LOAD-BEARING: the cases build on one another's rows.

import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, notifications, organizations, ownerships, petEvents, pets } from "@/db";

import { withMutationOverride } from "./_helpers/db-overrides";
import { expectDbError } from "./_helpers/expect-db-error";

const ORG_A_TOKEN = "DIM-RHIX-0001";
const ORG_B_TOKEN = "DIM-RHIX-0002";
const PET_TOKEN = "DIM-RHIX-PET1";

const NEW_INDEX = "ownerships_one_active_shelter_custody_per_pet";
const SUPERSEDED_INDEX = "ownerships_one_active_shelter_custody_per_pet_org";

let orgAId: string;
let orgBId: string;
let petId: string;
let firstCustodyId: string;

async function purge(): Promise<void> {
  await withMutationOverride(async (tx) => {
    const stale = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN));
    for (const { id } of stale) {
      await tx.delete(notifications).where(eq(notifications.relatedPetId, id));
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(petEvents).where(eq(petEvents.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }
  });
  for (const token of [ORG_A_TOKEN, ORG_B_TOKEN]) {
    await db.delete(organizations).where(eq(organizations.publicToken, token));
  }
}

beforeAll(async () => {
  await purge();
  const [a] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_A_TOKEN,
      legalName: "Rehome Index Refugio A",
      displayName: "Refugio A",
      orgType: "shelter",
      email: "rehome-index-a@dim-test.local",
      verified: true,
    })
    .returning({ id: organizations.id });
  const [b] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_B_TOKEN,
      legalName: "Rehome Index Refugio B",
      displayName: "Refugio B",
      orgType: "shelter",
      email: "rehome-index-b@dim-test.local",
      verified: true,
    })
    .returning({ id: organizations.id });
  orgAId = a.id;
  orgBId = b.id;

  const [pet] = await db
    .insert(pets)
    .values({ publicToken: PET_TOKEN, name: "Índice", species: "dog", sex: "male" })
    .returning({ id: pets.id });
  petId = pet.id;

  const [custody] = await db
    .insert(ownerships)
    .values({ petId, ownerOrganizationId: orgAId, role: "shelter_custody", startedAt: new Date() })
    .returning({ id: ownerships.id });
  firstCustodyId = custody.id;
});

afterAll(async () => {
  await purge();
});

async function liveCustodyRows(): Promise<Array<{ id: string; orgId: string | null }>> {
  return db
    .select({ id: ownerships.id, orgId: ownerships.ownerOrganizationId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, petId),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    );
}

describe("ownerships — one live shelter_custody row per pet", () => {
  it("a second org's live custody row on the same pet raises 23505 on the per-pet index", async () => {
    const info = await expectDbError(
      db.insert(ownerships).values({
        petId,
        ownerOrganizationId: orgBId,
        role: "shelter_custody",
        startedAt: new Date(),
      }),
      { code: "23505", constraint: NEW_INDEX },
    );
    expect(info?.constraint).toBe(NEW_INDEX);
  });

  it("the same org twice is caught by the SAME index — the per-(pet,org) one is gone", async () => {
    const info = await expectDbError(
      db.insert(ownerships).values({
        petId,
        ownerOrganizationId: orgAId,
        role: "shelter_custody",
        startedAt: new Date(),
      }),
      { code: "23505", constraint: NEW_INDEX },
    );
    expect(info?.constraint).toBe(NEW_INDEX);
  });

  it("neither rejected insert landed — exactly one live custody row remains", async () => {
    const live = await liveCustodyRows();
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(firstCustodyId);
  });

  it("an ENDED custody row does not block the next org — the index is partial on ended_at", async () => {
    await db
      .update(ownerships)
      .set({ endedAt: new Date() })
      .where(eq(ownerships.id, firstCustodyId));
    await db.insert(ownerships).values({
      petId,
      ownerOrganizationId: orgBId,
      role: "shelter_custody",
      startedAt: new Date(),
    });
    const live = await liveCustodyRows();
    expect(live).toHaveLength(1);
    expect(live[0].orgId).toBe(orgBId);
  });

  it("the superseded per-(pet,org) index no longer exists and the per-pet one carries the predicate", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'ownerships'
        AND indexname IN (${NEW_INDEX}, ${SUPERSEDED_INDEX})
    `);
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.has(SUPERSEDED_INDEX)).toBe(false);
    const def = byName.get(NEW_INDEX);
    expect(def).toContain("UNIQUE INDEX");
    expect(def).toContain("(pet_id)");
    expect(def).toContain("shelter_custody");
    expect(def).toContain("ended_at IS NULL");
  });
});
