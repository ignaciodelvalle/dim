// Integration test for the registered-adopter finalization contract
// (org-pilot-pack, spec Req 2 read through the reconciliation ruling):
//
//   match = profiles row with matching dniHash AND an auth.users row EXISTS.
//   dniVerified is NOT required. Legacy stubs (no auth row) REFUSE.
//
// This runs against the real local Postgres (Supabase stack on 54321/54322)
// because the entire value of findAdopterAccountByDni is the raw-SQL EXISTS
// against auth.users — a mocked repo cannot validate that join. Pattern
// mirrors __tests__/adoption-cascade.test.ts (admin client + session mock +
// withMutationOverride cleanup).
//
// Cases:
//   1. checkAdopterAccountAction — capability gate + found/not-found surface.
//   2. Legacy stub (profiles row, NO auth.users row) → finalize refuses,
//      no new profiles row, no adoption_finalized event.
//   3. No profiles row at all → finalize refuses, nothing inserted.
//   4. Registered account with dniVerified=false → finalize PROCEEDS onto the
//      real userId (the reconciliation's core claim).

import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { dniLast4, hashDni } from "@/lib/utils/dni-hash";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
import { checkAdopterAccountAction, finalizeAdoptionAction } from "@/src/modules/adoption/actions";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const ADOPTER_EMAIL = "adopt-regreq-adopter@dim-test.local";
const COORD_EMAIL = "adopt-regreq-coord@dim-test.local";
const PASS = "RegReq_2026!";

const ORG_TOKEN = "DIM-REGADOPT-01";
const PET_TOKEN = "DIM-REGA-PET1";

// Three DNIs, three fates:
const REGISTERED_DNI = "50000001"; // auth.users + profiles, dniVerified=FALSE
const STUB_DNI = "50000002"; // profiles only (legacy stub), no auth row
const ABSENT_DNI = "50000003"; // no profiles row at all

let adopterUserId: string;
let coordUserId: string;
let stubProfileId: string;
let orgId: string;
let petId: string;

function mockSessionAs(userId: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: { id: userId } as unknown },
        error: null,
      }),
    },
  } as never);
}

async function purgeUserByEmail(email: string) {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const found = data?.users.find((u) => u.email === email);
  if (!found) return;
  await withMutationOverride(async (tx) => {
    await tx.delete(notifications).where(eq(notifications.userId, found.id));
    await tx.delete(organizationMemberships).where(eq(organizationMemberships.userId, found.id));
    await tx.delete(ownerships).where(eq(ownerships.ownerUserId, found.id));
    await tx.delete(profiles).where(eq(profiles.id, found.id));
  });
  await supabaseAdmin.auth.admin.deleteUser(found.id);
}

async function purgeStaleFixtures() {
  await withMutationOverride(async (tx) => {
    const stalePets = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN));
    for (const { id } of stalePets) {
      await tx.delete(notifications).where(eq(notifications.relatedPetId, id));
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(petEvents).where(eq(petEvents.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }
    // Stale stub / registered profiles from a crashed run (hash-addressed).
    for (const dni of [STUB_DNI]) {
      await tx.delete(profiles).where(eq(profiles.dniHash, hashDni(dni)));
    }
  });
  const staleOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, ORG_TOKEN));
  for (const { id } of staleOrgs) {
    await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, id));
    await db.delete(organizations).where(eq(organizations.id, id));
  }
}

/** Count profiles rows whose dniHash matches the given DNI. */
async function profilesCountForDni(dni: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(profiles)
    .where(eq(profiles.dniHash, hashDni(dni)));
  return row?.n ?? 0;
}

async function finalizedEventCount(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "adoption_finalized")));
  return row?.n ?? 0;
}

function finalizeFormData(dni: string): FormData {
  const fd = new FormData();
  fd.set("adopterDni", dni);
  fd.set("adopterDisplayName", "Persona Adoptante");
  fd.set("adopterPhone", "+541122334455");
  fd.set("followupMonths", "0");
  fd.set("notes", "Registered-adopter contract test");
  return fd;
}

beforeAll(async () => {
  await purgeStaleFixtures();
  for (const email of [ADOPTER_EMAIL, COORD_EMAIL]) {
    await purgeUserByEmail(email);
  }

  // Registered adopter: REAL auth.users row + profiles row, dniVerified=FALSE
  // on purpose — the reconciliation says a fresh on-the-spot signup matches.
  const adopterRes = await supabaseAdmin.auth.admin.createUser({
    email: ADOPTER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (adopterRes.error || !adopterRes.data.user) {
    throw new Error(`createUser adopter: ${adopterRes.error?.message}`);
  }
  adopterUserId = adopterRes.data.user.id;
  await db
    .update(profiles)
    .set({
      displayName: "Registrada Reciente",
      phone: "+541100000001",
      dniHash: hashDni(REGISTERED_DNI),
      dniLast4: dniLast4(REGISTERED_DNI),
      dniVerified: false,
      role: "owner",
      accountType: "personal",
    })
    .where(eq(profiles.id, adopterUserId));

  const coordRes = await supabaseAdmin.auth.admin.createUser({
    email: COORD_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (coordRes.error || !coordRes.data.user) {
    throw new Error(`createUser coord: ${coordRes.error?.message}`);
  }
  coordUserId = coordRes.data.user.id;
  await db
    .update(profiles)
    .set({ displayName: "RegReq Coord", role: "owner", accountType: "personal" })
    .where(eq(profiles.id, coordUserId));

  // Legacy stub: profiles row with a matching hash, NO auth.users row — the
  // exact artifact the retired manual-DNI branch used to create.
  stubProfileId = randomUUID();
  await db.insert(profiles).values({
    id: stubProfileId,
    displayName: "Stub Legado",
    dniHash: hashDni(STUB_DNI),
    dniLast4: dniLast4(STUB_DNI),
    dniVerified: false,
    role: "owner",
  });

  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: ORG_TOKEN,
      legalName: "RegReq Test Refugio SRL",
      displayName: "RegReq Refugio",
      orgType: "shelter",
      email: "regreq@dim-test.local",
      verified: true,
    })
    .returning();
  orgId = org.id;

  await db.insert(organizationMemberships).values({
    organizationId: orgId,
    userId: coordUserId,
    role: "admin",
    canWritePetEvents: true,
  });

  const now = new Date();
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "Regina",
      species: "dog",
      sex: "female",
      potentiallyDangerousBreed: false,
      adoptionEligible: true,
      adoptionEligibilitySetAt: now,
      inCustodyDispute: false,
      rabiesObservationStatus: null,
    })
    .returning();
  petId = pet.id;

  await db.insert(ownerships).values({
    petId,
    ownerOrganizationId: orgId,
    role: "shelter_custody",
    startedAt: now,
  });
});

afterAll(async () => {
  await db.delete(notifications).where(eq(notifications.relatedPetId, petId));
  await db.delete(ownerships).where(eq(ownerships.petId, petId));
  await withMutationOverride(async (tx) => {
    await tx.delete(petEvents).where(eq(petEvents.petId, petId));
    await tx.delete(pets).where(eq(pets.id, petId));
    await tx.delete(profiles).where(eq(profiles.id, stubProfileId));
  });
  await db.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  for (const email of [ADOPTER_EMAIL, COORD_EMAIL]) {
    await purgeUserByEmail(email);
  }
});

describe("registered-adopter finalization contract (auth.users EXISTS gate)", () => {
  it("checkAdopterAccountAction enforces the adoption.finalize capability", async () => {
    // The adopter has no membership in the org — the gate must reject.
    mockSessionAs(adopterUserId);
    const r = await checkAdopterAccountAction(ORG_TOKEN, REGISTERED_DNI);
    expect("error" in r && typeof r.error === "string").toBe(true);
  });

  it("checkAdopterAccountAction: registered (dniVerified=false) → found; stub and absent → not found", async () => {
    mockSessionAs(coordUserId);

    const registered = await checkAdopterAccountAction(ORG_TOKEN, REGISTERED_DNI);
    expect(registered).toEqual({ found: true, displayName: "Registrada Reciente" });

    const stub = await checkAdopterAccountAction(ORG_TOKEN, STUB_DNI);
    expect(stub).toEqual({ found: false });

    const absent = await checkAdopterAccountAction(ORG_TOKEN, ABSENT_DNI);
    expect(absent).toEqual({ found: false });
  });

  it("legacy stub (profiles row, NO auth.users row) → finalize REFUSES with no writes", async () => {
    mockSessionAs(coordUserId);
    const profilesBefore = await profilesCountForDni(STUB_DNI);
    expect(profilesBefore).toBe(1); // the seeded stub

    const result = await finalizeAdoptionAction(
      ORG_TOKEN,
      PET_TOKEN,
      { error: null },
      finalizeFormData(STUB_DNI),
    );

    expect(result.error).toMatch(/cuenta miMAR/i);
    expect(result.redirectTo).toBeUndefined();
    // No stub-creation, no event, custody untouched (spec 2.3).
    expect(await profilesCountForDni(STUB_DNI)).toBe(profilesBefore);
    expect(await finalizedEventCount()).toBe(0);
    const [custody] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, petId),
          eq(ownerships.role, "shelter_custody"),
          isNull(ownerships.endedAt),
        ),
      );
    expect(custody).toBeDefined();
  });

  it("no profiles row at all → finalize REFUSES and inserts nothing", async () => {
    mockSessionAs(coordUserId);
    expect(await profilesCountForDni(ABSENT_DNI)).toBe(0);

    const result = await finalizeAdoptionAction(
      ORG_TOKEN,
      PET_TOKEN,
      { error: null },
      finalizeFormData(ABSENT_DNI),
    );

    expect(result.error).toMatch(/cuenta miMAR/i);
    // The old branch would have inserted a randomUUID() stub here. Never again.
    expect(await profilesCountForDni(ABSENT_DNI)).toBe(0);
    expect(await finalizedEventCount()).toBe(0);
  });

  it("registered account with dniVerified=false → finalize PROCEEDS onto the real userId", async () => {
    mockSessionAs(coordUserId);
    const profilesBefore = await profilesCountForDni(REGISTERED_DNI);
    expect(profilesBefore).toBe(1);

    const result = await finalizeAdoptionAction(
      ORG_TOKEN,
      PET_TOKEN,
      { error: null },
      finalizeFormData(REGISTERED_DNI),
    );

    expect(result.error).toBeNull();
    expect(result.redirectTo).toContain(`/org/${ORG_TOKEN}/mascotas?adopcion=`);

    // Exactly one adoption_finalized event, adopter = the REAL account.
    const finalized = await db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "adoption_finalized")));
    expect(finalized).toHaveLength(1);
    expect((finalized[0].payload as { adopter_user_id: string }).adopter_user_id).toBe(
      adopterUserId,
    );

    // Ownership landed on the registered account (role=owner, active).
    const [ownerRow] = await db
      .select({ ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .where(
        and(eq(ownerships.petId, petId), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
      );
    expect(ownerRow?.ownerUserId).toBe(adopterUserId);

    // No extra profiles row appeared for this DNI (no stub side-channel).
    expect(await profilesCountForDni(REGISTERED_DNI)).toBe(profilesBefore);
  });
});
