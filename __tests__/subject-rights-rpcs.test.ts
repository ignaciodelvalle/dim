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
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, db, ownerships, pets, profiles } from "@/db";
import { generatePublicToken } from "@/lib/publicToken";
import { withMutationOverride } from "./_helpers/db-overrides";

// We call the RPCs via raw SQL (drizzle/postgres-js) instead of the supabase
// client. PostgREST has a schema cache that doesn't always pick up new
// functions added by post-startup migrations (PGRST202 in CI). Drizzle hits
// the DB directly so cache freshness is irrelevant. The auth.uid() guard
// inside the RPC is exercised by setting `request.jwt.claims` in the
// session, which is what PostgREST normally does.

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const OWNER_EMAIL = "sr-owner@dim-test.local";
const OTHER_EMAIL = "sr-other@dim-test.local";
const PASS = "SubjRights_2026!";

const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

async function callRpcAs<T>(
  callerUserId: string | null,
  fnSql: ReturnType<typeof sql>,
): Promise<{ data: T | null; error: { code?: string; message: string } | null }> {
  // set_config(..., true) is transaction-scoped, and the postgres-js pool
  // may pick a different connection per execute() call. Wrap the setup +
  // RPC in one transaction so auth.uid() sees the spoofed claim.
  try {
    const result = await db.transaction(async (tx) => {
      const claims = callerUserId ? JSON.stringify({ sub: callerUserId }) : "";
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      const rows = (await tx.execute(fnSql)) as unknown as Array<Record<string, unknown>>;
      return rows[0] ? (Object.values(rows[0])[0] as T) : null;
    });
    return { data: result, error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { data: null, error: { code: e.code, message: e.message ?? "unknown" } };
  }
}

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
    const { data, error } = await callRpcAs<Record<string, unknown>>(
      ownerUserId,
      sql`SELECT public.export_subject_data(${ownerUserId}::uuid) AS result`,
    );

    expect(error).toBeNull();
    expect(data).toBeDefined();
    const payload = data as Record<string, unknown>;
    expect(payload.subject_user_id).toBe(ownerUserId);
    expect(payload.exported_under).toBe("Ley 25.326 art. 14");
    expect(payload.profile).toBeDefined();
    expect(Array.isArray(payload.pets)).toBe(true);
    expect((payload.pets as unknown[]).length).toBeGreaterThan(0);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "subject_data_exported"));
    expect(audits.some((a) => a.targetUserId === ownerUserId)).toBe(true);
  });

  it("refuses to export another user's data for a non-admin caller", async () => {
    const { error } = await callRpcAs(
      otherUserId,
      sql`SELECT public.export_subject_data(${ownerUserId}::uuid) AS result`,
    );
    expect(error).not.toBeNull();
    // SQLSTATE 42501 = insufficient_privilege (raised by the RPC).
    expect(error?.code).toBe("42501");
  });
});

// ---------------------------------------------------------------------------

describe("erase_subject_data RPC", () => {
  it("soft-deletes the profile, hashes PII, and writes an audit row when called by the subject", async () => {
    const { error } = await callRpcAs(
      ownerUserId,
      sql`SELECT public.erase_subject_data(${ownerUserId}::uuid, 'test cleanup'::text) AS result`,
    );
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
