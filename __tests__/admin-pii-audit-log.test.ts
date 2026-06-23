// Integration tests — PII-query audit logging (C3).
//
// Regression under test: /admin/usuarios and /admin/organizaciones logged PII
// searches with `void logPiiQueryForAuthority(...)` — fire-and-forget. A server
// component can return before a non-awaited promise settles, so the audit row
// (the Ley 25.326 accountability guarantee) could be silently dropped. The
// pages now `await` the log. This test pins the writer's contract: a call
// produces exactly one `pii_queried` audit row carrying the query, result count
// and surface. (The callers awaiting it is what makes that durable.)

import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { auditLog, db, profiles } from "@/db";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const adminSdk = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

const ACTOR_EMAIL = "c3-pii-actor@dim-test.local";
let actorId: string;

async function deleteActor() {
  const { data: list } = await adminSdk.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === ACTOR_EMAIL);
  if (found) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
      await tx.delete(auditLog).where(eq(auditLog.actorUserId, found.id));
    });
    await db.delete(profiles).where(eq(profiles.id, found.id));
    await adminSdk.auth.admin.deleteUser(found.id);
  }
}

beforeAll(async () => {
  await deleteActor();
  const r = await adminSdk.auth.admin.createUser({
    email: ACTOR_EMAIL,
    password: "C3Pii_2026!",
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser: ${r.error?.message}`);
  actorId = r.data.user.id;
  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional" })
    .where(eq(profiles.id, actorId));
}, 30_000);

afterAll(async () => {
  await deleteActor();
});

describe("logPiiQueryForAuthority (C3)", () => {
  it("writes exactly one pii_queried audit row with query, result_count and surface", async () => {
    await logPiiQueryForAuthority(actorId, "garcia", 4, "users");

    const rows = await db
      .select({ action: auditLog.action, payload: auditLog.payload })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, actorId), eq(auditLog.action, "pii_queried")))
      .orderBy(desc(auditLog.performedAt));

    expect(rows.length).toBe(1);
    const payload = rows[0].payload as Record<string, unknown>;
    expect(payload.query).toBe("garcia");
    expect(payload.result_count).toBe(4);
    expect(payload.surface).toBe("users");
  });

  it("resolves before its caller can return (awaitable promise)", async () => {
    // The fix is `await logPiiQueryForAuthority(...)` instead of `void`. Guard
    // that the function returns a settleable promise whose effect is visible
    // synchronously after the await — i.e. the audit row exists the moment the
    // await resolves, not at some later microtask.
    const p = logPiiQueryForAuthority(actorId, "organizacion-sa", 1, "organizations");
    expect(p).toBeInstanceOf(Promise);
    await p;

    const [row] = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, actorId), eq(auditLog.action, "pii_queried")))
      .orderBy(desc(auditLog.performedAt))
      .limit(1);
    const payload = row.payload as Record<string, unknown>;
    expect(payload.surface).toBe("organizations");
    expect(payload.query).toBe("organizacion-sa");
  });
});
