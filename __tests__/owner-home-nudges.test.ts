// Integration tests for Item 5 — owner health-status nudges (/inicio).
//
// Spec: docs/superpowers/specs/2026-06-18-owner-health-status-nudges-design.md
//
// These exercise fetchPetHealthNudges (lib/owner-nudges.ts) against the local
// Postgres directly — same posture as __tests__/active-reminders.test.ts. Each
// describe block provisions its own owner + pet(s) + events, then tears them
// down via withMutationOverride (pet_events is append-only: handle_pet_creation
// auto-writes a welcome event, so plain DELETE on pets needs the escape hatch).
//
// Contract under test (owner-data ONLY — never surveillance/authority signals):
//   - overdue vaccine nudge (latest vaccination_administered.next_due_at vs now)
//   - microchip-missing nudge (no microchip_implanted event)
//   - next-reminder nudge (open vaccine reminders)
//   - credential-scan activity (credential_scanned with is_self_scan=false)
//   - sterilization status (informational, no nudge when sterilized)
//   - per-pet rollup summary ("Al día" vs "N pendientes")
//   - cross-owner isolation (owner A never sees owner B's pets)

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, petEvents, pets, reminders } from "@/db";
import { fetchPetHealthNudges } from "@/lib/infra/owner-nudges";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

async function ensureUserDeleted(email: string) {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users.find((u) => u.email === email);
  if (!found) return;
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, found.id));
  await withMutationOverride(async (tx) => {
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(found.id);
}

async function createUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function createPetForUser(userId: string, tokenSuffix: string, species = "dog") {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: `AR-${tokenSuffix}`,
      name: `Pet_${tokenSuffix}`,
      species,
      sex: "unknown",
      status: "active",
    })
    .returning();
  await db.insert(ownerships).values({ petId: pet.id, ownerUserId: userId, role: "owner" });
  return pet;
}

async function insertVaccination(petId: string, nextDueAt: Date | null, occurredAt: Date) {
  await db.insert(petEvents).values({
    petId,
    eventType: "vaccination_administered",
    occurredAt,
    payload: {
      payload_version: 1,
      vaccine_name: "Antirrábica",
      brand: null,
      batch: null,
      administered_by: null,
      next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
    },
    authorRole: "owner",
    recordedByUserId: null,
  });
}

async function insertMicrochip(petId: string, occurredAt: Date) {
  await db.insert(petEvents).values({
    petId,
    eventType: "microchip_implanted",
    occurredAt,
    payload: {
      payload_version: 1,
      chip_number: "900123456789012",
      country_code: "AR",
      implanted_by: null,
      location_on_body: null,
      implant_date_known: true,
    },
    authorRole: "owner",
    recordedByUserId: null,
  });
}

async function insertSterilization(petId: string, occurredAt: Date) {
  await db.insert(petEvents).values({
    petId,
    eventType: "sterilization_performed",
    occurredAt,
    payload: {
      payload_version: 1,
      procedure: "castration",
      performed_by: null,
      clinic: null,
    },
    authorRole: "owner",
    recordedByUserId: null,
  });
}

async function insertScan(petId: string, occurredAt: Date, isSelfScan: boolean) {
  await db.insert(petEvents).values({
    petId,
    eventType: "credential_scanned",
    occurredAt,
    payload: {
      payload_version: 1,
      is_self_scan: isSelfScan,
      viewer_authenticated: false,
    },
    authorRole: "system",
    recordedByUserId: null,
  });
}

async function insertReminder(opts: {
  petId: string;
  userId: string;
  dueAt: Date;
  title: string;
  completedAt?: Date | null;
}) {
  await db.insert(reminders).values({
    petId: opts.petId,
    userId: opts.userId,
    reminderType: "vaccine",
    dueAt: opts.dueAt,
    title: opts.title,
    completedAt: opts.completedAt ?? null,
  });
}

async function cleanupUser(userId: string) {
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, userId));
  await withMutationOverride(async (tx) => {
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(userId);
}

function petByToken(result: Awaited<ReturnType<typeof fetchPetHealthNudges>>, tokenSuffix: string) {
  return result.find((p) => p.publicToken === `AR-${tokenSuffix}`);
}

// ---------------------------------------------------------------------------
// T1: overdue vaccine → vaccine nudge present; future next_due_at → absent
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — overdue vaccine nudge", () => {
  const EMAIL = "nudge-vax@dim-test.local";
  const PASS = "NudgeVax_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const overduePet = await createPetForUser(userId, `OVD-${userId.slice(0, 4)}`);
    const okPet = await createPetForUser(userId, `FUT-${userId.slice(0, 4)}`);
    // Overdue: last vaccine's next_due_at is 30 days in the past.
    await insertVaccination(
      overduePet.id,
      new Date(now.getTime() - 30 * MS_PER_DAY),
      new Date(now.getTime() - 395 * MS_PER_DAY),
    );
    // Up to date: next_due_at is 90 days in the future.
    await insertVaccination(
      okPet.id,
      new Date(now.getTime() + 90 * MS_PER_DAY),
      new Date(now.getTime() - 1 * MS_PER_DAY),
    );
    // Both have a chip so the chip nudge doesn't muddy the assertion.
    await insertMicrochip(overduePet.id, now);
    await insertMicrochip(okPet.id, now);
  });

  afterAll(() => cleanupUser(userId));

  it("present for the pet with a past next_due_at", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `OVD-${userId.slice(0, 4)}`);
    expect(pet?.vaccineStatus).toBe("overdue");
    expect(pet?.nudges.some((n) => n.kind === "vaccine_overdue")).toBe(true);
  });

  it("absent for the pet with a future next_due_at", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `FUT-${userId.slice(0, 4)}`);
    expect(pet?.vaccineStatus).toBe("up_to_date");
    expect(pet?.nudges.some((n) => n.kind === "vaccine_overdue")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T2: no microchip_implanted → chip nudge present; chipped → absent
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — microchip nudge", () => {
  const EMAIL = "nudge-chip@dim-test.local";
  const PASS = "NudgeChip_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const chipped = await createPetForUser(userId, `CHP-${userId.slice(0, 4)}`);
    await createPetForUser(userId, `NOC-${userId.slice(0, 4)}`); // no chip
    await insertMicrochip(chipped.id, now);
  });

  afterAll(() => cleanupUser(userId));

  it("present for the unchipped pet", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `NOC-${userId.slice(0, 4)}`);
    expect(pet?.hasChip).toBe(false);
    expect(pet?.nudges.some((n) => n.kind === "chip_missing")).toBe(true);
  });

  it("absent for the chipped pet", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `CHP-${userId.slice(0, 4)}`);
    expect(pet?.hasChip).toBe(true);
    expect(pet?.nudges.some((n) => n.kind === "chip_missing")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T3: open reminder surfaces as the next-reminder nudge; completed one doesn't
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — next reminder", () => {
  const EMAIL = "nudge-rem@dim-test.local";
  const PASS = "NudgeRem_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const pet = await createPetForUser(userId, `REM-${userId.slice(0, 4)}`);
    await insertMicrochip(pet.id, now); // silence chip nudge
    // Open reminder, due in 5 days → should surface.
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    // Completed reminder → should NOT surface.
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 3 * MS_PER_DAY),
      title: "Sextuple",
      completedAt: new Date(now.getTime() - MS_PER_DAY),
    });
  });

  afterAll(() => cleanupUser(userId));

  it("surfaces the open reminder and ignores the completed one", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `REM-${userId.slice(0, 4)}`);
    expect(pet?.openReminders).toBe(1);
    const reminderNudge = pet?.nudges.find((n) => n.kind === "reminder_due");
    expect(reminderNudge).toBeDefined();
    expect(reminderNudge?.label).toContain("Polivalente");
    expect(reminderNudge?.label).not.toContain("Sextuple");
  });
});

// ---------------------------------------------------------------------------
// T4: credential_scanned activity excludes self-scans, counts external scans
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — scan activity", () => {
  const EMAIL = "nudge-scan@dim-test.local";
  const PASS = "NudgeScan_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const pet = await createPetForUser(userId, `SCN-${userId.slice(0, 4)}`);
    await insertMicrochip(pet.id, now); // silence chip nudge
    // Two external scans (counted) + one self-scan (excluded).
    await insertScan(pet.id, new Date(now.getTime() - 1 * MS_PER_DAY), false);
    await insertScan(pet.id, new Date(now.getTime() - 2 * MS_PER_DAY), false);
    await insertScan(pet.id, new Date(now.getTime() - 3 * MS_PER_DAY), true);
  });

  afterAll(() => cleanupUser(userId));

  it("counts external scans, excludes self-scans", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `SCN-${userId.slice(0, 4)}`);
    expect(pet?.recentScanCount).toBe(2);
    expect(pet?.nudges.some((n) => n.kind === "scan_activity")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T5: sterilization status — no nudge when sterilized; informational only
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — sterilization (informational)", () => {
  const EMAIL = "nudge-ster@dim-test.local";
  const PASS = "NudgeSter_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const sterilized = await createPetForUser(userId, `STR-${userId.slice(0, 4)}`);
    await insertMicrochip(sterilized.id, now);
    await insertSterilization(sterilized.id, now);
  });

  afterAll(() => cleanupUser(userId));

  it("reports isSterilized=true and surfaces no sterilization nudge", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `STR-${userId.slice(0, 4)}`);
    expect(pet?.isSterilized).toBe(true);
    expect(pet?.nudges.some((n) => n.kind === "sterilization_pending")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T6: rollup summary — "Al día" when nothing pending, count when there is
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — rollup summary", () => {
  const EMAIL = "nudge-sum@dim-test.local";
  const PASS = "NudgeSum_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    // Fully compliant: chipped + future vaccine, no open reminders.
    const tidy = await createPetForUser(userId, `TDY-${userId.slice(0, 4)}`);
    await insertMicrochip(tidy.id, now);
    await insertVaccination(
      tidy.id,
      new Date(now.getTime() + 90 * MS_PER_DAY),
      new Date(now.getTime() - 1 * MS_PER_DAY),
    );
    // Two pending: no chip + overdue vaccine.
    const messy = await createPetForUser(userId, `MSY-${userId.slice(0, 4)}`);
    await insertVaccination(
      messy.id,
      new Date(now.getTime() - 30 * MS_PER_DAY),
      new Date(now.getTime() - 395 * MS_PER_DAY),
    );
  });

  afterAll(() => cleanupUser(userId));

  it("compliant pet rolls up to 'Al día' with 0 pending", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `TDY-${userId.slice(0, 4)}`);
    expect(pet?.pendingCount).toBe(0);
    expect(pet?.summary).toBe("Al día");
  });

  it("non-compliant pet rolls up to a pending count", async () => {
    const result = await fetchPetHealthNudges(userId);
    const pet = petByToken(result, `MSY-${userId.slice(0, 4)}`);
    expect(pet?.pendingCount).toBe(2);
    expect(pet?.summary).toContain("2");
  });
});

// ---------------------------------------------------------------------------
// T7: cross-owner isolation — owner A never sees owner B's pets
// ---------------------------------------------------------------------------

describe("fetchPetHealthNudges — cross-owner isolation", () => {
  const EMAIL_A = "nudge-iso-a@dim-test.local";
  const EMAIL_B = "nudge-iso-b@dim-test.local";
  const PASS = "NudgeIso_2026!";
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL_A);
    await ensureUserDeleted(EMAIL_B);
    userAId = await createUser(EMAIL_A, PASS);
    userBId = await createUser(EMAIL_B, PASS);
    const now = new Date();
    const petA = await createPetForUser(userAId, `ISA-${userAId.slice(0, 4)}`);
    const petB = await createPetForUser(userBId, `ISB-${userBId.slice(0, 4)}`);
    await insertMicrochip(petA.id, now);
    await insertMicrochip(petB.id, now);
  });

  afterAll(async () => {
    await cleanupUser(userAId);
    await cleanupUser(userBId);
  });

  it("owner A only sees their own pet", async () => {
    const result = await fetchPetHealthNudges(userAId);
    expect(result.length).toBe(1);
    expect(result[0].publicToken).toBe(`AR-ISA-${userAId.slice(0, 4)}`);
  });

  it("owner B only sees their own pet", async () => {
    const result = await fetchPetHealthNudges(userBId);
    expect(result.length).toBe(1);
    expect(result[0].publicToken).toBe(`AR-ISB-${userBId.slice(0, 4)}`);
  });

  it("returns an empty array for an owner with no pets", async () => {
    const result = await fetchPetHealthNudges("00000000-0000-0000-0000-000000000000");
    expect(result).toEqual([]);
  });
});
