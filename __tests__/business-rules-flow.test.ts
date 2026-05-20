// Integration tests for the business-rules writer + re-eval.
// Spec 2026-05-19-govt-business-rules-poc-design §5 + §4.5.

import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createBusinessRuleWriter,
  deleteBusinessRuleWriter,
  updateBusinessRuleWriter,
} from "@/app/actions/business-rules";
import { auditLog, db, govtBusinessRules, notifications, ownerships, pets, profiles } from "@/db";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const supabase = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const ADMIN_EMAIL = "br-flow-admin@dim-test.local";
const OWNER_EMAIL = "br-flow-owner@dim-test.local";
const PASS = "BrFlow_2026!";
const TEST_PROVINCE = "BR-FLOW-PROVINCE";
const TEST_LOCALITY = "BR-FLOW-LOCALITY";

let adminUserId: string;
let ownerUserId: string;
const insertedPetIds: string[] = [];
const createdRuleIds: string[] = [];

async function ensureUser(email: string): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);
  if (found) {
    await db.delete(notifications).where(eq(notifications.userId, found.id));
    return found.id;
  }
  const created = await supabase.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser ${email}: ${created.error?.message}`);
  }
  return created.data.user.id;
}

async function insertTestDog(ownerUid: string, breed: string, suffix: string) {
  const token = `BRTEST-${suffix}-${Date.now()}`;
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: token,
      name: `BrPet${suffix}`,
      species: "dog",
      sex: "male",
      breed,
      status: "active",
      jurisdictionCountry: "AR",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
      potentiallyDangerousBreed: false,
    })
    .returning();
  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId: ownerUid,
    role: "owner",
  });
  insertedPetIds.push(pet.id);
  return pet;
}

beforeAll(async () => {
  adminUserId = await ensureUser(ADMIN_EMAIL);
  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional" })
    .where(eq(profiles.id, adminUserId));
  ownerUserId = await ensureUser(OWNER_EMAIL);
});

afterAll(async () => {
  for (const id of createdRuleIds) {
    await db.delete(govtBusinessRules).where(eq(govtBusinessRules.id, id));
  }
  await db.execute(sql`
    delete from govt_business_rules
    where jurisdiction_province in (${TEST_PROVINCE}, 'BR-NOOP-PROVINCE',
      'BR-INVALID-PROVINCE', 'BR-UPDATE-PROVINCE', 'BR-DELETE-PROVINCE')
  `);
  for (const petId of insertedPetIds) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_event_mutation = 'true'`);
      await tx.delete(pets).where(eq(pets.id, petId));
    });
  }
  // audit_log rows + profiles + auth users survive — append-only trigger
  // + FK RESTRICT prevent cleanup. Subsequent runs reuse via ensureUser.
});

describe("createBusinessRuleWriter", () => {
  it("creates a province-scoped ppp_breed_list rule + audit row", async () => {
    const result = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: null,
      rulePayload: { breeds: ["Boxer", "Test Breed BR-FLOW"] },
      notes: "test rule",
      legalAnchorIds: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.ruleId === null) return;
    createdRuleIds.push(result.ruleId);

    const audits = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, adminUserId),
          eq(auditLog.action, "govt_business_rule_created"),
        ),
      );
    expect(audits.length).toBeGreaterThan(0);
  });

  it("no-ops when payload matches the hardcoded default", async () => {
    const defaultBreeds = (await import("@/lib/business-rules-defaults")).BUSINESS_RULES_DEFAULTS
      .ppp_breed_list;
    const result = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: "BR-NOOP-PROVINCE",
      jurisdictionLocality: null,
      rulePayload: defaultBreeds,
      notes: null,
      legalAnchorIds: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noOp).toBe(true);
    if (!result.noOp) return;
    expect(result.reason).toContain("idéntica al default");
  });

  it("rejects invalid payload", async () => {
    const result = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: "BR-INVALID-PROVINCE",
      jurisdictionLocality: null,
      rulePayload: { breeds: "not-an-array" },
      notes: null,
      legalAnchorIds: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Payload inválido");
  });
});

describe("createBusinessRuleWriter + reeval", () => {
  it("flips pets.potentially_dangerous_breed to true + notifies owner", async () => {
    const pet = await insertTestDog(ownerUserId, "BR-REEVAL-BREED", "REEVAL1");
    expect(pet.potentiallyDangerousBreed).toBe(false);

    const result = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: TEST_PROVINCE,
      jurisdictionLocality: TEST_LOCALITY,
      rulePayload: { breeds: ["BR-REEVAL-BREED"] },
      notes: null,
      legalAnchorIds: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.ruleId === null) return;
    createdRuleIds.push(result.ruleId);

    const [refreshed] = await db.select().from(pets).where(eq(pets.id, pet.id));
    expect(refreshed.potentiallyDangerousBreed).toBe(true);

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ownerUserId),
          eq(notifications.notificationType, "ppp_breed_list_updated_now_applies"),
          eq(notifications.relatedPetId, pet.id),
        ),
      );
    expect(notifs.length).toBe(1);
  });
});

describe("updateBusinessRuleWriter", () => {
  it("updates payload + writes audit row", async () => {
    const created = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: "BR-UPDATE-PROVINCE",
      jurisdictionLocality: null,
      rulePayload: { breeds: ["UpdMe1"] },
      notes: null,
      legalAnchorIds: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.ruleId === null) return;
    createdRuleIds.push(created.ruleId);

    const upd = await updateBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleId: created.ruleId,
      rulePayload: { breeds: ["UpdMe1", "UpdMe2"] },
      notes: "updated",
      legalAnchorIds: [],
    });
    expect(upd.ok).toBe(true);

    const [row] = await db
      .select()
      .from(govtBusinessRules)
      .where(eq(govtBusinessRules.id, created.ruleId));
    expect((row.rulePayload as { breeds: string[] }).breeds).toEqual(["UpdMe1", "UpdMe2"]);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "govt_business_rule_updated"));
    expect(audits.some((a) => (a.payload as { ruleId: string }).ruleId === created.ruleId)).toBe(
      true,
    );
  });
});

describe("deleteBusinessRuleWriter", () => {
  it("deletes the row + writes audit + reevals", async () => {
    const created = await createBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleType: "ppp_breed_list",
      jurisdictionCountry: "AR",
      jurisdictionProvince: "BR-DELETE-PROVINCE",
      jurisdictionLocality: null,
      rulePayload: { breeds: ["DeleteMe"] },
      notes: null,
      legalAnchorIds: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok || created.ruleId === null) return;

    const del = await deleteBusinessRuleWriter({
      actorUserId: adminUserId,
      ruleId: created.ruleId,
    });
    expect(del.ok).toBe(true);

    const remaining = await db
      .select()
      .from(govtBusinessRules)
      .where(eq(govtBusinessRules.id, created.ruleId));
    expect(remaining.length).toBe(0);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "govt_business_rule_deleted"));
    expect(audits.some((a) => (a.payload as { ruleId: string }).ruleId === created.ruleId)).toBe(
      true,
    );
  });
});
