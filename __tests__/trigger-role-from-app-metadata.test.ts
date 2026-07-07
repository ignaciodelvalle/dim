// Integration test: handle_new_user() reads the initial role from app_metadata,
// NOT user_metadata (CRITICAL-1 — self-minted admin, migration 0133).
//
// The vulnerability: the signup trigger set profiles.role from
//   new.raw_user_meta_data->>'user_role'
// but raw_user_meta_data IS user_metadata — client-writable via the public anon
// key (supabase.auth.signUp({ options: { data: { user_role: 'admin' } } })). Any
// anonymous caller could self-mint an admin. The fix reads from raw_app_meta_data
// (service-role-only) instead, validated against the user_role enum.
//
// This test hits the local Supabase stack (same pattern as
// __tests__/account-type-role-invariant.test.ts):
//   1. user_metadata.user_role='admin'  → trigger IGNORES it → role='owner'
//   2. app_metadata.user_role='admin'   → trigger honours it → role='admin'
//   3. app_metadata.user_role='govt'    → role='govt'
//   4. app_metadata.user_role='bogus'   → invalid → falls back to role='owner'

import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attachments, auditLog, db, govtAssignments, notifications, profiles } from "@/db";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const adminSdk = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

const EMAILS = {
  userMetaAdmin: "trigger-usermeta-admin@dim-test.local",
  appMetaAdmin: "trigger-appmeta-admin@dim-test.local",
  appMetaGovt: "trigger-appmeta-govt@dim-test.local",
  appMetaBogus: "trigger-appmeta-bogus@dim-test.local",
} as const;

const PASSWORD = "TriggerRoleTest_2026!";

async function deleteTestUser(email: string): Promise<void> {
  const { data: list } = await adminSdk.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === email);
  if (!found) return;

  const uid = found.id;
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
    await tx.delete(auditLog).where(eq(auditLog.actorUserId, uid));
    await tx.delete(auditLog).where(eq(auditLog.targetUserId, uid));
  });
  await db.delete(attachments).where(eq(attachments.uploadedByUserId, uid));
  await db.delete(govtAssignments).where(eq(govtAssignments.userId, uid));
  await db.delete(notifications).where(eq(notifications.userId, uid));
  await db.delete(profiles).where(eq(profiles.id, uid));
  await adminSdk.auth.admin.deleteUser(uid);
}

async function readRole(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.role ?? null;
}

beforeAll(async () => {
  await Promise.all(Object.values(EMAILS).map(deleteTestUser));
}, 30_000);

afterAll(async () => {
  await Promise.all(Object.values(EMAILS).map(deleteTestUser));
}, 30_000);

describe("handle_new_user reads role from app_metadata, not user_metadata", () => {
  it("IGNORES user_metadata.user_role='admin' → defaults to role='owner'", async () => {
    const { data, error } = await adminSdk.auth.admin.createUser({
      email: EMAILS.userMetaAdmin,
      password: PASSWORD,
      email_confirm: true,
      // The attack surface: an anon signup lands its options.data HERE.
      user_metadata: { display_name: "Attacker", user_role: "admin" },
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    const role = await readRole(data.user!.id);
    expect(role).toBe("owner");
  }, 20_000);

  it("HONOURS app_metadata.user_role='admin' → role='admin'", async () => {
    const { data, error } = await adminSdk.auth.admin.createUser({
      email: EMAILS.appMetaAdmin,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Founder" },
      // Only the service role can write app_metadata.
      app_metadata: { user_role: "admin" },
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    const role = await readRole(data.user!.id);
    expect(role).toBe("admin");
  }, 20_000);

  it("HONOURS app_metadata.user_role='govt' → role='govt'", async () => {
    const { data, error } = await adminSdk.auth.admin.createUser({
      email: EMAILS.appMetaGovt,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Authority" },
      app_metadata: { user_role: "govt" },
    });
    expect(error).toBeNull();
    const role = await readRole(data.user!.id);
    expect(role).toBe("govt");
  }, 20_000);

  it("falls back to role='owner' for an invalid app_metadata.user_role", async () => {
    const { data, error } = await adminSdk.auth.admin.createUser({
      email: EMAILS.appMetaBogus,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Confused" },
      app_metadata: { user_role: "superuser" },
    });
    expect(error).toBeNull();
    const role = await readRole(data.user!.id);
    expect(role).toBe("owner");
  }, 20_000);
});
