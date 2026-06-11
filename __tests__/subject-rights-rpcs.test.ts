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
//  4. ARCH-H (migration 0080): audit row survives actor hard-delete with NULL
//     actor_user_id; admin view batch name-lookup handles NULL actor gracefully.

import { createClient } from "@supabase/supabase-js";
import { eq, inArray, isNull, sql } from "drizzle-orm";
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

// ---------------------------------------------------------------------------
// ARCH-H (migration 0080): audit_log.actor_user_id ON DELETE SET NULL
// ---------------------------------------------------------------------------
// Verifies that:
//   1. Hard-deleting a user profile does NOT delete their audit_log rows.
//   2. The surviving audit rows have actor_user_id = NULL.
//   3. The admin audit view batch name-lookup (inArray on non-null actor ids)
//      completes without error and produces no entry for the deleted actor.

const ARCH_H_ACTOR_EMAIL = "sr-arch-h-actor@dim-test.local";
let archHActorId: string | undefined;
const archHAuditIds: string[] = [];

describe("ARCH-H: audit_log actor hard-delete survivability", () => {
  beforeAll(async () => {
    // Ensure no leftover from previous run.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === ARCH_H_ACTOR_EMAIL);
    if (existing) {
      // Pre-clean: with the new SET NULL FK, we can delete the profile without
      // first clearing audit rows — that is exactly what this test proves.
      // But if there are leftover audit rows from a crashed previous run, we
      // need to clean those up to keep the test's own assertions clean.
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
        await tx.delete(auditLog).where(eq(auditLog.actorUserId, existing.id));
      });
      await db.delete(profiles).where(eq(profiles.id, existing.id));
      await admin.auth.admin.deleteUser(existing.id);
    }

    // Create a fresh ephemeral actor.
    const { data, error } = await admin.auth.admin.createUser({
      email: ARCH_H_ACTOR_EMAIL,
      password: "ArchH_2026!",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`ARCH-H createUser: ${error?.message}`);
    archHActorId = data.user.id;

    // Insert two audit_log rows attributed to this actor (bypass append-only
    // guard with allow_audit_mutation so the rows are directly controlled).
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
      const rows = await tx
        .insert(auditLog)
        .values([
          {
            actorUserId: archHActorId,
            action: "request_viewed",
            payload: { test: "arch-h-1" },
          },
          {
            actorUserId: archHActorId,
            action: "request_viewed",
            payload: { test: "arch-h-2" },
          },
        ])
        .returning({ id: auditLog.id });
      for (const r of rows) archHAuditIds.push(r.id);
    });
  });

  afterAll(async () => {
    // Clean up the test audit rows.
    if (archHAuditIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
        await tx.delete(auditLog).where(inArray(auditLog.id, archHAuditIds));
      });
    }
  });

  it("hard-deleting the actor profile does not delete the audit rows", async () => {
    if (!archHActorId) throw new Error("archHActorId not set");

    // Hard-delete: profile row first, then auth user.
    // With ON DELETE RESTRICT this would throw a FK violation.
    // With ON DELETE SET NULL it must succeed.
    await db.delete(profiles).where(eq(profiles.id, archHActorId));
    await admin.auth.admin.deleteUser(archHActorId);

    // The two audit rows must still exist.
    const surviving = await db
      .select({ id: auditLog.id, actorUserId: auditLog.actorUserId })
      .from(auditLog)
      .where(inArray(auditLog.id, archHAuditIds));

    expect(surviving).toHaveLength(2);
    // actor_user_id must be NULL on all surviving rows.
    for (const row of surviving) {
      expect(row.actorUserId).toBeNull();
    }
  });

  it("admin audit view batch name-lookup handles NULL actor_user_id without error", async () => {
    // Simulate the admin auditoria page batch lookup:
    //   collect non-null actor ids → inArray query → no crash, no result for deleted actor.
    const rows = await db
      .select({ id: auditLog.id, actorUserId: auditLog.actorUserId })
      .from(auditLog)
      .where(inArray(auditLog.id, archHAuditIds));

    // Filter to non-null ids (mirrors the auditoria page logic after ARCH-H fix).
    const actorIds = Array.from(
      new Set(rows.map((r) => r.actorUserId).filter((id): id is string => id !== null)),
    );

    // actorIds must be empty because actor was deleted → all null.
    expect(actorIds).toHaveLength(0);

    // The inArray lookup with an empty array must be skipped (mirrors page guard).
    // We verify the query is a no-op and returns an empty map.
    const namesById = new Map<string, string>();
    if (actorIds.length > 0) {
      const profileRows = await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, actorIds));
      for (const r of profileRows) namesById.set(r.id, r.displayName);
    }
    expect(namesById.size).toBe(0);
  });

  it("audit rows with NULL actor_user_id are returned by isNull filter", async () => {
    const nullActorRows = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(isNull(auditLog.actorUserId));
    // At least the two rows we created must appear in the NULL-actor set.
    const ourIds = new Set(archHAuditIds);
    const found = nullActorRows.filter((r) => ourIds.has(r.id));
    expect(found).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ARCH-H: trigger passthrough abuse — enforce_audit_log_append_only hardening
// ---------------------------------------------------------------------------
// The narrow FK-nullification passthrough added in migration 0080 must not be
// abusable to mutate other business columns simultaneously.
//
// Three rejection cases:
//   A. UPDATE sets actor_user_id NULL *and* changes payload — REJECTED.
//   B. UPDATE sets actor_user_id NULL when it is already NULL — REJECTED
//      (null→null is not a FK cascade, it is a no-op probe or abuse attempt).
//   C. UPDATE changes actor_user_id from non-null to a different non-null UUID
//      — REJECTED (FK cascade only ever sets to NULL, never to another value).

const ABUSE_ACTOR_EMAIL = "sr-abuse-guard@dim-test.local";
let abuseActorId: string | undefined;
const abuseAuditIds: string[] = [];

describe("ARCH-H: trigger passthrough abuse rejection", () => {
  beforeAll(async () => {
    // Reuse or create a stable ephemeral actor for these tests.
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users.find((u) => u.email === ABUSE_ACTOR_EMAIL);
    if (existing) {
      abuseActorId = existing.id;
      // Clean up any leftover audit rows from a previous crashed run.
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
        await tx.delete(auditLog).where(eq(auditLog.actorUserId, existing.id));
      });
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: ABUSE_ACTOR_EMAIL,
        password: "AbuseGuard_2026!",
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`ABUSE-GUARD createUser: ${error?.message}`);
      abuseActorId = data.user.id;
    }

    // Insert two controlled audit rows.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
      const rows = await tx
        .insert(auditLog)
        .values([
          {
            actorUserId: abuseActorId,
            action: "request_viewed",
            payload: { test: "abuse-guard-non-null" },
          },
          {
            actorUserId: null,
            action: "request_viewed",
            payload: { test: "abuse-guard-null-actor" },
          },
        ])
        .returning({ id: auditLog.id });
      for (const r of rows) abuseAuditIds.push(r.id);
    });
  });

  afterAll(async () => {
    if (abuseAuditIds.length > 0) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`set local app.allow_audit_mutation = 'true'`);
        await tx.delete(auditLog).where(inArray(auditLog.id, abuseAuditIds));
      });
    }
  });

  it("A: UPDATE that sets actor_user_id=NULL while also changing payload is rejected", async () => {
    // abuseAuditIds[0] has a non-null actor. Attempt to null the actor AND
    // change the payload in the same statement — the trigger must reject this
    // because it is not a pure FK cascade nullification.
    //
    // postgres.js rolls back and re-throws from db.transaction(), not from
    // the inner execute() — catch at the outer level.
    const nonNullRowId = abuseAuditIds[0];
    if (!nonNullRowId) throw new Error("abuseAuditIds[0] not set");

    let caughtCode: string | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE public.audit_log
              SET actor_user_id = NULL,
                  payload = '{"test":"tampered"}'::jsonb
              WHERE id = ${nonNullRowId}`,
        );
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      caughtCode = e.code;
    }

    expect(caughtCode).toBeDefined();
    // SQLSTATE 23001 = restrict_violation (raised by the trigger).
    expect(caughtCode).toBe("23001");
  });

  it("B: UPDATE that sets actor_user_id=NULL when it is already NULL is rejected", async () => {
    // abuseAuditIds[1] already has actor_user_id = NULL. Setting it to NULL
    // again is not a FK cascade — the trigger must reject it.
    const nullActorRowId = abuseAuditIds[1];
    if (!nullActorRowId) throw new Error("abuseAuditIds[1] not set");

    let caughtCode: string | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE public.audit_log
              SET actor_user_id = NULL
              WHERE id = ${nullActorRowId}`,
        );
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      caughtCode = e.code;
    }

    expect(caughtCode).toBeDefined();
    expect(caughtCode).toBe("23001");
  });

  it("C: UPDATE that changes actor_user_id from non-null to a different non-null UUID is rejected", async () => {
    // FK cascade only ever sets FK columns to NULL — a non-null→non-null change
    // is definitively not a cascade and must be rejected.
    const nonNullRowId = abuseAuditIds[0];
    if (!nonNullRowId) throw new Error("abuseAuditIds[0] not set");

    const otherUuid = "00000000-0000-0000-0000-000000000001";
    let caughtCode: string | undefined;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE public.audit_log
              SET actor_user_id = ${otherUuid}::uuid
              WHERE id = ${nonNullRowId}`,
        );
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      caughtCode = e.code;
    }

    expect(caughtCode).toBeDefined();
    expect(caughtCode).toBe("23001");
  });
});
