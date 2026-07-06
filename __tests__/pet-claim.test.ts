// Action-level tests for app/actions/pet-claim.ts (V1-9 coverage gap).
//
// Covers the two consequential write actions:
//   - submitFreeClaimAction       — direct ownership transfer of a "free" pet
//                                    (no active custody) via ownership_claimed.
//   - submitClaimDisputeAction    — raises a custody dispute against the active
//                                    owner of a chip/tattoo-matched pet.
//
// Strategy mirrors adoption-review.test.ts / chip-match.test.ts: real local
// Postgres + Supabase stack, ephemeral users created/torn down per file, the
// Supabase session mocked via `@/lib/supabase/server`, and the persistent
// rate limiter mocked to allow-by-default (so the success paths aren't tripped
// by leftover buckets, and the rate-limit-rejected path can be forced).

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (must be declared before importing the action) -------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Persistent rate limiter — allow by default; individual tests can force a
// throw to exercise the rate-limit-rejected branch.
const { MockRateLimitError, mockEnforceRateLimit } = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    resetAt: Date;
    reason: string;
    constructor(resetAt: Date, reason: string) {
      super(`Rate limit exceeded: ${reason}`);
      this.name = "RateLimitError";
      this.resetAt = resetAt;
      this.reason = reason;
    }
  }
  return { MockRateLimitError, mockEnforceRateLimit: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/infra/rate-limit", () => ({
  enforceRateLimit: (endpoint: string, id: string, cfg: unknown) =>
    mockEnforceRateLimit(endpoint, id, cfg),
  RateLimitError: MockRateLimitError,
}));

import { submitClaimDisputeAction, submitFreeClaimAction } from "@/app/actions/pet-claim";
import {
  auditLog,
  custodyDisputeParties,
  custodyDisputes,
  db,
  notifications,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
  profiles,
} from "@/db";
import { createClient } from "@/lib/supabase/server";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabaseAdmin = createSupabaseClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const CLAIMANT_EMAIL = "petclaim-claimant@dim-test.local";
const OWNER_EMAIL = "petclaim-owner@dim-test.local";
const PASS = "PetClaim_2026!";

let claimantUserId: string;
let ownerUserId: string;

const insertedPetIds: string[] = [];

function mockSessionAs(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: userId ? ({ id: userId } as unknown) : null },
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
  // audit_log is append-only (DELETE blocked by trigger); its actor_user_id FK
  // is ON DELETE SET NULL, so deleting the profile nulls the reference cleanly.
  await withMutationOverride(async (tx) => {
    for (const uid of ids) {
      await tx.delete(notifications).where(eq(notifications.userId, uid));
      await tx.delete(profiles).where(eq(profiles.id, uid));
    }
  });
  if (found) await supabaseAdmin.auth.admin.deleteUser(found.id);
}

// Insert a "free" pet — no owner_user_id, no active ownership row of any role.
async function insertFreePet(token: string, name: string): Promise<string> {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name,
      species: "dog",
      status: "active",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    })
    .returning({ id: pets.id });
  insertedPetIds.push(pet.id);
  return pet.id;
}

// Register a microchip identification (the private evidence a free claim now
// requires — the public token is no longer accepted server-side).
const TODAY = new Date().toISOString().slice(0, 10);
async function addMicrochip(petId: string, code: string): Promise<void> {
  await db.insert(petIdentifications).values({
    petId,
    kind: "microchip_iso",
    code,
    recordedAt: TODAY,
  });
}

// Insert a pet with an active owner — direct claim must fail, dispute is the
// path.
async function insertOwnedPet(token: string, name: string, owner: string): Promise<string> {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name,
      species: "dog",
      status: "active",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    })
    .returning({ id: pets.id });
  insertedPetIds.push(pet.id);
  // Ownership lives in the ownerships table, not on pets directly.
  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId: owner,
    role: "owner",
    startedAt: new Date(),
  });
  return pet.id;
}

beforeAll(async () => {
  await purgeUserByEmail(CLAIMANT_EMAIL);
  await purgeUserByEmail(OWNER_EMAIL);

  const c = await supabaseAdmin.auth.admin.createUser({
    email: CLAIMANT_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (c.error || !c.data.user) throw new Error(`createUser claimant: ${c.error?.message}`);
  claimantUserId = c.data.user.id;

  const o = await supabaseAdmin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (o.error || !o.data.user) throw new Error(`createUser owner: ${o.error?.message}`);
  ownerUserId = o.data.user.id;
}, 60_000);

afterAll(async () => {
  for (const petId of insertedPetIds) {
    const disputeRows = await db
      .select({ id: custodyDisputes.id })
      .from(custodyDisputes)
      .where(eq(custodyDisputes.petId, petId));
    await withMutationOverride(async (tx) => {
      await tx.delete(notifications).where(eq(notifications.relatedPetId, petId));
      // pet_events reference cases; null out case links and drop events first.
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${petId}`);
      for (const { id } of disputeRows) {
        await tx.delete(custodyDisputeParties).where(eq(custodyDisputeParties.disputeId, id));
      }
      // cases.custody_dispute_id references custodyDisputes; drop cases first.
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${petId}`);
      await tx.delete(custodyDisputes).where(eq(custodyDisputes.petId, petId));
      await tx.delete(ownerships).where(eq(ownerships.petId, petId));
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  await purgeUserByEmail(CLAIMANT_EMAIL);
  await purgeUserByEmail(OWNER_EMAIL);
});

beforeEach(() => {
  mockEnforceRateLimit.mockReset();
  mockEnforceRateLimit.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// submitFreeClaimAction
// ---------------------------------------------------------------------------

describe("submitFreeClaimAction", () => {
  it("claims a free pet: creates owner ownership + ownership_claimed event + audit row", async () => {
    const token = "DIM-CLAIM-FREE-1";
    const chip = "100000000000001";
    const petId = await insertFreePet(token, "Libre Uno");
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    const result = await submitFreeClaimAction({
      identifierKind: "microchip",
      identifierValue: chip,
    });

    expect(result).toEqual({ petToken: token, petName: "Libre Uno" });

    // Ownership row now exists for the claimant.
    const [own] = await db
      .select({ ownerUserId: ownerships.ownerUserId, role: ownerships.role })
      .from(ownerships)
      .where(and(eq(ownerships.petId, petId), isNull(ownerships.endedAt)))
      .limit(1);
    expect(own?.ownerUserId).toBe(claimantUserId);
    expect(own?.role).toBe("owner");

    // ownership_claimed event written.
    const [evt] = await db
      .select({ eventType: petEvents.eventType, payload: petEvents.payload })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "ownership_claimed")))
      .limit(1);
    expect(evt).toBeDefined();
    expect((evt.payload as { claimed_by_user_id: string }).claimed_by_user_id).toBe(claimantUserId);
    expect((evt.payload as { identifier_kind: string }).identifier_kind).toBe("microchip");

    // Audit row written.
    const [audit] = await db
      .select({ action: auditLog.action, payload: auditLog.payload })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, claimantUserId), eq(auditLog.action, "free_pet_claimed")))
      .orderBy(desc(auditLog.performedAt))
      .limit(1);
    expect(audit).toBeDefined();
    expect((audit.payload as { pet_id: string }).pet_id).toBe(petId);
  });

  it("rejects when the rate limit is exceeded", async () => {
    const token = "DIM-CLAIM-FREE-RL";
    const chip = "100000000000002";
    const petId = await insertFreePet(token, "Rate Limited");
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);
    mockEnforceRateLimit.mockRejectedValueOnce(new MockRateLimitError(new Date(), "minute"));

    const result = await submitFreeClaimAction({
      identifierKind: "microchip",
      identifierValue: chip,
    });

    expect(result).toEqual({ error: "Demasiados intentos. Probá en unos minutos." });
  });

  it("rejects claiming a pet that already has active custody (FOR UPDATE re-check)", async () => {
    const token = "DIM-CLAIM-OWNED-1";
    const chip = "100000000000003";
    const petId = await insertOwnedPet(token, "Ya Tiene Dueño", ownerUserId);
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    const result = await submitFreeClaimAction({
      identifierKind: "microchip",
      identifierValue: chip,
    });

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("custodia activa");

    // No second ownership row was created for the claimant.
    const claimantRows = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(and(eq(ownerships.petId, petId), eq(ownerships.ownerUserId, claimantUserId)));
    expect(claimantRows).toHaveLength(0);
  });

  // EVIDENCE GATE (audit 26-#6). Knowing a pet's PUBLIC token is NOT enough to
  // claim it — the writer resolves the pet from the PRIVATE identifier value and
  // never trusts a caller-supplied token. An unknown identifier resolves to
  // nothing and the claim is rejected, even for a real free pet.
  it("rejects a claim when the identifier value does not resolve to any pet", async () => {
    const token = "DIM-CLAIM-NOEVIDENCE";
    await insertFreePet(token, "Sin Evidencia");
    // No microchip registered → the free pet exists but the bare token is useless.
    mockSessionAs(claimantUserId);

    const result = await submitFreeClaimAction({
      identifierKind: "microchip",
      identifierValue: "199999999999999",
    });
    expect(result).toEqual({ error: "No encontramos la mascota." });

    // The pet was NOT claimed — no ownership row exists for the claimant.
    const [pet] = await db.select({ id: pets.id }).from(pets).where(eq(pets.publicToken, token));
    const rows = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(and(eq(ownerships.petId, pet.id), eq(ownerships.ownerUserId, claimantUserId)));
    expect(rows).toHaveLength(0);
  });

  it("rejects a microchip that is not exactly 15 digits before any lookup", async () => {
    mockSessionAs(claimantUserId);
    const result = await submitFreeClaimAction({
      identifierKind: "microchip",
      identifierValue: "12345",
    });
    expect(result).toEqual({ error: "El microchip debe tener exactamente 15 dígitos." });
  });
});

// ---------------------------------------------------------------------------
// submitClaimDisputeAction
// ---------------------------------------------------------------------------

describe("submitClaimDisputeAction", () => {
  it("raises a dispute: custody_dispute row + raising event + parties + audit + owner flag", async () => {
    const token = "DIM-DISPUTE-OK-1";
    const petId = await insertOwnedPet(token, "Disputado", ownerUserId);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      { petToken: token, reason: "Es mi perro, lo perdí hace dos meses y lo reconozco." },
      [],
    );

    expect(result).toHaveProperty("disputeToken");
    const disputeToken = (result as { disputeToken: string }).disputeToken;
    expect(disputeToken.startsWith("DIS")).toBe(true);

    // Dispute row open, pet flagged.
    const [dispute] = await db
      .select({ id: custodyDisputes.id, status: custodyDisputes.status })
      .from(custodyDisputes)
      .where(eq(custodyDisputes.publicToken, disputeToken))
      .limit(1);
    expect(dispute?.status).toBe("open");

    const [pet] = await db
      .select({ inCustodyDispute: pets.inCustodyDispute })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    expect(pet?.inCustodyDispute).toBe(true);

    // Raising event written with raised_by_role=owner.
    const [evt] = await db
      .select({ payload: petEvents.payload })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_dispute_raised")))
      .limit(1);
    expect((evt.payload as { raised_by_role: string }).raised_by_role).toBe("owner");

    // Both initial parties registered.
    const parties = await db
      .select({ role: custodyDisputeParties.partyRole })
      .from(custodyDisputeParties)
      .where(eq(custodyDisputeParties.disputeId, dispute.id));
    const roles = parties.map((p) => p.role).sort();
    expect(roles).toEqual(["claimant_owner", "current_owner"]);

    // Audit row.
    const [audit] = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, claimantUserId),
          eq(auditLog.action, "claim_dispute_submitted"),
        ),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(1);
    expect((audit.payload as { dispute_public_token: string }).dispute_public_token).toBe(
      disputeToken,
    );
  });

  it("rejects a reason shorter than 20 characters", async () => {
    const token = "DIM-DISPUTE-SHORT";
    await insertOwnedPet(token, "Razon Corta", ownerUserId);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction({ petToken: token, reason: "mía" }, []);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("al menos 20 caracteres");
  });

  it("rejects when the claimant is already the registered owner", async () => {
    const token = "DIM-DISPUTE-SELF";
    await insertOwnedPet(token, "Ya Es Mío", claimantUserId);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      { petToken: token, reason: "Quiero reclamar mi propia mascota registrada acá." },
      [],
    );
    expect(result).toEqual({ error: "Esta mascota ya está registrada a tu nombre." });
  });

  it("rejects raising a second dispute while one is already open", async () => {
    const token = "DIM-DISPUTE-DUP";
    const petId = await insertOwnedPet(token, "Doble Disputa", ownerUserId);
    mockSessionAs(claimantUserId);

    const first = await submitClaimDisputeAction(
      { petToken: token, reason: "Primera disputa con motivo suficientemente largo." },
      [],
    );
    expect(first).toHaveProperty("disputeToken");

    const second = await submitClaimDisputeAction(
      { petToken: token, reason: "Segunda disputa con motivo suficientemente largo." },
      [],
    );
    expect(second).toHaveProperty("error");
    expect((second as { error: string }).error).toContain("disputa abierta");

    // Still exactly one dispute row for this pet.
    const disputes = await db
      .select({ id: custodyDisputes.id })
      .from(custodyDisputes)
      .where(eq(custodyDisputes.petId, petId));
    expect(disputes).toHaveLength(1);
  });
});
