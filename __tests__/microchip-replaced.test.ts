// Integration tests for replaceMicrochipForUser (app/actions/microchip.ts).
//
// Fixture pattern: admin-SDK user creation, pets + ownerships inserted directly
// (mirrors notifications.test.ts and migrate-vets-to-clinics.test.ts).
// withMutationOverride used for cleanup that cascades into pet_events.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { replaceMicrochipForUser } from "@/app/actions/microchip";
import {
  auditLog,
  cases,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
  profiles,
} from "@/db";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Test users
// ---------------------------------------------------------------------------

const OWNER_EMAIL = "microchip-owner@dim-test.local";
const VET_EMAIL = "microchip-vet@dim-test.local";
const PASS = "MicrochipTest_2026!";

// Stable chip numbers so tests don't collide with each other.
const CHIP_ORIGINAL = "999000000000001";
const CHIP_REPLACEMENT = "999000000000002";
const CHIP_DUPLICATE_TARGET = "999000000000003";

let ownerUserId: string;
let vetUserId: string;
let vetOrgId: string;

// Primary pet owned by ownerUser, held in custody by vetOrg.
let primaryPetId: string;
// Secondary pet — seeded with the same chip for duplicate-scan tests.
let duplicatePetId: string;

async function purgeUser(email: string) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === email);
  if (!found) return;
  const owned = await db
    .select({ petId: ownerships.petId })
    .from(ownerships)
    .where(eq(ownerships.ownerUserId, found.id));
  await withMutationOverride(async (tx) => {
    for (const { petId } of owned) await tx.delete(pets).where(eq(pets.id, petId));
  });
  await admin.auth.admin.deleteUser(found.id);
}

beforeAll(async () => {
  // Purge any leftover fixtures from previous runs.
  await purgeUser(OWNER_EMAIL);
  await purgeUser(VET_EMAIL);
  // Clean up stale canonical rows for our test chip numbers (ARCH-S: legacy column dropped).
  await withMutationOverride(async (tx) => {
    await tx.execute(
      sql`DELETE FROM pet_identifications WHERE code IN (${CHIP_ORIGINAL}, ${CHIP_REPLACEMENT}, ${CHIP_DUPLICATE_TARGET}) AND kind = 'microchip_iso'`,
    );
  });
  // Clean up vet org.
  await db.delete(organizations).where(eq(organizations.email, "microchip-vet-org@dim-test.local"));

  // Create owner user.
  const { data: ownerData, error: ownerErr } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (ownerErr || !ownerData.user) throw new Error(`createUser owner: ${ownerErr?.message}`);
  ownerUserId = ownerData.user.id;

  // Create vet user.
  const { data: vetData, error: vetErr } = await admin.auth.admin.createUser({
    email: VET_EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (vetErr || !vetData.user) throw new Error(`createUser vet: ${vetErr?.message}`);
  vetUserId = vetData.user.id;

  // Promote vet profile to role=vet. Use a unique matricula keyed to the user
  // so re-runs after partial teardown don't hit the unique constraint.
  await db
    .update(profiles)
    .set({
      role: "vet",
      matriculaNumber: `MN-MC-${vetUserId.slice(0, 8)}`,
      matriculaVerified: true,
    })
    .where(eq(profiles.id, vetUserId));

  // Create the vet's organization and add vet as member.
  const [org] = await db
    .insert(organizations)
    .values({
      publicToken: `MC-VET-ORG-${vetUserId.slice(0, 6).toUpperCase()}`,
      legalName: "Clinica Microchip Test SRL",
      displayName: "Clinica Microchip Test",
      orgType: "clinic",
      email: "microchip-vet-org@dim-test.local",
      verified: true,
    })
    .returning();
  vetOrgId = org.id;

  await db.insert(organizationMemberships).values({
    organizationId: vetOrgId,
    userId: vetUserId,
    role: "vet_individual",
  });

  // Create the primary pet. ARCH-S: legacy pets.microchipId dropped — chip seeded
  // via pet_identifications canonical row below.
  const [primaryPet] = await db
    .insert(pets)
    .values({
      publicToken: `MC-PRI-${Date.now()}`,
      name: "Chip Primary",
      species: "dog",
      sex: "male",
      status: "active",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    })
    .returning();
  primaryPetId = primaryPet.id;

  // Seed the canonical chip row that the replace action expects to flip.
  await db.insert(petIdentifications).values({
    petId: primaryPetId,
    kind: "microchip_iso",
    code: CHIP_ORIGINAL,
    recordedAt: new Date().toISOString().slice(0, 10),
    isoCountryCode: CHIP_ORIGINAL.slice(0, 3),
    isoManufacturerCode: CHIP_ORIGINAL.slice(3, 7),
    isoNationalId: CHIP_ORIGINAL.slice(7, 15),
    isoCompliant: true,
  });

  // Owner owns the primary pet.
  await db.insert(ownerships).values({
    petId: primaryPetId,
    ownerUserId,
    role: "owner",
  });

  // Vet org holds shelter_custody on the primary pet.
  await db.insert(ownerships).values({
    petId: primaryPetId,
    ownerOrganizationId: vetOrgId,
    role: "shelter_custody",
  });

  // Create the duplicate pet. ARCH-S: chip seeded via pet_identifications below.
  const [dupPet] = await db
    .insert(pets)
    .values({
      publicToken: `MC-DUP-${Date.now()}`,
      name: "Chip Duplicate",
      species: "dog",
      sex: "female",
      status: "active",
    })
    .returning();
  duplicatePetId = dupPet.id;

  // Seed canonical chip row for the duplicate pet.
  await db.insert(petIdentifications).values({
    petId: duplicatePetId,
    kind: "microchip_iso",
    code: CHIP_DUPLICATE_TARGET,
    recordedAt: new Date().toISOString().slice(0, 10),
    isoCountryCode: CHIP_DUPLICATE_TARGET.slice(0, 3),
    isoManufacturerCode: CHIP_DUPLICATE_TARGET.slice(3, 7),
    isoNationalId: CHIP_DUPLICATE_TARGET.slice(7, 15),
    isoCompliant: true,
  });
});

afterAll(async () => {
  // Guard: beforeAll may have failed mid-run leaving some IDs unset.
  if (primaryPetId) {
    await withMutationOverride(async (tx) => {
      // Raw SQL lets us cascade pet_events + cases without separate selects.
      // Cast to uuid so Postgres accepts the string literal.
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${primaryPetId}::uuid`);
      await tx.execute(sql`DELETE FROM cases WHERE primary_pet_id = ${primaryPetId}::uuid`);
      await tx.delete(ownerships).where(eq(ownerships.petId, primaryPetId));
      await tx.delete(pets).where(eq(pets.id, primaryPetId));
    });
  }

  if (duplicatePetId) {
    await withMutationOverride(async (tx) => {
      await tx.execute(sql`DELETE FROM pet_events WHERE pet_id = ${duplicatePetId}::uuid`);
      await tx.delete(ownerships).where(eq(ownerships.petId, duplicatePetId));
      await tx.delete(pets).where(eq(pets.id, duplicatePetId));
    });
  }

  if (vetOrgId) {
    await db
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, vetOrgId));
    await db.delete(organizations).where(eq(organizations.id, vetOrgId));
  }

  if (ownerUserId) await admin.auth.admin.deleteUser(ownerUserId);
  if (vetUserId) await admin.auth.admin.deleteUser(vetUserId);
});

// ---------------------------------------------------------------------------
// Helper: reset primaryPet's chip state between tests
// ---------------------------------------------------------------------------
async function resetPrimaryChip() {
  // ARCH-S: legacy pets.microchipId dropped — reset canonical row only.
  // Delete all chip rows for primaryPet and re-insert the original.
  await withMutationOverride(async (tx) => {
    await tx.execute(
      sql`DELETE FROM pet_identifications WHERE pet_id = ${primaryPetId}::uuid AND kind = 'microchip_iso'`,
    );
  });
  await db.insert(petIdentifications).values({
    petId: primaryPetId,
    kind: "microchip_iso",
    code: CHIP_ORIGINAL,
    recordedAt: new Date().toISOString().slice(0, 10),
    isoCountryCode: CHIP_ORIGINAL.slice(0, 3),
    isoManufacturerCode: CHIP_ORIGINAL.slice(3, 7),
    isoNationalId: CHIP_ORIGINAL.slice(7, 15),
    isoCompliant: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("replaceMicrochipForUser — owner emits damaged", () => {
  it("emits the event, opens no case, and flips canonical row", async () => {
    // Seed a canonical row for CHIP_ORIGINAL so the replace action has a row to flip.
    await db
      .insert(petIdentifications)
      .values({
        petId: primaryPetId,
        kind: "microchip_iso",
        code: CHIP_ORIGINAL,
        recordedAt: new Date().toISOString().slice(0, 10),
        isoCountryCode: CHIP_ORIGINAL.slice(0, 3),
        isoManufacturerCode: CHIP_ORIGINAL.slice(3, 7),
        isoNationalId: CHIP_ORIGINAL.slice(7, 15),
        isoCompliant: true,
      })
      .onConflictDoNothing();

    const result = await replaceMicrochipForUser(ownerUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "damaged",
      replacedBy: null,
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "owner" },
    });

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result) || !result.ok) throw new Error("Expected ok");

    // Event row exists.
    const [event] = await db.select().from(petEvents).where(eq(petEvents.id, result.eventId));
    expect(event.eventType).toBe("microchip_replaced");
    expect(event.caseId).toBeNull();

    // Canonical row for CHIP_ORIGINAL flipped to 'replaced'.
    const oldRows = await db
      .select({ status: petIdentifications.status })
      .from(petIdentifications)
      .where(
        and(eq(petIdentifications.petId, primaryPetId), eq(petIdentifications.code, CHIP_ORIGINAL)),
      );
    expect(oldRows[0]?.status).toBe("replaced");

    // New active canonical row for CHIP_REPLACEMENT.
    const newRows = await db
      .select({ code: petIdentifications.code, status: petIdentifications.status })
      .from(petIdentifications)
      .where(
        and(
          eq(petIdentifications.petId, primaryPetId),
          eq(petIdentifications.code, CHIP_REPLACEMENT),
          eq(petIdentifications.status, "active"),
        ),
      );
    expect(newRows).toHaveLength(1);

    // No case opened.
    expect(result.caseId).toBeNull();

    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — owner attempts fraud_detected", () => {
  it("returns an error without writing any DB rows", async () => {
    const before = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, primaryPetId), eq(petEvents.eventType, "microchip_replaced")));

    const result = await replaceMicrochipForUser(ownerUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "fraud_detected",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "owner" },
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("fraud_detected");

    // No new events.
    const after = await db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, primaryPetId), eq(petEvents.eventType, "microchip_replaced")));
    expect(after.length).toBe(before.length);
  });
});

describe("replaceMicrochipForUser — vet-in-org emits duplicate_detected", () => {
  it("opens a microchip_remediation case", async () => {
    const result = await replaceMicrochipForUser(vetUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "duplicate_detected",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "vet_in_org", organizationId: vetOrgId },
    });

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result) || !result.ok) throw new Error("Expected ok");
    expect(result.caseId).not.toBeNull();

    const [c] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, result.caseId as string));
    expect(c.caseKind).toBe("microchip_remediation");
    expect(c.status).toBe("open");

    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — cross-pet dup scan finds another pet", () => {
  it("embeds secondaryPetId in the case openedReason", async () => {
    // Close any open microchip_remediation cases for primaryPet from earlier
    // tests so the unique partial index doesn't block opening a new one.
    await db
      .update(cases)
      .set({ status: "closed", closedReason: "cancelled", closedAt: new Date() })
      .where(
        and(
          eq(cases.primaryPetId, primaryPetId),
          eq(cases.caseKind, "microchip_remediation"),
          eq(cases.status, "open"),
        ),
      );

    // ARCH-S: the duplicate scan reads from pet_identifications (status='active').
    // The unique partial index on (code) WHERE kind='microchip_iso' AND status='active'
    // prevents two active rows with the same code simultaneously.
    // To seed the dup scenario: flip primary's CHIP_ORIGINAL to 'replaced' first,
    // then insert the duplicate's row as 'active'. The scan will find duplicatePetId
    // since primary's row is no longer active. The action's internal flip (lines
    // 280-289 of microchip.ts) then no-ops on primary (no active row to flip).
    await withMutationOverride(async (tx) => {
      // Flip primary's chip to 'replaced' so the unique index allows dup insert.
      await tx.execute(
        sql`UPDATE pet_identifications SET status = 'replaced' WHERE pet_id = ${primaryPetId}::uuid AND kind = 'microchip_iso' AND status = 'active'`,
      );
      // Remove any existing chip row for duplicatePetId.
      await tx.execute(
        sql`DELETE FROM pet_identifications WHERE pet_id = ${duplicatePetId}::uuid AND kind = 'microchip_iso'`,
      );
      // Insert duplicatePetId's chip as CHIP_ORIGINAL (active, no conflict now).
      await tx.execute(
        sql`INSERT INTO pet_identifications (pet_id, kind, code, recorded_at, iso_country_code, iso_manufacturer_code, iso_national_id, iso_compliant)
            VALUES (${duplicatePetId}::uuid, 'microchip_iso', ${CHIP_ORIGINAL}, current_date, ${CHIP_ORIGINAL.slice(0, 3)}, ${CHIP_ORIGINAL.slice(3, 7)}, ${CHIP_ORIGINAL.slice(7, 15)}, true)`,
      );
    });

    const result = await replaceMicrochipForUser(vetUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "duplicate_detected",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "vet_in_org", organizationId: vetOrgId },
    });

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result) || !result.ok) throw new Error("Expected ok");
    expect(result.caseId).not.toBeNull();

    const [c] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, result.caseId as string));
    // The secondaryPetId is embedded in openedReason.
    expect(c.openedReason).toContain(duplicatePetId);

    // Restore duplicate pet's canonical chip back to CHIP_DUPLICATE_TARGET.
    // (The dup-scan setup flipped it to CHIP_ORIGINAL — undo that.)
    await withMutationOverride(async (tx) => {
      await tx.execute(
        sql`DELETE FROM pet_identifications WHERE pet_id = ${duplicatePetId}::uuid AND kind = 'microchip_iso'`,
      );
    });
    await db.insert(petIdentifications).values({
      petId: duplicatePetId,
      kind: "microchip_iso",
      code: CHIP_DUPLICATE_TARGET,
      recordedAt: new Date().toISOString().slice(0, 10),
      isoCountryCode: CHIP_DUPLICATE_TARGET.slice(0, 3),
      isoManufacturerCode: CHIP_DUPLICATE_TARGET.slice(3, 7),
      isoNationalId: CHIP_DUPLICATE_TARGET.slice(7, 15),
      isoCompliant: true,
    });
    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — cross-pet dup scan finds nothing", () => {
  it("opens a case with primary pet only (no secondaryPetId in reason)", async () => {
    // Close any leftover open microchip_remediation cases for primaryPet.
    await db
      .update(cases)
      .set({ status: "closed", closedReason: "cancelled", closedAt: new Date() })
      .where(
        and(
          eq(cases.primaryPetId, primaryPetId),
          eq(cases.caseKind, "microchip_remediation"),
          eq(cases.status, "open"),
        ),
      );

    // Ensure duplicate pet's canonical chip is CHIP_DUPLICATE_TARGET so the
    // scan returns nothing (the previous test may have left it altered).
    await withMutationOverride(async (tx) => {
      await tx.execute(
        sql`DELETE FROM pet_identifications WHERE pet_id = ${duplicatePetId}::uuid AND kind = 'microchip_iso'`,
      );
    });
    await db.insert(petIdentifications).values({
      petId: duplicatePetId,
      kind: "microchip_iso",
      code: CHIP_DUPLICATE_TARGET,
      recordedAt: new Date().toISOString().slice(0, 10),
      isoCountryCode: CHIP_DUPLICATE_TARGET.slice(0, 3),
      isoManufacturerCode: CHIP_DUPLICATE_TARGET.slice(3, 7),
      isoNationalId: CHIP_DUPLICATE_TARGET.slice(7, 15),
      isoCompliant: true,
    });

    const result = await replaceMicrochipForUser(vetUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "duplicate_detected",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "vet_in_org", organizationId: vetOrgId },
    });

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result) || !result.ok) throw new Error("Expected ok");
    expect(result.caseId).not.toBeNull();

    const [c] = await db
      .select()
      .from(cases)
      .where(eq(cases.id, result.caseId as string));
    expect(c.openedReason).not.toContain("secondaryPetId");

    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — pure revocation with reason damaged", () => {
  it("returns an error (damaged is not a valid revocation reason)", async () => {
    const result = await replaceMicrochipForUser(ownerUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: null,
      reason: "damaged",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "owner" },
    });

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected error");
    expect(result.error).toContain("revocation");
  });
});

describe("replaceMicrochipForUser — pure revocation with reason owner_request", () => {
  it("succeeds and flips canonical row to replaced (no new active row)", async () => {
    // Seed canonical row for CHIP_ORIGINAL.
    await db
      .insert(petIdentifications)
      .values({
        petId: primaryPetId,
        kind: "microchip_iso",
        code: CHIP_ORIGINAL,
        recordedAt: new Date().toISOString().slice(0, 10),
        isoCountryCode: CHIP_ORIGINAL.slice(0, 3),
        isoManufacturerCode: CHIP_ORIGINAL.slice(3, 7),
        isoNationalId: CHIP_ORIGINAL.slice(7, 15),
        isoCompliant: true,
      })
      .onConflictDoNothing();

    const result = await replaceMicrochipForUser(ownerUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: null,
      reason: "owner_request",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "owner" },
    });

    expect(result).toMatchObject({ ok: true });

    // The canonical row for CHIP_ORIGINAL must be 'replaced', no new active row.
    const rows = await db
      .select({ status: petIdentifications.status })
      .from(petIdentifications)
      .where(
        and(
          eq(petIdentifications.petId, primaryPetId),
          eq(petIdentifications.kind, "microchip_iso"),
        ),
      );
    expect(rows.every((r) => r.status !== "active")).toBe(true);

    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — notification to owner when vet emits", () => {
  it("inserts a notification row for the pet's owner", async () => {
    // Clean up any previous notifications for this pet+owner.
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "microchip_updated_by_institution"),
        ),
      );

    const result = await replaceMicrochipForUser(vetUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "damaged",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "vet_in_org", organizationId: vetOrgId },
    });

    expect(result).toMatchObject({ ok: true });

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "microchip_updated_by_institution"),
          eq(notifications.relatedPetId, primaryPetId),
        ),
      );
    expect(rows.length).toBeGreaterThan(0);

    await resetPrimaryChip();
  });
});

describe("replaceMicrochipForUser — audit_log row written", () => {
  it("inserts an audit_log row with action='microchip.replace'", async () => {
    const result = await replaceMicrochipForUser(ownerUserId, {
      petId: primaryPetId,
      previousChipNumber: CHIP_ORIGINAL,
      newChipNumber: CHIP_REPLACEMENT,
      reason: "damaged",
      replacedAt: new Date().toISOString(),
      actorContext: { kind: "owner" },
    });

    expect(result).toMatchObject({ ok: true });
    if (!("ok" in result) || !result.ok) throw new Error("Expected ok");

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, ownerUserId),
          eq(auditLog.action, "microchip.replace"),
          sql`${auditLog.payload}->>'event_id' = ${result.eventId}`,
        ),
      );
    expect(rows.length).toBe(1);
    const row = rows[0];
    const payload = row.payload as Record<string, unknown>;
    expect(payload.event_id).toBe(result.eventId);
    expect(payload.target_pet_id).toBe(primaryPetId);

    await resetPrimaryChip();
  });
});
