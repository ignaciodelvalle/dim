// PO-4 (2026-08-05) — an erased subject's pet stops resolving publicly.
//
// Erasure (Ley 25.326 art. 16) soft-deletes the pets in the subject's custody:
// `erase_subject_data` sets `pets.deleted_at` and leaves the row in place so
// the append-only spine survives. Every public surface, though, resolved the
// token with a bare `eq(pets.public_token, …)`, so the credential kept
// answering anyone who scanned the QR. The physical chapa (/t/[serial] → 307
// → /p) made that pre-existing behavior reachable from a durable object.
//
// The three things this file proves, against the REAL RPC and a real DB:
//
//   1. The erasure soft-deletes the pet still in the subject's custody and
//      does NOT touch a pet transferred away BEFORE the erasure. That
//      asymmetry is the whole PO-4 decision: the credential belongs to the
//      ANIMAL (invariant #1), so it goes dark only when the animal's own row
//      is erased — never because a previous owner exercised their rights.
//   2. `publicPetByToken` — the one predicate every ungated public surface now
//      resolves through — drops the erased pet and keeps the transferred one.
//   3. `lookupTagBySerial` returns NO destination for an ACTIVE chapa whose
//      pet was erased, so /t/[serial] can render its honest neutral state
//      instead of 307-ing a person in the street into a 404.
//
// The page-level side of (3) — what the scanner actually reads — lives in
// tag-resolver-page.test.tsx, which drives the resolver's four-state matrix
// over a mocked lookup.
//
// The static sweep at the bottom is the fence that matters most: the failure
// mode here is a NEW public route that simply forgets the filter, and a
// forgotten filter looks exactly like a present one until someone scans a
// token that should be gone.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petTags, pets, profiles } from "@/db";
import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
import { generateTagActivationCode, generateTagSerial } from "@/lib/infra/publicToken";
import { lookupTagBySerial } from "@/lib/infra/tag-lookup";
import { hashTagActivationCode } from "@/lib/utils/tag-code-hash";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const PASS = "SoftDelete_2026!";

const ERASED_EMAIL = "po4-erased@dim-test.local";
const KEEPER_EMAIL = "po4-keeper@dim-test.local";

const TOKEN_ERASED = "DIM-PO4E-RASE";
const TOKEN_MOVED = "DIM-PO4M-OVED";
const TEST_LOTE = "TEST-LOTE-PO4";

const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

let erasedUserId: string;
let keeperUserId: string;
let erasedPetId: string;
let movedPetId: string;
let serialErased: string;
let serialMoved: string;

// Auth users are REUSED across runs (audit_log points back at actor_user_id
// with ON DELETE RESTRICT, so delete-and-recreate breaks on the second run —
// same reasoning as subject-rights-rpcs.test.ts).
async function ensureUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function insertPet(publicToken: string, name: string): Promise<string> {
  const [row] = await db
    .insert(pets)
    .values({ publicToken, name, species: "dog", sex: "female", status: "active" })
    .returning({ id: pets.id });
  return row.id;
}

async function activateTagFor(petId: string, userId: string): Promise<string> {
  const serial = generateTagSerial();
  await db.insert(petTags).values({
    serial,
    activationCodeHash: hashTagActivationCode(generateTagActivationCode()),
    loteId: TEST_LOTE,
    status: "active",
    petId,
    activatedByUserId: userId,
    activatedAt: new Date(),
  });
  return serial;
}

async function cleanup() {
  await db.delete(petTags).where(eq(petTags.loteId, TEST_LOTE));
  await withMutationOverride(async (tx) => {
    for (const token of [TOKEN_ERASED, TOKEN_MOVED]) {
      const stale = await tx.select({ id: pets.id }).from(pets).where(eq(pets.publicToken, token));
      for (const { id } of stale) await tx.delete(pets).where(eq(pets.id, id));
    }
  });
}

beforeAll(async () => {
  await cleanup();

  erasedUserId = await ensureUser(ERASED_EMAIL);
  keeperUserId = await ensureUser(KEEPER_EMAIL);

  // The erasure RPC is not idempotent across runs from the test's point of
  // view (it soft-deletes the profile), so reset the subject to a live state.
  await db
    .update(profiles)
    .set({ displayName: "PO4 Erased Subject", deletedAt: null, updatedAt: new Date() })
    .where(eq(profiles.id, erasedUserId));
  await db
    .update(profiles)
    .set({ displayName: "PO4 Keeper", deletedAt: null, updatedAt: new Date() })
    .where(eq(profiles.id, keeperUserId));

  // Pet 1 — still in the erasing subject's custody at erasure time.
  erasedPetId = await insertPet(TOKEN_ERASED, "PO4 Erased Pet");
  await db.insert(ownerships).values({
    petId: erasedPetId,
    ownerUserId: erasedUserId,
    role: "owner",
  });

  // Pet 2 — transferred AWAY before the erasure: the subject's ownership row
  // is closed and the keeper holds the live one.
  movedPetId = await insertPet(TOKEN_MOVED, "PO4 Moved Pet");
  await db.insert(ownerships).values({
    petId: movedPetId,
    ownerUserId: erasedUserId,
    role: "owner",
    endedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  await db.insert(ownerships).values({
    petId: movedPetId,
    ownerUserId: keeperUserId,
    role: "owner",
  });

  serialErased = await activateTagFor(erasedPetId, erasedUserId);
  serialMoved = await activateTagFor(movedPetId, keeperUserId);

  // The real thing: the subject exercises art. 16.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: erasedUserId })}, true)`,
    );
    await tx.execute(
      sql`SELECT public.erase_subject_data(${erasedUserId}::uuid, 'PO4 resolution test'::text)`,
    );
  });
}, 60_000);

afterAll(async () => {
  await cleanup();
}, 30_000);

describe("erase_subject_data — which pets go dark (PO-4)", () => {
  it("soft-deletes the pet in the subject's custody", async () => {
    const [row] = await db
      .select({ deletedAt: pets.deletedAt })
      .from(pets)
      .where(eq(pets.id, erasedPetId));
    expect(row.deletedAt).not.toBeNull();
  });

  it("leaves a pet transferred away BEFORE the erasure untouched", async () => {
    // The overreach guard. If this ever flips, an ex-owner exercising their
    // rights would switch off a credential that belongs to someone else's
    // animal — the exact scenario the PO called out when deciding PO-4.
    const [row] = await db
      .select({ deletedAt: pets.deletedAt })
      .from(pets)
      .where(eq(pets.id, movedPetId));
    expect(row.deletedAt).toBeNull();
  });
});

describe("publicPetByToken — the shared public-resolution predicate (PO-4)", () => {
  it("resolves nothing for the erased pet", async () => {
    const rows = await db.select({ id: pets.id }).from(pets).where(publicPetByToken(TOKEN_ERASED));
    expect(rows).toHaveLength(0);
  });

  it("still resolves the transferred pet", async () => {
    const rows = await db.select({ id: pets.id }).from(pets).where(publicPetByToken(TOKEN_MOVED));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(movedPetId);
  });
});

describe("/t/[serial] lookup — an active chapa never points at an erased pet (PO-4)", () => {
  it("returns the active status with NO destination for the erased pet", async () => {
    // Status stays 'active' — the chapa was never revoked, and lying about
    // that would send its owner into the activation flow. What disappears is
    // the destination, which is what stops the 307-into-404.
    const result = await lookupTagBySerial(serialErased);
    expect(result).toEqual({ status: "active", publicToken: null });
  });

  it("keeps resolving the transferred pet's chapa", async () => {
    expect(await lookupTagBySerial(serialMoved)).toEqual({
      status: "active",
      publicToken: TOKEN_MOVED,
    });
  });

  it("the pet_tags row itself is untouched by the erasure", async () => {
    const [row] = await db
      .select({ status: petTags.status, petId: petTags.petId })
      .from(petTags)
      .where(eq(petTags.serial, serialErased));
    expect(row.status).toBe("active");
    expect(row.petId).toBe(erasedPetId);
  });
});

// ---------------------------------------------------------------------------
// Static sweep — every ungated public surface resolves through the predicate.
// ---------------------------------------------------------------------------

const PUBLIC_PET_ROUTES = [
  "app/(public)/p/[publicToken]/page.tsx",
  "app/(public)/p/[publicToken]/opengraph-image.tsx",
  "app/(public)/p/[publicToken]/encontre/page.tsx",
  "app/(public)/p/[publicToken]/encontre/action.ts",
  "app/(public)/p/[publicToken]/sighting/page.tsx",
  "app/(public)/adoptar/[petToken]/page.tsx",
  "app/(public)/adoptar/[petToken]/postular/page.tsx",
  // Public-form write paths: the page that hosts each one already 404s, so
  // these close the hand-rolled-POST half.
  "src/modules/pets/application/sighting/report-pet-sighting.ts",
  "src/modules/custody-disputes/application/report-dispute-tip.ts",
] as const;

describe("public surfaces resolve pets through publicPetByToken (PO-4 sweep)", () => {
  for (const relPath of PUBLIC_PET_ROUTES) {
    it(`${relPath} never filters on publicToken by hand`, () => {
      const source = readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
      // A bare token equality is the regression: it reads as a complete
      // lookup while silently including erased pets.
      expect(source).not.toMatch(/eq\(\s*pets\.publicToken\s*,/);
      expect(source).toContain("publicPetByToken");
    });
  }
});
