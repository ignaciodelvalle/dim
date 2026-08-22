// The titular's two exits from rehome-by-titular, end to end (WU4):
//   - WITHDRAW an ACTIVE sponsorship (spec REQ-8, REQ-10, REQ-15; design WU4)
//   - CANCEL a still-PENDING request (spec REQ-3; WU3 review M-3)
//
// WHY THIS HITS REAL POSTGRES (the `db` vitest project, serial)
// ---------------------------------------------------------------------------
// The withdraw is the one-way door's escape hatch: the design says never ship
// WU3 without it. Its claims are about what survives ONE transaction across
// ownerships, pets, pet_events and cases — and about what the catalog query
// and the org's own listing use-case see afterwards. A mocked repository
// would pass against a withdraw that closes the row and forgets the spine.
//
// TEST ORDER IS LOAD-BEARING: the fixture is sponsored going in; the cases
// consume and rebuild that state in sequence. Do not reorder.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  caseEvents,
  cases,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { setAdoptionListingStatus } from "@/src/modules/adoption/application/set-adoption-listing-status";
import { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";
import { AdoptionRepository } from "@/src/modules/adoption/infrastructure/adoption-repository";
import { findOpenSponsorship } from "@/src/modules/adoption/infrastructure/rehome-sponsorship-writer";
import { requestRehomeSponsorship } from "@/src/modules/rehome/application/request-rehome-sponsorship";
import { respondToRehomeRequest } from "@/src/modules/rehome/application/respond-to-rehome-request";
import { withdrawRehomeRequest } from "@/src/modules/rehome/application/withdraw-rehome-request";
import { withdrawRehomeSponsorship } from "@/src/modules/rehome/application/withdraw-rehome-sponsorship";
import { RehomeRepository } from "@/src/modules/rehome/infrastructure/rehome-repository";

import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const USERS = {
  titular: "rehome-withdraw-titular@dim-test.local",
  fosterer: "rehome-withdraw-fosterer@dim-test.local",
  coordA: "rehome-withdraw-coord-a@dim-test.local",
} as const;
const PASS = "RehomeWithdraw_2026!";

const ORG_A_TOKEN = "DIM-RHWD-0001";
const PET_TOKEN = "DIM-RHWD-PET1";

const ids = {} as Record<keyof typeof USERS, string>;
let orgAId: string;
let petId: string;
let titularOwnershipId: string;
let firstCustodyId: string;
let firstListingCaseId: string;
let firstRequestCode: string;

const transaction = db.transaction.bind(db) as <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
const requestDeps = () => ({ repo: RehomeRepository, now: () => new Date() });
const withdrawDeps = () => ({ repo: RehomeRepository, now: () => new Date(), transaction });
const answerDeps = (userId: string) => ({
  repo: RehomeRepository,
  actor: {
    user: { id: userId },
    organization: { id: orgAId, displayName: "Refugio Padrino", verified: true },
  },
  now: () => new Date(),
  transaction,
});

async function purgeUserByEmail(email: string): Promise<void> {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const userIds = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  await withMutationOverride(async (tx) => {
    for (const uid of userIds) {
      await tx.delete(notifications).where(eq(notifications.userId, uid));
      await tx.delete(organizationMemberships).where(eq(organizationMemberships.userId, uid));
      await tx.delete(ownerships).where(eq(ownerships.ownerUserId, uid));
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }
  });
  if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
}

async function purgePetAndOrg(): Promise<void> {
  await withMutationOverride(async (tx) => {
    const stale = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN));
    for (const { id } of stale) {
      await tx.delete(notifications).where(eq(notifications.relatedPetId, id));
      const staleCases = await tx
        .select({ id: cases.id })
        .from(cases)
        .where(eq(cases.primaryPetId, id));
      for (const c of staleCases) {
        await tx.delete(caseEvents).where(eq(caseEvents.caseId, c.id));
      }
      await tx.delete(petEvents).where(eq(petEvents.petId, id));
      await tx.delete(cases).where(eq(cases.primaryPetId, id));
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }
  });
  const staleOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, ORG_A_TOKEN));
  for (const { id } of staleOrgs) {
    await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
}

/** The real path to a sponsored pet: the titular asks, the org accepts. */
async function sponsor(): Promise<{
  custodyId: string;
  listingCaseId: string;
  requestCode: string;
}> {
  const requested = await requestRehomeSponsorship(
    { petPublicToken: PET_TOKEN, titularUserId: ids.titular, targetOrgId: orgAId },
    requestDeps(),
  );
  if (!requested.ok) throw new Error(`request failed: ${requested.error}`);
  const accepted = await respondToRehomeRequest(
    { casePublicCode: requested.value.casePublicCode, decision: "accept" },
    answerDeps(ids.coordA),
  );
  if (!accepted.ok) throw new Error(`accept failed: ${accepted.error}`);
  if (!accepted.value.ownershipId || !accepted.value.listingCaseId) {
    throw new Error("accept returned no custody row / listing case");
  }
  return {
    custodyId: accepted.value.ownershipId,
    listingCaseId: accepted.value.listingCaseId,
    requestCode: requested.value.casePublicCode,
  };
}

beforeAll(async () => {
  await purgePetAndOrg();
  for (const email of Object.values(USERS)) await purgeUserByEmail(email);

  for (const [key, email] of Object.entries(USERS) as Array<[keyof typeof USERS, string]>) {
    const r = await supabaseAdmin.auth.admin.createUser({
      email,
      password: PASS,
      email_confirm: true,
    });
    if (r.error || !r.data.user) throw new Error(`createUser ${key}: ${r.error?.message}`);
    ids[key] = r.data.user.id;
    await db
      .update(profiles)
      .set({ displayName: email.split("@")[0], role: "owner", accountType: "personal" })
      .where(eq(profiles.id, ids[key]));
  }

  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_A_TOKEN,
      legalName: "Refugio Padrino SRL",
      displayName: "Refugio Padrino",
      orgType: "shelter",
      email: `${ORG_A_TOKEN.toLowerCase()}@dim-test.local`,
      verified: true,
    })
    .returning({ id: organizations.id });
  orgAId = org.id;
  await db.insert(organizationMemberships).values({
    organizationId: orgAId,
    userId: ids.coordA,
    role: "admin",
    canWritePetEvents: true,
  });

  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "Tango",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      inCustodyDispute: false,
      rabiesObservationStatus: null,
    })
    .returning({ id: pets.id });
  petId = pet.id;

  const now = new Date();
  const [ownerRow] = await db
    .insert(ownerships)
    .values({ petId, ownerUserId: ids.titular, role: "owner", startedAt: now })
    .returning({ id: ownerships.id });
  titularOwnershipId = ownerRow.id;
  await db
    .insert(ownerships)
    .values({ petId, ownerUserId: ids.fosterer, role: "foster", startedAt: now });

  const sponsored = await sponsor();
  firstCustodyId = sponsored.custodyId;
  firstListingCaseId = sponsored.listingCaseId;
  firstRequestCode = sponsored.requestCode;
});

afterAll(async () => {
  await purgePetAndOrg();
  for (const email of Object.values(USERS)) await purgeUserByEmail(email);
});

async function liveOwnerships() {
  return db
    .select({ id: ownerships.id, role: ownerships.role, org: ownerships.ownerOrganizationId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, petId), isNull(ownerships.endedAt)));
}

async function petListingColumns() {
  const [row] = await db
    .select({
      eligible: pets.adoptionEligible,
      listedAt: pets.adoptionListedAt,
      pausedAt: pets.adoptionListingPausedAt,
    })
    .from(pets)
    .where(eq(pets.id, petId));
  return row;
}

async function spineTypes() {
  const rows = await db
    .select({ type: petEvents.eventType })
    .from(petEvents)
    .where(eq(petEvents.petId, petId));
  return rows.map((r) => r.type).sort();
}

async function closedEntryFor(caseId: string) {
  const [entry] = await db
    .select({
      notes: caseEvents.notes,
      payload: caseEvents.payload,
      by: caseEvents.recordedByUserId,
    })
    .from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.entryType, "case_closed")));
  return entry ?? null;
}

async function inCatalog(): Promise<boolean> {
  const { items } = await queryAdoptionListing({ organizationToken: ORG_A_TOKEN }, null);
  return items.some((i) => i.petPublicToken === PET_TOKEN);
}

const openSponsorship = () =>
  findOpenSponsorship(petId, db as unknown as Parameters<typeof findOpenSponsorship>[1]);

// ---------------------------------------------------------------------------
// Withdraw an ACTIVE sponsorship
// ---------------------------------------------------------------------------

describe("withdraw — the control: the pet is sponsored going in", () => {
  it("open sponsorship on the live custody row, listed, in the catalog", async () => {
    expect((await openSponsorship())?.ownershipId).toBe(firstCustodyId);
    const live = await liveOwnerships();
    expect(live.map((o) => o.role).sort()).toEqual(["foster", "owner", "shelter_custody"]);
    const cols = await petListingColumns();
    expect(cols.eligible).toBe(true);
    expect(cols.listedAt).not.toBeNull();
    expect(await inCatalog()).toBe(true);
  });
});

describe("withdraw — who may, and what one transaction does (REQ-8, REQ-10, REQ-14)", () => {
  it("a foster on the pet cannot withdraw — the arrangement is untouched", async () => {
    const r = await withdrawRehomeSponsorship(
      { petPublicToken: PET_TOKEN, titularUserId: ids.fosterer },
      withdrawDeps(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/titular/);
    expect((await openSponsorship())?.ownershipId).toBe(firstCustodyId);
    expect((await liveOwnerships()).map((o) => o.role).sort()).toEqual([
      "foster",
      "owner",
      "shelter_custody",
    ]);
    expect(await inCatalog()).toBe(true);
  });

  it("the titular withdraws: custody closes, the listing clears, the spine says withdrawn_by_titular, the listing case closes, the owner row is never touched, the org is told", async () => {
    const r = await withdrawRehomeSponsorship(
      { petPublicToken: PET_TOKEN, titularUserId: ids.titular },
      withdrawDeps(),
    );
    expect(r.ok ? "" : r.error).toBe("");
    if (!r.ok) return;
    expect(r.value.sponsoringOrganizationId).toBe(orgAId);
    expect(r.value.petPublicToken).toBe(PET_TOKEN);

    // Ownership: the org's row is closed; the titular's row is the SAME row,
    // still live (REQ-8: withdraw only ever closes the org's row).
    const live = await liveOwnerships();
    expect(live.map((o) => o.role).sort()).toEqual(["foster", "owner"]);
    expect(live.find((o) => o.role === "owner")?.id).toBe(titularOwnershipId);
    const [custody] = await db
      .select({ endedAt: ownerships.endedAt })
      .from(ownerships)
      .where(eq(ownerships.id, firstCustodyId));
    expect(custody.endedAt).not.toBeNull();

    // The cache: not listed, not paused. (Eligibility is the org's assessment
    // and stays as the spine recorded it — without custody it lists nothing.)
    const cols = await petListingColumns();
    expect(cols.listedAt).toBeNull();
    expect(cols.pausedAt).toBeNull();

    // The spine: the closing fact names the custody row, is signed by the
    // TITULAR (not the org, not the platform), and is attached to the
    // listing case — written while that case was still open.
    expect(await spineTypes()).toEqual([
      "adoption_eligibility_set",
      "rehome_sponsorship_ended",
      "rehome_sponsorship_started",
    ]);
    const [ended] = await db
      .select({
        payload: petEvents.payload,
        authorRole: petEvents.authorRole,
        authorOrganizationId: petEvents.authorOrganizationId,
        recordedByUserId: petEvents.recordedByUserId,
        caseId: petEvents.caseId,
      })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "rehome_sponsorship_ended")));
    expect(ended.payload).toMatchObject({
      ownership_id: firstCustodyId,
      outcome: "withdrawn_by_titular",
    });
    expect(ended.authorRole).toBe("owner");
    expect(ended.authorOrganizationId).toBeNull();
    expect(ended.recordedByUserId).toBe(ids.titular);
    expect(ended.caseId).toBe(firstListingCaseId);
    expect(await openSponsorship()).toBeNull();

    // The listing case (the sponsorship itself) is closed, cancelled BY the
    // titular, with a timeline entry that says who ended it and that the
    // animal is still with its family.
    const [listing] = await db.select().from(cases).where(eq(cases.id, firstListingCaseId));
    expect(listing.status).toBe("closed");
    expect(listing.closedReason).toBe("cancelled");
    expect(listing.closedByUserId).toBe(ids.titular);
    const entry = await closedEntryFor(firstListingCaseId);
    expect(entry?.notes).toMatch(/titular/);
    expect(entry?.notes).toMatch(/dio de baja/);
    expect(entry?.notes).toContain("Refugio Padrino");
    expect((entry?.payload as { rehome_decision?: string }).rehome_decision).toBe("withdrawn");

    // The catalog no longer resolves the pet — same transaction, not eventually.
    expect(await inCatalog()).toBe(false);

    // The org's admins are told, and the CTA is the case they worked on.
    expect(r.notifications.map((n) => n.userId)).toEqual([ids.coordA]);
    expect(r.notifications[0].notificationType).toBe("rehome_sponsorship_withdrawn");
    expect(r.notifications[0].title).toContain("Tango");
    expect(r.notifications[0].body).toMatch(/sigue (con|viviendo con) su familia/);
    expect(r.notifications[0].ctaUrl).toBe(`/casos/${listing.publicCode}`);
    expect(r.notifications[0].relatedCaseId).toBe(firstListingCaseId);
  });

  it("REQ-8: after the withdraw the org cannot publish — its own listing use-case finds no custody", async () => {
    const r = await setAdoptionListingStatus(
      { petPublicToken: PET_TOKEN, action: "publish" },
      {
        repo: AdoptionRepository,
        actor: {
          user: { id: ids.coordA },
          organization: { id: orgAId, publicToken: ORG_A_TOKEN, verified: true },
        },
        transaction,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no está bajo custodia de tu organización/);
    expect((await petListingColumns()).listedAt).toBeNull();
    expect(await inCatalog()).toBe(false);
  });

  it("withdrawing again is refused — there is nothing active", async () => {
    const r = await withdrawRehomeSponsorship(
      { petPublicToken: PET_TOKEN, titularUserId: ids.titular },
      withdrawDeps(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no tiene un acompañamiento .*activo/);
    expect(await spineTypes()).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Cancel a PENDING request (REQ-3)
// ---------------------------------------------------------------------------

let pendingCode: string;
let pendingCaseId: string;

describe("cancel — the titular withdraws a request the org has not answered (REQ-3)", () => {
  it("REQ-16 cleared by the withdraw: the titular can ask again — a new, pending request", async () => {
    const r = await requestRehomeSponsorship(
      { petPublicToken: PET_TOKEN, titularUserId: ids.titular, targetOrgId: orgAId },
      requestDeps(),
    );
    expect(r.ok ? "" : r.error).toBe("");
    if (!r.ok) return;
    pendingCode = r.value.casePublicCode;
    pendingCaseId = r.value.caseId;
    expect(pendingCode).not.toBe(firstRequestCode);
  });

  it("a foster cannot cancel the titular's pending request", async () => {
    const r = await withdrawRehomeRequest(
      { petPublicToken: PET_TOKEN, titularUserId: ids.fosterer },
      withdrawDeps(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/titular/);
    const [row] = await db
      .select({ status: cases.status })
      .from(cases)
      .where(eq(cases.id, pendingCaseId));
    expect(row.status).toBe("open");
  });

  it("the titular cancels: closed as cancelled BY the titular, the note says so, nothing on the spine, the org is told", async () => {
    const before = await spineTypes();
    const r = await withdrawRehomeRequest(
      { petPublicToken: PET_TOKEN, titularUserId: ids.titular },
      withdrawDeps(),
    );
    expect(r.ok ? "" : r.error).toBe("");
    if (!r.ok) return;
    expect(r.value.casePublicCode).toBe(pendingCode);

    // The row: the same closedReason an org decline uses, told apart by the
    // ACTOR on the row (design ADR-1) — and it is the titular, not coordA.
    const [row] = await db.select().from(cases).where(eq(cases.id, pendingCaseId));
    expect(row.status).toBe("closed");
    expect(row.closedReason).toBe("cancelled");
    expect(row.closedByUserId).toBe(ids.titular);
    expect(row.closedByUserId).not.toBe(ids.coordA);

    // The timeline entry reads as the titular's own cancel, not as a decline
    // ("rechaz…") and not as an operator's close.
    const entry = await closedEntryFor(pendingCaseId);
    expect(entry?.notes).toMatch(/titular/);
    expect(entry?.notes).toMatch(/cancel/);
    expect(entry?.notes).not.toMatch(/rechaz/);
    expect(entry?.notes).toContain("Refugio Padrino");
    expect((entry?.payload as { rehome_decision?: string }).rehome_decision).toBe("withdrawn");
    expect(entry?.by).toBe(ids.titular);

    // Nothing about the animal changed: spine and rows are as they were.
    expect(await spineTypes()).toEqual(before);
    expect((await liveOwnerships()).map((o) => o.role).sort()).toEqual(["foster", "owner"]);

    expect(r.notifications.map((n) => n.userId)).toEqual([ids.coordA]);
    expect(r.notifications[0].notificationType).toBe("rehome_request_withdrawn");
    expect(r.notifications[0].title).toContain("Tango");
    expect(r.notifications[0].ctaUrl).toBe(`/casos/${pendingCode}`);
    expect(r.notifications[0].relatedCaseId).toBe(pendingCaseId);
  });

  it("the org answering a cancelled request is refused", async () => {
    const r = await respondToRehomeRequest(
      { casePublicCode: pendingCode, decision: "accept" },
      answerDeps(ids.coordA),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya fue respondida/);
    expect((await liveOwnerships()).map((o) => o.role).sort()).toEqual(["foster", "owner"]);
  });

  it("cancelling again is refused — there is no pending request", async () => {
    const r = await withdrawRehomeRequest(
      { petPublicToken: PET_TOKEN, titularUserId: ids.titular },
      withdrawDeps(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no hay una solicitud .*pendiente/i);
  });
});

// ---------------------------------------------------------------------------
// A new listing needs a NEW accepted request (REQ-7)
// ---------------------------------------------------------------------------

describe("re-list — only through a new accepted request (REQ-7)", () => {
  it("request again, accept again: a NEW custody row with its own started event, and the pet is back in the catalog", async () => {
    const sponsored = await sponsor();
    expect(sponsored.custodyId).not.toBe(firstCustodyId);
    expect(sponsored.listingCaseId).not.toBe(firstListingCaseId);

    const live = await liveOwnerships();
    expect(live.map((o) => o.role).sort()).toEqual(["foster", "owner", "shelter_custody"]);
    expect(live.find((o) => o.role === "owner")?.id).toBe(titularOwnershipId);
    expect(live.find((o) => o.role === "shelter_custody")?.id).toBe(sponsored.custodyId);

    expect((await openSponsorship())?.ownershipId).toBe(sponsored.custodyId);
    expect(await spineTypes()).toEqual([
      "adoption_eligibility_set",
      "adoption_eligibility_set",
      "rehome_sponsorship_ended",
      "rehome_sponsorship_started",
      "rehome_sponsorship_started",
    ]);
    expect(await inCatalog()).toBe(true);
  });
});
