// Tests for lib/infra/outreach-reminders.ts — the "Enviar recordatorio(s)"
// write action on /gob/operativos?vista=alcance's overdue-antirrábica
// pipeline (sweep-fixes-2 2026-07-23).
//
// Covers:
//  1. A reminder (vaccine_due notification) is created for a genuinely
//     overdue, in-scope pet's active owner.
//  2. Throttle: a second call within OUTREACH_REMINDER_THROTTLE_DAYS does NOT
//     insert another notification — reported "already_notified".
//  3. Out-of-jurisdiction petId is rejected — reported "out_of_scope", no
//     notification is created (server-side re-derivation, never trusts the
//     client's pet list).
//  4. A pet with no active personal owner is reported "no_owner".
//  5. An audit_log row (action='outreach_reminder_sent') is written once per
//     invocation with honest counts.
//  6. Bulk call over a mixed batch reports sent/already_notified/out_of_scope
//     honestly in one summary.
//
// Integration tests run against local Postgres + bootstrapped schema, same
// posture as __tests__/outreach-pipelines.test.ts.

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, db, notifications, ownerships, petEvents, pets, profiles } from "@/db";
import {
  OUTREACH_REMINDER_THROTTLE_DAYS,
  sendOverdueRabiesReminders,
} from "@/lib/infra/outreach-reminders";
import { buildProjectionContext } from "@/lib/metrics";

const TEST_PROVINCE = "Buenos Aires";
const TEST_LOCALITY = `outreach-reminder-locality-${Date.now()}`;
const OTHER_LOCALITY = `outreach-reminder-other-locality-${Date.now()}`;

const createdProfileIds: string[] = [];
const actorId = crypto.randomUUID();

let overduePetId: string;
let overdueOwnerId: string;
let noOwnerPetId: string;
let otherJurisdictionPetId: string;
let currentPetId: string; // not overdue — must never be "sent"

async function makeOverduePet(locality: string, name: string) {
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: `PET-RMD-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      species: "dog",
      sex: "male",
      status: "active",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: locality,
    })
    .returning({ id: pets.id });
  const overdueDate = new Date(Date.now() - 400 * 86400_000);
  await db.insert(petEvents).values({
    petId: pet.id,
    eventType: "vaccination_administered",
    occurredAt: overdueDate,
    authorRole: "owner",
    payload: {
      vaccine_name: "Antirrábica",
      next_due_at: new Date(overdueDate.getTime() + 365 * 86400_000).toISOString(),
    },
  });
  return pet.id;
}

beforeAll(async () => {
  await db
    .insert(profiles)
    .values({ id: actorId, displayName: "Reminder Test Operator", role: "govt" });
  createdProfileIds.push(actorId);

  overdueOwnerId = crypto.randomUUID();
  await db
    .insert(profiles)
    .values({ id: overdueOwnerId, displayName: "Reminder Test Owner", role: "owner" });
  createdProfileIds.push(overdueOwnerId);

  overduePetId = await makeOverduePet(TEST_LOCALITY, "Overdue");
  await db.insert(ownerships).values({
    petId: overduePetId,
    ownerUserId: overdueOwnerId,
    role: "owner",
  });

  noOwnerPetId = await makeOverduePet(TEST_LOCALITY, "NoOwner");
  // Deliberately no ownerships row for this pet.

  otherJurisdictionPetId = await makeOverduePet(OTHER_LOCALITY, "OtherJuris");
  const otherOwnerId = crypto.randomUUID();
  await db
    .insert(profiles)
    .values({ id: otherOwnerId, displayName: "Other Juris Owner", role: "owner" });
  createdProfileIds.push(otherOwnerId);
  await db.insert(ownerships).values({
    petId: otherJurisdictionPetId,
    ownerUserId: otherOwnerId,
    role: "owner",
  });

  // A current (NOT overdue) pet — fetchOverdueRabiesVaccine's re-derivation
  // must exclude it even if a caller tried to slip it into the petIds list.
  const [petCurrent] = await db
    .insert(pets)
    .values({
      publicToken: `PET-RMD-CURRENT-${Date.now()}`,
      name: "Current",
      species: "dog",
      sex: "female",
      status: "active",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
    })
    .returning({ id: pets.id });
  currentPetId = petCurrent.id;
  const recentVaccDate = new Date(Date.now() - 30 * 86400_000);
  await db.insert(petEvents).values({
    petId: currentPetId,
    eventType: "vaccination_administered",
    occurredAt: recentVaccDate,
    authorRole: "owner",
    payload: {
      vaccine_name: "Antirrábica",
      next_due_at: new Date(recentVaccDate.getTime() + 365 * 86400_000).toISOString(),
    },
  });
});

afterAll(async () => {
  // notifications + ownerships are NOT append-only — safe to delete.
  await db.delete(notifications).where(eq(notifications.relatedPetId, overduePetId));
  await db.delete(notifications).where(eq(notifications.relatedPetId, noOwnerPetId));
  await db.delete(notifications).where(eq(notifications.relatedPetId, otherJurisdictionPetId));
  await db.delete(notifications).where(eq(notifications.relatedPetId, currentPetId));
  await db.delete(ownerships).where(eq(ownerships.petId, overduePetId));
  await db.delete(ownerships).where(eq(ownerships.petId, otherJurisdictionPetId));

  // audit_log is append-only — GUC bypass, same pattern as
  // __tests__/outreach-pipelines.test.ts.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
    await tx.delete(auditLog).where(eq(auditLog.actorUserId, actorId));
  });

  for (const id of createdProfileIds) {
    await db.delete(profiles).where(eq(profiles.id, id));
  }
  // pets/pet_events cannot be deleted (append-only trigger) — no cleanup,
  // same convention as outreach-pipelines.test.ts. Unique locality names
  // prevent cross-run leakage.
});

function govtCtx(locality: string) {
  return buildProjectionContext({ role: "govt" }, [{ province: TEST_PROVINCE, locality }], {
    since: new Date(Date.now() - 365 * 86400_000),
    until: new Date(),
  });
}

describe("sendOverdueRabiesReminders — single pet", () => {
  it("sends a vaccine_due reminder to the overdue pet's active owner", async () => {
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      overduePetId,
    ]);

    expect(result.results).toEqual([{ petId: overduePetId, outcome: "sent" }]);
    expect(result.sentCount).toBe(1);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, overdueOwnerId),
          eq(notifications.relatedPetId, overduePetId),
          eq(notifications.notificationType, "vaccine_due"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("health");
    expect(rows[0].severity).toBe("urgent");
  });

  it(`throttles a second call within ${OUTREACH_REMINDER_THROTTLE_DAYS} days — no duplicate notification`, async () => {
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      overduePetId,
    ]);

    expect(result.results).toEqual([{ petId: overduePetId, outcome: "already_notified" }]);
    expect(result.alreadyNotifiedCount).toBe(1);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, overdueOwnerId),
          eq(notifications.relatedPetId, overduePetId),
          eq(notifications.notificationType, "vaccine_due"),
        ),
      );
    // Still exactly one — the throttle prevented a second insert.
    expect(rows).toHaveLength(1);
  });

  it("rejects an out-of-jurisdiction petId — never trusts the client's list", async () => {
    // ctx is scoped to TEST_LOCALITY only; otherJurisdictionPetId lives in
    // OTHER_LOCALITY.
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      otherJurisdictionPetId,
    ]);

    expect(result.results).toEqual([{ petId: otherJurisdictionPetId, outcome: "out_of_scope" }]);
    expect(result.outOfScopeCount).toBe(1);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.relatedPetId, otherJurisdictionPetId));
    expect(rows).toHaveLength(0);
  });

  it("rejects a petId that is in-scope but NOT actually overdue", async () => {
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      currentPetId,
    ]);
    expect(result.results).toEqual([{ petId: currentPetId, outcome: "out_of_scope" }]);
  });

  it("reports 'no_owner' for an overdue in-scope pet with no active personal owner", async () => {
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      noOwnerPetId,
    ]);
    expect(result.results).toEqual([{ petId: noOwnerPetId, outcome: "no_owner" }]);
    expect(result.noOwnerCount).toBe(1);
  });

  it("writes an audit_log row per invocation with honest counts", async () => {
    const rows = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, actorId), eq(auditLog.action, "outreach_reminder_sent")));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload.surface).toBe("outreach_pipeline");
    expect(payload.pipeline).toBe("overdue_rabies");
    expect(typeof payload.sent_count).toBe("number");
  });
});

describe("sendOverdueRabiesReminders — bulk", () => {
  it("reports sent/already_notified/no_owner/out_of_scope honestly in one summary", async () => {
    // overduePetId was already notified in the describe block above (within
    // the throttle window) → already_notified. noOwnerPetId → no_owner.
    // otherJurisdictionPetId → out_of_scope.
    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      overduePetId,
      noOwnerPetId,
      otherJurisdictionPetId,
    ]);

    expect(result.sentCount).toBe(0);
    expect(result.alreadyNotifiedCount).toBe(1);
    expect(result.noOwnerCount).toBe(1);
    expect(result.outOfScopeCount).toBe(1);
    expect(result.results).toHaveLength(3);

    const byId = new Map(result.results.map((r) => [r.petId, r.outcome]));
    expect(byId.get(overduePetId)).toBe("already_notified");
    expect(byId.get(noOwnerPetId)).toBe("no_owner");
    expect(byId.get(otherJurisdictionPetId)).toBe("out_of_scope");
  });

  it("dedupes a repeated petId in the same bulk call", async () => {
    const freshOwnerId = crypto.randomUUID();
    await db
      .insert(profiles)
      .values({ id: freshOwnerId, displayName: "Fresh Bulk Owner", role: "owner" });
    createdProfileIds.push(freshOwnerId);
    const freshPetId = await makeOverduePet(TEST_LOCALITY, "FreshBulk");
    await db
      .insert(ownerships)
      .values({ petId: freshPetId, ownerUserId: freshOwnerId, role: "owner" });

    const result = await sendOverdueRabiesReminders(actorId, govtCtx(TEST_LOCALITY), [
      freshPetId,
      freshPetId,
    ]);

    expect(result.results).toHaveLength(1);
    expect(result.sentCount).toBe(1);

    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.relatedPetId, freshPetId),
          eq(notifications.notificationType, "vaccine_due"),
        ),
      );
    expect(rows).toHaveLength(1);

    await db.delete(notifications).where(eq(notifications.relatedPetId, freshPetId));
    await db.delete(ownerships).where(eq(ownerships.petId, freshPetId));
  });
});
