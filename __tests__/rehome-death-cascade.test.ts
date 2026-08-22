// The death of a SPONSORED pet ends the sponsorship (rehome-by-titular,
// design ADR-2 "add rehome_request to death_recorded.compatibleWith so the
// death cascade closes the arrangement"; tasks 7.4).
//
// WHY THIS HITS REAL POSTGRES (the `db` vitest project, serial)
// ---------------------------------------------------------------------------
// Attaching `death_recorded` to the open cases was the attachment rule's job
// and it never ended anything: the org's `shelter_custody` row stayed live
// (the org's census counted a dead animal as held), the listing columns
// stayed set (only the catalog's `status <> 'deceased'` guard hid it), the
// spine kept saying the sponsorship was running, and nobody — not the org,
// not the applicants — was told. The death use-case now runs CASCADE D in the
// same transaction as the death event. This proves what one transaction
// leaves behind across ownerships, pets, pet_events, cases and the
// notifications the use-case hands back.
//
// NOT the withdraw cascade, on purpose: `withdrawRehomeSponsorship` is the
// TITULAR's act — it locks the titular's own owner row by user id and signs
// `withdrawn_by_titular`. A death is recorded by whoever is present (the
// titular, the org, a vet) and the closing fact must carry THAT authorship
// with outcome `pet_deceased`, the enum member reserved for exactly this.
//
// The fixture walks the real path (request → accept → apply), so the shape
// under test is the shape production produces.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import postgres from "postgres";
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
import { DEFAULT_LOCAL_URL } from "@/scripts/_db-target";
import { queryOrphanedSponsorships } from "@/scripts/check-spine-integrity";
import { AdoptionRepository } from "@/src/modules/adoption/infrastructure/adoption-repository";
import { findOpenSponsorship } from "@/src/modules/adoption/infrastructure/rehome-sponsorship-writer";
import { createDeathRecord } from "@/src/modules/events/application/lifecycle/death-record-use-case";
import type { NewNotification } from "@/src/modules/events/application/types";
import { EventsRepository } from "@/src/modules/events/infrastructure/events-repository";
import { requestRehomeSponsorship } from "@/src/modules/rehome/application/request-rehome-sponsorship";
import { respondToRehomeRequest } from "@/src/modules/rehome/application/respond-to-rehome-request";
import { RehomeRepository } from "@/src/modules/rehome/infrastructure/rehome-repository";

import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const USERS = {
  titular: "rehome-death-titular@dim-test.local",
  coordA: "rehome-death-coord-a@dim-test.local",
  applicant: "rehome-death-applicant@dim-test.local",
} as const;
const PASS = "RehomeDeath_2026!";

const ORG_A_TOKEN = "DIM-RHDT-0001";
const PET_TOKEN = "DIM-RHDT-PET1";

const ids = {} as Record<keyof typeof USERS, string>;
let orgAId: string;
let petId: string;
let titularOwnershipId: string;
let custodyId: string;
let listingCaseId: string;
let applicationId: string;

const pgSql = postgres(process.env.DATABASE_URL ?? DEFAULT_LOCAL_URL, {
  max: 1,
  connect_timeout: 5,
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const transaction = db.transaction.bind(db) as <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;

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
      legalName: "Refugio Duelo SRL",
      displayName: "Refugio Duelo",
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
      name: "Lila",
      species: "dog",
      sex: "female",
      potentiallyDangerousBreed: false,
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
      inCustodyDispute: false,
      rabiesObservationStatus: null,
    })
    .returning({ id: pets.id });
  petId = pet.id;
  const [ownerRow] = await db
    .insert(ownerships)
    .values({ petId, ownerUserId: ids.titular, role: "owner", startedAt: new Date() })
    .returning({ id: ownerships.id });
  titularOwnershipId = ownerRow.id;

  // The real path: ask, accept, apply.
  const requested = await requestRehomeSponsorship(
    { petPublicToken: PET_TOKEN, titularUserId: ids.titular, targetOrgId: orgAId },
    { repo: RehomeRepository, now: () => new Date() },
  );
  if (!requested.ok) throw new Error(`request failed: ${requested.error}`);
  const accepted = await respondToRehomeRequest(
    { casePublicCode: requested.value.casePublicCode, decision: "accept" },
    {
      repo: RehomeRepository,
      actor: {
        user: { id: ids.coordA },
        organization: { id: orgAId, displayName: "Refugio Duelo", verified: true },
      },
      now: () => new Date(),
      transaction,
    },
  );
  if (!accepted.ok) throw new Error(`accept failed: ${accepted.error}`);
  if (!accepted.value.ownershipId || !accepted.value.listingCaseId) {
    throw new Error("accept returned no custody row / listing case");
  }
  custodyId = accepted.value.ownershipId;
  listingCaseId = accepted.value.listingCaseId;

  applicationId = await db.transaction(async (tx) => {
    const { eventId } = await AdoptionRepository.insertApplication(
      {
        petId,
        userId: ids.applicant,
        orgId: orgAId,
        housingType: "departamento",
        otherPets: null,
        dailyRoutine: null,
        notes: null,
        motivation: "Quiero darle un hogar a Lila.",
        priorPets: "no",
        now: new Date(),
      },
      tx as Tx,
    );
    return eventId;
  });
});

afterAll(async () => {
  await purgePetAndOrg();
  for (const email of Object.values(USERS)) await purgeUserByEmail(email);
  await pgSql.end({ timeout: 1 }).catch(() => {});
});

async function liveOwnerships() {
  return db
    .select({ id: ownerships.id, role: ownerships.role })
    .from(ownerships)
    .where(and(eq(ownerships.petId, petId), isNull(ownerships.endedAt)));
}

async function eventsOfType(type: string) {
  return db
    .select({
      payload: petEvents.payload,
      authorRole: petEvents.authorRole,
      authorOrganizationId: petEvents.authorOrganizationId,
      recordedByUserId: petEvents.recordedByUserId,
      caseId: petEvents.caseId,
    })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, type)));
}

async function caseById(id: string) {
  const [row] = await db
    .select({
      status: cases.status,
      closedReason: cases.closedReason,
      closedBy: cases.closedByUserId,
      publicCode: cases.publicCode,
    })
    .from(cases)
    .where(eq(cases.id, id));
  return row;
}

describe("control — the pet is sponsored, listed and applied-for going in", () => {
  it("live owner + custody rows, listed, one pending application, open listing case", async () => {
    const live = await liveOwnerships();
    expect(live.map((o) => o.role).sort()).toEqual(["owner", "shelter_custody"]);
    expect(
      (await db.select({ l: pets.adoptionListedAt }).from(pets).where(eq(pets.id, petId)))[0].l,
    ).not.toBeNull();
    expect(await findOpenSponsorship(petId, db)).toMatchObject({ ownershipId: custodyId });
    expect((await caseById(listingCaseId)).status).toBe("open");
    expect(await eventsOfType("adoption_application_resolved")).toHaveLength(0);
  });
});

describe("death_recorded on a sponsored pet — CASCADE D", () => {
  const flushed: NewNotification[] = [];

  it("ends the sponsorship in the same transaction: custody row closed, listing cleared, pet_deceased on the spine, cases closed, people told", async () => {
    const result = await createDeathRecord(
      {
        pet: {
          id: petId,
          name: "Lila",
          status: "active",
          rabiesObservationStatus: null,
          jurisdictionProvince: "Buenos Aires",
          jurisdictionLocality: "La Plata",
        },
        recordedByUserId: ids.titular,
        eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
        cause: "natural",
        causeDetail: null,
        confirmedByVet: false,
        vetName: null,
        dispositionMethod: null,
        facility: null,
        occurredAt: new Date(),
        notes: null,
        deathAtClinic: false,
        clinicName: null,
        vetContactedOwner: null,
        vetDecidedAlone: false,
        ownerToPrivateCrematorium: false,
        diseaseCode: null,
        confirmedByLab: false,
        uploadedPath: null,
        uploadedMimeType: null,
        uploadedSize: null,
        clientIdempotencyKey: null,
        custodyEpisodeCaseId: null,
      },
      {
        repo: new EventsRepository(),
        transaction,
        flushNotifications: async (pending) => {
          flushed.push(...pending);
        },
      },
    );
    expect(result.ok).toBe(true);

    // The org's row is closed; the titular's owner row is NOT (a death does
    // not change who the animal belonged to).
    const live = await liveOwnerships();
    expect(live.map((o) => o.role)).toEqual(["owner"]);
    expect(live[0].id).toBe(titularOwnershipId);

    // The listing cache is cleared in the same transaction, not left to the
    // catalog's status guard.
    const [cols] = await db
      .select({ status: pets.status, l: pets.adoptionListedAt, p: pets.adoptionListingPausedAt })
      .from(pets)
      .where(eq(pets.id, petId));
    expect(cols.status).toBe("deceased");
    expect(cols.l).toBeNull();
    expect(cols.p).toBeNull();

    // The closing fact: outcome pet_deceased, naming the custody row, signed
    // by whoever recorded the death, attached to the listing case.
    const ended = await eventsOfType("rehome_sponsorship_ended");
    expect(ended).toHaveLength(1);
    expect(ended[0].payload).toMatchObject({ ownership_id: custodyId, outcome: "pet_deceased" });
    expect(ended[0].authorRole).toBe("owner");
    expect(ended[0].recordedByUserId).toBe(ids.titular);
    expect(ended[0].caseId).toBe(listingCaseId);
    expect(await findOpenSponsorship(petId, db)).toBeNull();

    // Not an orphan: the row ended WITH its event.
    const orphans = await queryOrphanedSponsorships(pgSql);
    expect(orphans.map((o) => o.public_token)).not.toContain(PET_TOKEN);

    // The listing case and the application case both close, with a note.
    const listing = await caseById(listingCaseId);
    expect(listing.status).toBe("closed");
    expect(listing.closedReason).toBe("resolved");
    const [listingNote] = await db
      .select({ notes: caseEvents.notes })
      .from(caseEvents)
      .where(and(eq(caseEvents.caseId, listingCaseId), eq(caseEvents.entryType, "case_closed")));
    expect(listingNote?.notes).toMatch(/falleció/);

    const [appCase] = await db
      .select({ status: cases.status, closedReason: cases.closedReason })
      .from(cases)
      .where(
        and(
          eq(cases.primaryPetId, petId),
          eq(cases.caseKind, "adoption_application"),
          eq(cases.applicantUserId, ids.applicant),
        ),
      );
    expect(appCase?.status).toBe("closed");

    // The pending application is resolved on the spine — auto-generated, the
    // reason named, signed with the death's own authorship.
    const resolved = await eventsOfType("adoption_application_resolved");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].payload).toMatchObject({
      application_event_id: applicationId,
      outcome: "rejected",
      reason: "pet_deceased",
      auto_generated: true,
    });
    expect(resolved[0].authorRole).toBe("owner");

    // The people: the org's admins and the applicant, after commit.
    const orgNotice = flushed.find((n) => n.userId === ids.coordA);
    expect(orgNotice?.notificationType).toBe("rehome_sponsorship_ended_by_death");
    expect(orgNotice?.title).toContain("Lila");
    expect(orgNotice?.body).toMatch(/acompañamiento/);
    // UI-2: actionable — the closed sponsorship case, which the org's members
    // can still read once the custody row is gone.
    expect(orgNotice?.relatedCaseId).toBe(listingCaseId);
    expect(orgNotice?.ctaUrl).toBe(`/casos/${listing.publicCode}`);
    const applicantNotice = flushed.find((n) => n.userId === ids.applicant);
    expect(applicantNotice?.notificationType).toBe("adoption_application_closed");
    expect(applicantNotice?.body).toMatch(/falleció/);
    expect(applicantNotice?.body).toMatch(/No hace falta que hagas nada/);
    expect(applicantNotice?.ctaUrl).toBe("/adoptar");
  });

  it("a second death record is an idempotent noop: nothing ends twice, nobody is told twice", async () => {
    const again: NewNotification[] = [];
    const result = await createDeathRecord(
      {
        pet: {
          id: petId,
          name: "Lila",
          status: "deceased",
          rabiesObservationStatus: null,
          jurisdictionProvince: "Buenos Aires",
          jurisdictionLocality: "La Plata",
        },
        recordedByUserId: ids.titular,
        eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
        cause: "natural",
        causeDetail: null,
        confirmedByVet: false,
        vetName: null,
        dispositionMethod: null,
        facility: null,
        occurredAt: new Date(),
        notes: null,
        deathAtClinic: false,
        clinicName: null,
        vetContactedOwner: null,
        vetDecidedAlone: false,
        ownerToPrivateCrematorium: false,
        diseaseCode: null,
        confirmedByLab: false,
        uploadedPath: null,
        uploadedMimeType: null,
        uploadedSize: null,
        clientIdempotencyKey: null,
        custodyEpisodeCaseId: null,
      },
      {
        repo: new EventsRepository(),
        transaction,
        flushNotifications: async (pending) => {
          again.push(...pending);
        },
      },
    );
    expect(result.ok).toBe(true);
    expect(await eventsOfType("rehome_sponsorship_ended")).toHaveLength(1);
    expect(
      again.filter((n) => n.notificationType === "rehome_sponsorship_ended_by_death"),
    ).toHaveLength(0);
  });
});
