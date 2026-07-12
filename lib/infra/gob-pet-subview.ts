import "server-only";

// Shared server loader for the govt/admin PET sub-view of the inspector (#12).
//
// FENCE INVARIANT (PO decision — do not loosen): govt/admin operators have NO
// pet directory and NO omnibox pet search (omnibox already drops pets for
// operators, lib/infra/omnibox-search.ts). A pet is reachable through the
// inspector ONLY when it is the SUBJECT of a welfare report OR the PRIMARY pet
// of a case that lies INSIDE the caller's jurisdiction:
//
//   - govt: at least one linking welfare report / case whose (province,
//     locality) passes jurisdictionScopeContains (whole-province subsumption).
//   - admin: at least one linking welfare report / case in ANY jurisdiction
//     (universal scope still REQUIRES a linking record — a pet with no welfare
//     nexus is never reachable).
//
// No linking record in scope → { ok: false } → the route answers 404 and never
// leaks that the pet exists. Read-only projection: identity, species/sex/status,
// microchip, owner-of-record, open cases.

import {
  cases,
  db,
  organizations,
  ownerships,
  petIdentifications,
  pets,
  profiles,
  welfareReports,
} from "@/db";
import { jurisdictionScopeContains } from "@/lib/domain/jurisdiction-canonical";
import { type PetOpenCase, findOpenCasesForPetWithCodes } from "@/lib/infra/case-queries";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { WelfareInspectorSession } from "./welfare-inspector-detail";

export type GobPetSubView = {
  publicToken: string;
  name: string;
  species: string;
  sex: string;
  status: string;
  breed: string | null;
  color: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  microchipCode: string | null;
  ownerOfRecord: string | null;
  openCases: PetOpenCase[];
};

export type GobPetSubViewResult = { ok: true; pet: GobPetSubView } | { ok: false };

// Sentinel pet id for the timing-oracle-hardening linking lookups when the token
// resolves to no pet: a valid UUID that matches no row, keeping the query shape
// identical for the not-found and out-of-scope paths.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Load the read-only pet sub-view for an authority, enforcing the linking-case
 * jurisdiction gate. Returns { ok: false } when the pet does not exist OR has no
 * in-jurisdiction linking welfare report / case (route → 404, no existence leak).
 */
export async function loadGobPetSubView(
  session: WelfareInspectorSession,
  publicToken: string,
): Promise<GobPetSubViewResult> {
  const { profile, jurisdictions } = session;
  const isGovt = profile.role === "govt";

  const [pet] = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      species: pets.species,
      sex: pets.sex,
      status: pets.status,
      breed: pets.breed,
      color: pets.color,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);

  // Linking authorization — gather every welfare report / case that names this
  // pet as subject/primary, then require at least one INSIDE the caller's scope.
  const inScope = (province: string | null, locality: string | null): boolean =>
    isGovt ? jurisdictionScopeContains(jurisdictions, province, locality) : true;

  // Timing-oracle hardening (task #59, LOW-1): run the linking-record lookups
  // with the SAME query shape whether or not the pet exists, so response latency
  // does not distinguish "token does not exist" (previously 1 query) from "exists
  // but out of jurisdiction" (3 queries). Both still resolve to { ok:false }. A
  // missing pet uses a sentinel id that matches no row.
  const linkPetId = pet?.id ?? NIL_UUID;

  const [reportRows, caseRows] = await Promise.all([
    db
      .select({
        province: welfareReports.jurisdictionProvince,
        locality: welfareReports.jurisdictionLocality,
      })
      .from(welfareReports)
      .where(eq(welfareReports.subjectPetId, linkPetId)),
    db
      .select({
        province: cases.jurisdictionProvince,
        locality: cases.jurisdictionLocality,
      })
      .from(cases)
      .where(eq(cases.primaryPetId, linkPetId)),
  ]);

  const hasLink =
    reportRows.some((r) => inScope(r.province, r.locality)) ||
    caseRows.some((c) => inScope(c.province, c.locality));
  if (!pet || !hasLink) return { ok: false };

  // Active microchip (canonical pet_identifications row).
  const [chip] = await db
    .select({ code: petIdentifications.code })
    .from(petIdentifications)
    .where(
      and(
        eq(petIdentifications.petId, pet.id),
        eq(petIdentifications.kind, "microchip_iso"),
        eq(petIdentifications.status, "active"),
      ),
    )
    .orderBy(desc(petIdentifications.recordedAt))
    .limit(1);

  // Owner-of-record — most recent active 'owner' ownership (person or org).
  const [ownership] = await db
    .select({
      ownerUserId: ownerships.ownerUserId,
      ownerOrganizationId: ownerships.ownerOrganizationId,
    })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .orderBy(desc(ownerships.startedAt))
    .limit(1);

  let ownerOfRecord: string | null = null;
  if (ownership?.ownerUserId) {
    const [ownerProfile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, ownership.ownerUserId))
      .limit(1);
    ownerOfRecord = ownerProfile?.displayName ?? null;
  } else if (ownership?.ownerOrganizationId) {
    const [ownerOrg] = await db
      .select({ displayName: organizations.displayName })
      .from(organizations)
      .where(eq(organizations.id, ownership.ownerOrganizationId))
      .limit(1);
    ownerOfRecord = ownerOrg?.displayName ?? null;
  }

  // Fence the open-cases list to the caller's jurisdiction (task #59). A govt
  // operator who legitimately reaches this pet through an in-scope welfare nexus
  // must NOT see cases in provinces they do not govern — the case existence +
  // publicCode + kind + open-date would leak cross-fence otherwise. Same scope
  // (and whole-province subsumption) as the linking-case gate above. Admin keeps
  // universal visibility (undefined → unfiltered).
  const openCases = await findOpenCasesForPetWithCodes(pet.id, isGovt ? jurisdictions : undefined);

  return {
    ok: true,
    pet: {
      publicToken: pet.publicToken,
      name: pet.name,
      species: pet.species,
      sex: pet.sex,
      status: pet.status,
      breed: pet.breed,
      color: pet.color,
      jurisdictionProvince: pet.jurisdictionProvince,
      jurisdictionLocality: pet.jurisdictionLocality,
      microchipCode: chip?.code ?? null,
      ownerOfRecord,
      openCases,
    },
  };
}
