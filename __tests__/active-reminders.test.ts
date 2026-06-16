// Integration tests for Chunk C C3 query helpers:
//   - fetchActiveReminders (lib/owner-dashboard.ts)
//   - fetchActiveRemindersForPet (lib/owner-dashboard.ts)
//
// Runs against the local Postgres directly. Each describe block provisions
// its own fixtures and tears them down in afterAll.

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, ownerships, pets, reminders } from "@/db";
import { fetchActiveReminders, fetchActiveRemindersForPet } from "@/lib/owner-dashboard";
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

async function insertReminder(opts: {
  petId: string;
  userId: string;
  dueAt: Date;
  title: string;
  completedAt?: Date | null;
  snoozedUntil?: Date | null;
}) {
  const [rem] = await db
    .insert(reminders)
    .values({
      petId: opts.petId,
      userId: opts.userId,
      reminderType: "vaccine",
      dueAt: opts.dueAt,
      title: opts.title,
      completedAt: opts.completedAt ?? null,
      snoozedUntil: opts.snoozedUntil ?? null,
    })
    .returning();
  return rem;
}

async function cleanupUser(userId: string) {
  const owned = await db.select().from(ownerships).where(eq(ownerships.ownerUserId, userId));
  await withMutationOverride(async (tx) => {
    for (const o of owned) await tx.delete(pets).where(eq(pets.id, o.petId));
  });
  await admin.auth.admin.deleteUser(userId);
}

// ---------------------------------------------------------------------------
// T1: excludes reminders with completedAt IS NOT NULL
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — excludes completed reminders", () => {
  const EMAIL = "ar-completed@dim-test.local";
  const PASS = "ArCompleted_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `CPL-${userId.slice(0, 4)}`);
    const now = new Date();
    // active reminder — should be returned
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    // completed reminder — should be excluded
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 3 * MS_PER_DAY),
      title: "Antirrábica",
      completedAt: new Date(now.getTime() - MS_PER_DAY),
    });
  });

  afterAll(() => cleanupUser(userId));

  it("returns only the non-completed reminder", async () => {
    const results = await fetchActiveReminders(userId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Polivalente");
  });
});

// ---------------------------------------------------------------------------
// T2: excludes reminders with snoozedUntil > now
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — excludes snoozed reminders", () => {
  const EMAIL = "ar-snoozed@dim-test.local";
  const PASS = "ArSnoozed_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `SN-${userId.slice(0, 4)}`);
    const now = new Date();
    // active reminder
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    // snoozed reminder (snoozedUntil is tomorrow → should be excluded)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 4 * MS_PER_DAY),
      title: "Sextuple",
      snoozedUntil: new Date(now.getTime() + MS_PER_DAY),
    });
  });

  afterAll(() => cleanupUser(userId));

  it("returns only the non-snoozed reminder", async () => {
    const results = await fetchActiveReminders(userId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Polivalente");
  });
});

// ---------------------------------------------------------------------------
// T3: COUNT-ALL — no future cap (decision D4)
//
// Before fix: reminders with dueAt > now+14d were excluded by a windowEnd cap,
// making the dashboard KPI count diverge from the per-pet drilldown list.
// After fix: all non-completed, non-snoozed reminders are returned regardless
// of how far ahead their dueAt falls. Reminders beyond 7 days get variant
// "upcoming" but are still counted and shown.
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — returns reminders beyond 14d (COUNT-ALL, D4)", () => {
  const EMAIL = "ar-window@dim-test.local";
  const PASS = "ArWindow_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `WN-${userId.slice(0, 4)}`);
    const now = new Date();
    // 13 days ahead — previously "within" the 14d cap
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 13 * MS_PER_DAY),
      title: "Polivalente",
    });
    // 15 days ahead — previously excluded by the 14d cap, now included
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 15 * MS_PER_DAY),
      title: "Sextuple",
    });
  });

  afterAll(() => cleanupUser(userId));

  it("returns both reminders (no window cap)", async () => {
    const results = await fetchActiveReminders(userId);
    expect(results.length).toBe(2);
    const titles = results.map((r) => r.title);
    expect(titles).toContain("Polivalente");
    expect(titles).toContain("Sextuple");
  });

  it("both reminders beyond 7d get variant 'upcoming'", async () => {
    const results = await fetchActiveReminders(userId);
    for (const r of results) {
      expect(r.variant).toBe("upcoming");
    }
  });
});

// ---------------------------------------------------------------------------
// T4: orders results overdue_critical → overdue → due_soon → upcoming
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — orders by variant priority then dueAt", () => {
  const EMAIL = "ar-order@dim-test.local";
  const PASS = "ArOrder_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `ORD-${userId.slice(0, 4)}`, "dog");
    const now = new Date();
    // upcoming (12d ahead)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 12 * MS_PER_DAY),
      title: "Sextuple",
    });
    // overdue_critical (Antirrábica dog, 45d overdue → > 30d overdue + reportable)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() - 45 * MS_PER_DAY),
      title: "Antirrábica",
    });
    // due_soon (4d ahead)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 4 * MS_PER_DAY),
      title: "Polivalente",
    });
    // overdue (8d overdue, non-reportable)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() - 8 * MS_PER_DAY),
      title: "Bordetella",
    });
  });

  afterAll(() => cleanupUser(userId));

  it("returns results ordered: overdue_critical, overdue, due_soon, upcoming", async () => {
    const results = await fetchActiveReminders(userId);
    expect(results.length).toBe(4);
    expect(results[0].variant).toBe("overdue_critical");
    expect(results[1].variant).toBe("overdue");
    expect(results[2].variant).toBe("due_soon");
    expect(results[3].variant).toBe("upcoming");
  });
});

// ---------------------------------------------------------------------------
// T5: scopes by userId — does not leak other owner's reminders
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — scopes by userId", () => {
  const EMAIL_A = "ar-scope-a@dim-test.local";
  const EMAIL_B = "ar-scope-b@dim-test.local";
  const PASS = "ArScope_2026!";
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL_A);
    await ensureUserDeleted(EMAIL_B);
    userAId = await createUser(EMAIL_A, PASS);
    userBId = await createUser(EMAIL_B, PASS);
    const now = new Date();
    const petA = await createPetForUser(userAId, `SCA-${userAId.slice(0, 4)}`);
    const petB = await createPetForUser(userBId, `SCB-${userBId.slice(0, 4)}`);
    await insertReminder({
      petId: petA.id,
      userId: userAId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    await insertReminder({
      petId: petB.id,
      userId: userBId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Triple felina",
    });
  });

  afterAll(async () => {
    await cleanupUser(userAId);
    await cleanupUser(userBId);
  });

  it("userA only sees their own reminder", async () => {
    const results = await fetchActiveReminders(userAId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Polivalente");
  });

  it("userB only sees their own reminder", async () => {
    const results = await fetchActiveReminders(userBId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Triple felina");
  });
});

// ---------------------------------------------------------------------------
// T6: correctly computes variant via getReminderVariant
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — computes variant correctly", () => {
  const EMAIL = "ar-variant@dim-test.local";
  const PASS = "ArVariant_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `VAR-${userId.slice(0, 4)}`);
    const now = new Date();
    // 10d ahead → upcoming
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 10 * MS_PER_DAY),
      title: "Sextuple",
    });
    // 5d ahead → due_soon
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    // 10d overdue → overdue (non-reportable)
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() - 10 * MS_PER_DAY),
      title: "Bordetella",
    });
  });

  afterAll(() => cleanupUser(userId));

  it("assigns correct variant to each reminder", async () => {
    const results = await fetchActiveReminders(userId);
    const byTitle = Object.fromEntries(results.map((r) => [r.title, r.variant]));
    expect(byTitle.Sextuple).toBe("upcoming");
    expect(byTitle.Polivalente).toBe("due_soon");
    expect(byTitle.Bordetella).toBe("overdue");
  });
});

// ---------------------------------------------------------------------------
// T7: correctly computes isReportable for a reportable vaccine
// ---------------------------------------------------------------------------

describe("fetchActiveReminders — isReportable for Antirrábica on dog", () => {
  const EMAIL = "ar-reportable@dim-test.local";
  const PASS = "ArReport_2026!";
  let userId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const pet = await createPetForUser(userId, `RPT-${userId.slice(0, 4)}`, "dog");
    const now = new Date();
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() - 45 * MS_PER_DAY),
      title: "Antirrábica",
    });
    // non-reportable for comparison
    await insertReminder({
      petId: pet.id,
      userId,
      dueAt: new Date(now.getTime() - 10 * MS_PER_DAY),
      title: "Bordetella",
    });
  });

  afterAll(() => cleanupUser(userId));

  it("Antirrábica dog is reportable; Bordetella dog is not", async () => {
    const results = await fetchActiveReminders(userId);
    const antirr = results.find((r) => r.title === "Antirrábica");
    const bord = results.find((r) => r.title === "Bordetella");
    expect(antirr?.isReportable).toBe(true);
    expect(antirr?.variant).toBe("overdue_critical");
    expect(bord?.isReportable).toBe(false);
    expect(bord?.variant).toBe("overdue");
  });
});

// ---------------------------------------------------------------------------
// T8: fetchActiveRemindersForPet scopes by petId AND userId
// ---------------------------------------------------------------------------

describe("fetchActiveRemindersForPet — scopes by petId", () => {
  const EMAIL = "ar-perpet@dim-test.local";
  const PASS = "ArPerPet_2026!";
  let userId: string;
  let petAId: string;
  let petBId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL);
    userId = await createUser(EMAIL, PASS);
    const now = new Date();
    const petA = await createPetForUser(userId, `PPA-${userId.slice(0, 4)}`);
    const petB = await createPetForUser(userId, `PPB-${userId.slice(0, 4)}`);
    petAId = petA.id;
    petBId = petB.id;
    await insertReminder({
      petId: petA.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
    await insertReminder({
      petId: petB.id,
      userId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Triple felina",
    });
  });

  afterAll(() => cleanupUser(userId));

  it("returns only petA's reminder when queried for petA", async () => {
    const results = await fetchActiveRemindersForPet(userId, petAId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Polivalente");
    expect(results[0].petId).toBe(petAId);
  });

  it("returns only petB's reminder when queried for petB", async () => {
    const results = await fetchActiveRemindersForPet(userId, petBId);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Triple felina");
    expect(results[0].petId).toBe(petBId);
  });
});

// ---------------------------------------------------------------------------
// T9: fetchActiveRemindersForPet returns [] when user is not the owner
// ---------------------------------------------------------------------------

describe("fetchActiveRemindersForPet — returns [] for non-owner user", () => {
  const EMAIL_OWNER = "ar-nonowner-own@dim-test.local";
  const EMAIL_OTHER = "ar-nonowner-oth@dim-test.local";
  const PASS = "ArNonOwner_2026!";
  let ownerId: string;
  let otherId: string;
  let petId: string;

  beforeAll(async () => {
    await ensureUserDeleted(EMAIL_OWNER);
    await ensureUserDeleted(EMAIL_OTHER);
    ownerId = await createUser(EMAIL_OWNER, PASS);
    otherId = await createUser(EMAIL_OTHER, PASS);
    const now = new Date();
    const pet = await createPetForUser(ownerId, `NON-${ownerId.slice(0, 4)}`);
    petId = pet.id;
    // The reminder is tied to ownerId (reminder.user_id = owner). The other user
    // has no ownership and is not the reminder's user_id.
    await insertReminder({
      petId: pet.id,
      userId: ownerId,
      dueAt: new Date(now.getTime() + 5 * MS_PER_DAY),
      title: "Polivalente",
    });
  });

  afterAll(async () => {
    await cleanupUser(ownerId);
    await cleanupUser(otherId);
  });

  it("owner sees the reminder", async () => {
    const results = await fetchActiveRemindersForPet(ownerId, petId);
    expect(results.length).toBe(1);
  });

  it("other user sees nothing (userId filter)", async () => {
    const results = await fetchActiveRemindersForPet(otherId, petId);
    expect(results.length).toBe(0);
  });
});
