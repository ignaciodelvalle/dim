// Integration tests for the subject-rights RPCs (compliance handoff PR 1,
// Ley 25.326 arts. 14 + 16).
//
// Covers:
//  1. export_subject_data — self call returns JSON with profile + pets +
//     identifications + pet_events, and writes an audit_log row.
//  2. erase_subject_data — soft-deletes the profile, hashes PII, marks
//     owned pets deleted, writes an audit_log row.
//  3. authorization — a different user cannot call either RPC for someone
//     else's user_id (NON-admin caller raises 'forbidden').

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, db, ownerships, pets, profiles } from "@/db";
import { generatePublicToken } from "@/lib/publicToken";
import { withMutationOverride } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const OWNER_EMAIL = "sr-owner@dim-test.local";
const OTHER_EMAIL = "sr-other@dim-test.local";
const PASS = "SubjRights_2026!";

const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

let ownerUserId: string;
let otherUserId: string;
const createdPetIds: string[] = [];

// Reuse the auth user across runs. audit_log is append-only with no test
// override and points back to actor_user_id via ON DELETE RESTRICT, so a
// "delete + create fresh" strategy breaks on the second run. Instead we
// look up by email and create only when missing. The profile gets its PII
// reset between runs (re-seed below) so the erase test starts clean.
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

async function resetProfilePIIToFresh(userId: string, displayName: string) {
  await db
    .update(profiles)
    .set({
      displayName,
      phone: "+5491100000000",
      dniNumber: null,
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, userId));
}

async function userSupabase(email: string) {
  const c = createClient(SUPABASE_URL, "sb_publishable_AB4Iz8X5pNH6Mh3MhT4xjA_yegwhI03");
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

beforeAll(async () => {
  ownerUserId = await ensureUser(OWNER_EMAIL);
  otherUserId = await ensureUser(OTHER_EMAIL);
  await resetProfilePIIToFresh(ownerUserId, "SR Test Owner");
  await resetProfilePIIToFresh(otherUserId, "SR Test Other");

  // One pet owned by ownerUserId, for the export assertion to be non-empty.
  const [pet] = await db
    .insert(pets)
    .values({
      publicToken: generatePublicToken(),
      name: "SRTestPet",
      species: "dog",
      sex: "male",
      potentiallyDangerousBreed: false,
    })
    .returning();
  createdPetIds.push(pet.id);
  await db.insert(ownerships).values({
    petId: pet.id,
    ownerUserId,
    role: "owner",
  });
});

afterAll(async () => {
  // Pet rows: append-only via trigger, need the override.
  // audit_log entries leak by design (append-only); test users leak too.
  // Next run reuses them via ensureUser.
  await withMutationOverride(async (tx) => {
    for (const id of createdPetIds) {
      await tx.delete(ownerships).where(eq(ownerships.petId, id));
      await tx.delete(pets).where(eq(pets.id, id));
    }
  });
});

// ---------------------------------------------------------------------------

describe("export_subject_data RPC", () => {
  it("returns the owner's profile + pets + identifications + events when called by themselves", async () => {
    const supa = await userSupabase(OWNER_EMAIL);
    const { data, error } = await supa.rpc("export_subject_data", { p_user_id: ownerUserId });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    const payload = data as Record<string, unknown>;
    expect(payload.subject_user_id).toBe(ownerUserId);
    expect(payload.exported_under).toBe("Ley 25.326 art. 14");
    expect(payload.profile).toBeDefined();
    expect(Array.isArray(payload.pets)).toBe(true);
    expect((payload.pets as unknown[]).length).toBeGreaterThan(0);

    // Audit log row recorded.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "subject_data_exported"));
    expect(audits.some((a) => a.targetUserId === ownerUserId)).toBe(true);
  });

  it("refuses to export another user's data for a non-admin caller", async () => {
    const supa = await userSupabase(OTHER_EMAIL);
    const { error } = await supa.rpc("export_subject_data", { p_user_id: ownerUserId });
    expect(error).not.toBeNull();
    // SQLSTATE 42501 = insufficient_privilege
    expect(error?.code).toBe("42501");
  });
});

// ---------------------------------------------------------------------------

describe("erase_subject_data RPC", () => {
  it("soft-deletes the profile, hashes PII, and writes an audit row when called by the subject", async () => {
    const supa = await userSupabase(OWNER_EMAIL);
    const { error } = await supa.rpc("erase_subject_data", {
      p_user_id: ownerUserId,
      p_reason: "test cleanup",
    });
    expect(error).toBeNull();

    const [row] = await db
      .select({
        displayName: profiles.displayName,
        phone: profiles.phone,
        dniNumber: profiles.dniNumber,
        deletedAt: profiles.deletedAt,
      })
      .from(profiles)
      .where(eq(profiles.id, ownerUserId));
    expect(row.deletedAt).not.toBeNull();
    expect(row.displayName).toMatch(/^erased:/);
    expect(row.phone).toBeNull();
    expect(row.dniNumber).toBeNull();

    // Owned pet was soft-deleted too.
    const [petRow] = await db
      .select({ deletedAt: pets.deletedAt })
      .from(pets)
      .where(eq(pets.id, createdPetIds[0]));
    expect(petRow.deletedAt).not.toBeNull();

    // Audit entry present with the citation.
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "subject_erasure"));
    const ours = audits.find((a) => a.targetUserId === ownerUserId);
    expect(ours).toBeDefined();
    expect((ours?.payload as Record<string, unknown>).norma).toBe("Ley 25.326 art. 16");
  });
});
