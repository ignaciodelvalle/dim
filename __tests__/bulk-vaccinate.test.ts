// Integration tests for bulkVaccinateAction (Sprint 8 PR1).
//
// Covers:
//   - happy path: 20 pets all succeed, 20 vaccination_administered events written
//     with the shared payload.
//   - partial failure: some tokens not in shelter_custody → failed[] with reason,
//     the rest succeed.
//   - idempotency: re-run with the same bulkActionId → no duplicate events,
//     same succeeded set returned.
//   - auth: no event.write capability → all tokens rejected.
//   - scale: ~200-pet batch completes correctly (no hard time assertion in CI).
//
// Auth is stubbed via vi.mock("@/lib/supabase/server") so requireCapability
// reads the mocked user. Ownership and event inserts use the real DB.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { bulkVaccinateAction } from "@/app/actions/bulk-pet-events";
import {
  db,
  organizationCapabilityGrants,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  reminders,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

// ─── Test env ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const COORD_EMAIL = "bulk-vax-coord@dim-test.local";
const NO_CAP_EMAIL = "bulk-vax-nocap@dim-test.local";
const PASS = "BulkVax_2026!";

let coordUserId: string;
let noCapUserId: string;
let orgId: string;
const orgToken = "bvax-test-org";

// Tokens for our test pets.
const PET_TOKENS_HAPPY: string[] = Array.from(
  { length: 20 },
  (_, i) => `DIM-BVAX-H${String(i + 1).padStart(3, "0")}`,
);
const PET_TOKENS_SCALE: string[] = Array.from(
  { length: 200 },
  (_, i) => `DIM-BVAX-S${String(i + 1).padStart(3, "0")}`,
);
// Partial: first 3 in custody, last 2 NOT.
const PET_TOKENS_PARTIAL_GOOD = ["DIM-BVAX-PG01", "DIM-BVAX-PG02", "DIM-BVAX-PG03"];
const PET_TOKENS_PARTIAL_BAD = ["DIM-BVAX-PB01", "DIM-BVAX-PB02"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const displayName = email.split("@")[0];
  const orphans = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.displayName, displayName));
  const ids = [
    ...(found ? [found.id] : []),
    ...orphans.map((o) => o.id).filter((id) => id !== found?.id),
  ];
  await withMutationOverride(async (tx) => {
    for (const uid of ids) {
      await tx.delete(organizationMemberships).where(eq(organizationMemberships.userId, uid));
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }
  });
  if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
}

async function purgeTestPetsByTokens(tokens: string[]) {
  if (tokens.length === 0) return;
  await withMutationOverride(async (tx) => {
    for (const token of tokens) {
      const rows = await tx.select({ id: pets.id }).from(pets).where(eq(pets.publicToken, token));
      for (const { id } of rows) {
        await tx.delete(reminders).where(eq(reminders.petId, id));
        await tx.delete(ownerships).where(eq(ownerships.petId, id));
        await tx.delete(pets).where(eq(pets.id, id));
      }
    }
  });
}

async function createTestPetInCustody(token: string, petOrgId: string): Promise<string> {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      species: "dog",
      name: `Test ${token}`,
      sex: "unknown",
      status: "active",
    })
    .returning({ id: pets.id });
  await db.insert(ownerships).values({
    petId: pet!.id,
    ownerOrganizationId: petOrgId,
    role: "shelter_custody",
  });
  return pet!.id;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const allTokens = [
    ...PET_TOKENS_HAPPY,
    ...PET_TOKENS_SCALE,
    ...PET_TOKENS_PARTIAL_GOOD,
    ...PET_TOKENS_PARTIAL_BAD,
  ];
  await purgeTestPetsByTokens(allTokens);
  await purgeUserByEmail(COORD_EMAIL);
  await purgeUserByEmail(NO_CAP_EMAIL);
  // Remove stale org.
  await db
    .delete(organizations)
    .where(eq(organizations.publicToken, orgToken))
    .catch(() => null);

  // Create coordinator user.
  const { data: coordData } = await supabaseAdmin.auth.admin.createUser({
    email: COORD_EMAIL,
    password: PASS,
    email_confirm: true,
    user_metadata: { displayName: "bulk-vax-coord" },
  });
  coordUserId = coordData.user!.id;

  // Create no-cap user.
  const { data: noCapData } = await supabaseAdmin.auth.admin.createUser({
    email: NO_CAP_EMAIL,
    password: PASS,
    email_confirm: true,
    user_metadata: { displayName: "bulk-vax-nocap" },
  });
  noCapUserId = noCapData.user!.id;

  // Ensure profile rows exist (trigger should create them; insert if missing).
  const [coordProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, coordUserId));
  if (!coordProfile) {
    await db.insert(profiles).values({ id: coordUserId, displayName: "bulk-vax-coord" });
  }
  const [noCapProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, noCapUserId));
  if (!noCapProfile) {
    await db.insert(profiles).values({ id: noCapUserId, displayName: "bulk-vax-nocap" });
  }

  // Create org.
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: orgToken,
      legalName: "Bulk Vax Test Org",
      displayName: "Bulk Vax Test Org",
      orgType: "shelter",
      email: "bvax@dim-test.local",
    })
    .returning({ id: organizations.id });
  orgId = org!.id;

  // Coordinator membership (role=coordinator) with explicit event.write grant.
  const [coordMembership] = await db
    .insert(organizationMemberships)
    .values({
      organizationId: orgId,
      userId: coordUserId,
      role: "coordinator",
    })
    .returning({ id: organizationMemberships.id });

  await db.insert(organizationCapabilityGrants).values({
    membershipId: coordMembership!.id,
    organizationId: orgId,
    capability: "event.write",
    status: "approved",
    decidedAt: new Date(),
    decidedByUserId: coordUserId,
  });

  // No-cap user membership (no event.write grant).
  await db.insert(organizationMemberships).values({
    organizationId: orgId,
    userId: noCapUserId,
    role: "member",
  });

  // Create test pets in custody.
  for (const token of PET_TOKENS_HAPPY) {
    await createTestPetInCustody(token, orgId);
  }
  for (const token of PET_TOKENS_SCALE) {
    await createTestPetInCustody(token, orgId);
  }
  for (const token of PET_TOKENS_PARTIAL_GOOD) {
    await createTestPetInCustody(token, orgId);
  }
  // PET_TOKENS_PARTIAL_BAD are intentionally NOT created in custody.
}, 180_000);

afterAll(async () => {
  const allTokens = [
    ...PET_TOKENS_HAPPY,
    ...PET_TOKENS_SCALE,
    ...PET_TOKENS_PARTIAL_GOOD,
    ...PET_TOKENS_PARTIAL_BAD,
  ];
  await purgeTestPetsByTokens(allTokens);

  if (orgId) {
    // Grants and memberships cascade on org delete via FK, but let's be explicit.
    await db
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }

  await purgeUserByEmail(COORD_EMAIL);
  await purgeUserByEmail(NO_CAP_EMAIL);
}, 120_000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("bulkVaccinateAction", () => {
  it("happy path: 20 pets all succeed, events written with shared payload", async () => {
    mockSessionAs(coordUserId);

    const result = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: PET_TOKENS_HAPPY,
      vaccineName: "Cuádruple canina",
      occurredAt: "2026-06-01",
      brand: "Nobivac",
      batch: "L-2026-A",
      administeredBy: "Dr. Test",
      nextDueAt: null,
    });

    expect(result.succeeded).toHaveLength(20);
    expect(result.failed).toHaveLength(0);
    expect(result.bulkActionId).toBeTruthy();

    // Verify an event was actually written for the first token.
    const [firstPet] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKENS_HAPPY[0]!));
    expect(firstPet).toBeTruthy();

    const evts = await db
      .select()
      .from(petEvents)
      .where(
        and(eq(petEvents.petId, firstPet!.id), eq(petEvents.eventType, "vaccination_administered")),
      );
    expect(evts).toHaveLength(1);

    const payload = evts[0]!.payload as Record<string, unknown>;
    expect(payload.vaccine_name).toBe("Cuádruple canina");
    expect(payload.brand).toBe("Nobivac");
    expect(payload.batch).toBe("L-2026-A");
    expect(evts[0]!.authorRole).toBe("shelter");
    expect(evts[0]!.authorOrganizationId).toBe(orgId);
    expect(evts[0]!.clientIdempotencyKey).toBe(`bulk-${result.bulkActionId}-${firstPet!.id}`);
  }, 60_000);

  it("partial failure: tokens not in custody → failed[], the rest succeed", async () => {
    mockSessionAs(coordUserId);

    const allTokens = [...PET_TOKENS_PARTIAL_GOOD, ...PET_TOKENS_PARTIAL_BAD];

    const result = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: allTokens,
      vaccineName: "Triple felina",
      occurredAt: "2026-06-02",
    });

    expect(result.succeeded).toHaveLength(PET_TOKENS_PARTIAL_GOOD.length);
    expect(result.failed).toHaveLength(PET_TOKENS_PARTIAL_BAD.length);

    for (const token of PET_TOKENS_PARTIAL_BAD) {
      const entry = result.failed.find((f) => f.id === token);
      expect(entry).toBeTruthy();
      expect(entry!.reason).toContain("custodia");
    }

    for (const token of PET_TOKENS_PARTIAL_GOOD) {
      expect(result.succeeded).toContain(token);
    }
  }, 30_000);

  it("idempotency: re-run with same bulkActionId → no duplicate events, same succeeded set", async () => {
    mockSessionAs(coordUserId);

    const tokens = PET_TOKENS_HAPPY.slice(0, 5);
    const bulkActionId = "aaaabbbb-cccc-4ddd-8eee-ffffffffffff";

    const result1 = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: tokens,
      vaccineName: "Rabia test",
      occurredAt: "2026-06-03",
      bulkActionId,
    });

    const result2 = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: tokens,
      vaccineName: "Rabia test",
      occurredAt: "2026-06-03",
      bulkActionId,
    });

    // Both runs report the same succeeded tokens.
    expect([...result1.succeeded].sort()).toEqual([...result2.succeeded].sort());
    expect(result2.failed).toHaveLength(0);

    // No duplicate events — exactly 1 event per pet for this idempotency key.
    for (const token of tokens) {
      const [p] = await db.select({ id: pets.id }).from(pets).where(eq(pets.publicToken, token));
      const key = `bulk-${bulkActionId}-${p!.id}`;
      const evts = await db.select().from(petEvents).where(eq(petEvents.clientIdempotencyKey, key));
      expect(evts).toHaveLength(1);
    }
  }, 30_000);

  it("auth: no event.write capability → all tokens rejected", async () => {
    mockSessionAs(noCapUserId);

    const result = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: PET_TOKENS_HAPPY.slice(0, 3),
      vaccineName: "Some vaccine",
      occurredAt: "2026-06-04",
    });

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(3);
    for (const f of result.failed) {
      expect(f.reason).toBeTruthy();
    }
  }, 10_000);

  it("scale: 200-pet batch completes with all 200 succeeded", async () => {
    mockSessionAs(coordUserId);

    const result = await bulkVaccinateAction({
      orgToken,
      petPublicTokens: PET_TOKENS_SCALE,
      vaccineName: "Vacuna masiva",
      occurredAt: "2026-06-05",
    });

    expect(result.succeeded).toHaveLength(200);
    expect(result.failed).toHaveLength(0);
  }, 300_000); // 5-min ceiling — correct semantics, no hard wall-time assertion
});
