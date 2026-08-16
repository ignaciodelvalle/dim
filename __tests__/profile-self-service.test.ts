// Integration tests for Slice 3d: vetSelfResignAction + govtSelfDeactivateAction
// (self-service role transitions from /cuenta/renunciar and /cuenta/desactivar).
//
// Pattern mirrors approval-request-withdraw.test.ts:
//   - beforeAll seeds ephemeral users via supabase admin SDK
//   - afterAll deletes them with app.allow_audit_mutation GUC
//   - Tests call inner writers directly (no Next.js runtime)

import { createClient } from "@supabase/supabase-js";
import { and, desc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, db, govtAssignments, notifications, profiles } from "@/db";
import { govtSelfDeactivateForUser } from "@/src/modules/pets/application/profile/govt-self-deactivate";
import { vetSelfResignForUser } from "@/src/modules/pets/application/profile/vet-self-resign";
import { setAuditMutationGucs } from "./_helpers/db-overrides";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SECRET = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const adminSdk = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Email / ID holders
// ---------------------------------------------------------------------------

const VET_EMAIL = "self-service-vet@dim-test.local";
const OWNER_EMAIL = "self-service-owner@dim-test.local";
const GOVT_EMAIL = "self-service-govt@dim-test.local";
const GOVT2_EMAIL = "self-service-govt2@dim-test.local";
const ADMIN_EMAIL = "self-service-admin@dim-test.local";

let vetUserId: string;
let ownerUserId: string;
let govtUserId: string;
let govt2UserId: string;
let adminUserId: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deleteTestUser(email: string) {
  const { data: list } = await adminSdk.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === email);
  if (!found) return;

  const uid = found.id;

  await db.transaction(async (tx) => {
    await setAuditMutationGucs(tx);
    await tx.delete(auditLog).where(eq(auditLog.actorUserId, uid));
    await tx.delete(auditLog).where(eq(auditLog.targetUserId, uid));
  });
  await db.delete(notifications).where(eq(notifications.userId, uid));
  await db.delete(govtAssignments).where(eq(govtAssignments.userId, uid));
  await db.delete(profiles).where(eq(profiles.id, uid));
  await adminSdk.auth.admin.deleteUser(uid);
}

async function createUserOrThrow(email: string): Promise<string> {
  const r = await adminSdk.auth.admin.createUser({
    email,
    password: "SelfService3d_2026!",
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`createUser(${email}): ${r.error?.message}`);
  return r.data.user.id;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean up any leftover state from a previous interrupted run
  for (const email of [VET_EMAIL, OWNER_EMAIL, GOVT_EMAIL, GOVT2_EMAIL, ADMIN_EMAIL]) {
    await deleteTestUser(email);
  }

  vetUserId = await createUserOrThrow(VET_EMAIL);
  ownerUserId = await createUserOrThrow(OWNER_EMAIL);
  govtUserId = await createUserOrThrow(GOVT_EMAIL);
  govt2UserId = await createUserOrThrow(GOVT2_EMAIL);
  adminUserId = await createUserOrThrow(ADMIN_EMAIL);

  // Elevate roles as needed (handle_new_user trigger creates role='owner')
  await db
    .update(profiles)
    .set({
      role: "vet",
      matriculaNumber: "MN-12345",
      matriculaJurisdiccion: "CABA",
      matriculaVerified: true,
    })
    .where(eq(profiles.id, vetUserId));

  // ownerUserId stays as role='owner'

  await db
    .update(profiles)
    .set({ role: "govt", accountType: "institutional" })
    .where(eq(profiles.id, govtUserId));

  await db
    .update(profiles)
    .set({ role: "govt", accountType: "institutional" })
    .where(eq(profiles.id, govt2UserId));

  await db
    .update(profiles)
    .set({ role: "admin", accountType: "institutional" })
    .where(eq(profiles.id, adminUserId));

  // Assign localities for govtUserId — use test-scoped locality names that
  // cannot collide with seed data (scripts/seed-test-users.ts assigns the
  // shared `govt-local@dim.test` user to real localities like "La Plata").
  //   - TEST-SS-Shared   — also covered by govt2UserId (coverage check should PASS)
  //   - TEST-SS-SoleCov  — only covered by govtUserId (coverage check should BLOCK)
  await db.insert(govtAssignments).values([
    {
      userId: govtUserId,
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "TEST-SS-Shared",
      grantedByUserId: adminUserId,
    },
    {
      userId: govtUserId,
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "TEST-SS-SoleCov",
      grantedByUserId: adminUserId,
    },
  ]);

  // govt2UserId covers TEST-SS-Shared — so govtUserId leaving it is safe
  await db.insert(govtAssignments).values({
    userId: govt2UserId,
    jurisdictionCountry: "AR",
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "TEST-SS-Shared",
    grantedByUserId: adminUserId,
  });
});

afterAll(async () => {
  for (const email of [VET_EMAIL, OWNER_EMAIL, GOVT_EMAIL, GOVT2_EMAIL, ADMIN_EMAIL]) {
    await deleteTestUser(email);
  }
});

// ============================================================================
// vetSelfResignForUser
// ============================================================================

describe("vetSelfResignForUser — idempotency: already owner", () => {
  it("returns noOp when caller is already role=owner", async () => {
    const result = await vetSelfResignForUser(ownerUserId);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.ok).toBe(true);
    expect(result.noOp).toBe(true);
  });
});

describe("vetSelfResignForUser — capability rejection: wrong role", () => {
  it("rejects when role is govt", async () => {
    const result = await vetSelfResignForUser(govtUserId);
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ROLE_MISMATCH/);
  });

  it("rejects when role is admin", async () => {
    const result = await vetSelfResignForUser(adminUserId);
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ROLE_MISMATCH/);
  });
});

describe("vetSelfResignForUser — happy path", () => {
  it("demotes vet to owner, clears matriculaVerified, preserves matricula number, emits audit + notification", async () => {
    // Pre-state: role=vet, matriculaVerified=true, matriculaNumber set
    const [before] = await db
      .select({
        role: profiles.role,
        matriculaVerified: profiles.matriculaVerified,
        matriculaNumber: profiles.matriculaNumber,
        matriculaJurisdiccion: profiles.matriculaJurisdiccion,
      })
      .from(profiles)
      .where(eq(profiles.id, vetUserId))
      .limit(1);

    expect(before.role).toBe("vet");
    expect(before.matriculaVerified).toBe(true);
    expect(before.matriculaNumber).toBe("MN-12345");

    const result = await vetSelfResignForUser(vetUserId, { reason: "Cambio de carrera" });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.ok).toBe(true);
    expect(result.noOp).toBeUndefined();

    // Profile updated
    const [after] = await db
      .select({
        role: profiles.role,
        matriculaVerified: profiles.matriculaVerified,
        matriculaNumber: profiles.matriculaNumber,
        matriculaJurisdiccion: profiles.matriculaJurisdiccion,
      })
      .from(profiles)
      .where(eq(profiles.id, vetUserId))
      .limit(1);

    expect(after.role).toBe("owner");
    expect(after.matriculaVerified).toBe(false);
    // matriculaNumber and jurisdiccion preserved
    expect(after.matriculaNumber).toBe("MN-12345");
    expect(after.matriculaJurisdiccion).toBe("CABA");

    // Audit log written
    const [logRow] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorUserId, vetUserId), eq(auditLog.action, "self_resignation_vet")))
      .orderBy(desc(auditLog.performedAt))
      .limit(1);

    expect(logRow).toBeDefined();
    const payload = logRow.payload as Record<string, unknown>;
    expect(payload.reason).toBe("Cambio de carrera");

    // Notification to self
    const [notifRow] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, vetUserId),
          eq(notifications.notificationType, "self_resignation_confirmed"),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    expect(notifRow).toBeDefined();
    expect(notifRow.severity).toBe("info");
  });

  it("returns noOp on second call (already owner after first call)", async () => {
    // vetUserId was demoted in the test above — calling again should noOp
    const result = await vetSelfResignForUser(vetUserId);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.ok).toBe(true);
    expect(result.noOp).toBe(true);
  });
});

// ============================================================================
// govtSelfDeactivateForUser
// ============================================================================

describe("govtSelfDeactivateForUser — capability rejection: wrong role", () => {
  it("rejects when role is admin (admin has a different deactivation flow per §7.6)", async () => {
    const result = await govtSelfDeactivateForUser(adminUserId);
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ROLE_MISMATCH/);
  });

  it("rejects when role is owner (personal account)", async () => {
    const result = await govtSelfDeactivateForUser(ownerUserId);
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ROLE_MISMATCH/);
  });
});

describe("govtSelfDeactivateForUser — coverage block", () => {
  it("blocks deactivation when a locality would be left uncovered", async () => {
    // govtUserId covers TEST-SS-SoleCov alone — deactivation should be blocked
    const result = await govtSelfDeactivateForUser(govtUserId);
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toMatch(/LOCALITY_WOULD_BE_UNCOVERED/);

    // Verify no state change
    const [row] = await db
      .select({ deactivatedAt: profiles.deactivatedAt })
      .from(profiles)
      .where(eq(profiles.id, govtUserId))
      .limit(1);
    expect(row.deactivatedAt).toBeNull();

    // Assignments still active
    const activeAssignments = await db
      .select({ id: govtAssignments.id })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, govtUserId), isNull(govtAssignments.revokedAt)));
    expect(activeAssignments.length).toBe(2);
  });
});

describe("govtSelfDeactivateForUser — happy path", () => {
  it("deactivates govt when all localities have coverage, revokes assignments, emits audit + notifications", async () => {
    // Add coverage for TEST-SS-SoleCov by govt2UserId so govtUserId can now safely deactivate
    await db.insert(govtAssignments).values({
      userId: govt2UserId,
      jurisdictionCountry: "AR",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "TEST-SS-SoleCov",
      grantedByUserId: adminUserId,
    });

    const result = await govtSelfDeactivateForUser(govtUserId, { reason: "Me retiro del sistema" });

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.ok).toBe(true);
    expect(result.noOp).toBeUndefined();

    // deactivated_at stamped
    const [after] = await db
      .select({ deactivatedAt: profiles.deactivatedAt })
      .from(profiles)
      .where(eq(profiles.id, govtUserId))
      .limit(1);
    expect(after.deactivatedAt).not.toBeNull();

    // All assignments revoked
    const stillActive = await db
      .select({ id: govtAssignments.id })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, govtUserId), isNull(govtAssignments.revokedAt)));
    expect(stillActive.length).toBe(0);

    // Audit log written
    const [logRow] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.actorUserId, govtUserId), eq(auditLog.action, "govt_self_deactivated")),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(1);

    expect(logRow).toBeDefined();
    const payload = logRow.payload as Record<string, unknown>;
    expect(payload.assignments_revoked_count).toBe(2);
    expect(payload.reason).toBe("Me retiro del sistema");

    // Notification to admin
    const [adminNotif] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, adminUserId),
          eq(notifications.notificationType, "govt_self_deactivated_admin_notice"),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    expect(adminNotif).toBeDefined();

    // Cascade notice to govt2 (now sole-covering one or both localities)
    const [cascadeNotif] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, govt2UserId),
          eq(notifications.notificationType, "govt_self_deactivated_cascade_notice"),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    expect(cascadeNotif).toBeDefined();
  });

  it("returns noOp on second call (already deactivated)", async () => {
    const result = await govtSelfDeactivateForUser(govtUserId);
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.ok).toBe(true);
    expect(result.noOp).toBe(true);
  });
});
