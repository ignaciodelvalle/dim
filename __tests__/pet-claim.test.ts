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

// Evidence upload — the dispute writer now REQUIRES at least one attachment
// (PO 2026-07-30), so every success path below has to hand it a real File. The
// bucket leg is stubbed: uploadWelfareEvidence talks to Supabase Storage over
// the network and re-encodes rasters through sharp, neither of which is under
// test here. What the stub preserves is the shape the writer consumes, so the
// attachments-row insert still runs against the real database and can be
// asserted (it never was before — the old tests passed `[]` and skipped it).
const { mockUploadWelfareEvidence, mockRemoveWelfareEvidence } = vi.hoisted(() => ({
  mockUploadWelfareEvidence: vi.fn(),
  mockRemoveWelfareEvidence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/welfare-uploads", () => ({
  uploadWelfareEvidence: (reportId: string, files: File[]) =>
    mockUploadWelfareEvidence(reportId, files),
  removeWelfareEvidence: (paths: string[]) => mockRemoveWelfareEvidence(paths),
}));

import { submitClaimDisputeAction, submitFreeClaimAction } from "@/app/actions/pet-claim";
import {
  attachments,
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

// Distinct 15-digit chips per dispute scenario. The dispute writer resolves the
// pet FROM the chip, so every scenario needs its own or they collide on the
// active-status partial unique index.
const DISPUTE_OK_CHIP = "900000000000101";
const DISPUTE_SHORT_CHIP = "900000000000102";
const DISPUTE_SELF_CHIP = "900000000000103";
const DISPUTE_DUP_CHIP = "900000000000104";
const VICTIM_CHIP = "900000000000105";
const BYSTANDER_CHIP = "900000000000106";

// A non-empty File — the dispute writer's evidence gate counts only entries
// with size > 0, so a zero-byte placeholder would (correctly) not satisfy it.
function evidenceFile(name = "chip.jpg"): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], name, { type: "image/jpeg" });
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
      // attachments reference pet_events(event_id) — drop them before the
      // events, or the raw DELETE below trips the FK.
      await tx.delete(attachments).where(eq(attachments.petId, petId));
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
  mockRemoveWelfareEvidence.mockClear();
  // Echo back one stored object per file handed in, so the attachments insert
  // downstream reflects what the writer actually decided to store.
  mockUploadWelfareEvidence.mockReset();
  mockUploadWelfareEvidence.mockImplementation(async (reportId: string, files: File[]) => {
    const uploaded = files.map((f, i) => ({
      storagePath: `${reportId}/${i}-${f.name}`,
      mimeType: f.type,
      fileSize: f.size,
      originalFilename: f.name,
    }));
    return { error: null, uploaded, uploadedPaths: uploaded.map((u) => u.storagePath) };
  });
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
//
// EVERY call below used to pass `files: []` and four of them asserted SUCCESS
// on it — the happy path, the first leg of the duplicate-dispute test, the
// wrong-chip resolution test and the authorRole test. Read together they
// pinned "a custody dispute opens with zero proof" as the contract, which is
// what the writer did and what the PO decided on 2026-07-30 it must stop
// doing. They were not testing evidence — they were testing the dispute
// mechanics, and `[]` was the cheapest literal to write — but a passing suite
// is a claim about behaviour regardless of intent, and this one certified a
// permanent accusation against a third party as free. They now hand the writer
// a real attachment, which also makes each one isolate its own rule instead of
// riding on a gate that did not exist. The evidence rule itself is pinned in
// its own describe at the bottom of this file.

describe("submitClaimDisputeAction", () => {
  it("raises a dispute: custody_dispute row + raising event + parties + audit + owner flag", async () => {
    const token = "DIM-DISPUTE-OK-1";
    const petId = await insertOwnedPet(token, "Disputado", ownerUserId);
    mockSessionAs(claimantUserId);

    await addMicrochip(petId, DISPUTE_OK_CHIP);
    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: DISPUTE_OK_CHIP,
        reason: "Es mi perro, lo perdí hace dos meses y lo reconozco.",
      },
      [evidenceFile()],
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
    const petId = await insertOwnedPet(token, "Razon Corta", ownerUserId);
    await addMicrochip(petId, DISPUTE_SHORT_CHIP);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      { identifierKind: "microchip", identifierValue: DISPUTE_SHORT_CHIP, reason: "mía" },
      [evidenceFile()],
    );
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("al menos 20 caracteres");
  });

  it("rejects when the claimant is already the registered owner", async () => {
    const token = "DIM-DISPUTE-SELF";
    const petId = await insertOwnedPet(token, "Ya Es Mío", claimantUserId);
    await addMicrochip(petId, DISPUTE_SELF_CHIP);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: DISPUTE_SELF_CHIP,
        reason: "Quiero reclamar mi propia mascota registrada acá.",
      },
      [evidenceFile()],
    );
    expect(result).toEqual({ error: "Esta mascota ya está registrada a tu nombre." });
  });

  it("rejects raising a second dispute while one is already open", async () => {
    const token = "DIM-DISPUTE-DUP";
    const petId = await insertOwnedPet(token, "Doble Disputa", ownerUserId);
    await addMicrochip(petId, DISPUTE_DUP_CHIP);
    mockSessionAs(claimantUserId);

    const first = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: DISPUTE_DUP_CHIP,
        reason: "Primera disputa con motivo suficientemente largo.",
      },
      [evidenceFile()],
    );
    expect(first).toHaveProperty("disputeToken");

    const second = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: DISPUTE_DUP_CHIP,
        reason: "Segunda disputa con motivo suficientemente largo.",
      },
      [evidenceFile()],
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

// ---------------------------------------------------------------------------
// The denial-of-rescue attack — the private identifier is the authorization
// ---------------------------------------------------------------------------
//
// The writer used to take a caller-supplied `petToken` straight into the WHERE
// behind nothing but requireUserOrRedirect. /perdidas lists every lost animal
// with a link to /p/{token} and no login, so a free account could scrape tokens
// and dispute each one. Each raise flips pets.in_custody_dispute, which the
// public credential page reads to null out the owner's name, phone, email, the
// finder form and the sighting form — stripping the only channel by which a
// finder reaches the owner, on exactly the animals that need it.
//
// These drive the REAL action against the REAL database. The type no longer
// admits a pet token at all, so the residual runtime question is whether the
// identifier actually binds: an attacker holding a DIFFERENT pet's chip, or no
// valid chip, must not be able to touch the victim.

/** The victim's flag and spine must both be untouched. */
async function assertUntouched(petId: string) {
  const [pet] = await db
    .select({ inCustodyDispute: pets.inCustodyDispute })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);
  expect(pet?.inCustodyDispute).toBe(false);

  const raised = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_dispute_raised")));
  expect(raised).toHaveLength(0);

  const disputes = await db
    .select({ id: custodyDisputes.id })
    .from(custodyDisputes)
    .where(eq(custodyDisputes.petId, petId));
  expect(disputes).toHaveLength(0);
}

describe("dispute authorization — the identifier binds, the token is gone", () => {
  it("a chip that belongs to ANOTHER pet cannot dispute the victim", async () => {
    const victimId = await insertOwnedPet("DIM-VICTIM-XPET", "Victima", ownerUserId);
    await addMicrochip(victimId, VICTIM_CHIP);
    const bystanderId = await insertOwnedPet("DIM-BYSTANDER-1", "Ajena", ownerUserId);
    await addMicrochip(bystanderId, BYSTANDER_CHIP);
    mockSessionAs(claimantUserId);

    // The attacker holds the victim's public token (harvested from /perdidas)
    // but only a DIFFERENT animal's chip. The request can only ever name the
    // animal the chip resolves to.
    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: BYSTANDER_CHIP,
        reason: "Intento apuntar a la victima usando el chip de otro animal.",
      },
      [evidenceFile()],
    );

    // It resolved to the bystander, never to the victim.
    expect(result).toHaveProperty("petToken");
    expect((result as { petToken: string }).petToken).toBe("DIM-BYSTANDER-1");
    await assertUntouched(victimId);
  });

  it("an unknown chip disputes nothing at all", async () => {
    const victimId = await insertOwnedPet("DIM-VICTIM-NOCHIP", "Victima2", ownerUserId);
    await addMicrochip(victimId, "900000000000107");
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: "900000000000999",
        reason: "Un chip que no existe no puede disputar ninguna mascota.",
      },
      [evidenceFile()],
    );

    expect(result).toEqual({ error: "No encontramos la mascota." });
    await assertUntouched(victimId);
  });

  it("an empty identifier is rejected before anything is written", async () => {
    const victimId = await insertOwnedPet("DIM-VICTIM-EMPTY", "Victima3", ownerUserId);
    await addMicrochip(victimId, "900000000000108");
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: "   ",
        reason: "Sin identificador no se puede abrir ninguna disputa.",
      },
      [evidenceFile()],
    );

    // Pin the EMPTY-value message specifically, not just "some error". Dropping
    // the `if (!identifierValue)` guard is otherwise a behaviour-preserving
    // mutation: whitespace trims to "" and the 15-digit pattern rejects it a
    // line later, so the security property (nothing written) survives either
    // way. What the guard actually buys is the better message — asking for the
    // number rather than complaining about its length — so that is what this
    // asserts. assertUntouched below still pins the security property itself.
    expect(result).toEqual({
      error: "Ingresá el número de microchip o el código del tatuaje.",
    });
    await assertUntouched(victimId);
  });

  it("an empty TATTOO identifier is rejected too — no pattern check backs that kind up", async () => {
    const victimId = await insertOwnedPet("DIM-VICTIM-EMPTYTAT", "Victima5", ownerUserId);
    await addMicrochip(victimId, "900000000000111");
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "tattoo",
        identifierValue: "",
        reason: "Un tatuaje vacio tampoco puede abrir una disputa.",
      },
      [evidenceFile()],
    );

    expect(result).toEqual({
      error: "Ingresá el número de microchip o el código del tatuaje.",
    });
    await assertUntouched(victimId);
  });

  it("a retired (replaced) chip no longer authorizes a dispute", async () => {
    const victimId = await insertOwnedPet("DIM-VICTIM-RETIRED", "Victima4", ownerUserId);
    const retired = "900000000000109";
    await db.insert(petIdentifications).values({
      petId: victimId,
      kind: "microchip_iso",
      code: retired,
      recordedAt: TODAY,
      status: "replaced",
    });
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: retired,
        reason: "Un chip dado de baja no debe seguir habilitando la disputa.",
      },
      [evidenceFile()],
    );

    expect(result).toEqual({ error: "No encontramos la mascota." });
    await assertUntouched(victimId);
  });

  it("signs the raising event authorRole=finder — the claimant is NOT the owner", async () => {
    const petId = await insertOwnedPet("DIM-DISPUTE-ROLE", "Atribucion", ownerUserId);
    const chip = "900000000000110";
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: chip,
        reason: "La atribucion del evento debe decir la verdad sobre quien escribe.",
      },
      [evidenceFile()],
    );
    expect(result).toHaveProperty("disputeToken");

    // The guard above this insert refuses when the claimant IS the registered
    // owner, so reaching the insert proves they are not. The timeline renders
    // author_role verbatim as "Dueño/a" — signing it "owner" showed the real
    // owner an accusation against themselves apparently written by themselves.
    // Append-only (invariant #2): a false attribution cannot be edited later.
    const [evt] = await db
      .select({ authorRole: petEvents.authorRole, recordedByUserId: petEvents.recordedByUserId })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_dispute_raised")))
      .limit(1);
    expect(evt.recordedByUserId).toBe(claimantUserId);
    expect(evt.authorRole).toBe("finder");
    expect(evt.authorRole).not.toBe("owner");
  });
});

// ---------------------------------------------------------------------------
// The evidence gate — a permanent accusation is not free (PO 2026-07-30)
// ---------------------------------------------------------------------------
//
// The identifier binding (above) killed bulk abuse against arbitrary animals.
// It does not touch the cost of ONE dispute against the one animal whose chip
// the claimant knows — a vet, a shelter volunteer, a previous fosterer or the
// person who sold the animal all know that number. For that pet the writer
// still accepted 20 characters of prose and nothing else, and produced: an
// accusatory notification to the registered owner, an uneditable
// custody_dispute_raised row on their spine, in_custody_dispute=true (which
// strips their contact channel off the public credential) and a case the local
// authority has to adjudicate. At least one attachment is the floor, and it is
// enforced HERE — the wizard's `required` is a browser courtesy, this action is
// independently addressable.

describe("dispute evidence gate — the accusation needs proof", () => {
  const NO_EVIDENCE_ERROR =
    "Adjuntá al menos una foto o un video como prueba. Una disputa le avisa a la persona registrada como dueña y queda asentada de forma permanente, así que la autoridad necesita ver algo concreto para poder revisarla.";

  it("refuses a dispute with zero attachments — nothing written, no rate-limit budget spent", async () => {
    const petId = await insertOwnedPet("DIM-DISPUTE-NOEV", "Sin Prueba", ownerUserId);
    const chip = "900000000000112";
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: chip,
        reason: "Es mi perro y lo reconozco perfectamente por la mancha del lomo.",
      },
      [],
    );

    // Pin the MESSAGE, not merely "some error". A `toHaveProperty("error")`
    // here would be satisfied by every other rejection in this writer — the
    // reason gate, the identifier gate, "no encontramos la mascota" — so it
    // would survive deleting the evidence gate entirely.
    expect(result).toEqual({ error: NO_EVIDENCE_ERROR });

    // The gate sits BEFORE enforceRateLimit, matching the convention the rest
    // of this codebase follows: a submission rejected on validation alone must
    // not burn the caller's budget and block their corrected retry.
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();

    // And nothing was uploaded — the gate runs before the bucket is touched.
    expect(mockUploadWelfareEvidence).not.toHaveBeenCalled();

    await assertUntouched(petId);
  });

  it("a zero-byte file does not count as evidence", async () => {
    const petId = await insertOwnedPet("DIM-DISPUTE-EMPTYF", "Archivo Vacio", ownerUserId);
    const chip = "900000000000113";
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    // An <input type="file"> that was touched and cleared, or a client that
    // appends a placeholder, submits a File with size 0. uploadWelfareEvidence
    // filters those out downstream, so counting raw `files.length` would open
    // the dispute and then store nothing — the exact state the gate exists to
    // prevent.
    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: chip,
        reason: "Un archivo vacio no prueba nada y no debe alcanzar para acusar.",
      },
      [new File([], "vacio.jpg", { type: "image/jpeg" })],
    );

    expect(result).toEqual({ error: NO_EVIDENCE_ERROR });
    await assertUntouched(petId);
  });

  it("one real attachment opens the dispute AND is stored against the raising event", async () => {
    const petId = await insertOwnedPet("DIM-DISPUTE-WITHEV", "Con Prueba", ownerUserId);
    const chip = "900000000000114";
    await addMicrochip(petId, chip);
    mockSessionAs(claimantUserId);

    const result = await submitClaimDisputeAction(
      {
        identifierKind: "microchip",
        identifierValue: chip,
        reason: "Adjunto la foto del chip escaneado en la veterinaria del barrio.",
      },
      [evidenceFile("chip-escaneado.jpg")],
    );
    expect(result).toHaveProperty("disputeToken");

    // The gate is a floor, not a wall: with proof the dispute still opens.
    const [pet] = await db
      .select({ inCustodyDispute: pets.inCustodyDispute })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1);
    expect(pet?.inCustodyDispute).toBe(true);

    // The evidence has to reach the authority, not just satisfy a counter:
    // it lands on the attachments table linked to the raising event, which is
    // what the case surfaces render.
    const [raisingEvent] = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "custody_dispute_raised")))
      .limit(1);
    const rows = await db
      .select({ eventId: attachments.eventId, storagePath: attachments.storagePath })
      .from(attachments)
      .where(eq(attachments.petId, petId));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe(raisingEvent.id);
    expect(rows[0].storagePath).toContain("chip-escaneado.jpg");
  });
});
