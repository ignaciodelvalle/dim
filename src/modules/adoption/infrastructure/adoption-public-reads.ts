// The citizen-facing half of the adoption repository.
//
// WHY THESE FIVE AND NOT SOME OTHER FIVE. Every other query in
// `adoption-repository.ts` is reached through an ORG capability — a shelter
// publishing an animal, reviewing a letter, finalising an adoption. These five
// are the ones a CITIZEN reaches: the catalogue's ficha, the form that decides
// whether it may be shown, and the submit that follows. Two of them
// (`findPetForPublicDetail`, `findLatestAdoptionFinalizedAt`) answer a request
// carrying no session at all on the web's public `/adoptar/{token}`.
//
// That is the boundary worth having in one file, and it is the reason the split
// was made HERE rather than at the seam a line count would have suggested: "what
// can a stranger read about an animal in adoption" is now one screen of code
// with `unerasedPetByToken` visible in it, instead of five methods scattered
// through 1,500 lines of org-side writes. `__tests__/public-soft-delete-
// resolution.test.ts` and `adoption-public-reads.test.ts` fence exactly this
// file.
//
// THE OBJECT IS SPREAD BACK INTO `AdoptionRepository`, so no call site moved and
// `typeof AdoptionRepository` still carries all of it. The split is a fact about
// where the code lives, not about how it is called — every use-case still takes
// one `repo` dependency.

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db, organizations, ownerships, petEvents, pets, profiles } from "@/db";
import { unerasedPetByToken } from "@/lib/infra/public-pet-lookup";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PetRow = typeof pets.$inferSelect;
type OrgRow = typeof organizations.$inferSelect;

type PetWithOrgResult = {
  pet: PetRow & { custodyOwnershipId: string };
  org: OrgRow;
} | null;

export const AdoptionPublicReads = {
  /**
   * Finds a pet + its shelter org for the application submit flow.
   * Does NOT require the pet to belong to a specific org (applicant is a public user).
   */
  async findPetForApplication(petPublicToken: string, tx?: Tx): Promise<PetWithOrgResult> {
    const client = tx ?? db;
    const [row] = await client
      .select({ pet: pets, custodyOwnershipId: ownerships.id, org: organizations })
      .from(pets)
      .innerJoin(ownerships, eq(ownerships.petId, pets.id))
      .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
      .where(
        and(
          // Art. 16: an erased pet answers like a token that never existed.
          unerasedPetByToken(petPublicToken),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);

    if (!row) return null;
    return { pet: { ...row.pet, custodyOwnershipId: row.custodyOwnershipId }, org: row.org };
  },

  /**
   * The pet and its CURRENT custodian, for a public ficha read.
   *
   * TWO LOOKUPS, NOT ONE JOIN, AND BOTH HALVES OF THAT ARE SCARS.
   *
   * `findPetForApplication` above INNER JOINs the open `shelter_custody` row,
   * which is right for a write (you cannot apply to an animal no shelter holds)
   * and wrong for this read: an adoption ENDS that row, so the join would turn
   * the ficha's "¡ya encontró su hogar!" — the whole point of which is that
   * somebody followed a stale share link — into a hard 404 saying the animal
   * never existed. So the pet resolves on its own and the custody is a second
   * question, exactly as `app/(public)/adoptar/[petToken]/page.tsx` does it.
   *
   * The ORDER BY is the other scar and it is not decoration. That page's single
   * query used to pick an ARBITRARY ownership row for a pet transferred between
   * orgs, and in the wild it picked the ORIGINAL shelter's ENDED row: the public
   * detail credited a refuge that no longer answered for the animal while the
   * catalogue card and the transfer hub named the one that did (found live by
   * the 9-role external run, 2026-08-18). Two open custody rows should not
   * exist; if the invariant ever breaks, the MOST RECENT wins, consistently.
   *
   * Art. 16 comes from `unerasedPetByToken`: an erased pet answers like a token
   * that never existed, on this door as on every other.
   */
  async findPetForPublicDetail(
    petPublicToken: string,
    tx?: Tx,
  ): Promise<{
    pet: PetRow;
    org: typeof organizations.$inferSelect | null;
    custodyStartedAt: Date | null;
  } | null> {
    const client = tx ?? db;
    const [petRow] = await client
      .select()
      .from(pets)
      .where(unerasedPetByToken(petPublicToken))
      .limit(1);
    if (!petRow) return null;

    const [custodyRow] = await client
      .select({ org: organizations, startedAt: ownerships.startedAt })
      .from(ownerships)
      .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
      .where(
        and(
          eq(ownerships.petId, petRow.id),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      )
      .orderBy(desc(ownerships.startedAt))
      .limit(1);

    return {
      pet: petRow,
      org: custodyRow?.org ?? null,
      custodyStartedAt: custodyRow?.startedAt ?? null,
    };
  },

  /**
   * Whether this pet carries an `adoption_finalized` event, and when the most
   * recent one landed. The ficha's D7.2 branch decides "recently" from it.
   */
  async findLatestAdoptionFinalizedAt(petId: string, tx?: Tx): Promise<Date | null> {
    const client = tx ?? db;
    const [row] = await client
      .select({ recordedAt: petEvents.recordedAt })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "adoption_finalized")))
      .orderBy(desc(petEvents.recordedAt))
      .limit(1);
    return row?.recordedAt ?? null;
  },

  /**
   * Finds the applicant's profile (accountType check).
   */
  async findApplicantProfile(
    userId: string,
    tx?: Tx,
  ): Promise<typeof profiles.$inferSelect | null> {
    const client = tx ?? db;
    const [row] = await client.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    return row ?? null;
  },

  /**
   * Finds an existing unresolved adoption application for the (petId, userId) pair.
   * Returns the event row or null.
   */
  async findExistingApplication(
    petId: string,
    userId: string,
    tx?: Tx,
  ): Promise<{ id: string } | null> {
    const client = tx ?? db;
    const rows = await client.execute<{ id: string }>(sql`
      SELECT e.id::text AS id
      FROM pet_events e
      WHERE e.pet_id = ${petId}
        AND e.event_type = 'adoption_application_submitted'
        AND e.payload->>'applicant_user_id' = ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM pet_events d
          WHERE d.pet_id = e.pet_id
            AND d.event_type = 'adoption_application_resolved'
            AND d.payload->>'application_event_id' = e.id::text
        )
      LIMIT 1
    `);
    return rows[0] ?? null;
  },
};
