// Integration tests for the transfers inbox query and countPendingTransfers.
//
// Covers:
//   1. pending-by-toOwnerId — registered recipient matched by UUID.
//   2. pending-by-email-when-toOwnerId-null — unregistered recipient matched by email.
//   3. history exclusion — non-pending rows excluded from active count.
//   4. countPendingTransfers dual-condition — both paths increment the count.
//
// Requires a live DB. Run with `pnpm test __tests__/transferencias-inbox.test.ts`.
//
// NOTE: these tests insert rows directly into petTransfers; they do NOT call
// the server actions (which require supabase auth mocks). The focus is the
// inbox predicate correctness.

import { and, eq, isNull, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petTransfers, pets, profiles } from "@/db";
import { countPendingTransfers } from "@/lib/owner-dashboard";
import { withMutationOverride } from "./_helpers/db-overrides";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PET_TOKEN = "DIM-TRX-INB-PET1";
const UNREGISTERED_EMAIL = "unregistered-trx-inbox@dim-test.local";

// PTR prefix matches the production token format (generatePrefixedToken("PTR")).
const TOKEN_RESOLVED = "PTR-inbox-test-resolved-001";
const TOKEN_UNRESOLVED = "PTR-inbox-test-unresolved-002";
const TOKEN_HISTORY = "PTR-inbox-test-history-003";

// Hardcoded UUIDs (pattern from performed-by-search.test.ts) — profiles.id has
// no FK to auth.users in the schema, so bare profiles can be inserted directly.
const SENDER_ID = "00000000-0000-0000-0000-0000000a0001";
const RECEIVER_ID = "00000000-0000-0000-0000-0000000a0002";

let petId: string;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any leftover rows from a previous run.
  await withMutationOverride(async (tx) => {
    await tx
      .delete(petTransfers)
      .where(
        or(
          eq(petTransfers.publicToken, TOKEN_RESOLVED),
          eq(petTransfers.publicToken, TOKEN_UNRESOLVED),
          eq(petTransfers.publicToken, TOKEN_HISTORY),
        ),
      );

    const stalePets = await tx
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, PET_TOKEN));
    for (const { id } of stalePets) {
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }

    await tx.delete(profiles).where(or(eq(profiles.id, SENDER_ID), eq(profiles.id, RECEIVER_ID)));
  });

  // Insert bare profiles (no auth user required — profiles.id is just a UUID PK).
  await db
    .insert(profiles)
    .values({ id: SENDER_ID, displayName: "TRX-INB-SND1" })
    .onConflictDoNothing({ target: profiles.id });

  await db
    .insert(profiles)
    .values({ id: RECEIVER_ID, displayName: "TRX-INB-RCV1" })
    .onConflictDoNothing({ target: profiles.id });

  // Insert pet.
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: PET_TOKEN,
      name: "Inbox Test Pet",
      species: "dog",
      sex: "unknown",
      potentiallyDangerousBreed: false,
    })
    .returning();
  petId = pet.id;

  await db.insert(ownerships).values({
    petId,
    ownerUserId: SENDER_ID,
    role: "owner",
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Row 1: resolved recipient (toOwnerId set) — PENDING.
  await db.insert(petTransfers).values({
    publicToken: TOKEN_RESOLVED,
    petId,
    fromOwnerId: SENDER_ID,
    toOwnerId: RECEIVER_ID,
    toOwnerEmail: "receiver-trx-inbox@dim-test.local",
    status: "pending",
    expiresAt,
  });

  // Row 2: unregistered recipient (toOwnerId NULL, email only) — PENDING.
  await db.insert(petTransfers).values({
    publicToken: TOKEN_UNRESOLVED,
    petId,
    fromOwnerId: SENDER_ID,
    toOwnerId: null,
    toOwnerEmail: UNREGISTERED_EMAIL,
    status: "pending",
    expiresAt,
  });

  // Row 3: resolved recipient — REJECTED (history, must not appear as active).
  await db.insert(petTransfers).values({
    publicToken: TOKEN_HISTORY,
    petId,
    fromOwnerId: SENDER_ID,
    toOwnerId: RECEIVER_ID,
    toOwnerEmail: "receiver-trx-inbox@dim-test.local",
    status: "rejected",
    expiresAt,
    respondedAt: new Date(),
  });
});

afterAll(async () => {
  await withMutationOverride(async (tx) => {
    await tx
      .delete(petTransfers)
      .where(
        or(
          eq(petTransfers.publicToken, TOKEN_RESOLVED),
          eq(petTransfers.publicToken, TOKEN_UNRESOLVED),
          eq(petTransfers.publicToken, TOKEN_HISTORY),
        ),
      );
    await tx.delete(ownerships).where(eq(ownerships.petId, petId));
    await tx.delete(pets).where(eq(pets.id, petId));
    await tx.delete(profiles).where(or(eq(profiles.id, SENDER_ID), eq(profiles.id, RECEIVER_ID)));
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("transfers inbox query", () => {
  it("finds pending transfer by toOwnerId (registered recipient)", async () => {
    const rows = await db
      .select({ publicToken: petTransfers.publicToken })
      .from(petTransfers)
      .where(
        and(
          eq(petTransfers.status, "pending"),
          or(
            eq(petTransfers.toOwnerId, RECEIVER_ID),
            and(
              isNull(petTransfers.toOwnerId),
              eq(petTransfers.toOwnerEmail, "receiver-trx-inbox@dim-test.local"),
            ),
          ),
        ),
      );

    const tokens = rows.map((r) => r.publicToken);
    expect(tokens).toContain(TOKEN_RESOLVED);
  });

  it("finds pending transfer by email when toOwnerId is NULL (unregistered recipient)", async () => {
    const rows = await db
      .select({ publicToken: petTransfers.publicToken })
      .from(petTransfers)
      .where(
        and(
          eq(petTransfers.status, "pending"),
          or(
            eq(petTransfers.toOwnerId, RECEIVER_ID),
            and(isNull(petTransfers.toOwnerId), eq(petTransfers.toOwnerEmail, UNREGISTERED_EMAIL)),
          ),
        ),
      );

    const tokens = rows.map((r) => r.publicToken);
    expect(tokens).toContain(TOKEN_UNRESOLVED);
  });

  it("excludes history rows from the pending query (history is not pending)", async () => {
    const rows = await db
      .select({ publicToken: petTransfers.publicToken })
      .from(petTransfers)
      .where(
        and(
          eq(petTransfers.status, "pending"),
          or(
            eq(petTransfers.toOwnerId, RECEIVER_ID),
            and(
              isNull(petTransfers.toOwnerId),
              eq(petTransfers.toOwnerEmail, "receiver-trx-inbox@dim-test.local"),
            ),
          ),
        ),
      );

    const tokens = rows.map((r) => r.publicToken);
    expect(tokens).not.toContain(TOKEN_HISTORY);
  });
});

describe("countPendingTransfers", () => {
  it("counts pending transfer matched by toOwnerId", async () => {
    // RECEIVER_ID has TOKEN_RESOLVED (pending) + TOKEN_HISTORY (rejected).
    // Only the pending one should count.
    const c = await countPendingTransfers(RECEIVER_ID, "receiver-trx-inbox@dim-test.local");
    expect(c).toBeGreaterThanOrEqual(1);
  });

  it("counts pending transfer matched by email when toOwnerId is NULL", async () => {
    // A fresh UUID that has no toOwnerId rows at all — only the email path applies.
    const ghostId = "00000000-0000-0000-0000-000000000099";
    const c = await countPendingTransfers(ghostId, UNREGISTERED_EMAIL);
    expect(c).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 for a user with no incoming pending transfers", async () => {
    const c = await countPendingTransfers(SENDER_ID, "nobody@dim-test.local");
    expect(c).toBe(0);
  });
});
